# DA6: Level of detail analysis in a semantic view

| | |
|---|---|
| **Persona** | Data Analyst (Retail Banking), Tableau, Power BI and BI users |
| **Time** | ~40 min |
| **Prerequisites** | DA5 (uses `ANALYTICS.CUSTOMER_VALUE` and `CUSTOMER_VALUE_SEGMENTS`; to catch up, run `vignettes/da5_customer_value/da5.sql`) |

## Business question
> How does each neighbourhood, branch and segment compare with its city and with the UK, on profit per customer and on lifetime value at risk, from one set of definitions everyone shares?

## What you'll build
- View `ANALYTICS.CUSTOMER_VALUE_DETAIL`: one row per retail customer with 12-month profit, lifetime value, value at risk and value segment
- Semantic view `ANALYTICS.SV_CUSTOMER_VALUE` with **level of detail (LOD) metrics**: FIXED, INCLUDE and EXCLUDE, the same ideas as Tableau's LOD expressions
- Agent `ANALYTICS.CUSTOMER_VALUE_ADVISOR` that answers the same comparisons in plain English

## Level of detail, in one paragraph
A normal metric is worked out at whatever grain the query groups by. An LOD metric is worked out at a different grain:

| | What it does | Here |
|---|---|---|
| **INCLUDE DIMENSIONS** | adds a finer grain for one calculation, then rolls it up | total each customer's profit first, then average across customers |
| **FIXED DIMENSIONS** | calculates at a set grain, whatever the query groups by | the city's profit per customer, next to every branch or neighbourhood in it |
| **EXCLUDE DIMENSIONS** | removes a grain for one calculation | the UK total, whatever the query groups by, for shares and comparisons |

**Power BI and DAX:** the same comparisons are DAX measures, for example `CALCULATE` with `ALL` or `ALLEXCEPT` for a fixed or excluded grain. Semantic View Autopilot can import a Power BI `.pbix` or `.pbit` file and turn its DAX measures into a semantic view, so the logic moves with you.

**Three ways to write the same view:** SQL (the next step), the Semantic Studio UI, or YAML. They all produce one governed semantic view, and you can switch between them.

**Preview:** LOD metrics in semantic views are in preview (November 2026). They work in SQL and in Semantic Studio; Cortex Analyst and Cortex Agents don't use them yet, which is why the last step adds benchmarks agents can use.

## Steps
### Open a SQL file
Where: Snowsight > Projects > Workspaces > + Add new > SQL File, role HOL_PARTICIPANT, warehouse BANKING_WH
1. Name it `da6_level_of_detail.sql` and set the context:
```sql
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ANALYTICS;
```

### One row per customer
Where: the same SQL file
1. Paste and run:
```sql
CREATE OR REPLACE VIEW CUSTOMER_VALUE_DETAIL
  COMMENT = 'DA6: one row per retail customer with 12-month profit, lifetime value (DA5) and city and UK benchmarks' AS
WITH base AS (
    SELECT c.CUSTOMER_ID, c.CITY, INITCAP(REPLACE(c.SEGMENT, '_', ' ')) AS SEGMENT, b.BRANCH_NAME,
           H3_LATLNG_TO_CELL_STRING(c.HOME_LAT, c.HOME_LON, 7) AS NEIGHBOURHOOD,
           p.PROFIT_12M_GBP, v.LIFETIME_VALUE_GBP, v.VALUE_AT_RISK_GBP,
           s.SEGMENT AS VALUE_SEGMENT, s.NEXT_BEST_OFFER
    FROM BANKING_HOL.RAW_DATA.RB_CUSTOMERS c
    JOIN BANKING_HOL.RETAIL.BRANCHES b ON b.BRANCH_ID = c.HOME_BRANCH_ID
    JOIN (SELECT CUSTOMER_ID, SUM(PROFIT_GBP) AS PROFIT_12M_GBP
          FROM BANKING_HOL.RAW_DATA.RB_MONTHLY_SNAPSHOT GROUP BY 1) p USING (CUSTOMER_ID)
    LEFT JOIN CUSTOMER_VALUE v USING (CUSTOMER_ID)
    LEFT JOIN CUSTOMER_VALUE_SEGMENTS s USING (CUSTOMER_ID))
-- the same benchmarks as plain columns, for tools that don't use LOD metrics yet (Cortex Analyst, agents)
SELECT *, ROUND(AVG(PROFIT_12M_GBP) OVER (PARTITION BY CITY), 2) AS CITY_PROFIT_PER_CUSTOMER_GBP,
          ROUND(AVG(PROFIT_12M_GBP) OVER (), 2) AS UK_PROFIT_PER_CUSTOMER_GBP
FROM base;
SELECT COUNT(*) AS CUSTOMERS, COUNT(LIFETIME_VALUE_GBP) AS WITH_LIFETIME_VALUE FROM CUSTOMER_VALUE_DETAIL;
```
Expect: 20,000 customers, about 18,400 with a lifetime value (DS4 scored the customers still with the bank on 31 Aug 2026)

