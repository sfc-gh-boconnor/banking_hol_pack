---
name: hol-catchup
description: "Add or change a Fast-forward catch-up for a Banking HOL module: the script in setup/catchup/, its plain-English progress steps, the runner allow-list, the Lab Companion card, the module's Prerequisites row and its prerequisite check. Use whenever a module builds on an earlier module's output, when a module is blocked because a prerequisite object is missing, or when a catch-up is slow and needs progress. Triggers: catch-up, fast-forward, skip ahead, prerequisite missing, blocked, progress bar."
---

# Banking HOL: Fast-forward catch-ups

Every module that builds on an earlier module's output gets a **Fast-forward**, so an attendee who skipped the earlier module is never blocked. The Lab Companion shows it as a card on the module page: one button, a progress bar and the current step in plain English. It runs the catch-up as the attendee, so what it builds is theirs.

## Standard for every module that has a prerequisite

A module that needs something an earlier module builds must have all four:

1. A **catch-up script** in `setup/catchup/<name>.sql` that builds exactly what the earlier module leaves behind.
2. The script named in the module README's **Prerequisites** row. The card appears for every `setup/catchup/*.sql` file named there, in the order the row names them.
3. A **Check prerequisites** entry in `PREREQS` in `lab-companion/lib/checks.ts` (use the `pre` helpers), whose `hint` says "press **Fast-forward** on this page".
4. A first step in the README, `Check the predictions are ready` style: a read-only query that fails clearly when the object is missing, then the fast-forward instructions (press **Fast-forward**, wait for ticks, run the check again).

Do not tell attendees to copy the SQL and run it themselves. The SQL block stays on the page only as a collapsed reference.

## Write the script so progress is readable

The card shows a bar and the current step, driven by `CALL BANKING_HOL.LAB.CATCHUP_STEP(n, total, 'text')` lines in the script.

- Put one call before each major section: `CALL BANKING_HOL.LAB.CATCHUP_STEP(2, 4, 'Scoring customer feedback with AI');`
- Write the text for the attendee, in plain English and UK spelling: what is being built, never table or procedure names.
- Say `(the longest step)` on the slow one, so nobody thinks it has stalled.
- A step inside a single Python procedure cannot report progress. Name it as one step and say so.
- The calls do nothing when the script is run by hand, so scripts stay valid standalone.
- Scripts run as `HOL_PARTICIPANT`, are safe to re-run, and must work from a clean account. Use a dependency note in the runner when one script needs another (see `ds4_predictions` needing `ds1_model`).

## Slow catch-ups: copy a pre-trained reference, don't train

Never make an attendee wait for training. Anything slow is trained **once at provisioning** and copied by the catch-up.

- `setup/10c_ml_reference.sql` (a `LOAD_LAB_DATA` step) trains with the module's own answer key and snapshots the result into `BANKING_HOL.ML_REFERENCE`: models (`MODEL_VERSIONS` lists the versions and which catch-up hands them out), result tables, and experiment runs (`EXPERIMENT_RUNS`). It then empties `BANKING_HOL.ML` so attendees start clean.
- The training scripts live in `setup/ml_reference/train_*.sql`, not in `setup/catchup/` (that folder is what the app lists).
- The catch-up copies with `CREATE MODEL ... WITH VERSION v FROM MODEL ML_REFERENCE...` and `ALTER MODEL ... ADD VERSION`, copies the tables with CTAS, and re-logs experiment runs with `setup/ml_reference/restore_runs.py` (runs cannot be copied; DS3 reads them).
- `HOL_PARTICIPANT` must own the reference models: Snowflake only lets a model's owner copy it.
- If the account has no reference, the catch-up falls back to the train script, so older accounts still work.
- To add a module: train it in `10c`, call `ML_REFERENCE.SNAPSHOT('<catchup>')` after it, and write a copy-only catch-up.
- Change the answer key, or reload the lab data, and the reference must be rebuilt: run the `10c` step again.

## Register it

1. Add the name to the allow-list in **both** places, which must match:
   - `setup/11b_catchup_runner.sql`, in `RUN_CATCHUP` (`NAME NOT IN (...)`)
   - `lab-companion/lib/catchup.ts`, `CATCHUP_NAMES`
2. Add a `LABELS` entry (plain-English label and what it builds, with a time estimate) in `lab-companion/components/lab/fast-forward.tsx`.
3. If it depends on another catch-up, add the dependency check to `RUN_CATCHUP` as `ds4_predictions` does.
4. Reinstall the runner on the test account (`snow sql --connection <conn> --enable-templating NONE -f setup/11b_catchup_runner.sql`).

## Test

The runner reads scripts from the GitHub repo, so a script edited locally only runs the new version after it is pushed and `ALTER GIT REPOSITORY BANKING_HOL_SETUP.PUBLIC.HOL_REPO FETCH`. Before that, simulate in one session: insert a `CATCHUP_LOG` row, `SET CATCHUP_RUN_ID = '<id>'`, run the local script, then read the log row's `STEP_NAME`.

1. Run `CALL BANKING_HOL.LAB.RUN_CATCHUP('<name>')` as `HOL_PARTICIPANT` with `USE SECONDARY ROLES NONE`.
2. Check the log: `SELECT CATCHUP, STATUS, STEP_NO, STEP_TOTAL, STEP_NAME FROM BANKING_HOL.LAB.CATCHUP_LOG`.
3. Check the module's own `Check:` ids pass afterwards.
4. Note that running catch-ups marks those checks done on the test account.

## Then

Run `cd lab-companion && node scripts/sync-content.mjs`, `npx tsc --noEmit` and `python3 guide/build_guide.py`. **Stop and ask** before redeploying the Lab Companion and which connection to use.

The facilitator reset clears `LAB.CATCHUP_LOG`, so the card shows an untouched state after a reset.
