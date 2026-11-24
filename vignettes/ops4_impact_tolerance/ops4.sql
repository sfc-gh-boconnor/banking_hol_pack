-- =====================================================
-- OPS4: Stay inside impact tolerance (solution / catch-up)
-- Operational resilience: an important business service, its impact tolerance, and a
-- Snowflake Alert that escalates a breach before the tolerance is reached.
-- Run as HOL_PARTICIPANT. Writes only to BANKING_HOL.ANALYTICS; nothing is emailed.
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ANALYTICS;

-- 1. The important business services and their impact tolerances, as data
CREATE OR REPLACE TABLE IMPORTANT_BUSINESS_SERVICES (
    SERVICE                VARCHAR,
    PAYMENT_TYPE           VARCHAR,
    IMPACT_TOLERANCE       VARCHAR,
    CUTOFF_UK              TIME,      -- the payment must settle before this, UK time
    ESCALATE_MINUTES_BEFORE NUMBER,   -- escalate while there is still this much time to act
    OWNER                  VARCHAR
);
INSERT INTO IMPORTANT_BUSINESS_SERVICES VALUES
  ('Make a high-value same-day payment', 'CHAPS', 'Settled before the 18:00 CHAPS cut-off on the day it is sent', '18:00', 60, 'Head of Payments Operations'),
  ('Make a real-time payment', 'FASTER_PAYMENTS', 'Back within 2 hours of a disruption', '23:59', 120, 'Head of Payments Operations');

-- 2. Payments in flight today (the lab's sources are read-only, so tests go here)
CREATE OR REPLACE TABLE PAYMENTS_IN_FLIGHT (
    PAYMENT_ID         VARCHAR,
    RECEIVED_AT        TIMESTAMP_NTZ,
    PAYMENT_TYPE       VARCHAR,
    CLIENT_NAME        VARCHAR,
    AMOUNT_GBP         NUMBER(15, 2),
    STATUS             VARCHAR,
    PROCESSING_TIME_MS NUMBER
);

-- 3. Breaches against tolerance: in flight past the scheme's limit, not yet escalated
CREATE OR REPLACE TABLE ESCALATIONS (
    ESCALATION_ID VARCHAR, RAISED_AT TIMESTAMP_LTZ, PAYMENT_ID VARCHAR, SERVICE VARCHAR,
    MINUTES_TO_CUTOFF NUMBER, OWNER VARCHAR, MESSAGE VARCHAR
);
CREATE OR REPLACE VIEW V_TOLERANCE_BREACHES AS
WITH now_uk AS (SELECT CONVERT_TIMEZONE('Europe/London', CURRENT_TIMESTAMP())::TIMESTAMP_NTZ AS T)
SELECT p.PAYMENT_ID, p.PAYMENT_TYPE, p.CLIENT_NAME, p.AMOUNT_GBP, p.PROCESSING_TIME_MS, s.MAX_PROCESSING_TIME_MS,
       b.SERVICE, b.IMPACT_TOLERANCE, b.OWNER,
       DATEDIFF(minute, n.T, TIMESTAMP_NTZ_FROM_PARTS(n.T::DATE, b.CUTOFF_UK)) AS MINUTES_TO_CUTOFF
FROM PAYMENTS_IN_FLIGHT p
JOIN BANKING_HOL.RAW_DATA.SLA_DEFINITIONS s ON s.PAYMENT_TYPE = p.PAYMENT_TYPE
JOIN IMPORTANT_BUSINESS_SERVICES b ON b.PAYMENT_TYPE = p.PAYMENT_TYPE
CROSS JOIN now_uk n
WHERE p.STATUS IN ('PENDING', 'FAILED') AND p.PROCESSING_TIME_MS > s.MAX_PROCESSING_TIME_MS
  AND NOT EXISTS (SELECT 1 FROM ESCALATIONS e WHERE e.PAYMENT_ID = p.PAYMENT_ID);

-- 4. The escalation: one row per breach, then the alert switches itself off until the next test
CREATE OR REPLACE PROCEDURE RAISE_ESCALATIONS()
RETURNS VARCHAR
LANGUAGE SQL
AS
$$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO BANKING_HOL.ANALYTICS.ESCALATIONS
  SELECT 'ESC-' || SUBSTR(PAYMENT_ID, 1, 20), CURRENT_TIMESTAMP(), PAYMENT_ID, SERVICE, MINUTES_TO_CUTOFF, OWNER,
         CLIENT_NAME || ': ' || PAYMENT_TYPE || ' of GBP ' || TRIM(TO_CHAR(AMOUNT_GBP, '999,999,990')) || ' held past its limit. Service "'
         || SERVICE || '": ' || IFF(MINUTES_TO_CUTOFF > 0, MINUTES_TO_CUTOFF || ' minutes to the cut-off.', 'cut-off passed: impact tolerance breached.')
  FROM BANKING_HOL.ANALYTICS.V_TOLERANCE_BREACHES;
  n := SQLROWCOUNT;
  ALTER ALERT BANKING_HOL.ANALYTICS.ALERT_IMPACT_TOLERANCE SUSPEND;
  RETURN n || ' escalation(s) raised';
END;
$$;

-- 5. The Snowflake Alert: checks every minute while switched on
CREATE OR REPLACE ALERT ALERT_IMPACT_TOLERANCE
  WAREHOUSE = BANKING_WH
  SCHEDULE = '1 MINUTE'
  IF (EXISTS (SELECT PAYMENT_ID, SERVICE, MINUTES_TO_CUTOFF FROM BANKING_HOL.ANALYTICS.V_TOLERANCE_BREACHES))
  THEN CALL BANKING_HOL.ANALYTICS.RAISE_ESCALATIONS();

-- 6. Test it: a stuck GBP 250,000 CHAPS payment, then switch the alert on
INSERT INTO PAYMENTS_IN_FLIGHT
SELECT 'TEST-' || UPPER(LEFT(REPLACE(UUID_STRING(), '-', ''), 10)), CURRENT_TIMESTAMP()::TIMESTAMP_NTZ, 'CHAPS', 'Liverpool Freight', 250000, 'PENDING', 9000;
ALTER ALERT ALERT_IMPACT_TOLERANCE RESUME;

-- About a minute later: TRIGGERED, one escalation, and the alert suspended again
SELECT NAME, STATE, SCHEDULED_TIME, SQL_ERROR_MESSAGE
FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.ALERT_HISTORY(SCHEDULED_TIME_RANGE_START => DATEADD(hour, -1, CURRENT_TIMESTAMP())))
WHERE NAME = 'ALERT_IMPACT_TOLERANCE' ORDER BY SCHEDULED_TIME DESC;
SELECT * FROM ESCALATIONS ORDER BY RAISED_AT DESC;
