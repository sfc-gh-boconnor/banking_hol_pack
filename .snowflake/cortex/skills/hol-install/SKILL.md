---
name: hol-install
description: "Install the Banking HOL lab into the Snowflake account you are signed in to, from Cortex Code in Snowsight (no CLI, laptop or DataOps). Checks the role and AI, gets approval, runs INSTALL.sql, waits for the lab data, pre-trains the reference models and creates a test attendee. Use when someone asks to install or set up the hands-on lab from Snowsight, either from the home page with the GitHub connector or from a Workspace created from the banking_hol_pack repository."
---

# Banking HOL: install from Cortex Code in Snowsight

Installs the whole lab into **the account you are signed in to**, using SQL only. This is the Snowsight version of the `hol-one-account` skill: there is no connection to choose, and no service user or token.

## Before this skill

Cortex Code needs to read this skill and the lab files from the public repository. Either:

**From the Snowsight home page (GitHub connector):**
1. **AI & ML > CoCo Admin > GitHub**: **Enable**, then **USAGE grants > Manage** and grant it to ACCOUNTADMIN.
2. Connect your GitHub account when Cortex Code asks. If the repository still can't be read, use **Install on GitHub**.
3. Ask Cortex Code to follow this file from `https://github.com/sfc-gh-boconnor/banking_hol_pack`.

