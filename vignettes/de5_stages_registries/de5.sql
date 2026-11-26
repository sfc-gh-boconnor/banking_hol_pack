-- =====================================================
-- DE5: Know where every file, model and app lives (solution)
-- Catalogue the evidence stage, share a case folder with a controlled grant, and keep one
-- inventory of every stage and registered model with its owner. Run as HOL_PARTICIPANT.
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.GOVERNANCE;

-- 1. Catalogue the evidence files from the stage's directory table
CREATE OR REPLACE TABLE EVIDENCE_CATALOGUE AS
SELECT RELATIVE_PATH AS FILE_NAME,
       SPLIT_PART(RELATIVE_PATH, '_', 1) AS CASE_ID,
       REGEXP_REPLACE(REGEXP_REPLACE(RELATIVE_PATH, '^[A-Z0-9]+_', ''), '\\.[a-z]+$', '') AS EVIDENCE_TYPE,
       UPPER(REGEXP_SUBSTR(RELATIVE_PATH, '[a-z]+$')) AS FILE_FORMAT,
       SIZE AS SIZE_BYTES, LAST_MODIFIED
FROM DIRECTORY(@BANKING_HOL.RETAIL.FINCRIME_EVIDENCE);

-- 2. Share one case folder through a stage of your own
CREATE OR REPLACE STAGE EVIDENCE_SHARE DIRECTORY = (ENABLE = TRUE) ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
  COMMENT = 'Case FRC100054 evidence for the reviewing team';
COPY FILES INTO @EVIDENCE_SHARE FROM @BANKING_HOL.RETAIL.FINCRIME_EVIDENCE PATTERN = '.*FRC100054.*';
ALTER STAGE EVIDENCE_SHARE REFRESH;
GRANT READ ON STAGE EVIDENCE_SHARE TO ROLE HOL_RESTRICTED;

-- 3. One inventory of stages and registered models, with owner and where they sit
CREATE OR REPLACE TABLE PLATFORM_INVENTORY AS
SELECT 'Stage' AS OBJECT_TYPE, STAGE_SCHEMA || '.' || STAGE_NAME AS OBJECT_NAME, STAGE_OWNER AS OWNER_ROLE, STAGE_TYPE AS DETAIL
FROM BANKING_HOL.INFORMATION_SCHEMA.STAGES
UNION ALL
SELECT 'Model version', SCHEMA_NAME || '.' || MODEL_NAME || ' ' || MODEL_VERSION_NAME, OWNER, ARRAY_TO_STRING(PARSE_JSON(FUNCTIONS), ', ')
FROM BANKING_HOL.INFORMATION_SCHEMA.MODEL_VERSIONS;
