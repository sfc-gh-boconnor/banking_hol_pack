-- =====================================================
-- BANKING HOL PACK - EXECUTIVE DEMO
-- STEP 12c: AI AND ML RESULTS (BANKING_DEMO.INSIGHTS)
--
-- Run once at build time, so the tour never waits for a model or an LLM:
--   DEMO_ATTRITION_MODEL     XGBoost attrition model in the demo's own registry
--   DEMO_ATTRITION_SCORES    every active customer's risk, DEMO_ATTRITION_DRIVERS
--   DEMO_CUSTOMER_DRIVERS    each high-risk customer's own drivers (SHAP)
--   DEMO_VALUE_SEGMENTS      lifetime value, value at risk, segment and next-best offer (as DA5; the demo
--                            calibrates its own model in SQL rather than training DS4's)
--   DEMO_FRAUD_ALERTS        unusual outbound payments, scored in SQL
--   DEMO_CALL_THEMES         AI SQL on a sample of calls
--   DEMO_FINCRIME_CASE       one APP scam case worked end to end with AI SQL
--   DEMO_PAYMENTS_FORECAST   the next 4 weeks of payments by scheme (SNOWFLAKE.ML.FORECAST)
-- Reads only BANKING_DEMO. AI SQL runs on small samples (about 70 calls).
-- =====================================================
USE ROLE HOL_ADMIN;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_DEMO.INSIGHTS;

-- ---------- Attrition: point-in-time features (same as the lab's DS1, on the demo's data) ----------
CREATE OR REPLACE VIEW DEMO_CHURN_FEATURES AS
WITH obs AS (SELECT '2026-08-31'::DATE AS OBS_DATE),
snap AS (
    SELECT s.CUSTOMER_ID,
           AVG(IFF(s.MONTH >  DATEADD(month, -3, o.OBS_DATE), s.SALARY_IN_GBP, NULL)) AS SALARY_L3M,
           AVG(IFF(s.MONTH <= DATEADD(month, -3, o.OBS_DATE), s.SALARY_IN_GBP, NULL)) AS SALARY_P3M,
           AVG(IFF(s.MONTH >  DATEADD(month, -3, o.OBS_DATE), s.APP_LOGINS, NULL))    AS LOGINS_L3M,
           AVG(IFF(s.MONTH >  DATEADD(month, -3, o.OBS_DATE), s.BRANCH_VISITS, NULL)) AS BRANCH_VISITS_L3M,
           AVG(IFF(s.MONTH >  DATEADD(month, -3, o.OBS_DATE), s.CARD_SPEND_GBP, NULL)) AS CARD_SPEND_L3M,
           MAX_BY(s.CURRENT_BALANCE_GBP, s.MONTH) AS CURRENT_BALANCE,
           MAX_BY(s.SAVINGS_BALANCE_GBP, s.MONTH) AS SAVINGS_BALANCE,
           MAX_BY(s.PRODUCTS_HELD, s.MONTH)       AS PRODUCTS_HELD,
           SUM(s.PROFIT_GBP)                      AS PROFIT_TO_DATE
    FROM BANKING_DEMO.RAW_DATA.RB_MONTHLY_SNAPSHOT s, obs o
    WHERE s.MONTH <= o.OBS_DATE GROUP BY s.CUSTOMER_ID),
sav AS (
    SELECT a.CUSTOMER_ID, MIN(a.INTEREST_RATE_PCT) AS MIN_SAVINGS_RATE, MAX(IFF(p.TIER = 'LEGACY' AND a.BALANCE_GBP >= 15000, 1, 0)) AS ON_LEGACY_SAVER  -- £15k+ on a legacy saver
    FROM BANKING_DEMO.RAW_DATA.RB_ACCOUNTS a JOIN BANKING_DEMO.RAW_DATA.RB_PRODUCTS p ON p.PRODUCT_ID = a.PRODUCT_ID, obs o
    WHERE p.PRODUCT_FAMILY = 'SAVINGS' AND a.OPENED_DATE <= o.OBS_DATE GROUP BY a.CUSTOMER_ID)
SELECT c.CUSTOMER_ID,
       DATEDIFF(month, c.CUSTOMER_SINCE, o.OBS_DATE) AS TENURE_MONTHS,
       c.AGE, c.SEGMENT, c.IMD_DECILE, c.HOUSING_TENURE, c.CREDIT_SCORE,
       IFF(c.DIGITAL_ACTIVE, 1, 0) AS DIGITAL_ACTIVE,
       IFF(c.HOME_BRANCH_ID IN ('BR-MAN-90', 'BR-LDS-90', 'BR-CDF-90'), 1, 0) AS BRANCH_AT_RISK,
       c.HOME_BRANCH_DRIVE_S / 60 AS BRANCH_DRIVE_MIN,
       s.PRODUCTS_HELD, s.CURRENT_BALANCE, s.SAVINGS_BALANCE, s.CARD_SPEND_L3M, s.LOGINS_L3M, s.BRANCH_VISITS_L3M,
       s.SALARY_L3M / NULLIF(s.SALARY_P3M, 0) AS SALARY_TREND,
       COALESCE(sv.MIN_SAVINGS_RATE, 0) AS MIN_SAVINGS_RATE, COALESCE(sv.ON_LEGACY_SAVER, 0) AS ON_LEGACY_SAVER,
       s.PROFIT_TO_DATE,
       IFF(c.CHURN_DATE > o.OBS_DATE AND c.CHURN_DATE <= DATEADD(month, 3, o.OBS_DATE), 1, 0) AS CHURNED_NEXT_3M
FROM BANKING_DEMO.RAW_DATA.RB_CUSTOMERS c
JOIN snap s ON s.CUSTOMER_ID = c.CUSTOMER_ID
LEFT JOIN sav sv ON sv.CUSTOMER_ID = c.CUSTOMER_ID
CROSS JOIN obs o
WHERE c.CUSTOMER_SINCE <= o.OBS_DATE AND (c.CHURN_DATE IS NULL OR c.CHURN_DATE > o.OBS_DATE);

-- Train, register and score in one warehouse procedure (no compute pool needed)
CREATE OR REPLACE PROCEDURE BANKING_DEMO.EXEC.DEMO_TRAIN_ATTRITION()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python==2.9.0', 'xgboost', 'scikit-learn', 'pandas', 'numpy')
HANDLER = 'run'
COMMENT = 'Executive demo: trains DEMO_ATTRITION_MODEL on BANKING_DEMO data and scores every customer'
EXECUTE AS CALLER  -- the registry and write_pandas need a current schema, which owner rights can't set
AS
$$
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from snowflake.ml.registry import Registry
from xgboost import XGBClassifier

DB, SCHEMA = "BANKING_DEMO", "INSIGHTS"

def run(session):
    session.use_schema(f"{DB}.{SCHEMA}")
    df = session.table(f"{DB}.{SCHEMA}.DEMO_CHURN_FEATURES").to_pandas()
    y = df.pop("CHURNED_NEXT_3M").astype(int)
    ids = df.pop("CUSTOMER_ID")
    cat = ["SEGMENT", "HOUSING_TENURE"]
    num = [c for c in df.columns if c not in cat]
    df[num] = df[num].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    X_tr, X_te, y_tr, y_te = train_test_split(df, y, test_size=0.3, stratify=y, random_state=42)
    model = Pipeline([("prep", ColumnTransformer([("num", StandardScaler(), num), ("cat", OneHotEncoder(handle_unknown="ignore"), cat)])),
                      ("clf", XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8,
                                            scale_pos_weight=float((y_tr == 0).sum() / (y_tr == 1).sum())))])
    model.fit(X_tr, y_tr)
    auc = round(float(roc_auc_score(y_te, model.predict_proba(X_te)[:, 1])), 4)

    reg = Registry(session, database_name=DB, schema_name=SCHEMA)
    for m in reg.show_models().get("name", []):
        if m == "DEMO_ATTRITION_MODEL":
            reg.delete_model("DEMO_ATTRITION_MODEL")
    mv = reg.log_model(model, model_name="DEMO_ATTRITION_MODEL", version_name="V1", sample_input_data=X_tr.head(50),
                       metrics={"auc": auc}, target_platforms=["WAREHOUSE"],
                       comment="Executive demo: attrition in the next 3 months, observed 2026-08-31")

    prob = mv.run(df, function_name="predict_proba").iloc[:, -1].to_numpy()
    out = pd.DataFrame({"CUSTOMER_ID": ids.values, "CHURN_PROBABILITY": prob})
    pct = out.CHURN_PROBABILITY.rank(pct=True)
    out["RISK_BAND"] = np.select([pct > 0.95, pct > 0.8], ["HIGH", "MEDIUM"], "LOW")
    session.write_pandas(out, "DEMO_ATTRITION_SCORES", database=DB, schema=SCHEMA, auto_create_table=True, overwrite=True)

    names = model.named_steps["prep"].get_feature_names_out()
    imp = model.named_steps["clf"].feature_importances_
    # one-hot columns (cat__SEGMENT_MASS) roll up to their source column
    src = [next((c for c in cat if n == f"cat__{c}" or n.startswith(f"cat__{c}_")), n.split("__", 1)[-1]) for n in names]
    drivers = pd.DataFrame({"FEATURE": src, "IMPORTANCE": imp}).groupby("FEATURE", as_index=False)["IMPORTANCE"].sum()
    drivers = drivers.sort_values("IMPORTANCE", ascending=False).head(10)
    session.write_pandas(drivers, "DEMO_ATTRITION_DRIVERS", database=DB, schema=SCHEMA, auto_create_table=True, overwrite=True)

    # Per-customer drivers for the high-risk band: SHAP contributions (log-odds; > 0 pushes towards leaving),
    # one-hot columns rolled up, plus the customer's raw value so the demo can explain each driver
    hi = (out.RISK_BAND == "HIGH").to_numpy()
    import xgboost as xgb
    Xt = model.named_steps["prep"].transform(df[hi])
    contrib = model.named_steps["clf"].get_booster().predict(xgb.DMatrix(Xt), pred_contribs=True)[:, :-1]
    c = pd.DataFrame(contrib, columns=src).T.groupby(level=0).sum().T
    c["CUSTOMER_ID"] = ids.values[hi]
    long = c.melt(id_vars="CUSTOMER_ID", var_name="FEATURE", value_name="CONTRIBUTION")
    raw = df[hi].assign(CUSTOMER_ID=ids.values[hi]).melt(id_vars="CUSTOMER_ID", var_name="FEATURE", value_name="VALUE")
    long = long.merge(raw.astype({"VALUE": str}), on=["CUSTOMER_ID", "FEATURE"], how="left")
    long = long[long.FEATURE.isin(drivers.FEATURE)]
    session.write_pandas(long, "DEMO_CUSTOMER_DRIVERS", database=DB, schema=SCHEMA, auto_create_table=True, overwrite=True)
    return {"auc": auc, "scored": len(out), "high_risk": int((out.RISK_BAND == "HIGH").sum())}
