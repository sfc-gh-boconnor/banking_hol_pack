-- =====================================================
-- TRAINING: DS4 customer predictions
-- Trains in the warehouse with the DS4 answer key from the lab repo. Used by setup/10c_ml_reference.sql
-- to build the reference models once at provisioning, and by RUN_CATCHUP as the fallback when an
-- account has no reference. Needs DS1's feature view and model. Run as HOL_PARTICIPANT; takes a few minutes.
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML;

CALL BANKING_HOL.LAB.CATCHUP_STEP(1, 2, 'Checking the customer features are ready');
SELECT COUNT(*) AS CUSTOMERS FROM BANKING_HOL.ML.RB_CHURN_FEATURES;  -- fails here if DS1's features aren't built yet

CALL BANKING_HOL.LAB.CATCHUP_STEP(2, 2, 'Training the calibrated attrition and margin models and predicting for every customer (the longest step)');
WITH TRAIN_DS4 AS PROCEDURE ()
  RETURNS VARIANT
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python==2.9.0', 'scikit-learn', 'xgboost', 'pandas', 'numpy')
  IMPORTS = ('@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/ds4_customer_value/ds4_reference.py')
  HANDLER = 'ds4_reference.main'
CALL TRAIN_DS4();

SELECT COUNT(*) AS CUSTOMERS, ROUND(AVG(CHURN_3M), 4) AS AVG_CHANCE_OF_LEAVING FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;
