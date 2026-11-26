# DA4: Drive-time matrices with OpenRouteService

| | |
|---|---|
| **Persona** | Data Analyst (Retail Banking), advanced geospatial |
| **Time** | ~45 min |
| **Prerequisites** | DA3 recommended. Uses the drive-time matrix the lab ships in `BANKING_HOL.RETAIL`; nothing to install |

## Business question
> How do we answer "how far is each neighbourhood from a branch, and from the next one if it closes?" for every neighbourhood at once, from real roads, without customer locations leaving the bank?

## What you'll build
- Five maps drawn straight from your SQL results (Chart > Map): one branch's reach, branch catchments, the extra drive if a branch closes, who gets cut off, and the cost of a coarse grid
- A look inside the lab's drive-time matrix: what it holds, and how real roads differ from straight lines
- Table `MY_CLOSURE_LOOKUP`: for every neighbourhood, the nearest branch and the next nearest if it closed, the lookup behind the executive demo's closure map
- A ranking of branches by how many customers a closure would push past 20 minutes
- The case for the hexagon size: what a coarser grid hides

## How the drive times were made
Snowflake built this matrix for you, inside Snowflake, so no customer location left the account.
- **The routing engine** is OpenRouteService (ORS), an open-source engine that runs in a container on Snowpark Container Services
- **The roads** are OpenStreetMap, loaded into the same account
- **The method** is to ask ORS for the drive time from every branch to every neighbourhood hexagon (H3 resolution 8, about 0.7 km²), in batches, and store the answers as a table
- **The result** is `BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL`, one row per branch, hexagon and travel profile

Every question in this module is then a lookup on that table. Nothing calls the routing engine while you click, so answers take milliseconds on a warehouse.

