-- =====================================================
-- CATCH-UP: DS1 attrition model (for DS3, DS4, DA5)
-- Gives you what DS1 leaves behind, without the notebook: the point-in-time features view,
-- experiment RB_ATTRITION (two runs), model RB_ATTRITION_MODEL in the Model Registry and
-- ML.RB_ATTRITION_SCORES.
-- It copies the model the lab trained once at provisioning (BANKING_HOL.ML_REFERENCE), so it takes
-- seconds. If the account has no pre-trained model it trains one with the DS1 answer key instead
-- (setup/ml_reference/train_ds1.sql, a few minutes).
-- Run as HOL_PARTICIPANT.
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML;

-- 1. The features view (DS1 step 1). ds1.sql ends with answer-key queries on the scores, which
--    don't exist yet, so that last statement's error is expected; the SELECT below proves the view is there.
CALL BANKING_HOL.LAB.CATCHUP_STEP(1, 3, 'Building the customer features');
EXECUTE IMMEDIATE $$
BEGIN
  EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/ds1_attrition_model/ds1.sql;
EXCEPTION
  WHEN STATEMENT_ERROR THEN RETURN 'features view created (answer-key queries skipped)';
END;
$$;
SELECT COUNT(*) AS CUSTOMERS, SUM(CHURNED_NEXT_3M) AS LEFT_NEXT_3M FROM BANKING_HOL.ML.RB_CHURN_FEATURES;

-- 2. The model, its scores and its experiment runs (DS1 steps 2-4)
CALL BANKING_HOL.LAB.CATCHUP_STEP(2, 3, 'Copying the pre-trained attrition model into your account');
EXECUTE IMMEDIATE $$
DECLARE
  n INTEGER DEFAULT 0;
  made INTEGER DEFAULT 0;
  m VARCHAR;
  v VARCHAR;
  d BOOLEAN;
BEGIN
  -- INFORMATION_SCHEMA, not SHOW + LAST_QUERY_ID, which loses the statement inside a task
  SELECT COUNT(*) INTO :n FROM BANKING_HOL.INFORMATION_SCHEMA.MODEL_VERSIONS
    WHERE SCHEMA_NAME = 'ML_REFERENCE' AND MODEL_NAME = 'RB_ATTRITION_MODEL';
  IF (n = 0) THEN
    CALL BANKING_HOL.LAB.CATCHUP_STEP(2, 3, 'No pre-trained model here, so training one (the longest step)');
    EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/ml_reference/train_ds1.sql;
    RETURN 'trained';
  END IF;
  DROP MODEL IF EXISTS BANKING_HOL.ML.RB_ATTRITION_MODEL;
  LET rs RESULTSET := (SELECT MODEL, VERSION, IS_DEFAULT FROM BANKING_HOL.ML_REFERENCE.MODEL_VERSIONS WHERE CATCHUP = 'ds1_model' ORDER BY SEQ);
  LET cur CURSOR FOR rs;
  FOR r IN cur DO
    m := r.MODEL;
    v := r.VERSION;
    d := r.IS_DEFAULT;
    IF (made = 0) THEN
      EXECUTE IMMEDIATE 'CREATE MODEL BANKING_HOL.ML.' || :m || ' WITH VERSION ' || :v || ' FROM MODEL BANKING_HOL.ML_REFERENCE.' || :m || ' VERSION ' || :v;
    ELSE
      EXECUTE IMMEDIATE 'ALTER MODEL BANKING_HOL.ML.' || :m || ' ADD VERSION ' || :v || ' FROM MODEL BANKING_HOL.ML_REFERENCE.' || :m || ' VERSION ' || :v;
    END IF;
    IF (d) THEN
      EXECUTE IMMEDIATE 'ALTER MODEL BANKING_HOL.ML.' || :m || ' SET DEFAULT_VERSION = ' || :v;
    END IF;
    made := made + 1;
  END FOR;
  CREATE OR REPLACE TABLE BANKING_HOL.ML.RB_ATTRITION_SCORES AS SELECT * FROM BANKING_HOL.ML_REFERENCE.RB_ATTRITION_SCORES;
  DROP EXPERIMENT IF EXISTS BANKING_HOL.ML.RB_ATTRITION;
  CALL BANKING_HOL.LAB.CATCHUP_STEP(3, 3, 'Recording the experiment runs');
        EXECUTE IMMEDIATE 'WITH RESTORE AS PROCEDURE (C VARCHAR) RETURNS VARCHAR LANGUAGE PYTHON RUNTIME_VERSION = ''3.11'' PACKAGES = (''snowflake-snowpark-python'', ''snowflake-ml-python==2.9.0'', ''pandas'') IMPORTS = (''@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/ml_reference/restore_runs.py'') HANDLER = ''restore_runs.main'' CALL RESTORE(''ds1_model'')';
  RETURN 'copied';
END;
$$;

SELECT COUNT(*) AS CUSTOMERS_SCORED FROM BANKING_HOL.ML.RB_ATTRITION_SCORES;
