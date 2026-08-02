#!/bin/bash
# Canonical baseline reset used by the bounded demo control interface.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"
LOG_FILE="${LOG_DIR}/app-saturation.log"
STATE_DIR="${SCRIPT_DIR}/docker/demo-state"
IMPACT_MARKER="${STATE_DIR}/disk-degraded"
IMG_FILE="/tmp/poc-log-disk.img"
SERVICE_ENV_FILE="/etc/default/berca-poc-simulation"
EXIT_CODE=0
SUDO=()
SAFE_DISK_TARGET=true
POC_MOUNT_VERIFIED=false

cd "$SCRIPT_DIR" || exit 1

if [ -z "${DD_API_KEY:-}" ] && [ -f "${SCRIPT_DIR}/.env" ]; then
  DD_API_KEY=$(sed -n 's/^DD_API_KEY=//p' "${SCRIPT_DIR}/.env" | tail -1 | tr -d '\r\n"')
  export DD_API_KEY
fi
if [ -z "${DD_API_KEY:-}" ] && [ -r "$SERVICE_ENV_FILE" ]; then
  DD_API_KEY=$(sed -n 's/^DD_API_KEY=//p' "$SERVICE_ENV_FILE" | tail -1 | tr -d '\r\n"')
  export DD_API_KEY
fi

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO=(sudo)
  else
    echo "[ERROR] Cleanup requires root or sudo for loopback unmount operations."
    exit 1
  fi
fi

for required_command in docker findmnt losetup mountpoint sync truncate; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "[ERROR] Required cleanup command '${required_command}' is unavailable."
    exit 1
  fi
done

record_error() {
  echo "  [ERROR] $1"
  EXIT_CODE=1
}

wait_for() {
  local timeout_seconds="$1"
  shift
  local started_at
  started_at=$(date +%s)
  until "$@" >/dev/null 2>&1; do
    if [ $(( $(date +%s) - started_at )) -ge "$timeout_seconds" ]; then
      return 1
    fi
    sleep 2
  done
}

echo ""
echo "=========================================================================="
echo "  VERIFIED FULL POC CLEANUP AND BASELINE RESET"
echo "=========================================================================="

echo "-> Ensuring PostgreSQL and PgBouncer are available for runtime reset..."
if docker compose up -d postgres pgbouncer >/dev/null 2>&1 && \
   wait_for 60 docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -h pgbouncer -p 6432 -U postgres pgbouncer -c "SHOW VERSION;"; then
  BASELINE_CONFIG=$(docker compose exec -T postgres psql -v ON_ERROR_STOP=1 \
    -h pgbouncer -p 6432 -U postgres pgbouncer -tA -F '|' \
    -c "SHOW CONFIG;" 2>/dev/null || true)
  CURRENT_POOL_SIZE=$(printf '%s\n' "$BASELINE_CONFIG" | \
    awk -F '|' '$1 == "default_pool_size" { print $2 }')
  CURRENT_MAX_CONN=$(printf '%s\n' "$BASELINE_CONFIG" | \
    awk -F '|' '$1 == "max_db_connections" { print $2 }')

  if [ "$CURRENT_POOL_SIZE" = "5" ] && [ "$CURRENT_MAX_CONN" = "5" ]; then
    echo "  [OK] PgBouncer runtime configuration is already at the 5/5 baseline."
  elif ! docker compose exec -T postgres psql -v ON_ERROR_STOP=1 \
    -h pgbouncer -p 6432 -U postgres pgbouncer \
    -c "SET default_pool_size=5;" \
    -c "SET max_db_connections=5;" >/dev/null; then
    record_error "PgBouncer runtime reset command failed."
  fi
else
  record_error "PostgreSQL/PgBouncer did not become ready for baseline reset."
fi

echo "-> Stopping active pgbench clients..."
docker compose exec -T postgres pkill -TERM -f pgbench >/dev/null 2>&1 || true

# Establish ownership before changing anything under the disk target.
if mountpoint -q "$LOG_DIR"; then
  MOUNT_SOURCE=$(findmnt -n -o SOURCE --target "$LOG_DIR" 2>/dev/null || true)
  MOUNT_FSTYPE=$(findmnt -n -o FSTYPE --target "$LOG_DIR" 2>/dev/null || true)
  LOOP_REFS=$("${SUDO[@]}" losetup -j "$IMG_FILE" 2>/dev/null || true)

  if [ "$MOUNT_FSTYPE" = "ext4" ] && [[ "$MOUNT_SOURCE" =~ ^/dev/loop[0-9]+$ ]] && \
     printf '%s\n' "$LOOP_REFS" | awk -F ':' -v source="$MOUNT_SOURCE" \
       '$1 == source { found=1 } END { exit !found }'; then
    POC_MOUNT_VERIFIED=true
  else
    SAFE_DISK_TARGET=false
    record_error "Refusing disk cleanup: ${LOG_DIR} is source='${MOUNT_SOURCE:-unknown}', fstype='${MOUNT_FSTYPE:-unknown}', not the POC image."
  fi
fi

echo "-> Removing verified POC state..."
if [ "$SAFE_DISK_TARGET" = true ] && ! rm -f -- "$TRIGGER_FILE"; then
  record_error "Unable to remove ${TRIGGER_FILE}."
fi
if ! rm -f -- "$IMPACT_MARKER"; then
  record_error "Unable to remove ${IMPACT_MARKER}."
fi

