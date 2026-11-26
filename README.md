# Banking HOL pack - Hands-on Labs

A modular pack of banking hands-on labs on Snowflake: corporate payments operations, retail banking, the branch network, customer voice and financial crime, and the regulation that ties them together. From Snowflake-managed Iceberg sources to governed AI agents, split into persona pathways so the same pack serves data engineers, analysts, data scientists, payments operations, AI and app builders and governance teams.

The corporate payments data model, dbt project, semantic view and dashboard started life in a 2-hour payments lab by Gemma McGinlay.

> All data is entirely synthetic. No real customer, transaction or bank data is used. Every name, address and account is invented.

## How it mirrors a bank's data platform

| A bank's enterprise platform | In this lab |
|---|---|
| Source data lands centrally in Iceberg | `BANKING_HOL.RAW_DATA`: 9 **Snowflake-managed Iceberg** tables (no external volume needed) |
| End users cannot load data | Attendees (`HOL_PARTICIPANT`) have read-only access to `RAW_DATA` and build in `ANALYTICS` / `AGENTS` |
| Semantic views, agents, MCP and CoWork for business users | Covered by DA2, OPS1, OPS3, AI1, AI2 |
| Search over documents and conversations | AI3 uses a Marketplace Cortex Knowledge Extension; AI5 builds Cortex Search over call transcripts and case notes |
| Strict governance | GOV1 tags, masking and row access; GOV2 lineage and audit |

## Structure

```
setup/          facilitator: provisioning, synthetic data, Iceberg publish, catch-up scripts
core/           shared core for all attendees (C0 data estate tour, C1 Iceberg data product)
vignettes/      27 self-contained modules, each with README.md + .sql
pathways/       persona agendas, half-day template, shorter formats
dbt/            dbt project (runs as a dbt Project on Snowflake)
payments-dashboard/  Streamlit dashboard
guide/          static HTML lab guide (offline fallback for the Lab Companion)
lab-companion/  Lab Companion: React app on Snowflake App Runtime with Check my work
getting-started/  DataOps Live attendee landing page (step1.md)
dataops-integration/  DataOps configure step and wake-schedule reschedule
teardown/       remove everything
docs/           data model, ERD and column dictionary
```

## Vignettes

