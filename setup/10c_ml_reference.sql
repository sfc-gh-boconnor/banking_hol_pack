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
CREATE OR REPLACE PROCEDURE BANKING_HOL.ML_REFERENCE.SNAPSHOT(CATCHUP VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
DECLARE
    models ARRAY DEFAULT ARRAY_CONSTRUCT('RB_ATTRITION_MODEL', 'RB_MARGIN_MODEL');
    experiments ARRAY DEFAULT ARRAY_CONSTRUCT('RB_ATTRITION', 'RB_MARGIN');
    m VARCHAR;
    e VARCHAR;
    v VARCHAR;
    is_def BOOLEAN;
    n INTEGER;
    seq INTEGER;
    copied INTEGER DEFAULT 0;
BEGIN
    -- each SHOW feeds its query with the ->> pipe, not RESULT_SCAN(LAST_QUERY_ID()): this runs nested
    -- inside the loader's task, where LAST_QUERY_ID() doesn't point at the SHOW. The names in the
    -- strings are this procedure's own constants and the catch-up name it was called with.
    FOR i IN 0 TO ARRAY_SIZE(models) - 1 DO
        m := GET(models, i)::VARCHAR;
        LET found RESULTSET := (EXECUTE IMMEDIATE 'SHOW MODELS LIKE ''' || :m || ''' IN SCHEMA BANKING_HOL.ML ->> SELECT COUNT(*) AS N FROM $1');
        LET fc CURSOR FOR found;
        OPEN fc; FETCH fc INTO n; CLOSE fc;
        IF (n > 0) THEN
            LET rs RESULTSET := (EXECUTE IMMEDIATE 'SHOW VERSIONS IN MODEL BANKING_HOL.ML.' || :m
                || ' ->> SELECT "name" AS V, "is_default_version" AS D FROM $1 ORDER BY "created_on"');
            LET cur CURSOR FOR rs;
            FOR r IN cur DO
                v := r.V;
                is_def := r.D;
                SELECT COUNT(*) INTO :n FROM BANKING_HOL.ML_REFERENCE.MODEL_VERSIONS WHERE MODEL = :m AND VERSION = :v;
                IF (n = 0) THEN
                    SELECT COUNT(*) INTO :seq FROM BANKING_HOL.ML_REFERENCE.MODEL_VERSIONS WHERE MODEL = :m;
                    IF (seq = 0) THEN
                        EXECUTE IMMEDIATE 'CREATE MODEL BANKING_HOL.ML_REFERENCE.' || :m || ' WITH VERSION ' || :v
                            || ' FROM MODEL BANKING_HOL.ML.' || :m || ' VERSION ' || :v;
                    ELSE
                        EXECUTE IMMEDIATE 'ALTER MODEL BANKING_HOL.ML_REFERENCE.' || :m || ' ADD VERSION ' || :v
                            || ' FROM MODEL BANKING_HOL.ML.' || :m || ' VERSION ' || :v;
                    END IF;
                    INSERT INTO BANKING_HOL.ML_REFERENCE.MODEL_VERSIONS VALUES (:CATCHUP, :m, :v, :is_def, :seq + 1);
                    copied := copied + 1;
                END IF;
            END FOR;
        END IF;
    END FOR;
    FOR i IN 0 TO ARRAY_SIZE(experiments) - 1 DO
        e := GET(experiments, i)::VARCHAR;
        LET found_e RESULTSET := (EXECUTE IMMEDIATE 'SHOW EXPERIMENTS LIKE ''' || :e || ''' IN SCHEMA BANKING_HOL.ML ->> SELECT COUNT(*) AS N FROM $1');
        LET ec CURSOR FOR found_e;
        OPEN ec; FETCH ec INTO n; CLOSE ec;
        IF (n > 0) THEN
            EXECUTE IMMEDIATE 'SHOW RUN METRICS IN EXPERIMENT BANKING_HOL.ML.' || :e
                || ' ->> INSERT INTO BANKING_HOL.ML_REFERENCE.EXPERIMENT_RUNS'
                || ' SELECT ''' || :CATCHUP || ''', ''' || :e || ''', "run_name", ''METRIC'', "name", "value"::VARCHAR FROM $1'
                || ' WHERE "run_name" NOT IN (SELECT RUN_NAME FROM BANKING_HOL.ML_REFERENCE.EXPERIMENT_RUNS WHERE EXPERIMENT = ''' || :e || ''')';
            EXECUTE IMMEDIATE 'SHOW RUN PARAMETERS IN EXPERIMENT BANKING_HOL.ML.' || :e
                || ' ->> INSERT INTO BANKING_HOL.ML_REFERENCE.EXPERIMENT_RUNS'
                || ' SELECT ''' || :CATCHUP || ''', ''' || :e || ''', "run_name", ''PARAM'', "name", "value"::VARCHAR FROM $1'
                || ' WHERE "run_name" IN (SELECT RUN_NAME FROM BANKING_HOL.ML_REFERENCE.EXPERIMENT_RUNS WHERE EXPERIMENT = ''' || :e
                || ''' AND CATCHUP = ''' || :CATCHUP || ''' AND KIND = ''METRIC'')';
        END IF;
    END FOR;
    RETURN copied || ' model versions copied for ' || :CATCHUP;
END;
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