echo "-> Stopping filesystem consumers..."
if ! docker compose stop log-generator datadog-agent >/dev/null 2>&1; then
  record_error "Unable to stop log-generator/datadog-agent."
fi

if [ "$SAFE_DISK_TARGET" = true ] && [ -f "$LOG_FILE" ]; then
  if ! truncate -s 0 "$LOG_FILE"; then
    record_error "Unable to truncate the POC saturation log."
  fi
fi
sync || record_error "Filesystem sync failed."

if [ "$POC_MOUNT_VERIFIED" = true ]; then
  echo "-> Unmounting ${LOG_DIR}..."
  if ! "${SUDO[@]}" umount "$LOG_DIR"; then
    record_error "Unable to unmount ${LOG_DIR}; preserving the image for recovery."
  fi
fi

if [ "$SAFE_DISK_TARGET" != true ]; then
  echo "  [WARN] Disk image and target were preserved because mount ownership was not verified."
elif mountpoint -q "$LOG_DIR"; then
  record_error "Loopback filesystem remains mounted."
else
  if command -v losetup >/dev/null 2>&1 && [ -f "$IMG_FILE" ]; then
    while IFS=: read -r loop_device _; do
      [ -n "$loop_device" ] || continue
      if ! "${SUDO[@]}" losetup -d "$loop_device"; then
        record_error "Unable to detach ${loop_device}."
      fi
    done < <("${SUDO[@]}" losetup -j "$IMG_FILE" 2>/dev/null || true)
  fi

  if command -v losetup >/dev/null 2>&1 && [ -n "$("${SUDO[@]}" losetup -j "$IMG_FILE" 2>/dev/null)" ]; then
    record_error "A loop device still references ${IMG_FILE}; image was preserved."
  elif [ -f "$IMG_FILE" ] && ! "${SUDO[@]}" rm -f -- "$IMG_FILE"; then
    record_error "Unable to delete ${IMG_FILE}."
  fi
fi

if [ "$SAFE_DISK_TARGET" = true ]; then
  echo "-> Rebuilding baseline log directory..."
  if ! mkdir -p "$LOG_DIR" || ! chmod 0775 "$LOG_DIR"; then
    record_error "Unable to create the baseline log directory."
  fi
  if ! printf '{"timestamp":"%s","level":"INFO","service":"berca-checkout","event":"service_ready"}\n' \
    "$(date -Iseconds)" > "$LOG_FILE"; then
    record_error "Unable to write the baseline readiness log."
  fi

  echo "-> Re-creating consumers on the baseline directory..."
  if ! docker compose up -d --force-recreate log-generator datadog-agent >/dev/null 2>&1; then
    record_error "Unable to re-create log-generator/datadog-agent."
  fi

  if ! wait_for 60 docker compose exec -T log-generator test -d /var/log/poc-app; then
    record_error "log-generator did not return to running baseline state."
  fi
  if ! wait_for 120 docker compose exec -T datadog-agent agent health; then
    record_error "Datadog Agent did not return to a healthy state."
  fi
else
  record_error "Consumers were not re-created because the disk target was not safe to rebuild."
fi

CONFIG_OUT=$(docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -h pgbouncer -p 6432 -U postgres pgbouncer \
  -tA -F '|' -c "SHOW CONFIG;" 2>/dev/null || true)
POOLS_OUT=$(docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -h pgbouncer -p 6432 -U postgres pgbouncer \
  -tA -F '|' -c "SHOW POOLS;" 2>/dev/null || true)
POOL_SIZE=$(printf '%s\n' "$CONFIG_OUT" | awk -F '|' '$1 == "default_pool_size" { print $2 }')
MAX_CONN=$(printf '%s\n' "$CONFIG_OUT" | awk -F '|' '$1 == "max_db_connections" { print $2 }')
POOL_ROW_COUNT=$(printf '%s\n' "$POOLS_OUT" | awk -F '|' '$1 == "medusa-store" && $2 == "postgres" { count++ } END { print count+0 }')
CL_WAITING=$(printf '%s\n' "$POOLS_OUT" | awk -F '|' '$1 == "medusa-store" && $2 == "postgres" { print $4 }')

if [ "$POOL_SIZE" != "5" ] || [ "$MAX_CONN" != "5" ]; then
  record_error "PgBouncer baseline is ${POOL_SIZE:-unknown}/${MAX_CONN:-unknown}, expected 5/5."
fi
if [ "$POOL_ROW_COUNT" -ne 1 ] || [ "${CL_WAITING:-unknown}" != "0" ]; then
  record_error "Expected one medusa-store/postgres pool row with cl_waiting=0."
fi
if [ "$SAFE_DISK_TARGET" = true ] && [ -e "$TRIGGER_FILE" ]; then
  record_error "Saturation trigger still exists."
fi
if [ -e "$IMPACT_MARKER" ]; then
  record_error "Disk impact marker still exists."
fi
if [ "$SAFE_DISK_TARGET" = true ] && mountpoint -q "$LOG_DIR"; then
  record_error "Baseline log directory is still a mountpoint."
fi
if [ "$SAFE_DISK_TARGET" = true ] && [ ! -s "$LOG_FILE" ]; then
  record_error "Baseline readiness log is missing or empty."
fi

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "  [OK] Verified baseline: pool=5/5, cl_waiting=0, no loop mount, consumers healthy."
else
  echo "  [WARN] Cleanup attempted every stage but one or more validations failed."
fi
echo "=========================================================================="
exit "$EXIT_CODE"
