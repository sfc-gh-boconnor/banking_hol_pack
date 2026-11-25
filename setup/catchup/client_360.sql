-- =====================================================
-- BANKING HOL PACK - CATCH-UP SCRIPT
-- CLIENT 360 SEMANTIC VIEW (what DA1 builds)
--
-- Run this if you skipped DA1 and your module needs SV_CLIENT_360
-- (OPS1, AI1, AI2, AI3). Safe to re-run.
--   1. Creates the staging views and FEEDBACK_ENRICHED only if they are missing,
--      so it keeps anything DE1 (dbt) or DA2 (AI enrichment) already built.
--      Scoring FEEDBACK_ENRICHED calls AI_SENTIMENT and AI_CLASSIFY once per
--      feedback row (about 2,000 rows).
--   2. Builds DA1's contract views and the semantic view SV_CLIENT_360.
-- Keep sections 1 and 2 in step with core_analytics.sql and da1.sql.
-- =====================================================

USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;   -- see exactly what an attendee sees
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ANALYTICS;

-- =====================================================
-- 1. Analytics layer, only what is missing
-- =====================================================
-- ---------- Staging views ----------
CREATE VIEW IF NOT EXISTS STG_PAYMENTS AS
SELECT
    PAYMENT_ID,
    PAYMENT_DATE::TIMESTAMP                             AS PAYMENT_DATE,
    DATE_TRUNC('DAY', PAYMENT_DATE::TIMESTAMP)          AS PAYMENT_DAY,
    ORIGINATOR_ACCOUNT_ID,
    BENEFICIARY_ACCOUNT_ID,
    UPPER(TRIM(PAYMENT_TYPE))                           AS PAYMENT_TYPE,
    UPPER(TRIM(CHANNEL))                                AS CHANNEL,
    UPPER(TRIM(CURRENCY))                               AS CURRENCY,
    AMOUNT::NUMBER(15,2)                                AS AMOUNT,
    FX_RATE,
    UPPER(TRIM(STATUS))                                 AS STATUS,
    PROCESSING_TIME_MS::NUMBER                          AS PROCESSING_TIME_MS,
    ERROR_CODE,
    UPPER(TRIM(REGION))                                 AS REGION,
    SETTLEMENT_DATE,
    CASE WHEN STATUS = 'COMPLETED' THEN TRUE ELSE FALSE END  AS IS_SUCCESSFUL,
    CASE WHEN STATUS = 'FAILED'    THEN TRUE ELSE FALSE END  AS IS_FAILED,
    CASE WHEN ERROR_CODE IS NOT NULL THEN TRUE ELSE FALSE END AS HAS_ERROR
FROM BANKING_HOL.RAW_DATA.PAYMENTS;

CREATE VIEW IF NOT EXISTS STG_FEEDBACK AS
SELECT
    FEEDBACK_ID,
    FEEDBACK_DATE::TIMESTAMP            AS FEEDBACK_DATE,
    DATE_TRUNC('DAY', FEEDBACK_DATE)    AS FEEDBACK_DAY,
    CUSTOMER_ID,
    PAYMENT_ID,
    UPPER(TRIM(FEEDBACK_CHANNEL))       AS FEEDBACK_CHANNEL,
    TRIM(FEEDBACK_TEXT)                 AS FEEDBACK_TEXT,
    UPPER(TRIM(PAYMENT_TYPE))           AS PAYMENT_TYPE,
    RATING::NUMBER(1)                   AS RATING,
    LENGTH(TRIM(FEEDBACK_TEXT))         AS FEEDBACK_LENGTH,
    CASE WHEN RATING >= 4 THEN 'SATISFIED'
         WHEN RATING = 3  THEN 'NEUTRAL'
         ELSE 'DISSATISFIED' END        AS SATISFACTION_TIER
FROM BANKING_HOL.RAW_DATA.CUSTOMER_FEEDBACK
WHERE FEEDBACK_TEXT IS NOT NULL AND LENGTH(TRIM(FEEDBACK_TEXT)) > 0;

