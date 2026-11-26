---
name: hol-step-clips
description: "Record, re-record, audit or add the short looping MP4 screen recordings (step clips) that play in the Banking HOL Lab Companion for Snowsight and CoWork UI steps: opening the Workspace, notebooks and notebook services, + Add new (Agent, Streamlit, Semantic view, Dashboard), Agent Studio, Cortex Analyst, CoWork, Monitoring > Spark, dynamic tables, Catalog lineage, ML experiments and models, Marketplace, Cortex Code sessions and automations. Use whenever a lab step needs a video, animation, GIF, screen recording or walkthrough; a clip is stale, shows the wrong module or old names; Snowsight's UI changed; or the user asks which steps still lack clips. Triggers: record a clip, screen recording, redo the videos, mp4 for this step, add a video, clip is out of date."
---

# Banking HOL: step clips

Clips are Playwright recordings of the real Snowsight UI, made against a test account (`media/config.json`), trimmed and encoded by `media/record.mjs`, and shown in the Lab Companion through a `Media:` line in the module README. Each clip answers one question for a first-time attendee: *where do I click?*

## Principles (and why)

- **One step, one screen path.** A clip shows the clicks for one step and stops on the screen the step's `Expect:` describes. Attendees watch it next to the text, so anything longer stops being glanceable.
- **Show the attendee's own object.** If the module's notebook, agent, file or question is on screen, that module gets its own clip (e.g. `ai1_create_agent` and `ops1_create_agent` are separate). A clip showing another module's name confuses people more than no clip.
- **Start from a first-time state.** Everything before `mark()` is cut, so do setup there: close tabs, collapse folders, delete files earlier recordings left, pick a remembered workspace. Snowsight remembers a lot (last workspace, schema, warehouse, chat), so never assume a clean page.
- **Never change the account on camera.** Highlight, don't press, anything that starts compute, sends a prompt or creates/publishes for real (Create and connect, Execute, Send, Run, Deploy, Create, Save grants, Publish). Fill forms, then Cancel or Escape. Prompts are pasted (`fill`), never typed or sent. This keeps clips reproducible and the test account stable.
- **Highlight every click** (`clickWithHighlight`), so the viewer sees what is about to happen.
- **Small and focused.** MP4 only, 1024x640 browser, 720 px output, 10 fps, under 500 KB (most land at 40-180 KB). Crop to the panel when the action sits in one menu or dialog.
- **Real UI over the lab text.** When the UI no longer matches a step (a menu renamed, a tab moved), record the real path and report the wording mismatch; don't record around it.

## Workflow

### 1. Decide what needs a clip

**Ask** (or infer from the request) which modules or steps are in scope. For an audit across the lab, use a read-only subagent to list every step in `core/*_README.md` and `vignettes/*/README.md` whose instructions are UI actions (not just SQL or a sidebar prompt), with whether it has a `Media:` line. Group steps that share a click path, but keep one clip per module where its object is visible.

