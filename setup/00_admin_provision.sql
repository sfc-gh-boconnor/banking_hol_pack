-- =====================================================
-- BANKING HOL PACK - FACILITATOR SETUP
-- STEP 00: ROLES, DATABASE, WAREHOUSE, MARKETPLACE
--
-- Mirrors the the bank's enterprise data platform pattern:
--   * Source data is published centrally as Snowflake-managed Iceberg tables
--   * Participants have READ-ONLY access to RAW_DATA (they cannot load files)
--   * Participants build data products in ANALYTICS / AGENTS
--
-- Run once per lab account as ACCOUNTADMIN, then run:
--   01_seed_synthetic_data.sql   (as HOL_ADMIN)
--   02_publish_iceberg.sql       (as HOL_ADMIN)
-- =====================================================

USE ROLE ACCOUNTADMIN;

-- -----------------------------------------------------
-- 0.1 Roles
--   HOL_ADMIN       : platform team - owns RAW_DATA and SEED
--   HOL_PARTICIPANT : lab attendee  - reads RAW_DATA, builds in ANALYTICS
--   HOL_RESTRICTED  : used in GOV1 to demonstrate masking (no PII access)
-- -----------------------------------------------------
CREATE ROLE IF NOT EXISTS HOL_ADMIN       COMMENT = 'Banking HOL - platform/data owner role';
CREATE ROLE IF NOT EXISTS HOL_PARTICIPANT COMMENT = 'Banking HOL - attendee role (read raw, build analytics)';
CREATE ROLE IF NOT EXISTS HOL_RESTRICTED  COMMENT = 'Banking HOL - restricted consumer role for governance demos';

GRANT ROLE HOL_RESTRICTED  TO ROLE HOL_PARTICIPANT;
GRANT ROLE HOL_PARTICIPANT TO ROLE HOL_ADMIN;
GRANT ROLE HOL_ADMIN       TO ROLE SYSADMIN;

-- -----------------------------------------------------
-- 0.2 Warehouse
-- -----------------------------------------------------
CREATE WAREHOUSE IF NOT EXISTS BANKING_WH
    WAREHOUSE_SIZE = 'SMALL'
    AUTO_SUSPEND = 60
    AUTO_RESUME = TRUE
    INITIALLY_SUSPENDED = TRUE
    COMMENT = 'Warehouse for the Banking HOL pack';
GRANT USAGE, OPERATE ON WAREHOUSE BANKING_WH TO ROLE HOL_PARTICIPANT;
GRANT USAGE ON WAREHOUSE BANKING_WH TO ROLE HOL_RESTRICTED;
GRANT ALL ON WAREHOUSE BANKING_WH TO ROLE HOL_ADMIN;

-- Give the installing user the admin role (attendees: 03_add_participants.sql).
-- A scripting block rather than a session variable, so this file also runs via
-- EXECUTE IMMEDIATE FROM (INSTALL.sql), which does not allow SET. Scripting
-- needs a warehouse, and service users (DataOps) have no default one.
USE WAREHOUSE BANKING_WH;
EXECUTE IMMEDIATE $$
BEGIN
    EXECUTE IMMEDIATE 'GRANT ROLE HOL_ADMIN TO USER "' || REPLACE(CURRENT_USER(), '"', '""') || '"';
END;
$$;

-- -----------------------------------------------------
-- 0.3 Database and schemas
-- -----------------------------------------------------
CREATE DATABASE IF NOT EXISTS BANKING_HOL
    COMMENT = 'Banking HOL pack - hands-on labs (synthetic data)';
GRANT OWNERSHIP ON DATABASE BANKING_HOL TO ROLE HOL_ADMIN COPY CURRENT GRANTS;
-- Accounts can be reused (or hold an earlier version of the lab): take over any
-- schemas that already exist so the IF NOT EXISTS creates below are owned by HOL_ADMIN
GRANT OWNERSHIP ON ALL SCHEMAS IN DATABASE BANKING_HOL TO ROLE HOL_ADMIN COPY CURRENT GRANTS;

USE ROLE HOL_ADMIN;
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.SEED      COMMENT = 'Platform team only: synthetic generator output (native tables)';
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.RAW_DATA  COMMENT = 'Published source data - Snowflake-managed Iceberg tables (read-only to attendees)';
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.ANALYTICS COMMENT = 'Attendee-built data products: dbt models, AI enrichment, dynamic tables, semantic views';
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.AGENTS    COMMENT = 'Attendee-built Cortex Agents, tools and MCP servers';
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.GOVERNANCE COMMENT = 'Tags, masking and row access policies';
-- Created here as well as in 04_lab_companion.sql: PG_CONNECTION_INFO (DE3) lives in LAB
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.LAB       COMMENT = 'Lab Companion app: application service, check results and progress';
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.APPS      COMMENT = 'App Builder pathway (APP0, APP1): attendee Streamlit apps and the tables they write';

