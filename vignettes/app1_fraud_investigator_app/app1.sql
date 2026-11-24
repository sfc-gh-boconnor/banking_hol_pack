-- =====================================================
-- APP1: BUILD AND SHIP THE FRAUD INVESTIGATOR APP - reference SQL
-- The app itself is built in a workspace (streamlit_app.py, pyproject.toml).
-- This file deploys the reference version the same way, as HOL_PARTICIPANT,
-- for facilitators or anyone who can't use Workspaces, then checks it.
-- =====================================================
USE SECONDARY ROLES NONE;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.APPS;

-- 1. Upload the two files from this folder to a stage (Snowsight: Data > Add data, or snow stage copy)
CREATE STAGE IF NOT EXISTS APP1_SOURCE COMMENT = 'APP1: fraud investigator app source';
-- PUT file://streamlit_app.py @APP1_SOURCE AUTO_COMPRESS = FALSE OVERWRITE = TRUE;
-- PUT file://pyproject.toml   @APP1_SOURCE AUTO_COMPRESS = FALSE OVERWRITE = TRUE;

-- 2. Create the app on the container runtime and publish it
CREATE OR REPLACE STREAMLIT FRAUD_INVESTIGATOR
    FROM @APP1_SOURCE
    MAIN_FILE = 'streamlit_app.py'
    TITLE = 'Fraud investigator'
    QUERY_WAREHOUSE = BANKING_WH
    COMPUTE_POOL = HOL_COMPUTE_POOL_CPU
    RUNTIME_NAME = 'SYSTEM$ST_CONTAINER_RUNTIME_PY3_11'
    EXTERNAL_ACCESS_INTEGRATIONS = (PYPI_ACCESS_INTEGRATION);
ALTER STREAMLIT FRAUD_INVESTIGATOR ADD LIVE VERSION FROM LAST;

-- 3. Share it view-only
GRANT USAGE ON STREAMLIT FRAUD_INVESTIGATOR TO ROLE HOL_RESTRICTED;

-- 4. Check: the app exists, and decisions are being saved
SHOW STREAMLITS LIKE 'FRAUD_INVESTIGATOR' IN SCHEMA BANKING_HOL.APPS;
SELECT DECISION, COUNT(*) AS DECISIONS, MAX(DECIDED_AT) AS LATEST, ANY_VALUE(DECIDED_BY) AS BY_SOMEONE
FROM MATCH_DECISIONS GROUP BY 1;
