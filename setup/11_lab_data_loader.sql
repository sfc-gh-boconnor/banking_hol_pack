-- =====================================================
-- BANKING HOL PACK - FACILITATOR SETUP
-- STEP 11: LOAD THE LAB DATA INSIDE SNOWFLAKE
--
-- One procedure loads every lab data set from the lab's Git repository, so
-- provisioning needs one CALL instead of a CLI upload and script per data set:
--
--   CALL BANKING_HOL.LAB.LOAD_LAB_DATA('ALL');      -- everything (DataOps, INSTALL.sql)
--   CALL BANKING_HOL.LAB.LOAD_LAB_DATA('RETAIL');   -- retail banking + text and evidence
--   CALL BANKING_HOL.LAB.LOAD_LAB_DATA('TEXT');     -- text and evidence only (AI4, AI5, DS)
--   CALL BANKING_HOL.LAB.LOAD_LAB_DATA('DEMO');     -- rebuild the executive demo (BANKING_DEMO) from the lab data
--
-- The second argument switches the optional Cortex Search lab (AI5, setup 10b):
-- TRUE or FALSE, or NULL (default) to keep it only where SEARCH_LAB already exists.
--
-- The data is generated and validated by the lab author (setup/tools/) and
-- committed to the repo; nothing here generates data or calls AI.
-- Each step is logged to LAB.DATA_LOAD_LOG, which the Lab Companion's
-- "Refresh lab data" button reads for its progress bar.
--
-- Caller's rights: the data scripts set their own role and schema (USE), which
-- owner's-rights procedures can't run. Callers need HOL_ADMIN.
-- Run as ACCOUNTADMIN after git_repo.sql (needs the HOL_REPO Git repository).
-- =====================================================

USE ROLE ACCOUNTADMIN;
-- HOL_ADMIN fetches and reads the lab repository inside the procedure
GRANT USAGE ON DATABASE BANKING_HOL_SETUP TO ROLE HOL_ADMIN;
GRANT USAGE ON SCHEMA BANKING_HOL_SETUP.PUBLIC TO ROLE HOL_ADMIN;
GRANT READ, WRITE ON GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO TO ROLE HOL_ADMIN;
GRANT EXECUTE TASK ON ACCOUNT TO ROLE HOL_ADMIN;
-- the executive demo's Snowflake Alert (12f)
GRANT EXECUTE ALERT ON ACCOUNT TO ROLE HOL_ADMIN;

USE ROLE HOL_ADMIN;
USE WAREHOUSE BANKING_WH;
CREATE SCHEMA IF NOT EXISTS BANKING_HOL.LAB;

CREATE TABLE IF NOT EXISTS BANKING_HOL.LAB.DATA_LOAD_LOG (
    RUN_ID        VARCHAR,
    SCOPE         VARCHAR,
    STEP_NO       INTEGER,
    STEP_TOTAL    INTEGER,
    STEP_NAME     VARCHAR,
    STATUS        VARCHAR,      -- RUNNING, DONE, FAILED
    STARTED_AT    TIMESTAMP_LTZ,
    FINISHED_AT   TIMESTAMP_LTZ,
    ERROR_MESSAGE VARCHAR
) COMMENT = 'Lab data loads (LOAD_LAB_DATA): one row per step, read by the Lab Companion progress bar';
GRANT SELECT ON TABLE BANKING_HOL.LAB.DATA_LOAD_LOG TO ROLE HOL_PARTICIPANT;

-- Provisioning settings written by provision_account.sh (LAB_START, LAB_END, WAKE_LEAD_MINUTES,
-- INCLUDE_SEARCH) and results the background setup records (APP_URL)
CREATE TABLE IF NOT EXISTS BANKING_HOL.LAB.SETUP_CONFIG (
    KEY        VARCHAR NOT NULL,
    VALUE      VARCHAR,
    UPDATED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP()
) COMMENT = 'Lab provisioning settings and results (APP_URL), read by SETUP_STATUS';

CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.LOAD_LAB_DATA(SCOPE VARCHAR DEFAULT 'ALL', INCLUDE_SEARCH BOOLEAN DEFAULT NULL)
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Load the lab data sets from the lab Git repository (ALL, RETAIL or TEXT), logging each step to LAB.DATA_LOAD_LOG'
EXECUTE AS CALLER
AS
$$
DECLARE
    run_id     VARCHAR DEFAULT UUID_STRING();
    repo       VARCHAR DEFAULT '@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/';
    scope_u    VARCHAR DEFAULT UPPER(COALESCE(SCOPE, 'ALL'));
    search     BOOLEAN DEFAULT INCLUDE_SEARCH;
    all_steps  ARRAY;
    steps      ARRAY DEFAULT ARRAY_CONSTRUCT();
    step_total INTEGER;
    step_no    INTEGER DEFAULT 0;
    step_name  VARCHAR;
    step_sql   VARCHAR;
    t0         TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
    -- some scripts end on another role (USE ROLE HOL_PARTICIPANT): put the caller's back after each step
    use_role   VARCHAR DEFAULT 'USE ROLE ' || CURRENT_ROLE();
