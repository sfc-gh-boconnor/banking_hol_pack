-- =====================================================
-- BANKING HOL PACK - FACILITATOR SETUP
-- STEP 10c: PRE-TRAINED REFERENCE MODELS (DS1, DS4)
--
-- Trains the DS1 attrition model and the DS4 calibrated and margin models ONCE, with the lab's own
-- answer keys, and keeps a copy in BANKING_HOL.ML_REFERENCE. The Fast-forward catch-ups
-- (setup/catchup/ds1_model.sql, ds4_predictions.sql) copy from here in seconds instead of training
-- for several minutes. The attendee still ends up with their own registered models, scores and
-- experiment runs in BANKING_HOL.ML.
--
-- HOL_PARTICIPANT owns the reference models: Snowflake only lets the owner of a model copy it.
-- Attendee work in ML is left empty: this script removes what training put there.
-- Runs in the background after the lab data (LOAD_LAB_DATA('MODELS'), task PROVISION_MODELS),
-- alongside the executive demo. Takes about 3 minutes. Needs 10_retail_text_seed.sql. It trains in
-- BANKING_HOL.ML, so the Lab Companion asks attendees to wait for it before starting DS1 or DS4.
-- =====================================================
USE ROLE HOL_ADMIN;
USE WAREHOUSE BANKING_WH;
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.ML_REFERENCE
    COMMENT = 'Pre-trained reference models and results that the DS1 and DS4 catch-ups copy from';
GRANT USAGE, CREATE MODEL, CREATE TABLE, CREATE PROCEDURE ON SCHEMA BANKING_HOL.ML_REFERENCE TO ROLE HOL_PARTICIPANT;

USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML_REFERENCE;

CREATE OR REPLACE TABLE MODEL_VERSIONS (CATCHUP VARCHAR, MODEL VARCHAR, VERSION VARCHAR, IS_DEFAULT BOOLEAN, SEQ INTEGER);
CREATE OR REPLACE TABLE EXPERIMENT_RUNS (CATCHUP VARCHAR, EXPERIMENT VARCHAR, RUN_NAME VARCHAR, KIND VARCHAR, NAME VARCHAR, VALUE VARCHAR);
DROP MODEL IF EXISTS BANKING_HOL.ML_REFERENCE.RB_ATTRITION_MODEL;
DROP MODEL IF EXISTS BANKING_HOL.ML_REFERENCE.RB_MARGIN_MODEL;

-- Copy what the models and experiments hold right now into the reference, tagged with the catch-up
-- that will hand it out. Versions and runs already in the reference are left alone.
-- Python, not SQL Scripting: inside a task (PROVISION_MODELS) neither RESULT_SCAN(LAST_QUERY_ID()) nor
-- the ->> pipe can find the SHOW they follow ("Statement ... not found"); .collect() reads it directly.
CREATE OR REPLACE PROCEDURE BANKING_HOL.ML_REFERENCE.SNAPSHOT(CATCHUP VARCHAR)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
def run(session, catchup):
    ref = "BANKING_HOL.ML_REFERENCE"
    copied = 0
    for m in ("RB_ATTRITION_MODEL", "RB_MARGIN_MODEL"):
        if not session.sql(f"SHOW MODELS LIKE '{m}' IN SCHEMA BANKING_HOL.ML").collect():
            continue
        versions = sorted(session.sql(f"SHOW VERSIONS IN MODEL BANKING_HOL.ML.{m}").collect(), key=lambda r: r["created_on"])
        for r in versions:
            v, is_def = r["name"], str(r["is_default_version"]).lower() == "true"
            have = session.sql(f"SELECT COUNT(*) AS N FROM {ref}.MODEL_VERSIONS WHERE MODEL = ? AND VERSION = ?", params=[m, v]).collect()[0]["N"]
            if have:
                continue
            seq = session.sql(f"SELECT COUNT(*) AS N FROM {ref}.MODEL_VERSIONS WHERE MODEL = ?", params=[m]).collect()[0]["N"]
            if seq == 0:
                session.sql(f"CREATE MODEL {ref}.{m} WITH VERSION {v} FROM MODEL BANKING_HOL.ML.{m} VERSION {v}").collect()
            else:
                session.sql(f"ALTER MODEL {ref}.{m} ADD VERSION {v} FROM MODEL BANKING_HOL.ML.{m} VERSION {v}").collect()
            session.sql(f"INSERT INTO {ref}.MODEL_VERSIONS VALUES (?, ?, ?, ?, ?)", params=[catchup, m, v, is_def, seq + 1]).collect()
            copied += 1
    for e in ("RB_ATTRITION", "RB_MARGIN"):
        if not session.sql(f"SHOW EXPERIMENTS LIKE '{e}' IN SCHEMA BANKING_HOL.ML").collect():
            continue
        known = {r["RUN_NAME"] for r in session.sql(f"SELECT DISTINCT RUN_NAME FROM {ref}.EXPERIMENT_RUNS WHERE EXPERIMENT = ?", params=[e]).collect()}
        metrics = [r for r in session.sql(f"SHOW RUN METRICS IN EXPERIMENT BANKING_HOL.ML.{e}").collect() if r["run_name"] not in known]
        new_runs = {r["run_name"] for r in metrics}
        params = [r for r in session.sql(f"SHOW RUN PARAMETERS IN EXPERIMENT BANKING_HOL.ML.{e}").collect() if r["run_name"] in new_runs]
        for kind, rows in (("METRIC", metrics), ("PARAM", params)):
            for r in rows:
                session.sql(f"INSERT INTO {ref}.EXPERIMENT_RUNS VALUES (?, ?, ?, ?, ?, ?)",
                            params=[catchup, e, r["run_name"], kind, r["name"], str(r["value"])]).collect()
    return f"{copied} model versions copied for {catchup}"