$$;
CALL BANKING_DEMO.EXEC.DEMO_TRAIN_ATTRITION();

-- At-risk customers, with what they're worth and where they live (for the map and list)
-- ---------- Customer value (as the lab's DS4 and DA5, simplified): calibrate the scores in SQL, then lifetime value,
-- value at risk, segment and a rules-based next-best offer ----------
CREATE OR REPLACE TABLE DEMO_CHURN_CALIBRATION AS
WITH b AS (
    SELECT NTILE(20) OVER (ORDER BY s.CHURN_PROBABILITY) AS BIN, s.CHURN_PROBABILITY, f.CHURNED_NEXT_3M::INT AS LEFT_3M
    FROM DEMO_ATTRITION_SCORES s JOIN DEMO_CHURN_FEATURES f USING (CUSTOMER_ID))
SELECT BIN, MIN(CHURN_PROBABILITY) AS SCORE_FROM, MAX(CHURN_PROBABILITY) AS SCORE_TO, COUNT(*) AS CUSTOMERS,
       ROUND(AVG(CHURN_PROBABILITY), 3) AS AVG_SCORE, GREATEST(ROUND(AVG(LEFT_3M), 4), 0.002) AS CHURN_3M
FROM b GROUP BY 1;

CREATE OR REPLACE TABLE DEMO_CUSTOMER_VALUE AS
WITH margin AS (
    SELECT CUSTOMER_ID, AVG(PROFIT_GBP) AS MONTHLY_MARGIN_GBP
    FROM BANKING_DEMO.RAW_DATA.RB_MONTHLY_SNAPSHOT
    WHERE MONTH > DATEADD(month, -12, '2026-08-31'::DATE) AND MONTH <= '2026-08-31'::DATE
    GROUP BY 1),
k AS (
    SELECT s.CUSTOMER_ID, c.CHURN_3M AS CHURN_PROBABILITY, s.RISK_BAND, m.MONTHLY_MARGIN_GBP,
           POWER(1 - c.CHURN_3M, 1 / 3) AS MONTHLY_RETENTION,
           POWER(1.10, 1 / 12) - 1 AS MONTHLY_DISCOUNT
    FROM DEMO_ATTRITION_SCORES s JOIN margin m USING (CUSTOMER_ID)
    JOIN DEMO_CHURN_CALIBRATION c ON s.CHURN_PROBABILITY BETWEEN c.SCORE_FROM AND c.SCORE_TO),
q AS (SELECT *, MONTHLY_RETENTION / (1 + MONTHLY_DISCOUNT) AS Q FROM k)
SELECT CUSTOMER_ID, CHURN_PROBABILITY, RISK_BAND,
       ROUND(MONTHLY_MARGIN_GBP, 2) AS MONTHLY_MARGIN_GBP,
       ROUND(MONTHLY_RETENTION, 4) AS MONTHLY_RETENTION,
       ROUND(1 / (1 - MONTHLY_RETENTION), 1) AS EXPECTED_MONTHS,
       ROUND(MONTHLY_MARGIN_GBP * Q * (1 - POWER(Q, 60)) / (1 - Q)) AS LIFETIME_VALUE_GBP,
       -- what we expect to lose: the 5-year value, times the chance they leave in the next 12 months
       ROUND(GREATEST(MONTHLY_MARGIN_GBP * Q * (1 - POWER(Q, 60)) / (1 - Q), 0) * (1 - POWER(MONTHLY_RETENTION, 12))) AS VALUE_AT_RISK_GBP
FROM q;

CREATE OR REPLACE TABLE DEMO_VALUE_SEGMENTS AS
WITH v AS (
    SELECT v.*, f.PRODUCTS_HELD, f.ON_LEGACY_SAVER, f.SALARY_TREND, f.DIGITAL_ACTIVE, f.BRANCH_AT_RISK, f.SAVINGS_BALANCE,
           LIFETIME_VALUE_GBP >= PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY LIFETIME_VALUE_GBP) OVER () AS HIGH_VALUE,
           RISK_BAND IN ('HIGH', 'MEDIUM') AS HIGH_RISK
    FROM DEMO_CUSTOMER_VALUE v JOIN DEMO_CHURN_FEATURES f USING (CUSTOMER_ID))
