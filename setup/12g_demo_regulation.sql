-- =====================================================
-- BANKING HOL PACK - EXECUTIVE DEMO
-- STEP 12g: REGULATION EVIDENCE (BANKING_DEMO.EXEC)
--
-- Two retail tour stops and the regulation map (/demo/regulations):
--   DEMO_PERSONAL_DATA       tag on every personal-data column of the RB_ tables
--   DEMO_DATA_REQUEST(id)    UK GDPR right of access: everything held about one customer,
--                            who read it, and a drafted cover letter; logged to DEMO_DATA_REQUESTS
--   DEMO_MODEL_INVENTORY     model risk: every model, version, metric, owner and status
--   DEMO_MODEL_VALIDATION    the attrition model against real outcomes, by segment and risk band
--   DEMO_MODEL_CARD          AI-drafted model card for the inventory
-- Reads only BANKING_DEMO; nothing here touches the lab.
-- =====================================================
USE ROLE HOL_ADMIN;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_DEMO.EXEC;

-- ---------- Personal data, tagged once ----------
CREATE OR REPLACE TAG DEMO_PERSONAL_DATA
  ALLOWED_VALUES 'IDENTITY', 'CONTACT', 'FINANCIAL', 'COMMUNICATIONS', 'FINANCIAL_CRIME'
  COMMENT = 'Exec demo: which kind of personal data a column holds (UK GDPR right of access)';

ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_CUSTOMERS MODIFY
  COLUMN FIRST_NAME SET TAG DEMO_PERSONAL_DATA = 'IDENTITY',
  COLUMN LAST_NAME SET TAG DEMO_PERSONAL_DATA = 'IDENTITY',
  COLUMN DATE_OF_BIRTH SET TAG DEMO_PERSONAL_DATA = 'IDENTITY',
  COLUMN ADDRESS_LINE_1 SET TAG DEMO_PERSONAL_DATA = 'CONTACT',
  COLUMN POSTCODE SET TAG DEMO_PERSONAL_DATA = 'CONTACT',
  COLUMN ANNUAL_INCOME_GBP SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL',
  COLUMN CREDIT_SCORE SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_ACCOUNTS MODIFY
  COLUMN PRODUCT SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL',
  COLUMN BALANCE_GBP SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_TRANSACTIONS MODIFY
  COLUMN AMOUNT_GBP SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL',
  COLUMN MERCHANT SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_EMPLOYMENT MODIFY
  COLUMN EMPLOYER_NAME SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL',
  COLUMN GROSS_ANNUAL_GBP SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_CALL_TRANSCRIPTS MODIFY COLUMN TRANSCRIPT SET TAG DEMO_PERSONAL_DATA = 'COMMUNICATIONS';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_EMAILS MODIFY COLUMN BODY SET TAG DEMO_PERSONAL_DATA = 'COMMUNICATIONS';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_COMPLAINTS MODIFY COLUMN COMPLAINT_TEXT SET TAG DEMO_PERSONAL_DATA = 'COMMUNICATIONS';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_DISPUTES MODIFY COLUMN CUSTOMER_STATEMENT SET TAG DEMO_PERSONAL_DATA = 'COMMUNICATIONS';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_FRAUD_CASES MODIFY COLUMN INVESTIGATOR_NOTES SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL_CRIME';
ALTER ICEBERG TABLE BANKING_DEMO.RAW_DATA.RB_SAR_NARRATIVES MODIFY COLUMN NARRATIVE SET TAG DEMO_PERSONAL_DATA = 'FINANCIAL_CRIME';

-- ---------- Every data request, with its legal due date ----------
CREATE OR REPLACE TABLE DEMO_DATA_REQUESTS (
    REQUEST_ID   VARCHAR,
    CUSTOMER_ID  VARCHAR,
    RECEIVED_AT  TIMESTAMP_LTZ,
    DUE_BY       DATE,            -- one month from receipt (ICO: extendable by two months if complex)
    TABLES_FOUND NUMBER,
    ROWS_FOUND   NUMBER,
    HELD_BACK    NUMBER,          -- financial crime records referred to the MLRO before release
    PACK         VARIANT
) COMMENT = 'Exec demo: customer data requests answered from tagged personal data';
GRANT SELECT ON TABLE DEMO_DATA_REQUESTS TO ROLE HOL_PARTICIPANT;

