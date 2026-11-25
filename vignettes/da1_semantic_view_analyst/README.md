# DA1: One trusted answer on client health, for every RM and every agent

| | |
|---|---|
| **Persona** | Data Analyst |
| **Time** | ~90 min |
| **Prerequisites** | `setup/catchup/core_analytics.sql` |

## Business question
> An RM is about to call a corporate client whose payments are failing. The payments report, the RM's spreadsheet and the ops dashboard each give a different success rate. Give the bank one trusted answer that anyone, and any AI agent, can get in plain English.

## What you'll build
- `SV_CLIENT_360`: the bank's single definition of client payments health, alerts and sentiment
- The bank's rules and a checked answer, so a question RMs actually ask is answered the same way every time
- A quality score that proves the answers are right before RMs and agents rely on them

## Steps
### The problem this solves
Read this first: it's the story you'll tell the business.
- **Today:** "success rate", "value at risk" and "open incidents" are calculated differently in every report. An RM walks into a client call with one number; the client's ops team has another.
- **The cost:** wasted time reconciling numbers, awkward client conversations, and AI that guesses: ask a chatbot "which clients are unhappy?" and it writes its own SQL, with its own definitions.
- **The fix:** a semantic view. The bank writes each definition once, in business language, next to the data. People, BI tools, Cortex Analyst and every agent in this lab (OPS1, AI1, AI2, AI3) get the same answer from it.
By the end of this module an RM can ask "Which clients have negative sentiment and a success rate below 96%?" and get the bank's answer, checked, monitored and scored.
What you'll bring together around each client:
| For the RM | Comes from |
|---|---|
| Client, sector and relationship manager | `STG_CUSTOMERS` |
| Payment volume, success rate and value at risk | `V_CLIENT_PAYMENT_SUMMARY` (you build it next) |
| What the client is saying, and how they feel | `FEEDBACK_ENRICHED` |
| Open and critical incidents | `V_CLIENT_ALERTS` (you build it next) |
Expect: you can explain, in one sentence, why one definition beats three reports

### Give the data a stable shape
Where: the Cortex Code sidebar
```prompt
In BANKING_HOL.ANALYTICS create two views. V_CLIENT_PAYMENT_SUMMARY: one row per CUSTOMER_ID from STG_PAYMENTS joined to STG_ACCOUNTS (on ORIGINATOR_ACCOUNT_ID), with TOTAL_PAYMENTS, SUCCESSFUL_PAYMENTS, FAILED_PAYMENTS, TOTAL_VOLUME_GBP and FAILED_VOLUME_GBP. V_CLIENT_ALERTS: one row per ALERT_ID from BANKING_HOL.RAW_DATA.OPERATIONAL_ALERTS joined through STG_PAYMENTS and STG_ACCOUNTS to get CUSTOMER_ID, with SEVERITY, ALERT_STATUS, ALERT_TIME and RESOLUTION_TIME_MIN. Show 5 rows from each.
```
Expect: two views, with one row per client in the payment summary
These views are a contract: if the source systems change, you fix one view, and every RM question keeps working.

### Write the bank's definitions once
Where: banking-hol-pack Workspace > **+ Add new > Semantic view**
Media: da1_create_sv.mp4 | + Add new > Semantic view > name it sv_client_360, then paste the brief into the Cortex Code panel
1. Click **+ Add new > Semantic view** and name the file `sv_client_360`.
2. Cortex Code opens beside it with its own starter, "Help me create a semantic view", and a **Questions** card asking which source tables to use. Click **Cancel** on the card.
3. Paste the brief below into the same Cortex Code chat. It names every table and key, so there's nothing left to ask.
4. Press **Allow** on each **Run this command?** card.
**Important:** if Cortex Code still asks about sources, don't pick the RAW_DATA tables or the staging list it suggests. Choose **Other...** and reply "Use exactly the four tables in my brief".
```prompt
Create a semantic view BANKING_HOL.ANALYTICS.SV_CLIENT_360 with four logical tables: clients (STG_CUSTOMERS, key CUSTOMER_ID), payments (V_CLIENT_PAYMENT_SUMMARY, key CUSTOMER_ID), feedback (FEEDBACK_ENRICHED, key FEEDBACK_ID) and alerts (V_CLIENT_ALERTS, key ALERT_ID), with payments, feedback and alerts each related to clients on CUSTOMER_ID. Add dimensions including clients.customer_name, clients.sector, clients.rm_name (synonyms "relationship manager", "RM") and feedback.sentiment_label, and metrics including payments.payment_volume (sum of total volume GBP), payments.success_rate_pct, feedback.avg_sentiment, alerts.open_alert_count (status not RESOLVED) and alerts.critical_alert_count. Add business comments and synonyms, then deploy it. Use exactly these four tables and names, and don't ask me which sources to use.
```
Expect: `SV_CLIENT_360` exists. Keep the logical names `clients`, `payments`, `rm_name` and `payment_volume`: the check queries them.
Check: da1_semantic_view
- **Success rate** is now defined once: successful over total payments for the client, not an average of averages.
- **Synonyms** mean "RM", "banker" and "relationship manager" all find the same person.

