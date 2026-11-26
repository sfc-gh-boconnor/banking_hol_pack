# DA5: Customer lifetime value, value at risk and next-best offers

| | |
|---|---|
| **Persona** | Data Analyst (Retail Banking, customer value management) |
| **Time** | ~30 min |
| **Prerequisites** | DS4, which builds `ML.RB_CUSTOMER_PREDICTIONS`. If you skipped it, run `setup/catchup/ds1_model.sql` then `setup/catchup/ds4_predictions.sql` first |

## Business question
> Of the customers who might leave, which ones are worth the most to keep, how much value is at stake, and what should we offer each of them?

## What you'll build
- Table `ANALYTICS.CUSTOMER_VALUE`: every customer's 5-year lifetime value and value at risk
- Table `ANALYTICS.CUSTOMER_VALUE_SEGMENTS`: four value-and-risk segments and a rules-based next-best offer per customer
- A save list ranked by value at risk, and a chart of where the value is

## How it fits together
The data scientists (DS4) own the models: a calibrated chance of leaving and a predicted monthly margin for every customer, in `ML.RB_CUSTOMER_PREDICTIONS`. Customer value management owns what the bank does with them: how value is defined, which customers go in which segment, and what each is offered. Keeping the rules in SQL means the CVM team can read, change and sign them off without retraining anything.

**Lifetime value** here is 5 years of predicted monthly margin, each month weighted by the chance the customer is still with us and discounted at 10% a year. **Value at risk** is what we expect to lose in the next 12 months if we do nothing: the lifetime value of customers worth keeping, times the chance they leave in that year.

## Steps
### Check the predictions are ready
Where: Snowsight > Projects > Workspaces > + Add new > SQL File, role HOL_PARTICIPANT, warehouse BANKING_WH
Everything in this module is built on the data scientists' predictions, so check they exist before you start.
1. Name the file `da5_customer_value.sql`, then paste and run:
```sql
USE ROLE HOL_PARTICIPANT;
USE WAREHOUSE BANKING_WH;
USE SCHEMA BANKING_HOL.ANALYTICS;
SELECT COUNT(*) AS CUSTOMERS FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;
```
Expect: about 18,400 customers.
**Important:** if the query fails with "does not exist", DS4 hasn't been done in this account. Fast-forward instead of building the models yourself.
1. In the Lab Companion, find the **Fast-forward** card on this module page.
2. Press **Fast-forward**.
3. Wait for both items to show a green tick, which takes a couple of minutes. You can leave the page open.
4. Run the check above again, or press **Check prerequisites**.
Fast-forward gives you the DS1 and DS4 results as you, so the tables and models are yours.
It copies models the lab trained earlier with the same code, so it takes a couple of minutes, not several minutes of training. DS4 trains them as ML Jobs on a compute pool, if you want to see how that is done.

### Look at what the models give you
Where: the same SQL file
1. Paste and run:
```sql
SELECT COUNT(*) AS CUSTOMERS,
       ROUND(AVG(CHURN_3M) * 100, 2) AS AVG_CHANCE_OF_LEAVING_PCT,
       ROUND(AVG(PREDICTED_MONTHLY_MARGIN_GBP), 2) AS AVG_MONTHLY_MARGIN_GBP,
       ANY_VALUE(ATTRITION_MODEL_VERSION) AS ATTRITION_MODEL, ANY_VALUE(MARGIN_MODEL_VERSION) AS MARGIN_MODEL
FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS;
```
Expect: about 18,400 customers, a 2% average chance of leaving in 3 months, about £20 of margin a month, and the model versions that produced them

### Lifetime value and value at risk
Where: the same SQL file
1. Paste and run:
```sql
CREATE OR REPLACE TABLE CUSTOMER_VALUE AS
WITH k AS (
    -- nobody is certain to stay: floor the 3-month chance of leaving at 0.1%
    SELECT CUSTOMER_ID, GREATEST(CHURN_3M, 0.001) AS CHURN_3M, PREDICTED_MONTHLY_MARGIN_GBP AS MARGIN,
           POWER(1 - GREATEST(CHURN_3M, 0.001), 1 / 3) AS RETENTION,  -- chance of staying each month
           POWER(1.10, 1 / 12) - 1 AS DISCOUNT               -- 10% a year, monthly
    FROM BANKING_HOL.ML.RB_CUSTOMER_PREDICTIONS),
q AS (SELECT *, RETENTION / (1 + DISCOUNT) AS Q FROM k)
SELECT CUSTOMER_ID, CHURN_3M, ROUND(MARGIN, 2) AS MONTHLY_MARGIN_GBP,
       ROUND(1 / (1 - RETENTION) / 12, 1) AS EXPECTED_YEARS,
       -- 60 months of margin, each weighted by the chance they're still here and discounted
       ROUND(MARGIN * Q * (1 - POWER(Q, 60)) / (1 - Q)) AS LIFETIME_VALUE_GBP,
       -- what we expect to lose in the next 12 months: the value of customers worth keeping, times the chance they go
       ROUND(GREATEST(MARGIN * Q * (1 - POWER(Q, 60)) / (1 - Q), 0) * (1 - POWER(RETENTION, 12))) AS VALUE_AT_RISK_GBP
FROM q;
SELECT COUNT(*) AS CUSTOMERS, ROUND(MEDIAN(LIFETIME_VALUE_GBP)) AS MEDIAN_LTV, ROUND(AVG(LIFETIME_VALUE_GBP)) AS AVG_LTV,
       ROUND(SUM(LIFETIME_VALUE_GBP)) AS TOTAL_LTV, ROUND(SUM(VALUE_AT_RISK_GBP)) AS VALUE_AT_RISK
FROM CUSTOMER_VALUE;
```
Expect: a skewed picture. The median customer is worth a little over £100 over 5 years, the average several times that, and some are loss-making (a negative lifetime value). Value at risk counts only the customers worth keeping.

