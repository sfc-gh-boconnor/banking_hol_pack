#!/usr/bin/env bash
# =====================================================
# BANKING HOL PACK - PROVISION ONE ACCOUNT
#
# Run from a clone of this GitHub repo, once per account, before the event:
#   ./setup/provision_account.sh <snow-connection-name> [--wait-all] [--with-reference-build]
#
# Does the minimum from outside the account (about 1 minute of SQL), starts the lab setup INSIDE
# Snowflake as a background task (LAB.PROVISION_LAB), then builds the Lab Companion inside
# Snowflake (LAB.DEPLOY_LAB_COMPANION, ~2-5 min) and prints its URL. The lab data, packs, dbt
# project, executive demo and wake schedule carry on in the account; attendees who open the app
# early see a "Setting up your lab" screen. Progress, from Snowsight:
#   SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS;   -- one row per step
#   SELECT * FROM BANKING_HOL.LAB.SETUP_SUMMARY;  -- READY / RUNNING / FAILED
# To restart a failed setup: EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB;
#
#   --wait-all              also wait for the whole setup to finish
#   --with-reference-build  (implies --wait-all) then pre-build the analytics layer, semantic
#                           views and agents (Payments Ops pathway or demos)
#
# Wake schedule: set LAB_START and LAB_END (any timestamp with an offset, e.g.
# '2026-12-01 09:30:00 +00:00'), or the DataOps EVENT_START_DATETIME / EVENT_END_DATETIME.
# LAB_WAKE_LEAD_MINUTES defaults to 30. HOL_ENABLE_SEARCH=0 switches off the AI5 search lab.
#
# Needs: Snowflake CLI 3.x (snow) for the SQL. Nothing is uploaded or built locally: the data
# loads from the lab's GitHub repo and the app builds inside Snowflake (LAB.DEPLOY_LAB_COMPANION).
# The connection must use a user with ACCOUNTADMIN.
# =====================================================
set -euo pipefail

CONN="${1:?usage: provision_account.sh <snow-connection-name> [--wait-all] [--with-reference-build]}"
shift
WAIT_ALL=0
REFERENCE_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --wait-all) WAIT_ALL=1 ;;
    --with-reference-build) WAIT_ALL=1; REFERENCE_BUILD=1 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n==> [%s UTC] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
run_sql() { snow sql -c "$CONN" -f "$1" > "/tmp/hol_$(basename "$1").log" 2>&1 || { echo "FAILED: $1"; tail -25 "/tmp/hol_$(basename "$1").log"; exit 1; }
            if grep -q "─ Error" "/tmp/hol_$(basename "$1").log"; then echo "ERRORS in $1:"; grep -A3 "─ Error" "/tmp/hol_$(basename "$1").log" | head -20; exit 1; fi; }
# Poll SETUP_SUMMARY until a condition holds: wait_for <python condition on r> <timeout s> <label>
wait_for() {
  local cond="$1" timeout="$2" label="$3" t0=$SECONDS out
  while (( SECONDS - t0 < timeout )); do
    out=$(snow sql -c "$CONN" --role HOL_ADMIN --format json -q "SELECT * FROM BANKING_HOL.LAB.SETUP_SUMMARY" 2>/dev/null \
          | python3 -c "
import json,sys
r=json.load(sys.stdin)[0]
if r['STATUS']=='FAILED': print('FAILED|'+str(r.get('CURRENT_STEP'))+': '+str(r.get('ERROR_MESSAGE')))
elif $cond: print('OK|')
else: print('WAIT|'+str(r.get('STEPS_DONE'))+' of '+str(r.get('STEP_TOTAL'))+', now: '+str(r.get('CURRENT_STEP')))
" 2>/dev/null || echo "WAIT|status not readable yet")
    case "$out" in
      OK*) return 0 ;;
      FAILED*) echo "FAILED during setup - ${out#FAILED|}" >&2
               echo "See SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS; restart with EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB" >&2
               return 1 ;;
      *) printf '  [%3ds] %s\n' $(( SECONDS - t0 )) "${out#WAIT|}" >&2 ;;
    esac
    sleep 20
  done
  echo "Timed out after ${timeout}s waiting for $label (setup carries on in the account: see LAB.SETUP_STATUS)" >&2
  return 1
}

step "1/5 Roles, database, warehouse, compute pools, Marketplace knowledge extension"
run_sql setup/00_admin_provision.sql

step "2/5 Connect the lab Git repository (the in-account setup reads it)"
run_sql setup/git_repo.sql

step "3/5 Setup procedures: data loader, app deploy, Lab Companion prerequisites, wake schedule"
run_sql setup/11_lab_data_loader.sql
run_sql setup/11b_catchup_runner.sql
run_sql setup/04_lab_companion.sql
run_sql setup/05_wake_schedule.sql