$$;

-- start from nothing in ML so the snapshots hold exactly what each module adds
DROP MODEL IF EXISTS BANKING_HOL.ML.RB_ATTRITION_MODEL;
DROP MODEL IF EXISTS BANKING_HOL.ML.RB_MARGIN_MODEL;
DROP EXPERIMENT IF EXISTS BANKING_HOL.ML.RB_ATTRITION;
DROP EXPERIMENT IF EXISTS BANKING_HOL.ML.RB_MARGIN;
DROP TABLE IF EXISTS BANKING_HOL.ML.RB_ATTRITION_SCORES;
DROP TABLE IF EXISTS BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;

-- DS1
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/ml_reference/train_ds1.sql;
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
CALL BANKING_HOL.ML_REFERENCE.SNAPSHOT('ds1_model');
CREATE OR REPLACE TABLE BANKING_HOL.ML_REFERENCE.RB_ATTRITION_SCORES AS SELECT * FROM BANKING_HOL.ML.RB_ATTRITION_SCORES;

-- DS4 adds a calibrated version of the same model, a margin model and the predictions
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/ml_reference/train_ds4.sql;
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
CALL BANKING_HOL.ML_REFERENCE.SNAPSHOT('ds4_predictions');
CREATE OR REPLACE TABLE BANKING_HOL.ML_REFERENCE.RB_CUSTOMER_PREDICTIONS AS SELECT * FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;

-- leave ML as attendees expect to find it: nothing built yet
DROP MODEL IF EXISTS BANKING_HOL.ML.RB_ATTRITION_MODEL;
DROP MODEL IF EXISTS BANKING_HOL.ML.RB_MARGIN_MODEL;
DROP EXPERIMENT IF EXISTS BANKING_HOL.ML.RB_ATTRITION;
DROP EXPERIMENT IF EXISTS BANKING_HOL.ML.RB_MARGIN;
DROP TABLE IF EXISTS BANKING_HOL.ML.RB_ATTRITION_SCORES;
DROP TABLE IF EXISTS BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;
DROP VIEW IF EXISTS BANKING_HOL.ML.RB_CHURN_FEATURES;

SELECT CATCHUP, MODEL, VERSION, IS_DEFAULT FROM BANKING_HOL.ML_REFERENCE.MODEL_VERSIONS ORDER BY CATCHUP, MODEL, SEQ;
SELECT CATCHUP, EXPERIMENT, COUNT(DISTINCT RUN_NAME) AS RUNS FROM BANKING_HOL.ML_REFERENCE.EXPERIMENT_RUNS GROUP BY ALL ORDER BY 1, 2;