GRANT USAGE ON DATABASE BANKING_HOL TO ROLE HOL_PARTICIPANT;
GRANT USAGE ON DATABASE BANKING_HOL TO ROLE HOL_RESTRICTED;

-- Read-only raw layer
GRANT USAGE ON SCHEMA BANKING_HOL.RAW_DATA TO ROLE HOL_PARTICIPANT;
GRANT SELECT ON ALL ICEBERG TABLES    IN SCHEMA BANKING_HOL.RAW_DATA TO ROLE HOL_PARTICIPANT;
GRANT SELECT ON FUTURE ICEBERG TABLES IN SCHEMA BANKING_HOL.RAW_DATA TO ROLE HOL_PARTICIPANT;

-- Build layers
GRANT ALL ON SCHEMA BANKING_HOL.ANALYTICS  TO ROLE HOL_PARTICIPANT;
GRANT ALL ON SCHEMA BANKING_HOL.AGENTS     TO ROLE HOL_PARTICIPANT;
GRANT ALL ON SCHEMA BANKING_HOL.GOVERNANCE TO ROLE HOL_PARTICIPANT;
GRANT ALL ON SCHEMA BANKING_HOL.APPS       TO ROLE HOL_PARTICIPANT;   -- APP1: CREATE STREAMLIT, TABLE, VIEW, STAGE
GRANT USAGE ON SCHEMA BANKING_HOL.ANALYTICS TO ROLE HOL_RESTRICTED;
GRANT USAGE ON SCHEMA BANKING_HOL.GOVERNANCE TO ROLE HOL_RESTRICTED;   -- GOV1 consumer test
GRANT SELECT ON FUTURE TABLES IN SCHEMA BANKING_HOL.ANALYTICS TO ROLE HOL_RESTRICTED;
GRANT SELECT ON FUTURE VIEWS  IN SCHEMA BANKING_HOL.ANALYTICS TO ROLE HOL_RESTRICTED;

-- -----------------------------------------------------
-- 0.4 Account-level privileges used in vignettes
-- -----------------------------------------------------
USE ROLE ACCOUNTADMIN;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER       TO ROLE HOL_PARTICIPANT;
-- Cortex model access: new accounts use model RBAC (bundle 2026_07), so every model the lab and demo
-- use (AI_COMPLETE models, arctic-embed for search) needs a model role. HOL_ADMIN inherits it through
-- HOL_PARTICIPANT. New accounts already have the model roles (and give CORTEX-MODEL-ROLE-ALL to PUBLIC);
-- don't call SNOWFLAKE.MODELS.CORTEX_BASE_MODELS_REFRESH() here: it held a provisioning run for 8+ min.
-- Warn rather than fail if the roles aren't there.
EXECUTE IMMEDIATE $$
BEGIN
  GRANT APPLICATION ROLE SNOWFLAKE."CORTEX-MODEL-ROLE-ALL" TO ROLE HOL_PARTICIPANT;
  GRANT APPLICATION ROLE SNOWFLAKE."CORTEX-MODEL-ROLE-ALL" TO ROLE HOL_RESTRICTED;
  RETURN 'Granted CORTEX-MODEL-ROLE-ALL to HOL_PARTICIPANT and HOL_RESTRICTED';
EXCEPTION
  WHEN OTHER THEN
    RETURN 'WARNING: could not grant Cortex model access (AI steps may fail): ' || SQLERRM;
END;
$$;
GRANT DATABASE ROLE SNOWFLAKE.GOVERNANCE_VIEWER TO ROLE HOL_PARTICIPANT;   -- GOV2 lineage/access history
GRANT DATABASE ROLE SNOWFLAKE.OBJECT_VIEWER     TO ROLE HOL_PARTICIPANT;   -- GOV2 object dependencies
GRANT DATABASE ROLE SNOWFLAKE.DATA_METRIC_USER  TO ROLE HOL_PARTICIPANT;   -- DE2 data metric functions
GRANT EXECUTE DATA METRIC FUNCTION ON ACCOUNT   TO ROLE HOL_PARTICIPANT;
-- DE2 Pipeline Builder: runs task graphs; notebook/Python tasks need code bundles
GRANT EXECUTE TASK                 ON ACCOUNT   TO ROLE HOL_PARTICIPANT;
-- OPS4 impact tolerance alert: attendees schedule and run their own Snowflake Alert
GRANT EXECUTE ALERT                ON ACCOUNT   TO ROLE HOL_PARTICIPANT;
GRANT CREATE CODE BUNDLE ON SCHEMA BANKING_HOL.ANALYTICS TO ROLE HOL_PARTICIPANT;
-- DE4 Spark on Snowflake: Monitoring > Spark shows job logs and traces only when the account
-- records them; an alert reads Spark history as a system user, so it needs MONITOR EXECUTION
ALTER ACCOUNT SET LOG_LEVEL = 'INFO';
ALTER ACCOUNT SET TRACE_LEVEL = 'ALWAYS';
GRANT MONITOR EXECUTION            ON ACCOUNT   TO ROLE HOL_PARTICIPANT;
-- read their own job logs; brand-new accounts may not have this application role yet
EXECUTE IMMEDIATE $$
BEGIN
  GRANT APPLICATION ROLE SNOWFLAKE.EVENTS_VIEWER TO ROLE HOL_PARTICIPANT;
  RETURN 'EVENTS_VIEWER granted to HOL_PARTICIPANT';
