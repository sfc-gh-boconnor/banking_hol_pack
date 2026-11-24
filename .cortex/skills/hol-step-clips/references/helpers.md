# Recorder helpers

All in `media/`. `lib.mjs` opens the browser and highlights; `snowsight.mjs` has single UI steps; `flows.mjs` has whole-clip `run` functions built from them. Each step highlights what it clicks, so it works after `mark()` (on camera) or before it (silent setup).

## Steps (`snowsight.mjs`)

| Step | What it does |
| --- | --- |
| `switchTo(page, "Home" \| "CoCo")` | Home/CoCo toggle; closes the CoCo preview pop-up |
| `navTo(page, group, item?)` | Left nav group > flyout item (e.g. `"Monitoring", "Spark"`); skips the one-off "New updates" tour |
| `openWorkspace(page, name, { fresh })` | Workspaces > picker; `fresh: true` goes to My Workspace |
| `closeAllTabs(page)` | Close every editor tab (setup) |
| `closeFolder` / `openFile` / `openNotebook` | File tree: collapse a folder, open a file, open a starter notebook |
| `workspaceAdd(page, entry)` | `+ Add new` > Agent / Streamlit App / Semantic view / Dashboard / ... |
| `nameNewFile(page, base)` | Type the base name into the rename box a new file opens with |
| `deleteFiles(page, prefix)` | Delete top-level Workspace files by name prefix (setup/cleanup) |
| `createNotebookService(page, opts)` | Service dropdown > Create new service > pool, idle, integration; cancels |
| `pickOption` / `pickMulti` | Single and multi-select form dropdowns |
| `pasteIntoCocoSidebar(page, prompt, { newChat })` | Cortex Code panel > New chat (or the open chat with `newChat: false`) > paste |
| `selectWarehouse(page, wh?)` | "Select warehouse" (or a stale warehouse chip) > BANKING_WH |
| `openListItem(page, text)` | Click a row in a list grid by its name |
| `openTab(page, name)` | Click a tab on an object page |
| `fillChat(page, text)` | Fill the last visible chat box (textarea or contenteditable), not sent |

## Flows (`flows.mjs`)

| Flow | Clip it makes |
| --- | --- |
| `promptOf(moduleDir, stepTitle, n?)` | The n-th ```prompt block under a README step (use for every pasted prompt) |
| `cocoSessionRun(prompt)` | CoCo tab > New session > paste into "How can I help?" |
| `cocoAutomationsRun()` | CoCo tab > Automations |
| `workspaceAddRun(entry, { workspace, after, prompt, sameChat })` | Workspace > + Add new > entry, optional after-step, optional sidebar prompt |
| `createAgentRun(fileBase, brief)` | + Add new > Agent > name > Create with CoCo > paste brief into its chat |
| `navRun(group, item, { warehouse, before, tree, open, tab, chat, then })` | Any nav page: warehouse, Catalog tree path, list row, tabs, chat |
| `agentChatRun(display, question)` / `agentTabRun(display, tab)` | Agent Studio > agent > Preview chat / any tab (closes the readiness tour) |
| `coworkRun(agent, question, { deepResearch })` | CoWork > pick agent > optional + > Deep Research > question (record with `--cowork`) |
| `app1Run(action, { prompt })` | My Workspace Streamlit app > Run / Settings / Share / Deploy, or a sidebar prompt |
| `dashboardShareRun(fileBase)` | Open a dashboard > Publish artifact > add role > highlight, close |
| `notebookServiceRun(name)` (`notebook_service.mjs`) | Open a starter notebook > create its service; cancels |

After-steps for `navRun` / `workspaceAddRun`: `nameAfter(base)`, `dashboardAfter(base)`, `streamlitForm(title)`, `analystDatabase`, `analystOpenDialog`, `compareRuns`, `marketplaceSearch(text)`.

## Writing a new flow

- Keep it parameterised by the module's object (file name, agent, prompt), so each module's clip is a one-liner.
- Do resets before `mark()`; put only the attendee's clicks after it.
- End on the screen the step describes, then let `record.mjs` hold it for 1.2 s.
- Make optional UI tolerant: check `isVisible()` before closing a pop-up or picking a remembered value, so the same flow works on first and later runs.