CREATE VIEW IF NOT EXISTS STG_CUSTOMERS AS
SELECT
    c.CUSTOMER_ID,
    UPPER(TRIM(c.CUSTOMER_NAME))        AS CUSTOMER_NAME,
    UPPER(TRIM(c.SECTOR))               AS SECTOR,
    c.COUNTRY,
    c.ONBOARDING_DATE,
    UPPER(TRIM(c.KYC_STATUS))           AS KYC_STATUS,
    c.RM_ID,
    r.RM_NAME,
    r.TEAM                              AS RM_TEAM,
    r.REGION                            AS RM_REGION
FROM BANKING_HOL.RAW_DATA.CUSTOMERS c
LEFT JOIN BANKING_HOL.RAW_DATA.RELATIONSHIP_MANAGERS r ON c.RM_ID = r.RM_ID;

CREATE VIEW IF NOT EXISTS STG_ACCOUNTS AS
SELECT
    a.ACCOUNT_ID, a.CUSTOMER_ID, a.SORT_CODE, a.ACCOUNT_NUMBER, a.IBAN, a.BIC,
    UPPER(TRIM(a.CURRENCY))             AS CURRENCY,
    UPPER(TRIM(a.ACCOUNT_TYPE))         AS ACCOUNT_TYPE,
    UPPER(TRIM(a.STATUS))               AS STATUS,
    a.OPENED_DATE,
    c.CUSTOMER_NAME,
    c.SECTOR                            AS CUSTOMER_SECTOR
FROM BANKING_HOL.RAW_DATA.ACCOUNTS a
LEFT JOIN BANKING_HOL.RAW_DATA.CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID;

-- ---------- AI enrichment (skipped if DA2 or core_analytics.sql already built it) ----------
CREATE TABLE IF NOT EXISTS FEEDBACK_ENRICHED AS
WITH ai_scored AS (
    SELECT f.*, c.CUSTOMER_NAME, c.SECTOR AS CUSTOMER_SECTOR, c.RM_NAME,
           -- AI_SENTIMENT returns a label, so map the overall label to -1, 0 or 1
           -- (legacy SNOWFLAKE.CORTEX.SENTIMENT is blocked on new accounts)
           DECODE(GET(FILTER(AI_SENTIMENT(f.FEEDBACK_TEXT):categories, c -> c:name::STRING = 'overall'), 0):sentiment::STRING,
                  'positive', 1, 'negative', -1, 0)::FLOAT AS SENTIMENT_SCORE,
           AI_CLASSIFY(f.FEEDBACK_TEXT,
               ['Performance Issue','Service Quality','Technical Problem',
                'Positive Experience','Feature Request']) AS CLASSIFICATION_RESULT
    FROM STG_FEEDBACK f
    LEFT JOIN STG_CUSTOMERS c ON f.CUSTOMER_ID = c.CUSTOMER_ID
)
SELECT FEEDBACK_ID, FEEDBACK_DATE, CUSTOMER_ID, CUSTOMER_NAME, CUSTOMER_SECTOR, RM_NAME,
       PAYMENT_ID, FEEDBACK_CHANNEL, FEEDBACK_TEXT, PAYMENT_TYPE, RATING, SENTIMENT_SCORE,
       CASE WHEN SENTIMENT_SCORE >  0.3 THEN 'POSITIVE'
            WHEN SENTIMENT_SCORE < -0.3 THEN 'NEGATIVE'
            ELSE 'NEUTRAL' END                      AS SENTIMENT_LABEL,
       CLASSIFICATION_RESULT:labels[0]::STRING      AS TOPIC_CATEGORY
FROM ai_scored;

-- =====================================================
-- 2. DA1: contract views and SV_CLIENT_360
-- =====================================================
-- -----------------------------------------------------
-- DA1.1 Stable interface views (semantic views should sit on contracts, not raw)
-- -----------------------------------------------------
CREATE OR REPLACE VIEW V_CLIENT_PAYMENT_SUMMARY
    COMMENT = 'One row per corporate client: payment volumes, success and latency'
AS
SELECT c.CUSTOMER_ID,
       COUNT(*)                                                     AS TOTAL_PAYMENTS,
       COUNT_IF(p.IS_SUCCESSFUL)                                    AS SUCCESSFUL_PAYMENTS,
       COUNT_IF(p.IS_FAILED)                                        AS FAILED_PAYMENTS,
       SUM(p.AMOUNT)                                                AS TOTAL_VOLUME_GBP,
       SUM(IFF(p.IS_FAILED, p.AMOUNT, 0))                           AS FAILED_VOLUME_GBP,
       ROUND(AVG(p.PROCESSING_TIME_MS), 0)                          AS AVG_PROCESSING_TIME_MS,
       MAX(p.PAYMENT_DATE)                                          AS LAST_PAYMENT_DATE
