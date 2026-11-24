-- =====================================================
-- DS3: Model risk evidence pack (solution / catch-up)
-- The PRA's SS1/23 principles (model identification, governance, development and use,
-- independent validation, risk mitigants) applied to the DS1 attrition model: an inventory
-- from the Model Registry, validation against what really happened, champion vs challenger
-- from the experiment, an AI-drafted model card, and a recorded approval.
-- Run as HOL_PARTICIPANT after DS1 (or setup/catchup/ds1_model.sql).
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ML;

-- 1. Inventory: every version of every model in the registry, plus what model risk asks for
SHOW VERSIONS IN MODEL RB_ATTRITION_MODEL;
CREATE OR REPLACE TABLE MODEL_INVENTORY AS
SELECT "model_name" AS MODEL_NAME, "name" AS VERSION, "is_default_version"::BOOLEAN AS IS_DEFAULT, "comment" AS PURPOSE,
       PARSE_JSON("model_attributes"):framework::VARCHAR AS FRAMEWORK,
       PARSE_JSON("metadata"):metrics:auc::FLOAT AS AUC,
       "created_on"::TIMESTAMP_LTZ AS REGISTERED_ON,
       'Retail Analytics' AS OWNER,
       'Rank customers for retention offers; never used to refuse a product or set a price' AS PERMITTED_USE,
       'MEDIUM' AS RISK_TIER,
       'ML.RB_CHURN_FEATURES (observed 2026-08-31, label: left by 2026-11-30)' AS TRAINING_DATA,
       'PENDING_VALIDATION'::VARCHAR AS STATUS
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
SELECT * FROM MODEL_INVENTORY;

-- 2. Validation: predicted vs actual, by risk band and by segment
CREATE OR REPLACE TABLE MODEL_VALIDATION AS
WITH s AS (
  SELECT f.SEGMENT, sc.RISK_BAND, sc.CHURN_PROBABILITY, f.CHURNED_NEXT_3M
  FROM RB_ATTRITION_SCORES sc JOIN RB_CHURN_FEATURES f USING (CUSTOMER_ID))
SELECT 'RISK_BAND' AS CUT, RISK_BAND AS GROUP_NAME, COUNT(*) AS CUSTOMERS,
       ROUND(100 * AVG(CHURN_PROBABILITY), 1) AS PREDICTED_PCT, ROUND(100 * AVG(CHURNED_NEXT_3M), 1) AS ACTUAL_PCT
FROM s GROUP BY 2
UNION ALL
SELECT 'SEGMENT', SEGMENT, COUNT(*), ROUND(100 * AVG(CHURN_PROBABILITY), 1), ROUND(100 * AVG(CHURNED_NEXT_3M), 1)
FROM s GROUP BY 2;
SELECT * FROM MODEL_VALIDATION ORDER BY CUT, PREDICTED_PCT DESC;

-- 3. Champion vs challenger: every run in the experiment, one row per run
SHOW RUN METRICS IN EXPERIMENT RB_ATTRITION;
CREATE OR REPLACE TABLE MODEL_CHALLENGERS AS
SELECT "run_name" AS RUN_NAME,
       MAX(IFF("name" = 'auc', "value", NULL)) AS AUC,
       MAX(IFF("name" = 'avg_precision', "value", NULL)) AS AVG_PRECISION,
       MAX(IFF("name" = 'lift_top_decile', "value", NULL)) AS LIFT_TOP_DECILE,
       MAX(IFF("name" = 'precision_top_decile', "value", NULL)) AS PRECISION_TOP_DECILE
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) GROUP BY 1;
SELECT c.*, STARTSWITH(i.PURPOSE, SPLIT_PART(c.RUN_NAME, '_1', 1)) AS IS_CHAMPION
FROM MODEL_CHALLENGERS c CROSS JOIN (SELECT PURPOSE FROM MODEL_INVENTORY WHERE IS_DEFAULT) i
ORDER BY AUC DESC;

-- 4. Model card, drafted by AI from the evidence only; a person signs it off
CREATE OR REPLACE TABLE MODEL_CARD AS
SELECT i.MODEL_NAME, i.VERSION,
       AI_COMPLETE('claude-sonnet-4-5',
         'Write a model card in plain English, under 200 words, as short labelled lines (no markdown): Purpose, Permitted use, Data, '
         || 'Performance, Champion vs challenger, Known limitations, Conditions for use. Only state what these facts support. '
         || 'Model ' || i.MODEL_NAME || ' ' || i.VERSION || ' (' || COALESCE(i.FRAMEWORK, 'scikit-learn') || '), AUC ' || ROUND(i.AUC, 3)
         || '. Purpose: ' || i.PURPOSE || '. Permitted use: ' || i.PERMITTED_USE || '. Data: ' || i.TRAINING_DATA
         || '. Predicted vs actual leave rate (%) by group: ' || v.SUMMARY || '. Experiment runs: ' || c.SUMMARY || '.') AS CARD,
       CURRENT_TIMESTAMP() AS DRAFTED_AT
FROM MODEL_INVENTORY i
CROSS JOIN (SELECT LISTAGG(CUT || ' ' || GROUP_NAME || ' ' || PREDICTED_PCT || ' vs ' || ACTUAL_PCT, '; ') AS SUMMARY FROM MODEL_VALIDATION) v
CROSS JOIN (SELECT LISTAGG(RUN_NAME || ' AUC ' || AUC || ' lift ' || LIFT_TOP_DECILE, '; ') AS SUMMARY FROM MODEL_CHALLENGERS) c
WHERE i.IS_DEFAULT;
SELECT CARD FROM MODEL_CARD;

-- 5. Approval: who decided what, with conditions; the inventory status follows the decision
CREATE OR REPLACE TABLE MODEL_APPROVALS (
    MODEL_NAME VARCHAR, VERSION VARCHAR, DECISION VARCHAR, CONDITIONS VARCHAR, APPROVER VARCHAR, DECIDED_AT TIMESTAMP_LTZ
);
INSERT INTO MODEL_APPROVALS
SELECT MODEL_NAME, VERSION, 'APPROVED_WITH_CONDITIONS',
       'Use for ranking only: probabilities run high against actual outcomes, so recalibrate before quoting them. Review quarterly.',
       CURRENT_USER(), CURRENT_TIMESTAMP()
FROM MODEL_INVENTORY WHERE IS_DEFAULT;
UPDATE MODEL_INVENTORY i SET STATUS = a.DECISION FROM MODEL_APPROVALS a WHERE a.MODEL_NAME = i.MODEL_NAME AND a.VERSION = i.VERSION;
SELECT i.MODEL_NAME, i.VERSION, i.STATUS, a.CONDITIONS, a.APPROVER, a.DECIDED_AT
FROM MODEL_INVENTORY i JOIN MODEL_APPROVALS a USING (MODEL_NAME, VERSION);