SELECT CUSTOMER_ID, LIFETIME_VALUE_GBP, VALUE_AT_RISK_GBP, CHURN_PROBABILITY, RISK_BAND,
       CASE WHEN HIGH_VALUE AND HIGH_RISK THEN 'Save now'
            WHEN HIGH_VALUE THEN 'Grow'
            WHEN HIGH_RISK THEN 'Serve digitally'
            ELSE 'Maintain' END AS SEGMENT,
       -- next-best offer: simple rules, in priority order
       CASE WHEN ON_LEGACY_SAVER = 1 THEN 'Move to a better savings rate'
            WHEN SALARY_TREND < 0.8 THEN 'Payment holiday or budgeting support'
            WHEN BRANCH_AT_RISK = 1 THEN 'Branch change: introduce digital and nearest branch'
            WHEN NOT DIGITAL_ACTIVE AND HIGH_RISK THEN 'App onboarding call'
            WHEN HIGH_VALUE AND HIGH_RISK THEN 'Retention call from a named adviser'
            WHEN HIGH_VALUE AND PRODUCTS_HELD <= 2 THEN 'Cross-sell: ISA or credit card'
            WHEN HIGH_VALUE AND SAVINGS_BALANCE >= 20000 THEN 'Premier upgrade'
            WHEN HIGH_VALUE THEN 'Thank-you: fee-free month'
            ELSE 'No action' END AS NEXT_BEST_OFFER
