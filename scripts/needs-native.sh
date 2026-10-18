#!/usr/bin/env bash
# Prints native=false when a pull request changes nothing the iOS and Android builds or their UI
# flows depend on, so CI can skip those jobs; native=true otherwise, and always outside pull
# requests. Used by the `changes` job in ci.yml, on the pull request's merge commit, whose first
# parent is the base branch.
set -euo pipefail

if [ "${GITHUB_EVENT_NAME:-}" != pull_request ]; then
  echo native=true
  exit 0
fi

# Files that never reach the app: other packages and services, docs, tests and lint config. A new
# path anywhere else runs the native jobs, so this list can only make CI skip too little.
skip='^(docs|supabase|powersync|apps/site|packages/server|packages/data/e2e)/'
skip+='|^\.github/workflows/(deploy-[a-z-]+|sweep-files|sync-rules)\.yml$'
skip+='|^scripts/(push-auth-emails|smoke-assistant|start-local-sync)\.sh$'
skip+='|\.md$|\.test\.tsx?$|(^|/)vitest(\.[a-z0-9]+)?\.config\.ts$'
skip+='|^(eslint\.config\.mjs|\.prettierrc\.json|\.prettierignore)$'

changed=$(git diff --name-only HEAD^1 HEAD)
native=$(printf '%s\n' "$changed" | grep -vE "$skip" | grep -v '^$' || true)
if [ -n "$native" ]; then
  echo "Changes the native jobs depend on:" >&2
  echo "$native" >&2
  echo native=true
else
  echo "No changes the native jobs depend on." >&2
  echo native=false
fi