### Create the semantic view
Where: the same SQL file
Read the METRICS block before you run it: ordinary metrics first, then INCLUDE, FIXED and EXCLUDE, then the plain benchmarks for agents.
1. Paste and run:
```sql
CREATE OR REPLACE SEMANTIC VIEW SV_CUSTOMER_VALUE
  TABLES (
    cust AS CUSTOMER_VALUE_DETAIL PRIMARY KEY (CUSTOMER_ID)
      COMMENT = 'One row per retail customer: 12-month profit, lifetime value, value at risk',
    months AS BANKING_HOL.RAW_DATA.RB_MONTHLY_SNAPSHOT PRIMARY KEY (CUSTOMER_ID, MONTH)
      COMMENT = 'One row per customer per month')
  RELATIONSHIPS (months (CUSTOMER_ID) REFERENCES cust)
  FACTS (
    cust.profit AS PROFIT_12M_GBP, cust.ltv AS LIFETIME_VALUE_GBP, cust.var AS VALUE_AT_RISK_GBP, cust.one AS 1,
    cust.city_benchmark AS CITY_PROFIT_PER_CUSTOMER_GBP, cust.uk_benchmark AS UK_PROFIT_PER_CUSTOMER_GBP,
    months.month_profit AS PROFIT_GBP)
  DIMENSIONS (
    cust.customer_id AS CUSTOMER_ID, cust.city AS CITY, cust.segment AS SEGMENT,
    cust.branch AS BRANCH_NAME WITH SYNONYMS = ('home branch'),
    cust.neighbourhood AS NEIGHBOURHOOD WITH SYNONYMS = ('hexagon', 'area', 'H3 cell'),
    cust.value_segment AS VALUE_SEGMENT, cust.next_best_offer AS NEXT_BEST_OFFER,
    months.month AS MONTH)
  METRICS (
    -- ordinary metrics: grouped by whatever the query groups by
    cust.customers AS COUNT(cust.customer_id),
    cust.total_profit AS SUM(cust.profit),
    cust.profit_per_customer AS SUM(cust.profit) / COUNT(cust.customer_id),
    cust.lifetime_value AS SUM(cust.ltv),
    cust.value_at_risk AS SUM(cust.var),
    months.avg_profit_per_customer_month AS AVG(months.month_profit)
      COMMENT = 'Average of customer-months: NOT the same as average profit per customer',
    -- INCLUDE: work out each customer's total first, then average across customers
    avg_profit_per_customer AS AVG(SUM(months.month_profit) INCLUDE DIMENSIONS (cust.customer_id))
      COMMENT = 'Average 12-month profit per customer, whatever the query groups by',
    -- FIXED: the city's figures, next to every neighbourhood, branch or segment in it
    city_profit AS SUM(SUM(cust.profit) FIXED DIMENSIONS (cust.city)),
    city_customers AS SUM(SUM(cust.one) FIXED DIMENSIONS (cust.city)),
    city_profit_per_customer AS city_profit / city_customers,
    vs_city_pct AS 100 * (cust.profit_per_customer / city_profit_per_customer - 1)
      COMMENT = 'Profit per customer against the city average, in percent',
    -- EXCLUDE: drop every customer dimension, so this is the UK whatever the query groups by
    uk_profit AS SUM(SUM(cust.profit) EXCLUDE DIMENSIONS (cust.city, cust.segment, cust.branch, cust.neighbourhood, cust.value_segment, cust.next_best_offer)),
    uk_customers AS SUM(SUM(cust.one) EXCLUDE DIMENSIONS (cust.city, cust.segment, cust.branch, cust.neighbourhood, cust.value_segment, cust.next_best_offer)),
    uk_value_at_risk AS SUM(SUM(cust.var) EXCLUDE DIMENSIONS (cust.city, cust.segment, cust.branch, cust.neighbourhood, cust.value_segment, cust.next_best_offer)),
    uk_profit_per_customer AS uk_profit / uk_customers,
    vs_uk_pct AS 100 * (cust.profit_per_customer / uk_profit_per_customer - 1),
    share_of_uk_profit_pct AS 100 * cust.total_profit / uk_profit,
    share_of_uk_value_at_risk_pct AS 100 * cust.value_at_risk / uk_value_at_risk,
    -- the same benchmarks from plain columns: what Cortex Analyst and agents can use today
    cust.city_profit_per_customer_benchmark AS AVG(cust.city_benchmark),
    cust.uk_profit_per_customer_benchmark AS AVG(cust.uk_benchmark))
  COMMENT = 'DA6: retail customer profit and value, with level of detail (LOD) metrics for city and UK comparisons';
SHOW SEMANTIC METRICS IN SV_CUSTOMER_VALUE;
```
Expect: the semantic view created, with about 20 metrics

