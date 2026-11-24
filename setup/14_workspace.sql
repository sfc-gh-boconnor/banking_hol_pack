-- =====================================================
-- BANKING HOL PACK - THE SHARED LAB WORKSPACE
-- Creates the banking-hol-pack Workspace and fills it with the lab repo
-- (notebooks, vignettes, dbt, everything), so attendees open notebooks and
-- reference files in Snowsight. DataOps events create their own Workspace;
-- INSTALL.sql runs this for every other account. Rerun to refresh the files.
-- Run as ACCOUNTADMIN after git_repo.sql.
-- =====================================================
USE ROLE ACCOUNTADMIN;

CREATE WORKSPACE IF NOT EXISTS BANKING_HOL_SETUP.PUBLIC."banking-hol-pack"
    COMMENT = 'Banking HOL pack: notebooks, module files and the dbt project, shared by every attendee';

-- attendees edit and run the notebooks; HOL_ADMIN's facilitator reset puts them back to the defaults
GRANT USAGE ON DATABASE BANKING_HOL_SETUP TO ROLE HOL_PARTICIPANT;
GRANT USAGE ON SCHEMA BANKING_HOL_SETUP.PUBLIC TO ROLE HOL_PARTICIPANT;
GRANT WRITE ON WORKSPACE BANKING_HOL_SETUP.PUBLIC."banking-hol-pack" TO ROLE HOL_PARTICIPANT;
GRANT WRITE ON WORKSPACE BANKING_HOL_SETUP.PUBLIC."banking-hol-pack" TO ROLE HOL_ADMIN;

-- the reset procedure and the app read where the Workspace is from here
DELETE FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'WORKSPACE';
INSERT INTO BANKING_HOL.LAB.SETUP_CONFIG (KEY, VALUE)
    VALUES ('WORKSPACE', 'BANKING_HOL_SETUP.PUBLIC."banking-hol-pack"');

-- fill it from the repo and publish (COMMIT takes no message)
ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH;
ALTER WORKSPACE BANKING_HOL_SETUP.PUBLIC."banking-hol-pack" ADD LIVE VERSION FROM LAST;
COPY FILES INTO 'snow://workspace/BANKING_HOL_SETUP.PUBLIC."banking-hol-pack"/versions/live/'
    FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/;
ALTER WORKSPACE BANKING_HOL_SETUP.PUBLIC."banking-hol-pack" COMMIT;
