// Server-only: the executive demo (Lab Companion > Executive demo).
// Every query reads BANKING_DEMO only, as the app's own role (owner's rights),
// so the demo never touches lab objects or lands in an attendee's query history.
import { querySnowflake } from "@/lib/snowflake"

const I = "BANKING_DEMO.INSIGHTS"
const E = "BANKING_DEMO.EXEC"

/** Fixed SQL per tour stop. Keys are the only thing a request can choose. */
export const STOP_QUERIES: Record<string, Record<string, string>> = {
  "retail-profit": {
    kpis: `SELECT * FROM ${I}.DEMO_RETAIL_KPIS`,
    hexes: `SELECT H3, CITY, CUSTOMERS, PROFIT_GBP, REVENUE_GBP, COST_GBP, PROFIT_PER_CUSTOMER_GBP, AVG_IMD_DECILE, ATTRITION_PCT, GEOJSON
            FROM ${I}.DEMO_PROFIT_BY_H3 WHERE CUSTOMERS >= 2`,
    cities: `SELECT CITY, SUM(CUSTOMERS) AS CUSTOMERS, SUM(PROFIT_GBP) AS PROFIT_GBP, ROUND(SUM(PROFIT_GBP) / SUM(CUSTOMERS)) AS PROFIT_PER_CUSTOMER_GBP
             FROM ${I}.DEMO_PROFIT_BY_H3 GROUP BY 1 ORDER BY PROFIT_GBP DESC`,
  },
  "retail-branches": {
    branches: `SELECT b.BRANCH_ID, b.BRANCH_NAME, b.CITY, b.FORMAT, b.LAT, b.LON, b.ANNUAL_COST_GBP, b.HOME_CUSTOMERS, b.CUSTOMER_PROFIT_12M_GBP,
                      i.CUSTOMERS_OVER_20_MIN, i.PROFIT_AT_RISK_GBP, i.AVG_EXTRA_MIN,
                      z.BUSINESSES, z.SMALL_BUSINESSES, z.CHARITIES, z.CLUBS, z.NOT_DIGITAL, z.BUSINESSES_OVER_20_MIN, z.CASH_PAID_IN_12M_GBP
               FROM ${I}.DEMO_BRANCHES b LEFT JOIN ${I}.DEMO_BRANCH_CLOSURE_IMPACT i USING (BRANCH_ID)
               LEFT JOIN ${I}.DEMO_BUSINESS_CLOSURE_IMPACT z USING (BRANCH_ID) ORDER BY i.PROFIT_AT_RISK_GBP DESC NULLS LAST`,
    catchments: `SELECT BRANCH_ID, PROFILE, MINUTES, GEOJSON FROM ${I}.DEMO_BRANCH_CATCHMENTS WHERE PROFILE = 'driving-car'`,
    gaps: `SELECT H3, CITY, CUSTOMERS, PROFIT_GBP, AVG_DRIVE_MIN, GEOJSON FROM ${I}.DEMO_COVERAGE_GAPS`,
    // res 7 for the city view, res 8 once zoomed in; DRIVE is 'BRANCH_ID:minutes,...' from the ORS matrix
    hexes: `SELECT H3, CITY, CUSTOMERS, PROFIT_GBP, GEOJSON, DRIVE FROM ${I}.DEMO_BRANCH_HEXES WHERE RES = 7`,
    fine: `SELECT H3, CITY, CUSTOMERS, PROFIT_GBP, GEOJSON, DRIVE FROM ${I}.DEMO_BRANCH_HEXES WHERE RES = 8`,
  },
  "retail-attrition": {
    summary: `SELECT RISK_BAND, COUNT(*) AS CUSTOMERS, ROUND(SUM(PROFIT_TO_DATE_GBP)) AS PROFIT_GBP, ROUND(SUM(SAVINGS_BALANCE_GBP)) AS SAVINGS_GBP
              FROM ${I}.DEMO_AT_RISK_CUSTOMERS GROUP BY 1`,
    // the high-risk customers with the most lifetime value at risk (DS4), so the call list is ranked by money
    top: `SELECT CUSTOMER_ID, CUSTOMER, CITY, SEGMENT, AGE, CHURN_PROBABILITY, CHANCE_3M, PROFIT_TO_DATE_GBP, SAVINGS_BALANCE_GBP, ON_LEGACY_SAVER, BRANCH_AT_RISK, SALARY_TREND,
                 LIFETIME_VALUE_GBP, VALUE_AT_RISK_GBP, VALUE_SEGMENT, NEXT_BEST_OFFER
          FROM ${I}.DEMO_AT_RISK_CUSTOMERS WHERE RISK_BAND = 'HIGH' ORDER BY VALUE_AT_RISK_GBP DESC NULLS LAST LIMIT 12`,
    // the four value-and-risk segments, with each one's most common offer
    value: `SELECT SEGMENT, COUNT(*) AS CUSTOMERS, ROUND(SUM(LIFETIME_VALUE_GBP)) AS LIFETIME_VALUE_GBP, ROUND(SUM(VALUE_AT_RISK_GBP)) AS VALUE_AT_RISK_GBP,
                   MODE(IFF(NEXT_BEST_OFFER = 'No action', NULL, NEXT_BEST_OFFER)) AS TOP_OFFER
            FROM ${I}.DEMO_VALUE_SEGMENTS GROUP BY 1`,
    // SHAP per customer for the 12 listed, plus the high-risk average ('ALL') the chart shows with nothing selected
    drivers: `WITH top AS (SELECT CUSTOMER_ID FROM ${I}.DEMO_AT_RISK_CUSTOMERS WHERE RISK_BAND = 'HIGH' ORDER BY VALUE_AT_RISK_GBP DESC NULLS LAST LIMIT 12)
              SELECT 'ALL' AS CUSTOMER_ID, FEATURE, ROUND(AVG(CONTRIBUTION), 4) AS CONTRIBUTION, NULL AS VALUE FROM ${I}.DEMO_CUSTOMER_DRIVERS GROUP BY FEATURE
              UNION ALL
              SELECT d.CUSTOMER_ID, d.FEATURE, ROUND(d.CONTRIBUTION, 4), d.VALUE FROM ${I}.DEMO_CUSTOMER_DRIVERS d JOIN top USING (CUSTOMER_ID)`,
    points: `SELECT LAT, LON, RISK_BAND, PROFIT_TO_DATE_GBP FROM ${I}.DEMO_AT_RISK_CUSTOMERS WHERE RISK_BAND = 'HIGH'`,
  },
  "retail-voice": {
    reasons: `SELECT CALL_REASON, COUNT(*) AS CALLS, COUNT_IF(SENTIMENT = 'negative') AS NEGATIVE FROM ${I}.DEMO_CALL_THEMES GROUP BY 1 ORDER BY 2 DESC`,
    themes: `SELECT THEMES FROM ${I}.DEMO_CALL_THEMES_SUMMARY`,
    // the latest 6 calls for each reason, unhappy first, so the stop can filter by the reasons clicked
    examples: `SELECT t.CALL_ID, t.QUEUE, t.CALL_REASON, t.SENTIMENT, t.ONE_LINE_SUMMARY, TO_CHAR(t.CALL_START_TS, 'DD Mon') AS CALL_DATE,
                      t.CALL_START_TS::VARCHAR AS CALL_TS, c.FIRST_NAME || ' ' || LEFT(c.LAST_NAME, 1) || '.' AS CUSTOMER
               FROM ${I}.DEMO_CALL_THEMES t LEFT JOIN BANKING_DEMO.RAW_DATA.RB_CUSTOMERS c USING (CUSTOMER_ID)
               QUALIFY ROW_NUMBER() OVER (PARTITION BY t.CALL_REASON ORDER BY IFF(t.SENTIMENT = 'negative', 0, 1), t.CALL_START_TS DESC) <= 6
               ORDER BY t.CALL_START_TS DESC`,
  },
  "retail-fraud": {
    nodes: `WITH top_mules AS (SELECT NODE_ID FROM ${I}.DEMO_FRAUD_GRAPH_NODES WHERE NODE_TYPE = 'MULE' ORDER BY AMOUNT_GBP DESC LIMIT 6),
            keep AS (
              SELECT NODE_ID FROM top_mules
              UNION SELECT e.SOURCE FROM ${I}.DEMO_FRAUD_GRAPH_EDGES e JOIN top_mules m ON e.TARGET = m.NODE_ID
              UNION SELECT e.TARGET FROM ${I}.DEMO_FRAUD_GRAPH_EDGES e JOIN top_mules m ON e.SOURCE = m.NODE_ID)
            SELECT n.NODE_TYPE, n.NODE_ID, n.LABEL, n.DETAIL, ROUND(n.AMOUNT_GBP) AS AMOUNT_GBP
            FROM ${I}.DEMO_FRAUD_GRAPH_NODES n JOIN keep k USING (NODE_ID)
            UNION ALL
            SELECT n.NODE_TYPE, n.NODE_ID, n.LABEL, n.DETAIL, ROUND(n.AMOUNT_GBP)
            FROM ${I}.DEMO_FRAUD_GRAPH_NODES n
            WHERE n.NODE_TYPE IN ('CASE', 'SAR') AND EXISTS (
              SELECT 1 FROM ${I}.DEMO_FRAUD_GRAPH_EDGES e JOIN ${I}.DEMO_FRAUD_GRAPH_EDGES p ON p.SOURCE = e.SOURCE
              JOIN top_mules m ON p.TARGET = m.NODE_ID WHERE e.TARGET = n.NODE_ID)`,
    edges: `WITH top_mules AS (SELECT NODE_ID FROM ${I}.DEMO_FRAUD_GRAPH_NODES WHERE NODE_TYPE = 'MULE' ORDER BY AMOUNT_GBP DESC LIMIT 6),
            victims AS (SELECT DISTINCT e.SOURCE FROM ${I}.DEMO_FRAUD_GRAPH_EDGES e JOIN top_mules m ON e.TARGET = m.NODE_ID)
            SELECT e.SOURCE, e.TARGET, e.EDGE_TYPE, ROUND(e.AMOUNT_GBP) AS AMOUNT_GBP FROM ${I}.DEMO_FRAUD_GRAPH_EDGES e
            WHERE e.TARGET IN (SELECT NODE_ID FROM top_mules) OR e.SOURCE IN (SELECT NODE_ID FROM top_mules)
               OR (e.SOURCE IN (SELECT SOURCE FROM victims) AND e.EDGE_TYPE IN ('REPORTED', 'SAR_FILED'))`,
    mules: `SELECT NODE_ID AS MULE_ACCOUNT, DETAIL AS VICTIMS, ROUND(AMOUNT_GBP) AS RECEIVED_GBP FROM ${I}.DEMO_FRAUD_GRAPH_NODES
            WHERE NODE_TYPE = 'MULE' ORDER BY AMOUNT_GBP DESC LIMIT 6`,
    alerts: `SELECT COUNT(*) AS ALERTS, COUNT_IF(CONFIRMED_FRAUD) AS CONFIRMED FROM ${I}.DEMO_FRAUD_ALERTS`,
  },
  "retail-case": {
    case: `SELECT CASE_ID, CUSTOMER_NAME, AGE, VULNERABLE_FLAG, LOSS_GBP, DECISION, REPORTED_TS::VARCHAR AS REPORTED_TS,
                  AI_CASE_SUMMARY, POLICE_REPORT_FIELDS::VARCHAR AS POLICE_REPORT_FIELDS, PHISHING_RED_FLAGS, POLICE_PDF, PHISHING_PNG
           FROM ${I}.DEMO_FINCRIME_CASE`,
  },
  "retail-names": {
    summary: `SELECT DECISION, COUNT(*) AS RECORDS, ANY_VALUE(METHOD) AS METHOD FROM ${I}.DEMO_NAME_MATCHES GROUP BY 1`,
    // real spelling differences, not just "SURNAME, First" reordered; a mix of matches and reviews
    examples: `SELECT SOURCE_DESCRIPTION, NAME_AS_WRITTEN, DOB_AS_WRITTEN, TOWN, MATCHED_NAME, MATCHED_CITY, DOB_MATCH, TOWN_MATCH, ROUND(SCORE) AS SCORE, DECISION
               FROM ${I}.DEMO_NAME_MATCHES
               WHERE DECISION IN ('MATCH', 'REVIEW')
                 AND UPPER(REGEXP_REPLACE(NAME_AS_WRITTEN, '^([^,]+), (.+)$', '\\\\2 \\\\1')) <> UPPER(MATCHED_NAME)
               QUALIFY ROW_NUMBER() OVER (PARTITION BY DECISION ORDER BY SCORE DESC, MENTION_ID) <= 5
               ORDER BY DECISION, SCORE DESC`,
  },
  "corporate-payments": {
    kpis: `SELECT * FROM ${I}.DEMO_CORPORATE_KPIS`,
    // per scheme; the stop sums the total, and picking scheme rows overlays their lines
    weekly: `SELECT WEEK::VARCHAR AS WEEK, PAYMENT_TYPE, SUM(VOLUME_GBP) AS VOLUME_GBP FROM ${I}.DEMO_PAYMENTS_DAILY
             WHERE WEEK > (SELECT MIN(WEEK) FROM ${I}.DEMO_PAYMENTS_DAILY) AND WEEK < (SELECT MAX(WEEK) FROM ${I}.DEMO_PAYMENTS_DAILY)  -- whole weeks only
             GROUP BY 1, 2 ORDER BY 1`,
    schemes: `SELECT PAYMENT_TYPE, SUM(PAYMENTS) AS PAYMENTS, SUM(VOLUME_GBP) AS VOLUME_GBP, ROUND(100 * SUM(COMPLETED) / SUM(PAYMENTS), 2) AS SUCCESS_PCT FROM ${I}.DEMO_PAYMENTS_DAILY GROUP BY 1 ORDER BY 3 DESC`,
    // weekly payment counts with +/- 3 sigma limits, and the next 4 weeks from SNOWFLAKE.ML.FORECAST
    control: `SELECT WEEK::VARCHAR AS WEEK, SERIES, PAYMENTS, MEAN, UCL, LCL, BREACH, REASON FROM ${I}.DEMO_PAYMENTS_CONTROL ORDER BY WEEK`,
    forecast: `SELECT WEEK::VARCHAR AS WEEK, SERIES, FORECAST, LOWER_BOUND, UPPER_BOUND FROM ${I}.DEMO_PAYMENTS_FORECAST ORDER BY WEEK`,
  },
  "corporate-clients": {
    clients: `SELECT CLIENT_NAME, SECTOR, RM_NAME, COUNT(*) AS PAYMENTS, ROUND(SUM(AMOUNT_GBP)) AS VOLUME_GBP,
                     ROUND(100 * AVG(IFF(STATUS = 'COMPLETED', 1, 0)), 1) AS SUCCESS_PCT, COUNT_IF(STATUS = 'FAILED') AS FAILED,
                     ROUND(APPROX_PERCENTILE(PROCESSING_TIME_MS, 0.95) / 1000, 1) AS P95_S,
                     ROUND(SUM(IFF(STATUS = 'FAILED', AMOUNT_GBP, 0))) AS FAILED_VALUE_GBP,
                     -- the live stop's rule (DEMO_DT_SLA_BREACHES): failed, or over the scheme's limit
                     COUNT_IF(STATUS = 'FAILED' OR WITHIN_SLA = 0) AS OUTSIDE_SLA,
                     ROUND(SUM(IFF(STATUS = 'FAILED' OR WITHIN_SLA = 0, AMOUNT_GBP, 0))) AS OUTSIDE_SLA_VALUE_GBP
              FROM ${I}.DEMO_V_CORPORATE_PAYMENTS GROUP BY 1, 2, 3 ORDER BY VOLUME_GBP DESC LIMIT 12`,
  },
  "corporate-alerts": {
    severity: `SELECT SEVERITY, COUNT_IF(STATUS <> 'RESOLVED') AS OPEN_ALERTS, COUNT(*) AS ALERTS, ROUND(AVG(RESOLUTION_TIME_MIN)) AS AVG_RESOLUTION_MIN
               FROM ${I}.DEMO_V_CORPORATE_ALERTS GROUP BY 1 ORDER BY DECODE(SEVERITY, 'CRITICAL', 1, 'HIGH', 2, 'MEDIUM', 3, 4)`,
    // the latest 8 open alerts per severity, so picking a severity bar can filter the list
    open: `SELECT ALERT_ID, ALERT_DAY::VARCHAR AS ALERT_DAY, SEVERITY, PAYMENT_TYPE, LEFT(ALERT_DESCRIPTION, 140) AS ALERT_DESCRIPTION
           FROM ${I}.DEMO_V_CORPORATE_ALERTS WHERE STATUS <> 'RESOLVED'
           QUALIFY ROW_NUMBER() OVER (PARTITION BY SEVERITY ORDER BY ALERT_DAY DESC, ALERT_ID) <= 8
           ORDER BY DECODE(SEVERITY, 'CRITICAL', 1, 'HIGH', 2, 'MEDIUM', 3, 4), ALERT_DAY DESC`,
  },
  "corporate-feedback": {
    themes: `SELECT THEME, SUM(TIMES) AS COMMENTS, SUM(IFF(SENTIMENT = 'negative', TIMES, 0)) AS NEGATIVE,
                    SUM(IFF(SENTIMENT = 'positive', TIMES, 0)) AS POSITIVE
             FROM ${I}.DEMO_FEEDBACK_THEMES GROUP BY 1 ORDER BY COMMENTS DESC`,
    // the most-heard comments per theme, both sentiments, so picking a theme can filter them
    low: `SELECT THEME, SENTIMENT, TIMES, FEEDBACK_TEXT FROM ${I}.DEMO_FEEDBACK_THEMES
          QUALIFY ROW_NUMBER() OVER (PARTITION BY THEME ORDER BY IFF(SENTIMENT = 'negative', 0, 1), TIMES DESC) <= 6
          ORDER BY TIMES DESC`,
    rating: `SELECT ROUND(AVG(RATING), 2) AS AVG_RATING, COUNT(*) AS FEEDBACK FROM BANKING_DEMO.RAW_DATA.CUSTOMER_FEEDBACK`,
  },
  "corporate-live": {
    // the dynamic table, plus its refresh state from SHOW (data_timestamp = how fresh the result is)
    breaches: `SELECT PAYMENT_TYPE, SLA_NAME, MAX_PROCESSING_TIME_MS, PAYMENTS, BREACHES, BREACH_VALUE_GBP, SUCCESS_PCT, LATEST_PAYMENT::VARCHAR AS LATEST_PAYMENT
               FROM ${I}.DEMO_DT_SLA_BREACHES ORDER BY BREACHES DESC`,
    refresh: `SHOW DYNAMIC TABLES LIKE 'DEMO_DT_SLA_BREACHES' IN SCHEMA ${I}`,
    iceberg: `SELECT COUNT(*) AS TABLES, COUNT_IF(LEFT(TABLE_NAME, 3) <> 'RB_') AS CORPORATE, ROUND(SUM(ROW_COUNT)) AS ROWS_HELD
              FROM BANKING_DEMO.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'RAW_DATA' AND IS_ICEBERG = 'YES'`,
    added: `SELECT COUNT(*) AS LIVE_PAYMENTS FROM BANKING_DEMO.RAW_DATA.PAYMENTS WHERE PAYMENT_ID LIKE 'LIVE-%'`,
    clients: `SELECT COUNT(DISTINCT CLIENT_NAME) AS CLIENTS FROM ${I}.DEMO_V_CORPORATE_PAYMENTS WHERE STATUS = 'FAILED' OR WITHIN_SLA = 0`,
    // outside-SLA payments per client and scheme, for focusing the stop on one client (from Client 360)
    clientSla: `SELECT CLIENT_NAME, RM_NAME, PAYMENT_TYPE, COUNT(*) AS PAYMENTS, COUNT_IF(STATUS = 'FAILED' OR WITHIN_SLA = 0) AS OUTSIDE_SLA,
                       ROUND(SUM(IFF(STATUS = 'FAILED' OR WITHIN_SLA = 0, AMOUNT_GBP, 0))) AS OUTSIDE_SLA_VALUE_GBP
                FROM ${I}.DEMO_V_CORPORATE_PAYMENTS GROUP BY 1, 2, 3 ORDER BY 1, OUTSIDE_SLA DESC`,
    // the latest sent payment's journey: seen by the dynamic table, alert raised (12f), email in the RM's inbox
    pipeline: `SELECT p.PAYMENT_ID, d.LATEST_PAYMENT >= p.PAYMENT_DATE AS IN_DYNAMIC_TABLE, o.ALERT_ID, m.MESSAGE_ID
               FROM (SELECT PAYMENT_ID, PAYMENT_TYPE, PAYMENT_DATE FROM BANKING_DEMO.RAW_DATA.PAYMENTS WHERE PAYMENT_ID LIKE 'LIVE-%'
                     QUALIFY ROW_NUMBER() OVER (ORDER BY PAYMENT_DATE DESC) = 1) p
               LEFT JOIN ${I}.DEMO_DT_SLA_BREACHES d ON d.PAYMENT_TYPE = p.PAYMENT_TYPE
               LEFT JOIN BANKING_DEMO.RAW_DATA.OPERATIONAL_ALERTS o ON o.PAYMENT_ID = p.PAYMENT_ID
               LEFT JOIN ${E}.DEMO_INBOX m ON m.PAYMENT_ID = p.PAYMENT_ID AND m.SOURCE = 'SNOWFLAKE_ALERT'`,
  },
  // "corporate-ai-audit" isn't here: viewers can't read SNOWFLAKE.ACCOUNT_USAGE, so stopData calls the
  // owner's-rights procedure BANKING_DEMO.EXEC.DEMO_AI_AUDIT, which returns the same keys (agent, byUser, gateway, agentTotals)
  "retail-models": {
    // the model inventory (12g), built from the Model Registry, with validation and the AI-drafted card
    inventory: `SELECT MODEL_NAME, VERSION, IS_DEFAULT, PURPOSE, FRAMEWORK, ROUND(AUC, 3) AS AUC, TO_VARCHAR(REGISTERED_ON, 'YYYY-MM-DD') AS REGISTERED_ON,
                       OWNER, PERMITTED_USE, RISK_TIER, TRAINING_DATA, STATUS, CONDITIONS FROM ${E}.DEMO_MODEL_INVENTORY`,
    validation: `SELECT CUT, GROUP_NAME, CUSTOMERS, PREDICTED_PCT, CALIBRATED_PCT, ACTUAL_PCT FROM ${E}.DEMO_MODEL_VALIDATION
                 ORDER BY CUT, DECODE(GROUP_NAME, 'HIGH', 1, 'MEDIUM', 2, 'LOW', 3, 9), CUSTOMERS DESC`,
    card: `SELECT CARD, TO_VARCHAR(DRAFTED_AT, 'YYYY-MM-DD HH24:MI') AS DRAFTED_AT FROM ${E}.DEMO_MODEL_CARD`,
  },
  // one number (or two) per regulation for the map and the "Avoiding the fine" stop
  regulations: {
    evidence: `SELECT
        (SELECT SUM(BREACHES) FROM ${I}.DEMO_DT_SLA_BREACHES) AS OPRES_BREACHES,
        (SELECT COUNT(*) FROM BANKING_DEMO.RAW_DATA.OPERATIONAL_ALERTS WHERE PAYMENT_ID LIKE 'LIVE-%') AS OPRES_ALERTS,
        (SELECT COUNT_IF(VULNERABLE_FLAG) FROM BANKING_DEMO.RAW_DATA.RB_CUSTOMERS) AS CD_VULNERABLE,
        (SELECT COUNT(*) FROM BANKING_DEMO.RAW_DATA.RB_COMPLAINTS) AS CD_COMPLAINTS,
        (SELECT COUNT(*) FROM BANKING_DEMO.RAW_DATA.RB_FRAUD_CASES) AS APP_CASES,
        (SELECT ROUND(100 * COUNT_IF(DECISION IN ('REFUNDED_UNAUTHORISED', 'REIMBURSED_PSR_RULES', 'PARTIAL_REIMBURSEMENT_GROSS_NEGLIGENCE')) / COUNT(*))
           FROM BANKING_DEMO.RAW_DATA.RB_FRAUD_CASES) AS APP_REIMBURSED_PCT,
        (SELECT COUNT(*) FROM ${I}.DEMO_V_MULE_ACCOUNTS) AS AML_MULES,
        (SELECT COUNT(*) FROM BANKING_DEMO.RAW_DATA.RB_SAR_NARRATIVES) AS AML_SARS,
        (SELECT COUNT(*) FROM ${E}.DEMO_DATA_REQUESTS) AS GDPR_REQUESTS,
        (SELECT COUNT(*) FROM ${I}.DEMO_CLIENT_ACCOUNTS) AS GDPR_MASKED_ACCOUNTS,
        (SELECT COUNT(*) FROM ${E}.DEMO_MODEL_INVENTORY) AS MR_MODELS,
        (SELECT ANY_VALUE(STATUS) FROM ${E}.DEMO_MODEL_INVENTORY) AS MR_STATUS,
        (SELECT SUM(BUSINESSES) FROM ${I}.DEMO_BUSINESS_CLOSURE_IMPACT) AS CASH_BUSINESSES,
        (SELECT SUM(NOT_DIGITAL) FROM ${I}.DEMO_BUSINESS_CLOSURE_IMPACT) AS CASH_NOT_DIGITAL`,
  },
  "corporate-governed": {
    // raw columns: the masking policy DEMO_MASK_ACCOUNT_ID does the masking, not this query
    accounts: `SELECT ACCOUNT_ID, CLIENT_NAME, CURRENCY, ACCOUNT_TYPE, COALESCE(IBAN, SORT_CODE || ' ' || ACCOUNT_NUMBER) AS ACCOUNT_IDENTIFIER
               FROM ${I}.DEMO_CLIENT_ACCOUNTS ORDER BY CURRENCY = 'GBP', ACCOUNT_ID LIMIT 10`,
    policy: `SELECT CURRENT_ROLE() AS VIEWING_ROLE`,
  },
}