### Answer the RM's question without writing a join
```prompt
Query SV_CLIENT_360 with the SEMANTIC_VIEW function: payment volume, success rate and open alert count by RM name, ordered by open alerts. Then explain which joins the semantic view did for me, and list each metric with the calculation it uses from BANKING_HOL.INFORMATION_SCHEMA.SEMANTIC_METRICS.
```
Expect: one row per RM with volume, success rate and open alerts; an explanation that clients, payments and alerts were joined for you; then each metric with its calculation
Check: da1_semantic_query
- Analysts get the same numbers as the agents, without rewriting the joins.
- Every KPI's definition is documented and queryable, which model risk and audit teams will ask for.

### Open the definition where the business can refine it
Where: Snowsight > **AI > Analyst**, then the banking-hol-pack Workspace
Media: da1_analyst.mp4 | Home > AI > Analyst > BANKING_HOL > ANALYTICS > SV_CLIENT_360 > Open in banking-hol-pack
1. If you're on the CoCo side, switch the toggle at the top left to **Home**.
2. Open **AI > Analyst**.
3. In the database picker, choose **BANKING_HOL**, then the **ANALYTICS** schema.
4. Click **SV_CLIENT_360**.
5. In **Open semantic view in Workspaces**, open the **Destination Workspace** dropdown (it says **My Workspace**) and pick **banking-hol-pack**.
6. Click **Open**.
**Tip:** tick **Always open semantic views in this workspace** so you don't have to pick it again.
Expect: `SV_CLIENT_360.sv.yaml` open in the banking-hol-pack Workspace, under a `cortex_project` folder
This is **Semantic Studio**. You change a working copy here; RMs and agents only see a change once you **Deploy** it.

### See what the RM's question relies on
Where: Semantic Studio, `SV_CLIENT_360.sv.yaml`
Media: da1_studio_tour.mp4 | Visual > Diagram > YAML, then the Suggestions, Playground, Monitoring and Evaluations tabs
1. On **Visual**, expand **Metrics** under PAYMENTS: these are the bank's KPIs.
2. Click **Diagram**: the client sits in the middle, with payments, feedback and alerts around it.
3. Click **YAML**: the same definition as text, ready for change control in Git.
4. Go back to **Visual** and note the four tabs on the right. You'll use each one next.
| Tab | What it gives the bank |
|---|---|
| **Playground** | try an RM's question before anyone relies on it |
| **Monitoring** | every question RMs and agents ask, and the SQL behind each answer |
| **Suggestions** | KPIs and questions people need that the definition doesn't cover yet |
| **Evaluations** | a quality score, re-run before every change ships |
Expect: the Diagram shows CLIENTS in the middle, with ALERTS, FEEDBACK and PAYMENTS joined to it

### Ask the RM's question
Where: Semantic Studio > **Playground** tab (right-hand panel)
Media: da1_playground.mp4 | Playground > type the question > Run, then read the SQL
1. Open the **Playground** tab.
2. Type this question in **Enter prompt** and click **Run**: "Which clients have negative sentiment and a success rate below 96%?"
3. Read the SQL in the answer. Look at how it filters on sentiment.
Expect: an answer with its SQL. Check how it reads "negative sentiment": the data stores labels in upper case (`NEGATIVE`), so a filter on `'negative'` returns no clients, and "negative" could mean one bad comment or a negative average
An RM never sees that SQL. They'd just hear "no clients at risk" before a difficult call. The next two steps fix it the way a bank would: write the rule down, then sign off the answer.