BEGIN
    IF (scope_u NOT IN ('ALL', 'RETAIL', 'TEXT', 'DEMO', 'RESET', 'PROVISION')) THEN
        RETURN 'Unknown scope ' || scope_u || ': use ALL, RETAIL, TEXT, DEMO, RESET or PROVISION';
    END IF;
    IF (search IS NULL AND scope_u = 'PROVISION') THEN
        -- a new account: the Cortex Search lab is on unless provisioning switched it off
        SELECT COALESCE(MAX(TRY_TO_BOOLEAN(VALUE)), TRUE) INTO :search FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'INCLUDE_SEARCH';
    END IF;
    IF (search IS NULL) THEN
        SELECT COUNT(*) > 0 INTO :search FROM BANKING_HOL.INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'SEARCH_LAB';
    END IF;

    CREATE SCHEMA IF NOT EXISTS BANKING_HOL.RETAIL;
    CREATE STAGE IF NOT EXISTS BANKING_HOL.RETAIL.ORS_SEED;
    CREATE STAGE IF NOT EXISTS BANKING_HOL.RETAIL.RB_SEED;
    CREATE STAGE IF NOT EXISTS BANKING_HOL.RETAIL.FINCRIME_EVIDENCE DIRECTORY = (ENABLE = TRUE) ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');

    -- [name, scopes, one SQL statement]; scripts run with EXECUTE IMMEDIATE FROM the repo
    all_steps := ARRAY_CONSTRUCT(
        ARRAY_CONSTRUCT('Fetch the lab repository',       'ALL,RETAIL,TEXT,DEMO,PROVISION', 'ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH'),
        -- PROVISION: a new account's setup, in the background (the app is built alongside it by
        -- provision_account.sh: its remote build needs a user session, which a task doesn't have)
        ARRAY_CONSTRUCT('Corporate payments source data', 'ALL,PROVISION',   'EXECUTE IMMEDIATE FROM ' || repo || 'setup/01_seed_synthetic_data.sql'),
        ARRAY_CONSTRUCT('Publish sources as Iceberg',     'ALL,PROVISION',   'EXECUTE IMMEDIATE FROM ' || repo || 'setup/02_publish_iceberg.sql'),
        ARRAY_CONSTRUCT('Copy branch travel times',       'ALL,PROVISION',   'COPY FILES INTO @BANKING_HOL.RETAIL.ORS_SEED FROM ' || repo || 'data/retail/'),
        ARRAY_CONSTRUCT('Retail branch network (DA3)',    'ALL,PROVISION',   'EXECUTE IMMEDIATE FROM ' || repo || 'setup/07_retail_geo_seed.sql'),
        ARRAY_CONSTRUCT('Business banking customers (DA3)', 'ALL,PROVISION', 'EXECUTE IMMEDIATE FROM ' || repo || 'setup/07b_business_banking_seed.sql'),
        ARRAY_CONSTRUCT('Spark lab status feed (DE4)',   'ALL,PROVISION',   'EXECUTE IMMEDIATE FROM ' || repo || 'setup/07c_spark_lab_seed.sql'),
        ARRAY_CONSTRUCT('Copy retail banking data',       'ALL,RETAIL,PROVISION', 'COPY FILES INTO @BANKING_HOL.RETAIL.RB_SEED FROM ' || repo || 'data/retail_bank/ PATTERN = ''.*[.]csv[.]gz'''),
        ARRAY_CONSTRUCT('Retail banking tables',          'ALL,RETAIL,PROVISION', 'EXECUTE IMMEDIATE FROM ' || repo || 'setup/08_retail_bank_seed.sql'),
        ARRAY_CONSTRUCT('Copy calls, emails and cases',   'ALL,RETAIL,TEXT,PROVISION', 'COPY FILES INTO @BANKING_HOL.RETAIL.RB_SEED/text/ FROM ' || repo || 'data/retail_text/ PATTERN = ''.*rb_[a-z_]+[.]csv[.]gz'''),
        ARRAY_CONSTRUCT('Copy fraud evidence files',      'ALL,RETAIL,TEXT,PROVISION', 'COPY FILES INTO @BANKING_HOL.RETAIL.FINCRIME_EVIDENCE FROM ' || repo || 'data/retail_text/evidence/'),
        ARRAY_CONSTRUCT('Text tables and ML schema',      'ALL,RETAIL,TEXT,PROVISION', 'EXECUTE IMMEDIATE FROM ' || repo || 'setup/10_retail_text_seed.sql'),
        -- trains the DS1 and DS4 models once, so the Fast-forward catch-ups copy them instead of training
        ARRAY_CONSTRUCT('Pre-trained DS1 and DS4 models',  'ALL,RETAIL,PROVISION', 'EXECUTE IMMEDIATE FROM ' || repo || 'setup/10c_ml_reference.sql'),
        ARRAY_CONSTRUCT('Cortex Search lab (AI5)',        'SEARCH',          'EXECUTE IMMEDIATE FROM ' || repo || 'setup/10b_search_lab.sql'),
        ARRAY_CONSTRUCT('Audit pack',                     'PROVISION',       'EXECUTE IMMEDIATE FROM ' || repo || 'setup/06_audit_pack.sql'),
        ARRAY_CONSTRUCT('CoWork pack',                    'PROVISION',       'EXECUTE IMMEDIATE FROM ' || repo || 'setup/09_cowork_pack.sql'),
        ARRAY_CONSTRUCT('dbt project',                    'PROVISION',       'EXECUTE IMMEDIATE FROM ' || repo || 'setup/13_lab_objects.sql'),
        -- Executive demo: its own BANKING_DEMO database, cloned from the lab data and never part of the lab
        ARRAY_CONSTRUCT('Demo: copy the lab data',        'DEMO,PROVISION',  'EXECUTE IMMEDIATE FROM ' || repo || 'setup/12a_demo_data.sql'),
        ARRAY_CONSTRUCT('Demo: maps, branches, network',  'DEMO,PROVISION',  'EXECUTE IMMEDIATE FROM ' || repo || 'setup/12b_demo_insights.sql'),
        ARRAY_CONSTRUCT('Demo: models and AI results',    'DEMO,PROVISION',  'EXECUTE IMMEDIATE FROM ' || repo || 'setup/12c_demo_ai.sql'),
        ARRAY_CONSTRUCT('Demo: semantic views, assistant','DEMO,PROVISION',  'EXECUTE IMMEDIATE FROM ' || repo || 'setup/12d_demo_semantic_agent.sql'),
        ARRAY_CONSTRUCT('Demo: live payment alert, inbox','DEMO,PROVISION',  'EXECUTE IMMEDIATE FROM ' || repo || 'setup/12f_demo_live_alert.sql'),
        ARRAY_CONSTRUCT('Demo: regulation evidence',      'DEMO,PROVISION',  'EXECUTE IMMEDIATE FROM ' || repo || 'setup/12g_demo_regulation.sql'),
        ARRAY_CONSTRUCT('Demo: search and name matching', 'DEMO_SEARCH',     'EXECUTE IMMEDIATE FROM ' || repo || 'setup/12e_demo_search.sql'),
        -- Facilitator reset: drop what attendees built, keep the data, app and demo
        ARRAY_CONSTRUCT('Remove attendee work',           'RESET',           'CALL BANKING_HOL.LAB.RESET_ATTENDEE_WORK()'),
        -- the Fast-forward button reads this: after a reset nothing is built any more
        ARRAY_CONSTRUCT('Clear catch-up history',         'RESET',           'DELETE FROM BANKING_HOL.LAB.CATCHUP_LOG'),
        -- wake and sleep tasks for the event times provisioning stored, if any
        ARRAY_CONSTRUCT('Lab wake schedule',              'PROVISION',       'CALL BANKING_HOL.LAB.SCHEDULE_LAB_FROM_CONFIG()'));
    FOR i IN 0 TO ARRAY_SIZE(all_steps) - 1 DO
        IF (ARRAY_CONTAINS(scope_u::VARIANT, SPLIT(all_steps[i][1]::VARCHAR, ','))
            OR (all_steps[i][1]::VARCHAR = 'SEARCH' AND search AND scope_u NOT IN ('DEMO', 'RESET'))
            OR (all_steps[i][1]::VARCHAR = 'DEMO_SEARCH' AND search AND scope_u IN ('DEMO', 'PROVISION'))) THEN
            steps := ARRAY_APPEND(steps, all_steps[i]);
        END IF;
    END FOR;
    step_total := ARRAY_SIZE(steps);

    -- every step is listed up front, so the progress bar knows the total
    FOR i IN 1 TO step_total DO
        step_name := steps[i - 1][0]::VARCHAR;
        INSERT INTO BANKING_HOL.LAB.DATA_LOAD_LOG (RUN_ID, SCOPE, STEP_NO, STEP_TOTAL, STEP_NAME, STATUS)
        VALUES (:run_id, :scope_u, :i, :step_total, :step_name, 'PENDING');
    END FOR;

    FOR i IN 1 TO step_total DO
        step_no := i;
        step_sql := steps[i - 1][2]::VARCHAR;
        UPDATE BANKING_HOL.LAB.DATA_LOAD_LOG SET STATUS = 'RUNNING', STARTED_AT = CURRENT_TIMESTAMP()
         WHERE RUN_ID = :run_id AND STEP_NO = :step_no;
        EXECUTE IMMEDIATE :step_sql;
        EXECUTE IMMEDIATE :use_role;
        UPDATE BANKING_HOL.LAB.DATA_LOAD_LOG SET STATUS = 'DONE', FINISHED_AT = CURRENT_TIMESTAMP()
         WHERE RUN_ID = :run_id AND STEP_NO = :step_no;
    END FOR;
    IF (scope_u NOT IN ('DEMO', 'RESET')) THEN
        ALTER STAGE BANKING_HOL.RETAIL.FINCRIME_EVIDENCE REFRESH;
    END IF;
    RETURN IFF(scope_u = 'RESET', 'Reset attendee work', IFF(scope_u = 'PROVISION', 'Provisioned the lab', 'Loaded ' || scope_u || ' lab data')) || ': ' || step_total || ' steps in '
        || DATEDIFF('second', t0, CURRENT_TIMESTAMP()) || ' s (run ' || run_id || ')';