FROM STG_PAYMENTS p
JOIN STG_ACCOUNTS  a ON p.ORIGINATOR_ACCOUNT_ID = a.ACCOUNT_ID
JOIN STG_CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
GROUP BY c.CUSTOMER_ID;

CREATE OR REPLACE VIEW V_CLIENT_ALERTS
    COMMENT = 'Operational alerts attributed to the originating corporate client'
AS
SELECT al.ALERT_ID, a.CUSTOMER_ID, al.ALERT_TIME::TIMESTAMP AS ALERT_TIME,
       al.SEVERITY, al.PAYMENT_TYPE, al.STATUS AS ALERT_STATUS,
       al.ASSIGNED_TO, al.RESOLUTION_TIME_MIN, al.ALERT_DESCRIPTION
FROM BANKING_HOL.RAW_DATA.OPERATIONAL_ALERTS al
JOIN BANKING_HOL.RAW_DATA.PAYMENTS p ON al.PAYMENT_ID = p.PAYMENT_ID
JOIN BANKING_HOL.RAW_DATA.ACCOUNTS a ON p.ORIGINATOR_ACCOUNT_ID = a.ACCOUNT_ID;

-- -----------------------------------------------------
-- DA1.2 The semantic view: business names, relationships, metrics, synonyms
-- Tip: you can also build this in Snowsight (AI & ML > Cortex Analyst > Create)
-- or ask CoCo: "Create a semantic view over STG_CUSTOMERS, V_CLIENT_PAYMENT_SUMMARY,
-- FEEDBACK_ENRICHED and V_CLIENT_ALERTS joined on CUSTOMER_ID."
-- -----------------------------------------------------
CREATE OR REPLACE SEMANTIC VIEW SV_CLIENT_360

  TABLES (
    clients AS BANKING_HOL.ANALYTICS.STG_CUSTOMERS
      PRIMARY KEY (CUSTOMER_ID)
      WITH SYNONYMS = ('customers', 'corporate clients', 'accounts')
      COMMENT = 'Corporate banking clients with KYC status and assigned relationship manager',
    payments AS BANKING_HOL.ANALYTICS.V_CLIENT_PAYMENT_SUMMARY
      PRIMARY KEY (CUSTOMER_ID)
      COMMENT = 'Payment activity summary per client',
    feedback AS BANKING_HOL.ANALYTICS.FEEDBACK_ENRICHED
      PRIMARY KEY (FEEDBACK_ID)
      WITH SYNONYMS = ('complaints', 'customer feedback', 'sentiment')
      COMMENT = 'Client feedback with AI sentiment and topic',
    alerts AS BANKING_HOL.ANALYTICS.V_CLIENT_ALERTS
      PRIMARY KEY (ALERT_ID)
      WITH SYNONYMS = ('incidents', 'operational alerts')
      COMMENT = 'Operational payment alerts per client'
  )

  RELATIONSHIPS (
    payments_to_clients AS payments (CUSTOMER_ID) REFERENCES clients,
    feedback_to_clients AS feedback (CUSTOMER_ID) REFERENCES clients,
    alerts_to_clients   AS alerts   (CUSTOMER_ID) REFERENCES clients
  )

  FACTS (
    payments.total_payments      AS TOTAL_PAYMENTS,
    payments.successful_payments AS SUCCESSFUL_PAYMENTS,
    payments.failed_payments     AS FAILED_PAYMENTS,
    payments.total_volume_gbp    AS TOTAL_VOLUME_GBP,
    payments.failed_volume_gbp   AS FAILED_VOLUME_GBP,
    feedback.sentiment_score     AS SENTIMENT_SCORE,
    feedback.rating              AS RATING,
    alerts.resolution_time_min   AS RESOLUTION_TIME_MIN
  )

  DIMENSIONS (
    clients.customer_name AS CUSTOMER_NAME
      WITH SYNONYMS = ('client', 'client name', 'company')
      COMMENT = 'Registered legal entity name (upper case)',
    clients.sector        AS SECTOR WITH SYNONYMS = ('industry'),
    clients.country       AS COUNTRY COMMENT = 'ISO alpha-3 country code',
    clients.kyc_status    AS KYC_STATUS COMMENT = 'APPROVED, PENDING_REVIEW, EXPIRED',
    clients.rm_name       AS RM_NAME WITH SYNONYMS = ('relationship manager', 'RM', 'banker'),
    clients.rm_team       AS RM_TEAM COMMENT = 'Corporate, Institutional or SME banking team',
    feedback.sentiment_label AS SENTIMENT_LABEL COMMENT = 'POSITIVE, NEUTRAL, NEGATIVE',
    feedback.topic_category  AS TOPIC_CATEGORY,
    feedback.feedback_payment_type AS PAYMENT_TYPE COMMENT = 'Payment scheme the feedback refers to',
    feedback.feedback_date   AS FEEDBACK_DATE,
    alerts.severity       AS SEVERITY COMMENT = 'LOW, MEDIUM, HIGH, CRITICAL',
    alerts.alert_status   AS ALERT_STATUS COMMENT = 'OPEN, ACKNOWLEDGED, INVESTIGATING, RESOLVED',
    alerts.alert_time     AS ALERT_TIME
  )

  METRICS (
    payments.payment_count     AS SUM(payments.total_payments) WITH SYNONYMS = ('number of payments'),
    payments.payment_volume    AS SUM(payments.total_volume_gbp) WITH SYNONYMS = ('volume', 'value'),
    payments.failed_volume     AS SUM(payments.failed_volume_gbp) WITH SYNONYMS = ('value at risk'),
    payments.success_rate_pct  AS ROUND(SUM(payments.successful_payments) / NULLIF(SUM(payments.total_payments), 0) * 100, 2)
      COMMENT = 'Weighted payment success rate %',
    feedback.avg_sentiment     AS ROUND(AVG(feedback.sentiment_score), 3),
    feedback.negative_feedback_count AS COUNT_IF(feedback.sentiment_label = 'NEGATIVE'),
    alerts.open_alert_count    AS COUNT_IF(alerts.alert_status <> 'RESOLVED') WITH SYNONYMS = ('open incidents'),
    alerts.critical_alert_count AS COUNT_IF(alerts.severity = 'CRITICAL'),
    alerts.avg_resolution_min  AS ROUND(AVG(alerts.resolution_time_min), 0)
  )

  COMMENT = 'Corporate Client 360 for Payments Operations: payments health, feedback sentiment and operational alerts per client'

  AI_SQL_GENERATION 'Client names are stored in upper case; match them case-insensitively with ILIKE. Round percentages to 1 decimal place.'

  AI_VERIFIED_QUERIES (
    worst_clients AS (
      QUESTION 'Which 5 clients have the lowest payment success rate?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT c.CUSTOMER_NAME, ROUND(SUM(p.SUCCESSFUL_PAYMENTS) / NULLIF(SUM(p.TOTAL_PAYMENTS), 0) * 100, 2) AS success_rate_pct
           FROM BANKING_HOL.ANALYTICS.V_CLIENT_PAYMENT_SUMMARY p
           JOIN BANKING_HOL.ANALYTICS.STG_CUSTOMERS c ON p.CUSTOMER_ID = c.CUSTOMER_ID
           GROUP BY c.CUSTOMER_NAME ORDER BY success_rate_pct ASC LIMIT 5'
    ),
    rm_open_alerts AS (
      QUESTION 'How many open alerts does each relationship manager have across their clients?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT c.RM_NAME, COUNT_IF(a.ALERT_STATUS <> ''RESOLVED'') AS open_alerts
           FROM BANKING_HOL.ANALYTICS.V_CLIENT_ALERTS a
           JOIN BANKING_HOL.ANALYTICS.STG_CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
           GROUP BY c.RM_NAME ORDER BY open_alerts DESC'
    )
  );

SELECT 'Client 360 catch-up complete' AS STATUS,
       (SELECT COUNT(*) FROM V_CLIENT_PAYMENT_SUMMARY) AS CLIENTS,
       (SELECT COUNT(*) FROM FEEDBACK_ENRICHED)        AS FEEDBACK_ROWS;