FROM v;

CREATE OR REPLACE TABLE DEMO_AT_RISK_CUSTOMERS AS
SELECT s.CUSTOMER_ID, c.FIRST_NAME || ' ' || LEFT(c.LAST_NAME, 1) || '.' AS CUSTOMER, c.CITY, c.SEGMENT, c.AGE,
       ROUND(s.CHURN_PROBABILITY, 3) AS CHURN_PROBABILITY, s.RISK_BAND,
       ROUND(f.PROFIT_TO_DATE) AS PROFIT_TO_DATE_GBP, ROUND(f.SAVINGS_BALANCE) AS SAVINGS_BALANCE_GBP,
       f.ON_LEGACY_SAVER, f.BRANCH_AT_RISK, ROUND(f.SALARY_TREND, 2) AS SALARY_TREND,
       ROUND(c.HOME_LAT, 3) AS LAT, ROUND(c.HOME_LON, 3) AS LON,
       v.LIFETIME_VALUE_GBP, v.VALUE_AT_RISK_GBP, v.CHURN_PROBABILITY AS CHANCE_3M, v.SEGMENT AS VALUE_SEGMENT, v.NEXT_BEST_OFFER
FROM DEMO_ATTRITION_SCORES s
JOIN BANKING_DEMO.RAW_DATA.RB_CUSTOMERS c USING (CUSTOMER_ID)
JOIN DEMO_CHURN_FEATURES f USING (CUSTOMER_ID)
LEFT JOIN DEMO_VALUE_SEGMENTS v USING (CUSTOMER_ID)
WHERE s.RISK_BAND IN ('HIGH', 'MEDIUM');