EXCEPTION
    WHEN OTHER THEN
        LET err VARCHAR := SQLERRM;
        EXECUTE IMMEDIATE :use_role;
        UPDATE BANKING_HOL.LAB.DATA_LOAD_LOG SET STATUS = 'FAILED', FINISHED_AT = CURRENT_TIMESTAMP(), ERROR_MESSAGE = :err
         WHERE RUN_ID = :run_id AND STEP_NO = :step_no;
        RAISE;
END;
$$;

-- Facilitator reset: removes everything attendees build in the lab, so a session starts clean, and keeps
-- what provisioning built: the source data (RAW_DATA, SEED, RETAIL), the Lab Companion and loader (LAB),
-- the audit and CoWork packs, the CoWork agent, the dbt project object, network rules, secrets and the
-- executive demo (BANKING_DEMO). The lab notebooks in the shared banking-hol-pack Workspace go back to the repo
-- versions. Attendees' personal workspaces and USER$ databases aren't touched.
-- DRY_RUN => TRUE lists what it would drop and changes nothing.
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.RESET_ATTENDEE_WORK(DRY_RUN BOOLEAN DEFAULT FALSE)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
COMMENT = 'Facilitator reset: drop what attendees built in BANKING_HOL and their CoWork agents, reset the banking-hol-pack notebooks; keep data, app and demo'
EXECUTE AS CALLER
AS
$$
DB = "BANKING_HOL"
# schemas attendees build in; everything else in BANKING_HOL is provisioned and left alone
SCHEMAS = ["ANALYTICS", "AGENTS", "APPS", "GOVERNANCE", "ML", "REALTIME", "SEARCH_LAB", "SPARK_LAB", "PUBLIC"]
# provisioned objects that live in those schemas (network rules and secrets are never listed, so never dropped)
KEEP = {"ANALYTICS.BANKING_DBT", "ML.JOB_STAGE", "SPARK_LAB.PAYMENT_STATUS_UPDATES"}
# what an attendee can build, dependants first: (SHOW noun, DROP noun, needs an argument signature)
KINDS = [("TASKS", "TASK", False), ("ALERTS", "ALERT", False), ("AGENTS", "AGENT", False), ("MCP SERVERS", "MCP SERVER", False),
         ("STREAMLITS", "STREAMLIT", False), ("NOTEBOOKS", "NOTEBOOK", False),
         ("CORTEX SEARCH SERVICES", "CORTEX SEARCH SERVICE", False), ("SEMANTIC VIEWS", "SEMANTIC VIEW", False),
         ("DYNAMIC TABLES", "DYNAMIC TABLE", False), ("VIEWS", "VIEW", False), ("ICEBERG TABLES", "ICEBERG TABLE", False),
         ("TABLES", "TABLE", False), ("MODELS", "MODEL", False), ("EXPERIMENTS", "EXPERIMENT", False), ("STREAMS", "STREAM", False),
         ("USER FUNCTIONS", "FUNCTION", True), ("USER PROCEDURES", "PROCEDURE", True), ("STAGES", "STAGE", False),
         ("DBT PROJECTS", "DBT PROJECT", False), ("MASKING POLICIES", "MASKING POLICY", False),
         ("ROW ACCESS POLICIES", "ROW ACCESS POLICY", False), ("TAGS", "TAG", False)]