| Code | Vignette | Persona | Min |
|---|---|---|---|
| [DE1](vignettes/de1_iceberg_dbt_pipeline/) | Iceberg + dbt pipeline with Cortex Code | Data Engineer | 60 |
| [DE2](vignettes/de2_dynamic_tables_quality/) | Dynamic Tables + data quality (DMFs) | Data Engineer | 45 |
| [DE3](vignettes/de3_realtime_payments/) | Real-time payments: Snowflake Postgres streamed to Iceberg with Data Mirroring, interactive warehouse, incident detection | Data Engineer | 45 |
| [DE4](vignettes/de4_spark_on_snowflake/) | Spark on Snowflake: a PySpark bronze-silver-gold pipeline (CDC, quarantine, reconciliation) run interactively and as a scheduled batch job, monitored in Monitoring > Spark, with a failed-job alert | Data Engineer | 40 |
| [DE5](vignettes/de5_stages_registries/) | Stages and registries: catalogue evidence files, share a case folder, one inventory of stages and models | Data Engineer | 35 |
| [DA0](vignettes/da0_interactive_report/) | Interactive payments report with Cortex Code, refreshed by an automation | Data Analyst | 30 |
| [DA1](vignettes/da1_aisql_feedback/) | AI SQL on customer feedback (sentiment, AI_AGG themes per RM) | Data Analyst | 45 |
| [DA2](vignettes/da2_semantic_view_analyst/) | One trusted answer on client health (semantic view) | Data Analyst | 90 |
| [DA3](vignettes/da3_branch_network_geo/) | Retail branch network: spatial SQL, H3, closure impact, semantic view and agent | Data Analyst | 45 |
| [OPS1](vignettes/ops1_payments_360_agent/) | Corporate Payments 360 agent in Snowflake CoWork | Payments Ops | 45 |
| [OPS2](vignettes/ops2_alert_triage/) | Alert triage + negative sentiment feed | Payments Ops | 30 |
| [OPS3](vignettes/ops3_cowork_dashboards/) | Snowflake CoWork: charts, Deep Research, automations, documents and an AI dashboard | Payments Ops | 45 |
| [OPS4](vignettes/ops4_impact_tolerance/) | Operational resilience: impact tolerances and a Snowflake Alert that escalates breaches | Payments Ops | 35 |
| [DS0](vignettes/ds0_retail_data_tour/) | Retail data tour for data scientists: labels, features, leakage | Data Scientist | 20 |
| [DS1](vignettes/ds1_attrition_model/) | Attrition model with an experiment, ML Job and the Model Registry | Data Scientist | 45 |
| [DS2](vignettes/ds2_fraud_anomaly/) | Fraud anomaly detection (optional) | Data Scientist | 40 |
| [DS3](vignettes/ds3_model_risk/) | Model risk evidence pack: inventory, validation, challenger, model card, approval | Data Scientist | 40 |
| [AI1](vignettes/ai1_agent_tools/) | Agent with custom (UDF) tools | AI Builder | 45 |
| [AI2](vignettes/ai2_mcp_server/) | Snowflake-managed MCP server | AI Builder | 30 |
| [AI3](vignettes/ai3_knowledge_extension/) | Marketplace knowledge extension instead of Cortex Search | AI Builder | 30 |
| [AI4](vignettes/ai4_aisql_customer_voice/) | AI SQL on customer voice and financial crime evidence | AI Builder | 40 |
| [AI5](vignettes/ai5_cortex_search/) | Cortex Search over transcripts and case notes (optional) | AI Builder | 35 |
| [GOV1](vignettes/gov1_pii_policies/) | Classify, tag, mask and filter PII | Governance | 45 |
| [GOV2](vignettes/gov2_lineage_audit/) | Lineage, audit and trust | Governance | 30 |
| [GOV3](vignettes/gov3_ai_gateway/) | AI governance with Cortex AI Gateway (+ Business Ontology concept) | Governance | 40 |
| [GOV4](vignettes/gov4_data_request/) | UK GDPR: answer a customer's data request from tagged personal data | Governance | 40 |
| [GOV5](vignettes/gov5_protect_at_scale/) | Protect personal data at scale: one masking policy per data type on the tag, with a coverage report | Governance | 40 |
| [APP0](vignettes/app0_plan_an_app/) | Plan an app with Cortex Code and build its data | App Builder | 20 |
| [APP1](vignettes/app1_fraud_investigator_app/) | Build, deploy and share a fraud investigator Streamlit app from a workspace, no Git | App Builder | 45 |

### Themes
| Theme | Where it shows up |
|---|---|
| **Autonomous Data Engineering**: pipelines that build, monitor and repair themselves | DE1 Cortex Code-generated dbt marts and a nightly task; DE2 Pipeline Builder (public preview) deploying a native task graph, data metric functions; GOV2 a scheduled Cortex Code automation |
| **E2E Real-Time Analytics**: connectivity, transformation, serving | DE3 a live payment feed into Snowflake Postgres, mirrored continuously into Snowflake-managed Iceberg (Data Mirroring, preview), a 1 minute dynamic table, and an interactive warehouse (GA) serving the ops floor; concept notes on Snowpipe Streaming, Elastic Channels and streaming transformations |
| **Business users and AI apps** | OPS1 and OPS3 Snowflake CoWork: governed answers, saved charts, Deep Research, automations, generated documents, and AI dashboards built by Cortex Code (preview); APP0 and APP1 an app planned, built, deployed and shared with Cortex Code from a workspace |
| **Executive demo** | Lab Companion > Executive demo: a click-through retail and corporate tour on its own `BANKING_DEMO` database (maps, catchments, attrition model, fraud network, fuzzy matching, assistant), built by `LOAD_LAB_DATA('DEMO')` |
| **AI governance** | GOV3 one governed endpoint (Cortex AI Gateway, preview) with model policy, traces and per-user usage; Business Ontology (private preview) as the business-wide vocabulary |
| **Data governance** | GOV1 classification, tags, masking and row access; GOV2 lineage, access history and the audit pack |

