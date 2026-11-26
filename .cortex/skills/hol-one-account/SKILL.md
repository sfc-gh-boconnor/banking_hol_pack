---
name: hol-one-account
description: "Deploy the Banking HOL lab to one Snowflake account (not a DataOps event), check it is ready, and create a test attendee to sign in as. Use when the HOL team wants a single account to test or demo the lab, for example demo810. For many attendee accounts use banking-hol-event."
---

# Banking HOL: one-account deployment

Builds the full lab in one account you control, the same way a DataOps event does, so you can test it as an attendee before an event. Nothing here uses DataOps.

## Prerequisites

1. A Snowflake CLI connection in `~/.snowflake/connections.toml` (or the CLI config) that signs in as a user with **ACCOUNTADMIN**. Check with `snow connection test -c <connection>`.
2. Run from the repo root. `setup/provision_account.sh` is not executable, so run it with `bash`.
3. Confirm the connection with the user before any step that creates objects in the account.

## Workflow

### 1. Collect details and get approval

Ask with `ask_user_question`, one question each:
- **Snowflake account:** the connection name, and the account and user it shows from `snow connection test -c <connection>`. Confirm this is the account to change.
- **First name:** how CoWork should address the test attendee.
- **Email address:** for the test attendee's user record.

Then tell the user, in plain words, before anything is installed:
- This installs the lab objects into the account: roles, databases, warehouses, sample and lab data, the Lab Companion app, the notebooks and Workspace, the dbt project and the executive demo. It takes about 25 minutes, and the data loads will use the account's warehouse credits.
- The test attendee (step 4) is set up with a one-time password. They must change it on first sign-in.

Stop until the user explicitly approves the install. Do not run step 2 without that approval.

### 2. Provision the lab

```bash
bash setup/provision_account.sh <connection> --wait-all
```

What it does, in order:
- Creates the roles, database, warehouse and Git repository link, then starts the lab setup as the background task `BANKING_HOL.LAB.PROVISION_LAB`.
- Builds the Lab Companion inside Snowflake (`LAB.DEPLOY_LAB_COMPANION`) and prints its URL.
- With `--wait-all`, waits for `SETUP_SUMMARY` to read `READY`. That takes about 10 to 15 minutes.
- Then runs `setup/10c_ml_reference.sql` as `HOL_ADMIN` to pre-train the DS1 and DS4 models. That takes about 4 minutes more. It runs after the loader because a nested run fails inside the loader.

Progress, from Snowsight or the CLI as `ACCOUNTADMIN`:
- `SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS;`: one row per step.
- `SELECT * FROM BANKING_HOL.LAB.SETUP_SUMMARY;`: `READY`, `RUNNING` or `FAILED`.

If a step fails, read its error in `SETUP_STATUS`, fix the cause, then restart with `EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB;`. The loader cannot resume, so a restart redoes every step.

### 3. Redeploy local app changes (optional)

The provisioning build comes from the public repo. To test local changes, deploy from `lab-companion/`:

```bash
snow app deploy --connection <connection> --role HOL_ADMIN
```

Stop before this, because it replaces the running app.

### 4. Create a test attendee

Use the same setup as a real attendee. The attendee's default role must be `HOL_PARTICIPANT`, or Fast-forward fails. An `ACCOUNTADMIN` default role cannot run catch-ups because `RUN_CATCHUP` is not granted to it.

As `ACCOUNTADMIN`:

```sql
CREATE USER IF NOT EXISTS <USERNAME>
    FIRST_NAME = '<first name, as CoWork should address them>'
    EMAIL = '<email>'
    PASSWORD = '<one-time password>'
    DEFAULT_ROLE = HOL_PARTICIPANT
    DEFAULT_WAREHOUSE = BANKING_WH
    DEFAULT_NAMESPACE = BANKING_HOL
    MUST_CHANGE_PASSWORD = TRUE
    COMMENT = 'Banking HOL test attendee';
GRANT ROLE HOL_PARTICIPANT TO USER <USERNAME>;
```

Stopping points:
- Generate the one-time password yourself, and do not paste it into the chat or commit it.
- Share it out of band. The user changes it on first sign-in, which is the attendee path.
- Do not grant `HOL_ADMIN`. That account would not behave like an attendee.

### 5. Verify as the attendee

Sign in as the test user in a private browser window, then:
- Open the Lab Companion, and check the Fast-forward card on Client 360 completes.
- Check `SELECT CATCHUP, STATUS, STEP_NO, STEP_TOTAL, STEP_NAME FROM BANKING_HOL.LAB.CATCHUP_LOG;` for the run.
- If Fast-forward shows an error about the role, the user's default role is not `HOL_PARTICIPANT`.

Report the URL, the `SETUP_SUMMARY` value, the test user's name and whether Fast-forward worked.

## Known issues

- **Service not visible to SQL:** the Lab Companion is an application service. `SHOW APPLICATION SERVICES` lists it, but `SYSTEM$GET_SERVICE_STATUS` and `GRANT ... ON SERVICE` return "does not exist or not authorized" for `ACCOUNTADMIN` and `HOL_ADMIN`. Read its logs from the Snowsight app view.
- **Gateway error on the progress bar:** "upstream connect error" text where JSON was expected means the app did not answer that request. It is not yet diagnosed.
- **Nested reference step:** `10c` cannot run inside the loader, which is why `provision_account.sh` runs it after the loader.

## Stopping points

- Before provisioning, get explicit approval after showing what gets installed (step 1).
- Before creating the test user, confirm the first name and email (step 1).
- Before redeploying the app, confirm the connection.
- Teardown is not covered by this skill.

## Output

Report the Lab Companion URL, the `SETUP_SUMMARY` value and the test user's name, plus any step that failed and how it was handled.