# CoWork agents attendees publish (OPS1, AI1, AI3, DA3); PAYMENTS_OPS_COWORK is provisioned
SI_KEEP = {"PAYMENTS_OPS_COWORK"}
# The shared lab Workspace: INSTALL.sql records where it made it (WORKSPACE in LAB.SETUP_CONFIG);
# DataOps events create it in DEFAULT_DATABASE.PUBLIC
WS_DEFAULT = 'DEFAULT_DATABASE.PUBLIC."banking-hol-pack"'
# steps that may fail harmlessly: a live version that already exists, nothing new to commit
OPTIONAL = ("Workspace live version", "Workspace commit")


def q(ident):
    return '"' + ident.replace('"', '""') + '"'


def show(session, sql):
    try:
        return [r.as_dict() for r in session.sql(sql).collect()]
    except Exception:
        return []  # object type not available in this account


def targets(session):
    out = []
    # tag-based masking (GOV1): a policy set on a tag can't be dropped, nor the tag, until it's unset
    for schema in SCHEMAS:
        for t in show(session, f"SHOW TAGS IN SCHEMA {DB}.{schema}"):
            tag = f"{DB}.{q(schema)}.{q(t['name'])}"
            for p in show(session, f"SELECT POLICY_DB, POLICY_SCHEMA, POLICY_NAME FROM TABLE({DB}.INFORMATION_SCHEMA.POLICY_REFERENCES("
                                   f"REF_ENTITY_NAME => '{tag.replace(chr(39), chr(39) * 2)}', REF_ENTITY_DOMAIN => 'TAG'))"):
                pol = f"{q(p['POLICY_DB'])}.{q(p['POLICY_SCHEMA'])}.{q(p['POLICY_NAME'])}"
                out.append((f"Unset {p['POLICY_NAME']} from TAG {schema}.{t['name']}", f"ALTER TAG {tag} UNSET MASKING POLICY {pol}"))
    for schema in SCHEMAS:
        for noun, drop, signed in KINDS:
            for r in show(session, f"SHOW {noun} IN SCHEMA {DB}.{schema}"):
                name = r["name"]
                if f"{schema}.{name}" in KEEP:
                    continue
                if noun == "TABLES" and (r.get("is_dynamic") == "Y" or r.get("is_iceberg") == "Y"):
                    continue  # dropped as DYNAMIC or ICEBERG TABLE
                if noun == "VIEWS" and r.get("is_materialized") == "true":
                    drop = "MATERIALIZED VIEW"
                fqn = f"{DB}.{q(schema)}.{q(name)}"
                if signed:  # "NAME(NUMBER, VARCHAR) RETURN NUMBER" -> (NUMBER, VARCHAR)
                    fqn += "(" + r["arguments"].split(" RETURN ")[0].split("(", 1)[1].rsplit(")", 1)[0] + ")"
                out.append((f"{drop} {schema}.{name}", f"DROP {drop} IF EXISTS {fqn}"))
    for r in show(session, "SHOW AGENTS IN SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS"):
        if r.get("owner") == "HOL_PARTICIPANT" and r["name"] not in SI_KEEP:
            out.append((f"AGENT SNOWFLAKE_INTELLIGENCE.AGENTS.{r['name']}", f"DROP AGENT IF EXISTS SNOWFLAKE_INTELLIGENCE.AGENTS.{q(r['name'])}"))
    # DE3: the attendee's Postgres instance and its mirror (the network policy and secret integration are provisioned)
    if show(session, "SHOW POSTGRES INSTANCES LIKE 'HOL_PAYMENTS_PG'"):
        out.append(("DE3 mirror PAYMENTS_MIRROR", "CALL SNOWFLAKE.POSTGRES.DROP_MIRROR(mirror_name => 'payments_mirror', drop_target_database => TRUE)"))
        out.append(("POSTGRES INSTANCE HOL_PAYMENTS_PG", "DROP POSTGRES INSTANCE IF EXISTS HOL_PAYMENTS_PG"))
        # the saved password must not outlive its instance
        out.append(("SECRET PG_ADMIN_SECRET (cleared)", f"ALTER SECRET {DB}.REALTIME.PG_ADMIN_SECRET SET USERNAME = 'not-set' PASSWORD = 'not-set'"))
    if show(session, "SHOW DATABASES LIKE 'PAYMENTS_MIRROR'"):
        out.append(("DATABASE PAYMENTS_MIRROR", "DROP DATABASE IF EXISTS PAYMENTS_MIRROR"))
    # GOV2: the comments attendees add to the provisioned audit pack table
    if show(session, f"SHOW TABLES LIKE 'PAYMENT_SLA_DAILY' IN SCHEMA {DB}.AUDIT_PACK"):
        out.append(("GOV2 comments on AUDIT_PACK.PAYMENT_SLA_DAILY",
                    f"ALTER TABLE {DB}.AUDIT_PACK.PAYMENT_SLA_DAILY UNSET COMMENT"))
        out.append(("GOV2 column comment on AUDIT_PACK.PAYMENT_SLA_DAILY.SLA_STATUS",
                    f"ALTER TABLE {DB}.AUDIT_PACK.PAYMENT_SLA_DAILY ALTER COLUMN SLA_STATUS UNSET COMMENT"))
    # the lab notebooks in the shared banking-hol-pack Workspace go back to the repo versions (new notebooks attendees
    # added there are left; personal My Workspace copies aren't reachable)
    cfg = show(session, f"SELECT VALUE FROM {DB}.LAB.SETUP_CONFIG WHERE KEY = 'WORKSPACE'")
    WS = cfg[0]["VALUE"] if cfg and cfg[0].get("VALUE") else WS_DEFAULT
    ws_db, ws_schema, ws_name = WS.split(".", 2)
    if show(session, f"SHOW WORKSPACES LIKE '{ws_name.strip(chr(34))}' IN SCHEMA {ws_db}.{ws_schema}"):
        out.append(("Fetch the lab repository", "ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH"))
        out.append(("Workspace live version", f"ALTER WORKSPACE {WS} ADD LIVE VERSION FROM LAST"))
        out.append(("Notebooks back to the lab defaults (banking-hol-pack Workspace)",
                    f"COPY FILES INTO 'snow://workspace/{WS}/versions/live/notebooks/' FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/notebooks/"))
        # module helpers and reference files (new modules' folders land here too)
        out.append(("Module files (banking-hol-pack Workspace)",
                    f"COPY FILES INTO 'snow://workspace/{WS}/versions/live/vignettes/' FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/vignettes/"))
        out.append(("Workspace commit", f"ALTER WORKSPACE {WS} COMMIT"))
    out.append(("Check my work progress", f"DELETE FROM {DB}.LAB.LAB_PROGRESS"))
    return out


