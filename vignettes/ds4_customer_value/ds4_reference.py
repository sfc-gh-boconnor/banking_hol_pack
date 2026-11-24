"""DS4 reference solution: calibrate the attrition model and predict customer margin.

The answer key for notebooks/ds4_customer_value.ipynb, the same steps Cortex Code builds.
Runs inside Snowflake on the active session; submit_job() runs it as an ML Job on DS_TRAINING_POOL.
Needs DS1's ML.RB_CHURN_FEATURES and snowflake-ml-python >= 1.19, scikit-learn and xgboost.

1. Calibrate: DS1's XGBoost ranks customers well, but its scores aren't probabilities (it was trained
   with class weights for the imbalance). Isotonic calibration fixes that; the calibrated model is a new
   version of RB_ATTRITION_MODEL (not the default, so DS1 and DS3 are unchanged: DS3 can treat it as a challenger).
2. Margin: predict each customer's average monthly margin over the 3 months after the observation date,
   against the "margin stays flat" baseline. The best model is registered as RB_MARGIN_MODEL.
3. Score: both models score every customer into ML.RB_CUSTOMER_PREDICTIONS, which DA5 turns into
   lifetime value, value at risk and next-best offers.
"""
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.metrics import brier_score_loss, mean_absolute_error, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from snowflake.ml.experiment import ExperimentTracking
from snowflake.ml.registry import Registry
from snowflake.snowpark.context import get_active_session
from xgboost import XGBClassifier, XGBRegressor

DB, SCHEMA = "BANKING_HOL", "ML"
OBS = "2026-08-31"
CAT = ["SEGMENT", "HOUSING_TENURE"]

# margin history before the observation date, and the target: average monthly margin in the 3 months after
MARGIN_SQL = f"""
SELECT f.*,
       h.MARGIN_L3M, h.MARGIN_L12M, h.REVENUE_L3M, h.COST_L3M,
       t.MARGIN_NEXT_3M
FROM {DB}.{SCHEMA}.RB_CHURN_FEATURES f
JOIN (SELECT CUSTOMER_ID,
             AVG(IFF(MONTH > DATEADD(month, -3, '{OBS}'::DATE), PROFIT_GBP, NULL)) AS MARGIN_L3M,
             AVG(PROFIT_GBP) AS MARGIN_L12M,
             AVG(IFF(MONTH > DATEADD(month, -3, '{OBS}'::DATE), REVENUE_GBP, NULL)) AS REVENUE_L3M,
             AVG(IFF(MONTH > DATEADD(month, -3, '{OBS}'::DATE), COST_TO_SERVE_GBP, NULL)) AS COST_L3M
      FROM {DB}.RAW_DATA.RB_MONTHLY_SNAPSHOT
      WHERE MONTH <= '{OBS}'::DATE AND MONTH > DATEADD(month, -12, '{OBS}'::DATE)
      GROUP BY 1) h USING (CUSTOMER_ID)
LEFT JOIN (SELECT CUSTOMER_ID, AVG(PROFIT_GBP) AS MARGIN_NEXT_3M
           FROM {DB}.RAW_DATA.RB_MONTHLY_SNAPSHOT
           WHERE MONTH > '{OBS}'::DATE AND MONTH <= DATEADD(month, 3, '{OBS}'::DATE) AND NOT CHURNED_FLAG
           GROUP BY 1) t USING (CUSTOMER_ID)
"""


def _prep(num):
    return ColumnTransformer([("num", StandardScaler(), num), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])


def _numeric(df, num):
    df[num] = df[num].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    return df


def calibration_error(y, p, bins=10):
    """Average gap between predicted and actual leave rates across score deciles (weighted by size)."""
    d = pd.DataFrame({"y": y, "p": p})
    d["bin"] = pd.qcut(d.p.rank(method="first"), bins, labels=False)
    g = d.groupby("bin").agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
    return float((abs(g.p - g.y) * g.n).sum() / g.n.sum())


