# OPS1: Corporate Payments 360 agent

| | |
|---|---|
| **Persona** | Payments Ops analyst |
| **Time** | ~45 min |
| **Prerequisites** | DA1 (`SV_CLIENT_360`), or run `client_360.sql` if you skipped it |

## Business question
> Before I call a client, tell me everything: payments health, open incidents and what they have been complaining about.

## What you'll build
- Agent `SNOWFLAKE_INTELLIGENCE.AGENTS.CORPORATE_PAYMENTS_360` with an Analyst tool on your `SV_CLIENT_360` and charting

## Steps
### Create the agent with Cortex Code
Where: banking-hol-pack Workspace > **+ > Agent** > **Create with CoCo** (recommended)
Media: ops1_create_agent.mp4 | + Add new > Agent > name it corporate_payments_360 > Create with CoCo > paste the brief
1. Rename the new agent file to `corporate_payments_360` straight away. It opens as "Untitled".
2. Paste this brief into Cortex Code.
Cortex Code then guides you through the configuration.
```prompt
Create a Cortex Agent SNOWFLAKE_INTELLIGENCE.AGENTS.CORPORATE_PAYMENTS_360 with display name "Corporate Payments 360". It supports Payments Operations and Relationship Managers in a UK corporate bank. Tools: a Cortex Analyst tool Client360 on semantic view BANKING_HOL.ANALYTICS.SV_CLIENT_360 (client health, alerts, sentiment) on warehouse BANKING_WH, plus charting. Response instructions: lead with a one-line summary, format money in GBP with thousands separators and percentages to 1 dp, and when briefing on a client always cover payment volume and success rate, failed value, open and critical alerts, and feedback sentiment with the main topic. Sample questions: "Brief me on the client with the most failed payment value", "Which relationship managers have the most open critical alerts?", "Which clients have negative sentiment and a success rate below 96%?", "Show failed payment value by sector as a chart". Deploy it.
```
Expect: the agent deployed as `CORPORATE_PAYMENTS_360` in `SNOWFLAKE_INTELLIGENCE.AGENTS`
Check: ops1_agent

### Ask it in Snowflake CoWork
Where: Snowsight > **AI & ML > CoWork** (formerly Snowflake Intelligence) > **Corporate Payments 360**
Media: ops1_cowork.mp4 | Snowflake CoWork > pick Corporate Payments 360 > ask the first question
1. Run the four sample questions.
2. Start with "Brief me on the client with the most failed payment value".
Expect: a briefing naming the client, failed value, open and critical alerts, and the main feedback topic. The sector question returns a chart.

### See how it answered
1. Expand **Show details** on an answer.
It shows which tool the agent chose and the SQL that ran.
Expect: each answer used `Client360`, with the SQL it generated over `SV_CLIENT_360`

### Improve it
Where: the Cortex Code sidebar, with `corporate_payments_360` open
```prompt
Add a sample question to CORPORATE_PAYMENTS_360 for "Which of Priya Sharma's clients have open critical alerts?" and update its orchestration instructions so questions about a named RM always filter on RM name. Redeploy it.
```
Expect: the new sample question appears in CoWork

## Check your work
"Brief me on the client with the most failed payment value" returns a briefing naming the client, failed value, open/critical alerts and feedback topic.

## In your bank
Agents run with the caller's role, so RM-level entitlements (GOV1) apply automatically.