def run(session, dry_run):
    todo = targets(session)
    if dry_run:
        return f"Would remove {len(todo)}:\n" + "\n".join(label for label, _ in todo)
    failed = todo
    # a few passes: some drops only succeed once what depends on them has gone (policies on tags, functions in use)
    for _ in range(3):
        retry = []
        for label, sql in failed:
            try:
                session.sql(sql).collect()
            except Exception as e:
                retry.append((label, sql, str(e).splitlines()[0][:200]))
        retry = [x for x in retry if x[0] not in OPTIONAL]
        failed = [(label, sql) for label, sql, _ in retry]
        if not failed:
            break
    done = len(todo) - len(failed)
    if failed:
        raise Exception(f"Removed {done} of {len(todo)}; could not remove: " + "; ".join(f"{l}: {e}" for l, _, e in retry))
    return f"Removed {done} attendee objects and cleared progress"
$$;

-- Build and deploy the Lab Companion inside Snowflake, without the Snowflake CLI: the same three
-- steps `snow app deploy` runs (source to a stage, remote build into the artifact repository,
-- CREATE OR ALTER APPLICATION SERVICE), with the source copied from the lab Git repository.
-- The service spec mirrors lab-companion/app.yml: keep the two in step.
-- Returns the app URL. Run as HOL_ADMIN (it owns the app, so its checks see attendee work), from a
-- user session: the remote build authenticates as the session, so it can't run from a task.
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.DEPLOY_LAB_COMPANION()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
COMMENT = 'Build the Lab Companion from the lab Git repository and deploy it (no Snowflake CLI needed); returns its URL'
EXECUTE AS CALLER
AS
$$
import re
import time

