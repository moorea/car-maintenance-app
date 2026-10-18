#!/usr/bin/env bash
# Fails when a migration added since BASE (a git ref) sorts before the newest migration BASE
# already has. `supabase db push` refuses such a migration once the newer one is deployed, so the
# deploy after merging would fail. Rename the new file with a later timestamp instead.
set -euo pipefail
base="${1:?usage: check-migration-order.sh <base-ref>}"
newest=$(git ls-tree --name-only "$base" supabase/migrations/ | sort | tail -n 1)
status=0
while IFS= read -r added; do
  [ -z "$added" ] && continue
  if [[ "$added" < "$newest" ]] || [[ "$added" == "$newest" ]]; then
    echo "::error file=$added::$(basename "$added") sorts before $(basename "$newest"), already on $base. Give it a later timestamp."
    status=1
  fi
done < <(git diff --name-only --diff-filter=A "$base"...HEAD -- supabase/migrations/)
exit "$status"
