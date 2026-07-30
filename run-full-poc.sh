#!/bin/bash
# run-full-poc.sh — Master Unified POC Runner (15-Minute Concurrency & Disk Log Saturation Test)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"

mkdir -p "$LOG_DIR"

# ------------------------------------------------------------------------------
# SIGNAL TRAP HANDLER FOR CLEAN CONTROLLED STOP (CTRL+C / SIGINT / SIGTERM / EXIT)
# ------------------------------------------------------------------------------
cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "=========================================================================="
  echo "  STOP SIGNAL / EXIT DETECTED — RUNNING AUTOMATIC CLEANUP & ENVIRONMENT RESET"
  echo "=========================================================================="
  "${SCRIPT_DIR}/cleanup-full-poc.sh"
}
trap cleanup INT TERM EXIT

echo ""
echo "=========================================================================="
echo "  UNIFIED POC RUNNER: PGBOUNCER POOL & DISK LOG SATURATION (15 MINUTES)"
echo "=========================================================================="
echo "  Flow Architecture:"
echo "  1. Traffic Spike    --> High concurrency load test"
echo "  2. Pool Saturation  --> PgBouncer 5 backend connections max (sv_active = 5, cl_waiting ~20)"
echo "  3. Log Saturation   --> Transaction & error log explosion -> Disk Log 85% Full"
echo "  4. Service Impact   --> Downtime / Query Timeout -> Datadog Alert (avg(last_5m))"
echo "=========================================================================="
echo "  Press Ctrl+C at any time to immediately stop simulation & reset baseline."
echo "=========================================================================="
echo ""

# ------------------------------------------------------------------------------
# STEP 1: MEDUSA & PGBOUNCER SMOKE TEST
# ------------------------------------------------------------------------------
echo "[STEP 1/3] Running Medusa & PgBouncer Smoke Test..."

API_KEY="${MEDUSA_PUBLISHABLE_KEY:-}"
if [ -z "$API_KEY" ] && [ -f "${SCRIPT_DIR}/apps/storefront/.env" ]; then
  API_KEY=$(grep "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" "${SCRIPT_DIR}/apps/storefront/.env" | cut -d '=' -f2 | tr -d '\r\n"') || true
fi

echo "  -> Checking Medusa /health endpoint..."
docker compose exec -T postgres wget -q --spider http://medusa:9000/health || {
  echo "[ERROR] Medusa backend is not healthy! Please start container with 'docker compose up -d'."
  exit 1
}
echo "  [OK] Medusa backend health check passed."

if [ -n "$API_KEY" ]; then
  echo "  -> Testing Store API via PgBouncer..."
  HTTP_CODE=$(docker compose exec -T postgres wget -q -S --header="x-publishable-api-key: ${API_KEY}" -O /dev/null http://medusa:9000/store/products 2>&1 | grep "HTTP/" | tail -n1 | awk '{print $2}')
  if [ "$HTTP_CODE" = "200" ]; then
    echo "  [OK] Store API returned 200 OK — PgBouncer transaction pooling mode is compatible!"
  fi
fi

# ------------------------------------------------------------------------------
# STEP 2: TRIGGER LOG SATURATION GENERATOR ON ISOLATED 200MB VOLUME
# ------------------------------------------------------------------------------
echo ""
echo "[STEP 2/3] Activating Disk Log Saturation Generator..."
"${SCRIPT_DIR}/setup-disk-volume.sh" || true
touch "$TRIGGER_FILE"
echo "  [OK] Log generator triggered (target: 85% disk log capacity on 200MB volume)."

# ------------------------------------------------------------------------------
# STEP 3: EXECUTE 15-MINUTE PGBOUNCER SATURATION (25 CLIENTS)
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================================="
echo "[STEP 3/3] STARTING 15-MINUTE CONCURRENCY SATURATION TEST (25 CLIENTS)"
echo "=========================================================================="
echo "  Starting 15-minute run in 3 seconds..."
sleep 3

docker compose exec -T postgres pgbench \
  -h pgbouncer \
  -p 6432 \
  -U postgres \
  -c 25 \
  -j 5 \
  -T 900 \
  -n \
  -f /load-test/pgbench-saturation.sql \
  medusa-store || true

echo ""
echo "=========================================================================="
echo "  SATURATION RUN FINISHED — DATADOG COMPOSITE MONITOR WILL ALERT"
echo "=========================================================================="
echo "  Acceptance Criteria (Minutes 5 to 15):"
echo "  1. PgBouncer sv_active = 5, cl_waiting ~20"
echo "  2. Disk Log Volume in_use >= 0.85 (85%)"
echo "  3. Datadog Composite Monitor triggers ALERT / CRITICAL"
echo "=========================================================================="
echo ""
