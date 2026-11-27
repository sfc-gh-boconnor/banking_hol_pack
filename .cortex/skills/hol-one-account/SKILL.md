---
name: hol-one-account
description: "Deploy the Banking HOL lab to one Snowflake account (not a DataOps event), check it is ready, and create a test attendee to sign in as. Use when the HOL team wants a single account to test or demo the lab. Always asks which account to use: it never assumes a default connection. Offers a new account (for example a trial) every time, and helps create its connection with a service user and token. For many attendee accounts use banking-hol-event."
---

# Banking HOL: one-account deployment

Builds the full lab in one account you control, the same way a DataOps event does, so you can test it as an attendee before an event. Nothing here uses DataOps.

## Prerequisites

1. A Snowflake CLI connection in `~/.snowflake/connections.toml` (or the CLI config) that signs in as a user with **ACCOUNTADMIN**. Check with `snow connection test -c <connection>`.
2. Run from the repo root. `setup/provision_account.sh` is not executable, so run it with `bash`.
3. Confirm the connection with the user before any step that creates objects in the account.

## Workflow

### 1. Choose the account and connect to it

**Important:** never pick the account for the user. Ignore any default connection from memory, `AGENTS.md`, or the Snowflake CLI's default (for example `demo810`). Always ask, even if a connection is already active.

1. Run `snow connection list` and show the user the connection names, with the account each points to. If the list is empty, or the command fails, go straight to the new-connection steps below.
2. Ask with `ask_user_question` (header "Account"): "Which Snowflake account should the lab be installed on?" The options **must** include both of these, every time:
   - **A new account (create a new connection)**: always list this one first. Its description is "e.g. a trial; I'll help you set up a service user and token".
   - One option for each existing connection, labelled with the connection name, with its account as the description. If there are more than four, show the four most likely, and tell the user they can type any other connection name.
3. If they choose **A new account**, follow the new-connection steps below, then come back to step 4 with the new connection.
4. If they choose an existing one, run `snow connection test -c <connection>` and show the account, user and role. Ask the user to confirm this is the account to change. The role must be **ACCOUNTADMIN**.

#### If they don't have a connection yet: create a service user with a token

The install runs from the Snowflake CLI, so it needs a user that signs in without a browser. Guide the user through these steps. Don't run any SQL on their account yourself; they run it in Snowsight.

1. **Find the account identifier.** In Snowsight, select your user name at the bottom of the left menu, then **Connect a tool to Snowflake**. Copy the **Account identifier** (`orgname-account_name`) from **Account Details**. Alternatively, run `SELECT CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME();` in a worksheet.
2. **Create the service user and token.** Ask them to open a Snowsight worksheet as ACCOUNTADMIN and run:
   ```sql
   USE ROLE ACCOUNTADMIN;
   -- The lab's warehouse, with the same settings setup/00_admin_provision.sql uses
   -- (it creates it IF NOT EXISTS, so creating it here first is safe).
   CREATE WAREHOUSE IF NOT EXISTS BANKING_WH
     WAREHOUSE_SIZE = 'SMALL'
     AUTO_SUSPEND = 60
     AUTO_RESUME = TRUE
     INITIALLY_SUSPENDED = TRUE
     COMMENT = 'Warehouse for the Banking HOL pack';

   CREATE USER IF NOT EXISTS HOL_DEPLOY
     TYPE = SERVICE
     COMMENT = 'Banking HOL: installs the lab from the Snowflake CLI';
   -- Set the defaults separately, so they also apply if HOL_DEPLOY already exists.
   ALTER USER HOL_DEPLOY SET
     DEFAULT_ROLE = ACCOUNTADMIN
     DEFAULT_WAREHOUSE = BANKING_WH;
   GRANT ROLE ACCOUNTADMIN TO USER HOL_DEPLOY;

   -- Authentication policies live in a schema.
   CREATE DATABASE IF NOT EXISTS HOL_ADMIN_DB;
   -- Service users need a network policy to use a token, unless this policy relaxes it.
   -- PAT_POLICY settings are separated by spaces or new lines, not commas.
   CREATE AUTHENTICATION POLICY IF NOT EXISTS HOL_ADMIN_DB.PUBLIC.HOL_DEPLOY_AUTH
     PAT_POLICY = (
       NETWORK_POLICY_EVALUATION = ENFORCED_NOT_REQUIRED
       REQUIRE_ROLE_RESTRICTION_FOR_SERVICE_USERS = FALSE
     );
   ALTER USER HOL_DEPLOY SET AUTHENTICATION POLICY HOL_ADMIN_DB.PUBLIC.HOL_DEPLOY_AUTH;

   ALTER USER HOL_DEPLOY ADD PROGRAMMATIC ACCESS TOKEN HOL_DEPLOY_PAT
     DAYS_TO_EXPIRY = 30
     COMMENT = 'Banking HOL install';
   ```
   - Show this SQL to the user exactly as written. It has no placeholders to fill in, so don't add any `<...>` values.
   - The last statement shows the token **once**. Tell them to copy it straight away, and not to paste it into the chat.
   - If their organisation requires network policies, they can attach one to HOL_DEPLOY instead of using the authentication policy.