SCHEMA = "BANKING_HOL.LAB"
STAGE = f"{SCHEMA}.LAB_COMPANION_CODE"
REPO = f"{SCHEMA}.LAB_COMPANION_REPO"
SERVICE = f"{SCHEMA}.LAB_COMPANION"
SOURCE = "@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/lab-companion/"
SPEC = """
query_warehouse: BANKING_WH
label: Banking Data Products Lab Companion
description: Guided pathways for the Banking Data Products hands-on lab (payments, client 360, customer voice and branch network), with live Check my work validation and facilitator progress.
icon: public/brand/snowflake-bug-color-rgb.svg
"""
# the exec demo's basemap tiles; trial accounts have no external access, so the map shows without tiles
BASEMAP_EAI = "external_access_integrations:\n- BASEMAP_ACCESS_INTEGRATION\n"
BUILD_TIMEOUT_S = 25 * 60
URL_TIMEOUT_S = 10 * 60


def one(session, sql):
    rows = session.sql(sql).collect()
    return rows[0][0] if rows else None


def build_status(session, job):
    # None when the job can't be described right now (a brief error, or it isn't visible yet):
    # the caller retries rather than treating it as failed
    try:
        rows = session.sql(f"DESCRIBE SERVICE {job}").collect()
    except Exception:
        return None
    return rows[0].as_dict().get("status") if rows else None


def build_logs(session, job):
    try:
        rows = session.sql(f"SELECT * FROM TABLE({job}!SPCS_GET_LOGS()) ORDER BY 1 DESC LIMIT 15").collect()
        return " | ".join(str(r.as_dict().get("LOG", r[-1]))[:200] for r in reversed(rows))
    except Exception as e:
        return f"(no build logs: {e})"


def app_url(session):
    for r in session.sql(f"SHOW APPLICATION SERVICES LIKE 'LAB_COMPANION' IN SCHEMA {SCHEMA}").collect():
        url = (r.as_dict().get("url") or "").strip()
        if url and "provisioning" not in url.lower():
            return url if url.startswith("http") else "https://" + url
    return None


