-- =====================================================
-- BANKING HOL PACK - LAB GUIDE IN SNOWFLAKE
--
-- A Streamlit app, BANKING_HOL.LAB.LAB_GUIDE, that shows the written lab guide
-- (guide/index.html) straight from the lab Git repository. It runs on a warehouse,
-- so it works on every account, including trials, where the Lab Companion
-- (Snowflake App Runtime) can't be deployed. Open it from Projects > Streamlit.
--
-- Needs: 00_admin_provision.sql and git_repo.sql. Run as ACCOUNTADMIN.
-- To pick up a newer guide: ALTER GIT REPOSITORY ... FETCH, then re-run this file.
-- =====================================================

USE ROLE ACCOUNTADMIN;
ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH;

USE ROLE HOL_ADMIN;
CREATE OR REPLACE STREAMLIT BANKING_HOL.LAB.LAB_GUIDE
  FROM '@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/guide'
  MAIN_FILE = 'streamlit_app.py'
  QUERY_WAREHOUSE = BANKING_WH
  TITLE = 'Banking HOL lab guide'
  COMMENT = 'The written lab guide (guide/index.html); works on trial accounts too';

-- Viewers with only USAGE see the live version, so publish one
ALTER STREAMLIT BANKING_HOL.LAB.LAB_GUIDE ADD LIVE VERSION FROM LAST;

GRANT USAGE ON STREAMLIT BANKING_HOL.LAB.LAB_GUIDE TO ROLE HOL_PARTICIPANT;
GRANT USAGE ON STREAMLIT BANKING_HOL.LAB.LAB_GUIDE TO ROLE HOL_RESTRICTED;

DELETE FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'GUIDE';
INSERT INTO BANKING_HOL.LAB.SETUP_CONFIG (KEY, VALUE)
  VALUES ('GUIDE', 'Projects > Streamlit > Banking HOL lab guide (BANKING_HOL.LAB.LAB_GUIDE)');