export async function stopData(stop: string): Promise<Record<string, Record<string, unknown>[]> | null> {
  if (stop === "corporate-ai-audit") {
    const rows = await querySnowflake(`CALL ${E}.DEMO_AI_AUDIT()`)
    const v = Object.values(rows[0] ?? {})[0]
    return (typeof v === "string" ? JSON.parse(v) : v) as Record<string, Record<string, unknown>[]>
  }
  const queries = STOP_QUERIES[stop]
  if (!queries) return null
  const entries = await Promise.all(Object.entries(queries).map(async ([k, sql]) => [k, await querySnowflake(sql)] as const))
  return Object.fromEntries(entries)
}

/** The demo mailbox (12f): the message list, newest first, without bodies. */
export async function inboxList() {
  return querySnowflake(
    `SELECT MESSAGE_ID, TO_VARCHAR(SENT_AT, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AS SENT_AT, FROM_NAME, FROM_ADDR, TO_NAME, TO_ADDR, SUBJECT, PREVIEW, SEVERITY, SOURCE
     FROM ${E}.DEMO_INBOX WHERE FOLDER = 'INBOX' ORDER BY SENT_AT DESC LIMIT 50`,
  )
}

/** One demo email's HTML body. */
export async function inboxMessage(id: string) {
  const [row] = await querySnowflake(`SELECT MESSAGE_ID, HTML_BODY FROM ${E}.DEMO_INBOX WHERE MESSAGE_ID = ?`, { binds: [id] })
  return row ?? null
}