### Segments and next-best offers
Where: the same SQL file
High value is the top quarter by lifetime value; high risk is the fifth most likely to leave.

| | Low risk | High risk |
|---|---|---|
| **High value** | **Grow**: offer the next product | **Save now**: a named adviser calls |
| **Low value** | **Maintain** | **Serve digitally**: lower-cost channels |

The offer is a set of rules in priority order, using the signals DS1 found: a legacy saver gets a better rate, a falling salary gets support, a closing branch gets an introduction to digital and the next branch.
1. Paste and run:
```sql
CREATE OR REPLACE TABLE CUSTOMER_VALUE_SEGMENTS AS
WITH v AS (
    SELECT v.*, f.PRODUCTS_HELD, f.ON_LEGACY_SAVER, f.SALARY_TREND, f.DIGITAL_ACTIVE, f.BRANCH_AT_RISK, f.SAVINGS_BALANCE,
           v.LIFETIME_VALUE_GBP >= PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY v.LIFETIME_VALUE_GBP) OVER () AS HIGH_VALUE,
           v.CHURN_3M >= PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY v.CHURN_3M) OVER () AS HIGH_RISK
    FROM CUSTOMER_VALUE v JOIN BANKING_HOL.ML.RB_CHURN_FEATURES f USING (CUSTOMER_ID))
SELECT CUSTOMER_ID, LIFETIME_VALUE_GBP, VALUE_AT_RISK_GBP, CHURN_3M,
       CASE WHEN HIGH_VALUE AND HIGH_RISK THEN 'Save now'
            WHEN HIGH_VALUE THEN 'Grow'
            WHEN HIGH_RISK THEN 'Serve digitally'
            ELSE 'Maintain' END AS SEGMENT,
       CASE WHEN ON_LEGACY_SAVER = 1 THEN 'Move to a better savings rate'
            WHEN SALARY_TREND < 0.8 THEN 'Payment holiday or budgeting support'
            WHEN BRANCH_AT_RISK = 1 THEN 'Branch change: introduce digital and nearest branch'
            WHEN NOT DIGITAL_ACTIVE AND HIGH_RISK THEN 'App onboarding call'
            WHEN HIGH_VALUE AND HIGH_RISK THEN 'Retention call from a named adviser'
            WHEN HIGH_VALUE AND PRODUCTS_HELD <= 2 THEN 'Cross-sell: ISA or credit card'
            WHEN HIGH_VALUE AND SAVINGS_BALANCE >= 20000 THEN 'Premier upgrade'
            WHEN HIGH_VALUE THEN 'Thank-you: fee-free month'
            ELSE 'No action' END AS NEXT_BEST_OFFER
FROM v;
SELECT SEGMENT, COUNT(*) AS CUSTOMERS, ROUND(SUM(LIFETIME_VALUE_GBP)) AS LIFETIME_VALUE, ROUND(SUM(VALUE_AT_RISK_GBP)) AS VALUE_AT_RISK
FROM CUSTOMER_VALUE_SEGMENTS GROUP BY 1 ORDER BY VALUE_AT_RISK DESC;
```
Expect: **Save now** is a few percent of customers but holds about a third of the value at risk. That's the list to work first.

### The save list
Where: the same SQL file
1. Paste and run:
```sql
SELECT c.FIRST_NAME || ' ' || c.LAST_NAME AS CUSTOMER, c.CITY, v.LIFETIME_VALUE_GBP, v.VALUE_AT_RISK_GBP,
       ROUND(100 * v.CHURN_3M, 1) AS CHANCE_OF_LEAVING_PCT, v.NEXT_BEST_OFFER
FROM CUSTOMER_VALUE_SEGMENTS v JOIN BANKING_HOL.RAW_DATA.RB_CUSTOMERS c USING (CUSTOMER_ID)
WHERE v.SEGMENT = 'Save now'
ORDER BY v.VALUE_AT_RISK_GBP DESC LIMIT 20;
```
2. Ask Cortex Code for the picture:
```prompt
Using BANKING_HOL.ANALYTICS.CUSTOMER_VALUE_SEGMENTS, chart lifetime value against chance of leaving for every customer (log scale for lifetime value), coloured by SEGMENT, and add a bar chart of value at risk by SEGMENT and NEXT_BEST_OFFER. Explain in three sentences where the retention budget should go.
```

## Check your work
- `CUSTOMER_VALUE` has a lifetime value and value at risk for every customer in DS4's predictions
- `CUSTOMER_VALUE_SEGMENTS` puts every customer in one of four segments with an offer
- Your save list is ranked by value at risk

## In your bank
- **Agree the definition with finance.** Use the same customer profitability numbers finance reports, and agree the horizon and discount rate, so CVM and finance mean the same thing by "worth".
- **Rules first, then models.** A transparent offer policy is easy to approve and audit. Once campaigns record who took which offer, the data scientists can train a propensity model per offer and measure uplift.
- **Consumer Duty.** Value-based treatment must still give every customer fair value: check what the "Serve digitally" and "Maintain" segments are offered, and how vulnerable customers are treated.
- **Put it where people ask.** Add lifetime value and value at risk to a semantic view (DA2) so relationship managers can ask "who in my book is most at risk?" in plain English. DA6 does this with level of detail metrics, comparing every branch and neighbourhood with its city and the UK.
