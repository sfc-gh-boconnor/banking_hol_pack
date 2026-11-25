-- =====================================================
-- DE4: Spark on Snowflake - reference SQL
-- Run as HOL_PARTICIPANT. The PySpark itself is in de4_pipeline.py
-- (the batch job) and notebooks/de4_spark_on_snowflake.ipynb (interactive).
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.SPARK_LAB;

-- -----------------------------------------------------
-- DE4.1 The raw feed: duplicates, late arrivals and bad rows
-- -----------------------------------------------------
SELECT COUNT(*) AS EVENTS, COUNT(DISTINCT EVENT_ID) AS DISTINCT_EVENTS,
       COUNT(*) - COUNT(DISTINCT EVENT_ID) AS DUPLICATE_DELIVERIES,
       COUNT_IF(PAYMENT_ID IS NULL) AS NO_PAYMENT_ID
FROM PAYMENT_STATUS_UPDATES;

-- -----------------------------------------------------
-- DE4.4 Run the pipeline as a batch job, straight from the lab's git repo.
-- No cluster: it runs on the session warehouse. The query ID is the job ID.
-- -----------------------------------------------------
EXECUTE CODE BUNDLE FROM '@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/de4_spark_on_snowflake'
  ENTRYPOINT = 'de4_pipeline.py'
  ARGUMENTS = ('--schema', 'BANKING_HOL.SPARK_LAB', '--app-name', 'payments_nightly')
  EXECUTION_NAME = 'payments_nightly'
  WITH SPECIFICATION $$
bundle:
  type: spark
  compute_type: warehouse
  language: python
  compute_options: {}
$$;

SELECT * FROM PIPELINE_RECONCILIATION ORDER BY CHECKED_AT DESC;
SELECT REJECT_REASON, COUNT(*) AS ROWS_HELD FROM PAYMENT_UPDATES_QUARANTINE GROUP BY 1;
SELECT * FROM FAILED_PAYMENTS_BY_SCHEME ORDER BY PAYMENTS DESC;

-- -----------------------------------------------------
-- DE4.5 Schedule it: a task runs the same statement every night
-- -----------------------------------------------------
CREATE OR REPLACE TASK PAYMENTS_NIGHTLY_SPARK
  WAREHOUSE = BANKING_WH
  SCHEDULE = 'USING CRON 0 2 * * * Europe/London'
  COMMENT = 'DE4: nightly PySpark payments pipeline'
AS
  EXECUTE CODE BUNDLE FROM '@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/de4_spark_on_snowflake'
    ENTRYPOINT = 'de4_pipeline.py'
    ARGUMENTS = ('--schema', 'BANKING_HOL.SPARK_LAB', '--app-name', 'payments_nightly')
    EXECUTION_NAME = 'payments_nightly'
    WITH SPECIFICATION $$
bundle:
  type: spark
  compute_type: warehouse
  language: python
  compute_options: {}
$$;
ALTER TASK PAYMENTS_NIGHTLY_SPARK RESUME;

-- -----------------------------------------------------
-- DE4.6 Break it: upstream renamed the feed. The run fails, and the error
-- is in Monitoring > Spark > Batch Jobs (and CODE_BUNDLE_HISTORY).
-- -----------------------------------------------------
-- (wrapped so the expected failure doesn't stop the rest of this file; the reason is returned)
EXECUTE IMMEDIATE $$
BEGIN
  EXECUTE CODE BUNDLE FROM '@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/de4_spark_on_snowflake'
    ENTRYPOINT = 'de4_pipeline.py'
    ARGUMENTS = ('--schema', 'BANKING_HOL.SPARK_LAB', '--source', 'PAYMENT_STATUS_UPDATES_V2', '--app-name', 'payments_nightly_broken')
    EXECUTION_NAME = 'payments_nightly_broken'
    WITH SPECIFICATION '
bundle:
  type: spark
  compute_type: warehouse
  language: python
  compute_options: {}
';
  RETURN 'Unexpected: the broken run succeeded';
EXCEPTION
  WHEN OTHER THEN RETURN 'Failed as intended: ' || LEFT(SQLERRM, 300);
END;
$$;

-- -----------------------------------------------------
-- DE4.7 The data behind Monitoring > Spark, as SQL
-- -----------------------------------------------------
SELECT NAME, MODE, OWNER, EXECUTION_STATUS, CREATED_ON,
       DATEDIFF('second', STARTED_ON, COMPLETED_ON) AS SECONDS, ERROR_CODE
FROM TABLE(SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY(
    CREATION_TIME_START => DATEADD('day', -1, CURRENT_TIMESTAMP()), RESULT_LIMIT => 100))
ORDER BY CREATED_ON DESC;

-- why it failed: the job's ERROR logs in the event table
SELECT e.TIMESTAMP, e.RECORD['severity_text']::STRING AS SEVERITY, LEFT(e.VALUE::STRING, 300) AS MESSAGE
FROM SNOWFLAKE.TELEMETRY.EVENTS_VIEW e
WHERE e.TIMESTAMP > DATEADD('hour', -2, SYSDATE())
  AND e.RECORD_TYPE = 'LOG' AND e.RECORD['severity_text']::STRING IN ('ERROR', 'FATAL')
  AND e.RESOURCE_ATTRIBUTES['snow.query.id']::STRING = (
      SELECT EXECUTE_QUERY_ID FROM TABLE(SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY(RESULT_LIMIT => 100))
      WHERE NAME ILIKE '%payments_nightly_broken%' ORDER BY CREATED_ON DESC LIMIT 1)
ORDER BY e.TIMESTAMP;

-- -----------------------------------------------------
-- DE4.8 Alert on failed Spark jobs: every 5 minutes, record new failures
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS SPARK_JOB_FAILURES (
    APPLICATION_ID VARCHAR, NAME VARCHAR, MODE VARCHAR, OWNER VARCHAR,
    COMPLETED_ON TIMESTAMP_LTZ, ERROR_CODE VARCHAR, RECORDED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP());

CREATE OR REPLACE ALERT SPARK_JOB_FAILURE_ALERT
  WAREHOUSE = BANKING_WH
  SCHEDULE = '5 MINUTE'
  IF (EXISTS (
    SELECT ID, NAME, MODE, OWNER, COMPLETED_ON, ERROR_CODE
    FROM TABLE(SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY(
        CREATION_TIME_START => DATEADD('day', -1, SNOWFLAKE.ALERT.SCHEDULED_TIME()), RESULT_LIMIT => 10000))
    WHERE EXECUTION_STATUS = 'FAILED' AND MODE <> 'SCOS_CLIENT'
      AND ID NOT IN (SELECT APPLICATION_ID FROM BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURES)))
  THEN
    INSERT INTO BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURES (APPLICATION_ID, NAME, MODE, OWNER, COMPLETED_ON, ERROR_CODE)
    SELECT ID, NAME, MODE, OWNER, COMPLETED_ON, ERROR_CODE
    FROM TABLE(RESULT_SCAN(SNOWFLAKE.ALERT.GET_CONDITION_QUERY_UUID()));
ALTER ALERT SPARK_JOB_FAILURE_ALERT RESUME;
EXECUTE ALERT SPARK_JOB_FAILURE_ALERT;  -- don't wait 5 minutes

SELECT * FROM SPARK_JOB_FAILURES ORDER BY RECORDED_AT DESC;