3. **Add the connection.** Ask them to run `! snow connection add` in this chat and answer the prompts:
   - connection name: their choice, for example `hol_trial`;
   - account: the identifier from step 1;
   - user: `HOL_DEPLOY`;
   - authenticator: `PROGRAMMATIC_ACCESS_TOKEN`;
   - password/token: paste the token;
   - role: `ACCOUNTADMIN`;
   - warehouse: `BANKING_WH`.
4. **Test it.** Run `snow connection test -c <new name>`, and show the account, user, role and warehouse. If the warehouse is blank, the connection has none: run `ALTER USER HOL_DEPLOY SET DEFAULT_WAREHOUSE = BANKING_WH;` in Snowsight, or add `warehouse = "BANKING_WH"` to the connection.
5. **After the install**, suggest they remove the token with `ALTER USER HOL_DEPLOY REMOVE PROGRAMMATIC ACCESS TOKEN HOL_DEPLOY_PAT;` (or drop the user and `HOL_ADMIN_DB`) if they won't redeploy.

### 2. Collect details and get approval

Ask with `ask_user_question`, one question each:
- **First name:** how CoWork should address the test attendee.
- **Email address:** for the test attendee's user record.

Then tell the user, in plain words, before anything is installed:
- This installs the lab objects into the account: roles, databases, warehouses, sample and lab data, the Lab Companion app, the notebooks and Workspace, the dbt project and the executive demo. It takes about 25 minutes, and the data loads will use the account's warehouse credits.
- The test attendee (step 5) is set up with a one-time password. They must change it on first sign-in.

Stop until the user explicitly approves the install. Do not provision without that approval.

### 3. Provision the lab

```bash
bash setup/provision_account.sh <connection> --wait-all
```

What it does, in order:
- Creates the roles, database, warehouse and Git repository link, then starts the lab setup as the background task `BANKING_HOL.LAB.PROVISION_LAB`.
- Builds the Lab Companion inside Snowflake (`LAB.DEPLOY_LAB_COMPANION`) at the same time, on its own warehouse `BANKING_SETUP_WH`, and prints its URL.
- The task graph loads the lab data first (about 4 minutes; the app opens then), then builds the executive demo (`PROVISION_DEMO`) and pre-trains the DS1 and DS4 reference models (`PROVISION_MODELS`) side by side, about 10 minutes more. The app shows what is still building, and holds DS1 and DS4 until the models are ready.
- With `--wait-all`, waits for `SETUP_SUMMARY.ALL_READY`.

Progress, from Snowsight or the CLI as `ACCOUNTADMIN`:
- `SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS;`: one row per step, with its `PART` (Lab, Executive demo, Reference models).
- `SELECT * FROM BANKING_HOL.LAB.SETUP_SUMMARY;`: the lab `STATUS` (`READY`, `RUNNING` or `FAILED`), `DEMO_STATUS`, `MODELS_STATUS` and `ALL_READY`.

If a step fails, read its error in `SETUP_STATUS`, fix the cause, then restart with `EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB;`. The loader cannot resume, so a restart redoes every step. A failed demo or models part can rerun on its own as `HOL_ADMIN`: `CALL BANKING_HOL.LAB.LOAD_LAB_DATA('DEMO_PROVISION');` or `('MODELS')`.

### 4. Redeploy local app changes (optional)

The provisioning build comes from the public repo. To test local changes, deploy from `lab-companion/`:

```bash
snow app deploy --connection <connection> --role HOL_ADMIN
```

Stop before this, because it replaces the running app.

### 5. Create a test attendee

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
- Generate the one-time password yourself, and do not paste it into the chat or commit it. Make it at least 14 characters: Snowflake's default password policy rejects shorter ones.
- Share it out of band. The user changes it on first sign-in, which is the attendee path.
- Never do this to an event's `USER` login: the change replaces the password on the event's instructions page, and the old one can't be set back. Create a separate test user.
- Do not grant `HOL_ADMIN`. That account would not behave like an attendee.

### 6. Verify as the attendee

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

- Before connecting, ask which account to use and confirm it from `snow connection test` (step 1). Never use a default connection.
- Before provisioning, get explicit approval after showing what gets installed (step 2).
- Before creating the test user, confirm the first name and email (step 2).
- Before redeploying the app, confirm the connection.
- Teardown is not covered by this skill.

## Output

Report the Lab Companion URL, the `SETUP_SUMMARY` value and the test user's name, plus any step that failed and how it was handled.