### Write down the bank's rules
Where: Semantic Studio > **Visual** > **Custom instructions** > **SQL generation**
Media: da1_sql_instructions.mp4 | Custom instructions > SQL generation > edit > paste the rules > save (tick)
1. Under **Custom instructions**, hover **SQL generation** and click its edit (pencil) button.
2. Paste the rules below into the box.
3. Click the tick at the top right of the box to save the change to your file.
```prompt
Sentiment labels are stored in upper case: POSITIVE, NEUTRAL or NEGATIVE. "Negative sentiment" for a client means their average sentiment score is below 0. Client names are stored in upper case: match them with ILIKE. Round percentages to 1 decimal place.
```
Paste: the **SQL generation** box in Semantic Studio (not the Cortex Code sidebar)
4. Ask the Playground question again.
Expect: a list of at-risk clients, with SQL that uses the average sentiment (or `'NEGATIVE'` in upper case)
The bank's definition of an unhappy client now applies to every question and every agent, without retraining anyone.

### Sign off the answer
Where: Semantic Studio > **Playground** answer, then **Verified queries**
Media: da1_add_vq.mp4 | Verified queries > + > paste the question > Generate SQL > Run > save with the tick
1. Check the second answer's SQL and results. Only sign it off if it's right.
2. Under the answer, click **Add to verified query**, check the question and SQL, and save it.
- Or, as in the clip: in **Visual**, click **+** next to **Verified queries**, paste the question, click **Generate SQL**, **Run** it to check the result, then save with the tick.
Expect: the question listed under **Verified queries** with a green tick
A signed-off answer is reused whenever anyone asks something similar, so the RM, the ops dashboard and the agent all get the same list of clients.

### Make it live for RMs and agents
Where: Semantic Studio > top bar > **Deploy**
Media: da1_deploy.mp4 | Deploy > Deploy changes to... > default BANKING_HOL.ANALYTICS > Deploy
1. Click **Deploy** in the top bar.
2. In **Deploy changes to...**, tick the **default** target, `BANKING_HOL.ANALYTICS`. If it says **Up to date**, you haven't saved a change yet.
3. Click **Deploy**.
Expect: the deploy succeeds and **Errors (0)** shows at the bottom of the editor
Check: da1_deployed
From now on, every agent built on `SV_CLIENT_360` (OPS1, AI1) uses the bank's rules and the signed-off answer. In production you'd deploy through Git after review, like any other change.

### See what RMs are asking
Where: Semantic Studio > **Monitoring** tab
Media: da1_monitoring.mp4 | Monitoring > open a question > request ID, status, user feedback and SQL
1. Open the **Monitoring** tab.
2. Click one of your Playground questions.
3. Read the question, the SQL behind the answer and any user feedback.
Expect: each question asked, newest first, with the SQL behind it
- This is your early warning: the questions the business really asks, and the answers it got.
- A wrong answer has a **Request ID**: give it to Cortex Code with the right answer and it traces what went wrong.

### Find what the definition is missing
Where: Semantic Studio > **Suggestions** tab
1. Open the **Suggestions** tab.
2. Expand **Metrics** and read what it proposes.
3. Pick the one an RM would use before a client call, and leave the rest.
Expect: suggested KPIs, filters and questions based on the definition and how it's used
**Tip:** add synonyms yourself from the words your RMs really use. Auto-generated synonyms often make answers worse.

### Prove it's right before anyone relies on it
Where: Semantic Studio > **Evaluations** tab
Media: da1_evaluation.mp4 | Evaluations > Create evaluation run > name da1_baseline > metric version v3 > select the verified queries > Run evaluation
1. Open the **Evaluations** tab and click **Create evaluation run**.
2. Fill it in as below.
3. Click **Run evaluation**. It runs in the background for a few minutes.
| Setting | Value |
|---|---|
| **Name** | `da1_baseline` |
| Warehouse | leave as is (`BANKING_WH`) |
| **Metric version** | **v3** (change it from v1: v1 has been retired, so v1 runs fail) |
| **Select verified queries** | **Select all** |
Expect: `da1_baseline` listed under **Evaluations**. Open it when it finishes to see the accuracy score and, for each question, the signed-off SQL next to what Analyst wrote on its own
- The score is evidence for model risk and the business that AI answers are right, not just plausible.
- Re-run it before every change. If a question that used to pass now fails, you catch it before an RM or an agent does.

## Check your work
`SV_CLIENT_360` is live with the bank's sentiment rule and a signed-off answer, and "Which clients have negative sentiment and a success rate below 96%?" returns the list of at-risk clients.

## In your bank
RMs, ops, BI tools and every AI agent give the same answer on client health, because the bank wrote the definition once. Every question is monitored and every change is scored before it ships, which is what model risk and audit need to approve AI for client-facing work.