EXCEPTION
  WHEN OTHER THEN RETURN 'SKIPPED EVENTS_VIEWER (not available on this account yet): ' || SQLERRM;
END;
$$;
-- DA3 map app: Streamlit container runtime (Carto basemaps without External Offerings Terms)
-- New trial accounts may not have SYSTEM_COMPUTE_POOL_CPU yet, so the lab brings its own pool
CREATE COMPUTE POOL IF NOT EXISTS HOL_COMPUTE_POOL_CPU
  MIN_NODES = 1 MAX_NODES = 10 INSTANCE_FAMILY = CPU_X64_XS
  AUTO_RESUME = TRUE AUTO_SUSPEND_SECS = 3600
  COMMENT = 'Banking HOL: Streamlit container runtime (DA3)';
GRANT USAGE, MONITOR ON COMPUTE POOL HOL_COMPUTE_POOL_CPU TO ROLE HOL_PARTICIPANT;
-- DS1/DS2: model training runs as an ML Job on its own pool. The notebook kernel stays on the small
-- NOTEBOOK_POOL (1 XS node, 6 GiB, shared by every open notebook); training gets 13 GiB to itself.
CREATE COMPUTE POOL IF NOT EXISTS DS_TRAINING_POOL
    MIN_NODES = 1 MAX_NODES = 1 INSTANCE_FAMILY = CPU_X64_S
    AUTO_RESUME = TRUE AUTO_SUSPEND_SECS = 600 INITIALLY_SUSPENDED = TRUE
    COMMENT = 'Banking HOL: ML Jobs for DS1 and DS2 model training';
GRANT USAGE, MONITOR ON COMPUTE POOL DS_TRAINING_POOL TO ROLE HOL_PARTICIPANT;
-- Container runtime installs streamlit/pydeck from PyPI, so it needs external access
CREATE NETWORK RULE IF NOT EXISTS BANKING_HOL.ANALYTICS.PYPI_NETWORK_RULE MODE = EGRESS TYPE = HOST_PORT
  VALUE_LIST = ('pypi.org', 'pypi.python.org', 'pythonhosted.org', 'files.pythonhosted.org');
-- PYPI_ACCESS_INTEGRATION: created by LAB.ENSURE_EXTERNAL_ACCESS() (end of this file)
-- Lab Companion exec demo basemap: the SPCS proxy's CSP only lets the page load
-- hosts the service's EAIs allow, so the browser needs this to fetch Esri tiles
CREATE NETWORK RULE IF NOT EXISTS BANKING_HOL.ANALYTICS.BASEMAP_NETWORK_RULE MODE = EGRESS TYPE = HOST_PORT
  VALUE_LIST = ('server.arcgisonline.com');
-- BASEMAP_ACCESS_INTEGRATION: created by LAB.ENSURE_EXTERNAL_ACCESS() (end of this file)

-- The exec demo's "Every AI call on the record" stop reads AI usage from ACCOUNT_USAGE through an
-- owner's-rights procedure owned by HOL_ADMIN (BANKING_DEMO.EXEC.DEMO_AI_AUDIT). Participants don't get this role.
GRANT DATABASE ROLE SNOWFLAKE.USAGE_VIEWER TO ROLE HOL_ADMIN;
GRANT APPLY MASKING POLICY    ON ACCOUNT TO ROLE HOL_PARTICIPANT;          -- GOV1
GRANT APPLY ROW ACCESS POLICY ON ACCOUNT TO ROLE HOL_PARTICIPANT;
GRANT APPLY TAG               ON ACCOUNT TO ROLE HOL_PARTICIPANT;
GRANT CREATE DATABASE ON ACCOUNT TO ROLE HOL_ADMIN;

-- GOV3 AI governance: the app (HOL_ADMIN) reads every user's gateway traces for checks
GRANT MONITOR ON AI GATEWAY SNOWFLAKE TO ROLE HOL_ADMIN;

-- DE3 real-time analytics: attendees stream into REALTIME and serve it from one shared
-- interactive warehouse. It's created suspended; once resumed it bills for at least
-- 24 hours (AUTO_SUSPEND minimum 86400), so the facilitator suspends it after the lab.
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.REALTIME COMMENT = 'DE3: incident detection on payments mirrored from Snowflake Postgres';
GRANT OWNERSHIP ON SCHEMA BANKING_HOL.REALTIME TO ROLE HOL_ADMIN COPY CURRENT GRANTS;
GRANT ALL ON SCHEMA BANKING_HOL.REALTIME TO ROLE HOL_PARTICIPANT;

