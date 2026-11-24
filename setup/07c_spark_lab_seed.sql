-- =====================================================
-- 07c: The raw feed for DE4 (Spark on Snowflake).
--
-- PAYMENT_STATUS_UPDATES is what a payment engine sends after a payment is
-- created: one row per status change, landed in batches. Like a real feed it
-- is messy, on purpose:
--   * duplicates: the same event delivered twice (same EVENT_ID)
--   * late arrivals: an older event landed after a newer one (LOADED_AT order
--     differs from EVENT_TS order), so "last loaded" is not "latest status"
--   * bad rows: no payment id, an unknown status, or a payment we don't have
-- Deterministic: the same rows on every run. The attendee's PySpark pipeline
-- cleans it, merges it over the Iceberg payments and reconciles the result.
-- =====================================================
USE ROLE HOL_ADMIN;
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.SPARK_LAB
  COMMENT = 'DE4: Spark on Snowflake. The raw status feed and the tables the attendee pipeline writes';
USE SCHEMA BANKING_HOL.SPARK_LAB;

CREATE OR REPLACE TABLE PAYMENT_STATUS_UPDATES (
    EVENT_ID   VARCHAR,
    PAYMENT_ID VARCHAR,
    STATUS     VARCHAR,
    ERROR_CODE VARCHAR,
    EVENT_TS   TIMESTAMP_NTZ,
    LOADED_AT  TIMESTAMP_NTZ,
    SOURCE_SYSTEM VARCHAR
) COMMENT = 'DE4 bronze: payment status changes from the payment engine, with duplicates, late arrivals and bad rows';

INSERT INTO PAYMENT_STATUS_UPDATES
WITH inflight AS (
    -- payments still PENDING in the source, plus a slice of the others, get status changes
    SELECT PAYMENT_ID, PAYMENT_DATE, STATUS, ABS(HASH(PAYMENT_ID, 'de4')) AS H
    FROM BANKING_HOL.RAW_DATA.PAYMENTS
    WHERE STATUS = 'PENDING' OR ABS(HASH(PAYMENT_ID, 'de4')) % 100 < 8
),
events AS (
    -- first change: accepted by the scheme
    SELECT PAYMENT_ID, 1 AS SEQ, 'PROCESSING' AS STATUS, NULL AS ERROR_CODE,
           DATEADD(second, 5 + H % 50, PAYMENT_DATE) AS EVENT_TS, H FROM inflight
    UNION ALL
    -- final status: most complete, some fail or are returned
    SELECT PAYMENT_ID, 2,
           CASE WHEN H % 100 < 82 THEN 'COMPLETED' WHEN H % 100 < 93 THEN 'FAILED' ELSE 'RETURNED' END,
           CASE WHEN H % 100 BETWEEN 82 AND 92 THEN ARRAY_CONSTRUCT('AM04', 'AC04', 'MS03', 'FF01')[H % 4]::VARCHAR END,
           DATEADD(second, 60 + H % 3600, PAYMENT_DATE), H FROM inflight
)
SELECT 'EV' || LPAD(ROW_NUMBER() OVER (ORDER BY PAYMENT_ID, SEQ), 7, '0') AS EVENT_ID,
       PAYMENT_ID, STATUS, ERROR_CODE, EVENT_TS,
       -- landed in hourly batches; 1 in 12 final statuses arrived before their PROCESSING event (late arrival)
       IFF(SEQ = 1 AND H % 12 = 0, DATEADD(hour, 3, EVENT_TS), DATEADD(minute, 10 + H % 50, EVENT_TS)) AS LOADED_AT,
       'PAYMENT_ENGINE'
FROM events;

-- duplicates: about 1 in 20 events delivered twice, an hour later, same EVENT_ID
INSERT INTO PAYMENT_STATUS_UPDATES
SELECT EVENT_ID, PAYMENT_ID, STATUS, ERROR_CODE, EVENT_TS, DATEADD(hour, 1, LOADED_AT), SOURCE_SYSTEM
FROM PAYMENT_STATUS_UPDATES WHERE ABS(HASH(EVENT_ID)) % 20 = 0;

-- bad rows the pipeline must quarantine, not load
INSERT INTO PAYMENT_STATUS_UPDATES
SELECT 'EVX' || LPAD(SEQ4(), 5, '0'),
       CASE WHEN SEQ4() % 3 = 0 THEN NULL WHEN SEQ4() % 3 = 1 THEN 'PAY-UNKNOWN-' || SEQ4() ELSE 'PAY000001' END,
       IFF(SEQ4() % 3 = 2, 'SETTLED??', 'COMPLETED'), NULL,
       '2026-11-20 09:00:00'::TIMESTAMP_NTZ, '2026-11-20 10:00:00'::TIMESTAMP_NTZ, 'PAYMENT_ENGINE'
FROM TABLE(GENERATOR(ROWCOUNT => 60));

GRANT USAGE ON SCHEMA BANKING_HOL.SPARK_LAB TO ROLE HOL_PARTICIPANT;
GRANT CREATE TABLE, CREATE VIEW, CREATE STAGE, CREATE TASK, CREATE ALERT ON SCHEMA BANKING_HOL.SPARK_LAB TO ROLE HOL_PARTICIPANT;
GRANT SELECT ON TABLE PAYMENT_STATUS_UPDATES TO ROLE HOL_PARTICIPANT;

SELECT COUNT(*) AS EVENTS, COUNT(DISTINCT EVENT_ID) AS DISTINCT_EVENTS, COUNT(DISTINCT PAYMENT_ID) AS PAYMENTS,
       COUNT_IF(PAYMENT_ID IS NULL OR STATUS NOT IN ('PROCESSING', 'COMPLETED', 'FAILED', 'RETURNED')) AS BAD_ROWS
FROM PAYMENT_STATUS_UPDATES;