/**
 * "What if we fixed it?": outside-SLA payments today vs with every payment `speedup` (0-0.9) faster,
 * `fixFailures` (0-1) of failed payments prevented, and optionally new per-scheme limits in ms. Same rule
 * as the live stop: failed, or over the limit. Prevented failures are picked by a hash of the payment id, so
 * a slider position always gives the same answer. Inputs are validated by the caller and bound, never spliced in.
 */
export async function whatIf(speedup: number, limits: Record<string, number>, fixFailures = 0) {
  const binds = [JSON.stringify(limits), Math.round(fixFailures * 100), speedup]
  const base = `WITH lim AS (
      SELECT PAYMENT_TYPE, SLA_NAME, MAX_PROCESSING_TIME_MS AS TODAY_MS,
             COALESCE(GET(PARSE_JSON(?), PAYMENT_TYPE)::NUMBER, MAX_PROCESSING_TIME_MS) AS NEW_MS
      FROM BANKING_DEMO.RAW_DATA.SLA_DEFINITIONS),
    p AS (
      SELECT v.CLIENT_NAME, v.RM_NAME, v.PAYMENT_TYPE, v.AMOUNT_GBP, l.SLA_NAME, l.TODAY_MS, l.NEW_MS,
             v.STATUS = 'FAILED' OR v.PROCESSING_TIME_MS > l.TODAY_MS AS IS_OUT_TODAY,
             (v.STATUS = 'FAILED' AND MOD(ABS(HASH(v.PAYMENT_ID)), 100) >= ?) OR v.PROCESSING_TIME_MS * (1 - ?) > l.NEW_MS AS IS_OUT_NEW
      FROM ${I}.DEMO_V_CORPORATE_PAYMENTS v JOIN lim l ON l.PAYMENT_TYPE = v.PAYMENT_TYPE)`
  const [schemes, clients] = await Promise.all([
    querySnowflake(
      `${base}
       SELECT PAYMENT_TYPE, ANY_VALUE(SLA_NAME) AS SLA_NAME, ANY_VALUE(TODAY_MS) AS TODAY_MS, ANY_VALUE(NEW_MS) AS NEW_MS, COUNT(*) AS PAYMENTS,
              COUNT_IF(IS_OUT_TODAY) AS OUT_TODAY, COUNT_IF(IS_OUT_NEW) AS OUT_NEW,
              ROUND(SUM(IFF(IS_OUT_TODAY, AMOUNT_GBP, 0))) AS VALUE_TODAY_GBP, ROUND(SUM(IFF(IS_OUT_NEW, AMOUNT_GBP, 0))) AS VALUE_NEW_GBP
       FROM p GROUP BY 1 ORDER BY OUT_TODAY DESC`,
      { binds },
    ),
    querySnowflake(
      `${base}
       SELECT CLIENT_NAME, ANY_VALUE(RM_NAME) AS RM_NAME, COUNT_IF(IS_OUT_TODAY) AS OUT_TODAY, COUNT_IF(IS_OUT_NEW) AS OUT_NEW
       FROM p GROUP BY 1 HAVING OUT_TODAY > 0 ORDER BY OUT_TODAY - OUT_NEW DESC, CLIENT_NAME`,
      { binds },
    ),
  ])
  // measured, not assumed: how long a payment alert takes the operations team to resolve
  const [effort] = await querySnowflake(
    `SELECT COUNT(*) AS ALERTS, MEDIAN(RESOLUTION_TIME_MIN) AS MEDIAN_MIN
     FROM BANKING_DEMO.RAW_DATA.OPERATIONAL_ALERTS WHERE RESOLUTION_TIME_MIN IS NOT NULL`,
  )
  return { schemes, clients, effort: effort ?? {} }
}

