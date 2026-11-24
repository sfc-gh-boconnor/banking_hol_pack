# DA4: Drive-time matrices with OpenRouteService

| | |
|---|---|
| **Persona** | Data Analyst (Retail Banking), advanced geospatial |
| **Time** | ~45 min |
| **Prerequisites** | DA3 recommended. Uses the drive-time matrix the lab ships in `BANKING_HOL.RETAIL`; nothing to install |

## Business question
> How do we answer "how far is each neighbourhood from a branch, and from the next one if it closes?" for every neighbourhood at once, from real roads, without customer locations leaving the bank?

## What you'll build
- A look inside the lab's drive-time matrix: what it holds, and how real roads differ from straight lines
- Table `MY_CLOSURE_LOOKUP`: for every neighbourhood, the nearest branch and the next nearest if it closed, the lookup behind the executive demo's closure map
- A ranking of branches by how many customers a closure would push past 20 minutes
- The case for the hexagon size: what a coarser grid hides

## Why a precomputed matrix
DA3 and the executive demo never call a routing engine while you click. Every drive time is a **lookup** in a table keyed by branch and H3 cell, built once with OpenRouteService (ORS). This is the pattern in [Snowflake H3: Precomputing Travel-Time Matrices](https://www.snowflake.com/en/blog/engineering/routing-inside-snowflake-h3-travel-time-matrix0/):
- Tessellate the area into H3 hexagons. Resolution 8 cells are about 0.7 km², a neighbourhood.
- Ask the routing engine for the travel time from each branch to every cell, in batches.
- Store the answers as a table. Queries then take milliseconds on a warehouse, with no routing engine running.

OpenRouteService runs **inside Snowflake** on Snowpark Container Services, over OpenStreetMap roads, so customer locations never leave the account. It is set up once per account by an admin, which is why the lab ships the matrix ready-made: see [How the matrix was built](#how-the-matrix-was-built) to do it yourself.

## Steps
### Look inside the matrix
Where: Snowsight > Projects > Workspaces > + Add new > SQL File, role HOL_PARTICIPANT, warehouse BANKING_WH
1. Paste and run:
```sql
USE SCHEMA BANKING_HOL.ANALYTICS;
SELECT b.CITY, COUNT(DISTINCT t.BRANCH_ID) AS BRANCHES, COUNT(DISTINCT t.H3_CELL) AS CELLS, COUNT(*) AS PAIRS,
       ROUND(MEDIAN(t.DURATION_S) / 60, 1) AS MEDIAN_DRIVE_MIN
FROM BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL t JOIN BANKING_HOL.RETAIL.BRANCHES b USING (BRANCH_ID)
WHERE t.PROFILE = 'driving-car' GROUP BY 1 ORDER BY PAIRS DESC;
```
Expect: 8 cities. Every branch in a city has a drive time to every cell around it, so London alone has about 35,000 pairs.

### Real roads, not straight lines
Where: the same SQL file
1. Pick the neighbourhood around Manchester city centre and see how far each branch really is:
```sql
SELECT b.BRANCH_NAME, ROUND(t.DURATION_S / 60, 1) AS DRIVE_MIN, ROUND(t.DISTANCE_M / 1000, 1) AS ROAD_KM,
       ROUND(ST_DISTANCE(b.LOCATION, H3_CELL_TO_POINT(t.H3_CELL)) / 1000, 1) AS STRAIGHT_LINE_KM
FROM BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL t JOIN BANKING_HOL.RETAIL.BRANCHES b USING (BRANCH_ID)
WHERE t.PROFILE = 'driving-car' AND t.H3_CELL = H3_LATLNG_TO_CELL_STRING(53.4794, -2.2453, 8)
ORDER BY DRIVE_MIN;
```
Expect: road distances well above the straight line. Altrincham is about 12 km away as the crow flies but nearly 20 km by road.

### Build the closure lookup
Where: the same SQL file
This is the question the executive demo answers when you click a hexagon: how far is the nearest branch, and how far is the next one if it closes?
1. Rank every branch for every cell, and keep the first two:
```sql
CREATE OR REPLACE TABLE MY_CLOSURE_LOOKUP AS
WITH d AS (SELECT t.H3_CELL, t.BRANCH_ID, b.CITY, t.DURATION_S / 60 AS MINS,
                  ROW_NUMBER() OVER (PARTITION BY t.H3_CELL ORDER BY t.DURATION_S) AS RANK
           FROM BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL t JOIN BANKING_HOL.RETAIL.BRANCHES b USING (BRANCH_ID)
           WHERE t.PROFILE = 'driving-car')
SELECT H3_CELL, ANY_VALUE(CITY) AS CITY,
       MAX(IFF(RANK = 1, BRANCH_ID, NULL)) AS NEAREST_BRANCH,
       MAX(IFF(RANK = 1, MINS, NULL)) AS NEAREST_MIN,
       MAX(IFF(RANK = 2, BRANCH_ID, NULL)) AS NEXT_BRANCH,
       MAX(IFF(RANK = 2, MINS, NULL)) AS NEXT_MIN
FROM d GROUP BY 1;
```

### Which closures cut customers off
Where: the same SQL file
1. Put customers on the grid and count who a closure would push past 20 minutes:
```sql
SELECT l.NEAREST_BRANCH, b.BRANCH_NAME, COUNT(c.CUSTOMER_ID) AS CUSTOMERS,
       COUNT_IF(c.CUSTOMER_ID IS NOT NULL AND l.NEAREST_MIN <= 20 AND COALESCE(l.NEXT_MIN, 999) > 20) AS CUSTOMERS_CUT_OFF,
       ROUND(AVG(l.NEXT_MIN - l.NEAREST_MIN), 1) AS AVG_EXTRA_MIN
FROM MY_CLOSURE_LOOKUP l
JOIN BANKING_HOL.RETAIL.BRANCHES b ON b.BRANCH_ID = l.NEAREST_BRANCH
LEFT JOIN BANKING_HOL.RAW_DATA.RB_CUSTOMERS c ON H3_LATLNG_TO_CELL_STRING(c.HOME_LAT, c.HOME_LON, 8) = l.H3_CELL
GROUP BY 1, 2 ORDER BY CUSTOMERS_CUT_OFF DESC LIMIT 10;
```
Expect: a few branches stand out, such as Birmingham West Bromwich, where a closure would leave around 300 customers more than 20 minutes from a branch.
2. Ask Cortex Code to map it:
```prompt
Using BANKING_HOL.ANALYTICS.MY_CLOSURE_LOOKUP, add a Streamlit page with a pydeck H3HexagonLayer for one city, coloured by NEXT_MIN - NEAREST_MIN (the extra drive if the nearest branch closed), with the branches as points and a tooltip showing both branches and both times.
```

### Why the hexagon size matters
Where: the same SQL file
1. Roll the neighbourhood cells up to the next size up (res 7, about 5 km²) and see how much the drive time varies inside one:
```sql
WITH r7 AS (SELECT H3_CELL_TO_PARENT(H3_CELL, 7) AS H3_7, NEAREST_MIN FROM MY_CLOSURE_LOOKUP)
SELECT COUNT(DISTINCT H3_7) AS RES7_CELLS, (SELECT COUNT(*) FROM MY_CLOSURE_LOOKUP) AS RES8_CELLS,
       ROUND(AVG(SPREAD), 1) AS AVG_SPREAD_MIN, ROUND(MAX(SPREAD), 1) AS MAX_SPREAD_MIN
FROM (SELECT H3_7, MAX(NEAREST_MIN) - MIN(NEAREST_MIN) AS SPREAD FROM r7 GROUP BY 1);
```
Expect: drive times inside a single res-7 hexagon differ by about 5 minutes on average, and far more at the edges. That is why the demo map switches to res 8 as you zoom in: a 20-minute rule needs neighbourhood-sized cells.

## How the matrix was built
The lab's matrix was made once with the OpenRouteService routing engine, then shipped as seed data so every attendee account works without it. To build your own:
1. **Install the engine** (an account admin, once per account), following [Build Routing Solution in Snowflake with Snowflake CoCo](https://www.snowflake.com/en/developers/guides/oss-install-openrouteservice-native-app/). This needs Cortex Code Desktop or the CLI on a laptop with Docker or Podman, because it pushes container images to the account. It can't be done from Snowsight.
2. **Add your map region** in SQL, for example `CALL OPENROUTESERVICE_APP.CORE.START_REGION_PROVISION('Manchester', 'Manchester', 'driving-car')`. A city builds in about 30 minutes.
3. **Make a grid** of H3 cells around your branches with `H3_GRID_DISK`.
4. **Call `OPENROUTESERVICE_APP.CORE.MATRIX`** with the branches as sources and a batch of a few hundred cells as destinations, then unpack its `durations` and `distances` arrays into one row per branch and cell. `da4.sql` has the full statements, tested against a Manchester region: they reproduce the lab's matrix to within 0.03 minutes.
5. **Rebuild on a schedule**, not per click: when branches open or close, or the road map is refreshed.

## Check your work
- `MY_CLOSURE_LOOKUP` has a row for every cell in the matrix, with a nearest and (almost always) a next nearest branch
- Your ranking names the branches whose closure would push the most customers past 20 minutes
- You can say why the demo uses res 8 hexagons when zoomed in

## In your bank
- **Your branches, your roads.** Build the matrix for your own branch list and choose the profiles: driving, walking, and HGV for cash logistics.
- **Precompute, then look up.** Analysts, agents and apps read the table; only the rebuild needs the routing engine.
- **Resolution where it matters.** Use res 8 for neighbourhood rules such as a 20-minute drive, and store res 7 alongside it for city views.
- **Governed like any other data.** Customer home locations stay in Snowflake under your masking and row access policies; only cell centres are sent to the routing engine, inside the account.
