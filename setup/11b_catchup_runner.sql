-- =====================================================
-- BANKING HOL PACK - FACILITATOR SETUP
-- STEP 11b: CATCH-UP RUNNER
--
-- Lets an attendee fast-forward past a module they skipped. The Lab Companion's
-- "Fast-forward" button starts the task LAB.RUN_CATCHUP_TASK as the app's own role
-- (HOL_ADMIN). The task calls LAB.RUN_CATCHUP for each catch-up, which runs one of the
-- scripts in setup/catchup/ from the lab Git repository. The scripts switch to
-- HOL_PARTICIPANT, so everything they build belongs to HOL_PARTICIPANT, exactly as if
-- the attendee had done the module, and Cortex AI functions work (the app's restricted
-- caller's rights can't reach the shared SNOWFLAKE database, so the task runs instead).
-- Progress goes to LAB.CATCHUP_LOG; what each run builds goes to LAB.CATCHUP_OBJECTS,
-- so LAB.RESET_CATCHUP can remove it before an attendee builds the module themselves.
--
--   CALL BANKING_HOL.LAB.RUN_CATCHUP('ds1_model');
--   EXECUTE TASK BANKING_HOL.LAB.RUN_CATCHUP_TASK USING CONFIG = $${"names": "gov4_tags", "user": "HOL_USER_01"}$$;
--
-- Run as ACCOUNTADMIN after 11_lab_data_loader.sql.
-- =====================================================

USE ROLE HOL_ADMIN;
USE WAREHOUSE BANKING_WH;

CREATE TABLE IF NOT EXISTS BANKING_HOL.LAB.CATCHUP_LOG (
    RUN_ID        VARCHAR,
    CATCHUP       VARCHAR,
    USER_NAME     VARCHAR,
    STATUS        VARCHAR,      -- RUNNING, DONE, FAILED, RESET
    STARTED_AT    TIMESTAMP_LTZ,
    FINISHED_AT   TIMESTAMP_LTZ,
    ERROR_MESSAGE VARCHAR
) COMMENT = 'Catch-up runs (RUN_CATCHUP): one row per run, read by the Lab Companion Fast-forward button';
-- where a run is up to, in plain English, written by the CALL BANKING_HOL.LAB.CATCHUP_STEP lines in each script
ALTER TABLE BANKING_HOL.LAB.CATCHUP_LOG ADD COLUMN IF NOT EXISTS STEP_NO INTEGER;
ALTER TABLE BANKING_HOL.LAB.CATCHUP_LOG ADD COLUMN IF NOT EXISTS STEP_TOTAL INTEGER;
ALTER TABLE BANKING_HOL.LAB.CATCHUP_LOG ADD COLUMN IF NOT EXISTS STEP_NAME VARCHAR;
GRANT SELECT, INSERT, UPDATE ON TABLE BANKING_HOL.LAB.CATCHUP_LOG TO ROLE HOL_PARTICIPANT;

-- What each catch-up run built, so a module reset drops exactly that
CREATE TABLE IF NOT EXISTS BANKING_HOL.LAB.CATCHUP_OBJECTS (
    RUN_ID      VARCHAR,
    CATCHUP     VARCHAR,
    USER_NAME   VARCHAR,
    OBJECT_TYPE VARCHAR,      -- TABLE, VIEW, DYNAMIC TABLE, ICEBERG TABLE, MODEL
    OBJECT_NAME VARCHAR,      -- fully qualified, quoted
    CREATED_AT  TIMESTAMP_LTZ
) COMMENT = 'Objects each Fast-forward catch-up created, read by the module reset';
GRANT SELECT ON TABLE BANKING_HOL.LAB.CATCHUP_OBJECTS TO ROLE HOL_PARTICIPANT;

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