def main(session):
    session.use_schema(f"{DB}.{SCHEMA}")
    exp = ExperimentTracking(session, database_name=DB, schema_name=SCHEMA)
    reg = Registry(session, database_name=DB, schema_name=SCHEMA)
    stamp = pd.Timestamp.now().strftime("%m%d_%H%M%S")  # finished runs are immutable: a rerun gets new run names
    out = {}

    # ---------- 1. Calibrate the attrition model ----------
    df = session.table(f"{DB}.{SCHEMA}.RB_CHURN_FEATURES").to_pandas()
    y = df.pop("CHURNED_NEXT_3M").astype(int)
    ids = df.pop("CUSTOMER_ID")
    num = [c for c in df.columns if c not in CAT]
    df = _numeric(df, num)
    X_tr, X_te, y_tr, y_te = train_test_split(df, y, test_size=0.3, stratify=y, random_state=42)

    weighted = Pipeline([("prep", _prep(num)), ("clf", XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8,
                                                                     scale_pos_weight=float((y_tr == 0).sum() / (y_tr == 1).sum())))])
    calibrated = CalibratedClassifierCV(
        Pipeline([("prep", _prep(num)), ("clf", XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8))]),
        method="isotonic", cv=3)
    exp.set_experiment("RB_ATTRITION")
    churn = {}
    for run, model, params in [("XGBOOST_WEIGHTED", weighted, {"calibration": "none", "class_weight": "scale_pos_weight"}),
                               ("XGBOOST_CALIBRATED", calibrated, {"calibration": "isotonic", "cv": 3})]:
        with exp.start_run(f"{run}_{stamp}"):
            model.fit(X_tr, y_tr)
            p = model.predict_proba(X_te)[:, 1]
            m = {"auc": round(roc_auc_score(y_te, p), 4), "brier": round(brier_score_loss(y_te, p), 5),
                 "calibration_error": round(calibration_error(y_te.to_numpy(), p), 4),
                 "mean_predicted": round(float(p.mean()), 4), "actual_rate": round(float(y_te.mean()), 4)}
            exp.log_params({**params, "model": "xgboost", "observation_date": OBS, "label_window_months": 3})
            exp.log_metrics(m)
            churn[run] = (model, m)
    model, m = churn["XGBOOST_CALIBRATED"]
    # a calibrator wrapping a pipeline hides XGBoost from the registry's dependency detection: name it
    mv_churn = reg.log_model(model, model_name="RB_ATTRITION_MODEL", sample_input_data=X_tr.head(50), metrics=m,
                             target_platforms=["WAREHOUSE"], conda_dependencies=["scikit-learn", "xgboost"],
                             comment="XGBOOST_CALIBRATED: isotonic-calibrated probabilities of leaving in the next 3 months, "
                                     f"observed {OBS}. Challenger to the default version; experiment RB_ATTRITION.")
    out["churn"] = {r: v[1] for r, v in churn.items()} | {"registered": f"RB_ATTRITION_MODEL {mv_churn.version_name} (not default)"}
    p_all = mv_churn.run(df, function_name="predict_proba").iloc[:, -1].to_numpy()

    # ---------- 2. Predict next-3-month margin ----------
    md = session.sql(MARGIN_SQL).to_pandas()
    md = md[md.MARGIN_NEXT_3M.notna()].copy()          # train on customers who stayed: retention is the other model's job
    yt = md.pop("MARGIN_NEXT_3M").astype(float)
    md = md.drop(columns=["CUSTOMER_ID", "CHURNED_NEXT_3M"])
    mnum = [c for c in md.columns if c not in CAT]
    md = _numeric(md, mnum)
    M_tr, M_te, t_tr, t_te = train_test_split(md, yt, test_size=0.3, random_state=42)

    exp.set_experiment("RB_MARGIN")
    margin = {}

    def score(pred):
        return {"mae": round(mean_absolute_error(t_te, pred), 3), "mae_vs_flat_pct": None,
                "total_error_pct": round(100 * float((pred.sum() - t_te.sum()) / t_te.sum()), 2)}

    flat = score(M_te.MARGIN_L12M.to_numpy())             # the assumption DA5 would otherwise make
    flat["mae_vs_flat_pct"] = 0.0
    with exp.start_run(f"FLAT_BASELINE_{stamp}"):
        exp.log_params({"model": "last_12_month_average", "observation_date": OBS})
        exp.log_metrics({k: v for k, v in flat.items() if v is not None})
    margin["FLAT_BASELINE"] = (None, flat)
    for run, est, params in [
        ("RIDGE", Ridge(alpha=1.0), {"model": "ridge", "alpha": 1.0}),
        ("XGBOOST", XGBRegressor(n_estimators=400, max_depth=4, learning_rate=0.05, subsample=0.8, objective="reg:absoluteerror"),
         {"model": "xgboost", "n_estimators": 400, "max_depth": 4, "objective": "absolute_error"}),
    ]:
        model = Pipeline([("prep", _prep(mnum)), ("reg", est)])
        with exp.start_run(f"{run}_{stamp}"):
            model.fit(M_tr, t_tr)
            m = score(model.predict(M_te))
            m["mae_vs_flat_pct"] = round(100 * (m["mae"] - flat["mae"]) / flat["mae"], 1)
            exp.log_params({**params, "observation_date": OBS, "target": "avg monthly profit, next 3 months"})
            exp.log_metrics(m)
            margin[run] = (model, m)
    best = min((r for r in margin if r != "FLAT_BASELINE"), key=lambda r: margin[r][1]["mae"])
    model, m = margin[best]
    mv_margin = reg.log_model(model, model_name="RB_MARGIN_MODEL", sample_input_data=M_tr.head(50), metrics=m,
                              target_platforms=["WAREHOUSE"], conda_dependencies=["scikit-learn", "xgboost"],
                              comment=f"{best}: average monthly margin over the 3 months after {OBS}, for customers who stay. "
                                      f"Best of {len(margin) - 1} models against a flat baseline; experiment RB_MARGIN.")
    reg.get_model("RB_MARGIN_MODEL").default = mv_margin.version_name
    out["margin"] = {r: v[1] for r, v in margin.items()} | {"registered": f"RB_MARGIN_MODEL {mv_margin.version_name}"}

    # ---------- 3. Score every customer with both models ----------
    allm = session.sql(MARGIN_SQL).to_pandas()
    cid = allm.pop("CUSTOMER_ID")
    allm = _numeric(allm.drop(columns=["CHURNED_NEXT_3M", "MARGIN_NEXT_3M"]), mnum)
    pm = mv_margin.run(allm, function_name="predict").iloc[:, -1].to_numpy()
    preds = pd.DataFrame({"CUSTOMER_ID": cid.values, "PREDICTED_MONTHLY_MARGIN_GBP": np.round(pm, 2)}).merge(
        pd.DataFrame({"CUSTOMER_ID": ids.values, "CHURN_3M": np.round(p_all, 5)}), on="CUSTOMER_ID")
    preds["ATTRITION_MODEL_VERSION"] = mv_churn.version_name
    preds["MARGIN_MODEL_VERSION"] = mv_margin.version_name
    session.write_pandas(preds, "RB_CUSTOMER_PREDICTIONS", database=DB, schema=SCHEMA, auto_create_table=True, overwrite=True)
    out["predictions"] = {"customers": int(len(preds)), "mean_churn_3m": round(float(preds.CHURN_3M.mean()), 4),
                          "mean_monthly_margin": round(float(preds.PREDICTED_MONTHLY_MARGIN_GBP.mean()), 2)}
    return out


def submit_job(session):
    """Run main() as an ML Job on DS_TRAINING_POOL, so the notebook kernel never holds the data or models."""
    import sys
    import cloudpickle
    from snowflake.ml.jobs import remote

    if __name__ != "__main__":  # imported as a module: send its code with the job
        cloudpickle.register_pickle_by_value(sys.modules[__name__])

    @remote("DS_TRAINING_POOL", stage_name="BANKING_HOL.ML.JOB_STAGE", session=session)
    def train_ds4():
        from snowflake.snowpark.context import get_active_session as active
        return main(active())

    job = train_ds4()
    job.wait()  # the first run starts the pool: a few minutes
    print(job.status)
    return job.result()


if __name__ == "__main__":
    print(submit_job(get_active_session()))
