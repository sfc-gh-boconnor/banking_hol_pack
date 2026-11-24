-- =====================================================
-- APP0: PLAN AN APP - reference SQL
-- The data behind the APP1 fraud investigator app: outside name mentions with
-- their best candidate customer (no Cortex Search needed), the customer's fraud
-- history, and an empty table the app saves decisions to. Run as HOL_PARTICIPANT.
-- Cortex Code builds the same objects from the APP0 prompts; this is the fallback.
-- =====================================================
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.APPS;

-- 1. The review queue: each outside mention, its best candidate and the evidence.
--    Candidates share the first 3 letters of the surname; score = 50 for date of birth,
--    20 for town, plus 0.3 x name similarity (the same scoring as AI5, without search).
CREATE OR REPLACE TABLE FRAUD_REVIEW_QUEUE COMMENT = 'APP0: outside name mentions matched to customers, for investigator review' AS
WITH m AS (
    SELECT n.*, UPPER(REGEXP_REPLACE(n.NAME_AS_WRITTEN, '^([^,]+), (.+)$', '\\2 \\1')) AS Q
    FROM BANKING_HOL.RAW_DATA.RB_NAME_MENTIONS n),
cand AS (
    SELECT m.MENTION_ID, c.CUSTOMER_ID, c.FIRST_NAME || ' ' || c.LAST_NAME AS CUSTOMER_NAME, c.CITY, c.DATE_OF_BIRTH,
           (c.DATE_OF_BIRTH = TRY_TO_DATE(m.DOB_AS_WRITTEN, 'DD/MM/YYYY') OR c.DATE_OF_BIRTH = TRY_TO_DATE(m.DOB_AS_WRITTEN, 'MM/DD/YYYY')) AS DOB_MATCH,
           UPPER(c.CITY) = UPPER(m.TOWN) AS TOWN_MATCH,
           JAROWINKLER_SIMILARITY(UPPER(c.FIRST_NAME || ' ' || c.LAST_NAME), m.Q) AS NAME_SIM
    FROM m JOIN BANKING_HOL.RAW_DATA.RB_CUSTOMERS c ON LEFT(UPPER(c.LAST_NAME), 3) = LEFT(SPLIT_PART(m.Q, ' ', -1), 3)),
best AS (
    SELECT *, 50 * COALESCE(DOB_MATCH::INT, 0) + 20 * COALESCE(TOWN_MATCH::INT, 0) + 0.3 * NAME_SIM AS SCORE
    FROM cand QUALIFY ROW_NUMBER() OVER (PARTITION BY MENTION_ID ORDER BY SCORE DESC) = 1)
SELECT m.MENTION_ID, m.SOURCE, m.SOURCE_DESCRIPTION, m.NAME_AS_WRITTEN, m.DOB_AS_WRITTEN, m.TOWN,
       b.CUSTOMER_ID AS CANDIDATE_CUSTOMER_ID, b.CUSTOMER_NAME AS CANDIDATE_NAME, b.CITY AS CANDIDATE_CITY, b.DATE_OF_BIRTH AS CANDIDATE_DOB,
       b.DOB_MATCH, b.TOWN_MATCH, ROUND(b.NAME_SIM) AS NAME_SIM, ROUND(b.SCORE) AS SCORE,
       CASE WHEN b.SCORE >= 75 THEN 'MATCH' WHEN b.SCORE >= 45 THEN 'REVIEW' ELSE 'NO_MATCH' END AS SUGGESTED,
       (SELECT COUNT(*) FROM BANKING_HOL.RAW_DATA.RB_FRAUD_CASES f WHERE f.CUSTOMER_ID = b.CUSTOMER_ID) AS CANDIDATE_FRAUD_CASES
FROM m LEFT JOIN best b USING (MENTION_ID);

-- 2. Where the app saves what the investigator decided (one row per decision; the latest wins)
CREATE TABLE IF NOT EXISTS MATCH_DECISIONS (
    MENTION_ID   VARCHAR,
    CUSTOMER_ID  VARCHAR,
    DECISION     VARCHAR COMMENT 'CONFIRMED, REJECTED or ESCALATED',
    NOTE         VARCHAR,
    DECIDED_BY   VARCHAR COMMENT 'The app viewer (st.user), not the app owner',
    DECIDED_AT   TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP()
) COMMENT = 'APP1: investigator decisions saved by the FRAUD_INVESTIGATOR app';

-- What the app will show first: the queue by suggested decision
SELECT SUGGESTED, COUNT(*) AS MENTIONS, COUNT_IF(CANDIDATE_FRAUD_CASES > 0) AS WITH_FRAUD_HISTORY
FROM FRAUD_REVIEW_QUEUE GROUP BY 1 ORDER BY 1;