DROP PROCEDURE IF EXISTS BANKING_HOL.LAB.RUN_CATCHUP(VARCHAR);
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.RUN_CATCHUP(NAME VARCHAR, FOR_USER VARCHAR DEFAULT NULL)
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Run one catch-up script from the lab Git repository as the caller, logging to LAB.CATCHUP_LOG and LAB.CATCHUP_OBJECTS'
EXECUTE AS CALLER
AS
$$
DECLARE
    run_id   VARCHAR DEFAULT UUID_STRING();
    who      VARCHAR DEFAULT COALESCE(FOR_USER, CURRENT_USER());
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
    -- (INFORMATION_SCHEMA, not SHOW + LAST_QUERY_ID, which loses the statement when nested in a task)
    IF (NAME = 'ds4_predictions') THEN
        SELECT COUNT(*) INTO :have FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'ML' AND TABLE_NAME = 'RB_CHURN_FEATURES';
        SELECT IFF(:have = 0, 0, COUNT(*)) INTO :have FROM BANKING_HOL.INFORMATION_SCHEMA.MODEL_VERSIONS
            WHERE SCHEMA_NAME = 'ML' AND MODEL_NAME = 'RB_ATTRITION_MODEL';
        IF (have = 0) THEN
            CALL BANKING_HOL.LAB.RUN_CATCHUP('ds1_model', :who);
        END IF;
    END IF;
    script := 'EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/catchup/' || NAME || '.sql';
    INSERT INTO BANKING_HOL.LAB.CATCHUP_LOG (RUN_ID, CATCHUP, USER_NAME, STATUS, STARTED_AT)
        VALUES (:run_id, :NAME, :who, 'RUNNING', CURRENT_TIMESTAMP());
    EXECUTE IMMEDIATE 'SET CATCHUP_RUN_ID = ''' || :run_id || '''';
    EXECUTE IMMEDIATE :script;
    EXECUTE IMMEDIATE :use_role;
    -- what this run built: attendee-owned objects created since it started
    INSERT INTO BANKING_HOL.LAB.CATCHUP_OBJECTS (RUN_ID, CATCHUP, USER_NAME, OBJECT_TYPE, OBJECT_NAME, CREATED_AT)
        SELECT :run_id, :NAME, :who,
               CASE WHEN IS_DYNAMIC = 'YES' THEN 'DYNAMIC TABLE' WHEN IS_ICEBERG = 'YES' THEN 'ICEBERG TABLE'
                    WHEN TABLE_TYPE = 'VIEW' THEN 'VIEW' ELSE 'TABLE' END,
               '"' || TABLE_CATALOG || '"."' || TABLE_SCHEMA || '"."' || TABLE_NAME || '"', CREATED
        FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_OWNER = 'HOL_PARTICIPANT' AND CREATED >= :t0 AND TABLE_SCHEMA NOT IN ('LAB', 'INFORMATION_SCHEMA');
    -- semantic views are not in INFORMATION_SCHEMA.TABLES
    INSERT INTO BANKING_HOL.LAB.CATCHUP_OBJECTS (RUN_ID, CATCHUP, USER_NAME, OBJECT_TYPE, OBJECT_NAME, CREATED_AT)
        SELECT :run_id, :NAME, :who, 'SEMANTIC VIEW', '"' || CATALOG || '"."' || SCHEMA || '"."' || NAME || '"', CREATED
        FROM BANKING_HOL.INFORMATION_SCHEMA.SEMANTIC_VIEWS
        WHERE OWNER = 'HOL_PARTICIPANT' AND CREATED >= :t0;
    -- models whose first version this run created (a version added to an earlier model stays)
    INSERT INTO BANKING_HOL.LAB.CATCHUP_OBJECTS (RUN_ID, CATCHUP, USER_NAME, OBJECT_TYPE, OBJECT_NAME, CREATED_AT)
        SELECT :run_id, :NAME, :who, 'MODEL', '"' || CATALOG_NAME || '"."' || SCHEMA_NAME || '"."' || MODEL_NAME || '"', MIN(CREATED_ON)
        FROM BANKING_HOL.INFORMATION_SCHEMA.MODEL_VERSIONS
        WHERE OWNER = 'HOL_PARTICIPANT' AND SCHEMA_NAME <> 'ML_REFERENCE'
        GROUP BY CATALOG_NAME, SCHEMA_NAME, MODEL_NAME
        HAVING MIN(CREATED_ON) >= :t0;
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
GRANT USAGE ON PROCEDURE BANKING_HOL.LAB.RUN_CATCHUP(VARCHAR, VARCHAR) TO ROLE HOL_PARTICIPANT;

-- The Fast-forward button starts this task (as the app's role, HOL_ADMIN) with the catch-ups to run, in
-- order, and the attendee's user name. A task session can switch roles, unlike the app's restricted
-- caller's rights session, so the scripts build as HOL_PARTICIPANT with Cortex AI available.
CREATE OR REPLACE TASK BANKING_HOL.LAB.RUN_CATCHUP_TASK
    WAREHOUSE = BANKING_WH
    USER_TASK_TIMEOUT_MS = 3600000
    COMMENT = 'Lab Companion Fast-forward: run catch-ups for an attendee (config: names, user)'
AS EXECUTE IMMEDIATE $$
DECLARE
    names VARCHAR;
    who   VARCHAR;
    n     VARCHAR;
    arr   ARRAY;
BEGIN
    names := SYSTEM$GET_TASK_GRAPH_CONFIG('names')::VARCHAR;
    who   := SYSTEM$GET_TASK_GRAPH_CONFIG('user')::VARCHAR;
    arr   := SPLIT(:names, ',');
    FOR i IN 0 TO ARRAY_SIZE(:arr) - 1 DO
        n := TRIM(GET(:arr, :i)::VARCHAR);
        CALL BANKING_HOL.LAB.RUN_CATCHUP(:n, :who);
    END FOR;
END;
$$;

-- Before an attendee builds a module that Fast-forward completed: drop what that catch-up built for them.
-- DRY_RUN => TRUE lists the objects and changes nothing. Runs as HOL_ADMIN, which holds HOL_PARTICIPANT.
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.RESET_CATCHUP(CATCHUP VARCHAR, FOR_USER VARCHAR, DRY_RUN BOOLEAN DEFAULT TRUE)
RETURNS VARIANT
LANGUAGE SQL
COMMENT = 'Drop the objects a Fast-forward catch-up built for one attendee (DRY_RUN lists them)'
EXECUTE AS OWNER
AS
$$
DECLARE
    dropped ARRAY DEFAULT ARRAY_CONSTRUCT();
    c CURSOR FOR SELECT DISTINCT OBJECT_TYPE, OBJECT_NAME FROM BANKING_HOL.LAB.CATCHUP_OBJECTS
        WHERE CATCHUP = ? AND USER_NAME = ? ORDER BY OBJECT_TYPE DESC;
BEGIN
    OPEN c USING (CATCHUP, FOR_USER);
    FOR r IN c DO
        LET t VARCHAR := r.OBJECT_TYPE;
        LET o VARCHAR := r.OBJECT_NAME;
        dropped := ARRAY_APPEND(:dropped, :t || ' ' || :o);
        IF (NOT DRY_RUN) THEN
            EXECUTE IMMEDIATE 'DROP ' || :t || ' IF EXISTS ' || :o;
        END IF;
    END FOR;
    CLOSE c;
    IF (NOT DRY_RUN) THEN
        DELETE FROM BANKING_HOL.LAB.CATCHUP_OBJECTS WHERE CATCHUP = :CATCHUP AND USER_NAME = :FOR_USER;
        UPDATE BANKING_HOL.LAB.CATCHUP_LOG SET STATUS = 'RESET'
            WHERE CATCHUP = :CATCHUP AND USER_NAME = :FOR_USER AND STATUS = 'DONE';
    END IF;
    RETURN OBJECT_CONSTRUCT('catchup', :CATCHUP, 'dry_run', :DRY_RUN, 'objects', :dropped);
END;
$$;
