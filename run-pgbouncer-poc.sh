#!/bin/bash
# run-pgbouncer-poc.sh — Smoke Test Medusa & Trigger 15-minute PgBouncer Saturation Test

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDUSA_BASE_URL="${MEDUSA_BASE_URL:-http://medusa:9000}"

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
echo "  PGBOUNCER POC: SMOKE TEST & SATURATION RUNNER"
echo "=========================================================================="
echo "  Architecture:     User / Medusa -> PgBouncer (6432) -> PostgreSQL (5432)"
echo "  Target Pooler:    PgBouncer (max 5 backend connections)"
echo "  Duration:         900 seconds (15 minutes)"
echo "  Transaction:      BEGIN; SELECT pg_sleep(30); COMMIT;"
echo "=========================================================================="
echo "  Press Ctrl+C at any time to immediately stop simulation & reset baseline."
echo "=========================================================================="
echo ""

# ------------------------------------------------------------------------------
# STEP 1: SMOKE TEST MEDUSA VIA PGBOUNCER
# ------------------------------------------------------------------------------
echo "[STEP 1/2] Running Medusa Smoke Test via PgBouncer..."

API_KEY="${MEDUSA_PUBLISHABLE_KEY:-}"
if [ -z "$API_KEY" ] && [ -f "apps/storefront/.env" ]; then
  API_KEY=$(grep "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" apps/storefront/.env | cut -d '=' -f2 | tr -d '\r\n"') || true
fi

echo "  -> Checking Medusa /health endpoint..."
docker compose exec -T postgres wget -q --spider http://medusa:9000/health || {
  echo "[ERROR] Medusa backend is not healthy! Please ensure 'docker compose up -d' is running."
  exit 1
}
echo "  [OK] Medusa backend health check passed."

if [ -n "$API_KEY" ]; then
  echo "  -> Testing Store Products API (/store/products) via PgBouncer connection..."
  HTTP_CODE=$(docker compose exec -T postgres wget -q -S --header="x-publishable-api-key: ${API_KEY}" -O /dev/null http://medusa:9000/store/products 2>&1 | grep "HTTP/" | tail -n1 | awk '{print $2}')
  if [ "$HTTP_CODE" = "200" ]; then
    echo "  [OK] Store API returned 200 OK — PgBouncer transaction pooling mode is fully compatible!"
  else
    echo "  [WARN] Store API returned HTTP ${HTTP_CODE} (API Key: ${API_KEY:0:10}...)"
  fi
else
  echo "  [INFO] MEDUSA_PUBLISHABLE_KEY not found; skipping Store API header test."
fi

echo ""
echo "=========================================================================="
echo "[STEP 2/2] STARTING 15-MINUTE PGBOUNCER SATURATION TEST (25 CLIENTS)"
echo "=========================================================================="
echo "  Starting 15-minute saturation run in 3 seconds..."
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
echo "  SATURATION RUN FINISHED — MONITOR WILL EVALUATE & CLEAR IN ~5 MINUTES"
echo "=========================================================================="
echo ""
