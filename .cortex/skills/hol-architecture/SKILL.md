---
name: hol-architecture
description: "Update the Banking HOL architecture diagram, its talking points, and the Lab Companion's top-level navigation (Labs, Architecture, Data map, Executive demo). Use whenever the platform the lab builds changes (a new module, layer, data product, AI surface or governance control), the diagram is out of date or wrong, the C2 data product tour or the Architecture page needs changing, or a top-bar section is added, renamed or reordered. Triggers: update the architecture, redraw the diagram, add DE5 to the diagram, architecture page, data product tour, add a tab to the header, navigation."
---

# Banking HOL: architecture diagram and navigation

The architecture has **two sources** and shows in four places. Edit only the sources; the rest is generated, so the guide, the Lab Companion and GitHub never drift apart.

| Source (edit these) | Shows in |
| --- | --- |
| `core/architecture.json`: lanes, items, module codes, governance | Lab Companion Architecture tab and Data map (`components/lab/architecture.tsx`, via `scripts/sync-content.mjs`), the guide's C2 page (HTML lanes from `guide/build_guide.py`), C2 on GitHub (a Mermaid block the builder writes between the `architecture:start` / `architecture:end` markers) |
| `core/C2_data_product_tour.md`, `## Talking points`: numbered `**Title.** body` lines | the guide's C2 page, the Architecture tab's cards |

Don't edit the Mermaid block in C2, `lib/content.generated.json` or `guide/index.html` by hand: the next build or sync overwrites them. Don't add diagram images: the tab is native React in the app's own style.

## Workflow

### 1. Work out what changed

Read `core/architecture.json` and C2, and list what the change touches. Typical changes: a new module (add its code to the item that it builds, or a new item in the right lane), a new data product, AI or app surface, a governance control. If a change would add or rename a lane, **⚠️ STOP** and confirm with the user first, because it changes the story every facilitator tells.

### 2. Edit core/architecture.json

- **Lanes** run in data-flow order: `lane` (one or two words), `icon` (a lucide-react name; add any new one to `ICONS` in `components/lab/architecture.tsx`), `summary` (one short line), `items`.
- **Items**: `name` (short), `detail` (one line, lower case), `modules` (codes that exist in the Lab Companion: each becomes a link chip).
- **Governance**: one band across every lane, with its own modules.
- Six lanes fit one row on wide screens; keep items to about four per lane so lanes stay level.

### 3. Edit the talking points (if the story changed)

In `core/C2_data_product_tour.md`, under `## Talking points`, keep each point on one line: `N. **Title.** Body.` The Architecture page parses that exact shape, and the sync fails if it finds none. The first plain paragraph after the C2 heading is the intro.

### 4. Regenerate and look

```bash
python3 guide/build_guide.py                       # guide/index.html, and the Mermaid block in C2
cd lab-companion && node scripts/sync-content.mjs  # lanes and talking points into the app
npx tsc --noEmit && npm run build                  # the Architecture page builds
```

Then **look at it**: `npx next start -p <free port>` and screenshot `/architecture` and `/data` with Playwright from `media/` (`chromium.launch({ channel: "chrome" })`), wide and phone width. Check:

- ✅ Lanes sit in one row on wide screens and stack with arrows on a phone; nothing overflows its card
- ✅ Each module the change concerns appears in the right lane, and its chip opens the module
- ✅ Talking points on the page match C2

### 5. Publish

Commit on the working branch, refresh the public repo (`git archive` into the public clone, never push private history), then:

- **Lab guide app** (every account): `snow sql -c <connection> -f setup/15_lab_guide.sql`
- **⚠️ STOP:** ask before redeploying the Lab Companion and which connection. Then as `HOL_ADMIN`: `ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH; CALL BANKING_HOL.LAB.DEPLOY_LAB_COMPANION();`

## Top-level navigation

The Lab Companion's top bar sections live in one list, `SECTIONS` in `lab-companion/components/header-nav.tsx`: label, link, and the paths that count as "in" that section (so the tab stays highlighted on sub-pages, e.g. Labs on `/module/*`). Order them by what attendees need first: the labs, then the big picture, then the detail, then the facilitator's demo.

To add a section: add a page under `lab-companion/app/<name>/page.tsx` (use `PageHeader` like `app/architecture/page.tsx`), add one entry to `SECTIONS`, and link it from the welcome panel (`components/lab/welcome.tsx`) if attendees should find it on day one. The logo always goes to Labs. Tabs show from `md` width up; keep labels to one or two words so four or five fit.

## Stopping points

- ✋ Step 1, before adding or renaming a lane
- ✋ Step 5, before redeploying the Lab Companion

## Output

What changed in the diagram and talking points, the screenshot check (pass or what was fixed), and where it was published (public repo commit, guide app, Lab Companion redeployed or not).
