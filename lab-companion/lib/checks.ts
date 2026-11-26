// "Check my work" definitions. Each check is ONE SQL statement returning a single
// row with OK (boolean) and DETAIL (string). Checks run with the app's own
// rights (HOL_ADMIN, which inherits HOL_PARTICIPANT), so they can see every
// object an attendee builds. Keep them read-only and fast.
//
// Tested against a reference build (all pass except
// de1_coco_marts, which only exists once an attendee has built it with CoCo).

export type Check = {
  id: string
  label: string
  sql: string
  hint: string
  /** Run with the attendee's own rights, for objects in their personal USER$ database. */
  asCaller?: boolean
  /**
   * The SQL has one ? for the attendee's user name. For query-history checks: run as the app, because a
   * caller's-rights session only sees the app's own queries, not what the attendee ran in Cortex Code.
   */
  byUser?: boolean
}

const exists = (schema: string, name: string, extra = "") =>
  `SELECT COUNT(*) > 0 AS OK, COALESCE(MAX(TABLE_TYPE || IFF(IS_DYNAMIC = 'YES', ' (dynamic)', '') || IFF(IS_ICEBERG = 'YES', ' (iceberg)', '')), 'not found') AS DETAIL
   FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${name}' ${extra}`

const rows = (fqn: string, min = 1) =>
  `SELECT COUNT(*) >= ${min} AS OK, COUNT(*) || ' rows' AS DETAIL FROM ${fqn}`

const show = (showSql: string, what: string) =>
  `${showSql} ->> SELECT COUNT(*) > 0 AS OK, IFF(COUNT(*) > 0, '${what} found', '${what} not found') AS DETAIL FROM $1`

