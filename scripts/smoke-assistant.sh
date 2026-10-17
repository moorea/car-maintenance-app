#!/usr/bin/env bash
# Starts the bundled assistant edge function under Deno, as Supabase runs it, and checks it loads
# and turns away requests with no sign-in. Run `pnpm --filter @car/server build` first.
set -euo pipefail

cd "$(dirname "$0")/../supabase/functions/assistant"
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=anon
export SUPABASE_SERVICE_ROLE_KEY=service
PORT=8000

deno run --config deno.json --allow-net --allow-env --allow-read --allow-sys index.js &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT"; then break; fi
  sleep 1
done

body=$(curl -s -w ' %{http_code}' -X POST "http://127.0.0.1:$PORT" \
  -H 'content-type: application/json' -d '{"vehicleId":"x","question":"Hi"}')
echo "$body"
[ "$body" = '{"error":"signed-out"} 401' ] || { echo "Expected a signed-out 401"; exit 1; }

# The quote reader shares the function under /read-quote.
body=$(curl -s -w ' %{http_code}' -X POST "http://127.0.0.1:$PORT/assistant/read-quote" \
  -H 'content-type: application/json' -d '{"photo":{"mediaType":"image/jpeg","base64":"AA=="}}')
echo "$body"
[ "$body" = '{"error":"signed-out"} 401' ] || { echo "Expected a signed-out 401 from read-quote"; exit 1; }
