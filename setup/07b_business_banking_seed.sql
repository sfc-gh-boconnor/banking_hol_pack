-- =====================================================
-- 07b: Business banking customers who pay cash in at a branch (DA3, and the
-- executive demo's branch closure stop). Small businesses, charities and
-- clubs, each with a home branch and 12 months of cash and cheque deposits.
--
-- All names are synthetic. Homes reuse RETAIL_CUSTOMERS H3 cells, so every
-- business has OpenRouteService travel times in BRANCH_CELL_TRAVEL. More
-- charities and clubs are planted around Barry (BR-CDF-90), the isolated
-- branch, so the closure story has a clear hardest case. Deterministic: the
-- same rows on every run.
-- =====================================================
USE SCHEMA BANKING_HOL.RETAIL;

CREATE OR REPLACE TABLE BUSINESS_CUSTOMERS
  COMMENT = 'Synthetic business banking customers (small businesses, charities, clubs) and their home branch'
AS
WITH homes AS (
    SELECT CUSTOMER_ID, CITY, HOME_LAT, HOME_LON, HOME_H3_CELL, HOME_BRANCH_ID,
           ABS(HASH(CUSTOMER_ID, 'business')) AS H
    FROM RETAIL_CUSTOMERS
),
picked AS (
    SELECT *, CASE
                WHEN HOME_BRANCH_ID = 'BR-CDF-90' THEN IFF(H % 10 < 3, 'SMALL_BUSINESS', IFF(H % 10 < 6, 'CHARITY', 'CLUB'))
                WHEN H % 10 < 6 THEN 'SMALL_BUSINESS' WHEN H % 10 < 8 THEN 'CHARITY' ELSE 'CLUB' END AS BUSINESS_TYPE
    FROM homes
    WHERE H % 1000 < 80 OR (HOME_BRANCH_ID = 'BR-CDF-90' AND H % 1000 < 400)
)
SELECT 'BB' || LPAD(ROW_NUMBER() OVER (ORDER BY CUSTOMER_ID), 5, '0') AS BUSINESS_ID,
       ARRAY_CONSTRUCT('High Street', 'Station Road', 'Mill Lane', 'Church Street', 'Riverside', 'Park Road',
                       'Victoria', 'Oakfield', 'St Mary''s', 'Westgate', 'Harbour', 'Greenway')[FLOOR(H / 7) % 12]::VARCHAR
       || ' ' ||
       CASE BUSINESS_TYPE
         WHEN 'SMALL_BUSINESS' THEN ARRAY_CONSTRUCT('Bakery', 'Hardware', 'Cafe', 'Florist', 'Butchers', 'Newsagent', 'Garage', 'Barbers')[FLOOR(H / 101) % 8]::VARCHAR
         WHEN 'CHARITY'        THEN ARRAY_CONSTRUCT('Food Bank', 'Hospice Shop', 'Animal Rescue', 'Community Trust', 'Lunch Club', 'Carers Centre')[FLOOR(H / 101) % 6]::VARCHAR
         ELSE                       ARRAY_CONSTRUCT('Cricket Club', 'Rugby Club', 'Scout Group', 'PTA', 'Bowls Club', 'Parish Church', 'Football Club')[FLOOR(H / 101) % 7]::VARCHAR
       END AS BUSINESS_NAME,
       BUSINESS_TYPE, CITY, HOME_LAT, HOME_LON, HOME_H3_CELL, HOME_BRANCH_ID,
       -- treasurers of charities and clubs are often volunteers who bank in person
       FLOOR(H / 13) % 10 >= CASE BUSINESS_TYPE WHEN 'SMALL_BUSINESS' THEN 3 WHEN 'CHARITY' THEN 5 ELSE 6 END AS TREASURER_DIGITAL,
       CASE BUSINESS_TYPE WHEN 'SMALL_BUSINESS' THEN 'weekly' ELSE 'monthly' END AS PAYING_IN_PATTERN
FROM picked;

CREATE OR REPLACE TABLE BUSINESS_CASH_DEPOSITS
  COMMENT = 'Synthetic cash and cheque deposits made at a branch counter, 12 months to 20 Nov 2026'
AS
WITH weeks AS (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS W FROM TABLE(GENERATOR(ROWCOUNT => 52)))
SELECT b.BUSINESS_ID, b.HOME_BRANCH_ID AS BRANCH_ID,
       DATEADD(day, -7 * w.W - ABS(HASH(b.BUSINESS_ID, w.W)) % 5, '2026-11-20'::DATE) AS DEPOSIT_DATE,
       ROUND(CASE b.BUSINESS_TYPE WHEN 'SMALL_BUSINESS' THEN 400 + ABS(HASH(b.BUSINESS_ID, w.W, 'c')) % 2400
                                  WHEN 'CHARITY'        THEN 250 + ABS(HASH(b.BUSINESS_ID, w.W, 'c')) % 1800
                                  ELSE                       150 + ABS(HASH(b.BUSINESS_ID, w.W, 'c')) % 1200 END) AS CASH_GBP,
       ROUND(IFF(ABS(HASH(b.BUSINESS_ID, w.W, 'q')) % 3 = 0, 50 + ABS(HASH(b.BUSINESS_ID, w.W, 'v')) % 900, 0)) AS CHEQUES_GBP
FROM BUSINESS_CUSTOMERS b
JOIN weeks w ON b.PAYING_IN_PATTERN = 'weekly' OR w.W % 4 = 0;

GRANT SELECT ON TABLE BUSINESS_CUSTOMERS TO ROLE HOL_PARTICIPANT;
GRANT SELECT ON TABLE BUSINESS_CASH_DEPOSITS TO ROLE HOL_PARTICIPANT;

SELECT BUSINESS_TYPE, COUNT(*) AS BUSINESSES, COUNT_IF(NOT TREASURER_DIGITAL) AS NOT_DIGITAL
FROM BUSINESS_CUSTOMERS GROUP BY 1 ORDER BY 1;
