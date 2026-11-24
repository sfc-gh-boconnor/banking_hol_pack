-- =====================================================
-- VIGNETTE DS4: CALIBRATE THE ATTRITION MODEL AND PREDICT CUSTOMER MARGIN   (~45 min)
-- Persona:  Data Scientist
-- Question: "Are DS1's churn scores real probabilities, and how much will each
--            customer be worth over the next few months?"
-- Prereq:   DS1, or setup/catchup/ds1_model.sql
-- In the lab you build this in notebooks/ds4_customer_value.ipynb with Cortex Code; the models
-- are trained by vignettes/ds4_customer_value/ds4_reference.py. This file is the SQL answer key.
-- =====================================================

USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML;

-- 1. score_check: DS1's scores against what really happened, by decile
WITH d AS (SELECT NTILE(10) OVER (ORDER BY s.CHURN_PROBABILITY) AS DECILE, s.CHURN_PROBABILITY, f.CHURNED_NEXT_3M
           FROM RB_ATTRITION_SCORES s JOIN RB_CHURN_FEATURES f USING (CUSTOMER_ID))
SELECT DECILE, COUNT(*) AS CUSTOMERS, ROUND(AVG(CHURN_PROBABILITY), 3) AS AVG_SCORE, ROUND(AVG(CHURNED_NEXT_3M), 4) AS ACTUALLY_LEFT
FROM d GROUP BY 1 ORDER BY 1;

-- 2. and 3. the experiments and the registry
SHOW RUNS IN EXPERIMENT RB_ATTRITION;
SHOW RUNS IN EXPERIMENT RB_MARGIN;
SHOW VERSIONS IN MODEL RB_ATTRITION_MODEL;
SHOW VERSIONS IN MODEL RB_MARGIN_MODEL;

-- 4. prediction_summary
SELECT COUNT(*) AS CUSTOMERS, ROUND(AVG(p.CHURN_3M), 4) AS AVG_CHANCE_OF_LEAVING, ROUND(AVG(f.CHURNED_NEXT_3M), 4) AS ACTUALLY_LEFT,
       ROUND(SUM(p.PREDICTED_MONTHLY_MARGIN_GBP)) AS PREDICTED_MONTHLY_MARGIN_GBP
FROM RB_CUSTOMER_PREDICTIONS p JOIN RB_CHURN_FEATURES f USING (CUSTOMER_ID);