/** "A customer asks for their data" (UK GDPR right of access): the owner's-rights procedure in 12g. */
export async function dataRequest(customerId: string) {
  const [row] = await querySnowflake(`CALL ${E}.DEMO_DATA_REQUEST(?)`, { binds: [customerId] })
  const v = Object.values(row ?? {})[0]
  return (typeof v === "string" ? JSON.parse(v) : v) as Record<string, unknown>
}

/** Is Cortex Search enabled for the demo (step 12e ran)? */
export async function searchEnabled(): Promise<boolean> {
  const rows = await querySnowflake(`SHOW CORTEX SEARCH SERVICES LIKE 'DEMO_NAME_SEARCH' IN SCHEMA ${E}`)
  return rows.length > 0
}

/** "Is this our customer?": candidates for a typed name, then the same evidence score as the lab. */
export async function nameLookup(name: string, dob: string, town: string) {
  if (await searchEnabled()) {
    return querySnowflake(
      `WITH r AS (SELECT * FROM TABLE(CORTEX_SEARCH_RETRIEVE(service_name => '${E}.DEMO_NAME_SEARCH', query => ?, limit => 8)))
       SELECT CUSTOMER_ID, FULL_NAME, CITY, DOB, SEGMENT, LEFT_BANK,
              (DOB::DATE = TRY_TO_DATE(?, 'DD/MM/YYYY') OR DOB::DATE = TRY_TO_DATE(?, 'MM/DD/YYYY')) AS DOB_MATCH,
              NULLIF(?, '') IS NOT NULL AND UPPER(CITY) = UPPER(?) AS TOWN_MATCH,
              ROUND(JAROWINKLER_SIMILARITY(UPPER(FULL_NAME), UPPER(REGEXP_REPLACE(?, '^([^,]+), (.+)$', '\\\\2 \\\\1')))) AS NAME_SIM,
              'CORTEX_SEARCH' AS METHOD
       FROM r`,
      { binds: [name, dob, dob, town, town, name] },
    )
  }
  return querySnowflake(
    `SELECT CUSTOMER_ID, FIRST_NAME || ' ' || LAST_NAME AS FULL_NAME, CITY, TO_VARCHAR(DATE_OF_BIRTH, 'YYYY-MM-DD') AS DOB, SEGMENT,
            IFF(CHURNED, 'yes', 'no') AS LEFT_BANK,
            (DATE_OF_BIRTH = TRY_TO_DATE(?, 'DD/MM/YYYY') OR DATE_OF_BIRTH = TRY_TO_DATE(?, 'MM/DD/YYYY')) AS DOB_MATCH,
            NULLIF(?, '') IS NOT NULL AND UPPER(CITY) = UPPER(?) AS TOWN_MATCH,
            ROUND(JAROWINKLER_SIMILARITY(UPPER(FIRST_NAME || ' ' || LAST_NAME), UPPER(REGEXP_REPLACE(?, '^([^,]+), (.+)$', '\\\\2 \\\\1')))) AS NAME_SIM,
            'NAME_SIMILARITY' AS METHOD
     FROM BANKING_DEMO.RAW_DATA.RB_CUSTOMERS
     QUALIFY ROW_NUMBER() OVER (ORDER BY NAME_SIM DESC) <= 8`,
    { binds: [dob, dob, town, town, name] },
  )
}

