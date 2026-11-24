# APP1: Build and ship the fraud investigator app

| | |
|---|---|
| **Persona** | App Builder |
| **Time** | ~45 min |
| **Prerequisites** | APP0 (`APPS.FRAUD_REVIEW_QUEUE` and `APPS.MATCH_DECISIONS`). No Git account needed. |

## Business question
> Can someone who isn't a full-time developer turn the APP0 plan into a working, governed app that investigators use today, without a Git account, a laptop install or a deployment pipeline?

## What you'll build
- A Streamlit app in your private workspace, written by Cortex Code: a review queue, a review panel with the evidence and fraud history, and Confirm / Not our customer / Escalate buttons
- The deployed app `BANKING_HOL.APPS.FRAUD_INVESTIGATOR`, shared view-only with another role
- Decisions saved to `APPS.MATCH_DECISIONS`, with who made each one

## Steps
### Create a Streamlit app in your workspace
Where: **Projects > Workspaces**, your private workspace (**My Workspace**)
Media: app1_create_streamlit.mp4 | My Workspace > + Add new > Streamlit App > title fraud_investigator, warehouse BANKING_WH > Create
1. Open **Projects > Workspaces**.
2. Select **+ Add new > Streamlit app**, and name the folder `fraud_investigator`.
3. Open `streamlit_app.py` in the new folder.
**Tip:** your workspace is private, and Snowflake keeps its files. That's why there's no Git step: Git is optional, for when a team wants version control.
Expect: a folder with `streamlit_app.py`, `pyproject.toml`, `snowflake.yml` and `.streamlit/config.toml`

### Write the app with Cortex Code
Media: app1_write.mp4 | Open streamlit_app.py, then paste the prompt into the Cortex Code panel
Paste: the Cortex Code panel in the workspace (the **CoCo** icon at the lower right)
```prompt
Replace fraud_investigator/streamlit_app.py with a Streamlit in Snowflake app titled "Fraud investigator" for fraud investigators, using get_active_session(). Read BANKING_HOL.APPS.FRAUD_REVIEW_QUEUE with each mention's latest decision from BANKING_HOL.APPS.MATCH_DECISIONS. At the top: a multi-select segmented control for SUGGESTED (default REVIEW) and three metrics (in the queue, decided, candidate has fraud history). Left: the queue as a dataframe with single-row selection, candidates with fraud history first. Right: for the selected row, the mention as written, the best candidate with date of birth, town and name similarity, and that customer's cases from BANKING_HOL.RAW_DATA.RB_FRAUD_CASES; an optional note; and buttons Confirm match, Not our customer and Escalate that insert CONFIRMED, REJECTED or ESCALATED into MATCH_DECISIONS. Record DECIDED_BY from st.user (the viewer), never CURRENT_USER(), which returns the app owner. Use bind parameters for every value, cache reads with st.cache_data and clear the cache after a save. Keep the dependencies in pyproject.toml to streamlit and snowflake-snowpark-python.
```
**Important:** an app runs with its owner's rights by default, so everyone who opens it sees what the owner role can see. Keep the app to the data investigators need.
Expect: Cortex Code edits `streamlit_app.py` (and `pyproject.toml` if needed) in your workspace and explains the layout

### Run it
Where: the action bar at the top of `streamlit_app.py`
Media: app1_run.mp4 | streamlit_app.py > Run in the action bar (the preview opens on the right)
1. Press **Run** (or Cmd+Enter / Ctrl+Enter).
2. Select a REVIEW row, then press **Escalate**.
3. Ask Cortex Code for any change in plain English, for example "show the customer's city next to their name", and press **Run** again.
**Tip:** the running app is a private development app that only you can see. The first start takes a minute or two.
Expect: the queue on the left; after you select a row, the evidence and fraud history on the right, and a "Saved" message when you press a button

### Deploy it
Where: the project pane toolbar > **Settings**, then **Deploy**
Media: app1_deploy.mp4 | Settings > Targets: preview role, compute pool and warehouse > Save settings
1. Select **Settings**, then the **Targets** tab, and choose the deploy target.
2. Set **App ID** to `FRAUD_INVESTIGATOR` and **App title** to `Fraud investigator`.
3. Set **Owner role of deployed app** to `HOL_PARTICIPANT` and **App location** to `BANKING_HOL` / `APPS`.
4. Set **Execution** to warehouse `BANKING_WH` and compute pool `HOL_COMPUTE_POOL_CPU`.
5. Select **Save settings**, then **Deploy**, choose the target and select **Deploy**.
**Tip:** these settings are saved in `snowflake.yml`, so the next deploy uses them too. If the deploy reports a missing package, add `PYPI_ACCESS_INTEGRATION` on the **Network** tab.
Expect: the target shows as deployed, and the app opens at its own URL outside the workspace
Check: app1_streamlit

### Share it and record a decision
Where: the project pane toolbar > **Share**
Media: app1_share.mp4 | Share > add HOL_RESTRICTED > Save grants
1. Select **Share**, add the role `HOL_RESTRICTED` as **View only**, and select **Save grants**.
2. Open the deployed app and record a decision on one REVIEW row.
**Tip:** sharing grants USAGE on the app. Anyone with that role can use it without access to your workspace or its code.
Expect: the decision appears in the queue's last-decision column
Check: app1_decisions

## Check your work
`BANKING_HOL.APPS.FRAUD_INVESTIGATOR` is deployed, and `APPS.MATCH_DECISIONS` holds at least one decision.

## In your bank
Here the app is built and deployed from a private workspace with no Git. A team would move it to a Git-backed or shared workspace for review before production. A reference version is in `streamlit_app.py` and `pyproject.toml`.
