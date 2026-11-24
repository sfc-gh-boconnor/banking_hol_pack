-- =====================================================
-- GOV4: Answer a customer's data request (solution / catch-up)
-- UK GDPR right of access: tag personal data once, find everything held about one customer,
-- show who read it, and log the response with its one-month due date.
-- Run as HOL_PARTICIPANT after GOV1. Works on copies in BANKING_HOL.GOVERNANCE (the sources stay read-only).
-- =====================================================
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.GOVERNANCE;

-- 1. Copies of the retail tables that hold customers
CREATE OR REPLACE TABLE RB_CUSTOMERS        AS SELECT * FROM BANKING_HOL.RAW_DATA.RB_CUSTOMERS;
CREATE OR REPLACE TABLE RB_ACCOUNTS         AS SELECT * FROM BANKING_HOL.RAW_DATA.RB_ACCOUNTS;
CREATE OR REPLACE TABLE RB_TRANSACTIONS     AS SELECT * FROM BANKING_HOL.RAW_DATA.RB_TRANSACTIONS;
CREATE OR REPLACE TABLE RB_CALL_TRANSCRIPTS AS SELECT * FROM BANKING_HOL.RAW_DATA.RB_CALL_TRANSCRIPTS;
CREATE OR REPLACE TABLE RB_COMPLAINTS       AS SELECT * FROM BANKING_HOL.RAW_DATA.RB_COMPLAINTS;
CREATE OR REPLACE TABLE RB_EMAILS           AS SELECT * FROM BANKING_HOL.RAW_DATA.RB_EMAILS;
CREATE OR REPLACE TABLE RB_FRAUD_CASES      AS SELECT * FROM BANKING_HOL.RAW_DATA.RB_FRAUD_CASES;
CREATE OR REPLACE TABLE RB_SAR_NARRATIVES   AS SELECT * FROM BANKING_HOL.RAW_DATA.RB_SAR_NARRATIVES;

-- 2. Tag personal data by kind, once
CREATE OR REPLACE TAG PERSONAL_DATA ALLOWED_VALUES 'IDENTITY', 'CONTACT', 'FINANCIAL', 'COMMUNICATIONS', 'FINANCIAL_CRIME'
  COMMENT = 'Which kind of personal data a column holds (UK GDPR right of access)';
ALTER TABLE RB_CUSTOMERS MODIFY
  COLUMN FIRST_NAME SET TAG PERSONAL_DATA = 'IDENTITY', COLUMN LAST_NAME SET TAG PERSONAL_DATA = 'IDENTITY',
  COLUMN DATE_OF_BIRTH SET TAG PERSONAL_DATA = 'IDENTITY', COLUMN ADDRESS_LINE_1 SET TAG PERSONAL_DATA = 'CONTACT',
  COLUMN POSTCODE SET TAG PERSONAL_DATA = 'CONTACT', COLUMN ANNUAL_INCOME_GBP SET TAG PERSONAL_DATA = 'FINANCIAL',
  COLUMN CREDIT_SCORE SET TAG PERSONAL_DATA = 'FINANCIAL';
ALTER TABLE RB_ACCOUNTS MODIFY COLUMN PRODUCT SET TAG PERSONAL_DATA = 'FINANCIAL', COLUMN BALANCE_GBP SET TAG PERSONAL_DATA = 'FINANCIAL';
ALTER TABLE RB_TRANSACTIONS MODIFY COLUMN AMOUNT_GBP SET TAG PERSONAL_DATA = 'FINANCIAL', COLUMN MERCHANT SET TAG PERSONAL_DATA = 'FINANCIAL';
ALTER TABLE RB_CALL_TRANSCRIPTS MODIFY COLUMN TRANSCRIPT SET TAG PERSONAL_DATA = 'COMMUNICATIONS';
ALTER TABLE RB_COMPLAINTS MODIFY COLUMN COMPLAINT_TEXT SET TAG PERSONAL_DATA = 'COMMUNICATIONS';
ALTER TABLE RB_EMAILS MODIFY COLUMN BODY SET TAG PERSONAL_DATA = 'COMMUNICATIONS';
ALTER TABLE RB_FRAUD_CASES MODIFY COLUMN INVESTIGATOR_NOTES SET TAG PERSONAL_DATA = 'FINANCIAL_CRIME';
ALTER TABLE RB_SAR_NARRATIVES MODIFY COLUMN NARRATIVE SET TAG PERSONAL_DATA = 'FINANCIAL_CRIME';

-- 3. Where does personal data live? (driven by the tags, not a hand-kept list)
SELECT 'RB_CUSTOMERS' AS TABLE_NAME, COLUMN_NAME, TAG_VALUE
FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('BANKING_HOL.GOVERNANCE.RB_CUSTOMERS', 'table'))
WHERE TAG_NAME = 'PERSONAL_DATA';

-- 4. The request log, with the legal due date (one month; up to two more for complex requests)
CREATE OR REPLACE TABLE DATA_REQUESTS (
    REQUEST_ID VARCHAR, CUSTOMER_ID VARCHAR, RECEIVED_AT TIMESTAMP_LTZ, DUE_BY DATE,
    TABLES_FOUND NUMBER, ROWS_FOUND NUMBER, HELD_BACK NUMBER, LETTER VARCHAR, PACK VARIANT
);