Want to build it for your own branches? Follow the quickstart: [Build Routing Solution in Snowflake with Snowflake CoCo](https://www.snowflake.com/en/developers/guides/oss-install-openrouteservice-native-app/).
For the pattern behind it, read [Snowflake H3: Precomputing Travel-Time Matrices](https://www.snowflake.com/en/blog/engineering/routing-inside-snowflake-h3-travel-time-matrix0/).

## Steps
Each step ends in a map, so you can see the answer before you read the numbers.
Every map uses the same click path under the results: **Chart** > **Chart type**: **Map** > **Geo type** > **Color by**.

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
Expect: 8 cities. Every branch in a city has a drive time to every hexagon around it, so London alone has about 35,000 pairs.

### See one branch's reach
Where: the same SQL file
Before any ranking, look at what one row of the matrix means: how far every neighbourhood is from a single branch.
1. Paste and run:
```sql
SELECT t.H3_CELL, ROUND(t.DURATION_S / 60, 1) AS DRIVE_MIN
FROM BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL t
WHERE t.PROFILE = 'driving-car' AND t.BRANCH_ID = 'BR-MAN-04';
```
2. Under the results, click **Chart**.
3. Set **Chart type** to **Map**.
4. Set **Geo type** to **H3** and check **H3 column** is **H3_CELL**.
5. Set **Color by** to **DRIVE_MIN**.
Expect: about 2,100 hexagons across Greater Manchester. The colour is darkest next to **Manchester Altrincham** and fades with every minute of driving, following the roads rather than a circle.
Tip: use the mouse wheel to zoom in on Altrincham.

### Real roads, not straight lines
Where: the same SQL file
1. Pick the neighbourhood around Manchester city centre and see how far each branch really is:
```sql
SELECT b.BRANCH_NAME, ROUND(t.DURATION_S / 60, 1) AS DRIVE_MIN, ROUND(t.DISTANCE_M / 1000, 1) AS ROAD_KM,
       ROUND(ST_DISTANCE(b.LOCATION, H3_CELL_TO_POINT(t.H3_CELL)) / 1000, 1) AS STRAIGHT_LINE_KM,
       ST_Y(b.LOCATION)::FLOAT AS LAT, ST_X(b.LOCATION)::FLOAT AS LON
FROM BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL t JOIN BANKING_HOL.RETAIL.BRANCHES b USING (BRANCH_ID)
WHERE t.PROFILE = 'driving-car' AND t.H3_CELL = H3_LATLNG_TO_CELL_STRING(53.4794, -2.2453, 8)
ORDER BY DRIVE_MIN;
```
2. Under the results, click **Chart** and set **Chart type** to **Map**.
3. Check **Geo type** is **Lat / Lon**, with **LAT** as latitude and **LON** as longitude.
4. Set **Color by** to **DRIVE_MIN**.
Expect: road distances well above the straight line. Altrincham is about 12 km away as the crow flies but nearly 20 km by road.
On the map, the branches are points coloured by drive time from the city centre.

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
Expect: one row for each of about 12,400 neighbourhoods, with its nearest branch and the one customers would drive to if it closed
Check: da4_lookup

### Map each branch's catchment
Where: the same SQL file
Each hexagon belongs to the branch that is quickest to reach by road. Colour by branch and the catchments appear.
1. Paste and run:
```sql
SELECT H3_CELL, NEAREST_BRANCH, ROUND(NEAREST_MIN, 1) AS NEAREST_MIN
FROM MY_CLOSURE_LOOKUP WHERE CITY = 'Manchester';
```
2. Under the results, click **Chart** and set **Chart type** to **Map**.
3. Set **Geo type** to **H3** and check **H3 column** is **H3_CELL**.
4. Set **Color by** to **NEAREST_BRANCH**.
Expect: Manchester split into 8 coloured catchments, one per branch, with irregular edges that follow the roads and rivers.
Tip: switch **Color by** to **NEAREST_MIN** to see the places furthest from any branch.

### Map the extra drive if a branch closes
Where: the same SQL file
Now colour each hexagon by how much longer the journey gets if its nearest branch closed.
1. Paste and run:
```sql
SELECT H3_CELL, NEAREST_BRANCH, NEXT_BRANCH, ROUND(NEXT_MIN - NEAREST_MIN, 1) AS EXTRA_MIN
FROM MY_CLOSURE_LOOKUP WHERE CITY = 'Birmingham';
```
2. Under the results, click **Chart** and set **Chart type** to **Map**.
3. Set **Geo type** to **H3** and check **H3 column** is **H3_CELL**.
4. Set **Color by** to **EXTRA_MIN**.
Expect: the city centre stays pale, because another branch is only minutes away. The edges are dark, where one closure would add 15 minutes or more.
This is the picture an executive wants before a closure decision.

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
Check: da4_cut_off

### Map who gets cut off
Where: the same SQL file
Zoom in on the branch at the top of your ranking.
1. Paste and run:
```sql
SELECT H3_CELL, ROUND(NEXT_MIN, 1) AS DRIVE_IF_CLOSED_MIN
FROM MY_CLOSURE_LOOKUP WHERE NEAREST_BRANCH = 'BR-BHM-06';
```
2. Under the results, click **Chart** and set **Chart type** to **Map**.
3. Set **Geo type** to **H3** and check **H3 column** is **H3_CELL**.
4. Set **Color by** to **DRIVE_IF_CLOSED_MIN**.
Expect: the 397 neighbourhoods that West Bromwich serves today. Most are over 20 minutes from the next branch, and the darkest are over 40.
Tip: a coloured hexagon is a neighbourhood, not a customer. The count in the previous step puts customers on these hexagons.

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
2. Now see where the coarse grid hides the detail:
```sql
SELECT H3_CELL_TO_PARENT(H3_CELL, 7) AS H3_7, ROUND(MAX(NEAREST_MIN) - MIN(NEAREST_MIN), 1) AS SPREAD_MIN
FROM MY_CLOSURE_LOOKUP WHERE CITY = 'Manchester' GROUP BY 1;
```
3. Under the results, click **Chart** and set **Chart type** to **Map**.
4. Set **Geo type** to **H3** and check **H3 column** is **H3_7**.
5. Set **Color by** to **SPREAD_MIN**.
Expect: Manchester in larger hexagons. The darker ones hide neighbourhoods with very different drive times, which a single average per hexagon would blur.

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
- You have drawn the closure map for Birmingham and can point to the neighbourhoods a closure would hurt most
- You can say why the demo uses res 8 hexagons when zoomed in

## In your bank
- **Your branches, your roads.** Build the matrix for your own branch list and choose the profiles: driving, walking, and HGV for cash logistics.
- **Precompute, then look up.** Analysts, agents and apps read the table; only the rebuild needs the routing engine.
- **Resolution where it matters.** Use res 8 for neighbourhood rules such as a 20-minute drive, and store res 7 alongside it for city views.
- **Governed like any other data.** Customer home locations stay in Snowflake under your masking and row access policies; only cell centres are sent to the routing engine, inside the account.