### See the same view in Semantic Studio
Where: Snowsight > **AI & ML** > **Cortex Analyst** > **SV_CUSTOMER_VALUE**

Semantic Studio shows the same view as a file you can read and edit.

1. Select **SV_CUSTOMER_VALUE** to open it. It opens as a YAML file in Workspaces.
2. Find the `avg_profit_per_customer`, `city_profit_per_customer` and `uk_profit` metrics.
3. Select the **YAML** tab (or read the file) to see the LOD clause in the governed definition.
4. Select **Monitoring** to see which agent requests use these metrics.

**Important:** don't select **Deploy** yet. Deploy overwrites the live view with your local file. Read first, then close the file.

### Build a view in the UI instead
Where: Snowsight > **Workspaces** > **Add new** > **Semantic View**

Use this when you want a view without writing SQL. The Autopilot wizard asks for a description, example questions and tables.

1. Select **Add new** > **Semantic View**.
2. Name the view `SV_CUSTOMER_VALUE_UI`, choose the schema `BANKING_HOL.ANALYTICS`, and add a description.
3. Under context, pick **SQL Queries**, or upload a **YAML** specification, or a **Power BI** file if you have one.
4. Select the tables `ANALYTICS.CUSTOMER_VALUE_DETAIL` and `RAW_DATA.RB_MONTHLY_SNAPSHOT`, then select **Create and save**.
5. Open the view in Semantic Studio and add the city comparison by hand, or ask CoCo: *Add a metric that compares profit per customer with the city average, in percent.*

Expect: a generated view. Compare its metrics with the SQL version above. The SQL version has the LOD metrics, so use it when you need the FIXED and EXCLUDE comparisons.

### INCLUDE: per customer, not per customer-month
Where: the same SQL file
The classic BI mistake: averaging the monthly rows gives profit per customer-*month*. INCLUDE totals each customer first.
1. Paste and run:
```sql
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.segment
    METRICS cust.customers, months.avg_profit_per_customer_month, avg_profit_per_customer)
ORDER BY avg_profit_per_customer DESC;
```
Expect: two very different numbers per segment. Premier customers make about £155 per customer-month but about £1,750 per customer a year. Only the second answers "what is a Premier customer worth?"

### FIXED: each branch against its city
Where: the same SQL file
1. Paste and run:
```sql
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.city, cust.branch
    METRICS cust.customers, cust.profit_per_customer, city_profit_per_customer, vs_city_pct)
WHERE city = 'Leeds'
ORDER BY vs_city_pct DESC;
```
Expect: every Leeds branch next to the same Leeds figure (about £213 a customer), and how far above or below it each branch is. Leeds Horsforth is about double the city average; Leeds City Centre is well under half of it.
2. Now move the filter **inside** the semantic view clause and compare:
```sql
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.branch
    METRICS cust.profit_per_customer, uk_profit_per_customer
    WHERE cust.city = 'Leeds');
```
Expect: "UK profit per customer" is now the Leeds figure. A WHERE inside `SEMANTIC_VIEW()` filters the data *before* the LOD calculation (like a context filter in Tableau); a WHERE outside filters the rows *after* it.

### EXCLUDE: shares of the UK
Where: the same SQL file
1. Paste and run:
```sql
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.city
    METRICS cust.customers, cust.total_profit, share_of_uk_profit_pct, cust.value_at_risk, share_of_uk_value_at_risk_pct)
ORDER BY share_of_uk_value_at_risk_pct DESC;
```
Expect: London holds about a quarter of UK profit and of value at risk. Compare each city's two shares: where value at risk runs ahead of profit, the book is more fragile.
2. The same by value segment (from DA5):
```sql
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.value_segment
    METRICS cust.customers, cust.lifetime_value, share_of_uk_value_at_risk_pct, vs_uk_pct)
ORDER BY share_of_uk_value_at_risk_pct DESC;
```
Expect: **Save now** is a few percent of customers but about a third of the UK's value at risk.
**Preview note:** ask for the city (FIXED) comparisons and the UK (EXCLUDE) comparisons in separate queries. In the preview, mixing the two in one query can return wrong numbers.

