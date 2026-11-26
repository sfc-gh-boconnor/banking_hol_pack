-- =====================================================
-- BANKING HOL PACK - START HERE (Snowsight, before the Workspace)
--
-- Lets Snowsight read the public lab repository from GitHub, so you can create a
-- Workspace from it and install the lab with Cortex Code in Snowsight.
-- Run it in a SQL worksheet as ACCOUNTADMIN. It only creates this one integration.
--
-- Then:
--   1. Projects > Workspaces > the Workspace dropdown (top left) > From Git repository
--   2. Repository URL: https://github.com/sfc-gh-boconnor/banking_hol_pack
--      API integration: BANKING_HOL_GITHUB, and choose Public repository (no credentials)
--   3. Open Cortex Code in that Workspace and type: /hol-install
--
-- INSTALL.sql creates the same integration with IF NOT EXISTS, so it reuses this one.
-- =====================================================

USE ROLE ACCOUNTADMIN;

CREATE API INTEGRATION IF NOT EXISTS BANKING_HOL_GITHUB
    API_PROVIDER = GIT_HTTPS_API
    API_ALLOWED_PREFIXES = ('https://github.com/')
    ENABLED = TRUE
    COMMENT = 'Banking HOL - read the public lab repository';

SELECT 'Done. Now create a Workspace from https://github.com/sfc-gh-boconnor/banking_hol_pack using BANKING_HOL_GITHUB, then type /hol-install in Cortex Code.' AS NEXT_STEP;