export const CHECKS: Record<string, Check[]> = {
  C0: [
    {
      id: "c0_retail_toured",
      label: "You queried the retail products and employment tables",
      sql: `SELECT COUNT_IF(QUERY_TEXT ILIKE '%RB_PRODUCTS%') > 0 AND COUNT_IF(QUERY_TEXT ILIKE '%RB_EMPLOYMENT%') > 0 AS OK,
                   COUNT_IF(QUERY_TEXT ILIKE '%RB_%') || ' of your recent queries touched the retail tables' AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.QUERY_HISTORY_BY_USER(USER_NAME => ?, RESULT_LIMIT => 1000))
            WHERE EXECUTION_STATUS = 'SUCCESS' AND START_TIME > DATEADD('day', -2, CURRENT_TIMESTAMP())`,
      hint: "Run the Meet a retail customer prompt and Allow the queries, so Cortex Code joins RB_ACCOUNTS to RB_PRODUCTS and RB_EMPLOYMENT.",
      byUser: true,
    },
    {
      id: "c0_estate_published",
      // 9 corporate plus the 7 core retail tables; the retail text tables (AI4, AI5) add more, so count at least
      label: "All source tables are published as Iceberg (9 corporate, 7 or more retail)",
      sql: `SELECT COUNT_IF(IS_ICEBERG = 'YES' AND LEFT(TABLE_NAME, 3) <> 'RB_') = 9 AND COUNT_IF(IS_ICEBERG = 'YES' AND LEFT(TABLE_NAME, 3) = 'RB_') >= 7 AS OK,
                   COUNT_IF(IS_ICEBERG = 'YES' AND LEFT(TABLE_NAME, 3) <> 'RB_') || ' corporate and ' || COUNT_IF(IS_ICEBERG = 'YES' AND LEFT(TABLE_NAME, 3) = 'RB_') || ' retail Iceberg tables' AS DETAIL
            FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'RAW_DATA'`,
      hint: "Ask the facilitator: setup/02_publish_iceberg.sql or setup/08_retail_bank_seed.sql has not been run in this account.",
    },
  ],
  DS0: [
    {
      id: "ds0_labels_toured",
      label: "You profiled the monthly snapshot and the transaction ledger",
      sql: `SELECT COUNT_IF(QUERY_TEXT ILIKE '%RB_MONTHLY_SNAPSHOT%') > 0 AND COUNT_IF(QUERY_TEXT ILIKE '%RB_TRANSACTIONS%') > 0 AS OK,
                   COUNT_IF(QUERY_TEXT ILIKE '%RB_%') || ' of your recent queries touched the retail tables' AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.QUERY_HISTORY_BY_USER(USER_NAME => ?, RESULT_LIMIT => 1000))
            WHERE EXECUTION_STATUS = 'SUCCESS' AND START_TIME > DATEADD('day', -2, CURRENT_TIMESTAMP())`,
      hint: "Run the Meet the features and See what fraud looks like prompts, and Allow the queries.",
      byUser: true,
    },
  ],
  DS1: [
    {
      id: "ds1_features",
      label: "Point-in-time feature view RB_CHURN_FEATURES exists",
      sql: exists("ML", "RB_CHURN_FEATURES"),
      hint: "Run the features cell under heading 1 of ds1_attrition_model (or ds1.sql).",
    },
    {
      id: "ds1_experiment",
      label: "Experiment RB_ATTRITION has at least two runs",
      sql: `SHOW RUNS IN EXPERIMENT BANKING_HOL.ML.RB_ATTRITION ->> SELECT COUNT(*) >= 2 AS OK, COUNT(*) || ' runs in RB_ATTRITION' AS DETAIL FROM $1`,
      hint: "Run train_and_track under heading 2. The experiment must be named RB_ATTRITION in BANKING_HOL.ML.",
    },
    {
      id: "ds1_model_registered",
      label: "RB_ATTRITION_MODEL is in the Model Registry",
      sql: `SHOW MODELS LIKE 'RB_ATTRITION_MODEL' IN SCHEMA BANKING_HOL.ML ->> SELECT COUNT(*) > 0 AS OK, COALESCE('default version ' || MAX("default_version_name"), 'not registered') AS DETAIL FROM $1`,
      hint: "Run the register cell under heading 3.",
    },
    {
      id: "ds1_scored",
      label: "Every customer is scored in RB_ATTRITION_SCORES",
      sql: rows("BANKING_HOL.ML.RB_ATTRITION_SCORES", 10000),
      hint: "Run the score cell under heading 4.",
    },
  ],
  DS4: [
    {
      id: "ds4_calibrated",
      label: "RB_ATTRITION_MODEL has a calibrated challenger version",
      sql: `SHOW VERSIONS IN MODEL BANKING_HOL.ML.RB_ATTRITION_MODEL ->> SELECT COUNT_IF("comment" ILIKE '%calibrat%') > 0 AS OK, COUNT(*) || ' versions, ' || COUNT_IF("comment" ILIKE '%calibrat%') || ' calibrated' AS DETAIL FROM $1`,
      hint: "Run calibrate under heading 2. The calibrated version's comment should say it is calibrated.",
    },
    {
      id: "ds4_margin_model",
      label: "RB_MARGIN_MODEL is in the Model Registry",
      sql: `SHOW MODELS LIKE 'RB_MARGIN_MODEL' IN SCHEMA BANKING_HOL.ML ->> SELECT COUNT(*) > 0 AS OK, COALESCE('default version ' || MAX("default_version_name"), 'not registered') AS DETAIL FROM $1`,
      hint: "Run margin under heading 3.",
    },
    {
      id: "ds4_predictions",
      label: "Every customer has predictions in RB_CUSTOMER_PREDICTIONS",
      sql: rows("BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS", 10000),
      hint: "Run predictions under heading 4 (or setup/catchup/ds4_predictions.sql).",
    },
  ],
  DA5: [
    {
      id: "da5_value",
      label: "Lifetime value for every customer in ANALYTICS.CUSTOMER_VALUE",
      sql: rows("BANKING_HOL.ANALYTICS.CUSTOMER_VALUE", 10000),
      hint: "Run the Lifetime value and value at risk step.",
    },
    {
      id: "da5_segments",
      label: "Segments and offers in ANALYTICS.CUSTOMER_VALUE_SEGMENTS",
      sql: `SELECT COUNT(DISTINCT SEGMENT) = 4 AS OK, COUNT(DISTINCT SEGMENT) || ' segments, ' || COUNT(*) || ' customers' AS DETAIL FROM BANKING_HOL.ANALYTICS.CUSTOMER_VALUE_SEGMENTS`,
      hint: "Run the Segments and next-best offers step.",
    },
  ],
  DA6: [
    {
      id: "da6_semantic_view",
      label: "Semantic view ANALYTICS.SV_CUSTOMER_VALUE exists",
      sql: `SHOW SEMANTIC VIEWS LIKE 'SV_CUSTOMER_VALUE' IN SCHEMA BANKING_HOL.ANALYTICS ->> SELECT COUNT(*) = 1 AS OK, IFF(COUNT(*) = 1, 'SV_CUSTOMER_VALUE found', 'not found') AS DETAIL FROM $1`,
      hint: "Run the Create the semantic view step.",
    },
    {
      id: "da6_agent",
      label: "Agent ANALYTICS.CUSTOMER_VALUE_ADVISOR exists",
      sql: `SHOW AGENTS LIKE 'CUSTOMER_VALUE_ADVISOR' IN SCHEMA BANKING_HOL.ANALYTICS ->> SELECT COUNT(*) = 1 AS OK, IFF(COUNT(*) = 1, 'CUSTOMER_VALUE_ADVISOR found', 'not found') AS DETAIL FROM $1`,
      hint: "Run the Ask an agent the same questions step.",
    },
  ],
  DS2: [
    {
      id: "ds2_experiment",
      label: "Experiment RB_FRAUD has at least two runs",
      sql: `SHOW RUNS IN EXPERIMENT BANKING_HOL.ML.RB_FRAUD ->> SELECT COUNT(*) >= 2 AS OK, COUNT(*) || ' runs in RB_FRAUD' AS DETAIL FROM $1`,
      hint: "Run train_and_track under heading 2 of ds2_fraud_anomaly.",
    },
    {
      id: "ds2_model_registered",
      label: "RB_FRAUD_ANOMALY is registered and its alerts are written",
      sql: `SELECT COUNT(*) >= 1000 AS OK, COUNT(*) || ' alerts in RB_FRAUD_ALERTS' AS DETAIL FROM BANKING_HOL.ML.RB_FRAUD_ALERTS`,
      hint: "Run register_and_score under heading 3.",
    },
  ],
  AI4: [
    {
      id: "ai4_call_insights",
      label: "RB_CALL_INSIGHTS has enriched call transcripts",
      sql: rows("BANKING_HOL.ANALYTICS.RB_CALL_INSIGHTS", 50),
      hint: "Run the Enrich call transcripts prompt, so Cortex Code creates BANKING_HOL.ANALYTICS.RB_CALL_INSIGHTS.",
    },
    {
      id: "ai4_evidence_read",
      label: "You read the evidence files with AI SQL",
      sql: `SELECT COUNT_IF(QUERY_TEXT ILIKE '%FINCRIME_EVIDENCE%' AND QUERY_TEXT ILIKE '%TO_FILE%') > 0 AS OK,
                   COUNT_IF(QUERY_TEXT ILIKE '%FINCRIME_EVIDENCE%') || ' of your recent queries read the evidence stage' AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.QUERY_HISTORY_BY_USER(USER_NAME => ?, RESULT_LIMIT => 1000))
            WHERE EXECUTION_STATUS = 'SUCCESS' AND START_TIME > DATEADD('day', -2, CURRENT_TIMESTAMP())`,
      hint: "Run the Read the fraud evidence prompt and Allow the AI_EXTRACT and AI_COMPLETE queries on @RETAIL.FINCRIME_EVIDENCE.",
      byUser: true,
    },
  ],
  APP0: [
    {
      id: "app0_queue",
      label: "FRAUD_REVIEW_QUEUE has a suggested decision for every outside name",
      sql: `SELECT COUNT(*) >= 300 AND COUNT_IF(SUGGESTED IS NULL) = 0 AS OK, COUNT(*) || ' mentions, ' || COUNT_IF(SUGGESTED = 'REVIEW') || ' to review' AS DETAIL
            FROM BANKING_HOL.APPS.FRAUD_REVIEW_QUEUE`,
      hint: "Run the Build the review queue prompt, so Cortex Code saves BANKING_HOL.APPS.FRAUD_REVIEW_QUEUE with a SUGGESTED column.",
    },
  ],
  APP1: [
    {
      id: "app1_streamlit",
      label: "The FRAUD_INVESTIGATOR app is deployed in APPS",
      sql: show("SHOW STREAMLITS LIKE 'FRAUD_INVESTIGATOR' IN SCHEMA BANKING_HOL.APPS", "FRAUD_INVESTIGATOR"),
      hint: "In the workspace, open Settings > Targets, set App ID FRAUD_INVESTIGATOR and App location BANKING_HOL / APPS, then Deploy.",
    },
    {
      id: "app1_decisions",
      label: "The app has saved at least one investigator decision",
      sql: `SELECT COUNT(*) >= 1 AS OK, COUNT(*) || ' decisions' AS DETAIL FROM BANKING_HOL.APPS.MATCH_DECISIONS`,
      hint: "Open the deployed app, select a REVIEW row and press Confirm match, Not our customer or Escalate.",
    },
  ],
  AI5: [
    {
      id: "ai5_search_service",
      label: "A Cortex Search service exists in SEARCH_LAB",
      sql: show("SHOW CORTEX SEARCH SERVICES IN SCHEMA BANKING_HOL.SEARCH_LAB", "Search service"),
      hint: "Run the Create a search service prompt. If SEARCH_LAB doesn't exist, Cortex Search isn't enabled in this account, so AI5 can't run here.",
    },
    {
      id: "ai5_name_matches",
      label: "RB_NAME_MATCHES has a match decision for every outside name",
      sql: rows("BANKING_HOL.SEARCH_LAB.RB_NAME_MATCHES", 300),
      hint: "Run the Match names from outside records prompt, so Cortex Code saves BANKING_HOL.SEARCH_LAB.RB_NAME_MATCHES.",
    },
  ],
  C1: [
    {
      id: "c1_iceberg_published",
      label: "Nine source tables are published as Iceberg",
      sql: `SELECT COUNT_IF(IS_ICEBERG = 'YES') = 9 AS OK, COUNT_IF(IS_ICEBERG = 'YES') || ' of 9 Iceberg tables' AS DETAIL
            FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'RAW_DATA' AND LEFT(TABLE_NAME, 3) <> 'RB_'`,
      hint: "Ask the facilitator - setup/02_publish_iceberg.sql has not been run in this account.",
    },
    {
      id: "c1_payments_rows",
      label: "PAYMENTS has 50,000 synthetic transactions",
      sql: `SELECT COUNT(*) = 50000 AS OK, COUNT(*) || ' rows' AS DETAIL FROM BANKING_HOL.RAW_DATA.PAYMENTS`,
      hint: "Ask the facilitator to re-run setup/01 and setup/02.",
    },
  ],
  DE1: [
    {
      id: "de1_staging",
      label: "dbt staging views built (STG_PAYMENTS)",
      sql: exists("ANALYTICS", "STG_PAYMENTS"),
      hint: "In the dbt tab of the bottom panel, click the arrow next to the blue button > Build > Execute.",
    },
    {
      id: "de1_kpi_mart",
      label: "MART_PAYMENT_KPIS has data",
      sql: rows("BANKING_HOL.ANALYTICS.MART_PAYMENT_KPIS", 1000),
      hint: "Re-run dbt build and check for errors in the output.",
    },
    {
      id: "de1_coco_marts",
      label: "MART_RM_PERFORMANCE built and tested",
      sql: exists("ANALYTICS", "MART_RM_PERFORMANCE"),
      hint: "The table only exists after a build. In the dbt pane click the arrow next to Run > Build > Execute.",
    },
    {
      id: "de1_task",
      label: "Nightly dbt build task scheduled (suspended)",
      sql: `SHOW TASKS LIKE 'TSK_DBT_NIGHTLY_BUILD' IN SCHEMA BANKING_HOL.ANALYTICS ->> SELECT COUNT(*) > 0 AS OK, COALESCE(MAX("state") || ', ' || MAX("schedule"), 'TSK_DBT_NIGHTLY_BUILD not found') AS DETAIL FROM $1`,
      hint: "Paste the schedule prompt into Cortex Code. The task must be TSK_DBT_NIGHTLY_BUILD in BANKING_HOL.ANALYTICS.",
    },
    {
      id: "de1_iceberg_product",
      label: "DP_SLA_COMPLIANCE published back to the lake as Iceberg",
      sql: exists("ANALYTICS", "DP_SLA_COMPLIANCE", "AND IS_ICEBERG = 'YES'"),
      hint: "Paste the Iceberg data product prompt into Cortex Code.",
    },
  ],
  DE2: [
    {
      id: "de2_dynamic_tables",
      label: "Three dynamic tables created",
      sql: `SELECT COUNT(*) >= 3 AS OK, LISTAGG(TABLE_NAME, ', ') AS DETAIL
            FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'ANALYTICS' AND IS_DYNAMIC = 'YES'
              AND TABLE_NAME IN ('DT_LIVE_SLA_BREACHES', 'DT_FAILED_PAYMENT_TRIAGE', 'DT_RETRYABLE_SUMMARY')`,
      hint: "Paste the dynamic table prompts into Cortex Code, using these exact names. Prereq: setup/catchup/core_analytics.sql.",
    },
    {
      id: "de2_dt_refreshed",
      label: "DT_RETRYABLE_SUMMARY has refreshed with data",
      sql: rows("BANKING_HOL.ANALYTICS.DT_RETRYABLE_SUMMARY"),
      hint: "Wait a minute for the first refresh, or ask Cortex Code to refresh DT_RETRYABLE_SUMMARY.",
    },
    {
      id: "de2_dmfs",
      label: "Data metric functions attached to MART_CUSTOMER_PAYMENTS",
      sql: `SELECT COUNT(*) >= 3 AS OK, COUNT(*) || ' DMFs attached' AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.DATA_METRIC_FUNCTION_REFERENCES(
              REF_ENTITY_NAME => 'BANKING_HOL.ANALYTICS.MART_CUSTOMER_PAYMENTS', REF_ENTITY_DOMAIN => 'TABLE'))`,
      hint: "Paste the data quality prompt into Cortex Code. MART_CUSTOMER_PAYMENTS must exist (DE1 or the catch-up).",
    },
    {
      id: "de2_pipeline",
      label: "Pipeline Builder project created in ANALYTICS",
      sql: `SHOW DCM PROJECTS IN SCHEMA BANKING_HOL.ANALYTICS ->> SELECT COUNT(*) > 0 AS OK, COALESCE(NULLIF(LISTAGG("name", ', '), ''), 'no Pipeline Builder project in ANALYTICS') AS DETAIL FROM $1`,
      hint: "+ > Pipeline Builder, schema BANKING_HOL.ANALYTICS (not RAW_DATA), then Deploy.",
    },
  ],
  DA2: [
    {
      id: "da2_semantic_view",
      label: "Semantic view SV_CLIENT_360 created",
      sql: show("SHOW SEMANTIC VIEWS LIKE 'SV_CLIENT_360' IN SCHEMA BANKING_HOL.ANALYTICS", "SV_CLIENT_360"),
      hint: "Create SV_CLIENT_360 with the semantic view prompt. Prereq: setup/catchup/core_analytics.sql.",
    },
    {
      id: "da2_semantic_query",
      label: "SV_CLIENT_360 answers a metrics query",
      sql: `SELECT COUNT(*) >= 5 AS OK, COUNT(*) || ' RMs returned' AS DETAIL FROM SEMANTIC_VIEW(
              BANKING_HOL.ANALYTICS.SV_CLIENT_360 DIMENSIONS clients.rm_name METRICS payments.payment_volume)`,
      hint: "Keep the logical names from the prompt: tables clients and payments, dimension rm_name, metric payment_volume.",
    },
    {
      id: "da2_deployed",
      label: "SV_CLIENT_360 deployed with a SQL generation instruction and a verified query",
      sql: `SELECT d ILIKE '%ai_sql_generation%' AND d ILIKE '%ai_verified_queries%' AS OK,
                   IFF(d ILIKE '%ai_sql_generation%', 'instruction set', 'no SQL generation instruction') || ', ' ||
                   IFF(d ILIKE '%ai_verified_queries%', 'verified queries found', 'no verified queries') AS DETAIL
            FROM (SELECT GET_DDL('SEMANTIC_VIEW', 'BANKING_HOL.ANALYTICS.SV_CLIENT_360') AS d)`,
      hint: "In Semantic Studio: add the SQL generation rules under Custom instructions, save a checked Playground answer as a verified query, then press Deploy. Changes in the .sv.yaml file only reach the live view when you deploy.",
    },
  ],
  DA1: [
    {
      id: "da1_enriched",
      label: "FEEDBACK_ENRICHED scored with sentiment and topic",
      sql: `SELECT COUNT(*) >= 1000 AND COUNT_IF(TOPIC_CATEGORY IS NULL) = 0 AS OK,
                   COUNT(*) || ' rows, ' || COUNT(DISTINCT TOPIC_CATEGORY) || ' topics' AS DETAIL
            FROM BANKING_HOL.ANALYTICS.FEEDBACK_ENRICHED`,
      hint: "Paste the enrichment prompt into Cortex Code.",
    },
    {
      id: "da1_rm_themes",
      label: "AI_AGG complaint themes generated per RM",
      sql: `SELECT COUNT(*) >= 5 AND COUNT_IF(LENGTH(TOP_THEMES) > 50) = COUNT(*) AS OK, COUNT(*) || ' RMs with themes' AS DETAIL
            FROM BANKING_HOL.ANALYTICS.RM_FEEDBACK_THEMES`,
      hint: "Paste the AI_AGG themes prompt into Cortex Code.",
    },
  ],
  DA0: [
    {
      id: "da0_report",
      // the report itself is a Cortex Code artifact with no SQL view, so check the queries behind it
      label: "Cortex Code queried payments and client feedback to build your report",
      sql: `SELECT COUNT_IF(QUERY_TEXT ILIKE '%PAYMENTS%' AND QUERY_TEXT ILIKE '%CUSTOMERS%') > 0 AND COUNT_IF(QUERY_TEXT ILIKE '%CUSTOMER_FEEDBACK%') > 0 AS OK,
                   COUNT_IF(QUERY_TEXT ILIKE '%BANKING_HOL.RAW_DATA%') || ' of your recent queries read the corporate payments data' AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.QUERY_HISTORY_BY_USER(USER_NAME => ?, RESULT_LIMIT => 1000))
            WHERE EXECUTION_STATUS = 'SUCCESS' AND START_TIME > DATEADD('day', -2, CURRENT_TIMESTAMP())`,
      hint: "Paste the report prompt into the CoCo tab and press Allow on each Run this command? card, so Cortex Code can query the payments, customers and feedback tables.",
      byUser: true,
    },
    {
      id: "da0_automation",
      label: "Daily Cortex Code automation rebuilds the report",
      sql: `SHOW AGENT TASKS LIKE 'COCO_ROUTINE_%' IN ACCOUNT ->> SELECT COUNT(*) > 0 AS OK, COALESCE(NULLIF(LISTAGG("name" || ' (' || "state" || ')', ', '), ''), 'no Cortex Code automation yet') AS DETAIL FROM $1 WHERE "database_name" = 'USER$' || CURRENT_USER() AND "schema_name" = 'PUBLIC'`,
      hint: "Paste the PAYMENTS_REPORT_REFRESH prompt into the same CoCo session and say yes when it offers to create the automation.",
      asCaller: true,
    },
  ],
  DA4: [
    {
      id: "da4_lookup",
      label: "MY_CLOSURE_LOOKUP has the nearest and next-nearest branch for every neighbourhood",
      sql: `SELECT COUNT(*) >= 12000 AND COUNT(NEXT_MIN) >= COUNT(*) * 0.95 AS OK,
                   COUNT(*) || ' neighbourhoods, median ' || ROUND(MEDIAN(NEAREST_MIN), 1) || ' min to the nearest branch, ' || ROUND(MEDIAN(NEXT_MIN - NEAREST_MIN), 1) || ' min extra if it closed' AS DETAIL
            FROM BANKING_HOL.ANALYTICS.MY_CLOSURE_LOOKUP`,
      hint: "Run the CREATE TABLE MY_CLOSURE_LOOKUP statement in Build the closure lookup, with USE SCHEMA BANKING_HOL.ANALYTICS from the first step.",
    },
    {
      id: "da4_cut_off",
      label: "You counted the customers a branch closure would cut off",
      sql: `SELECT COUNT_IF(QUERY_TEXT ILIKE '%MY_CLOSURE_LOOKUP%' AND QUERY_TEXT ILIKE '%RB_CUSTOMERS%') > 0 AS OK,
                   IFF(COUNT_IF(QUERY_TEXT ILIKE '%MY_CLOSURE_LOOKUP%' AND QUERY_TEXT ILIKE '%RB_CUSTOMERS%') > 0, 'customers placed on the closure lookup', 'not run yet') AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.QUERY_HISTORY_BY_USER(USER_NAME => ?, RESULT_LIMIT => 1000))
            WHERE EXECUTION_STATUS = 'SUCCESS' AND START_TIME > DATEADD('day', -2, CURRENT_TIMESTAMP())`,
      hint: "Run the query in Which closures cut customers off: it joins MY_CLOSURE_LOOKUP to RB_CUSTOMERS.",
      byUser: true,
    },
  ],
  DA3: [
    {
      id: "da3_catchment",
      label: "Every retail customer has a fastest and second-fastest branch by drive time",
      sql: `SELECT COUNT(*) >= 19000 AND COUNT(SECOND_BRANCH_ID) >= COUNT(*) * 0.95 AS OK,
                   COUNT(*) || ' customers, median ' || ROUND(MEDIAN(NEAREST_DRIVE_MIN), 1) || ' min drive to fastest branch' AS DETAIL
            FROM BANKING_HOL.ANALYTICS.CUSTOMER_NEAREST_BRANCH`,
      hint: "Paste the fastest-branch prompt into Cortex Code (it must include the second-fastest branch and NEAREST_DRIVE_MIN).",
    },
    {
      id: "da3_closure_impact",
      label: "BRANCH_CLOSURE_IMPACT models every branch",
      sql: `SELECT COUNT(*) >= 50 AND COUNT_IF(DISRUPTION_RISK = 'HIGH') > 0 AS OK,
                   COUNT(*) || ' branches, ' || COUNT_IF(DISRUPTION_RISK = 'LOW') || ' LOW risk' AS DETAIL
            FROM BANKING_HOL.ANALYTICS.BRANCH_CLOSURE_IMPACT`,
      hint: "Paste the closure-impact prompt into Cortex Code.",
    },
    {
      id: "da3_business_impact",
      label: "BUSINESS_CLOSURE_IMPACT counts the businesses who pay in at each branch",
      sql: `SELECT SUM(BUSINESSES) >= 1500 AND MAX_BY(BRANCH_NAME, BUSINESSES_OVER_20_MIN) = 'Barry' AS OK,
                   SUM(BUSINESSES) || ' businesses across ' || COUNT(*) || ' branches; most cut off by a closure: ' || MAX_BY(BRANCH_NAME, BUSINESSES_OVER_20_MIN) AS DETAIL
            FROM BANKING_HOL.ANALYTICS.BUSINESS_CLOSURE_IMPACT`,
      hint: "Paste the business-impact prompt into Cortex Code.",
    },
    {
      id: "da3_semantic_view",
      label: "SV_BRANCH_NETWORK has the map columns: branch LAT/LON, catchment polygons and home H3 cells",
      sql: `SHOW SEMANTIC DIMENSIONS IN BANKING_HOL.ANALYTICS.SV_BRANCH_NETWORK ->> SELECT COUNT_IF("name" ILIKE 'lat') > 0 AND COUNT_IF("name" ILIKE '%geojson%') > 0 AND COUNT_IF("name" ILIKE '%h3%') > 0 AS OK,
             IFF(COUNT_IF("name" ILIKE '%h3%') > 0 AND COUNT_IF("name" ILIKE '%geojson%') > 0, 'map columns found', 'missing LAT, CATCHMENT_GEOJSON or HOME_H3_CELL') AS DETAIL FROM $1`,
      hint: "Paste the semantic view prompt into Cortex Code: it must add LAT/LON, CATCHMENT_GEOJSON and HOME_H3_CELL.",
    },
    {
      id: "da3_agent",
      label: "BRANCH_NETWORK_ADVISOR agent exists",
      sql: show("SHOW AGENTS LIKE 'BRANCH_NETWORK_ADVISOR' IN SCHEMA BANKING_HOL.ANALYTICS", "BRANCH_NETWORK_ADVISOR"),
      hint: "Create the agent with + > Agent > Create with CoCo, using the prompt in this step.",
    },
    {
      id: "da3_maps",
      label: "You ran the catchment and customer density cells behind the maps",
      sql: `SELECT COUNT_IF(QUERY_TEXT ILIKE '%BRANCH_ISOCHRONES%' AND QUERY_TEXT ILIKE '%ST_WITHIN%' AND QUERY_TEXT ILIKE '%RETAIL_CUSTOMERS%') > 0
               AND COUNT_IF(QUERY_TEXT ILIKE '%HOME_H3_CELL%' AND QUERY_TEXT ILIKE '%GROUP BY%' AND QUERY_TEXT ILIKE '%Cardiff%') > 0 AS OK,
             IFF(COUNT_IF(QUERY_TEXT ILIKE '%BRANCH_ISOCHRONES%' AND QUERY_TEXT ILIKE '%ST_WITHIN%') > 0, 'catchments run', 'catchments not run')
               || ', ' || IFF(COUNT_IF(QUERY_TEXT ILIKE '%HOME_H3_CELL%' AND QUERY_TEXT ILIKE '%Cardiff%') > 0, 'density run', 'density not run') AS DETAIL
             FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.QUERY_HISTORY_BY_USER(USER_NAME => ?, RESULT_LIMIT => 1000))
             WHERE EXECUTION_STATUS = 'SUCCESS' AND START_TIME > DATEADD('day', -2, CURRENT_TIMESTAMP())`,
      hint: "Run the catchments and density cells from their prompts, then draw each result with Chart > Map.",
      byUser: true,
    },
  ],
  OPS1: [
    {
      id: "ops1_agent",
      label: "Corporate Payments 360 agent published",
      sql: show("SHOW AGENTS LIKE 'CORPORATE_PAYMENTS_360' IN SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS", "Agent"),
      hint: "+ > Agent > Create with CoCo, using the exact name CORPORATE_PAYMENTS_360 in SNOWFLAKE_INTELLIGENCE.AGENTS. Prereq: DA2, or setup/catchup/client_360.sql.",
    },
  ],
  OPS2: [
    {
      id: "ops2_queue",
      label: "Prioritised triage queue built",
      sql: rows("BANKING_HOL.ANALYTICS.V_ALERT_TRIAGE_QUEUE", 10),
      hint: "Paste the feed and triage queue prompts into Cortex Code.",
    },
    {
      id: "ops2_recommendations",
      label: "AI recommendations generated for the top alerts",
      sql: rows("BANKING_HOL.ANALYTICS.ALERT_RECOMMENDATIONS", 5),
      hint: "Paste the AI next actions prompt into Cortex Code.",
    },
  ],
  OPS3: [
    {
      id: "ops3_cowork_used",
      label: "You asked Payments Ops CoWork a question today",
      // The agent's observability events record who asked; leave out admin and service users.
      // Charts, threads, automations, documents and dashboards are artifacts with no SQL view yet.
      sql: `SELECT COUNT(*) >= 1 AS OK, COUNT(*) || ' CoWork requests to Payments Ops CoWork' AS DETAIL
            FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS('SNOWFLAKE_INTELLIGENCE', 'AGENTS', 'PAYMENTS_OPS_COWORK', 'CORTEX AGENT'))
            WHERE timestamp >= DATEADD('day', -1, CURRENT_TIMESTAMP())
              AND record:"name"::STRING = 'CORTEX_AGENT_REQUEST'
              AND record_attributes:"snow.ai.observability.user.name"::STRING NOT IN ('EMERGENCY_SERVICE_USER', 'DATAOPS_SERVICE_ADMIN', 'SYSTEM', 'ADMIN')`,
      hint: "Open CoWork, pick Payments Ops CoWork and ask the first OPS3 question. Check your role is HOL_PARTICIPANT.",
    },
  ],
  AI1: [
    {
      id: "ai1_tool",
      label: "SCHEME_RULES tool returns CHAPS rules",
      sql: `SELECT BANKING_HOL.AGENTS.SCHEME_RULES('CHAPS'):cutoff_time_uk::STRING = '15:45:00' AS OK,
                   'CHAPS cutoff ' || BANKING_HOL.AGENTS.SCHEME_RULES('CHAPS'):cutoff_time_uk::STRING AS DETAIL`,
      hint: "Paste the scheme rules prompt into Cortex Code.",
    },
    {
      id: "ai1_agent",
      label: "PAYMENTS_INVESTIGATOR agent created",
      sql: show("SHOW AGENTS LIKE 'PAYMENTS_INVESTIGATOR' IN SCHEMA BANKING_HOL.AGENTS", "Agent"),
      hint: "+ > Agent > Create with CoCo, using the exact name PAYMENTS_INVESTIGATOR in BANKING_HOL.AGENTS.",
    },
  ],
  AI2: [
    {
      id: "ai2_mcp",
      label: "PAYMENTS_MCP server created",
      sql: show("SHOW MCP SERVERS LIKE 'PAYMENTS_MCP' IN SCHEMA BANKING_HOL.AGENTS", "MCP server"),
      hint: "Paste the MCP server prompt into Cortex Code. Prereqs: DA2, OPS1 and AI1.",
    },
  ],
  AI3: [
    {
      id: "ai3_extension",
      label: "Marketplace knowledge extension is available",
      sql: show("SHOW CORTEX SEARCH SERVICES IN DATABASE SNOWFLAKE_DOCS_CKE", "Knowledge extension"),
      hint: "Ask the facilitator - setup/00 installs SNOWFLAKE_DOCS_CKE from the Marketplace.",
    },
    {
      id: "ai3_agent",
      label: "Payments Platform Copilot agent created",
      sql: show("SHOW AGENTS LIKE 'PAYMENTS_PLATFORM_COPILOT' IN SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS", "Agent"),
      hint: "+ > Agent > Create with CoCo, using the exact name PAYMENTS_PLATFORM_COPILOT in SNOWFLAKE_INTELLIGENCE.AGENTS.",
    },
  ],
  DS3: [
    { id: "ds3_inventory", label: "MODEL_INVENTORY lists RB_ATTRITION_MODEL from the registry",
      sql: `SELECT COUNT_IF(MODEL_NAME = 'RB_ATTRITION_MODEL') > 0 AS OK, COALESCE(MAX(MODEL_NAME || ' ' || VERSION || ', AUC ' || ROUND(AUC, 3)), 'no inventory rows') AS DETAIL
            FROM BANKING_HOL.ML.MODEL_INVENTORY`,
      hint: "Finish DS1 (or run setup/catchup/ds1_model.sql), then paste the inventory prompt." },
    { id: "ds3_validation", label: "MODEL_VALIDATION compares predicted with actual by band and segment",
      sql: `SELECT COUNT(DISTINCT CUT) >= 2 AS OK, COUNT(*) || ' groups across ' || COUNT(DISTINCT CUT) || ' cuts' AS DETAIL FROM BANKING_HOL.ML.MODEL_VALIDATION`,
      hint: "Paste the validation prompt into Cortex Code." },
    { id: "ds3_approval", label: "An approval decision is recorded with conditions",
      sql: `SELECT COUNT(*) > 0 AS OK, COALESCE(MAX(DECISION || ' by ' || APPROVER), 'no decision recorded') AS DETAIL
            FROM BANKING_HOL.ML.MODEL_APPROVALS WHERE CONDITIONS IS NOT NULL`,
      hint: "Paste the decision prompt into Cortex Code." },
  ],
  OPS4: [
    { id: "ops4_services", label: "IMPORTANT_BUSINESS_SERVICES lists a CHAPS impact tolerance",
      sql: `SELECT COUNT_IF(PAYMENT_TYPE = 'CHAPS') > 0 AS OK, COUNT(*) || ' services' AS DETAIL FROM BANKING_HOL.ANALYTICS.IMPORTANT_BUSINESS_SERVICES`,
      hint: "Paste the first prompt into Cortex Code." },
    { id: "ops4_alert", label: "Snowflake Alert ALERT_IMPACT_TOLERANCE exists",
      sql: `SHOW ALERTS LIKE 'ALERT_IMPACT_TOLERANCE' IN SCHEMA BANKING_HOL.ANALYTICS ->> SELECT COUNT(*) > 0 AS OK, COALESCE(MAX("state") || ', every ' || MAX("schedule"), 'ALERT_IMPACT_TOLERANCE not found') AS DETAIL FROM $1`,
      hint: "Paste the escalation prompt into Cortex Code." },
    { id: "ops4_triggered", label: "The alert has run and found a breach (TRIGGERED)",
      sql: `SELECT COUNT_IF(STATE = 'TRIGGERED') > 0 AS OK, COALESCE(LISTAGG(DISTINCT STATE, ', '), 'no runs yet') AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.ALERT_HISTORY(SCHEDULED_TIME_RANGE_START => DATEADD(day, -1, CURRENT_TIMESTAMP())))
            WHERE NAME = 'ALERT_IMPACT_TOLERANCE'`,
      hint: "Insert the stuck test payment and resume the alert, then give it about a minute." },
    { id: "ops4_escalated", label: "ESCALATIONS records the breach",
      sql: `SELECT COUNT(*) > 0 AS OK, COALESCE(LEFT(MAX(MESSAGE), 90), 'no escalations yet') AS DETAIL FROM BANKING_HOL.ANALYTICS.ESCALATIONS`,
      hint: "The alert writes ESCALATIONS when it fires; check its history for errors." },
  ],
  GOV1: [
    {
      id: "gov1_tagged",
      label: "IBAN tagged RESTRICTED",
      sql: `SELECT COUNT(*) > 0 AS OK, COALESCE(MAX(TAG_VALUE), 'no DATA_SENSITIVITY tag') AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('BANKING_HOL.GOVERNANCE.ACCOUNT_REGISTER', 'table'))
            WHERE COLUMN_NAME = 'IBAN' AND TAG_NAME = 'DATA_SENSITIVITY' AND TAG_VALUE = 'RESTRICTED'`,
      hint: "Paste the classify and tag prompts into Cortex Code.",
    },
    {
      id: "gov1_policies",
      label: "Masking (via tag) and row access policies protect ACCOUNT_REGISTER",
      sql: `SELECT COUNT_IF(POLICY_KIND = 'MASKING_POLICY') > 0 AND COUNT_IF(POLICY_KIND = 'ROW_ACCESS_POLICY') > 0 AS OK,
                   LISTAGG(DISTINCT POLICY_KIND, ', ') AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.POLICY_REFERENCES(
              REF_ENTITY_NAME => 'BANKING_HOL.GOVERNANCE.ACCOUNT_REGISTER', REF_ENTITY_DOMAIN => 'TABLE'))`,
      hint: "Paste the masking and row access prompts into Cortex Code.",
    },
  ],
  GOV2: [
    {
      id: "gov2_documented",
      label: "PAYMENT_SLA_DAILY documented for consumers",
      sql: `SELECT COUNT_IF(COMMENT ILIKE '%Owner:%') > 0 AS OK, COALESCE(LEFT(MAX(COMMENT), 80), 'no comment') AS DETAIL
            FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'AUDIT_PACK' AND TABLE_NAME = 'PAYMENT_SLA_DAILY'`,
      hint: "Paste the documentation prompt into Cortex Code (the comment must include \"Owner:\").",
    },
    {
      id: "gov2_automation",
      label: "Daily Cortex Code automation watches restricted-column access",
      sql: `SHOW AGENT TASKS LIKE 'COCO_ROUTINE_%' IN ACCOUNT ->> SELECT COUNT(*) > 0 AS OK, COALESCE(NULLIF(LISTAGG("name" || ' (' || "state" || ')', ', '), ''), 'no Cortex Code automation yet') AS DETAIL FROM $1 WHERE "database_name" = 'USER$' || CURRENT_USER() AND "schema_name" = 'PUBLIC'`,
      hint: "Ask Cortex Code to set up the daily automation, and say yes when it offers to create it.",
      asCaller: true,
    },
  ],
  GOV5: [
    {
      id: "gov5_policies",
      label: "Masking policies for text, numbers and dates protect RB_CUSTOMERS",
      sql: `SELECT COUNT(DISTINCT POLICY_NAME) = 3 AS OK, COALESCE(LISTAGG(DISTINCT POLICY_NAME, ', '), 'no masking policies') AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.POLICY_REFERENCES(REF_ENTITY_NAME => 'BANKING_HOL.GOVERNANCE.RB_CUSTOMERS', REF_ENTITY_DOMAIN => 'TABLE'))
            WHERE POLICY_KIND = 'MASKING_POLICY' AND POLICY_NAME IN ('MASK_PD_STRING', 'MASK_PD_NUMBER', 'MASK_PD_DATE')`,
      hint: "Paste the three masking policy prompts, then the prompt that attaches them to the PERSONAL_DATA tag.",
    },
    {
      id: "gov5_coverage",
      label: "Every personal data column has a policy (MASKING_COVERAGE shows no gaps)",
      sql: `SELECT COUNT(*) >= 17 AND COUNT_IF(STATUS = 'GAP') = 0 AS OK, COUNT_IF(STATUS = 'PROTECTED') || ' protected, ' || COUNT_IF(STATUS = 'GAP') || ' gaps' AS DETAIL
            FROM BANKING_HOL.GOVERNANCE.MASKING_COVERAGE`,
      hint: "Build the MASKING_COVERAGE view, and tag TOTAL_DEBT_GBP as FINANCIAL so it shows 17 protected columns.",
    },
    {
      id: "gov5_view",
      label: "CUSTOMER_PROTECTED is shared with HOL_RESTRICTED",
      sql: `SHOW GRANTS ON VIEW BANKING_HOL.GOVERNANCE.CUSTOMER_PROTECTED ->> SELECT COUNT_IF("grantee_name" = 'HOL_RESTRICTED' AND "privilege" = 'SELECT') > 0 AS OK, COALESCE(LISTAGG("grantee_name", ', '), 'view not found') AS DETAIL FROM $1`,
      hint: "Create the view and grant SELECT on it to HOL_RESTRICTED.",
    },
  ],
  DE5: [
    {
      id: "de5_catalogue",
      label: "EVIDENCE_CATALOGUE lists every evidence file with its case and type",
      sql: `SELECT COUNT(*) >= 150 AND COUNT(DISTINCT EVIDENCE_TYPE) >= 5 AS OK, COUNT(*) || ' files, ' || COUNT(DISTINCT EVIDENCE_TYPE) || ' evidence types' AS DETAIL
            FROM BANKING_HOL.GOVERNANCE.EVIDENCE_CATALOGUE`,
      hint: "Paste the catalogue prompt; it reads the stage's directory table.",
    },
    {
      id: "de5_share",
      label: "EVIDENCE_SHARE holds case FRC100054 and HOL_RESTRICTED can read it",
      sql: `SHOW GRANTS ON STAGE BANKING_HOL.GOVERNANCE.EVIDENCE_SHARE ->> SELECT COUNT_IF("grantee_name" = 'HOL_RESTRICTED' AND "privilege" = 'READ') > 0 AS OK, COALESCE(LISTAGG("privilege" || ' to ' || "grantee_name", ', '), 'stage not found') AS DETAIL FROM $1`,
      hint: "Create the stage, copy the case files into it, then grant READ to HOL_RESTRICTED.",
    },
    {
      id: "de5_inventory",
      label: "PLATFORM_INVENTORY lists stages and registered models with their owners",
      sql: `SELECT COUNT_IF(OBJECT_TYPE = 'Stage') > 0 AND COUNT_IF(OBJECT_TYPE = 'Model version') > 0 AS OK, COUNT_IF(OBJECT_TYPE = 'Stage') || ' stages, ' || COUNT_IF(OBJECT_TYPE = 'Model version') || ' model versions' AS DETAIL
            FROM BANKING_HOL.GOVERNANCE.PLATFORM_INVENTORY`,
      hint: "Paste the inventory prompt. If it has no model versions, press Fast-forward on DS1 first.",
    },
  ],
  GOV4: [
    { id: "gov4_tagged", label: "Personal data tagged PERSONAL_DATA in GOVERNANCE.RB_CUSTOMERS",
      sql: `SELECT COUNT(*) >= 5 AS OK, COUNT(*) || ' tagged columns in RB_CUSTOMERS' AS DETAIL
            FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('BANKING_HOL.GOVERNANCE.RB_CUSTOMERS', 'table'))
            WHERE TAG_NAME = 'PERSONAL_DATA'`,
      hint: "Paste the copy prompt, then the tagging prompt, into Cortex Code." },
    { id: "gov4_proc", label: "Stored procedure DATA_REQUEST exists",
      sql: `SELECT COUNT(*) > 0 AS OK, COALESCE(MAX(PROCEDURE_NAME || ARGUMENT_SIGNATURE), 'DATA_REQUEST not found') AS DETAIL
            FROM BANKING_HOL.INFORMATION_SCHEMA.PROCEDURES WHERE PROCEDURE_SCHEMA = 'GOVERNANCE' AND PROCEDURE_NAME = 'DATA_REQUEST'`,
      hint: "Paste the DATA_REQUEST prompt into Cortex Code." },
    { id: "gov4_request", label: "A request is logged with its due date and financial crime held back",
      sql: `SELECT COUNT_IF(DUE_BY IS NOT NULL AND ROWS_FOUND > 0 AND LETTER IS NOT NULL) > 0 AS OK,
                   COALESCE(MAX(CUSTOMER_ID || ': ' || ROWS_FOUND || ' records, ' || HELD_BACK || ' tables held back, due ' || DUE_BY), 'no requests yet') AS DETAIL
            FROM BANKING_HOL.GOVERNANCE.DATA_REQUESTS`,
      hint: "Call DATA_REQUEST('RB101023')." },
  ],
  DE4: [
    {
      id: "de4_session",
      label: "Your Spark session is listed in Monitoring > Spark",
      sql: `SELECT COUNT(*) > 0 AS OK, COALESCE(MAX_BY(NAME, CREATED_ON), 'no Spark session yet') AS DETAIL
            FROM TABLE(SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY(CREATION_TIME_START => DATEADD('day', -7, CURRENT_TIMESTAMP()), RESULT_LIMIT => 10000))
            WHERE MODE = 'SCOS_CLIENT' AND OWNER = ?`,
      hint: "Run the spark_session cell (init_spark_session with an app name) in de4_spark_on_snowflake.",
      byUser: true,
    },
    {
      id: "de4_silver",
      label: "PAYMENTS_CURRENT reconciles with the source payments",
      sql: `SELECT COUNT(*) = (SELECT COUNT(*) FROM BANKING_HOL.RAW_DATA.PAYMENTS) AND COUNT_IF(UPDATED_BY_FEED) > 0 AS OK,
                   COUNT(*) || ' payments, ' || COUNT_IF(UPDATED_BY_FEED) || ' updated by the feed' AS DETAIL
            FROM BANKING_HOL.SPARK_LAB.PAYMENTS_CURRENT`,
      hint: "Paste the pipeline prompt under heading 3 and run the cell.",
    },
    {
      id: "de4_batch",
      label: "A payments_nightly batch job succeeded",
      sql: `SELECT COUNT(*) > 0 AS OK, COUNT(*) || ' successful run(s), latest ' || COALESCE(MAX(DATEDIFF('second', STARTED_ON, COMPLETED_ON)) || ' s', '-') AS DETAIL
            FROM TABLE(SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY(CREATION_TIME_START => DATEADD('day', -7, CURRENT_TIMESTAMP()), RESULT_LIMIT => 10000))
            WHERE MODE <> 'SCOS_CLIENT' AND NAME ILIKE '%payments_nightly' AND EXECUTION_STATUS = 'SUCCEEDED' AND OWNER = ?`,
      hint: "Run the EXECUTE CODE BUNDLE statement in a SQL worksheet.",
      byUser: true,
    },
    {
      id: "de4_failed",
      label: "The broken run failed, as intended",
      sql: `SELECT COUNT(*) > 0 AS OK, COALESCE(MAX('FAILED with error ' || ERROR_CODE), 'no failed run yet') AS DETAIL
            FROM TABLE(SNOWFLAKE.SNOWPARK_CONNECT.GET_SPARK_APPLICATION_HISTORY(CREATION_TIME_START => DATEADD('day', -7, CURRENT_TIMESTAMP()), RESULT_LIMIT => 10000))
            WHERE NAME ILIKE '%payments_nightly_broken' AND EXECUTION_STATUS = 'FAILED' AND OWNER = ?`,
      hint: "Run the EXECUTE CODE BUNDLE statement with --source PAYMENT_STATUS_UPDATES_V2.",
      byUser: true,
    },
    {
      id: "de4_alert",
      label: "SPARK_JOB_FAILURE_ALERT recorded the failed run",
      sql: `SELECT COUNT(*) > 0 AS OK, COUNT(*) || ' failed Spark job(s) recorded' AS DETAIL
            FROM BANKING_HOL.SPARK_LAB.SPARK_JOB_FAILURES`,
      hint: "Paste the alert prompt; it runs the alert once with EXECUTE ALERT.",
    },
  ],
  DE3: [
    {
      id: "de3_postgres",
      label: "Snowflake Postgres instance HOL_PAYMENTS_PG is READY",
      sql: `SHOW POSTGRES INSTANCES LIKE 'HOL_PAYMENTS_PG' ->> SELECT COUNT_IF("state" = 'READY') > 0 AS OK, COALESCE(MAX("name" || ' ' || "state" || ' (' || "compute_family" || ')'), 'HOL_PAYMENTS_PG not created yet') AS DETAIL FROM $1`,
      hint: "Run the create_pg cell (pg.create_postgres) as HOL_PARTICIPANT; it takes 3 to 5 minutes to reach READY.",
    },
    {
      id: "de3_mirror",
      label: "payments_mirror is replicating Postgres into PAYMENTS_MIRROR (1,000+ events)",
      sql: `SELECT COUNT(*) >= 1000 AS OK, COUNT(*) || ' events mirrored, ' || COUNT_IF(STATUS = 'FAILED') || ' failed' AS DETAIL FROM PAYMENTS_MIRROR.PAYMENTS.PAYMENT_EVENTS$live`,
      hint: "Run the mirror cell (pg.start_mirror), then the stream cell. Mirrored rows appear in PAYMENTS_MIRROR.PAYMENTS.PAYMENT_EVENTS$live about 30 seconds after they're inserted.",
    },
    {
      id: "de3_incidents",
      label: "DT_PAYMENT_INCIDENTS flags failing payment clusters",
      sql: show("SHOW DYNAMIC TABLES LIKE 'DT_PAYMENT_INCIDENTS' IN SCHEMA BANKING_HOL.REALTIME", "DT_PAYMENT_INCIDENTS"),
      hint: "Paste the incidents prompt into Cortex Code with the notebook open.",
    },
  ],
  GOV3: [
    {
      id: "gov3_traces",
      label: "Cortex AI Gateway recorded your requests today",
      // The app's role has MONITOR on the gateway, so it sees every user's spans; leave out admin and service users
      sql: `SELECT COUNT(*) >= 2 AS OK, COUNT(*) || ' requests via ' || COALESCE(LISTAGG(DISTINCT record_attributes:"gen_ai.request.model"::STRING, ', '), 'no model yet') AS DETAIL
            FROM TABLE(AGENT_TRACE_TABLE('SNOWFLAKE'))
            WHERE timestamp >= DATEADD('day', -1, CURRENT_TIMESTAMP())
              AND record_attributes:"gen_ai.operation.name"::STRING = 'chat'
              AND resource_attributes:"user"::STRING NOT IN ('EMERGENCY_SERVICE_USER', 'DATAOPS_SERVICE_ADMIN', 'SYSTEM', 'ADMIN')`,
      hint: "Run the gateway_calls cell in gov3_ai_gateway (it needs HOL_NOTEBOOK_ACCESS_INTEGRATION in the notebook settings).",
    },
  ],
}

