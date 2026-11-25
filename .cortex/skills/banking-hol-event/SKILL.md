---
name: banking-hol-event
description: "Create, check, fix and end a DataOps.live event for the Payments Operations hands-on lab (Lab Companion + banking-hol-pack Workspace). Use when the HOL team needs a new lab event, wants to know if attendee accounts are ready, or needs to re-run or decommission an event. Triggers: create HOL event, new payments lab event, set up DataOps event, event accounts ready, decommission event, end event."
---

# Payments HOL: DataOps event

Creates a DataOps.live event that provisions attendee accounts with the full lab: Iceberg sources, HOL roles, dbt project, **Lab Companion** app and the **banking-hol-pack** Workspace. Every action goes through `dataops-integration/hol_event.py` (stdlib Python), which wraps the DataOps admin API with the settings tested on the reference events.

## How the event works (read once)

- **Configure project:** the project in `HOL_DATAOPS_PROJECT` (DataOps GitLab). Each account's pipeline is three jobs: *Initialise Pipeline*, *Download Repo*, then *Configure Attendee Account*. Configure does:
  1. platform setup (users, MFA policy, Cortex);
  2. `setup/provision_account.sh` from https://github.com/sfc-gh-boconnor/banking_hol_pack: about a minute of setup SQL, then the Lab Companion built inside Snowflake (`LAB.DEPLOY_LAB_COMPANION`), then the lab setup started as a background task (`LAB.PROVISION_LAB`);
  3. the attendee grants, `LAB_COMPANION_URL` export, the banking-hol-pack Workspace and the event's instructions page.
- **`ready` doesn't mean the lab data has loaded.** The background task loads it inside the account (about 9 minutes). The app shows **Setting up your lab** until then; progress is in `SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS` (or `SETUP_SUMMARY`). Restart a failed setup with `EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB`.
- **Instructions page** (`go.dataops.live/<slug>/instructions`) comes from `dataops-integration/event_instructions.md`. It is stored **per event**: `create` applies it, and every Configure run re-applies it if it differs (masked project variable `HOL_EVENT_ADMIN_TOKEN_B64`, a base64-encoded DataOps token). So edit the file and push, not the page in the DataOps UI. It shows the login and two buttons, **Open Lab Companion** and **Open Snowflake**, and only reads variables from the *Configure Attendee Account* job, captured when an account is **allocated** to an attendee.
- There is **no Open Instructions box**, because the project has no Build Homepage job. Don't add that job back.
- A brand-new account takes about **20-25 minutes** to reach `ready`: about 6 creating the account, then Configure, where the first app build waits about 8 minutes for Snowflake's build compute. A rerun takes about 5 minutes.
- **Adding accounts:** `PATCH .../event_management/<slug>` with `{"pool_size": n}`. Decommissioned accounts still count towards the pool, so add the number you want to the current pool size.

## Prerequisites

1. A DataOps personal access token with `api` scope, from app.dataops.live (**User settings > Access tokens**). The script reads `DATAOPS_TOKEN`, or the macOS keychain item `dataops-token`. To store it without echoing:
   `security add-generic-password -U -s dataops-token -a "$USER" -w`
2. Run from the repo root (the script resolves `event_instructions.md` next to itself).

Check the token works before anything else: `python3 dataops-integration/hol_event.py status <event-slug>`. A 401 error means the token is missing or expired.

## Workflow

### 1. Gather event details

Ask the user, with `ask_user_question`, for:
- **slug**: the URL name (`go.dataops.live/<slug>`). Lowercase and hyphens. It must be new, because creating with an existing slug fails.
- **name**: the display name.
- **pool**: the number of attendee accounts. Expected attendees plus about 10% spare, because a failed account can be rerun but allocations can't be moved.
- **start / end**: UTC, or ISO with an offset.
- Optional: **domains** (allowed attendee email domains, e.g. `examplebank.co.uk snowflake.com`), **region** (default `aws_us_west_2`), **build** time (default 24 h before start).
- **Don't use passwordless** (`--passwordless`) for real events yet. DataOps creates the SSO user when the attendee registers (64-character hex name, default role ACCOUNTADMIN, no warehouse), seconds before their first sign-in, so the lab defaults can't be guaranteed. Setup 00's `ADOPT_SSO_ATTENDEES_TASK` fixes it within 2 minutes, which is too late. Use the default password events, where configure sets up `USER` before registration. Tested 24 Nov 2026.

### 2. Dry run and confirm

```bash
python3 dataops-integration/hol_event.py create <slug> --name "<name>" --pool <n> \
  --start <start> --end <end> [--domains ...] [--region ...] --dry-run
```

Show the printed settings and **stop for confirmation**. Creating an event provisions Snowflake accounts, which cost money, and they can't be deleted, only decommissioned.

### 3. Create

Run the same command without `--dry-run`. Add `--wait` if the build time is now, so the script polls until every account is `ready`. The script approves the event too; if approval is refused, tell the user a DataOps admin must approve it.

Give the user the registration link, `https://go.dataops.live/<slug>`.

### 4. Check readiness before attendees register

```bash
python3 dataops-integration/hol_event.py status <slug>
```

Every account should be `ready` with a `LAB_COMPANION_URL`. Don't open registration until they are: an attendee allocated to an unfinished account gets an instructions page with an empty Lab Companion link, and that never refreshes.

If an account is in `error`:
1. Open its `latest_pipeline_url` (shown by `status`) and read the failed job's log. Each provisioning step line is timestamped (`==> [hh:mm:ss UTC] ...`), and the log ends with the failing step and its SQL error.
2. Fix the cause in the lab repo (push to both remotes: `origin` and `public`) or in the DataOps project.
3. `python3 dataops-integration/hol_event.py rerun <slug>`

### 5. On the day

In each account, the facilitator can run `CALL BANKING_HOL.LAB.WAKE_LAB();`, so the Lab Companion is warm before the start. The pipeline also stores the event times (`BANKING_HOL.LAB.SETUP_CONFIG`), and the background setup's last step schedules the wake and sleep tasks from them.

### 6. End the event

```bash
python3 dataops-integration/hol_event.py end <slug>          # shows what will be decommissioned
python3 dataops-integration/hol_event.py end <slug> --yes    # decommissions (irreversible)
```

**Stop for explicit confirmation** before `--yes`. There is no delete endpoint: the script decommissions every account and moves the end and decommission dates to now. The API can return 500 even when decommissioning started. Trust the final status table.

## Other commands

- `instructions <slug>`: re-apply `event_instructions.md` now, instead of waiting for the next Configure run (it affects new allocations only).
- `rerun <slug>`: re-run the configure pipeline for every live account.

## Stopping points

- After the dry run in step 2: before creating anything.
- Before `end --yes`.

## Output

The event slug and registration URL, the account readiness table (each account's status and Lab Companion URL), and any accounts that need a rerun.
