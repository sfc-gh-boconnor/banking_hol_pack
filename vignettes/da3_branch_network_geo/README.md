# DA3: Branch network and catchment analysis

| | |
|---|---|
| **Persona** | Data Analyst (Retail Banking) |
| **Time** | ~45 min |
| **Prerequisites** | C1 only. Uses the retail branch network in `BANKING_HOL.RETAIL`, built at provisioning |

## Business question
> Which branches could we consolidate, which nearby branches would absorb their customers, and how much longer would those customers have to travel?

## What you'll build
- Notebook `da3_branch_network` with a network map, drive-time catchments and an H3 density map
- Table `CUSTOMER_NEAREST_BRANCH` (every customer's fastest and second-fastest branch by real drive time)
- Table `BRANCH_CLOSURE_IMPACT` (saving, footfall, added drive time, lost walk-in access and disruption risk per branch)
- Table `BUSINESS_CLOSURE_IMPACT` (the small businesses, charities and clubs that pay cash in at each branch, and how many a closure would leave more than 20 minutes from a counter)
- Streamlit app `BRANCH_NETWORK_MAP` with a real basemap: catchments, customer density and a closure what-if
- Semantic view `SV_BRANCH_NETWORK` and agent `BRANCH_NETWORK_ADVISOR` that answers consolidation questions in plain English

## Real travel times, not straight lines
Straight-line distance understates real journeys: rivers, one-way systems and motorways all change how far a branch really is. The retail data includes travel times from [OpenRouteService](https://openrouteservice.org/) (ORS), an open-source routing engine over OpenStreetMap roads:
- `BRANCH_CELL_TRAVEL`: drive and walk time and distance from every branch to every H3 cell (about 0.7 km²) around it, from the ORS **MATRIX** function
- `BRANCH_ISOCHRONES`: the area reachable from each branch within a 10 and 20 minute drive and a 15 minute walk, from the ORS **ISOCHRONES** function, stored as `GEOGRAPHY` polygons

These were precomputed once so the lab runs in any account.

**Compute your own:** OpenRouteService runs natively in Snowflake on Snowpark Container Services, so you can calculate travel times, isochrones and route optimisations for your own branches and customers without data leaving Snowflake. It exposes SQL functions such as `OPENROUTESERVICE_APP.CORE.MATRIX`, `ISOCHRONES`, `DIRECTIONS` and `OPTIMIZATION`. Module [DA4](../da4_ors_travel_matrix/) goes deeper into the matrix and how to build your own, following the quickstart [Build Routing Solution in Snowflake with Snowflake CoCo](https://www.snowflake.com/en/developers/guides/oss-install-openrouteservice-native-app/).

## Steps
### Open the starter notebook and create its service
Where: the **banking-hol-pack** Workspace (not My Workspace) > file explorer > `notebooks/da3_branch_network.ipynb`
Media: da3_notebook_service.mp4 | Open the notebook > Create new service > NOTEBOOK_POOL, 1 hour, HOL_NOTEBOOK_ACCESS_INTEGRATION
1. Open `notebooks/` > **da3_branch_network.ipynb** in the file explorer.
- Can't see `notebooks/` and `vignettes/`? You're in the wrong Workspace. Pick **banking-hol-pack** from the Workspace dropdown (top left).
2. In the notebook toolbar, click the arrow next to the status dot (right of the blue run button).
3. Choose **Create new service**.
- Already created one in another module? Pick it under **Select service** instead, usually `USER_SERVICE_1`.
4. Expand **Service settings** in **Connect your notebook** and fill it in as below. Only the three **bold** rows change.
| Setting | Value |
|---|---|
| Service name | leave the default (e.g. `USER_SERVICE_1`) |
| Artifact repositories | leave as is (`SNOWFLAKE.SNOWPARK.PYPI_SHARED_REPOSITORY`) |
| Enable distributed compute | off |
| Runtime | leave as is (v3.0 · Python 3.12) |
| Compute type | CPU |
| Custom image | leave empty |
| **Compute pool** | **NOTEBOOK_POOL** (change it from HOL_COMPUTE_POOL_CPU) |
| **Idle timeout** | **1 hour** (change it from 24 hours) |
| **External access integrations** | **HOL_NOTEBOOK_ACCESS_INTEGRATION** (lets notebooks reach Postgres and the AI Gateway; set it here so one service works for every notebook module) |
| Secrets | leave empty |
**Trial accounts:** there's no HOL_NOTEBOOK_ACCESS_INTEGRATION (trials don't allow external access). Leave **External access integrations** empty: this module works without it.
5. Click **Create and connect**. The first start takes 1-2 minutes.
6. Check the role is **HOL_PARTICIPANT** and the warehouse is **BANKING_WH** (role and warehouse button in the notebook toolbar).
The starter notebook has one numbered heading per step, so Cortex Code puts each cell in the right place.
A notebook runs on its own **notebook service**, which you create once.
You'll build the analysis as cells in this notebook: Cortex Code adds them, and you run each one.
The data is a synthetic UK retail network in `BANKING_HOL.RETAIL`:
- about 60 branches in 8 cities
- ATMs
- 20,000 retail customers, each with a home location and H3 cell
- a year of branch visits
- the ORS travel times and catchments described above
Expect: the starter notebook open in banking-hol-pack with its numbered headings, and the status dot showing the service connected

### Map the branch network
Where: the Cortex Code sidebar, with `da3_branch_network` open
```prompt
In the open notebook da3_branch_network, put each cell I ask for under its matching numbered heading. Under heading 1, add a SQL cell named network that returns every branch from BANKING_HOL.RETAIL.BRANCHES (BRANCH_NAME, CITY, FORMAT, LAT, LON) plus the standalone ATMs from BANKING_HOL.RETAIL.ATMS. Then add a Python cell that plots network as an altair map: LON on x, LAT on y, branches coloured by CITY and sized by FORMAT, ATMs as small grey points, with a tooltip showing the name. Run both.
```
Expect: a scatter map of the UK with clusters of branches around eight cities. Hover over a point to see the branch.

### Measure drive-time catchments
```prompt
Add a SQL cell named catchments that uses BANKING_HOL.RETAIL.BRANCH_ISOCHRONES (the driving-car rows, 10 and 20 minutes) to count how many customers in BANKING_HOL.RETAIL.RETAIL_CUSTOMERS live inside each branch's catchment, with ST_WITHIN(HOME_LOCATION, CATCHMENT) and only customers in the branch's own city. Also show each catchment's area in km2 with ST_AREA. Then add a Python cell that draws the 10 minute drive catchments for Leeds as altair polygons (convert CATCHMENT with ST_ASGEOJSON) with the Leeds branches on top. Run both and explain what an isochrone is.
```
Expect: a table of customers within 10 and 20 minutes of each branch, and a Leeds map where the city-centre catchments almost completely overlap. An isochrone follows the road network, so catchments are irregular shapes, not circles.

### Find each customer's fastest branch
```prompt
Add a SQL cell named nearest that creates the table BANKING_HOL.ANALYTICS.CUSTOMER_NEAREST_BRANCH: for every customer in BANKING_HOL.RETAIL.RETAIL_CUSTOMERS, the fastest and second-fastest branch in the same city by drive time, joining BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL on the customer's HOME_H3_CELL with PROFILE 'driving-car'. Columns: CUSTOMER_ID, CITY, AGE_BAND, SEGMENT, DIGITAL_ACTIVE, NEAREST_BRANCH_ID, NEAREST_DRIVE_MIN, NEAREST_DRIVE_KM, SECOND_BRANCH_ID, SECOND_DRIVE_MIN, and NEAREST_WALK_MIN (the shortest 'foot-walking' time to any branch). Run it and show the median drive and walk minutes per city.
```
Expect: all 20,000 customers, each with two branches. The median drive to a branch is about 7 minutes; walking times are much longer and vary more by city.
Check: da3_catchment

### Find overlapping branches
```prompt
Add a SQL cell named overlaps that finds pairs of branches in the same city whose 10 minute drive catchments in BANKING_HOL.RETAIL.BRANCH_ISOCHRONES overlap by 80% or more (area of ST_INTERSECTION divided by the smaller catchment), with the straight-line distance between them in km. Run it and explain why these pairs are consolidation candidates.
```
Expect: the Manchester, Glasgow and Leeds city-centre pairs at the top. Their customers can reach either branch in the same drive time.

### Map customer density with H3
```prompt
Add a SQL cell named density that counts BANKING_HOL.RETAIL.RETAIL_CUSTOMERS per HOME_H3_CELL (H3 resolution 8), returning each cell's centre LAT and LON from H3_CELL_TO_POINT, CITY and customer count. Then add a Python cell with an altair map of the cells for Cardiff, coloured by customer count, with the Cardiff branches from network layered on top. Run both.
```
Expect: a heat map of Cardiff with customers clustered around the city, and a separate pocket to the south-west around **Barry**, served by one branch. That's the branch that would be hardest to close.

### Model the closure impact
```prompt
Add a SQL cell named closure_impact that creates the table BANKING_HOL.ANALYTICS.BRANCH_CLOSURE_IMPACT from CUSTOMER_NEAREST_BRANCH, BANKING_HOL.RETAIL.BRANCHES, BANKING_HOL.RETAIL.BRANCH_VISITS and BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL. One row per branch: assume it closes and its customers move to their second-fastest branch. Columns: BRANCH_ID, BRANCH_NAME, CITY, FORMAT, ANNUAL_SAVING_GBP (the branch's ANNUAL_COST_GBP), VISITS_12M, COST_PER_VISIT_GBP, CUSTOMERS_AFFECTED, AVG_ADDED_DRIVE_MIN and P90_ADDED_DRIVE_MIN (SECOND_DRIVE_MIN minus NEAREST_DRIVE_MIN), LOSE_WALK_IN_ACCESS (customers within a 15 minute walk of the closing branch but not of the receiving branch, using the 'foot-walking' rows), VULNERABLE_CUSTOMERS (not digitally active or aged 75+), MAIN_RECEIVING_BRANCH (the most common second-fastest branch) and DISRUPTION_RISK (HIGH if P90_ADDED_DRIVE_MIN is 10 or more or VULNERABLE_CUSTOMERS is 200 or more, MEDIUM if P90_ADDED_DRIVE_MIN is 4 or more or LOSE_WALK_IN_ACCESS is 100 or more, otherwise LOW). Run it and list the 5 best candidates: LOW risk, highest cost per visit.
```
Expect: Leeds Boar Lane and Manchester King Street at the top: high cost, low footfall, and only a minute or two of extra driving. Barry is HIGH risk: a much longer drive for hundreds of vulnerable customers.
Check: da3_closure_impact

### Count the businesses who pay in at each branch
```prompt
Add a SQL cell named business_impact that creates the table BANKING_HOL.ANALYTICS.BUSINESS_CLOSURE_IMPACT from BANKING_HOL.RETAIL.BUSINESS_CUSTOMERS (small businesses, charities and clubs, each with a HOME_BRANCH_ID, HOME_H3_CELL and TREASURER_DIGITAL), BANKING_HOL.RETAIL.BUSINESS_CASH_DEPOSITS (CASH_GBP and CHEQUES_GBP paid in at the counter) and the 'driving-car' rows of BANKING_HOL.RETAIL.BRANCH_CELL_TRAVEL. One row per home branch: BRANCH_ID, BRANCH_NAME, CITY, BUSINESSES, SMALL_BUSINESSES, CHARITIES, CLUBS, TREASURER_NOT_DIGITAL, CASH_PAID_IN_12M_GBP, AVG_ADDED_DRIVE_MIN (drive to the fastest other branch minus drive to the home branch) and BUSINESSES_OVER_20_MIN (within 20 minutes of their home branch today, over 20 if it closed). Run it and list the 5 branches with the most businesses newly over 20 minutes.
```
Expect: **Barry** far ahead: over 200 businesses, most of them charities and clubs, paying in millions of pounds of cash a year, many with a treasurer who doesn't bank online. Leeds Boar Lane barely appears. The UK's largest high-street banks are designated under the FCA's access to cash rules (PS24/8), which require an assessment of cash deposit needs for business accounts as well as personal ones before a closure.
Check: da3_business_impact

### Build the semantic view
Where: the Cortex Code sidebar
```prompt
Create a semantic view BANKING_HOL.ANALYTICS.SV_BRANCH_NETWORK over BANKING_HOL.ANALYTICS.BRANCH_CLOSURE_IMPACT (logical table closures, primary key BRANCH_ID) and BANKING_HOL.ANALYTICS.CUSTOMER_NEAREST_BRANCH (logical table customers, primary key CUSTOMER_ID, related to closures on NEAREST_BRANCH_ID). Facts for saving, visits, cost per visit, added drive minutes, lost walk-in access and vulnerable customers; dimensions for branch name, city, format, disruption risk, receiving branch, age band, segment and digital active; metrics total_saving_gbp, branch_count, customer_count and avg_drive_min. Describe the travel times as OpenRouteService drive minutes. Add a verified query for "Which branches could close with the least added travel time?". Then query it with SEMANTIC_VIEW for total saving and branch count by city and disruption risk.
```
Expect: the semantic view created, and a table of savings by city and risk tier
Check: da3_semantic_view

### Build the branch network map app
Media: da3_create_streamlit.mp4 | + Add new > Streamlit App, then paste the map-app prompt into the Cortex Code panel
**Trial accounts:** this app installs its packages from PyPI, which needs external access, and trials don't allow it. Skip this step there; the rest of DA3 works.
Where: banking-hol-pack Workspace > **+ > Streamlit App**, then the Cortex Code sidebar
```prompt
Build a Streamlit in Snowflake app BANKING_HOL.ANALYTICS.BRANCH_NETWORK_MAP titled "Branch network map" on the container runtime (RUNTIME_NAME SYSTEM$ST_CONTAINER_RUNTIME_PY3_11, compute pool HOL_COMPUTE_POOL_CPU, query warehouse BANKING_WH, external access integration PYPI_ACCESS_INTEGRATION). Use st.connection("snowflake").session(). Include a pyproject.toml next to the app file with requires-python ">=3.11" and dependencies "streamlit>=1.50", "snowflake-snowpark-python" and "pydeck", because the container runtime installs them from PyPI. Sidebar: a city picker (default Leeds) from BANKING_HOL.RETAIL.BRANCHES (columns BRANCH_ID, BRANCH_NAME, CITY, FORMAT, LAT, LON), a catchment picker mapping "10 min drive", "20 min drive" and "15 min walk" to BRANCH_ISOCHRONES PROFILE/MINUTES values driving-car/10, driving-car/20 and foot-walking/15, and a customer density toggle. Draw one st.pydeck_chart with map_style "light" (a Carto basemap), centred on the mean LAT/LON of the city's branches at zoom 10.5, with three layers: a semi-transparent blue PolygonLayer of the city's BANKING_HOL.RETAIL.BRANCH_ISOCHRONES catchments (select ST_ASGEOJSON(CATCHMENT)::STRING, parse it with json, and take the outer ring of a Polygon or the first polygon of a MultiPolygon), an orange H3HexagonLayer of BANKING_HOL.RETAIL.RETAIL_CUSTOMERS counted by HOME_H3_CELL for the city with opacity scaled by count, and a dark blue ScatterplotLayer of branches (radius 180 m) on top. pydeck uses one tooltip template for all layers, so add a TIP text column to each layer's dataframe ("<BRANCH_NAME> (<FORMAT>)" for branches, "<BRANCH_NAME>: <catchment> catchment" for polygons, "<n> customers" for hexagons) and set tooltip={"text": "{TIP}"}. Below the map, show "What if a branch closes?" as a table from BANKING_HOL.ANALYTICS.BRANCH_CLOSURE_IMPACT for the city with BRANCH_NAME, ANNUAL_SAVING_GBP, COST_PER_VISIT_GBP, AVG_ADDED_DRIVE_MIN, P90_ADDED_DRIVE_MIN, LOSE_WALK_IN_ACCESS, VULNERABLE_CUSTOMERS, DISRUPTION_RISK and MAIN_RECEIVING_BRANCH, LOW risk first. Cache queries with st.cache_data.
```
Expect: a map of Leeds with streets underneath, overlapping blue catchments around Boar Lane and the city centre, orange customer hexagons and the closure table below. The first start takes a minute or two while the container starts. A reference version is in `da3_branch_map.py` and `pyproject.toml`. If the app reports a missing pyproject.toml, Streamlit version or snowflake module, ask Cortex Code to add that file with those dependencies and attach PYPI_ACCESS_INTEGRATION.
Check: da3_map_app
Notebook charts have no basemap, so this Streamlit app draws the network on a real map.

### Ask Cortex Analyst
Where: Snowsight > **AI & ML > Cortex Analyst** > `SV_BRANCH_NETWORK`
Media: da3_analyst.mp4 | AI > Analyst > BANKING_HOL.ANALYTICS > SV_BRANCH_NETWORK opens it in a Workspace
Ask these in plain English, one at a time:
1. "Which 3 branches in Manchester could close with the least added travel time?"
2. "How much could we save by closing all LOW risk branches with fewer than 500 visits?"
3. "Which branch closure would cost the most customers their walk-in access?"
Expect: SQL generated over the semantic view, and answers that match your notebook

### Create the branch network advisor agent
Where: banking-hol-pack Workspace > **+ > Agent** > **Create with CoCo** (recommended)
Media: da3_create_agent.mp4 | + Add new > Agent > name it branch_network_advisor > Create with CoCo > paste the brief
```prompt
Create a Cortex Agent BANKING_HOL.ANALYTICS.BRANCH_NETWORK_ADVISOR with display name "Branch Network Advisor" that advises a UK retail bank on its branch network. Tool: a Cortex Analyst tool Analyst on semantic view BANKING_HOL.ANALYTICS.SV_BRANCH_NETWORK, on warehouse BANKING_WH. Response instructions: for a consolidation question, return a ranked list of candidate branches with annual saving and cost per visit, the branch that absorbs their customers and the added drive time (average and p90 minutes), customers who lose walk-in access, the disruption risk and vulnerable customers affected, and a short 90-day transition plan. Never recommend closing a HIGH disruption-risk branch without saying why and what mitigation is needed. Sample questions: "What is the consolidation opportunity in Leeds?", "Which 3 branches could close with the least added travel time?", "Which branch would be hardest to close, and why?"
```
Expect: Cortex Code drafts the agent, you review it, and it's created. It appears in Snowsight under **AI & ML > Agents**.
Check: da3_agent

### Ask for a consolidation plan
Where: Snowsight > **AI & ML > Agents > BRANCH_NETWORK_ADVISOR**
Media: da3_agent_chat.mp4 | AI > Agent Studio > Branch Network Advisor > Preview, then paste the question
Paste: the **BRANCH_NETWORK_ADVISOR** agent chat (not the Cortex Code sidebar)
```prompt
What is the consolidation opportunity in Leeds? Give me the candidates, the saving, which branch absorbs the customers, the extra drive time, the risk, and a 90-day transition plan.
```
Expect: Leeds Boar Lane recommended, with about GBP 690,000 a year saved, customers moving to Leeds City Centre for a minute or two of extra driving, LOW risk and a phased 90-day plan. Then ask "Should we close Barry?" and see it explain the HIGH risk. Compare the answers with your map app.

## Check your work
`CUSTOMER_NEAREST_BRANCH` covers all 20,000 customers with drive times, `BRANCH_CLOSURE_IMPACT` ranks Leeds Boar Lane and Manchester King Street as the best LOW-risk candidates, and `BRANCH_NETWORK_ADVISOR` answers consolidation questions over `SV_BRANCH_NETWORK`.

## In your bank
The same pattern works on real data: geocode branch addresses to `GEOGRAPHY`, use customer postcode centroids, and run OpenRouteService on Snowpark Container Services for live travel times and catchments. Spatial joins, H3, routing and the agent all run in Snowflake, so customer locations never leave the governed platform.