export const ALL_CHECK_IDS = Object.values(CHECKS).flat().map((c) => c.id)

// Prerequisites: what a module needs before you start it. Run live from the module
// page and never recorded as progress, so they don't count towards completion.
const views = (names: string[]) =>
  `SELECT COUNT(*) = ${names.length} AS OK, COUNT(*) || ' of ${names.length} found: ' || COALESCE(LISTAGG(TABLE_NAME, ', ') WITHIN GROUP (ORDER BY TABLE_NAME), 'none') AS DETAIL
     FROM BANKING_HOL.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'ANALYTICS' AND TABLE_NAME IN (${names.map((n) => `'${n}'`).join(", ")})`

const columns = (table: string, cols: string[]) =>
  `SELECT COUNT(*) = ${cols.length} AS OK, COUNT(*) || ' of ${cols.length} columns: ' || COALESCE(LISTAGG(COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY COLUMN_NAME), 'table not found') AS DETAIL
     FROM BANKING_HOL.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'ANALYTICS' AND TABLE_NAME = '${table}' AND COLUMN_NAME IN (${cols.map((c) => `'${c}'`).join(", ")})`

const CATCHUP = "Or run setup/catchup/core_analytics.sql (or press Fast-forward on this module page)."
const STAGING = ["STG_ACCOUNTS", "STG_CUSTOMERS", "STG_FEEDBACK", "STG_PAYMENTS"]

