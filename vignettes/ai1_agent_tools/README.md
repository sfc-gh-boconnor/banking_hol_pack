# AI1: Agent with custom tools

| | |
|---|---|
| **Persona** | AI Builder |
| **Time** | ~45 min |
| **Prerequisites** | DA2 (`SV_CLIENT_360`), or run `client_360.sql` if you skipped it |

## Business question
> Ops staff ask about specific payments by ID and about scheme rules - not just aggregates. Give the agent precise tools.

## What you'll build
- UDF tools `PAYMENT_LOOKUP`, `SCHEME_RULES`
- Agent `BANKING_HOL.AGENTS.PAYMENTS_INVESTIGATOR`

## Steps
### Build the payment lookup tool
Where: the Cortex Code sidebar
Deterministic tools keep exact lookups exact, with no text-to-SQL guessing.
```prompt
In BANKING_HOL.AGENTS create a SQL table function GET_PAYMENT_DETAILS(PAYMENT_ID_IN VARCHAR) that returns one payment from BANKING_HOL.ANALYTICS.STG_PAYMENTS (matching UPPER(TRIM(PAYMENT_ID_IN))) with its date, type, amount, currency, status, processing time, error code, error description and IS_RETRYABLE (from RAW_DATA.ERROR_CODES), customer name and RM name (via STG_ACCOUNTS and STG_CUSTOMERS), and its count of open alerts. Agent tools need a scalar return, so also create PAYMENT_LOOKUP(PAYMENT_ID VARCHAR) RETURNS VARIANT that returns that row as a JSON object, or {"error": "No payment found with ID ..."}. Test it on the first FAILED payment.
```
Expect: a JSON object for one failed payment, including its error and retryability

### Build the scheme rules tool
```prompt
In BANKING_HOL.AGENTS create SCHEME_RULES(SCHEME VARCHAR) RETURNS VARIANT: look up BANKING_HOL.RAW_DATA.PAYMENT_SCHEMES by SCHEME_CODE (UPPER, spaces replaced by underscores) joined to SLA_DEFINITIONS on PAYMENT_TYPE, and return a JSON object with scheme, name, settlement_cycle, domestic, max_value_gbp, cutoff_time_uk (CUTOFF_TIME as a string), currency, sla_target_success_rate and sla_max_p95_ms. For unknown schemes return an error listing the valid ones. Test it with 'chaps'.
```
Expect: CHAPS rules with `cutoff_time_uk` of `15:45:00`
Check: ai1_tool

### Create the agent with Cortex Code
Where: banking-hol-pack Workspace > **+ > Agent** > **Create with CoCo** (recommended)
Media: ai1_create_agent.mp4 | + Add new > Agent > name it payments_investigator > Create with CoCo > paste the brief
1. Rename the new agent file to `payments_investigator` straight away.
2. Paste this brief into Cortex Code.
```prompt
Create a Cortex Agent BANKING_HOL.AGENTS.PAYMENTS_INVESTIGATOR with display name "Payments Investigator". Tools: a generic function tool PaymentLookup on BANKING_HOL.AGENTS.PAYMENT_LOOKUP (input payment_id string), a generic function tool SchemeRules on BANKING_HOL.AGENTS.SCHEME_RULES (input scheme string), and a Cortex Analyst tool Client360 on your semantic view BANKING_HOL.ANALYTICS.SV_CLIENT_360, all on warehouse BANKING_WH. Orchestration: for a specific payment ID call PaymentLookup; for a scheme's cutoff, limit, settlement cycle or SLA call SchemeRules; use Client360 for aggregate questions about clients, payments, alerts and feedback. Deploy it.
```
Expect: `PAYMENTS_INVESTIGATOR` deployed in `BANKING_HOL.AGENTS`
Check: ai1_agent

### Test it on a real payment
Where: Snowsight > **AI & ML > Agents > PAYMENTS_INVESTIGATOR** > Playground
Media: ai1_playground.mp4 | AI > Agent Studio > Payments Investigator > Preview, then paste the question
```prompt
Give me the ID of one failed CHAPS payment from BANKING_HOL.RAW_DATA.PAYMENTS.
```
Expect: a payment ID. Ask the agent "What happened to payment <ID>, can it be retried, and can I still send a CHAPS payment today?". It should call `PaymentLookup`, then `SchemeRules`, and report retryability and the 15:45 cutoff.

### Go further
Where: the Cortex Code sidebar
```prompt
Add a third tool to PAYMENTS_INVESTIGATOR that lists open alerts for a customer name, using a new UDF in BANKING_HOL.AGENTS. Redeploy the agent and test it.
```
Expect: the agent answers "What open alerts does <client> have?" with the new tool

## Check your work
Asking about a failed CHAPS payment calls `PaymentLookup` then `SchemeRules` and reports retryability and the 15:45 cutoff.

## In your bank
Deterministic tools for lookups keep answers exact and auditable; text-to-SQL is reserved for analytical questions.