-- Attendee schemas: whatever role a session runs as, what attendees build is owned by
-- HOL_PARTICIPANT. Event logins also hold ACCOUNTADMIN, so a Workspace or notebook session
-- can create objects as ACCOUNTADMIN that HOL_PARTICIPANT then can't use ("already exists,
-- but current role has no privileges on it"). Also hands over anything already created
-- under another role, so rerunning this script repairs an account. (Streamlit apps have
-- no future grant; DA3 creates its app as HOL_PARTICIPANT.)
EXECUTE IMMEDIATE $$
DECLARE
  schemas ARRAY DEFAULT ['ANALYTICS', 'AGENTS', 'GOVERNANCE', 'REALTIME'];
  kinds ARRAY DEFAULT ['TABLES', 'DYNAMIC TABLES', 'VIEWS', 'SEMANTIC VIEWS', 'FUNCTIONS', 'PROCEDURES',
                       'TASKS', 'STAGES', 'NOTEBOOKS', 'AGENTS', 'MCP SERVERS', 'CORTEX SEARCH SERVICES'];
  existing ARRAY DEFAULT ['TABLES', 'DYNAMIC TABLES', 'VIEWS'];
  s STRING;
  k STRING;
BEGIN
  FOR i IN 0 TO ARRAY_SIZE(:schemas) - 1 DO
    s := 'BANKING_HOL.' || :schemas[i];
    FOR j IN 0 TO ARRAY_SIZE(:kinds) - 1 DO
      k := :kinds[j];
      BEGIN
        EXECUTE IMMEDIATE 'GRANT OWNERSHIP ON FUTURE ' || :k || ' IN SCHEMA ' || :s || ' TO ROLE HOL_PARTICIPANT';
      EXCEPTION
        -- a rerun: the future grant is already there
        WHEN STATEMENT_ERROR THEN
          IF (NOT CONTAINS(SQLERRM, 'already exists')) THEN
            RAISE;
          END IF;
      END;
    END FOR;
    FOR j IN 0 TO ARRAY_SIZE(:existing) - 1 DO
      k := :existing[j];
      EXECUTE IMMEDIATE 'GRANT OWNERSHIP ON ALL ' || :k || ' IN SCHEMA ' || :s || ' TO ROLE HOL_PARTICIPANT COPY CURRENT GRANTS';
    END FOR;
  END FOR;
  RETURN 'attendee schema ownership set';
END;
$$;
CREATE INTERACTIVE WAREHOUSE IF NOT EXISTS HOL_INTERACTIVE_WH
  WAREHOUSE_SIZE = XSMALL INITIALLY_SUSPENDED = TRUE AUTO_RESUME = TRUE
  COMMENT = 'DE3 shared interactive warehouse: suspend after the lab (24 h minimum once resumed)';
GRANT USAGE ON WAREHOUSE HOL_INTERACTIVE_WH TO ROLE HOL_PARTICIPANT;
-- CREATE WAREHOUSE makes it current; scripts and procedures can't run on an interactive warehouse
USE WAREHOUSE BANKING_WH;

-- GOV3/DE3 notebooks call the account's own public endpoint (AI gateway) and Snowflake Postgres
-- (DE3, any instance host on 5432), and install packages from PyPI, so they need external access to all three.
-- Postgres hosts look like <instance-id>.<org>-<account>.<region>.<cloud>.postgres.snowflake.app, and
-- network rule wildcards match one subdomain level only, so the wildcard sits just above the instance id.
EXECUTE IMMEDIATE $$
DECLARE
  account_host STRING DEFAULT (SELECT LOWER(CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME()) || '.snowflakecomputing.com');
  -- CURRENT_REGION() is e.g. AWS_US_WEST_2 (or PUBLIC.AWS_US_WEST_2): the cloud, then the region parts
  region STRING DEFAULT (SELECT LOWER(SPLIT_PART(CURRENT_REGION(), '.', -1)));
  pg_hosts STRING;