def run(session):
    session.sql("ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH").collect()
    # a fresh stage each time, so files deleted from the repo don't linger in the build
    session.sql(f"CREATE OR REPLACE STAGE {STAGE} ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')").collect()
    session.sql(f"COPY FILES INTO @{STAGE} FROM {SOURCE}").collect()
    session.sql(f"CREATE ARTIFACT REPOSITORY IF NOT EXISTS {REPO} TYPE = APPLICATION").collect()

    # the build job runs in LAB, not the caller's personal database
    config = '{"build_job_location": "BANKING_HOL.LAB"}'
    out = one(session, f"SELECT SYSTEM$SPCS_TEST_BUILD_APP_ARTIFACT_REPO('@{STAGE}', '{REPO}', 'LAB_COMPANION', '', '', '', '{config}')")
    m = re.search(r"Build job submitted:\s*(\S+)", out or "")
    if not m:
        raise Exception(f"Lab Companion build did not start: {out}")
    job = m.group(1)
    t0 = time.time()
    unseen = 0  # status checks in a row that couldn't read the job
    while True:
        status = build_status(session, job)
        if status == "DONE":
            break
        unseen = unseen + 1 if status is None else 0
        # only give up on a real failure, a job that stays unreadable for ~2 minutes, or the timeout
        if status == "FAILED" or unseen >= 12 or time.time() - t0 > BUILD_TIMEOUT_S:
            raise Exception(f"Lab Companion build {status or 'not found'} ({job}): {build_logs(session, job)}")
        time.sleep(10)

    spec = SPEC + (BASEMAP_EAI if session.sql("SHOW INTEGRATIONS LIKE 'BASEMAP_ACCESS_INTEGRATION'").collect() else "")
    session.sql(f"""CREATE OR ALTER APPLICATION SERVICE {SERVICE}
        FROM ARTIFACT REPOSITORY {REPO} PACKAGE LAB_COMPANION VERSION LATEST
        SPECIFICATION = '{spec.replace("'", "''")}'""").collect()
    for role in ("HOL_PARTICIPANT", "HOL_RESTRICTED"):
        session.sql(f"GRANT USAGE ON APPLICATION SERVICE {SERVICE} TO ROLE {role}").collect()

    t0 = time.time()
    while time.time() - t0 < URL_TIMEOUT_S:
        url = app_url(session)
        if url:
            # SETUP_STATUS shows it, and provision_account.sh waits for it
            session.sql(f"DELETE FROM {SCHEMA}.SETUP_CONFIG WHERE KEY = 'APP_URL'").collect()
            session.sql(f"INSERT INTO {SCHEMA}.SETUP_CONFIG (KEY, VALUE) VALUES ('APP_URL', ?)", params=[url]).collect()
            return url
        time.sleep(10)
    raise Exception("Lab Companion deployed but its URL did not appear within 10 minutes")
$$;

-- PROVISION's last step: schedule the wake and sleep tasks (setup 05) for the event times
-- provision_account.sh stored in SETUP_CONFIG; without times, the facilitator runs WAKE_LAB on the day.
CREATE OR REPLACE PROCEDURE BANKING_HOL.LAB.SCHEDULE_LAB_FROM_CONFIG()
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Schedule WAKE_LAB / SLEEP_LAB from the LAB_START and LAB_END in LAB.SETUP_CONFIG'
EXECUTE AS CALLER
AS
$$
DECLARE
    lab_start TIMESTAMP_TZ;
    lab_end   TIMESTAMP_TZ;
    lead      NUMBER;
BEGIN
    SELECT MAX(IFF(KEY = 'LAB_START', TRY_TO_TIMESTAMP_TZ(VALUE), NULL)),
           MAX(IFF(KEY = 'LAB_END', TRY_TO_TIMESTAMP_TZ(VALUE), NULL)),
           COALESCE(MAX(IFF(KEY = 'WAKE_LEAD_MINUTES', TRY_TO_NUMBER(VALUE), NULL)), 30)
      INTO :lab_start, :lab_end, :lead
      FROM BANKING_HOL.LAB.SETUP_CONFIG;
    IF (lab_start IS NULL OR lab_end IS NULL) THEN
        RETURN 'No lab times set: run BANKING_HOL.LAB.WAKE_LAB() on the day';
    END IF;
    CALL BANKING_HOL.LAB.SCHEDULE_LAB(:lab_start, :lab_end, :lead);
    RETURN 'Scheduled the lab for ' || lab_start::VARCHAR;
END;
$$;

-- A new account's whole lab setup, started by provision_account.sh (DataOps) with EXECUTE TASK so
-- provisioning returns at once and the setup runs inside the account. Progress: SETUP_STATUS.
CREATE OR REPLACE TASK BANKING_HOL.LAB.PROVISION_LAB
    WAREHOUSE = BANKING_WH
    USER_TASK_TIMEOUT_MS = 10800000
    COMMENT = 'Lab setup in the background: lab data, packs, dbt project, executive demo, wake schedule'
AS CALL BANKING_HOL.LAB.LOAD_LAB_DATA('PROVISION');

-- Where provisioning has got to, inside Snowflake: SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS
CREATE OR REPLACE VIEW BANKING_HOL.LAB.SETUP_STATUS
    COMMENT = 'Lab setup progress: one row per step of the latest provisioning run'
AS
WITH latest AS (
    SELECT RUN_ID FROM BANKING_HOL.LAB.DATA_LOAD_LOG WHERE SCOPE = 'PROVISION'
    GROUP BY RUN_ID ORDER BY MAX(STARTED_AT) DESC NULLS LAST LIMIT 1
)
SELECT l.STEP_NO, l.STEP_TOTAL, l.STEP_NAME, l.STATUS, l.STARTED_AT, l.FINISHED_AT,
       ROUND(DATEDIFF('second', l.STARTED_AT, COALESCE(l.FINISHED_AT, CURRENT_TIMESTAMP())) / 60, 1) AS MINUTES,
       l.ERROR_MESSAGE
  FROM BANKING_HOL.LAB.DATA_LOAD_LOG l JOIN latest USING (RUN_ID)
 ORDER BY l.STEP_NO;

