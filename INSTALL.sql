-- =====================================================
-- BANKING HOL PACK - ONE-SCRIPT INSTALL FOR ANY ACCOUNT
--
-- For any Snowflake account, including a free trial: open a Snowsight SQL
-- worksheet, paste this whole file, pick the ACCOUNTADMIN role and press
-- Run All. No laptop, CLI or DataOps needed. About 5 minutes here, then the
-- lab data keeps loading in the background for about 10 more.
--
-- At the end the last result says where to open the lab: the Lab Companion URL,
-- or, where the account can't run it, the lab guide in Snowflake.
--
-- Trial accounts: AI features need a credit card on the account (it doesn't
-- end the trial). External network access isn't available on trials, so the
-- few modules that need it (DE3 Postgres, GOV3 AI Gateway, the DA3 map app)
-- show as optional with the reason. The Lab Companion runs on Snowflake App
-- Runtime, which trials don't support: the install checks, skips it and carries
-- on, and you follow the written guide (Projects > Streamlit > Banking HOL lab
-- guide) instead, without Check my work.
-- =====================================================

USE ROLE ACCOUNTADMIN;

-- -----------------------------------------------------
-- 1. Connect the account to the lab repository
-- -----------------------------------------------------
CREATE DATABASE IF NOT EXISTS BANKING_HOL_SETUP
    COMMENT = 'Banking HOL - Git repository the lab is installed from';

CREATE API INTEGRATION IF NOT EXISTS BANKING_HOL_GITHUB
    API_PROVIDER = GIT_HTTPS_API
    API_ALLOWED_PREFIXES = ('https://github.com/')
    ENABLED = TRUE
    COMMENT = 'Banking HOL - read the public lab repository';

CREATE GIT REPOSITORY IF NOT EXISTS BANKING_HOL_SETUP.PUBLIC.HOL_REPO
    API_INTEGRATION = BANKING_HOL_GITHUB
    ORIGIN = 'https://github.com/sfc-gh-boconnor/banking_hol_pack.git'
    COMMENT = 'Banking HOL pack source';

ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH;

-- -----------------------------------------------------
-- 2. Roles, warehouse, database and the setup procedures
-- -----------------------------------------------------
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/00_admin_provision.sql;
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/git_repo.sql;
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/11_lab_data_loader.sql;
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/11b_catchup_runner.sql;
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/04_lab_companion.sql;
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/05_wake_schedule.sql;

-- -----------------------------------------------------
-- 3. Switch on AI (models from any region, as DataOps events do), then check it
--    works. On a trial with no card, Run All stops here with what to do.
-- -----------------------------------------------------
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';
USE WAREHOUSE BANKING_WH;

EXECUTE IMMEDIATE $$
DECLARE
    no_ai EXCEPTION (-20001, 'AI features are not available on this account yet. On a trial account, add a credit card (Admin > Billing): it does not end the trial. Then run this script again.');
BEGIN
    LET reply VARCHAR := (SELECT AI_COMPLETE('claude-sonnet-4-5', 'Reply with the word ready'));
    RETURN 'AI features are available';
EXCEPTION
    WHEN OTHER THEN
        RAISE no_ai;
END;
$$;

-- You do the lab yourself: give your user the attendee and facilitator roles
EXECUTE IMMEDIATE $$
BEGIN
    LET me VARCHAR := CURRENT_USER();
    EXECUTE IMMEDIATE 'GRANT ROLE HOL_PARTICIPANT TO USER "' || REPLACE(:me, '"', '""') || '"';
    EXECUTE IMMEDIATE 'GRANT ROLE HOL_ADMIN TO USER "' || REPLACE(:me, '"', '""') || '"';
    RETURN 'HOL_PARTICIPANT and HOL_ADMIN granted to ' || :me;
END;
$$;

-- Lab settings: no event times (wake the app on the day with CALL BANKING_HOL.LAB.WAKE_LAB()),
-- and the Cortex Search lab on (set INCLUDE_SEARCH to FALSE where Search isn't approved)
DELETE FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY IN ('LAB_START', 'LAB_END', 'WAKE_LEAD_MINUTES', 'INCLUDE_SEARCH', 'SETUP_REQUESTED_AT', 'INSTALL_MODE');
INSERT INTO BANKING_HOL.LAB.SETUP_CONFIG (KEY, VALUE) VALUES
    ('WAKE_LEAD_MINUTES', '30'), ('INCLUDE_SEARCH', 'TRUE'), ('SETUP_REQUESTED_AT', CURRENT_TIMESTAMP()::VARCHAR),
    ('INSTALL_MODE', 'SELF');

-- -----------------------------------------------------
-- 4. The shared lab Workspace (notebooks and module files)
-- -----------------------------------------------------
EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/14_workspace.sql;

-- -----------------------------------------------------
-- 5. Load the lab data in the background (about 10 minutes), and build the Lab Companion alongside
--    it. Follow the load with: SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS;
-- -----------------------------------------------------
EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB;

-- -----------------------------------------------------
-- 6. Build the Lab Companion inside Snowflake (2 to 10 minutes the first time)
--    It runs on Snowflake App Runtime. Where the account can't run it (trial
--    accounts), the deploy's error is recorded and the written lab guide is
--    built instead, as a Streamlit app that works on every account.
-- -----------------------------------------------------
USE ROLE HOL_ADMIN;
-- its own warehouse: the data load holds BANKING_WH, and the build checks would queue behind it
USE WAREHOUSE BANKING_SETUP_WH;
EXECUTE IMMEDIATE $$
BEGIN
    DELETE FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'APP_SKIPPED';
    CALL BANKING_HOL.LAB.DEPLOY_LAB_COMPANION();
    -- the guide app is only for accounts without the Lab Companion
    DROP STREAMLIT IF EXISTS BANKING_HOL.LAB.LAB_GUIDE;
    DELETE FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'GUIDE';
    RETURN 'Lab Companion deployed';
EXCEPTION
    WHEN OTHER THEN
        LET reason VARCHAR := LEFT(SQLERRM, 500);
        INSERT INTO BANKING_HOL.LAB.SETUP_CONFIG (KEY, VALUE) VALUES ('APP_SKIPPED', :reason);
        EXECUTE IMMEDIATE FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/15_lab_guide.sql;
        RETURN 'Lab Companion not deployed (this account cannot run Snowflake App Runtime apps): ' || :reason;
END;
$$;

-- You do the lab yourself: make your user an attendee (default role HOL_PARTICIPANT, no secondary
-- roles). This session keeps ACCOUNTADMIN. Switch back any time from the Lab Companion home page.
EXECUTE IMMEDIATE $$
BEGIN
    CALL BANKING_HOL.LAB.MY_LAB_DEFAULTS(CURRENT_USER(), 'attendee');
    RETURN 'Your default role is now HOL_PARTICIPANT. In Snowsight, switch role to HOL_PARTICIPANT (it keeps the role you last picked).';
EXCEPTION
    WHEN OTHER THEN RETURN 'Your defaults were not changed: ' || SQLERRM;
END;
$$;

SELECT CASE
         WHEN (SELECT MAX(VALUE) FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'APP_URL') IS NOT NULL
           THEN 'Installed. Open the Lab Companion: ' || (SELECT MAX(VALUE) FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'APP_URL')
         ELSE 'Installed without the Lab Companion (this account cannot run Snowflake App Runtime apps). Follow the lab guide in Projects > Streamlit > Banking HOL lab guide'
       END
       || '. The lab data finishes loading in about 10 minutes (SELECT * FROM BANKING_HOL.LAB.SETUP_SUMMARY).' AS NEXT_STEP;
