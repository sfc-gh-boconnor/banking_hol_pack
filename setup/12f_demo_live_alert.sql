-- =====================================================
-- BANKING HOL PACK - EXECUTIVE DEMO
-- STEP 12f: A CLIENT'S PAYMENT AT RISK -> SNOWFLAKE ALERT -> RM INBOX
--
-- The corporate "Live" stop: "Send the payment" adds a stuck £250,000 CHAPS payment
-- for Liverpool Freight. The dynamic table DEMO_DT_SLA_BREACHES (12b) sees it within
-- a minute; the Snowflake Alert DEMO_ALERT_CHAPS_AT_RISK then raises a CRITICAL
-- operational alert and writes an HTML briefing to the relationship manager's
-- demo mailbox, DEMO_INBOX.
--
-- Nothing is emailed: there is no notification integration, every address is
-- @bank-demo.example, and the "email" is a row only the Lab Companion reads.
-- The alert runs only while a sent payment waits: the send procedure resumes it and
-- it suspends itself once everything pending is raised, so it costs nothing idle.
-- Needs EXECUTE ALERT for HOL_ADMIN (granted in 11_lab_data_loader.sql).
-- =====================================================
USE ROLE HOL_ADMIN;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_DEMO.EXEC;

-- ---------- Payments at risk: what the alert looks for ----------
-- A LIVE- payment breaching its scheme's SLA, once the dynamic table has caught up with it,
-- that has no operational alert yet. One row per payment, with what the email needs.
CREATE OR REPLACE VIEW BANKING_DEMO.INSIGHTS.DEMO_V_PAYMENTS_AT_RISK
  COMMENT = 'Exec demo: sent demo payments breaching SLA, seen by the dynamic table, not yet alerted'
AS
WITH now_uk AS (SELECT CONVERT_TIMEZONE('Europe/London', CURRENT_TIMESTAMP())::TIMESTAMP_NTZ AS T)
SELECT p.PAYMENT_ID, p.PAYMENT_TYPE, s.SLA_NAME, s.MAX_PROCESSING_TIME_MS, p.PROCESSING_TIME_MS, p.STATUS,
       ROUND(p.AMOUNT * COALESCE(p.FX_RATE, 1)) AS AMOUNT_GBP,
       c.CUSTOMER_NAME AS CLIENT_NAME, c.SECTOR, rm.RM_NAME, rm.TEAM AS RM_TEAM,
       -- CHAPS closes for customer payments at 18:00 UK time
       DATEDIFF(minute, n.T, DATEADD(hour, 18, DATE_TRUNC(day, n.T))) AS MINUTES_TO_CUTOFF,
       TO_VARCHAR(n.T, 'HH24:MI') AS UK_TIME,
       TO_VARCHAR(CURRENT_TIMESTAMP(), 'YYYY-MM-DD HH24:MI:SS') AS EVENT_TIME
FROM BANKING_DEMO.RAW_DATA.PAYMENTS p
JOIN BANKING_DEMO.RAW_DATA.SLA_DEFINITIONS s ON s.PAYMENT_TYPE = p.PAYMENT_TYPE
JOIN BANKING_DEMO.INSIGHTS.DEMO_DT_SLA_BREACHES d ON d.PAYMENT_TYPE = p.PAYMENT_TYPE AND d.LATEST_PAYMENT >= p.PAYMENT_DATE
JOIN BANKING_DEMO.RAW_DATA.ACCOUNTS a ON a.ACCOUNT_ID = p.ORIGINATOR_ACCOUNT_ID
JOIN BANKING_DEMO.RAW_DATA.CUSTOMERS c ON c.CUSTOMER_ID = a.CUSTOMER_ID
LEFT JOIN BANKING_DEMO.RAW_DATA.RELATIONSHIP_MANAGERS rm ON rm.RM_ID = c.RM_ID
CROSS JOIN now_uk n
WHERE p.PAYMENT_ID LIKE 'LIVE-%'
  -- still in flight (or failed) and past its limit: a completed payment can't miss the cut-off
  AND p.STATUS IN ('PENDING', 'FAILED') AND p.PROCESSING_TIME_MS > s.MAX_PROCESSING_TIME_MS
  AND NOT EXISTS (SELECT 1 FROM BANKING_DEMO.RAW_DATA.OPERATIONAL_ALERTS o WHERE o.PAYMENT_ID = p.PAYMENT_ID);

