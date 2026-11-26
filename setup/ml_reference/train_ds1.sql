-- =====================================================
-- TRAINING: DS1 attrition model
-- Trains in the warehouse with the DS1 answer key from the lab repo. Used by setup/10c_ml_reference.sql
-- to build the reference models once at provisioning, and by RUN_CATCHUP as the fallback when an
-- account has no reference. Attendees fast-forward with setup/catchup/ds1_model.sql, which copies the
-- reference instead. Run as HOL_PARTICIPANT; takes a few minutes.
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML;

-- 1. The features view (DS1 step 1). ds1.sql ends with answer-key queries on the scores, which
--    don't exist yet, so that last statement's error is expected; the SELECT below proves the view is there.
CALL BANKING_HOL.LAB.CATCHUP_STEP(1, 2, 'Building the customer features');
EXECUTE IMMEDIATE $$
BEGIN
  EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/ds1_attrition_model/ds1.sql;
EXCEPTION
  WHEN STATEMENT_ERROR THEN RETURN 'features view created (answer-key queries skipped)';
END;
$$;
SELECT COUNT(*) AS CUSTOMERS, SUM(CHURNED_NEXT_3M) AS LEFT_NEXT_3M FROM BANKING_HOL.ML.RB_CHURN_FEATURES;

-- 2. Train, track, register and score (DS1 steps 2-4), with vignettes/ds1_attrition_model/ds1_reference.py
CALL BANKING_HOL.LAB.CATCHUP_STEP(2, 2, 'Training the attrition model, registering it and scoring every customer (the longest step)');
WITH TRAIN_DS1 AS PROCEDURE ()
  RETURNS VARIANT
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python==2.9.0', 'scikit-learn', 'xgboost', 'pandas', 'numpy')
  IMPORTS = ('@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/ds1_attrition_model/ds1_reference.py')
  HANDLER = 'ds1_reference.main'
CALL TRAIN_DS1();