step "4/5 Record the lab settings (the app shows 'Setting up your lab' from now on)"
LAB_START="${LAB_START:-${EVENT_START_DATETIME:-}}"
LAB_END="${LAB_END:-${EVENT_END_DATETIME:-}}"
LEAD="${LAB_WAKE_LEAD_MINUTES:-30}"
SEARCH_FLAG=$([[ "${HOL_ENABLE_SEARCH:-1}" == "1" ]] && echo TRUE || echo FALSE)
[[ "$SEARCH_FLAG" == "FALSE" ]] && echo "  Cortex Search lab off (HOL_ENABLE_SEARCH=0): AI5 will show as skippable"
[[ "$LEAD" =~ ^[0-9]+$ ]] || { echo "LAB_WAKE_LEAD_MINUTES must be a whole number"; exit 1; }
for t in "$LAB_START" "$LAB_END"; do
  [[ -z "$t" || "$t" =~ ^[0-9TZ:.+\ -]+$ ]] || { echo "Invalid lab time: '$t' (expected e.g. 2026-12-01 09:30:00 +00:00)"; exit 1; }
done
[[ -n "$LAB_START" && -n "$LAB_END" ]] && echo "  Wake schedule: $LAB_START to $LAB_END (lead $LEAD min)" \
  || echo "  No LAB_START/LAB_END: no wake schedule. On the day: CALL BANKING_HOL.LAB.WAKE_LAB();"
snow sql -c "$CONN" --role HOL_ADMIN -D "lab_start=$LAB_START" -D "lab_end=$LAB_END" -q "
DELETE FROM BANKING_HOL.LAB.SETUP_CONFIG;
INSERT INTO BANKING_HOL.LAB.SETUP_CONFIG (KEY, VALUE) VALUES
  ('LAB_START', NULLIF('<% lab_start %>', '')), ('LAB_END', NULLIF('<% lab_end %>', '')),
  ('WAKE_LEAD_MINUTES', '$LEAD'), ('INCLUDE_SEARCH', '$SEARCH_FLAG'),
  ('SETUP_REQUESTED_AT', CURRENT_TIMESTAMP()::VARCHAR);" > /tmp/hol_start_setup.log 2>&1 \
  && ! grep -q "─ Error" /tmp/hol_start_setup.log \
  || { echo "FAILED: could not record the lab settings (see /tmp/hol_start_setup.log)"; grep -A6 "─ Error" /tmp/hol_start_setup.log | head -10; exit 1; }

step "5/5 Build the Lab Companion inside Snowflake (~2 min), then start the lab setup in the background"
# The app first, on a quiet warehouse: built alongside the data load it queued behind it. Not part of
# the task: the app's remote build authenticates as this session, which a task can't.
snow sql -c "$CONN" --role HOL_ADMIN --format json -q "USE WAREHOUSE BANKING_WH; CALL BANKING_HOL.LAB.DEPLOY_LAB_COMPANION()" \
  > /tmp/hol_app.log 2>&1 && ! grep -q "─ Error" /tmp/hol_app.log \
  || { echo "FAILED: Lab Companion build (see /tmp/hol_app.log). Fallback: setup/install_lab_companion.sh $CONN"; grep -A8 "─ Error\|Error" /tmp/hol_app.log | head -12; exit 1; }
URL=$(grep -o 'https://[a-z0-9.-]*snowflakecomputing\.app' /tmp/hol_app.log | tail -1)
[[ -n "$URL" ]] || { echo "FAILED: no Lab Companion URL in /tmp/hol_app.log"; exit 1; }
printf "[%s UTC] Lab Companion: %s\n" "$(date -u +%H:%M:%S)" "$URL"
# The guide Streamlit app is only for accounts that can't run the Lab Companion (INSTALL.sql builds it
# there); remove one left by an earlier provisioning
snow sql -c "$CONN" --role HOL_ADMIN -q "DROP STREAMLIT IF EXISTS BANKING_HOL.LAB.LAB_GUIDE; DELETE FROM BANKING_HOL.LAB.SETUP_CONFIG WHERE KEY = 'GUIDE'" > /tmp/hol_guide_drop.log 2>&1 \
  || echo "  (could not remove the guide Streamlit app: see /tmp/hol_guide_drop.log)"
snow sql -c "$CONN" --role HOL_ADMIN -q "EXECUTE TASK BANKING_HOL.LAB.PROVISION_LAB" > /tmp/hol_start_setup.log 2>&1 \
  && ! grep -q "─ Error" /tmp/hol_start_setup.log \
  || { echo "FAILED: could not start the lab setup (see /tmp/hol_start_setup.log)"; grep -A6 "─ Error" /tmp/hol_start_setup.log | head -10; exit 1; }
echo "  Lab setup started in the background. Follow it in Snowsight: SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS;"

if (( WAIT_ALL )); then
  step "Waiting for the rest of the setup (lab data, packs, dbt, demo: ~10-15 min)"
  wait_for "r['STATUS']=='READY'" 3600 "the lab setup"
  echo "  Lab setup READY"
fi
if (( REFERENCE_BUILD )); then
  step "Reference build (catch-up scripts, DA2, OPS1)"
  run_sql setup/catchup/core_analytics.sql
  run_sql vignettes/da2_semantic_view_analyst/da2.sql
  run_sql vignettes/ops1_payments_360_agent/ops1.sql
fi

printf '\nDone. Lab Companion: %s\n' "$URL"
(( WAIT_ALL )) || printf 'The lab setup carries on inside the account: SELECT * FROM BANKING_HOL.LAB.SETUP_SUMMARY;\n'
printf 'Attendees: grant HOL_PARTICIPANT to each user (setup/03_add_participants.sql).\n'