-- ---------- Fraud alerts: unusual outbound payments against each customer's own normal ----------
CREATE OR REPLACE TABLE DEMO_FRAUD_ALERTS AS
WITH base AS (
    SELECT t.*, ABS(t.AMOUNT_GBP) AS AMT,
           AVG(ABS(t.AMOUNT_GBP)) OVER (PARTITION BY t.CUSTOMER_ID) AS CUST_AVG,
           STDDEV(ABS(t.AMOUNT_GBP)) OVER (PARTITION BY t.CUSTOMER_ID) AS CUST_SD,
           COUNT(*) OVER (PARTITION BY t.CUSTOMER_ID, DATE_TRUNC('day', t.TXN_TS)) AS SAME_DAY
    FROM BANKING_DEMO.RAW_DATA.RB_TRANSACTIONS t
    WHERE t.AMOUNT_GBP < 0 AND t.CHANNEL IN ('FPS_OUT', 'CARD'))
SELECT TXN_ID, CUSTOMER_ID, TXN_TS, CHANNEL, MERCHANT, MERCHANT_COUNTRY, ROUND(AMT, 2) AS AMOUNT_GBP, IS_NEW_PAYEE,
       ROUND(LEAST(1, 0.15 * GREATEST(0, (AMT - CUST_AVG) / NULLIF(CUST_SD, 0)) + IFF(IS_NEW_PAYEE, 0.25, 0)
                   + IFF(MERCHANT_COUNTRY <> 'GB', 0.15, 0) + IFF(SAME_DAY >= 3, 0.2, 0)), 3) AS ANOMALY_SCORE,
       IS_FRAUD AS CONFIRMED_FRAUD, FRAUD_TYPE
FROM base
QUALIFY ROW_NUMBER() OVER (ORDER BY ANOMALY_SCORE DESC, AMT DESC) <= 500;

-- ---------- What customers are telling us: AI SQL on a sample of calls ----------
CREATE OR REPLACE TABLE DEMO_CALL_THEMES AS
SELECT t.CALL_ID, t.CUSTOMER_ID, t.CALL_START_TS, t.QUEUE, t.TOPIC,
       AI_SENTIMENT(t.TRANSCRIPT):categories[0]:sentiment::VARCHAR AS SENTIMENT,
       AI_CLASSIFY(t.TRANSCRIPT, ['savings rates', 'branch access', 'service complaint', 'fraud or scam',
                                  'financial difficulty', 'card or app problem', 'product question', 'account admin']):labels[0]::VARCHAR AS CALL_REASON,
       AI_COMPLETE('claude-sonnet-4-5', 'In one short sentence, what did this bank customer want, and was it resolved? ' || t.TRANSCRIPT) AS ONE_LINE_SUMMARY
FROM BANKING_DEMO.RAW_DATA.RB_CALL_TRANSCRIPTS t
WHERE t.CALL_START_TS >= '2026-08-01'
QUALIFY ROW_NUMBER() OVER (PARTITION BY t.QUEUE ORDER BY t.CALL_ID) <= 12;

CREATE OR REPLACE TABLE DEMO_CALL_THEMES_SUMMARY AS
SELECT AI_AGG(TRANSCRIPT, 'These are calls to a UK retail bank. Give the 4 biggest themes as short bullet points, each with one action for the bank.') AS THEMES
FROM BANKING_DEMO.RAW_DATA.RB_CALL_TRANSCRIPTS
WHERE CALL_ID IN (SELECT CALL_ID FROM DEMO_CALL_THEMES);

-- ---------- What corporate clients say: AI SQL on each distinct comment ----------
CREATE OR REPLACE TABLE DEMO_FEEDBACK_THEMES AS
WITH t AS (SELECT FEEDBACK_TEXT, COUNT(*) AS TIMES FROM BANKING_DEMO.RAW_DATA.CUSTOMER_FEEDBACK GROUP BY 1)
SELECT FEEDBACK_TEXT, TIMES,
       AI_SENTIMENT(FEEDBACK_TEXT):categories[0]:sentiment::VARCHAR AS SENTIMENT,
       AI_CLASSIFY(FEEDBACK_TEXT, ['payment delays', 'failed payments', 'fraud checks', 'service and support', 'fees and pricing', 'product praise']):labels[0]::VARCHAR AS THEME
FROM t;

