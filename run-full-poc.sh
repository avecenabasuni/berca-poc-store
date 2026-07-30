#!/bin/bash
# run-full-poc.sh — Master Unified POC Runner (15-Minute Concurrency & Disk Log Saturation Test)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"

# ------------------------------------------------------------------------------
# 1. PREFLIGHT CHECKS (LINUX ENGINE, DOCKER DAEMON, DD_API_KEY, PRIVILEGES)
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================================="
echo "  UNIFIED POC RUNNER: PREFLIGHT CHECKS & ENVIRONMENT VALIDATION"
echo "=========================================================================="

if [ "$(uname -s)" != "Linux" ]; then
  echo "[ERROR] This POC disk saturation scenario requires Linux native Docker Engine."
  echo "        Current OS '$(uname -s)' is not supported for real loopback filesystem mounts."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[ERROR] Docker daemon is not running or current user cannot connect to Docker socket."
  exit 1
fi

if [ -z "${DD_API_KEY:-}" ]; then
  if [ -f ".env" ] && grep -q "^DD_API_KEY=" .env; then
    DD_API_KEY=$(grep "^DD_API_KEY=" .env | cut -d '=' -f2 | tr -d '\r\n"')
    export DD_API_KEY
  fi
fi

if [ -z "${DD_API_KEY:-}" ]; then
  echo "[ERROR] DD_API_KEY is missing or empty! Datadog Agent cannot send metrics without API key."
  echo "        Please set DD_API_KEY in environment or .env file."
  exit 1
fi

echo "  [OK] Linux OS detected: $(uname -s)"
echo "  [OK] Docker daemon is active and responsive."
echo "  [OK] DD_API_KEY is configured (Length: ${#DD_API_KEY} chars)."

# ------------------------------------------------------------------------------
# 2. SIGNAL TRAP HANDLER FOR CLEAN CONTROLLED STOP
# ------------------------------------------------------------------------------
cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "=========================================================================="
  echo "  STOP SIGNAL / EXIT DETECTED — RUNNING AUTOMATIC CLEANUP & RESET"
  echo "=========================================================================="
  "${SCRIPT_DIR}/cleanup-full-poc.sh"
}
trap cleanup INT TERM EXIT

echo ""
echo "=========================================================================="
echo "  UNIFIED POC RUNNER: PGBOUNCER POOL & DISK LOG SATURATION (15 MINUTES)"
echo "=========================================================================="
echo "  Press Ctrl+C at any time to immediately stop simulation & reset baseline."
echo "=========================================================================="
echo ""

# ------------------------------------------------------------------------------
# STEP 1: MEDUSA & PGBOUNCER SMOKE TEST
# ------------------------------------------------------------------------------
echo "[STEP 1/4] Running Medusa & PgBouncer Smoke Test..."

API_KEY="${MEDUSA_PUBLISHABLE_KEY:-}"
if [ -z "$API_KEY" ] && [ -f "${SCRIPT_DIR}/apps/storefront/.env" ]; then
  API_KEY=$(grep "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" "${SCRIPT_DIR}/apps/storefront/.env" | cut -d '=' -f2 | tr -d '\r\n"') || true
fi

docker compose exec -T postgres wget -q --spider http://medusa:9000/health || {
  echo "[ERROR] Medusa backend is not healthy! Please start container with 'docker compose up -d'."
  exit 1
}
echo "  [OK] Medusa backend health check passed."

# ------------------------------------------------------------------------------
# STEP 2: MOUNT ISOLATED 200MB LOOPBACK VOLUME & RESTART CONSUMER CONTAINERS
# ------------------------------------------------------------------------------
echo ""
echo "[STEP 2/4] Setting Up Isolated 200MB Volume & Synchronizing Container Mounts..."

# 2.1 Stop consumers prior to loopback mount
echo "  -> Stopping consumer containers (log-generator, datadog-agent)..."
docker compose stop log-generator datadog-agent >/dev/null 2>&1 || true

# 2.2 Mount 200MB loopback volume
"${SCRIPT_DIR}/setup-disk-volume.sh"

# 2.3 Restart consumers so bind mount points to the active loopback filesystem
echo "  -> Re-creating consumer containers onto active 200MB loopback volume..."
docker compose up -d --force-recreate log-generator datadog-agent >/dev/null 2>&1

# 2.4 Verify from inside BOTH containers
echo "  -> Verifying filesystem mount inside log-generator container..."
LOG_GEN_FS=$(docker compose exec -T log-generator df -T /var/log/poc-app | tail -1 | awk '{print $2}')
if [ "$LOG_GEN_FS" != "ext4" ]; then
  echo "[ERROR] log-generator container /var/log/poc-app is on '${LOG_GEN_FS}', expected 'ext4'."
  exit 1
fi

echo "  -> Verifying filesystem mount inside datadog-agent container..."
AGENT_FS=$(docker compose exec -T datadog-agent df -T /var/log/poc-app | tail -1 | awk '{print $2}')
if [ "$AGENT_FS" != "ext4" ]; then
  echo "[ERROR] datadog-agent container /var/log/poc-app is on '${AGENT_FS}', expected 'ext4'."
  exit 1
fi
echo "  [OK] Both containers verified mounted to isolated 200MB ext4 volume."

# ------------------------------------------------------------------------------
# STEP 3: TRIGGER LOG SATURATION GENERATOR
# ------------------------------------------------------------------------------
echo ""
echo "[STEP 3/4] Activating Disk Log Saturation Generator..."
touch "$TRIGGER_FILE"
echo "  [OK] Log generator triggered (target: 85% capacity of 200MB volume)."

# ------------------------------------------------------------------------------
# STEP 4: EXECUTE 15-MINUTE PGBOUNCER SATURATION (25 CLIENTS)
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================================="
echo "[STEP 4/4] STARTING 15-MINUTE CONCURRENCY SATURATION & SOAK TEST"
echo "=========================================================================="
echo "  Lifecycle Timeline:"
echo "  - Min 0-5:   Fault generation (sv_active=5, cl_waiting ~20, disk=85%)"
echo "  - Min 5:     Datadog Composite Monitor triggers ALERT"
echo "  - Min 5-6:   Datadog Workflow fires Ansible AWX Job (SET pool=25/25, truncate log)"
echo "  - Min 6-10:  Datadog avg(last_5m) window evaluates recovery -> Monitor OK"
echo "  - Min 10-15: Post-remediation soak test (traffic active, cl_waiting=0)"
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
  medusa-store

echo ""
echo "=========================================================================="
echo "  15-MINUTE RUN COMPLETED — CLOSED-LOOP REMEDIATION DEMO FINISHED"
echo "=========================================================================="
echo "  Verification Checklist for Evaluators:"
echo "  1. Datadog UI: Verify Composite Monitor transition OK -> ALERT (Min 5) -> OK (Min 6-10)."
echo "  2. Ansible AWX: Verify Job Template execution timestamp & log (Job triggered by Webhook)."
echo "  3. PgBouncer: Verify 'SHOW POOLS' showed cl_waiting=0 during soak test (Min 10-15)."
echo "=========================================================================="
echo ""