/** "Find similar cases": plain-English search over case notes, SARs and fraud calls. */
export async function caseSearch(query: string) {
  if (!(await searchEnabled())) return null
  // the closest two of each kind (case notes, SARs, calls), in search order; call excerpts start where the customer speaks
  const rows = await querySnowflake(
    `SELECT DOC_ID, DOC_TYPE, FRAUD_TYPE, CUSTOMER_ID, TITLE,
            LEFT(IFF(DOC_TYPE = 'FRAUD_CALL' AND POSITION('CUSTOMER:' IN BODY) > 0, SUBSTR(BODY, POSITION('CUSTOMER:' IN BODY)), BODY), 400) AS EXCERPT
     FROM TABLE(CORTEX_SEARCH_RETRIEVE(service_name => '${E}.DEMO_FINCRIME_SEARCH', query => ?, limit => 30))`,
    { binds: [query] },
  )
  const seen: Record<string, number> = {}
  return rows.filter((r) => (seen[r.DOC_TYPE] = (seen[r.DOC_TYPE] ?? 0) + 1) <= 2)
}

export type AssistantAnswer = { text: string; tools: string[]; sql: string[]; table?: { columns: string[]; rows: unknown[][] } }

/** Ask DEMO_EXEC_ASSISTANT one question (non-streaming). */
export async function askAssistant(question: string): Promise<AssistantAnswer> {
  const body = JSON.stringify({ messages: [{ role: "user", content: [{ type: "text", text: question }] }], stream: false })
  const [row] = await querySnowflake(`SELECT SNOWFLAKE.CORTEX.DATA_AGENT_RUN('${E}.DEMO_EXEC_ASSISTANT', ?) AS R`, { binds: [body] })
  const r = typeof row?.R === "string" ? JSON.parse(row.R) : row?.R
  const content: any[] = r?.content ?? []
  const text = content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim()
  const tools = content.filter((c) => c.type === "tool_use").map((c) => c.tool_use?.name).filter((n) => n && n !== "system_execute_sql")
  const sql = content.filter((c) => c.type === "tool_result")
    .map((c) => c.tool_result?.content?.[0]?.json?.sql).filter((s): s is string => typeof s === "string")
  const t = content.find((c) => c.type === "table")?.table?.result_set
  const table = t ? { columns: (t.resultSetMetaData?.rowType ?? []).map((c: any) => c.name), rows: (t.data ?? []).slice(0, 10) } : undefined
  return { text: text || "No answer came back. Try rephrasing the question.", tools: [...new Set(tools as string[])], sql, table }
}