-- ---------- One APP scam case, worked end to end ----------
CREATE OR REPLACE TABLE DEMO_FINCRIME_CASE AS
WITH c AS (
    SELECT f.*, cu.FIRST_NAME || ' ' || cu.LAST_NAME AS CUSTOMER_NAME, cu.AGE, cu.VULNERABLE_FLAG, t.TRANSCRIPT,
           (SELECT MIN(e.FILE_NAME) FROM BANKING_DEMO.RAW_DATA.RB_EVIDENCE_FILES e WHERE e.CASE_ID = f.CASE_ID AND e.EVIDENCE_TYPE = 'POLICE_REPORT_PDF') AS POLICE_PDF,
           (SELECT MIN(e.FILE_NAME) FROM BANKING_DEMO.RAW_DATA.RB_EVIDENCE_FILES e WHERE e.CASE_ID = f.CASE_ID AND e.EVIDENCE_TYPE = 'PHISHING_SCREENSHOT') AS PHISHING_PNG
    FROM BANKING_DEMO.RAW_DATA.RB_FRAUD_CASES f
    JOIN BANKING_DEMO.RAW_DATA.RB_CUSTOMERS cu ON cu.CUSTOMER_ID = f.CUSTOMER_ID
    JOIN BANKING_DEMO.RAW_DATA.RB_CALL_TRANSCRIPTS t ON t.CUSTOMER_ID = f.CUSTOMER_ID AND t.TXN_ID = f.FIRST_FRAUD_TXN_ID AND t.QUEUE = 'FRAUD'
    WHERE f.FRAUD_TYPE = 'APP_SCAM')
SELECT CASE_ID, CUSTOMER_ID, CUSTOMER_NAME, AGE, VULNERABLE_FLAG, LOSS_GBP, DECISION, REPORTED_TS, POLICE_PDF, PHISHING_PNG,
       AI_COMPLETE('claude-sonnet-4-5', CONCAT('You are a fraud operations team leader at a UK bank. Write a case summary for a senior leader in about 120 words. ',
           'Under the PSR APP scam reimbursement rules, a victim is reimbursed unless they were grossly negligent, and vulnerable customers always are. ',
           'Give: what happened, the evidence, and whether the recorded decision is supported. Then, separately, list any discrepancies between the sources as checks for the investigator, not as reasons to refuse. ',
           'Case notes: ', INVESTIGATOR_NOTES, ' Customer call: ', TRANSCRIPT, ' Age: ', AGE, '. Vulnerable customers register: ', IFF(VULNERABLE_FLAG, 'yes', 'no'),
           '. Decision recorded: ', DECISION)) AS AI_CASE_SUMMARY,
       AI_EXTRACT(file => TO_FILE('@BANKING_DEMO.RETAIL.DEMO_EVIDENCE', POLICE_PDF), responseFormat => {
           'crime_reference': 'What is the police crime reference number?',
           'offence': 'What offence is being reported?',
           'loss_gbp': 'What total loss in pounds is reported?'}):response AS POLICE_REPORT_FIELDS,
       AI_COMPLETE('claude-sonnet-4-5', 'This is a screenshot of a suspected phishing message sent to a bank customer. List who it impersonates and 3 to 5 red flags, as short bullet points.',
           TO_FILE('@BANKING_DEMO.RETAIL.DEMO_EVIDENCE', PHISHING_PNG)) AS PHISHING_RED_FLAGS
FROM c
WHERE POLICE_PDF IS NOT NULL AND PHISHING_PNG IS NOT NULL AND DECISION = 'REIMBURSED_PSR_RULES'
ORDER BY LOSS_GBP DESC
LIMIT 1;

-- Lets the Lab Companion show the case's evidence files: returns one demo evidence file as base64.
-- Only bare file names from the demo stage (no paths), so it can't read anything else.
CREATE OR REPLACE PROCEDURE BANKING_DEMO.EXEC.DEMO_EVIDENCE_FILE(FILE_NAME VARCHAR)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
COMMENT = 'Executive demo: one evidence file from @BANKING_DEMO.RETAIL.DEMO_EVIDENCE, base64'
AS
$$
import base64, re
from snowflake.snowpark.files import SnowflakeFile

def run(session, file_name):
    if not re.fullmatch(r"[A-Za-z0-9_\-]+\.(pdf|png|jpg|jpeg)", file_name or ""):
        raise ValueError("Not an evidence file name")
    with SnowflakeFile.open(f"@BANKING_DEMO.RETAIL.DEMO_EVIDENCE/{file_name}", "rb", require_scoped_url=False) as f:
        return base64.b64encode(f.read()).decode()
$$;

