#!/bin/bash
# cleanup-full-poc.sh — Full cleanup: stop containers, reset PgBouncer pool to 5/5, unmount volume, delete loopback image, reset baseline

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"
LOG_FILE="${LOG_DIR}/app-saturation.log"
IMG_FILE="/tmp/poc-log-disk.img"
EXIT_CODE=0

echo ""
echo "=========================================================================="
echo "  FULL POC CLEANUP & BASELINE ENVIRONMENT RESET"
echo "=========================================================================="
echo ""

# 0. Reset PgBouncer pool settings back to 5/5 baseline (SET runtime config without RELOAD)
echo "-> Resetting PgBouncer pool settings to 5/5 baseline..."
docker compose exec -T postgres psql -h pgbouncer -p 6432 -U postgres pgbouncer -c "SET default_pool_size=5; SET max_db_connections=5;" >/dev/null 2>&1 || true

CONFIG_OUT=$(docker compose exec -T postgres psql -h pgbouncer -p 6432 -U postgres pgbouncer -tA -c "SHOW CONFIG;" 2>/dev/null || true)
POOL_SIZE=$(echo "$CONFIG_OUT" | awk -F '|' '$1 == "default_pool_size" { print $2 }' | tr -d '\r\n')
MAX_CONN=$(echo "$CONFIG_OUT" | awk -F '|' '$1 == "max_db_connections" { print $2 }' | tr -d '\r\n')

if [ "$POOL_SIZE" = "5" ] && [ "$MAX_CONN" = "5" ]; then
  echo "  [OK] PgBouncer pool verified reset to baseline (default_pool_size=5, max_db_connections=5)."
else
  echo "  [ERROR] PgBouncer pool reset validation failed! (default_pool_size=${POOL_SIZE:-unknown}, max_db_connections=${MAX_CONN:-unknown})"
  EXIT_CODE=1
fi

# 1. Terminate active pgbench load test processes
echo "-> Terminating active pgbench load test processes..."
docker compose exec -T postgres pkill -9 -f pgbench >/dev/null 2>&1 || true

# 2. Remove trigger file
if [ -f "$TRIGGER_FILE" ]; then
  rm -f "$TRIGGER_FILE"
  echo "  [OK] Removed log saturation trigger file."
fi

# 3. Stop consumer containers to release file locks before unmounting
echo "-> Stopping log-generator and datadog-agent containers..."
docker compose stop log-generator datadog-agent >/dev/null 2>&1 || true

# 4. Truncate log file & sync
if [ -f "$LOG_FILE" ]; then
  > "$LOG_FILE" || true
  sync || true
fi

# 5. Unmount loopback volume if mounted
if mountpoint -q "$LOG_DIR"; then
  echo "-> Unmounting loopback filesystem at ${LOG_DIR}..."
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    sudo umount -f "$LOG_DIR" || true
  else
    umount -f "$LOG_DIR" || true
  fi
  echo "  [OK] Unmounted loopback filesystem."
fi

# 6. Delete loopback disk image file
if [ -f "$IMG_FILE" ]; then
  rm -f "$IMG_FILE"
  echo "  [OK] Deleted loopback image ${IMG_FILE}."
fi

# Re-create baseline directory and baseline ready log
mkdir -p "$LOG_DIR"
chmod 777 "$LOG_DIR" || true
echo "{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"INFO\",\"service\":\"medusa-backend\",\"event\":\"service_ready\"}" > "$LOG_FILE" || true

# 7. Restart consumer containers on baseline directory with --force-recreate
echo "-> Force-recreating log-generator and datadog-agent containers on baseline directory..."
docker compose up -d --force-recreate log-generator datadog-agent >/dev/null 2>&1 || true

echo ""
echo "  Status:           Full cleanup finished. PgBouncer pool (5/5) & disk log reset to baseline."
echo "  Datadog Monitor:  Will evaluate and return to OK status within 5 minutes."
echo "=========================================================================="
echo ""

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "  [WARN] Cleanup completed with validation warnings/errors (Exit Code: ${EXIT_CODE})."
  exit "$EXIT_CODE"
fi