**From a Workspace (no GitHub connector):**
1. In a SQL worksheet as ACCOUNTADMIN, run `START_IN_SNOWSIGHT.sql` (from the repo's top level).
2. **Projects > Workspaces**, open the Workspace dropdown (top left) > **From Git repository**: URL `https://github.com/sfc-gh-boconnor/banking_hol_pack`, API integration `BANKING_HOL_GITHUB`, **Public repository**.
3. Open Cortex Code in that Workspace and type `/hol-install`.

If Cortex Code can read neither, tell the user these steps and stop.

## Reading the lab files

The workflow below opens `INSTALL.sql` and `setup/10c_ml_reference.sql`. Read them from the Workspace files, or from the repository through the GitHub connector. Once `INSTALL.sql`'s first section has run, you can also read any file with SQL:

```sql
SELECT $1 FROM @BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/setup/10c_ml_reference.sql (FILE_FORMAT => (TYPE = CSV FIELD_DELIMITER = NONE RECORD_DELIMITER = NONE ESCAPE_UNENCLOSED_FIELD = NONE));
```

## Rules

- Run SQL with the SQL tool only. Run one statement at a time, in the order given, and check each result before the next.
- Never paste a password into the chat.
- Stop at every **Stop** below until the user answers.

## Workflow

### 1. Check the account

Run each, and report the results in one short table:

```sql
SELECT CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME() AS ACCOUNT, CURRENT_USER() AS USER_NAME, CURRENT_ROLE() AS ROLE_NAME, CURRENT_REGION() AS REGION;
```
- The role must be **ACCOUNTADMIN**. If it isn't, ask the user to switch role (role selector at the bottom left of Snowsight), then check again.

```sql
SELECT AI_COMPLETE('claude-sonnet-4-5', 'Reply with the word ready') AS AI_CHECK;
```
- If it fails with "not available for trial accounts", AI is blocked: the user adds a credit card (**Admin > Billing**; it doesn't end the trial), then runs this skill again. Stop.

```sql
SELECT COUNT(*) AS ALREADY_INSTALLED FROM INFORMATION_SCHEMA.DATABASES WHERE DATABASE_NAME = 'BANKING_HOL';
```
- If it's 1, the lab is already installed: say so, and ask whether to reinstall over it (it keeps attendee work in other databases, but rebuilds the lab objects). **Stop** for the answer.

### 2. Collect details and get approval

Ask, one question each:
- **First name** for the test attendee (how CoWork addresses them).
- **Email address** for the test attendee.
- **Username** for the test attendee, suggesting `HOL_TEST_ATTENDEE`.

Then tell the user, in plain words:
- This installs the lab into this account: roles (HOL_ADMIN, HOL_PARTICIPANT, HOL_RESTRICTED), the BANKING_HOL databases, the BANKING_WH warehouse, compute pools, the lab data, the Lab Companion app, the notebooks Workspace, the dbt project and the executive demo.
- It sets cross-region inference to `ANY_REGION` so every model is available.
- It takes about 25 minutes and uses the account's credits.
- Accounts without external network access (trials) skip DE3, GOV3 and DA3's map app; the Lab Companion says so on those modules.
- The test attendee gets a one-time password they must change at first sign-in.

**Stop** until the user explicitly approves.

### 3. Run INSTALL.sql

Open `INSTALL.sql` and run its statements **one by one**, in order:
- Each `EXECUTE IMMEDIATE FROM @...` line and each `EXECUTE IMMEDIATE $$ ... $$` block is one statement.
- Section 5 (the Lab Companion build) takes 2 to 10 minutes. If the SQL tool times out, check with `SELECT VALUE FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'APP_URL';` before running it again.
- If a statement fails, show the error and stop. Don't skip it.

The last statement prints the next step: the Lab Companion URL, or the written lab guide when the account can't run apps.

### 4. Wait for the lab data

`EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB` loads the data in the background (about 10 to 15 minutes). Check progress when the user asks, or every few minutes:

```sql
SELECT STATUS, STEPS_DONE, STEP_TOTAL, CURRENT_STEP, ERROR_MESSAGE FROM BANKING_HOL.LAB.SETUP_SUMMARY;
```
- Carry on when `STATUS` is `READY`.
- If it's `FAILED`, show `SELECT STEP_NO, STEP_NAME, STATUS, ERROR_MESSAGE FROM BANKING_HOL.LAB.SETUP_STATUS WHERE STATUS <> 'DONE' ORDER BY STEP_NO;`, and stop. A restart is `EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB;` once the cause is fixed.

### 5. Pre-train the reference models

So the DS1 and DS4 Fast-forwards copy a model instead of training one (about 4 minutes).

Open `setup/10c_ml_reference.sql` and run its statements one by one, including its `USE ROLE` lines. Don't run the whole file with `EXECUTE IMMEDIATE FROM`: nested, its model checks fail.

Then check:
```sql
SELECT COUNT(*) AS REFERENCE_MODELS FROM BANKING_HOL.INFORMATION_SCHEMA.MODEL_VERSIONS WHERE SCHEMA_NAME = 'ML_REFERENCE';
```
It should be 1 or more. If it's 0, say so: the lab still works, but DS1 and DS4 Fast-forwards train a model, which is slower.

### 6. Create the test attendee

Create the user without a password, so no password passes through the chat:

```sql
USE ROLE ACCOUNTADMIN;
CREATE USER IF NOT EXISTS <USERNAME>
    FIRST_NAME = '<first name>'
    EMAIL = '<email>'
    DEFAULT_ROLE = HOL_PARTICIPANT
    DEFAULT_WAREHOUSE = BANKING_WH
    DEFAULT_NAMESPACE = BANKING_HOL
    COMMENT = 'Banking HOL test attendee';
GRANT ROLE HOL_PARTICIPANT TO USER <USERNAME>;
```
- Run the statements separately.
- Escape any `'` in the name or email by doubling it.
- Don't grant HOL_ADMIN: the user must behave like an attendee.

Then ask the user to set a one-time password themselves:
1. **Admin > Users & roles**, then select `<USERNAME>`.
2. **Edit** (or the **...** menu > **Edit**), and enter a password.
3. Turn on **Force user to change password on first sign-in**, then **Save**.
4. Share the password with the attendee outside the chat.

### 7. Report

- The Lab Companion URL (from `SETUP_CONFIG`, key `APP_URL`), or the lab guide location.
- `SETUP_SUMMARY` status, and the number of reference models.
- The test attendee's username, and that they sign in with a private browser window and change the password.
- Any module that's unavailable on this account (no external access: DE3, GOV3, DA3's map app).

## Stopping points

- Wrong role, or AI blocked (step 1).
- Lab already installed (step 1).
- Before installing: explicit approval (step 2).
- Any failed statement or a `FAILED` setup (steps 3 and 4).
