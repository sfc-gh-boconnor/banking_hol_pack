-- =====================================================
-- BANKING HOL PACK - FACILITATOR SETUP
-- STEP 11b: CATCH-UP RUNNER
--
-- Lets an attendee fast-forward past a module they skipped. The Lab Companion's
-- "Fast-forward" button calls LAB.RUN_CATCHUP, which runs one of the scripts in
-- setup/catchup/ from the lab Git repository, as the attendee (caller's rights),
-- so everything it builds belongs to HOL_PARTICIPANT, exactly as if they had done
-- the module. Progress goes to LAB.CATCHUP_LOG, which the app reads.
--
--   CALL BANKING_HOL.LAB.RUN_CATCHUP('ds1_model');
--
-- Run as ACCOUNTADMIN after 11_lab_data_loader.sql.
-- =====================================================

USE ROLE HOL_ADMIN;
USE WAREHOUSE BANKING_WH;

CREATE TABLE IF NOT EXISTS BANKING_HOL.LAB.CATCHUP_LOG (
    RUN_ID        VARCHAR,
    CATCHUP       VARCHAR,
    USER_NAME     VARCHAR,
    STATUS        VARCHAR,      -- RUNNING, DONE, FAILED
    STARTED_AT    TIMESTAMP_LTZ,
    FINISHED_AT   TIMESTAMP_LTZ,
    ERROR_MESSAGE VARCHAR
) COMMENT = 'Catch-up runs (RUN_CATCHUP): one row per run, read by the Lab Companion Fast-forward button';
-- where a run is up to, in plain English, written by the CALL BANKING_HOL.LAB.CATCHUP_STEP lines in each script
ALTER TABLE BANKING_HOL.LAB.CATCHUP_LOG ADD COLUMN IF NOT EXISTS STEP_NO INTEGER;
ALTER TABLE BANKING_HOL.LAB.CATCHUP_LOG ADD COLUMN IF NOT EXISTS STEP_TOTAL INTEGER;
ALTER TABLE BANKING_HOL.LAB.CATCHUP_LOG ADD COLUMN IF NOT EXISTS STEP_NAME VARCHAR;
GRANT SELECT, INSERT, UPDATE ON TABLE BANKING_HOL.LAB.CATCHUP_LOG TO ROLE HOL_PARTICIPANT;

-- Called from inside the catch-up scripts: "step 2 of 4: Scoring feedback with AI". It does nothing when a
-- script is run by hand, because the session variable CATCHUP_RUN_ID is only set by RUN_CATCHUP.
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.CATCHUP_STEP(STEP_NO INTEGER, STEP_TOTAL INTEGER, STEP_NAME VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Record which step of a catch-up is running, for the Fast-forward progress bar'
EXECUTE AS CALLER
AS
$$
BEGIN
    UPDATE BANKING_HOL.LAB.CATCHUP_LOG SET STEP_NO = :STEP_NO, STEP_TOTAL = :STEP_TOTAL, STEP_NAME = :STEP_NAME
        WHERE RUN_ID = GETVARIABLE('CATCHUP_RUN_ID');
    RETURN :STEP_NAME;
END;
$$;
GRANT USAGE ON PROCEDURE BANKING_HOL.LAB.CATCHUP_STEP(INTEGER, INTEGER, VARCHAR) TO ROLE HOL_PARTICIPANT;

CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.RUN_CATCHUP(NAME VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Run one catch-up script from the lab Git repository as the caller, logging to LAB.CATCHUP_LOG'
EXECUTE AS CALLER
AS
$$
DECLARE
    run_id   VARCHAR DEFAULT UUID_STRING();
    who      VARCHAR DEFAULT CURRENT_USER();
    use_role VARCHAR DEFAULT 'USE ROLE ' || CURRENT_ROLE();
    script   VARCHAR;
    t0       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
    have     INTEGER DEFAULT 1;
BEGIN
    -- a fixed list: the name is never used to build a path unless it is one of these
    IF (NAME NOT IN ('core_analytics', 'client_360', 'ds1_model', 'ds4_predictions', 'gov4_tags')) THEN
        RETURN 'Unknown catch-up ' || COALESCE(NAME, 'NULL');
    END IF;
    -- ds4_predictions adds to DS1's model, so it needs ds1_model's features and model
    IF (NAME = 'ds4_predictions') THEN
        SELECT COUNT(*) INTO :have FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'ML' AND TABLE_NAME = 'RB_CHURN_FEATURES';
        SHOW MODELS LIKE 'RB_ATTRITION_MODEL' IN SCHEMA BANKING_HOL.ML;
        SELECT IFF(:have = 0, 0, COUNT(*)) INTO :have FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
        IF (have = 0) THEN
            CALL BANKING_HOL.LAB.RUN_CATCHUP('ds1_model');
        END IF;
    END IF;
    script := 'EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/catchup/' || NAME || '.sql';
    INSERT INTO BANKING_HOL.LAB.CATCHUP_LOG (RUN_ID, CATCHUP, USER_NAME, STATUS, STARTED_AT)
        VALUES (:run_id, :NAME, :who, 'RUNNING', CURRENT_TIMESTAMP());
    EXECUTE IMMEDIATE 'SET CATCHUP_RUN_ID = ''' || :run_id || '''';
    EXECUTE IMMEDIATE :script;
    EXECUTE IMMEDIATE :use_role;
    UPDATE BANKING_HOL.LAB.CATCHUP_LOG SET STATUS = 'DONE', FINISHED_AT = CURRENT_TIMESTAMP() WHERE RUN_ID = :run_id;
    RETURN 'Ran catch-up ' || NAME || ' in ' || DATEDIFF('second', t0, CURRENT_TIMESTAMP()) || ' s';
EXCEPTION
    WHEN OTHER THEN
        LET err VARCHAR := SQLERRM;
        EXECUTE IMMEDIATE :use_role;
        UPDATE BANKING_HOL.LAB.CATCHUP_LOG SET STATUS = 'FAILED', FINISHED_AT = CURRENT_TIMESTAMP(), ERROR_MESSAGE = :err
            WHERE RUN_ID = :run_id;
        RAISE;
END;
$$;
GRANT USAGE ON PROCEDURE BANKING_HOL.LAB.RUN_CATCHUP(VARCHAR) TO ROLE HOL_PARTICIPANT;