Steps that show something the attendee built earlier (an agent's chat, a model, a deployed app) need that object to exist in the test account. **If any do:**

**⚠️ STOP:** ask whether to build the reference objects in the test account (the module's own `vignettes/<module>/*.sql`, or a catch-up via `CALL BANKING_HOL.LAB.RUN_CATCHUP('<name>')` as `HOL_PARTICIPANT`, see the `hol-catchup` skill), record navigation only, or skip those steps. Building them marks those steps done in Check my work on that account.

### 2. Sign in

```bash
cd media && npm run login            # Snowsight; the window closes when it loads
```

Sign in again when a recording fails on a sign-in or "Session expired" page. **CoWork** (ai.snowflake.com) has its own sign-in that does not survive a browser restart: record CoWork clips with `--cowork` (Step 4), which asks the user to sign in once per run.

### 3. Write the script

**Load** `references/helpers.md` for the step functions and flows. **Load** `references/snowsight-ui.md` when the screen is new to you or a selector fails.

A script in `media/scripts/<module>_<what>.mjs` exports `name`, `viewport`, `outputWidth`, `crop` and `run`. Prefer a one-line call to a shared flow in `media/flows.mjs`, and read prompts from the README with `promptOf(module, stepTitle)` so clips never drift from the guide:

```js
// OPS1: + Add new > Agent > name it corporate_payments_360 > Create with CoCo > paste the brief.
import { createAgentRun, promptOf } from "../flows.mjs"

export const name = "ops1_create_agent"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = createAgentRun("corporate_payments_360", promptOf("ops1_payments_360_agent", "Create the agent"))
```

**New screen?** Probe before writing: a throwaway script that opens the page and writes `page.screenshot()` plus the visible buttons, tabs, rows and inputs (with their roles and labels) to `/tmp`. One probe is cheaper than five failed recordings. Put any new reusable step into `snowsight.mjs` or `flows.mjs` with a comment on the quirk it handles, so the next clip gets it for free.

### 4. Record

```bash
npm run record -- <name> [<name>...]          # headless, one fresh browser per clip
npm run record -- <name> --headed             # watch it while fixing selectors
npm run record -- <names...> --cowork         # CoWork: one visible browser, user signs in once
```

On `FAILED`, read `out/<name>.failed.png` and the `.mjs:` line in the error. The screenshot almost always shows the cause: a one-off pop-up or tour, a remembered selection, a renamed tab, a list still loading. Fix the shared step, not just this script. Retry a flaky clip once; if it fails twice, it's a real selector problem.

**Clips that create files** (agents, semantic views, dashboards) leave them in the Workspace, and the agent-creation chat can re-save them after deletion. The Workspace flows delete earlier clips' files during setup; after a batch also run:

```bash
node cleanup.mjs <file-prefix> [<file-prefix>...]   # e.g. corporate_payments_360 payments_ops
```

### 5. Check every clip

Size is printed by the recorder (`TOO BIG` over 500 KB: crop or shorten). Then **look at the end frame**; a clip that "passed" can still show the wrong thing:

```bash
ffmpeg -loglevel error -y -sseof -2 -i out/<name>.mp4 -frames:v 1 /tmp/<name>_end.png
# several at once: ffmpeg -i a.png -i b.png -i c.png -filter_complex "[0][1][2]hstack=3,scale=1800:-1" /tmp/grid.png
```

**Validation checklist** (re-record if any fails):
- ✅ The end state matches the step's `Expect:` / `Where:` text
- ✅ Only this module's names are on screen (no other modules' files, agents or prompts)
- ✅ No loading spinners, pop-ups or tours covering the action
- ✅ Nothing was pressed that changes the account
- ✅ No old names (e.g. previous product or customer names) anywhere in frame

### 6. Publish

1. `cp media/out/<name>.mp4 lab-companion/public/media/`
2. Under the step heading (after its `Where:` line): `Media: <name>.mp4 | <click path, one line>`
3. `cd lab-companion && node scripts/sync-content.mjs` (fails if a referenced clip is missing)
4. Commit, push to the private branch and refresh the public repo (see the `banking-hol-event` / publish notes in project memory: `git archive` into the public clone, never push private history).

**⚠️ STOP:** ask before redeploying, and which `snow` connection to deploy to. Then, as `HOL_ADMIN`:

```sql
ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH;
CALL BANKING_HOL.LAB.DEPLOY_LAB_COMPANION();   -- builds from GitHub inside Snowflake, re-grants the app
```

Notebook **Map** chart clips (Chart > Chart type: Map > Geo type) are recorded by hand: use the `hol-map-clips` skill.

Related: the architecture diagram, the C2 talking points and the top-bar sections are maintained with the `hol-architecture` skill.

## Stopping points

- ✋ Step 1, if steps need attendee-built objects: build, navigate only, or skip
- ✋ Step 6, before redeploying the Lab Companion

**Resume rule:** after the user answers, carry on without re-asking.

## Output

A table of every clip recorded: name, size, the README step it is attached to, end frame checked (yes/no). Then, separately: steps left without a clip and why (needs Send, happens outside Snowsight, preview not available), and any step wording that no longer matches the UI.
