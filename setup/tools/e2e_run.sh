#!/bin/bash
# End-to-end lab test: run each module's answer key on one account as an attendee would
# (HOL_PARTICIPANT, no secondary roles), in dependency order. Logs per module in $OUT.
# Usage: setup/tools/e2e_run.sh <connection> [module ...]
# Then the Lab Companion checks: export them with
#   node --experimental-strip-types <script importing CHECKS from lab-companion/lib/checks.ts> > checks.json
# and run python3 setup/tools/e2e_checks.py <connection> checks.json <user that ran this>.
# DS2 has no catch-up: train it first with its reference code (ds2_reference.main) as an anonymous procedure.
CONN="$1"; shift
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${E2E_OUT:-/tmp/e2e}"
mkdir -p "$OUT"
cd "$ROOT"

PRE="USE ROLE HOL_PARTICIPANT; USE SECONDARY ROLES NONE; USE WAREHOUSE BANKING_WH;"

# module code -> files to run, in order (catch-ups first where a notebook builds the inputs)
files_for() {
  case "$1" in
    CORE) echo "setup/catchup/core_analytics.sql" ;;
    C360) echo "setup/catchup/client_360.sql" ;;
    DA0) echo "vignettes/da0_interactive_report/da0_report_totals.sql" ;;
    DS1) echo "setup/catchup/ds1_model.sql vignettes/ds1_attrition_model/ds1.sql" ;;
    DS4) echo "setup/catchup/ds4_predictions.sql vignettes/ds4_customer_value/ds4.sql" ;;
    *)   lc=$(echo "$1" | tr 'A-Z' 'a-z'); ls vignettes/${lc}_*/${lc}.sql 2>/dev/null ;;
  esac
}
ORDER=(DE1 CORE DE2 DA0 DA2 DA1 OPS1 OPS2 OPS4 AI1 AI2 AI3 AI4 AI5 GOV1 GOV2 GOV4 GOV5 DE5 DA3 DA4 DS0 DS1 DS2 DS3 DS4 DA5 DA6 OPS3 APP0 APP1 DE4 DE3 GOV3)
(( $# )) && ORDER=("$@")

for m in "${ORDER[@]}"; do
  log="$OUT/$m.log"; : > "$log"; t0=$SECONDS; errs=0
  for f in $(files_for "$m"); do
    [[ -f "$f" ]] || { echo "MISSING $f" >> "$log"; errs=$((errs+1)); continue; }
    { echo "$PRE"; cat "$f"; } > "$OUT/$m.$(basename "$f")"
    echo "### $f" >> "$log"
    snow sql -c "$CONN" --enable-templating NONE -f "$OUT/$m.$(basename "$f")" >> "$log" 2>&1
    errs=$(grep -c "─ Error" "$log")
  done
  printf '%s\t%s\t%ss\n' "$m" "$( ((errs)) && echo "ERRORS=$errs" || echo OK)" "$((SECONDS - t0))" | tee -a "$OUT/summary.tsv"
done