### Neighbourhoods against their city
Where: the same SQL file
This is what the executive demo's lasso does by hand: an area against the rest of its city.
1. Paste and run:
```sql
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.city, cust.neighbourhood
    METRICS cust.customers, cust.profit_per_customer, vs_city_pct)
WHERE city = 'London' AND customers >= 30
ORDER BY vs_city_pct DESC LIMIT 10;
```
Expect: London neighbourhoods (H3 hexagons) where customers are worth more than twice the London average

### Look at it in Semantic Studio
Where: Snowsight > **Catalog** > Database Explorer > BANKING_HOL > ANALYTICS > Semantic Views > **SV_CUSTOMER_VALUE**
1. Open the semantic view and find the LOD metrics (`avg_profit_per_customer`, `city_profit_per_customer`, `uk_profit`).
2. Read their definitions next to the ordinary metrics: the LOD clause is part of the governed definition, so every tool that queries the view gets the same answer.

### Ask an agent the same questions
Where: the same SQL file, then Snowflake CoWork
Agents don't use LOD metrics yet: given only those, an agent works the city and UK averages out with its own SQL. The semantic view also carries the same benchmarks as plain metrics (`city_profit_per_customer_benchmark`, `uk_profit_per_customer_benchmark`), so the agent can use the governed figures.
1. Paste and run:
```sql
CREATE OR REPLACE AGENT BANKING_HOL.ANALYTICS.CUSTOMER_VALUE_ADVISOR
  COMMENT = 'DA6: answers customer profit and value questions, with city and UK comparisons'
  PROFILE = '{"display_name": "Customer Value Advisor", "color": "blue"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto
  instructions:
    response: >
      You help a UK retail bank's customer value team. Give numbers in pounds, round percentages to whole
      numbers, and always say what each figure is compared with (the city average or the UK average).
    orchestration: >
      Use the Analyst tool for every question. To compare an area, branch or segment with its city or the UK,
      use the city_profit_per_customer_benchmark and uk_profit_per_customer_benchmark metrics alongside
      profit_per_customer.
    sample_questions:
      - question: "Which Leeds branches have the highest profit per customer, against the Leeds and UK averages?"
      - question: "How much of the UK's value at risk sits in each city?"
      - question: "Which London neighbourhoods are most profitable per customer compared with London as a whole?"
  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "Analyst"
        description: "Retail customers: 12-month profit, lifetime value and value at risk, by city, branch, neighbourhood, segment and value segment, with city and UK benchmarks."
  tool_resources:
    Analyst:
      semantic_view: "BANKING_HOL.ANALYTICS.SV_CUSTOMER_VALUE"
      execution_environment:
        type: "warehouse"
        warehouse: "BANKING_WH"
  $$;
SELECT SNOWFLAKE.CORTEX.DATA_AGENT_RUN('BANKING_HOL.ANALYTICS.CUSTOMER_VALUE_ADVISOR',
  $${"messages":[{"role":"user","content":[{"type":"text","text":"Which Leeds branches have the highest profit per customer, against the Leeds and UK averages?"}]}]}$$) AS RESPONSE;
```
2. Open **Snowflake CoWork**, pick **Customer Value Advisor** and ask: *How much of the UK's value at risk sits in each city?*
Expect: the same Leeds figures as the FIXED step (about £213 for Leeds and £233 for the UK), with the agent's SQL using the benchmark metrics

## Check your work
- `SV_CUSTOMER_VALUE` exists with INCLUDE, FIXED and EXCLUDE metrics
- The Leeds branch comparison gives every branch the same city figure
- `CUSTOMER_VALUE_ADVISOR` answers the Leeds question with the Leeds and UK averages

## In your bank
- **Bring your Tableau or Power BI logic with you.** LOD expressions in a semantic view mean the "per customer", "against the region" and "share of total" logic lives once, in Snowflake, instead of in every workbook. Power BI DAX measures can be imported with Autopilot.
- **Context filters still matter.** Decide where a filter belongs (inside the semantic view query, or after it) the same way you decide what is a context filter in Tableau.
- **Agents next.** When Cortex Analyst and agents support LOD metrics, the benchmark columns can go: the agent will use the same LOD definitions as everyone else.
- **Performance.** At scale, materialize the semantic view's busiest metrics so dashboards and agents don't recompute them on every question.