BEGIN
  pg_hosts := '*.' || REPLACE(LOWER(CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME()), '_', '-') || '.'
    || REPLACE(SUBSTR(:region, POSITION('_' IN :region) + 1), '_', '-') || '.' || SPLIT_PART(:region, '_', 1) || '.postgres.snowflake.app:5432';
  EXECUTE IMMEDIATE 'CREATE OR REPLACE NETWORK RULE BANKING_HOL.ANALYTICS.HOL_NOTEBOOK_EGRESS_RULE MODE = EGRESS TYPE = HOST_PORT VALUE_LIST = ('''
    || :account_host || ''', ''' || REPLACE(:account_host, '_', '-') || ''', ''pypi.org'', ''pypi.python.org'', ''pythonhosted.org'', ''files.pythonhosted.org'', ''*.postgres.snowflake.app:5432'', '''
    || :pg_hosts || ''')';
END;
$$;
-- HOL_NOTEBOOK_ACCESS_INTEGRATION: created by LAB.ENSURE_EXTERNAL_ACCESS() (end of this file)

-- DE3 streaming source: each attendee creates Snowflake Postgres instance HOL_PAYMENTS_PG and
-- mirrors it into Snowflake-managed Iceberg (Snowpipe Streaming can't sign in from a notebook).
-- Mirroring needs STANDARD (not BURSTABLE) compute; the instance bills while it runs.
GRANT CREATE POSTGRES INSTANCE ON ACCOUNT TO ROLE HOL_PARTICIPANT;
-- On a brand-new account SNOWFLAKE.POSTGRES_MIRROR_ADMIN can be missing until Snowflake sets up the
-- Postgres feature, so the grant must not fail provisioning. If it's missing now,
-- LAB.RETRY_LATE_GRANTS_TASK (section 0.7) keeps trying until it succeeds.
EXECUTE IMMEDIATE $$
BEGIN
  SHOW POSTGRES INSTANCES;
  GRANT APPLICATION ROLE SNOWFLAKE.POSTGRES_MIRROR_ADMIN TO ROLE HOL_PARTICIPANT;
  RETURN 'Granted SNOWFLAKE.POSTGRES_MIRROR_ADMIN to HOL_PARTICIPANT';
EXCEPTION
  WHEN OTHER THEN
    RETURN 'WARNING: SNOWFLAKE.POSTGRES_MIRROR_ADMIN not available yet (DE3 mirror step needs it): ' || SQLERRM;
END;
$$;
-- Inbound to Postgres only from Snowflake: the notebook (and the mirror) connect from Snowflake's
-- published egress IP ranges for this region, so laptops and the open internet are refused.
-- Postgres rules can only hold IPv4 ranges, and these ranges are shared by the region's Snowflake
-- accounts, so the password still matters. Rebuilt on every run (ranges change; expiry in the output).
CREATE NETWORK RULE IF NOT EXISTS BANKING_HOL.REALTIME.HOL_PG_INGRESS_RULE
  TYPE = IPV4 MODE = POSTGRES_INGRESS VALUE_LIST = ('127.0.0.1/32')
  COMMENT = 'DE3: Snowflake egress IP ranges allowed to reach the lab Postgres instance';
EXECUTE IMMEDIATE $$
DECLARE
  ranges VARCHAR;
BEGIN
  SELECT LISTAGG('''' || value:ipv4_prefix::VARCHAR || '''', ', ') INTO :ranges
    FROM TABLE(FLATTEN(INPUT => PARSE_JSON(SYSTEM$GET_SNOWFLAKE_EGRESS_IP_RANGES())))
    WHERE value:ipv4_prefix IS NOT NULL AND value:expires::TIMESTAMP_TZ > CURRENT_TIMESTAMP();
  IF (ranges IS NULL OR ranges = '') THEN
    RETURN 'WARNING: no Snowflake egress IP ranges for this region; HOL_PG_INGRESS_RULE left unchanged';
  END IF;
  EXECUTE IMMEDIATE 'ALTER NETWORK RULE BANKING_HOL.REALTIME.HOL_PG_INGRESS_RULE SET VALUE_LIST = (' || ranges || ')';
  RETURN 'HOL_PG_INGRESS_RULE allows Snowflake egress only: ' || ranges;
END;
$$;
CREATE NETWORK POLICY IF NOT EXISTS HOL_PG_POLICY
  ALLOWED_NETWORK_RULE_LIST = ('BANKING_HOL.REALTIME.HOL_PG_INGRESS_RULE')
  COMMENT = 'DE3: attach to HOL_PAYMENTS_PG';
GRANT USAGE ON NETWORK POLICY HOL_PG_POLICY TO ROLE HOL_PARTICIPANT;
-- The admin password appears once, in the CREATE output; the attendee's helper saves it here
-- (IF NOT EXISTS: a rerun must never wipe a saved password). The Lab Companion reveals it.
CREATE SECRET IF NOT EXISTS BANKING_HOL.REALTIME.PG_ADMIN_SECRET
  TYPE = PASSWORD USERNAME = 'not-set' PASSWORD = 'not-set'
  COMMENT = 'DE3: HOL_PAYMENTS_PG snowflake_admin credentials, saved when the instance is created';
GRANT OWNERSHIP ON SECRET BANKING_HOL.REALTIME.PG_ADMIN_SECRET TO ROLE HOL_PARTICIPANT COPY CURRENT GRANTS;
-- HOL_PG_SECRET_INTEGRATION: created by LAB.ENSURE_EXTERNAL_ACCESS() (end of this file)
USE ROLE HOL_ADMIN;
-- Owner's rights, owned by HOL_ADMIN (the app's role): attendees can't call it from SQL
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.PG_CONNECTION_INFO()
  RETURNS VARIANT LANGUAGE PYTHON RUNTIME_VERSION = '3.11' PACKAGES = ('snowflake-snowpark-python')
  HANDLER = 'run'
  COMMENT = 'DE3: host, port, database, user and password for HOL_PAYMENTS_PG (Lab Companion reveal)'
  EXECUTE AS OWNER
AS $$
import _snowflake

def run(session):
    rows = session.sql("SHOW POSTGRES INSTANCES LIKE 'HOL_PAYMENTS_PG'").collect()
    if not rows:
        return {"ready": False, "message": "HOL_PAYMENTS_PG doesn't exist yet: run the create cell in the DE3 notebook."}
    row = rows[0].as_dict()
    try:
        cred = _snowflake.get_username_password("pg")
    except Exception:
        return {"ready": False, "state": row.get("state"),
                "message": "This account has no external access (for example a trial), so the password can't be revealed here."}
    if cred.password == "not-set":
        return {"ready": False, "state": row.get("state"),
                "message": "The password wasn't saved. Run the reset cell in the DE3 notebook."}
    return {"ready": row.get("state") == "READY", "state": row.get("state"), "host": row.get("host"),
            "port": 5432, "database": "postgres", "user": cred.username, "password": cred.password}
$$;
-- the secret is attached by LAB.ENSURE_EXTERNAL_ACCESS(), once its integration exists
USE ROLE ACCOUNTADMIN;

-- Snowflake CoWork (formerly Snowflake Intelligence) lists agents in SNOWFLAKE_INTELLIGENCE.AGENTS
CREATE DATABASE IF NOT EXISTS SNOWFLAKE_INTELLIGENCE;
CREATE SCHEMA IF NOT EXISTS SNOWFLAKE_INTELLIGENCE.AGENTS;
GRANT USAGE ON DATABASE SNOWFLAKE_INTELLIGENCE TO ROLE HOL_PARTICIPANT;
GRANT USAGE, CREATE AGENT ON SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS TO ROLE HOL_PARTICIPANT;

-- -----------------------------------------------------
-- 0.5 Marketplace: Cortex Knowledge Extension (AI3)
-- Cortex Search is covered separately by AI5 (setup/10b_search_lab.sql).
-- A Knowledge Extension is a provider-hosted, pre-built search service:
-- no bank data is vectorised. Snowflake Documentation is used here;
-- swap for a finance publisher (e.g. Investopedia) if it has been
-- requested and approved in Snowsight for the lab account.
-- -----------------------------------------------------
CALL SYSTEM$ACCEPT_LEGAL_TERMS('DATA_EXCHANGE_LISTING', 'GZSTZ67BY9OQ4');
CREATE DATABASE IF NOT EXISTS SNOWFLAKE_DOCS_CKE FROM LISTING 'GZSTZ67BY9OQ4';
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE_DOCS_CKE TO ROLE HOL_PARTICIPANT;

-- -----------------------------------------------------
-- 0.6 DataOps passwordless events (single sign-on through DataOps.live)
-- The SSO login creates its own user when the attendee registers, after this setup
-- has run: a 64-character hex name, no password, default role ACCOUNTADMIN. A task
-- gives that user the lab defaults (first and display name Attendee, HOL_PARTICIPANT, BANKING_WH),
-- then suspends itself. Only switched on where DataOps' Authentik integration exists,
-- so standalone installs and password events are untouched.
-- -----------------------------------------------------
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.ADOPT_SSO_ATTENDEES()
  RETURNS VARCHAR LANGUAGE PYTHON RUNTIME_VERSION = '3.11'
  PACKAGES = ('snowflake-snowpark-python') HANDLER = 'run'
  COMMENT = 'DataOps passwordless events: give SSO-created attendee users the lab defaults'
  EXECUTE AS OWNER
AS $$
import re

def q(name):
    return '"' + name.replace('"', '""') + '"'

def run(session):
    if not session.sql("SHOW SECURITY INTEGRATIONS LIKE 'AUTHENTIK%'").collect():
        return "no DataOps SSO integration: nothing to do"
    done, ready = [], 0
    for r in session.sql("SHOW USERS").collect():
        u = r.as_dict()
        name = u["name"]
        if not re.fullmatch(r"[0-9a-f]{64}", name) or str(u.get("has_password")).lower() == "true":
            continue
        if (u.get("default_role") == "HOL_PARTICIPANT" and u.get("first_name") == "Attendee"
                and u.get("display_name") == "Attendee"):
            ready += 1
            continue
        session.sql(f"GRANT ROLE HOL_PARTICIPANT TO USER {q(name)}").collect()
        session.sql(f"""ALTER USER {q(name)} SET FIRST_NAME = 'Attendee', DISPLAY_NAME = 'Attendee', DEFAULT_ROLE = HOL_PARTICIPANT,
            DEFAULT_WAREHOUSE = BANKING_WH, DEFAULT_NAMESPACE = BANKING_HOL, DEFAULT_SECONDARY_ROLES = ()""").collect()
        done.append(name[:8])
    if done or ready:
        # one attendee per DataOps account: nothing left to watch for
        session.sql("ALTER TASK IF EXISTS BANKING_HOL.LAB.ADOPT_SSO_ATTENDEES_TASK SUSPEND").collect()
    return ("adopted " + ", ".join(done)) if done else "no new SSO attendees"
$$;
CREATE OR REPLACE TASK BANKING_HOL.LAB.ADOPT_SSO_ATTENDEES_TASK
  SCHEDULE = '2 MINUTE'
  USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
  COMMENT = 'DataOps passwordless events: set up the attendee SSO user once they register'
  AS CALL BANKING_HOL.LAB.ADOPT_SSO_ATTENDEES();
EXECUTE IMMEDIATE $$
BEGIN
  SHOW SECURITY INTEGRATIONS LIKE 'AUTHENTIK%';
  IF ((SELECT COUNT(*) FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))) > 0) THEN
    ALTER TASK BANKING_HOL.LAB.ADOPT_SSO_ATTENDEES_TASK RESUME;
    RETURN 'DataOps SSO found: ADOPT_SSO_ATTENDEES_TASK running until the attendee signs in';
  END IF;
  RETURN 'No DataOps SSO integration: ADOPT_SSO_ATTENDEES_TASK left suspended';
END;
$$;

SELECT 'Setup 00 complete - now run 01_seed_synthetic_data.sql as HOL_ADMIN' AS STATUS;

-- -----------------------------------------------------
-- 0.7 Grants that a brand-new account can't take yet
-- SNOWFLAKE.POSTGRES_MIRROR_ADMIN (DE3 mirror) and SNOWFLAKE.EVENTS_VIEWER (DS job logs) can appear
-- some minutes after the account is created, after this setup has run. A task retries them every
-- 10 minutes and suspends itself once HOL_PARTICIPANT has both.
-- -----------------------------------------------------
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.RETRY_LATE_GRANTS()
  RETURNS VARCHAR LANGUAGE SQL
  COMMENT = 'Grant application roles that appear after provisioning, then stop retrying'
  EXECUTE AS OWNER
AS $$
DECLARE
  missing INTEGER DEFAULT 0;
BEGIN
  BEGIN
    GRANT APPLICATION ROLE SNOWFLAKE.POSTGRES_MIRROR_ADMIN TO ROLE HOL_PARTICIPANT;
  EXCEPTION WHEN OTHER THEN missing := missing + 1;
  END;
  BEGIN
    GRANT APPLICATION ROLE SNOWFLAKE.EVENTS_VIEWER TO ROLE HOL_PARTICIPANT;
  EXCEPTION WHEN OTHER THEN missing := missing + 1;
  END;
  IF (missing = 0) THEN
    ALTER TASK IF EXISTS BANKING_HOL.LAB.RETRY_LATE_GRANTS_TASK SUSPEND;
    RETURN 'All late grants in place';
  END IF;
  RETURN missing || ' grant(s) still unavailable; retrying in 10 minutes';
END;
$$;
CREATE OR REPLACE TASK BANKING_HOL.LAB.RETRY_LATE_GRANTS_TASK
  SCHEDULE = '10 MINUTE'
  USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
  COMMENT = 'Retries POSTGRES_MIRROR_ADMIN and EVENTS_VIEWER grants until both succeed'
  AS CALL BANKING_HOL.LAB.RETRY_LATE_GRANTS();
EXECUTE IMMEDIATE $$
DECLARE
  result VARCHAR;
BEGIN
  CALL BANKING_HOL.LAB.RETRY_LATE_GRANTS() INTO :result;
  IF (result <> 'All late grants in place') THEN
    ALTER TASK BANKING_HOL.LAB.RETRY_LATE_GRANTS_TASK RESUME;
  END IF;
  RETURN result;
END;
$$;

-- -----------------------------------------------------
-- 0.8 External access integrations
-- Trial accounts can't create external access integrations, so each one is tried on its own and
-- skipped if it fails. If the account team enables external access later, the Lab Companion's
-- "Check again" button calls this procedure (owner's rights, as ACCOUNTADMIN) to create them.
-- The statements run through EXECUTE IMMEDIATE: on a trial, a literal CREATE EXTERNAL ACCESS
-- INTEGRATION fails when the procedure is compiled, not when it runs.
-- The network rules it uses are created earlier in this file.
-- -----------------------------------------------------
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.ENSURE_EXTERNAL_ACCESS()
  RETURNS VARIANT LANGUAGE SQL
  COMMENT = 'Creates the lab''s external access integrations where the account allows them; returns which exist'
  EXECUTE AS OWNER
AS $$
DECLARE
  created ARRAY DEFAULT ARRAY_CONSTRUCT();
  skipped ARRAY DEFAULT ARRAY_CONSTRUCT();
  reason VARCHAR DEFAULT NULL;
BEGIN
  BEGIN
    EXECUTE IMMEDIATE 'CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS PYPI_ACCESS_INTEGRATION ALLOWED_NETWORK_RULES = (BANKING_HOL.ANALYTICS.PYPI_NETWORK_RULE) ENABLED = TRUE COMMENT = ''DA3 map app and APP1: install packages from PyPI''';
    GRANT USAGE ON INTEGRATION PYPI_ACCESS_INTEGRATION TO ROLE HOL_PARTICIPANT;
    created := ARRAY_APPEND(:created, 'PYPI_ACCESS_INTEGRATION');
  EXCEPTION WHEN OTHER THEN
    skipped := ARRAY_APPEND(:skipped, 'PYPI_ACCESS_INTEGRATION');
    reason := SQLERRM;
  END;
  BEGIN
    -- the exec demo basemap: the app's ingress CSP only allows hosts its EAIs allow
    EXECUTE IMMEDIATE 'CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS BASEMAP_ACCESS_INTEGRATION ALLOWED_NETWORK_RULES = (BANKING_HOL.ANALYTICS.BASEMAP_NETWORK_RULE) ENABLED = TRUE COMMENT = ''Lab Companion exec demo: Esri basemap tiles''';
    GRANT USAGE ON INTEGRATION BASEMAP_ACCESS_INTEGRATION TO ROLE HOL_ADMIN;
    created := ARRAY_APPEND(:created, 'BASEMAP_ACCESS_INTEGRATION');
  EXCEPTION WHEN OTHER THEN
    skipped := ARRAY_APPEND(:skipped, 'BASEMAP_ACCESS_INTEGRATION');
    reason := SQLERRM;
  END;
  BEGIN
    EXECUTE IMMEDIATE 'CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS HOL_NOTEBOOK_ACCESS_INTEGRATION ALLOWED_NETWORK_RULES = (BANKING_HOL.ANALYTICS.HOL_NOTEBOOK_EGRESS_RULE) ENABLED = TRUE COMMENT = ''GOV3/DE3 notebooks: this account''''s endpoint (AI gateway), Snowflake Postgres and PyPI''';
    GRANT USAGE ON INTEGRATION HOL_NOTEBOOK_ACCESS_INTEGRATION TO ROLE HOL_PARTICIPANT;
    created := ARRAY_APPEND(:created, 'HOL_NOTEBOOK_ACCESS_INTEGRATION');
  EXCEPTION WHEN OTHER THEN
    skipped := ARRAY_APPEND(:skipped, 'HOL_NOTEBOOK_ACCESS_INTEGRATION');
    reason := SQLERRM;
  END;
  BEGIN
    EXECUTE IMMEDIATE 'CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS HOL_PG_SECRET_INTEGRATION ALLOWED_NETWORK_RULES = (BANKING_HOL.ANALYTICS.HOL_NOTEBOOK_EGRESS_RULE) ALLOWED_AUTHENTICATION_SECRETS = (BANKING_HOL.REALTIME.PG_ADMIN_SECRET) ENABLED = TRUE COMMENT = ''DE3: lets the Lab Companion read PG_ADMIN_SECRET (reveal button)''';
    GRANT USAGE ON INTEGRATION HOL_PG_SECRET_INTEGRATION TO ROLE HOL_ADMIN;
    -- the DE3 password reveal reads the saved secret through this integration
    EXECUTE IMMEDIATE 'ALTER PROCEDURE BANKING_HOL.LAB.PG_CONNECTION_INFO() SET EXTERNAL_ACCESS_INTEGRATIONS = (HOL_PG_SECRET_INTEGRATION) SECRETS = (''pg'' = BANKING_HOL.REALTIME.PG_ADMIN_SECRET)';
    created := ARRAY_APPEND(:created, 'HOL_PG_SECRET_INTEGRATION');
  EXCEPTION WHEN OTHER THEN
    skipped := ARRAY_APPEND(:skipped, 'HOL_PG_SECRET_INTEGRATION');
    reason := SQLERRM;
  END;
  RETURN OBJECT_CONSTRUCT('available', :created, 'skipped', :skipped, 'reason', :reason);
END;
$$;
-- the Lab Companion runs as HOL_ADMIN
GRANT USAGE ON PROCEDURE BANKING_HOL.LAB.ENSURE_EXTERNAL_ACCESS() TO ROLE HOL_ADMIN;
CALL BANKING_HOL.LAB.ENSURE_EXTERNAL_ACCESS();