-- 5. One call answers a request: every tagged table holding the customer, financial crime
--    records held back for the MLRO, who read those tables in 30 days, and a drafted letter
CREATE OR REPLACE PROCEDURE DATA_REQUEST(CUSTOMER VARCHAR)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
AS
$$
import json, uuid

DB, SCH, TAG = "BANKING_HOL", "GOVERNANCE", "PERSONAL_DATA"
HELD = {"FINANCIAL_CRIME"}

def q(s):
    return '"' + s.replace('"', '""') + '"'

def run(session, customer):
    cust = session.sql(f"SELECT CUSTOMER_ID, FIRST_NAME || ' ' || LAST_NAME AS NAME FROM {DB}.{SCH}.RB_CUSTOMERS WHERE CUSTOMER_ID = ?",
                       params=[customer]).collect()
    if not cust:
        return {"error": f"No customer {customer}"}
    tables = [r["TABLE_NAME"] for r in session.sql(
        f"SELECT TABLE_NAME FROM {DB}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '{SCH}' AND COLUMN_NAME = 'CUSTOMER_ID' ORDER BY 1").collect()]
    found, held_back = [], []
    for t in tables:
        fqn = f"{DB}.{SCH}.{t}"
        tags = session.sql(f"SELECT COLUMN_NAME, TAG_VALUE FROM TABLE({DB}.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('{fqn}', 'table')) WHERE TAG_NAME = '{TAG}'").collect()
        if not tags:
            continue
        n = session.sql(f"SELECT COUNT(*) AS N FROM {fqn} WHERE CUSTOMER_ID = ?", params=[customer]).collect()[0]["N"]
        if n == 0:
            continue
        kinds = sorted({r["TAG_VALUE"] for r in tags})
        entry = {"table": t, "rows": n, "kinds": kinds}
        if HELD & set(kinds):
            held_back.append(entry)
            continue
        cols = ", ".join(f"LEFT({q(r['COLUMN_NAME'])}::VARCHAR, 200) AS {q(r['COLUMN_NAME'])}" for r in tags)
        entry["records"] = [r.as_dict() for r in session.sql(f"SELECT {cols} FROM {fqn} WHERE CUSTOMER_ID = ? LIMIT 50", params=[customer]).collect()]
        found.append(entry)
    names = "', '".join(f"{DB}.{SCH}.{e['table']}" for e in found + held_back)
    access = [r.as_dict() for r in session.sql(f"""
        WITH reads AS (
          SELECT DISTINCT ah.QUERY_ID, ah.USER_NAME, ah.QUERY_START_TIME
          FROM SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY ah, LATERAL FLATTEN(ah.BASE_OBJECTS_ACCESSED) o
          WHERE ah.QUERY_START_TIME > DATEADD(day, -30, CURRENT_TIMESTAMP()) AND o.value:objectName::VARCHAR IN ('{names}'))
        SELECT USER_NAME, COUNT(*) AS QUERIES, TO_VARCHAR(MAX(QUERY_START_TIME), 'YYYY-MM-DD HH24:MI') AS LAST_READ
        FROM reads GROUP BY 1 ORDER BY QUERIES DESC""").collect()]
    rows = sum(e["rows"] for e in found)
    summary = "; ".join(f"{e['table']} ({e['rows']})" for e in found)
    letter = session.sql("SELECT AI_COMPLETE('claude-sonnet-4-5', ?) AS L", params=[
        f"Write a short plain-English cover letter (under 170 words, no markdown, no bracketed placeholders) from the bank to {cust[0]['NAME']} "
        f"answering their request for a copy of their personal data. Enclosed: {summary}. Say we searched every system that holds their "
        "personal data, there is no charge, and they can complain to the Information Commissioner's Office. Do not mention fraud, "
        "financial crime or anything held back. Sign off as the Data Protection Team."]).collect()[0]["L"]
    req = "DSR-" + uuid.uuid4().hex[:8].upper()
    pack = {"request_id": req, "customer": cust[0].as_dict(), "tables": found, "held_back": held_back, "access": access}
    session.sql(f"""INSERT INTO {DB}.{SCH}.DATA_REQUESTS
                    SELECT ?, ?, CURRENT_TIMESTAMP(), DATEADD(month, 1, CURRENT_DATE()), ?, ?, ?, ?, PARSE_JSON(?)""",
                params=[req, customer, len(found), rows, len(held_back), letter, json.dumps(pack, default=str)]).collect()
    return {"request_id": req, "tables": len(found), "rows": rows, "held_back": [e["table"] for e in held_back], "readers": len(access)}
$$;

-- 6. Answer one (RB101023 has a fraud case and a SAR, so two tables are held back)
CALL DATA_REQUEST('RB101023');
SELECT REQUEST_ID, CUSTOMER_ID, DUE_BY, TABLES_FOUND, ROWS_FOUND, HELD_BACK, LEFT(LETTER, 200) AS LETTER_START
FROM DATA_REQUESTS ORDER BY RECEIVED_AT DESC;