const pre = {
  gov4Tags: {
    id: "pre_gov4_tags",
    label: "Personal data is tagged PERSONAL_DATA in GOVERNANCE (GOV4)",
    sql: `SELECT COUNT(*) >= 5 AS OK, COUNT(*) || ' tagged columns in RB_CUSTOMERS' AS DETAIL FROM TABLE(BANKING_HOL.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('BANKING_HOL.GOVERNANCE.RB_CUSTOMERS', 'table')) WHERE TAG_NAME = 'PERSONAL_DATA'`,
    hint: "Press **Fast-forward** on this page, or complete GOV4's copy and tagging steps.",
  },
  staging: { id: "pre_staging", label: "dbt staging views exist", sql: views(STAGING), hint: `Run Build from the dbt pane (DE1). ${CATCHUP}` },
  slaMart: { id: "pre_sla_mart", label: "MART_SLA_COMPLIANCE has data", sql: rows("BANKING_HOL.ANALYTICS.MART_SLA_COMPLIANCE"), hint: `Run Build from the dbt pane (DE1). ${CATCHUP}` },
  customerMart: {
    id: "pre_customer_mart",
    label: "MART_CUSTOMER_PAYMENTS has the columns DE2 needs",
    sql: columns("MART_CUSTOMER_PAYMENTS", ["CUSTOMER_ID", "RM_NAME", "SUCCESS_RATE_PCT"]),
    hint: `Finish DE1's mart and Build steps (keep the column names in the prompt). ${CATCHUP}`,
  },
  feedback: { id: "pre_feedback", label: "FEEDBACK_ENRICHED exists (sentiment and topics)", sql: views(["FEEDBACK_ENRICHED"]), hint: `Run setup/catchup/core_analytics.sql (or press Fast-forward on this module page). It builds FEEDBACK_ENRICHED; the lab builds it again in DA1.` },
  retailGeo: {
    id: "pre_retail_geo",
    label: "Retail branch network and travel times ready (BANKING_HOL.RETAIL)",
    sql: `SELECT COUNT(*) > 0 AS OK, COUNT(*) || ' branch-to-cell travel times' AS DETAIL FROM BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL`,
    hint: "The retail data is built at provisioning. Ask your facilitator to run setup/07_retail_geo_seed.sql.",
  },
  auditPack: {
    id: "pre_audit_pack",
    label: "GOV2 audit pack ready (PAYMENTS_AUDIT_AGENT)",
    sql: show("SHOW AGENTS LIKE 'PAYMENTS_AUDIT_AGENT' IN SCHEMA BANKING_HOL.AUDIT_PACK", "PAYMENTS_AUDIT_AGENT"),
    hint: "The audit pack is built at provisioning. Ask your facilitator to run setup/06_audit_pack.sql.",
  },
  ds4Predictions: {
    id: "pre_ds4_predictions",
    label: "Customer predictions exist (ML.RB_CUSTOMER_PREDICTIONS from DS4)",
    sql: rows("BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS", 10000),
    hint: "Do DS4, or press Fast-forward on this page: it builds the DS1 and DS4 results for you in a few minutes.",
  },
  svClient360: {
    id: "pre_sv_client_360",
    label: "SV_CLIENT_360 exists (DA2)",
    sql: show("SHOW SEMANTIC VIEWS LIKE 'SV_CLIENT_360' IN SCHEMA BANKING_HOL.ANALYTICS", "SV_CLIENT_360"),
    hint: "Do DA2, or run setup/catchup/client_360.sql (or press Fast-forward on this module page). It builds the analytics layer and SV_CLIENT_360.",
  },
  agent360: {
    id: "pre_agent_360",
    label: "CORPORATE_PAYMENTS_360 agent exists (OPS1)",
    sql: show("SHOW AGENTS LIKE 'CORPORATE_PAYMENTS_360' IN SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS", "Agent"),
    hint: "Do OPS1, or run its answer key ops1.sql (see the OPS1 answer key at the bottom of this page) after SV_CLIENT_360 exists.",
  },
  lookup: {
    id: "pre_payment_lookup",
    label: "PAYMENT_LOOKUP tool exists (AI1)",
    sql: show("SHOW USER FUNCTIONS LIKE 'PAYMENT_LOOKUP' IN SCHEMA BANKING_HOL.AGENTS", "PAYMENT_LOOKUP"),
    hint: "Build the payment lookup tool in AI1 first.",
  },
  cke: {
    id: "pre_cke",
    label: "Marketplace knowledge extension installed",
    sql: show("SHOW CORTEX SEARCH SERVICES IN DATABASE SNOWFLAKE_DOCS_CKE", "Knowledge extension"),
    hint: "Ask the facilitator - setup/00 installs SNOWFLAKE_DOCS_CKE from the Marketplace.",
  },
  realtime: {
    id: "pre_realtime",
    label: "Shared interactive warehouse HOL_INTERACTIVE_WH exists",
    sql: show("SHOW WAREHOUSES LIKE 'HOL_INTERACTIVE_WH'", "HOL_INTERACTIVE_WH"),
    hint: "Created by setup/00_admin_provision.sql. Ask the facilitator to resume it for the session.",
  },
  coworkAgent: {
    id: "pre_cowork_agent",
    label: "Agent PAYMENTS_OPS_COWORK exists for CoWork",
    sql: show("SHOW AGENTS LIKE 'PAYMENTS_OPS_COWORK' IN SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS", "Agent"),
    hint: "Built by setup/09_cowork_pack.sql at provisioning. Ask the facilitator to run it.",
  },
  gateway: {
    id: "pre_gateway",
    label: "Cortex AI Gateway SNOWFLAKE available",
    sql: show("SHOW AI GATEWAYS", "Gateway"),
    hint: "Cortex AI Gateway is in preview: ask the facilitator whether it's available in this region.",
  },
  notebookAccess: {
    id: "pre_notebook_access",
    label: "External access integration HOL_NOTEBOOK_ACCESS_INTEGRATION exists",
    sql: show("SHOW INTEGRATIONS LIKE 'HOL_NOTEBOOK_ACCESS_INTEGRATION'", "HOL_NOTEBOOK_ACCESS_INTEGRATION"),
    hint: "Missing: trial accounts don't allow external network access, so this module can't run there. Skip it, or add a credit card and rerun INSTALL.sql. On other accounts, ask the facilitator to rerun setup/00_admin_provision.sql.",
  },
  sparkLab: {
    id: "pre_spark_lab",
    label: "The raw status feed for DE4 is loaded",
    sql: rows("BANKING_HOL.SPARK_LAB.PAYMENT_STATUS_UPDATES", 10000),
    hint: "Built by setup/07c_spark_lab_seed.sql at provisioning. Ask the facilitator to run LOAD_LAB_DATA.",
  },
  postgres: {
    id: "pre_postgres",
    label: "HOL_PARTICIPANT can create a Snowflake Postgres instance and mirror it",
    sql: `SHOW GRANTS TO ROLE HOL_PARTICIPANT ->> SELECT COUNT_IF("privilege" = 'CREATE POSTGRES INSTANCE') > 0 AND COUNT_IF("name" ILIKE '%POSTGRES_MIRROR_ADMIN') > 0 AS OK, IFF(OK, 'CREATE POSTGRES INSTANCE and POSTGRES_MIRROR_ADMIN granted', 'missing Postgres grants') AS DETAIL FROM $1`,
    hint: "Granted by setup/00_admin_provision.sql (DE3 section). Ask the facilitator to rerun it.",
  },
} satisfies Record<string, Check>

