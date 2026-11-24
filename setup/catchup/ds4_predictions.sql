-- =====================================================
-- CATCH-UP: DS4 customer predictions (for DA5)
-- Builds what DS4 leaves behind, without the notebook: a calibrated version of RB_ATTRITION_MODEL
-- (not the default), RB_MARGIN_MODEL, the RB_ATTRITION and RB_MARGIN experiment runs, and
-- ML.RB_CUSTOMER_PREDICTIONS. Trains in the warehouse with the DS4 answer key from the lab repo.
-- Needs DS1's feature view: run setup/catchup/ds1_model.sql first if you skipped DS1.
-- Run as HOL_PARTICIPANT; takes a few minutes.
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML;

SELECT COUNT(*) AS CUSTOMERS FROM BANKING_HOL.ML.RB_CHURN_FEATURES;  -- fails here if DS1's features aren't built yet

WITH TRAIN_DS4 AS PROCEDURE ()
  RETURNS VARIANT
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python==2.9.0', 'scikit-learn', 'xgboost', 'pandas', 'numpy')
  IMPORTS = ('@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/ds4_customer_value/ds4_reference.py')
  HANDLER = 'ds4_reference.main'
CALL TRAIN_DS4();

SELECT COUNT(*) AS CUSTOMERS, ROUND(AVG(CHURN_3M), 4) AS AVG_CHANCE_OF_LEAVING FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;
