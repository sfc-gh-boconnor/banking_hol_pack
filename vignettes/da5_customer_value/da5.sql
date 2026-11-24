-- =====================================================
-- VIGNETTE DA5: CUSTOMER LIFETIME VALUE, VALUE AT RISK AND NEXT-BEST OFFERS   (~30 min)
-- Persona:  Data Analyst (Retail Banking, customer value management)
-- Question: "Of the customers who might leave, which are worth the most to keep,
--            how much is at stake, and what should we offer each of them?"
-- Prereq:   DS4, or setup/catchup/ds1_model.sql then setup/catchup/ds4_predictions.sql
-- Reference SQL for each step in README.md.
-- =====================================================

-- 1.
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ANALYTICS;

-- 2.
SELECT COUNT(*) AS CUSTOMERS,
       ROUND(AVG(CHURN_3M) * 100, 2) AS AVG_CHANCE_OF_LEAVING_PCT,
       ROUND(AVG(PREDICTED_MONTHLY_MARGIN_GBP), 2) AS AVG_MONTHLY_MARGIN_GBP,
       ANY_VALUE(ATTRITION_MODEL_VERSION) AS ATTRITION_MODEL, ANY_VALUE(MARGIN_MODEL_VERSION) AS MARGIN_MODEL
FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;

-- 3.
CREATE OR REPLACE TABLE CUSTOMER_VALUE AS
WITH k AS (
    -- nobody is certain to stay: floor the 3-month chance of leaving at 0.1%
    SELECT CUSTOMER_ID, GREATEST(CHURN_3M, 0.001) AS CHURN_3M, PREDICTED_MONTHLY_MARGIN_GBP AS MARGIN,
           POWER(1 - GREATEST(CHURN_3M, 0.001), 1 / 3) AS RETENTION,  -- chance of staying each month
           POWER(1.10, 1 / 12) - 1 AS DISCOUNT               -- 10% a year, monthly
    FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS),
q AS (SELECT *, RETENTION / (1 + DISCOUNT) AS Q FROM k)
SELECT CUSTOMER_ID, CHURN_3M, ROUND(MARGIN, 2) AS MONTHLY_MARGIN_GBP,
       ROUND(1 / (1 - RETENTION) / 12, 1) AS EXPECTED_YEARS,
       -- 60 months of margin, each weighted by the chance they're still here and discounted
       ROUND(MARGIN * Q * (1 - POWER(Q, 60)) / (1 - Q)) AS LIFETIME_VALUE_GBP,
       -- what we expect to lose in the next 12 months: the value of customers worth keeping, times the chance they go
       ROUND(GREATEST(MARGIN * Q * (1 - POWER(Q, 60)) / (1 - Q), 0) * (1 - POWER(RETENTION, 12))) AS VALUE_AT_RISK_GBP
FROM q;
SELECT COUNT(*) AS CUSTOMERS, ROUND(MEDIAN(LIFETIME_VALUE_GBP)) AS MEDIAN_LTV, ROUND(AVG(LIFETIME_VALUE_GBP)) AS AVG_LTV,
       ROUND(SUM(LIFETIME_VALUE_GBP)) AS TOTAL_LTV, ROUND(SUM(VALUE_AT_RISK_GBP)) AS VALUE_AT_RISK
FROM CUSTOMER_VALUE;

-- 4.
CREATE OR REPLACE TABLE CUSTOMER_VALUE_SEGMENTS AS
WITH v AS (
    SELECT v.*, f.PRODUCTS_HELD, f.ON_LEGACY_SAVER, f.SALARY_TREND, f.DIGITAL_ACTIVE, f.BRANCH_AT_RISK, f.SAVINGS_BALANCE,
           v.LIFETIME_VALUE_GBP >= PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY v.LIFETIME_VALUE_GBP) OVER () AS HIGH_VALUE,
           v.CHURN_3M >= PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY v.CHURN_3M) OVER () AS HIGH_RISK
    FROM CUSTOMER_VALUE v JOIN BANKING_HOL.ML.RB_CHURN_FEATURES f USING (CUSTOMER_ID))
SELECT CUSTOMER_ID, LIFETIME_VALUE_GBP, VALUE_AT_RISK_GBP, CHURN_3M,
       CASE WHEN HIGH_VALUE AND HIGH_RISK THEN 'Save now'
            WHEN HIGH_VALUE THEN 'Grow'
            WHEN HIGH_RISK THEN 'Serve digitally'
            ELSE 'Maintain' END AS SEGMENT,
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
SELECT SEGMENT, COUNT(*) AS CUSTOMERS, ROUND(SUM(LIFETIME_VALUE_GBP)) AS LIFETIME_VALUE, ROUND(SUM(VALUE_AT_RISK_GBP)) AS VALUE_AT_RISK
FROM CUSTOMER_VALUE_SEGMENTS GROUP BY 1 ORDER BY VALUE_AT_RISK DESC;

-- 5.
SELECT c.FIRST_NAME || ' ' || c.LAST_NAME AS CUSTOMER, c.CITY, v.LIFETIME_VALUE_GBP, v.VALUE_AT_RISK_GBP,
       ROUND(100 * v.CHURN_3M, 1) AS CHANCE_OF_LEAVING_PCT, v.NEXT_BEST_OFFER
FROM CUSTOMER_VALUE_SEGMENTS v JOIN BANKING_HOL.RAW_DATA.RB_CUSTOMERS c USING (CUSTOMER_ID)
WHERE v.SEGMENT = 'Save now'
ORDER BY v.VALUE_AT_RISK_GBP DESC LIMIT 20;
