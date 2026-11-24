# Snowsight UI map and quirks (as of Nov 2026)

Snowsight changes often. When a selector fails, check here, then probe the page, then update this file.

## Where things are

| Lab text may say | Actual path |
| --- | --- |
| AI & ML > Agents | **AI > Agent Studio** > agent row; chat is the **Preview** tab, monitoring is **Observability** |
| AI & ML > Cortex Analyst | **AI > Analyst** > database/schema picker > semantic view, which now opens an **Open semantic view in Workspaces** dialog (no chat) |
| AI & ML > CoWork | **AI > Snowflake CoWork** opens ai.snowflake.com in a **new tab** (separate sign-in) |
| AI & ML > Experiments / Models | **Machine learning > Experiments / Models** |
| Monitoring > Dynamic Tables | **Transformation > Dynamic tables** (needs a warehouse) |
| Catalog > Database Explorer | **Catalog > Explorer** (tree labels carry counts, e.g. `ANALYTICS (23)`; tab "Preview", not "Data Preview") |
| Monitoring > Spark > job > Trace / Logs | **Monitoring > Spark** (needs a warehouse) > Batch Jobs > job > **Details / Telemetry** |
| Data Products > Marketplace | **Marketplace > Snowflake Marketplace > Listings** ("Search providers and listings"); the Discover box is an AI chat |
| Dashboard > Share | Dashboard toolbar **Publish artifact** |

## Quirks

- **Iframes:** the Workspaces UI is in an iframe (`workspaceFrame(page)`); agent pages, Spark, Catalog and Analyst are on the main page.
- **Nav flyouts** open on hover; entries are links on Home but `role=option` inside Workspaces, so match by visible text. The flyout stays open until the mouse leaves.
- **One-off pop-ups** appear on first visit and block clicks: "New updates" (Agent Studio, Skip), "Agent readiness" tour (Close), "Go Beyond SQL with Notebooks", the dashboard "Welcome" tour, CoWork "Schedule a task..." (Try later), CoCo "CoCo mode (preview)". Close them when visible, don't assume them.
- **Remembered state:** the last workspace, Analyst schema, page warehouse, open tabs and CoCo chat persist between runs. A stale warehouse chip (e.g. an old `*_WH`) can appear; `selectWarehouse` replaces it.
- **List grids** (`role=row`) run cell text together with no spaces (`DT_RETRYABLE_SUMMARYActive`), so match the cell element whose own text is the name.
- **File tree** rows have no accessible name (match by text) and only render when scrolled into view; scroll the tree before looking for files at the bottom.
- **Deleting a file** shows a "Delete this file?" confirm inside the iframe; wait before closing the browser or the delete isn't saved.
- **Create with CoCo** (agents) sends its own first message and opens a chat with an "Add a follow up" box; paste into that chat, don't start a new one. The same applies to new dashboards (`/dashboard` chat).
- **New-file rename box** selects only "Untitled"; type the base name, not the extension.
- **Chat boxes:** agent Preview uses a textarea; CoWork uses a contenteditable div; hidden CoCo boxes are also in the DOM, so take the last *visible* one.
- **Multi-select lists** toggle on each click; Escape, Tab or an outside click clears the choice.
- **Experiments Compare** may show "Error loading runs"; the clip stops with runs ticked and Compare highlighted.
- **Notebook form** remembers the last choices; the default service name moves on (`USER_SERVICE_2`) once `USER_SERVICE_1` exists.
- **CoWork sessions** don't persist across browser restarts and the nav link opens a new tab the recorder can't film: use `--cowork`, which opens CoWork directly in the recorded page.
