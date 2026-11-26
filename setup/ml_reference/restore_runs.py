"""Re-log the reference experiment runs into the attendee's own experiments (no training).

The DS1 and DS4 catch-ups copy the pre-trained models, and experiment runs can't be copied, so this
writes the same runs (parameters and metrics) from BANKING_HOL.ML_REFERENCE.EXPERIMENT_RUNS into
BANKING_HOL.ML.RB_ATTRITION and RB_MARGIN, which DS3 reads. Runs already there are skipped.
"""
import re

import pandas as pd
from snowflake.ml.experiment import ExperimentTracking

DB, SCHEMA = "BANKING_HOL", "ML"


def _typed(v):
    try:
        f = float(v)
        return int(f) if f.is_integer() and "." not in str(v) else f
    except (TypeError, ValueError):
        return v


def main(session, catchup):
    rows = session.sql(
        "SELECT EXPERIMENT, RUN_NAME, KIND, NAME, VALUE FROM BANKING_HOL.ML_REFERENCE.EXPERIMENT_RUNS WHERE CATCHUP = ?",
        params=[catchup],
    ).collect()
    runs = {}
    for r in rows:
        d = runs.setdefault((r["EXPERIMENT"], r["RUN_NAME"]), {"params": {}, "metrics": {}})
        if r["KIND"] == "METRIC":
            d["metrics"][r["NAME"]] = float(r["VALUE"])
        else:
            d["params"][r["NAME"]] = _typed(r["VALUE"])
    exp = ExperimentTracking(session, database_name=DB, schema_name=SCHEMA)
    stamp = pd.Timestamp.now().strftime("%m%d_%H%M%S")  # finished runs are immutable: new names each time
    written = 0
    for experiment in sorted({e for e, _ in runs}):
        have = set()
        try:
            for x in session.sql(f"SHOW RUNS IN EXPERIMENT {DB}.{SCHEMA}.{experiment}").collect():
                have.add(re.sub(r"_\d{4}_\d{6}$", "", x["name"]))
        except Exception:
            pass  # the experiment doesn't exist yet
        exp.set_experiment(experiment)
        for (e, run), d in sorted(runs.items()):
            base = re.sub(r"_\d{4}_\d{6}$", "", run)
            if e != experiment or base in have:
                continue
            with exp.start_run(f"{base}_{stamp}"):
                exp.log_params(d["params"])
                exp.log_metrics(d["metrics"])
            written += 1
    return f"{written} experiment runs restored"