-- ---------- A customer asks for their data ----------
-- Owner's rights: the viewer can't read ACCOUNT_USAGE or every RB_ table. Finds the tables holding
-- the customer from the tags (no hand-kept list), counts and samples their rows, holds back
-- financial crime records for the MLRO, lists who read those tables in 30 days, drafts the letter.
CREATE OR REPLACE PROCEDURE DEMO_DATA_REQUEST(CUSTOMER VARCHAR)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
COMMENT = 'Executive demo: UK GDPR right of access for one customer, from tagged personal data'
EXECUTE AS OWNER
AS
$$
import json, uuid
from datetime import date

DB, RAW = "BANKING_DEMO", "RAW_DATA"
TAG = "DEMO_PERSONAL_DATA"
HELD = {"FINANCIAL_CRIME"}

def q(s):
    return '"' + s.replace('"', '""') + '"'

def run(session, customer):
    cust = session.sql(f"SELECT CUSTOMER_ID, FIRST_NAME || ' ' || LAST_NAME AS NAME, CITY FROM {DB}.{RAW}.RB_CUSTOMERS WHERE CUSTOMER_ID = ?",
                       params=[customer]).collect()
    if not cust:
        return {"error": f"No customer {customer}"}
    tables = [r["TABLE_NAME"] for r in session.sql(
        f"SELECT TABLE_NAME FROM {DB}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '{RAW}' AND COLUMN_NAME = 'CUSTOMER_ID' AND STARTSWITH(TABLE_NAME, 'RB_') ORDER BY 1").collect()]
    found, held_back, rows_total = [], [], 0
    for t in tables:
        fqn = f"{DB}.{RAW}.{t}"
        tags = session.sql(f"SELECT COLUMN_NAME, TAG_VALUE FROM TABLE({DB}.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('{fqn}', 'table')) WHERE TAG_NAME = '{TAG}'").collect()
        if not tags:
            continue
        n = session.sql(f"SELECT COUNT(*) AS N FROM {fqn} WHERE CUSTOMER_ID = ?", params=[customer]).collect()[0]["N"]
        if n == 0:
            continue
        kinds = sorted({r["TAG_VALUE"] for r in tags})
        cols = [r["COLUMN_NAME"] for r in tags]
        entry = {"table": t, "rows": n, "kinds": kinds, "columns": cols}
        if HELD & set(kinds):
            held_back.append(entry)
            continue
        sel = ", ".join(f"LEFT({q(c)}::VARCHAR, 160) AS {q(c)}" for c in cols)
        entry["sample"] = [r.as_dict() for r in session.sql(f"SELECT {sel} FROM {fqn} WHERE CUSTOMER_ID = ? LIMIT 3", params=[customer]).collect()]
        rows_total += n
        found.append(entry)
    names = "', '".join(f"{DB}.{RAW}.{e['table']}" for e in found + held_back)
    access = [r.as_dict() for r in session.sql(f"""
        WITH reads AS (
          SELECT DISTINCT ah.QUERY_ID, ah.USER_NAME, ah.QUERY_START_TIME
          FROM SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY ah, LATERAL FLATTEN(ah.BASE_OBJECTS_ACCESSED) o
          WHERE ah.QUERY_START_TIME > DATEADD(day, -30, CURRENT_TIMESTAMP()) AND o.value:objectName::VARCHAR IN ('{names}'))
        SELECT r.USER_NAME, q.ROLE_NAME, COUNT(*) AS QUERIES, TO_VARCHAR(MAX(r.QUERY_START_TIME), 'YYYY-MM-DD HH24:MI') AS LAST_READ
        FROM reads r LEFT JOIN SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY q ON q.QUERY_ID = r.QUERY_ID
        GROUP BY 1, 2 ORDER BY QUERIES DESC LIMIT 8""").collect()]
    name = cust[0]["NAME"]
    summary = "; ".join(f"{e['table'].replace('RB_', '').replace('_', ' ').lower()} ({e['rows']})" for e in found)
    try:
        letter = session.sql("""SELECT AI_COMPLETE('claude-sonnet-4-5', ?) AS L""", params=[
            "Write a short, plain-English cover letter (under 170 words, no markdown, no placeholders in brackets) from the bank to "
            f"{name} answering their request for a copy of their personal data. Say what is enclosed: {summary}. Say the information was "
            "found by searching every system that holds their personal data, that it is provided free of charge, and how to ask questions "
            "or complain to the Information Commissioner's Office. Do not mention fraud, financial crime or any records being held back. "
            "Sign off as the Data Protection Team."]).collect()[0]["L"]
    except Exception:
        letter = None
    letter = letter or (f"Dear {name},\n\nThank you for your request for a copy of your personal data. Enclosed is what we hold about you: {summary}. "
                        "We searched every system that holds your personal data, and there is no charge. If you have any questions, contact us; "
                        "you can also complain to the Information Commissioner's Office.\n\nData Protection Team")
    req_id = "DSR-" + uuid.uuid4().hex[:8].upper()
    pack = {"request_id": req_id, "customer": cust[0].as_dict(), "tables": found, "held_back": held_back,
            "access": access, "letter": letter, "rows": rows_total}
    session.sql(f"""INSERT INTO {DB}.EXEC.DEMO_DATA_REQUESTS
                    SELECT ?, ?, CURRENT_TIMESTAMP(), DATEADD(month, 1, CURRENT_DATE()), ?, ?, ?, PARSE_JSON(?)""",
                params=[req_id, customer, len(found), rows_total, len(held_back), json.dumps(pack, default=str)]).collect()
    pack["due_by"] = session.sql("SELECT TO_VARCHAR(DATEADD(month, 1, CURRENT_DATE()), 'DD Mon YYYY') AS D").collect()[0]["D"]
    return pack