export const PREREQS: Record<string, Check[]> = {
  AI5: [{
    id: "pre_search_lab",
    label: "Cortex Search is enabled for this lab (SEARCH_LAB schema)",
    sql: show("SHOW SCHEMAS LIKE 'SEARCH_LAB' IN DATABASE BANKING_HOL", "SEARCH_LAB"),
    hint: "Not set up in this account (Cortex Search isn't approved here): AI5 can't run in this account.",
  }],
  C1: [CHECKS.C0[1]],
  APP0: [{
    id: "pre_apps_schema",
    label: "The APPS schema exists for your app and its tables",
    sql: show("SHOW SCHEMAS LIKE 'APPS' IN DATABASE BANKING_HOL", "APPS schema"),
    hint: "Created by setup/00_admin_provision.sql. Ask the facilitator to rerun it.",
  }],
  APP1: [CHECKS.APP0[0]],
  DE1: [CHECKS.C1[0]],
  DE2: [pre.staging, pre.slaMart, pre.customerMart],
  DA2: [pre.staging, pre.feedback],
  DA1: [pre.staging],
  DA3: [pre.retailGeo],
  DA5: [pre.ds4Predictions],
  OPS1: [pre.svClient360],
  OPS2: [pre.staging, pre.feedback],
  OPS3: [pre.coworkAgent],
  AI1: [pre.staging, pre.svClient360],
  AI2: [pre.svClient360, pre.agent360, pre.lookup, pre.cke],
  AI3: [pre.cke, pre.svClient360],
  GOV1: [pre.staging],
  GOV2: [pre.auditPack],
  GOV5: [pre.gov4Tags],
  DE3: [pre.realtime, pre.notebookAccess, pre.postgres],
  DE4: [pre.sparkLab],
  GOV3: [pre.gateway, pre.notebookAccess],
}