-- One row: READY, RUNNING, FAILED or NOT_STARTED, with the app URL once it's deployed.
-- provision_account.sh records SETUP_REQUESTED_AT before it builds the app, so between then and the
-- task's first logged step the account reads RUNNING ('Starting the lab setup'), not NOT_STARTED
-- (which the Lab Companion treats as an older account and opens straight away).
CREATE OR REPLACE VIEW BANKING_HOL.LAB.SETUP_SUMMARY
    COMMENT = 'Lab setup in one row: status, steps done, current step, app URL'
AS
WITH requested AS (
    SELECT MAX(TRY_TO_TIMESTAMP_LTZ(VALUE)) AS AT FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'SETUP_REQUESTED_AT'
), steps AS (
    SELECT CASE WHEN COUNT(s.STEP_NO) = 0 THEN 'NOT_STARTED'
                WHEN COUNT_IF(s.STATUS = 'FAILED') > 0 THEN 'FAILED'
                WHEN COUNT_IF(s.STATUS = 'DONE') = COUNT(s.STEP_NO) THEN 'READY'
                ELSE 'RUNNING' END                                     AS STATUS,
           COUNT_IF(s.STATUS = 'DONE')                                 AS STEPS_DONE,
           COUNT(s.STEP_NO)                                            AS STEP_TOTAL,
           MAX(IFF(s.STATUS IN ('RUNNING', 'FAILED'), s.STEP_NAME, NULL)) AS CURRENT_STEP,
           MAX(s.ERROR_MESSAGE)                                        AS ERROR_MESSAGE,
           MIN(s.STARTED_AT)                                           AS STARTED_AT,
           BOOLAND_AGG(s.STEP_NAME NOT LIKE 'Demo:%' OR s.STATUS = 'DONE') AS DEMO_READY
      FROM BANKING_HOL.LAB.SETUP_STATUS s
)
-- a requested setup whose run hasn't logged a step yet (or whose last run is older than the request)
SELECT IFF(r.AT IS NOT NULL AND (st.STEP_TOTAL = 0 OR st.STARTED_AT < r.AT), 'RUNNING', st.STATUS) AS STATUS,
       IFF(r.AT IS NOT NULL AND (st.STEP_TOTAL = 0 OR st.STARTED_AT < r.AT), 0, st.STEPS_DONE) AS STEPS_DONE,
       st.STEP_TOTAL,
       IFF(r.AT IS NOT NULL AND (st.STEP_TOTAL = 0 OR st.STARTED_AT < r.AT), 'Starting the lab setup', st.CURRENT_STEP) AS CURRENT_STEP,
       IFF(r.AT IS NOT NULL AND (st.STEP_TOTAL = 0 OR st.STARTED_AT < r.AT), NULL, st.ERROR_MESSAGE) AS ERROR_MESSAGE,
       st.STARTED_AT,
       st.DEMO_READY,
       (SELECT MAX(VALUE) FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'APP_URL') AS APP_URL
  FROM steps st CROSS JOIN requested r;

GRANT SELECT ON VIEW BANKING_HOL.LAB.SETUP_STATUS  TO ROLE HOL_PARTICIPANT;
GRANT SELECT ON VIEW BANKING_HOL.LAB.SETUP_SUMMARY TO ROLE HOL_PARTICIPANT;

-- The Lab Companion starts a load with EXECUTE TASK, so the button returns at once
-- and the page polls DATA_LOAD_LOG. Not scheduled: they only run when started.
CREATE OR REPLACE TASK BANKING_HOL.LAB.LOAD_LAB_DATA_TEXT
    WAREHOUSE = BANKING_WH
    COMMENT = 'Lab Companion: reset the text and evidence data (AI4, AI5, DS)'
AS CALL BANKING_HOL.LAB.LOAD_LAB_DATA('TEXT');

CREATE OR REPLACE TASK BANKING_HOL.LAB.LOAD_LAB_DATA_DEMO
    WAREHOUSE = BANKING_WH
    COMMENT = 'Lab Companion: rebuild the executive demo (BANKING_DEMO)'
AS CALL BANKING_HOL.LAB.LOAD_LAB_DATA('DEMO');

CREATE OR REPLACE TASK BANKING_HOL.LAB.LOAD_LAB_DATA_ALL
    WAREHOUSE = BANKING_WH
    COMMENT = 'Lab Companion: reload all lab data'
AS CALL BANKING_HOL.LAB.LOAD_LAB_DATA('ALL');

CREATE OR REPLACE TASK BANKING_HOL.LAB.LOAD_LAB_DATA_RESET
    WAREHOUSE = BANKING_WH
    COMMENT = 'Lab Companion: remove attendee work (keeps the data, app and demo)'
AS CALL BANKING_HOL.LAB.LOAD_LAB_DATA('RESET');
