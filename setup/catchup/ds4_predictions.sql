-- =====================================================
-- CATCH-UP: DS4 customer predictions (for DA5)
-- Gives you what DS4 leaves behind, without the notebook: a calibrated version of RB_ATTRITION_MODEL
-- (not the default), RB_MARGIN_MODEL, the RB_ATTRITION and RB_MARGIN experiment runs and
-- ML.RB_CUSTOMER_PREDICTIONS.
-- It copies the models the lab trained once at provisioning (BANKING_HOL.ML_REFERENCE), so it takes
-- seconds. If the account has no pre-trained models it trains them with the DS4 answer key instead
-- (setup/ml_reference/train_ds4.sql, a few minutes).
-- Needs DS1's features and model: run setup/catchup/ds1_model.sql first if you skipped DS1.
-- Run as HOL_PARTICIPANT.
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML;

CALL BANKING_HOL.LAB.CATCHUP_STEP(1, 3, 'Checking the DS1 model and customer features are ready');
SELECT COUNT(*) AS CUSTOMERS FROM BANKING_HOL.ML.RB_CHURN_FEATURES;  -- fails here if DS1's features aren't built yet

CALL BANKING_HOL.LAB.CATCHUP_STEP(2, 3, 'Copying the pre-trained calibrated and margin models into your account');
EXECUTE IMMEDIATE $$
DECLARE
  n INTEGER DEFAULT 0;
  have INTEGER DEFAULT 0;
  m VARCHAR;
  v VARCHAR;
  d BOOLEAN;
BEGIN
  -- INFORMATION_SCHEMA, not SHOW + LAST_QUERY_ID, which loses the statement inside a task
  SELECT COUNT(*) INTO :n FROM BANKING_HOL.INFORMATION_SCHEMA.MODEL_VERSIONS
    WHERE SCHEMA_NAME = 'ML_REFERENCE' AND MODEL_NAME = 'RB_MARGIN_MODEL';
  IF (n = 0) THEN
    CALL BANKING_HOL.LAB.CATCHUP_STEP(2, 3, 'No pre-trained models here, so training them (the longest step)');
    EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/ml_reference/train_ds4.sql;
    RETURN 'trained';
  END IF;
  DROP MODEL IF EXISTS BANKING_HOL.ML.RB_MARGIN_MODEL;
  LET rs RESULTSET := (SELECT MODEL, VERSION, IS_DEFAULT FROM BANKING_HOL.ML_REFERENCE.MODEL_VERSIONS WHERE CATCHUP = 'ds4_predictions' ORDER BY SEQ);
  LET cur CURSOR FOR rs;
  FOR r IN cur DO
    m := r.MODEL;
    v := r.VERSION;
    d := r.IS_DEFAULT;
    IF (m = 'RB_ATTRITION_MODEL') THEN
      -- the calibrated challenger joins DS1's model; a re-run keeps the version it already has
      SELECT COUNT(*) INTO :have FROM BANKING_HOL.INFORMATION_SCHEMA.MODEL_VERSIONS
        WHERE SCHEMA_NAME = 'ML' AND MODEL_NAME = 'RB_ATTRITION_MODEL' AND MODEL_VERSION_NAME = :v;
      IF (have = 0) THEN
        EXECUTE IMMEDIATE 'ALTER MODEL BANKING_HOL.ML.' || :m || ' ADD VERSION ' || :v || ' FROM MODEL BANKING_HOL.ML_REFERENCE.' || :m || ' VERSION ' || :v;
      END IF;
    ELSE
      EXECUTE IMMEDIATE 'CREATE MODEL BANKING_HOL.ML.' || :m || ' WITH VERSION ' || :v || ' FROM MODEL BANKING_HOL.ML_REFERENCE.' || :m || ' VERSION ' || :v;
      IF (d) THEN
        EXECUTE IMMEDIATE 'ALTER MODEL BANKING_HOL.ML.' || :m || ' SET DEFAULT_VERSION = ' || :v;
      END IF;
    END IF;
  END FOR;
  CREATE OR REPLACE TABLE BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS AS SELECT * FROM BANKING_HOL.ML_REFERENCE.RB_CUSTOMER_PREDICTIONS;
  CALL BANKING_HOL.LAB.CATCHUP_STEP(3, 3, 'Recording the experiment runs');
        EXECUTE IMMEDIATE 'WITH RESTORE AS PROCEDURE (C VARCHAR) RETURNS VARCHAR LANGUAGE PYTHON RUNTIME_VERSION = ''3.11'' PACKAGES = (''snowflake-snowpark-python'', ''snowflake-ml-python==2.9.0'', ''pandas'') IMPORTS = (''@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/ml_reference/restore_runs.py'') HANDLER = ''restore_runs.main'' CALL RESTORE(''ds4_predictions'')';
  RETURN 'copied';
END;
$$;

SELECT COUNT(*) AS CUSTOMERS, ROUND(AVG(CHURN_3M), 4) AS AVG_CHANCE_OF_LEAVING FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;
