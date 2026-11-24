-- =====================================================
-- VIGNETTE DA6: LEVEL OF DETAIL ANALYSIS IN A SEMANTIC VIEW   (~40 min)
-- Persona:  Data Analyst (Retail Banking), Tableau and BI users
-- Question: "How does each neighbourhood, branch and segment compare with its city
--            and the UK, from one set of shared definitions?"
-- Prereq:   DA5 (ANALYTICS.CUSTOMER_VALUE, CUSTOMER_VALUE_SEGMENTS)
-- LOD metrics in semantic views are in preview; Cortex Analyst and agents don't use them yet.
-- Reference SQL for each step in README.md.
-- =====================================================

-- 1.
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ANALYTICS;

-- 2.
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

-- 3.
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

-- 4.
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.segment
    METRICS cust.customers, months.avg_profit_per_customer_month, avg_profit_per_customer)
ORDER BY avg_profit_per_customer DESC;

-- 5.
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.city, cust.branch
    METRICS cust.customers, cust.profit_per_customer, city_profit_per_customer, vs_city_pct)
WHERE city = 'Leeds'
ORDER BY vs_city_pct DESC;

-- 6.
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.branch
    METRICS cust.profit_per_customer, uk_profit_per_customer
    WHERE cust.city = 'Leeds');

-- 7.
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.city
    METRICS cust.customers, cust.total_profit, share_of_uk_profit_pct, cust.value_at_risk, share_of_uk_value_at_risk_pct)
ORDER BY share_of_uk_value_at_risk_pct DESC;

-- 8.
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.value_segment
    METRICS cust.customers, cust.lifetime_value, share_of_uk_value_at_risk_pct, vs_uk_pct)
ORDER BY share_of_uk_value_at_risk_pct DESC;

-- 9.
SELECT * FROM SEMANTIC_VIEW(SV_CUSTOMER_VALUE
    DIMENSIONS cust.city, cust.neighbourhood
    METRICS cust.customers, cust.profit_per_customer, vs_city_pct)
WHERE city = 'London' AND customers >= 30
ORDER BY vs_city_pct DESC LIMIT 10;

-- 10.
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
