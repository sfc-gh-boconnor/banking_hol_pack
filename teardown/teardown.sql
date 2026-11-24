-- =====================================================
-- BANKING HOL PACK - TEARDOWN (facilitator)
-- Removes everything the lab created. Run as ACCOUNTADMIN.
-- First remove the Lab Companion app (from the repo root):
--   (cd lab-companion && snow app teardown --force --connection <conn> --role HOL_ADMIN)
-- To clear attendee work but keep the lab, use CALL BANKING_HOL.LAB.LOAD_LAB_DATA('RESET')
-- (Facilitator page > Reset attendee work) instead.
-- =====================================================

USE ROLE ACCOUNTADMIN;

-- Agents published to Snowflake CoWork
DROP AGENT IF EXISTS SNOWFLAKE_INTELLIGENCE.AGENTS.CORPORATE_PAYMENTS_360;
DROP AGENT IF EXISTS SNOWFLAKE_INTELLIGENCE.AGENTS.PAYMENTS_PLATFORM_COPILOT;
DROP AGENT IF EXISTS SNOWFLAKE_INTELLIGENCE.AGENTS.PAYMENTS_OPS_COWORK;

-- DE3 Postgres source: mirror first (it drops its target database), then the instance, then the policy
EXECUTE IMMEDIATE $$
BEGIN
  CALL SNOWFLAKE.POSTGRES.DROP_MIRROR(mirror_name => 'payments_mirror', drop_target_database => TRUE);
EXCEPTION
  WHEN OTHER THEN RETURN 'no payments_mirror';
END;
$$;
DROP DATABASE IF EXISTS PAYMENTS_MIRROR;
DROP POSTGRES INSTANCE IF EXISTS HOL_PAYMENTS_PG;
DROP NETWORK POLICY IF EXISTS HOL_PG_POLICY;
DROP INTEGRATION IF EXISTS HOL_PG_SECRET_INTEGRATION;

-- Policies must be detached before the objects they protect can be dropped cleanly
ALTER TAG IF EXISTS BANKING_HOL.GOVERNANCE.DATA_SENSITIVITY UNSET MASKING POLICY BANKING_HOL.GOVERNANCE.MASK_RESTRICTED_STRING;
DROP TABLE IF EXISTS BANKING_HOL.GOVERNANCE.ACCOUNT_REGISTER;

-- Lab database (Iceberg tables on Snowflake-managed storage are dropped with it)
DROP APPLICATION SERVICE IF EXISTS BANKING_HOL.LAB.LAB_COMPANION;
DROP DATABASE IF EXISTS BANKING_HOL;

-- Executive demo (setup/12a-12e) and the map tiles integration it uses
DROP DATABASE IF EXISTS BANKING_DEMO;
DROP INTEGRATION IF EXISTS BASEMAP_ACCESS_INTEGRATION;

-- Marketplace knowledge extension (re-install with setup/00 if needed)
DROP DATABASE IF EXISTS SNOWFLAKE_DOCS_CKE;

DROP WAREHOUSE IF EXISTS BANKING_WH;

-- Lab Git repository (setup/git_repo.sql / INSTALL.sql)
DROP DATABASE IF EXISTS BANKING_HOL_SETUP;
DROP API INTEGRATION IF EXISTS BANKING_HOL_GITHUB;

DROP ROLE IF EXISTS HOL_RESTRICTED;
DROP ROLE IF EXISTS HOL_PARTICIPANT;
DROP ROLE IF EXISTS HOL_ADMIN;

-- SNOWFLAKE_INTELLIGENCE database is shared account infrastructure - left in place.

SELECT 'Teardown complete' AS STATUS;
