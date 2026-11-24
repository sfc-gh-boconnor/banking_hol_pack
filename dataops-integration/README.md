# DataOps integration

**HOL team:** to run an event, use `dataops-integration/hol_event.py` (create, status, rerun, end), or ask Cortex Code to use the `banking-hol-event` skill (`.cortex/skills/banking-hol-event/`), which walks through it with confirmations.

When the hands-on lab team provisions trial accounts through DataOps, each
account's configure pipeline can run this repo's provisioning and schedule the
Lab Companion to wake up before the event.

## What the pipeline runs

```bash
./dataops-integration/configure_account.sh <snow-connection-name>
```

This calls `setup/provision_account.sh` with the DataOps event times:

| DataOps variable | Used as | Example |
|---|---|---|
| `EVENT_START_DATETIME` | `LAB_START` | `2026-12-01 09:30:00 +00:00` |
| `EVENT_END_DATETIME` | `LAB_END` | `2026-12-01 13:30:00 +00:00` |
| `LAB_WAKE_LEAD_MINUTES` (optional) | minutes before start to wake the app | `30` |
| `REFERENCE_BUILD` (optional) | `true` adds `--with-reference-build` | `true` |

Times need an explicit UTC offset; the schedule is computed in UTC.

## Rescheduling an account

If the event moves after provisioning, only the schedule needs re-running:

```bash
EVENT_START_DATETIME='2026-12-02 09:30:00 +00:00' \
EVENT_END_DATETIME='2026-12-02 13:30:00 +00:00' \
./dataops-integration/reschedule.sh <snow-connection-name>
```

## On the day

The tasks `BANKING_HOL.LAB.LAB_WAKE_TASK` and `LAB_SLEEP_TASK` run once each.
Manual override: `CALL BANKING_HOL.LAB.WAKE_LAB();`

## Event instructions page

[`event_instructions.md`](event_instructions.md) is the attendee instructions template. It has two buttons, **Open Lab Companion** (`{{vars.LAB_COMPANION_URL}}`) and **Open Snowflake**, each opening in its own tab. Apply it to an event with the admin API:

```bash
curl -X PATCH -H "Authorization: Bearer $DATAOPS_TOKEN" -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'instructions': open('dataops-integration/event_instructions.md').read()}))")" \
  https://admin.dataops.live/api/v1/event_management/<event-slug>
```

The page only reads variables from the **Configure Attendee Account** job's dotenv, so the HOL v2 install (which exports `LAB_COMPANION_URL`) runs inside that job.

## Open Instructions box

The event page shows an **Open Instructions** box only when the account has a DataOps lab homepage, which the **Build Homepage** job publishes. This project doesn't include that job (the Lab Companion is the guide), so new events show only our instructions. There is no event setting for it: don't add the job back unless you want the box.

## Create a new event (admin API)

`POST https://admin.dataops.live/api/v1/event_management/<event-slug>` with a JSON body, then `POST .../<event-slug>/approve`. Tested settings:

| Field | Value |
|---|---|
| `dataops_configure_project_path` | your configure project (env `HOL_DATAOPS_PROJECT`) |
| `dataops_configure_project_pipe_file` | `full-ci.yml` |
| `dataops_top_level_group_path` | `event` (the only value accepted; `snowflake` is rejected) |
| `organization_account_identifier` | your DataOps admin org account (env `HOL_DATAOPS_ORG_ACCOUNT`) |
| `snowflake_account_region_group` / `snowflake_account_edition` | `aws_us_west_2` / `ENTERPRISE` |
| `instructions` | contents of `event_instructions.md` |
| `initial_pool_size`, `name`, `build_date`, `start_date`, `end_date`, `decommission_date` | per event |

A fresh account's Configure Attendee Account job now does about a minute of setup SQL, starts the lab setup inside the account (`BANKING_HOL.LAB.PROVISION_LAB`, a background task), builds the Lab Companion inside Snowflake and exports its URL, then ends. It doesn't wait for the lab data. The data, packs, dbt project and executive demo finish inside the account about 10-15 minutes later. Attendees who open the app before then see a **Setting up your lab** screen, and facilitators can follow it in Snowsight with `SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS` (restart a failed setup with `EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB`). Let every account reach `ready` before attendees register: an account's instructions values are captured when it is allocated.

## End an event

There is no delete endpoint. Decommission each account (`POST .../events/<slug>/accounts/<id>/decommission?remain_allocated=false`; irreversible) and `PATCH` the event's `end_date` and `decommission_date` to now.
