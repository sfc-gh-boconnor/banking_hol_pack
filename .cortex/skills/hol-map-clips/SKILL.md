---
name: hol-map-clips
description: "Record step clips of the Snowsight notebook Map chart (Chart > Chart type: Map > Geo type Lat / Lon, Geography or H3 > Color by > Full screen) for Banking HOL lab steps, by having the user drive the clicks in a visible Playwright window while it records, then trimming the take. Use when a lab step turns a SQL result into a map, a map clip is missing or stale, or a module is being moved from Python/altair/pydeck/Streamlit maps to the notebook Map chart. Triggers: record a map clip, map video, geospatial clip, H3 map, catchment map, notebook map chart."
---

# Banking HOL: notebook map clips

The notebook result viewer's **Map** chart draws a SQL result on a basemap with no Python. Clips of it are recorded **by hand**: the viewer ignores synthetic Playwright clicks and remembers each cell's chart settings, so scripted runs were fragile. Instead, the user clicks in a visible recording window, and you trim the take.

General clip rules (size, naming, `Media:` lines, publishing) are in the `hol-step-clips` skill. This skill covers only what is different for maps.

## The Map chart (Nov 2026)

Under a SQL cell's results: **Table | Chart | Pivot** > **Chart** > **Chart type** dropdown > **Map**. Then:

| Geo type | Columns it asks for | Use for |
| --- | --- | --- |
| **Lat / Lon** | **Latitude**, **Longitude** (auto-picked from LAT/LON; cast to FLOAT in SQL) | points: branches, ATMs, risk |
| **Geography** | **Geography column** (a `GEOGRAPHY` column, returned unchanged) | polygons: isochrones, catchments |
| **H3** | **H3 column** (H3 cell id as text, e.g. `8819586929fffff`) | density hexagons |

Also there: **Color by** (numeric = Sequential, text = Categorical palette), **Show basemap**, **Opacity**, **Point radius**, **Fill**, **Stroke**. **Full screen** is the icon at the bottom right of the map.

## Workflow

### 1. Write the prompts, then build the cells for real

1. Each map step gets a SQL-only prompt that names the cell and its columns and ends with "Add no Python cell and no chart code. Run it." Return the location column in the form the Geo type expects (table above).
2. Build any tables the cells depend on in the test account (as `HOL_PARTICIPANT`), and say so in your report: they mark checks done there.
3. Run each prompt through the Cortex Code sidebar in the module's starter notebook, so the cells exist with real results. This also tests the prompt. Click **Allow** / **Keep all** when Cortex Code asks.

If the notebook is cluttered from earlier attempts, delete it in the Workspace (right-click > **Delete**), then copy the clean file back from the repo: `PUT` it to a temporary stage, then `ALTER WORKSPACE <ws> ADD LIVE VERSION FROM LAST`, `COPY FILES INTO 'snow://workspace/<ws>/versions/live/notebooks/' FROM @stage FILES=(...)` and `ALTER WORKSPACE <ws> COMMIT`. Find the Workspace with `SHOW WORKSPACES IN ACCOUNT` (DataOps accounts use `DEFAULT_DATABASE.PUBLIC."banking-hol-pack"`). After a fresh copy the notebook opens disconnected: use the service dropdown > **Connect kernel**.

### 2. One script per map

`media/scripts/<module>_map_<kind>.mjs`, using `mapRun` from `media/map_flow.mjs`:

```js
// DA3: the density results > Chart > Chart type: Map > Geo type: H3 > Color by. Recorded by hand.
import { mapRun } from "../map_flow.mjs"

export const name = "da3_map_h3"
export const viewport = { width: 1280, height: 800 }
export const outputWidth = 800
export const crop = undefined
export const run = mapRun({ notebook: "da3_branch_network", cell: "density", act: async () => {} })
```

### 3. Record one take per map, with the user driving

Run one take at a time. Never start a second recording while one is open: it reuses the same Chrome profile and the second launch fails.

```bash
cd media && DA3_MANUAL=1 npm run record -- <name> --headed     # run in the background
```

The window opens the notebook and comes to the front. Then tell the user:

**Get ready (not recorded):** scroll to the `<cell>` results. If the cell still shows a chart from an earlier take, set **Chart type** to **Bar chart**, then click **Table**. Say **ready**.

- On **ready**: `touch /tmp/da3_start` (recording starts here).

**Then (recorded), slowly:** **Chart** > **Chart type**: **Map** > **Geo type** > column > **Color by** > **Full screen**. Say **done**.

- On **done**: `touch /tmp/da3_done`. The script exits and writes `out/<name>.mp4` (the whole take).

**⚠️ STOP** after each take: trim and check it (Step 4) before starting the next one.

### 4. Trim and check

```bash
node trim.mjs <name> --sheet          # read out/<name>.sheet.png: 2 s per frame
node trim.mjs <name> 50-88            # keep 50-88 s; add more ranges to skip fiddling: 12-42 86-95.7
```

Pick the range from the first **Chart** click to a second or two after **Full screen**. Cut out pauses and re-dos. Then read `out/<name>.end.png`:

- ✅ the map is full screen with the step's Geo type, column and Color by visible in the panel
- ✅ the map shows the step's `Expect:` result (e.g. the Barry pocket, the overlapping Leeds catchments)
- ✅ under 500 KB (map clips land at 110-250 KB)

If the end frame is wrong, re-cut from the saved take (`out/<name>.take.mp4`) or redo the take.

### 5. Publish

1. `cp media/out/<name>.mp4 lab-companion/public/media/`
2. Put `Media: <name>.mp4 | Under the <cell> results > Chart > Chart type: Map > Geo type: <type> > Color by <column>` under the step's `Where:` line.
3. After the prompt, add the numbered map actions with the exact labels above, then `Expect:`.
4. Check the `Expect:` text against the data (query the table). Don't assume a distribution.
5. Run `cd lab-companion && node scripts/sync-content.mjs`, `npx tsc --noEmit` and `python3 guide/build_guide.py`.
6. Delete `out/<name>.take.mp4`, `.sheet.png` and `.end.png` when done.

**⚠️ STOP:** ask before redeploying the Lab Companion (see `hol-step-clips`).

## Gotchas

- **Synthetic clicks are ignored.** The result viewer's tabs only react to a real mouse move plus down and up (`click()` in `map_flow.mjs`), and plain `locator.click()` times out. This is why takes are driven by hand.
- **Chart settings stick.** Each cell remembers its chart type and settings between sessions, so reset to **Bar chart** then **Table** before every take.
- **Focus mode sticks.** Snowsight reopens notebooks in focus mode, which hides the Workspaces picker. `mapRun` clicks **Focus** to leave it.
- **The window can hide.** The recording window opens behind the user's own Chrome windows unless the script calls `page.bringToFront()`. Never let a setup failure close the window mid-take.

## Output

A table of the clips: name, size, step and whether the end frame passed. Then any step text that changed to match the real UI or data, and any objects left in the test account.
