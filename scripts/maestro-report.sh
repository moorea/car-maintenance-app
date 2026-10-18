#!/usr/bin/env bash
# Prints why Maestro flows failed, from the output and debug directories `maestro test` wrote, so a
# CI failure can be read in the job log without downloading the artifact. Used by the `ios` and
# `android` CI jobs when a flow fails.
#
#   maestro-report.sh <dir>...
set -uo pipefail

for dir in "$@"; do
  [ -d "$dir" ] || continue
  # Each flow's commands-<flow>.json lists its steps with a status and, for the failed one, the error.
  find "$dir" -name 'commands-*.json' -print0 | while IFS= read -r -d '' file; do
    jq -r --arg flow "$(basename "$file" .json | sed -E 's/^commands-\(?//; s/\)$//')" '
      .[]? | select(.metadata.status? == "FAILED")
      | "\($flow): \(.command | tostring | .[:300])\n  \(.metadata.error.message? // "no message")"
    ' "$file" 2> /dev/null
  done
  # Each flow's own log, for the flows that failed: the failed step and what led up to it. When no
  # flow logged a failed step (Maestro failed before or between flows), every log.
  logs=$(find "$dir" -name maestro.log -path '*/logs/*' -exec grep -l 'onCommandFinished: .* FAILED$' {} +)
  [ -n "$logs" ] || logs=$(find "$dir" -name maestro.log)
  while IFS= read -r log; do
    [ -n "$log" ] || continue
    echo "--- last lines of $log"
    tail -n 40 "$log"
  done <<< "$logs"
done
exit 0