$$;
GRANT USAGE ON PROCEDURE DEMO_DATA_REQUEST(VARCHAR) TO ROLE HOL_PARTICIPANT;

-- ---------- Every model on the record ----------
-- The registry is the source of truth; the inventory adds what a model risk function asks for.
SHOW VERSIONS IN MODEL BANKING_DEMO.INSIGHTS.DEMO_ATTRITION_MODEL;
CREATE OR REPLACE TABLE DEMO_MODEL_INVENTORY COMMENT = 'Exec demo: model inventory from the Model Registry plus ownership, use and status' AS
SELECT "model_name" AS MODEL_NAME, "name" AS VERSION, "is_default_version" AS IS_DEFAULT, "comment" AS PURPOSE,
       PARSE_JSON("model_attributes"):framework::VARCHAR AS FRAMEWORK,
       PARSE_JSON("metadata"):metrics:auc::FLOAT AS AUC,
       "created_on"::TIMESTAMP_LTZ AS REGISTERED_ON,
       'Retail Analytics' AS OWNER, 'Retention offers; never used to refuse a product' AS PERMITTED_USE,
       'MEDIUM' AS RISK_TIER, 'BANKING_DEMO.RAW_DATA.RB_MONTHLY_SNAPSHOT, RB_CUSTOMERS (observed 2026-08-31)' AS TRAINING_DATA,
       'APPROVED_WITH_CONDITIONS' AS STATUS, 'Recalibrate probabilities before quoting them; review quarterly' AS CONDITIONS
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
GRANT SELECT ON TABLE DEMO_MODEL_INVENTORY TO ROLE HOL_PARTICIPANT;

