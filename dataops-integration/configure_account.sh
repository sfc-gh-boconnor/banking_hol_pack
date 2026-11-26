#!/usr/bin/env bash
# DataOps configure step: provision one account and schedule the Lab Companion
# wake-up from the DataOps event times. See README.md.
set -euo pipefail

CONN="${1:?usage: configure_account.sh <snow-connection-name>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${EVENT_START_DATETIME:?EVENT_START_DATETIME not set}"
: "${EVENT_END_DATETIME:?EVENT_END_DATETIME not set}"

ARGS=("$CONN")
[[ "${REFERENCE_BUILD:-false}" == "true" ]] && ARGS+=("--with-reference-build")

# INSTALL_MODE=DATAOPS: attendees get their own users, so the Lab Companion hides "do the lab as yourself"
INSTALL_MODE=DATAOPS LAB_START="$EVENT_START_DATETIME" LAB_END="$EVENT_END_DATETIME" \
  bash "$ROOT/setup/provision_account.sh" "${ARGS[@]}"