-- "Every AI call on the record": Snowflake's own usage history. The app runs as the viewer, who can't read
-- SNOWFLAKE.ACCOUNT_USAGE, so this owner's-rights procedure returns just these summaries as one JSON object (fixed queries, no inputs).
CREATE OR REPLACE PROCEDURE BANKING_DEMO.EXEC.DEMO_AI_AUDIT()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
COMMENT = 'Executive demo: agent requests, AI use by user and feature, and AI Gateway calls, from ACCOUNT_USAGE'
EXECUTE AS OWNER
AS
$$
AU = "SNOWFLAKE.ACCOUNT_USAGE"
QUERIES = {
    # every request to an agent: who, under which role, which model, what it cost
    "agent": f"""SELECT START_TIME::VARCHAR AS START_TIME, USER_NAME, METADATA:role_name::VARCHAR AS ROLE_NAME, AGENT_NAME,
                        OBJECT_KEYS(PARSE_JSON(TOKENS_GRANULAR::VARCHAR)[0][REQUEST_ID]:cortex_agents)[0]::VARCHAR AS MODEL,
                        TOKENS, ROUND(TOKEN_CREDITS, 4)::FLOAT AS CREDITS, METADATA:sql_query_warehouses[0]::VARCHAR AS WAREHOUSE
                 FROM {AU}.CORTEX_AGENT_USAGE_HISTORY ORDER BY START_TIME DESC LIMIT 12""",
    # AI use by person and feature over 30 days
    "byUser": f"""SELECT USER_NAME, ENTITY_NAME AS FEATURE, SERVICE_TYPE, ROUND(SUM(CREDITS), 3)::FLOAT AS CREDITS
                  FROM {AU}.USER_AI_USAGE_HISTORY WHERE USAGE_HOUR >= DATEADD('day', -30, CURRENT_TIMESTAMP())
                  GROUP BY 1, 2, 3 ORDER BY CREDITS DESC LIMIT 10""",
    "gateway": f"SELECT COUNT(*) AS CALLS FROM {AU}.AI_GATEWAY_USAGE_HISTORY",
    "agentTotals": f"""SELECT COUNT(*) AS REQUESTS, COUNT(DISTINCT USER_NAME) AS USERS, ROUND(SUM(TOKEN_CREDITS), 2)::FLOAT AS CREDITS, SUM(TOKENS) AS TOKENS
                       FROM {AU}.CORTEX_AGENT_USAGE_HISTORY""",
}

def run(session):
    return {k: [r.as_dict() for r in session.sql(q).collect()] for k, q in QUERIES.items()}
$$;
GRANT USAGE ON PROCEDURE BANKING_DEMO.EXEC.DEMO_AI_AUDIT() TO ROLE HOL_PARTICIPANT;

SELECT 'DEMO_ATTRITION_SCORES' AS T, COUNT(*) N FROM DEMO_ATTRITION_SCORES
UNION ALL SELECT 'DEMO_AT_RISK_CUSTOMERS', COUNT(*) FROM DEMO_AT_RISK_CUSTOMERS
UNION ALL SELECT 'DEMO_FRAUD_ALERTS', COUNT(*) FROM DEMO_FRAUD_ALERTS
UNION ALL SELECT 'DEMO_CALL_THEMES', COUNT(*) FROM DEMO_CALL_THEMES
UNION ALL SELECT 'DEMO_FINCRIME_CASE', COUNT(*) FROM DEMO_FINCRIME_CASE;


-- ---------- Payments forecast: built-in ML forecasting, no model code ----------
-- Daily payment counts per scheme and in total, with calendar features the model can learn
-- from (month end, quarter end, BACS payroll, holidays). Weekends with no CHAPS or BACS are 0.
CREATE OR REPLACE TABLE DEMO_PAYMENTS_CAL AS
WITH d AS (SELECT DATEADD('day', SEQ4(), (SELECT MIN(PAYMENT_DATE)::DATE FROM BANKING_DEMO.RAW_DATA.PAYMENTS)) AS D
           FROM TABLE(GENERATOR(ROWCOUNT => 450))),
bd AS (SELECT D, ROW_NUMBER() OVER (PARTITION BY DATE_TRUNC('month', D) ORDER BY D DESC) AS N FROM d WHERE DAYOFWEEKISO(D) <= 5)
SELECT d.D::TIMESTAMP_NTZ AS DAY,
       IFF(bd.N = 1, 1, 0) AS MONTH_END,
       IFF(bd.N <= 3 AND MONTH(d.D) IN (3, 6, 9, 12), 1, 0) AS QUARTER_END,
       IFF(DAY(d.D) BETWEEN 24 AND 28 AND DAYOFWEEKISO(d.D) <= 5, 1, 0) AS PAYROLL,
       IFF((MONTH(d.D) = 12 AND DAY(d.D) >= 24) OR (MONTH(d.D) = 1 AND DAY(d.D) = 1), 1, 0) AS HOLIDAY