-- Validation: predicted vs what actually happened after the observation date, by segment and by risk band
CREATE OR REPLACE TABLE DEMO_MODEL_VALIDATION COMMENT = 'Exec demo: attrition model predicted (raw and recalibrated) vs actual leavers after 2026-08-31' AS
WITH s AS (
  SELECT c.SEGMENT, sc.RISK_BAND, sc.CHURN_PROBABILITY, v.CHURN_PROBABILITY AS CALIBRATED,
         IFF(c.CHURNED AND c.CHURN_DATE > '2026-08-31', 1, 0) AS LEFT_AFTER
  FROM BANKING_DEMO.INSIGHTS.DEMO_ATTRITION_SCORES sc JOIN BANKING_DEMO.RAW_DATA.RB_CUSTOMERS c USING (CUSTOMER_ID)
  -- the recalibration the approval asked for (12c, as the lab's DS4): what the attrition stop now shows
  LEFT JOIN BANKING_DEMO.INSIGHTS.DEMO_VALUE_SEGMENTS v USING (CUSTOMER_ID))
SELECT 'SEGMENT' AS CUT, SEGMENT AS GROUP_NAME, COUNT(*) AS CUSTOMERS, ROUND(100 * AVG(CHURN_PROBABILITY), 1) AS PREDICTED_PCT,
       ROUND(100 * AVG(CALIBRATED), 1) AS CALIBRATED_PCT, ROUND(100 * AVG(LEFT_AFTER), 1) AS ACTUAL_PCT FROM s GROUP BY 2
UNION ALL
SELECT 'RISK_BAND', RISK_BAND, COUNT(*), ROUND(100 * AVG(CHURN_PROBABILITY), 1), ROUND(100 * AVG(CALIBRATED), 1), ROUND(100 * AVG(LEFT_AFTER), 1) FROM s GROUP BY 2;
GRANT SELECT ON TABLE DEMO_MODEL_VALIDATION TO ROLE HOL_PARTICIPANT;

-- Model card, drafted by AI from the inventory and validation; a person signs it off
CREATE OR REPLACE TABLE DEMO_MODEL_CARD COMMENT = 'Exec demo: AI-drafted model card for DEMO_ATTRITION_MODEL' AS
SELECT i.MODEL_NAME, i.VERSION,
       AI_COMPLETE('claude-sonnet-4-5',
         'Write a model card in plain English, under 180 words, no markdown headings, as short labelled lines: Purpose, Permitted use, Data, Performance, Known limitations, Conditions. Call the model "the attrition model" and write group names in plain lower-case words (young adult, mass affluent, high risk band), never with underscores. '
         || 'Facts: model ' || i.MODEL_NAME || ' version ' || i.VERSION || ', ' || COALESCE(i.FRAMEWORK, 'scikit-learn') || ', AUC ' || ROUND(i.AUC, 3)
         || '. Purpose: ' || i.PURPOSE || '. Permitted use: ' || i.PERMITTED_USE || '. Data: ' || i.TRAINING_DATA
         || '. Validation predicted vs recalibrated vs actual leave rate (%) by group: ' || v.SUMMARY || '. Conditions: ' || i.CONDITIONS || '. The recalibration has been applied: retention uses the recalibrated rates'
         || '. Only state what these facts support.') AS CARD,
       CURRENT_TIMESTAMP() AS DRAFTED_AT
FROM DEMO_MODEL_INVENTORY i
CROSS JOIN (SELECT LISTAGG(CUT || ' ' || GROUP_NAME || ': ' || PREDICTED_PCT || ' raw, ' || CALIBRATED_PCT || ' recalibrated, ' || ACTUAL_PCT || ' actual', '; ') AS SUMMARY FROM DEMO_MODEL_VALIDATION) v;
GRANT SELECT ON TABLE DEMO_MODEL_CARD TO ROLE HOL_PARTICIPANT;

SELECT 'DEMO_MODEL_INVENTORY' AS T, COUNT(*) AS N FROM DEMO_MODEL_INVENTORY
UNION ALL SELECT 'DEMO_MODEL_VALIDATION', COUNT(*) FROM DEMO_MODEL_VALIDATION
UNION ALL SELECT 'DEMO_MODEL_CARD', COUNT(*) FROM DEMO_MODEL_CARD;
