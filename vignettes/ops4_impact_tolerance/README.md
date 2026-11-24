# OPS4: Stay inside impact tolerance

| | |
|---|---|
| **Persona** | Payments Ops analyst / team lead |
| **Time** | ~35 min |
| **Prerequisites** | `setup/catchup/core_analytics.sql` |

## Business question
> Operational resilience rules ask us to keep each important business service within its impact tolerance. Would we know a CHAPS payment was going to miss the cut-off in time to do something about it, and could we prove it afterwards?

## What you'll build
- `IMPORTANT_BUSINESS_SERVICES` with an impact tolerance for each service
- `V_TOLERANCE_BREACHES`: payments in flight that are past their limit and not yet escalated
- Snowflake Alert `ALERT_IMPACT_TOLERANCE`, which calls `RAISE_ESCALATIONS` and records each breach in `ESCALATIONS`

## Steps
### Write down the important business services
Where: the Cortex Code sidebar
```prompt
In BANKING_HOL.ANALYTICS create a table IMPORTANT_BUSINESS_SERVICES (SERVICE, PAYMENT_TYPE, IMPACT_TOLERANCE, CUTOFF_UK as a TIME, ESCALATE_MINUTES_BEFORE, OWNER) with two rows: 'Make a high-value same-day payment' for CHAPS, tolerance 'Settled before the 18:00 CHAPS cut-off on the day it is sent', cut-off 18:00, escalate 60 minutes before; and 'Make a real-time payment' for FASTER_PAYMENTS, tolerance 'Back within 2 hours of a disruption', cut-off 23:59, escalate 120 minutes before. Owner for both: Head of Payments Operations.
```
Expect: the tolerance is now data next to the payments, not a line in a policy document
Check: ops4_services

### Measure payments against the tolerance
```prompt
In BANKING_HOL.ANALYTICS create a table PAYMENTS_IN_FLIGHT (PAYMENT_ID, RECEIVED_AT TIMESTAMP_NTZ, PAYMENT_TYPE, CLIENT_NAME, AMOUNT_GBP NUMBER(15,2), STATUS, PROCESSING_TIME_MS) and a table ESCALATIONS (ESCALATION_ID, RAISED_AT TIMESTAMP_LTZ, PAYMENT_ID, SERVICE, MINUTES_TO_CUTOFF, OWNER, MESSAGE). Then create a view V_TOLERANCE_BREACHES of in-flight payments with STATUS PENDING or FAILED whose PROCESSING_TIME_MS is over the scheme's MAX_PROCESSING_TIME_MS in BANKING_HOL.RAW_DATA.SLA_DEFINITIONS, joined to IMPORTANT_BUSINESS_SERVICES, with MINUTES_TO_CUTOFF from the current UK time (CONVERT_TIMEZONE to Europe/London) to today's CUTOFF_UK, and only payments with no row in ESCALATIONS yet.
```
Expect: an empty view for now: nothing is in flight

### Escalate with a Snowflake Alert
```prompt
In BANKING_HOL.ANALYTICS create a SQL stored procedure RAISE_ESCALATIONS() that inserts one ESCALATIONS row per row of V_TOLERANCE_BREACHES (id 'ESC-' plus the payment id, the service, minutes to cut-off, the owner, and a one-line message naming the client, scheme, amount and either the minutes left or that the tolerance was breached), then suspends the alert ALERT_IMPACT_TOLERANCE and returns how many it raised. Then create the alert ALERT_IMPACT_TOLERANCE on BANKING_WH, schedule 1 minute, that runs when V_TOLERANCE_BREACHES has any rows and calls RAISE_ESCALATIONS. Leave it suspended.
```
Expect: a suspended alert: it only costs anything while it is switched on, and it switches itself off after escalating
Check: ops4_alert

### Test it with a stuck payment
```prompt
Insert a test row into BANKING_HOL.ANALYTICS.PAYMENTS_IN_FLIGHT: id 'TEST-' plus 10 random characters, received now, CHAPS, client 'Liverpool Freight', 250000, status PENDING, processing time 9000 ms. Then resume ALERT_IMPACT_TOLERANCE.
```
Expect: the alert switched on, with one breach waiting in `V_TOLERANCE_BREACHES`
Check: ops4_triggered

### Watch it escalate
Give the alert about a minute to run, then:
```prompt
Show the history of ALERT_IMPACT_TOLERANCE for the last hour from INFORMATION_SCHEMA.ALERT_HISTORY, the rows in ESCALATIONS, and whether the alert is now suspended.
```
Expect: one run in state `TRIGGERED`, one escalation, and the alert suspended again
Check: ops4_escalated

### Brief the board
```prompt
Using IMPORTANT_BUSINESS_SERVICES, ESCALATIONS and the alert history of ALERT_IMPACT_TOLERANCE, write a short board-ready note: for each important business service, its impact tolerance, how many breaches were escalated, how long after the payment arrived each was escalated, and whether any escalation came too late to act.
```
Expect: evidence for the operational resilience self-assessment, straight from the alert history

## Check your work
`ALERT_IMPACT_TOLERANCE` shows a `TRIGGERED` run, `ESCALATIONS` has a row for your test payment, and the alert is suspended again.

## In your bank
In production the alert would read the live payments feed (the DE2 dynamic table or the DE3 stream) and send to the operations on-call channel through a notification integration. The executive demo's "A payment at risk" stop is this module, finished.