See [pathways/](pathways/README.md) for the half-day agenda and which vignettes each persona runs.

## Install

The Iceberg sources, read-only access and Marketplace extension recreate a regulated bank's platform constraints inside the lab account. Every install ends with the **Lab Companion**, the live lab guide, and the shared **banking-hol-pack** Workspace of notebooks and module files.

| | Any account, including a free trial | Pre-provisioned events |
|---|---|---|
| Who | Anyone with ACCOUNTADMIN, for themselves or a small group | Hands-on lab team, accounts per attendee |
| How | Paste [`INSTALL.sql`](INSTALL.sql) into a Snowsight worksheet, **Run All** | `setup/provision_account.sh`, or DataOps (`dataops-integration/`) |
| Needs | A browser. No laptop, CLI or DataOps | Snowflake CLI, or a DataOps event |
| Wake schedule | `CALL BANKING_HOL.LAB.WAKE_LAB()` on the day | From the event times |

### Start here: install with Cortex Code

1. Clone this repository and open the folder in Cortex Code.
2. In the chat, ask: **"Install the hands-on lab on my account"**. This runs the `hol-one-account` skill (`.cortex/skills/hol-one-account/`).
3. The skill asks which Snowflake connection to use. If you don't have one, it walks you through creating a service user with a programmatic access token, then adding it with `snow connection add`.
4. It asks for a first name and email for a test attendee, explains what will be installed, and waits for your approval.
5. It builds the lab (about 25 minutes) and creates the test attendee with a one-time password you change at first sign-in. It ends with the Lab Companion URL.

No Cortex Code? Use the one-script install below.

### Any account (one script)

1. Sign in to Snowsight as a user with ACCOUNTADMIN.
2. Open a new SQL worksheet and paste the whole of [`INSTALL.sql`](INSTALL.sql).
3. Set the role to **ACCOUNTADMIN** and press **Run All**.
4. The last result is the Lab Companion URL. Open it: it shows **Setting up your lab** until the data finishes loading in the background, about 10 minutes later.

The script connects the account to this GitHub repository and installs everything from it: roles, warehouse and database, the lab data, the dbt project, the Lab Companion (built inside Snowflake), the banking-hol-pack Workspace and the executive demo. It gives your own user the attendee role, so you can do the labs yourself. For more people, grant `HOL_PARTICIPANT` to each of them (`setup/03_add_participants.sql`).

**Free trial accounts**
- **AI:** trials start with AI features switched off. Add a credit card (**Admin > Billing**) first: it doesn't end the trial. The script checks and stops with this message if AI isn't available.
- **External access:** trials can't create external access integrations, so three things are skipped and the Lab Companion says so: DE3 (Snowflake Postgres), GOV3 (AI Gateway from a notebook) and DA3's map app. Every other module works.
- **Cortex Search:** on by default. Where it isn't allowed, set `INCLUDE_SEARCH` to `FALSE` in the script before running it, and AI5 shows as optional.

### Pre-provisioned events: CLI or DataOps

From a clone of this GitHub repo, with a Snowflake CLI connection (ACCOUNTADMIN) to each account:

```bash
./setup/provision_account.sh <connection>                          # about 1 min of setup + 2-5 min app build; data loads in the background
./setup/provision_account.sh <connection> --wait-all               # also wait for the background setup to finish
./setup/provision_account.sh <connection> --with-reference-build   # also pre-builds analytics, semantic views and agents
```

The script does the minimum from outside the account, then everything else runs inside Snowflake:

1. Setup SQL (about a minute): `00_admin_provision.sql` (roles, DB, warehouse), `git_repo.sql` (the lab GitHub repo), `11_lab_data_loader.sql`, `04_lab_companion.sql`, `05_wake_schedule.sql`.
2. `CALL BANKING_HOL.LAB.DEPLOY_LAB_COMPANION()` (about 2 minutes, on a quiet warehouse): copies the app source from the Git repo, builds it inside Snowflake, deploys it and prints the URL. No Node.js or upload is needed.
3. `EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB`: a background task that runs `LOAD_LAB_DATA('PROVISION')`, which covers the lab data, Iceberg publish, audit and CoWork packs, dbt project object, executive demo and wake schedule (about 10-15 minutes). The script returns as soon as the task has started.

Attendees who open the Lab Companion before the background setup finishes see a **Setting up your lab** screen, which opens the lab when it's done. To follow it in Snowsight:

```sql
SELECT * FROM BANKING_HOL.LAB.SETUP_SUMMARY;  -- READY, RUNNING or FAILED, with the app URL
SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS;   -- one row per step, with errors
EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB;   -- restart after a failure (steps are safe to re-run)
```

Accounts are provisioned days ahead, so set the event times to wake the Lab Companion 30 minutes before the start and let it auto-suspend again afterwards:

```bash
LAB_START='2026-12-01 09:30:00 +00:00' LAB_END='2026-12-01 13:30:00 +00:00' ./setup/provision_account.sh <connection>
```

Without them, no tasks are created; run `CALL BANKING_HOL.LAB.WAKE_LAB();` on the day. With DataOps, use [`dataops-integration/`](dataops-integration/README.md), which maps `EVENT_START_DATETIME` / `EVENT_END_DATETIME`.

Then grant `HOL_PARTICIPANT` to the attendee users (`setup/03_add_participants.sql`).

`00` accepts the Marketplace terms for the free **Snowflake Documentation** knowledge extension (listing `GZSTZ67BY9OQ4`) and installs it as `SNOWFLAKE_DOCS_CKE`. To use a finance publisher instead (for example Investopedia), request the listing in Snowsight, then update the service name in `ai3.sql` and `ai2.sql`.

For the **Payments Ops** pathway (low-code), also pre-run the catch-up scripts and DA2 so the agent has data to use. See [pathways/](pathways/README.md#catch-up-order-any-vignette-any-time).

Teardown: `(cd lab-companion && snow app teardown --force -c <connection> --role HOL_ADMIN)`, then `snow sql -c <connection> -f teardown/teardown.sql`

## Lab Companion app

Every account gets the **Lab Companion**, a React app on Snowflake App Runtime ([`lab-companion/`](lab-companion/README.md)):

- **Pathways:** the attendee picks a persona and the app orders the modules for them.
- **Instructions:** each module's steps and SQL, generated from this repo.
- **Check my work:** a button per module that validates the objects the attendee actually built.
- **Progress:** stored in `BANKING_HOL.LAB.LAB_PROGRESS`.
- **Facilitator view:** `/facilitator` shows who is stuck.

The provisioning script prints the app URL at the end.

## Attendee start

1. Log in and switch to role `HOL_PARTICIPANT`.
2. Open the **Lab Companion** app (URL from the facilitator) and choose your pathway.
3. Open the lab Workspace **banking-hol-pack** (**Projects > Workspaces**, then the **My Workspace** dropdown > **banking-hol-pack**) and the **Cortex Code** sidebar. Each Lab Companion step gives a prompt to paste; the module SQL is a fallback. `INSTALL.sql` and DataOps both create it.
4. Start with C0 (a tour of all the data) and C1 (data scientists start with DS0 instead), then press **Check my work** at the end of each module.

Every attendee script starts with `USE SECONDARY ROLES NONE` so facilitators testing with admin rights see exactly what attendees see.

## Tested

Each module's **Check my work** checks run against a full build. The install is tested from a fresh account with `INSTALL.sql`.

## Credits

Original payments lab, data model and dbt project: Gemma McGinlay. Banking HOL pack: Becky O'Connor.