-- ---------- The demo mailbox ----------
CREATE OR REPLACE TABLE DEMO_INBOX (
    MESSAGE_ID  VARCHAR,
    SENT_AT     TIMESTAMP_LTZ,
    FOLDER      VARCHAR,         -- INBOX
    FROM_NAME   VARCHAR,
    FROM_ADDR   VARCHAR,
    TO_NAME     VARCHAR,
    TO_ADDR     VARCHAR,
    SUBJECT     VARCHAR,
    PREVIEW     VARCHAR,         -- one line for the message list
    HTML_BODY   VARCHAR,
    SEVERITY    VARCHAR,         -- CRITICAL, HIGH, INFO
    PAYMENT_ID  VARCHAR,
    SOURCE      VARCHAR          -- SNOWFLAKE_ALERT or SEED
) COMMENT = 'Exec demo: a fictitious relationship manager mailbox. Nothing here is ever sent.';
GRANT SELECT ON TABLE DEMO_INBOX TO ROLE HOL_PARTICIPANT;

-- HTML helpers: escape text, and wrap a body in the shared email layout
CREATE OR REPLACE FUNCTION DEMO_HTML_ESC(S VARCHAR) RETURNS VARCHAR
AS $$ REPLACE(REPLACE(REPLACE(COALESCE(S, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') $$;

CREATE OR REPLACE FUNCTION DEMO_EMAIL_HTML(BANNER VARCHAR, BANNER_COLOUR VARCHAR, HEADING VARCHAR, BODY VARCHAR) RETURNS VARCHAR
AS $$
'<!doctype html><html><head><meta charset="utf-8"><style>'
|| 'body{margin:0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937;background:#f3f4f6}'
|| '.wrap{max-width:640px;margin:0 auto;background:#fff}'
|| '.top{background:#00395d;color:#fff;padding:16px 24px;font-size:13px;letter-spacing:.04em}'
|| '.top b{font-size:16px;letter-spacing:0}'
|| '.banner{padding:10px 24px;color:#fff;font-weight:600;font-size:13px}'
|| '.main{padding:20px 24px}h1{font-size:20px;margin:0 0 12px;color:#00395d}'
|| 'p{font-size:14px;line-height:1.55;margin:0 0 12px}'
|| 'table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 16px}'
|| 'th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #e5e7eb}th{background:#f9fafb;color:#6b7280;font-weight:600}'
|| '.facts td:first-child{color:#6b7280;width:42%}.big{font-size:28px;font-weight:700;color:#00395d}'
|| '.callout{background:#eef6fb;border-left:4px solid #00aeef;padding:12px 14px;font-size:14px;line-height:1.55;margin:0 0 16px}'
|| '.btns span{display:inline-block;margin:0 8px 8px 0;padding:8px 14px;border-radius:4px;background:#00aeef;color:#fff;font-size:13px;font-weight:600}'
|| '.btns span.alt{background:#fff;color:#00395d;border:1px solid #00395d}'
|| '.foot{padding:14px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}'
|| '</style></head><body><div class="wrap">'
|| '<div class="top"><b>Corporate Banking</b> &nbsp; &middot; Payments Operations</div>'
|| '<div class="banner" style="background:' || BANNER_COLOUR || '">' || BANNER || '</div>'
|| '<div class="main"><h1>' || HEADING || '</h1>' || BODY || '</div>'
|| '<div class="foot">Fictitious demo message generated in Snowflake for the executive demo. Nothing was sent; all names and addresses are invented.</div>'
|| '</div></body></html>'
$$;

-- ---------- Background mail, so the inbox looks lived in ----------
-- Built from the demo data: this morning's SLA digest, older open alerts, a client complaint.
INSERT INTO DEMO_INBOX
SELECT 'SEED-DIGEST', DATEADD(hour, -7, CURRENT_TIMESTAMP()), 'INBOX',
       'Payments Operations', 'payments-ops@bank-demo.example', 'Elena Vasquez', 'elena.vasquez@bank-demo.example',
       'Morning SLA digest: ' || TRIM(TO_CHAR(SUM(BREACHES), '999,999,990')) || ' breaches across ' || COUNT(*) || ' schemes',
       'Overnight position by scheme, from the live SLA dynamic table.',
       DEMO_EMAIL_HTML('Daily digest', '#475569', 'Good morning, Elena',
         '<p>Here is the overnight position by scheme. Figures come straight from the live SLA view, so they match what operations see.</p>'
         || '<table><tr><th>Scheme</th><th>Breaches</th><th>Value</th><th>Success</th></tr>'
         || LISTAGG('<tr><td>' || DEMO_HTML_ESC(SLA_NAME) || '</td><td>' || TRIM(TO_CHAR(BREACHES, '999,999,990')) || '</td><td>&pound;'
                    || TRIM(TO_CHAR(BREACH_VALUE_GBP / 1e6, '999,990.0')) || 'm</td><td>' || SUCCESS_PCT || '%</td></tr>', '')
                    WITHIN GROUP (ORDER BY BREACHES DESC)
         || '</table><p>No action needed unless a client contacts you.</p>'),
       'INFO', NULL, 'SEED'
FROM BANKING_DEMO.INSIGHTS.DEMO_DT_SLA_BREACHES;

INSERT INTO DEMO_INBOX
SELECT 'SEED-' || ALERT_ID, DATEADD(minute, -60 * (4 + ROW_NUMBER() OVER (ORDER BY ALERT_TIME DESC)), CURRENT_TIMESTAMP()), 'INBOX',
       'Payments Operations', 'payments-ops@bank-demo.example', 'Elena Vasquez', 'elena.vasquez@bank-demo.example',
       INITCAP(SEVERITY) || ' alert ' || ALERT_ID || ': ' || ALERT_DESCRIPTION,
       PAYMENT_TYPE || ' payment ' || PAYMENT_ID || ', assigned to ' || ASSIGNED_TO || '.',
       DEMO_EMAIL_HTML(SEVERITY || ' &middot; ' || PAYMENT_TYPE, IFF(SEVERITY = 'CRITICAL', '#b91c1c', '#c2410c'), DEMO_HTML_ESC(ALERT_DESCRIPTION),
         '<table class="facts"><tr><td>Alert</td><td>' || ALERT_ID || '</td></tr><tr><td>Payment</td><td>' || PAYMENT_ID || '</td></tr>'
         || '<tr><td>Scheme</td><td>' || PAYMENT_TYPE || '</td></tr><tr><td>Assigned to</td><td>' || DEMO_HTML_ESC(ASSIGNED_TO) || '</td></tr></table>'
         || '<p>Operations are working this one. You are copied as the relationship manager.</p>'),
       SEVERITY, PAYMENT_ID, 'SEED'
FROM BANKING_DEMO.RAW_DATA.OPERATIONAL_ALERTS
WHERE STATUS <> 'RESOLVED' AND SEVERITY IN ('CRITICAL', 'HIGH') AND PAYMENT_ID NOT LIKE 'LIVE-%'
QUALIFY ROW_NUMBER() OVER (ORDER BY ALERT_TIME DESC) <= 3;

INSERT INTO DEMO_INBOX
SELECT 'SEED-' || FEEDBACK_ID, DATEADD(hour, -26, CURRENT_TIMESTAMP()), 'INBOX',
       'Client Service', 'client-service@bank-demo.example', 'Elena Vasquez', 'elena.vasquez@bank-demo.example',
       'Client feedback, rated ' || RATING || '/5: ' || PAYMENT_TYPE,
       LEFT(FEEDBACK_TEXT, 110),
       DEMO_EMAIL_HTML('Client feedback', '#475569', 'A client wasn''t happy',
         '<div class="callout">&ldquo;' || DEMO_HTML_ESC(FEEDBACK_TEXT) || '&rdquo;</div>'
         || '<p>Rated ' || RATING || ' out of 5, received by ' || DEMO_HTML_ESC(FEEDBACK_CHANNEL) || '. Please follow up within two working days.</p>'),
       'HIGH', PAYMENT_ID, 'SEED'
FROM BANKING_DEMO.RAW_DATA.CUSTOMER_FEEDBACK
WHERE RATING <= 2 AND PAYMENT_TYPE = 'CHAPS'
QUALIFY ROW_NUMBER() OVER (ORDER BY FEEDBACK_DATE DESC) = 1;

-- ---------- Important business services (operational resilience) ----------
-- The impact tolerance for each service, held as data next to the payments it covers.
CREATE OR REPLACE TABLE DEMO_IMPORTANT_SERVICES (
    SERVICE        VARCHAR,
    PAYMENT_TYPE   VARCHAR,
    IMPACT_TOLERANCE VARCHAR,
    OWNER          VARCHAR
) COMMENT = 'Exec demo: important business services and their impact tolerances';
INSERT INTO DEMO_IMPORTANT_SERVICES VALUES
  ('Make a high-value same-day payment', 'CHAPS', 'Settled before the 18:00 CHAPS cut-off on the day it is sent', 'Head of Payments Operations'),
  ('Make a real-time payment', 'FASTER_PAYMENTS', 'Back within 2 hours of a disruption', 'Head of Payments Operations');
GRANT SELECT ON TABLE DEMO_IMPORTANT_SERVICES TO ROLE HOL_PARTICIPANT;

-- ---------- Raise the alert: operational alert + RM briefing ----------
-- Called by the alert. Reads the same view as the alert condition (so a run raises exactly
-- what it found), then suspends the alert: the next send resumes it.
CREATE OR REPLACE PROCEDURE DEMO_RAISE_PAYMENT_ALERT()
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Executive demo: for each payment at risk, add a CRITICAL operational alert and an HTML email to DEMO_INBOX'
EXECUTE AS OWNER
AS
$$
DECLARE
  c CURSOR FOR SELECT * FROM BANKING_DEMO.INSIGHTS.DEMO_V_PAYMENTS_AT_RISK;
  n INTEGER DEFAULT 0;
  pid VARCHAR; client VARCHAR; sector VARCHAR; rm VARCHAR; scheme VARCHAR; sla VARCHAR; status VARCHAR; uk_time VARCHAR;
  amount NUMBER; took_ms NUMBER; limit_ms NUMBER; mins NUMBER;
  amount_txt VARCHAR; cutoff_txt VARCHAR; history VARCHAR; advice VARCHAR; body VARCHAR; subject VARCHAR; service VARCHAR; tolerance VARCHAR;
BEGIN
  SELECT ANY_VALUE(SERVICE), ANY_VALUE(IMPACT_TOLERANCE) INTO :service, :tolerance
    FROM BANKING_DEMO.EXEC.DEMO_IMPORTANT_SERVICES WHERE PAYMENT_TYPE = 'CHAPS';
  FOR r IN c DO
    pid := r.PAYMENT_ID; client := r.CLIENT_NAME; sector := r.SECTOR; rm := COALESCE(r.RM_NAME, 'Relationship Manager');
    scheme := r.PAYMENT_TYPE; sla := r.SLA_NAME; status := r.STATUS; uk_time := r.UK_TIME;
    amount := r.AMOUNT_GBP; took_ms := r.PROCESSING_TIME_MS; limit_ms := r.MAX_PROCESSING_TIME_MS; mins := r.MINUTES_TO_CUTOFF;
    amount_txt := '&pound;' || TRIM(TO_CHAR(amount, '999,999,999,990'));
    cutoff_txt := IFF(mins > 0, FLOOR(mins / 60) || ' h ' || MOD(mins, 60) || ' min to the 18:00 CHAPS cut-off',
                                'past the 18:00 CHAPS cut-off: it now settles next working day');

    INSERT INTO BANKING_DEMO.RAW_DATA.OPERATIONAL_ALERTS
      (ALERT_ID, ALERT_TIME, SEVERITY, PAYMENT_TYPE, PAYMENT_ID, ALERT_DESCRIPTION, STATUS, ASSIGNED_TO, RESOLUTION_TIME_MIN)
    SELECT 'ALT-' || SUBSTR(:pid, 6), CURRENT_TIMESTAMP()::TIMESTAMP_NTZ(6), 'CRITICAL', :scheme, :pid,
           :client || ': ' || TRIM(TO_CHAR(:amount, '999,999,990')) || ' GBP CHAPS stuck past SLA, at risk of missing cut-off',
           'OPEN', :rm, NULL;

    SELECT COALESCE(LISTAGG('<tr><td>' || PAYMENT_DAY || '</td><td>' || PAYMENT_TYPE || '</td><td>&pound;'
                            || TRIM(TO_CHAR(AMOUNT_GBP, '999,999,990')) || '</td><td>' || INITCAP(STATUS) || '</td></tr>', '')
                    WITHIN GROUP (ORDER BY PAYMENT_DAY DESC), '')
      INTO :history
      FROM (SELECT PAYMENT_DAY, PAYMENT_TYPE, AMOUNT_GBP, STATUS FROM BANKING_DEMO.INSIGHTS.DEMO_V_CORPORATE_PAYMENTS
            WHERE CLIENT_NAME = :client AND PAYMENT_ID <> :pid ORDER BY PAYMENT_DAY DESC LIMIT 5);

    -- a suggested call, written by AI; fixed words if AI isn't available
    BEGIN
      SELECT AI_COMPLETE('claude-sonnet-4-5',
               'You are briefing a UK corporate relationship manager. In 2 short sentences, plain English, no greeting, no markdown, '
               || 'suggest what to say when they call the client now. Facts: client ' || :client || ' (' || :sector || '); a GBP '
               || :amount || ' CHAPS payment to its suppliers has been held in processing past the bank''s SLA; it is ' || :uk_time
               || ' UK time and ' || IFF(:mins > 0, :mins || ' minutes remain before the 18:00 CHAPS cut-off', 'the 18:00 CHAPS cut-off has passed')
               || '; operations are already investigating. Do not promise it will settle today.')
        INTO :advice;
    EXCEPTION WHEN OTHER THEN advice := NULL;
    END;
    advice := COALESCE(NULLIF(TRIM(advice), ''),
      'Call the client''s treasurer now: tell them we have spotted the delay, operations are on it, and you will confirm within 30 minutes whether it settles today. Offer to prioritise any other urgent payments.');

    subject := 'URGENT: ' || client || ' ' || REPLACE(amount_txt, '&pound;', '£') || ' CHAPS at risk of missing cut-off';
    body := '<p><b>' || DEMO_HTML_ESC(client) || '</b> sent a CHAPS payment that has been held in processing for '
         || ROUND(took_ms / 1000) || ' seconds, against the ' || ROUND(limit_ms / 1000) || '-second limit (' || DEMO_HTML_ESC(sla) || ').</p>'
         || '<p class="big">' || amount_txt || '</p>'
         || '<table class="facts"><tr><td>Client</td><td>' || DEMO_HTML_ESC(client) || ' &middot; ' || DEMO_HTML_ESC(sector) || '</td></tr>'
         || '<tr><td>Payment</td><td>' || pid || ' (' || INITCAP(status) || ')</td></tr>'
         || '<tr><td>Cut-off</td><td><b>' || cutoff_txt || '</b></td></tr>'
         || '<tr><td>Impact if missed</td><td>The client''s suppliers are not paid today</td></tr>'
         || '<tr><td>Important business service</td><td>' || DEMO_HTML_ESC(COALESCE(service, 'Make a high-value same-day payment')) || '<br><span style="color:#6b7280">Impact tolerance: ' || DEMO_HTML_ESC(COALESCE(tolerance, '')) || '</span></td></tr>'
         || '<tr><td>Operations</td><td>Investigating; alert ALT-' || SUBSTR(pid, 6) || ' raised ' || uk_time || ' UK</td></tr></table>'
         || '<p><b>Suggested call</b> (AI draft, check before using)</p><div class="callout">' || DEMO_HTML_ESC(advice) || '</div>'
         || '<div class="btns"><span>Call client</span><span class="alt">View in Client 360</span></div>'
         || IFF(history = '', '', '<p><b>Recent payments</b></p><table><tr><th>Day</th><th>Scheme</th><th>Amount</th><th>Status</th></tr>' || history || '</table>')
         || '<p style="color:#6b7280;font-size:12px">Raised automatically by the Snowflake Alert DEMO_ALERT_CHAPS_AT_RISK, about a minute after the payment arrived. No batch job, no overnight report.</p>';

    INSERT INTO BANKING_DEMO.EXEC.DEMO_INBOX
    SELECT 'MSG-' || SUBSTR(:pid, 6), CURRENT_TIMESTAMP(), 'INBOX',
           'Payments Alerts (Snowflake)', 'payments-alerts@bank-demo.example',
           :rm, LOWER(REPLACE(:rm, ' ', '.')) || '@bank-demo.example',
           :subject, :client || ' payment held past SLA. ' || :cutoff_txt || '.',
           BANKING_DEMO.EXEC.DEMO_EMAIL_HTML('CRITICAL &middot; Client payment at risk', '#b91c1c',
             'Call ' || BANKING_DEMO.EXEC.DEMO_HTML_ESC(:client) || ' now', :body),
           'CRITICAL', :pid, 'SNOWFLAKE_ALERT';
    n := n + 1;
  END FOR;
  ALTER ALERT BANKING_DEMO.EXEC.DEMO_ALERT_CHAPS_AT_RISK SUSPEND;
  RETURN n || ' alert(s) raised';
END;
$$;

-- ---------- The Snowflake Alert ----------
-- Created suspended; DEMO_SEND_LATE_PAYMENT resumes it and DEMO_RAISE_PAYMENT_ALERT suspends it.
CREATE OR REPLACE ALERT DEMO_ALERT_CHAPS_AT_RISK
  WAREHOUSE = BANKING_WH
  SCHEDULE = '1 MINUTE'
  COMMENT = 'Exec demo: a client payment breaching its SLA -> operational alert and RM email (demo inbox only)'
  IF (EXISTS (SELECT PAYMENT_ID, CLIENT_NAME, RM_NAME, AMOUNT_GBP, MINUTES_TO_CUTOFF, EVENT_TIME
              FROM BANKING_DEMO.INSIGHTS.DEMO_V_PAYMENTS_AT_RISK))
  THEN CALL BANKING_DEMO.EXEC.DEMO_RAISE_PAYMENT_ALERT();

-- ---------- "Send the payment" on the live stop ----------
-- The app runs as the viewer, who can't write to the payments table, so this owner's-rights
-- procedure adds one fixed row (no inputs): a £250,000 CHAPS from Liverpool Freight, still
-- PENDING after 9 s against the 5 s SLA. LIVE- ids; a demo rebuild (12a) removes them.
CREATE OR REPLACE PROCEDURE DEMO_SEND_LATE_PAYMENT()
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Executive demo: add one stuck CHAPS payment for Liverpool Freight and wake the alert'
EXECUTE AS OWNER
AS
$$
DECLARE
  pid VARCHAR DEFAULT 'LIVE-' || UPPER(LEFT(REPLACE(UUID_STRING(), '-', ''), 10));
BEGIN
  INSERT INTO BANKING_DEMO.RAW_DATA.PAYMENTS
    (PAYMENT_ID, PAYMENT_DATE, ORIGINATOR_ACCOUNT_ID, BENEFICIARY_ACCOUNT_ID, PAYMENT_TYPE, CHANNEL, CURRENCY, AMOUNT, FX_RATE, STATUS, PROCESSING_TIME_MS, REGION, SETTLEMENT_DATE)
  SELECT :pid, CURRENT_TIMESTAMP()::TIMESTAMP_NTZ, p.ORIGINATOR_ACCOUNT_ID, p.BENEFICIARY_ACCOUNT_ID, 'CHAPS', 'File Upload', 'GBP', 250000, 1, 'PENDING', 9000, p.REGION, NULL
  FROM BANKING_DEMO.RAW_DATA.PAYMENTS p
  JOIN BANKING_DEMO.INSIGHTS.DEMO_V_CORPORATE_PAYMENTS v ON v.PAYMENT_ID = p.PAYMENT_ID
  WHERE v.CLIENT_NAME = 'Liverpool Freight' AND p.PAYMENT_TYPE = 'CHAPS' AND p.CURRENCY = 'GBP'
  ORDER BY p.PAYMENT_ID LIMIT 1;
  ALTER ALERT BANKING_DEMO.EXEC.DEMO_ALERT_CHAPS_AT_RISK RESUME;
  RETURN pid;
END;
$$;
GRANT USAGE ON PROCEDURE DEMO_SEND_LATE_PAYMENT() TO ROLE HOL_PARTICIPANT;
