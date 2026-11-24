-- =====================================================
-- CATCH-UP: DS1 attrition model (for DS3)
-- Builds what DS1 leaves behind, without the notebook: the point-in-time features view,
-- experiment RB_ATTRITION (two runs), model RB_ATTRITION_MODEL in the Model Registry, and
-- ML.RB_ATTRITION_SCORES. Trains in the warehouse with the DS1 answer key from the lab repo.
-- Run as HOL_PARTICIPANT; takes a few minutes.
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML;

-- 1. The features view (DS1 step 1). ds1.sql ends with answer-key queries on the scores, which
--    don't exist yet, so that last statement's error is expected; the SELECT below proves the view is there.
EXECUTE IMMEDIATE $$
BEGIN
  EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/ds1_attrition_model/ds1.sql;
EXCEPTION
  WHEN STATEMENT_ERROR THEN RETURN 'features view created (answer-key queries skipped)';
END;
$$;
SELECT COUNT(*) AS CUSTOMERS, SUM(CHURNED_NEXT_3M) AS LEFT_NEXT_3M FROM BANKING_HOL.ML.RB_CHURN_FEATURES;

-- 2. Train, track, register and score (DS1 steps 2-4), with vignettes/ds1_attrition_model/ds1_reference.py
WITH TRAIN_DS1 AS PROCEDURE ()
  RETURNS VARIANT
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python==2.9.0', 'scikit-learn', 'xgboost', 'pandas', 'numpy')
  IMPORTS = ('@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/ds1_attrition_model/ds1_reference.py')
  HANDLER = 'ds1_reference.main'
CALL TRAIN_DS1();
