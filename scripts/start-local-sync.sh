#!/usr/bin/env bash
# Starts a self-hosted PowerSync service against the local Supabase, for the end-to-end sync tests
# (pnpm --filter @car/data test:e2e). Run `supabase start` first. It serves powersync/sync-rules.yaml
# on http://127.0.0.1:8080 and replicates the local database, keeping its buckets in a separate
# database on the same server. Rerunning starts over with a fresh container and storage, since a
# restarted service waits out the old one's lock on the replication stream.
set -euo pipefail

cd "$(dirname "$0")/.."
# Pinned so a PowerSync release cannot change or break CI unannounced.
image="journeyapps/powersync-service:1.27.0"
name="powersync_car-maintenance-app"
network="supabase_network_car-maintenance-app"
db="supabase_db_car-maintenance-app"

if ! docker inspect "$db" > /dev/null 2>&1; then
  echo "Local Supabase is not running; run supabase start first." >&2
  exit 1
fi

docker rm -f "$name" > /dev/null 2>&1 || true
sql() { docker exec "$db" psql -U postgres -v ON_ERROR_STOP=1 -qtAc "$1" > /dev/null; }
# The old service's connection may outlive its container for a moment, keeping the slot active.
sql "select pg_terminate_backend(active_pid) from pg_replication_slots where slot_name like 'powersync%' and active_pid is not null"
sleep 1
sql "select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name like 'powersync%'"
sql "drop database if exists powersync_storage with (force)"
sql "create database powersync_storage"

# The NHTSA job calls a real API every minute; recalls appearing mid-test would make runs vary.
sql "select cron.unschedule(jobid) from cron.job where jobname = 'nhtsa-sync'"

docker run -d --name "$name" --network "$network" -p 8080:8080 \
  -v "$PWD/packages/data/e2e/powersync.yaml:/config/service.yaml:ro" \
  -v "$PWD/powersync/sync-rules.yaml:/config/sync-rules.yaml:ro" \
  -e POWERSYNC_CONFIG_PATH=/config/service.yaml \
  "$image" start -r unified > /dev/null

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/probes/readiness > /dev/null 2>&1; then
    echo "PowerSync is serving on http://127.0.0.1:8080"
    exit 0
  fi
  sleep 2
done
echo "PowerSync did not become ready:" >&2
docker logs "$name" >&2
exit 1