FROM d LEFT JOIN bd ON bd.D = d.D;

-- whole days only (today is still filling up); the live demo's LIVE-* rows are excluded
CREATE OR REPLACE TABLE DEMO_PAYMENTS_DAILY_SERIES AS
WITH p AS (SELECT PAYMENT_DATE::DATE AS D, PAYMENT_TYPE FROM BANKING_DEMO.RAW_DATA.PAYMENTS
           WHERE PAYMENT_DATE::DATE < CURRENT_DATE() AND PAYMENT_ID NOT LIKE 'LIVE-%'),
s AS (SELECT DISTINCT PAYMENT_TYPE AS SERIES FROM p UNION ALL SELECT 'ALL'),
c AS (SELECT DAY, SERIES FROM DEMO_PAYMENTS_CAL CROSS JOIN s
      WHERE DAY BETWEEN (SELECT MIN(D) FROM p) AND (SELECT MAX(D) FROM p))
SELECT c.DAY, c.SERIES, COUNT(p.D)::FLOAT AS PAYMENTS, k.MONTH_END, k.QUARTER_END, k.PAYROLL, k.HOLIDAY
FROM c JOIN DEMO_PAYMENTS_CAL k USING (DAY)
LEFT JOIN p ON p.D = c.DAY::DATE AND (c.SERIES = 'ALL' OR c.SERIES = p.PAYMENT_TYPE)
GROUP BY ALL;

CREATE OR REPLACE TABLE DEMO_PAYMENTS_FUTURE AS
SELECT s.SERIES, k.* FROM DEMO_PAYMENTS_CAL k CROSS JOIN (SELECT DISTINCT SERIES FROM DEMO_PAYMENTS_DAILY_SERIES) s
WHERE k.DAY > (SELECT MAX(DAY) FROM DEMO_PAYMENTS_DAILY_SERIES)
  AND k.DAY <= DATEADD('day', 35, (SELECT MAX(DAY) FROM DEMO_PAYMENTS_DAILY_SERIES));

-- Weekly totals for the next 4 whole weeks. With one year of history the model has seen one
-- Christmas, so holiday weeks are its least reliable. Negative daily forecasts are 0.
-- Run as a block: the scripts are compiled up front when the lab loader runs them, before the
-- training table exists, so the model statements are executed dynamically.
EXECUTE IMMEDIATE $$
DECLARE
    qid VARCHAR;
BEGIN
    EXECUTE IMMEDIATE 'CREATE OR REPLACE SNOWFLAKE.ML.FORECAST BANKING_DEMO.INSIGHTS.DEMO_PAYMENTS_FORECASTER(
    INPUT_DATA => TABLE(BANKING_DEMO.INSIGHTS.DEMO_PAYMENTS_DAILY_SERIES),
    SERIES_COLNAME => ''SERIES'', TIMESTAMP_COLNAME => ''DAY'', TARGET_COLNAME => ''PAYMENTS'')';
    EXECUTE IMMEDIATE 'CALL BANKING_DEMO.INSIGHTS.DEMO_PAYMENTS_FORECASTER!FORECAST(
    INPUT_DATA => TABLE(BANKING_DEMO.INSIGHTS.DEMO_PAYMENTS_FUTURE), SERIES_COLNAME => ''SERIES'', TIMESTAMP_COLNAME => ''DAY'')';
    qid := LAST_QUERY_ID();
    CREATE OR REPLACE TABLE BANKING_DEMO.INSIGHTS.DEMO_PAYMENTS_FORECAST AS
WITH f AS (SELECT TRIM(SERIES::VARCHAR, '"') AS SERIES, TS::DATE AS D,
                  GREATEST(FORECAST, 0) AS F, GREATEST(LOWER_BOUND, 0) AS LO, GREATEST(UPPER_BOUND, 0) AS HI
           FROM TABLE(RESULT_SCAN(:qid)))
SELECT DATE_TRUNC('week', D)::DATE AS WEEK, SERIES, ROUND(SUM(F)) AS FORECAST, ROUND(SUM(LO)) AS LOWER_BOUND, ROUND(SUM(HI)) AS UPPER_BOUND
FROM f
WHERE DATE_TRUNC('week', D) > DATE_TRUNC('week', CURRENT_DATE())
GROUP BY 1, 2
QUALIFY DENSE_RANK() OVER (ORDER BY WEEK) <= 4;
    RETURN 'forecast built';
END;
$$;
