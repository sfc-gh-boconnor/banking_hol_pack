-- =====================================================
-- BANKING HOL PACK - FACILITATOR SETUP
-- STEP 13: THE dbt PROJECT OBJECT
-- Attendees own and run it (DE2), so it's created as HOL_PARTICIPANT.
-- Run by LOAD_LAB_DATA('PROVISION') after the lab data has loaded.
-- =====================================================

USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
CREATE OR REPLACE DBT PROJECT BANKING_HOL.ANALYTICS.BANKING_DBT
    FROM '@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/dbt'
    COMMENT = 'Banking HOL pack dbt project';
