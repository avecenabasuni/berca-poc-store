#!/bin/bash
# Deterministic control surface for the bounded Berca hero demo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_FILE="${POC_DEMO_LOCK_FILE:-/tmp/berca-poc-demo-control.lock}"
POOL_HOG_CONTAINER="berca_poc_pool_hog"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
DISK_TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"
DISK_LOG_FILE="${LOG_DIR}/app-saturation.log"
STATE_DIR="${SCRIPT_DIR}/docker/demo-state"
DISK_IMPACT_MARKER="${STATE_DIR}/disk-degraded"
DISK_IMAGE_FILE="/tmp/poc-log-disk.img"
PGBOUNCER_TARGET_DB="medusa-store"
PGBOUNCER_TARGET_USER="postgres"
BASELINE_POOL_SIZE=5
BASELINE_MAX_CONNECTIONS=5
WAIT_TIMEOUT_SECONDS="${POC_DEMO_WAIT_TIMEOUT_SECONDS:-60}"
DISK_WAIT_TIMEOUT_SECONDS="${POC_DISK_WAIT_TIMEOUT_SECONDS:-180}"
SAFE_DISK_USAGE_PCT="${POC_SAFE_DISK_USAGE_PCT:-20}"
SUDO=()

cd "$SCRIPT_DIR"

usage() {
  cat <<'EOF'
Usage: ./demo-control.sh <action>

Actions:
  pool          Start the dedicated PgBouncer pool-hog fault.
  recover-pool  Stop only the dedicated pool-hog and verify recovery.
  disk          Start the isolated synthetic log-disk fault.
  recover-disk  Recover only the isolated synthetic log volume.
  reset         Run the canonical full baseline reset.
  status        Print the observed POC state as JSON.
EOF
}

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' is unavailable."
}

wait_for() {
  local description="$1"
  local timeout_seconds="$2"
  shift 2
  local started_at
  started_at=$(date +%s)

  until "$@" >/dev/null 2>&1; do
    if [ $(( $(date +%s) - started_at )) -ge "$timeout_seconds" ]; then
      echo "[ERROR] Timed out waiting for ${description} after ${timeout_seconds}s." >&2
      return 1
    fi
    sleep 2
  done
}

preflight() {
  [ "$(uname -s)" = "Linux" ] || fail "The demo control interface must run on the Linux Docker VM."

  require_command docker
  require_command flock
  require_command awk
  require_command date
  require_command df
  require_command findmnt
  require_command mountpoint
  require_command stat

  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
  if [ "$ACTION" != "status" ]; then
    docker info >/dev/null 2>&1 || fail "Docker is unavailable or the current user cannot access it."
  fi

  case "$ACTION" in
    disk|recover-disk|reset)
      require_command losetup
      require_command sync
      require_command truncate
      if [ "$(id -u)" -ne 0 ]; then
        require_command sudo
        SUDO=(sudo)
      fi
      ;;
  esac
}

pgbouncer_query() {
  local sql="$1"
  docker compose exec -T postgres psql \
    -v ON_ERROR_STOP=1 \
    -h pgbouncer \
    -p 6432 \
    -U postgres \
    pgbouncer \
    -tA \
    -F '|' \
    -c "$sql"
}

ensure_pgbouncer_ready() {
  docker compose up -d postgres pgbouncer >/dev/null
  wait_for "PgBouncer admin console" "$WAIT_TIMEOUT_SECONDS" \
    pgbouncer_query "SHOW VERSION;"
}

read_pool_config() {
  local config_out
  if ! config_out=$(pgbouncer_query "SHOW CONFIG;"); then
    return 1
  fi
  POOL_SIZE=$(printf '%s\n' "$config_out" | awk -F '|' '$1 == "default_pool_size" { print $2 }')
  MAX_CONNECTIONS=$(printf '%s\n' "$config_out" | awk -F '|' '$1 == "max_db_connections" { print $2 }')
  [[ "$POOL_SIZE" =~ ^[0-9]+$ ]] && [[ "$MAX_CONNECTIONS" =~ ^[0-9]+$ ]]
}

read_pool_metrics() {
  local pools_out
  if ! pools_out=$(pgbouncer_query "SHOW POOLS;"); then
    return 1
  fi
  POOL_ROW_COUNT=$(printf '%s\n' "$pools_out" | awk -F '|' \
    -v db="$PGBOUNCER_TARGET_DB" -v user="$PGBOUNCER_TARGET_USER" \
    '$1 == db && $2 == user { count++ } END { print count+0 }')

  if [ "$POOL_ROW_COUNT" -eq 1 ]; then
    CL_WAITING=$(printf '%s\n' "$pools_out" | awk -F '|' \
      -v db="$PGBOUNCER_TARGET_DB" -v user="$PGBOUNCER_TARGET_USER" \
      '$1 == db && $2 == user { print $4 }')
    SV_ACTIVE=$(printf '%s\n' "$pools_out" | awk -F '|' \
      -v db="$PGBOUNCER_TARGET_DB" -v user="$PGBOUNCER_TARGET_USER" \
      '$1 == db && $2 == user { print $5 }')
  elif [ "$POOL_ROW_COUNT" -eq 0 ]; then
    CL_WAITING=0
    SV_ACTIVE=0
  else
    CL_WAITING=-1
    SV_ACTIVE=-1
  fi
}

pool_config_is_baseline() {
  read_pool_config
  [ "$POOL_SIZE" = "$BASELINE_POOL_SIZE" ] && \
    [ "$MAX_CONNECTIONS" = "$BASELINE_MAX_CONNECTIONS" ]
}

pool_fault_is_observed() {
  read_pool_metrics
  [ "$POOL_ROW_COUNT" -eq 1 ] && \
    [ "$SV_ACTIVE" -ge "$BASELINE_POOL_SIZE" ] && \
    [ "$CL_WAITING" -gt 0 ]
}

pool_is_recovered() {
  pool_config_is_baseline || return 1
  read_pool_metrics
  [ "$POOL_ROW_COUNT" -le 1 ] && [ "$CL_WAITING" -eq 0 ]
}

pool_hog_is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$POOL_HOG_CONTAINER" 2>/dev/null || true)" = "true" ]
}

pool_hog_exists() {
  docker inspect "$POOL_HOG_CONTAINER" >/dev/null 2>&1
}

disk_fault_is_active() {
  [ -e "$DISK_TRIGGER_FILE" ] || [ -e "$DISK_IMPACT_MARKER" ]
}

disk_mount_is_loopback_ext4() {
  local mount_info mount_source mount_fstype
  mountpoint -q "$LOG_DIR" || return 1
  mount_info=$(findmnt -n -o "SOURCE,FSTYPE" --target "$LOG_DIR") || return 1
  mount_source=$(printf '%s\n' "$mount_info" | awk '{ print $1 }')
  mount_fstype=$(printf '%s\n' "$mount_info" | awk '{ print $2 }')
  [[ "$mount_source" =~ ^/dev/loop[0-9]+$ ]] && [ "$mount_fstype" = "ext4" ]
}

disk_mount_is_owned_by_poc() {
  local mount_source loop_refs
  disk_mount_is_loopback_ext4 || return 1
  mount_source=$(findmnt -n -o SOURCE --target "$LOG_DIR")
  loop_refs=$("${SUDO[@]}" losetup -j "$DISK_IMAGE_FILE" 2>/dev/null || true)
  printf '%s\n' "$loop_refs" | awk -F ':' -v source="$mount_source" '$1 == source { found=1 } END { exit !found }'
}

read_disk_usage() {
  DISK_USAGE_PCT=$(df -P "$LOG_DIR" | tail -1 | awk '{ print $5 }' | tr -d '%')
  [[ "$DISK_USAGE_PCT" =~ ^[0-9]+$ ]]
}

read_log_bytes() {
  if [ -f "$DISK_LOG_FILE" ]; then
    LOG_BYTES=$(stat -c '%s' "$DISK_LOG_FILE")
  else
    LOG_BYTES=0
  fi
  [[ "$LOG_BYTES" =~ ^[0-9]+$ ]]
}

disk_fault_is_observed() {
  disk_mount_is_loopback_ext4 || return 1
  [ -e "$DISK_TRIGGER_FILE" ] || return 1
  [ -e "$DISK_IMPACT_MARKER" ] || return 1
  read_disk_usage
  [ "$DISK_USAGE_PCT" -ge 85 ]
}

disk_is_recovered() {
  disk_mount_is_loopback_ext4 || return 1
  [ ! -e "$DISK_TRIGGER_FILE" ] || return 1
  [ ! -e "$DISK_IMPACT_MARKER" ] || return 1
  read_disk_usage
  [ "$DISK_USAGE_PCT" -lt "$SAFE_DISK_USAGE_PCT" ]
}

log_growth_is_stopped() {
  local first_size second_size
  read_log_bytes
  first_size="$LOG_BYTES"
  sleep 5
  read_log_bytes
  second_size="$LOG_BYTES"
  [ "$first_size" = "$second_size" ] && [ ! -e "$DISK_TRIGGER_FILE" ]
}

stop_pool_hog() {
  if pool_hog_exists; then
    docker compose --profile demo-fault stop -t 10 pool-hog >/dev/null
    docker compose --profile demo-fault rm -f pool-hog >/dev/null
  fi
}

recreate_disk_consumers() {
  docker compose stop log-generator datadog-agent >/dev/null
  docker compose up -d --force-recreate log-generator datadog-agent >/dev/null
  wait_for "log-generator bind mount" "$WAIT_TIMEOUT_SECONDS" \
    docker compose exec -T log-generator test -d /var/log/poc-app
  wait_for "Datadog Agent health" "$DISK_WAIT_TIMEOUT_SECONDS" \
    docker compose exec -T datadog-agent agent health
}

start_disk_fault() {
  pool_hog_is_running && fail "Pool fault is active. Recover it before starting a disk fault."

  if disk_fault_is_active; then
    if wait_for "existing synthetic disk fault" "$DISK_WAIT_TIMEOUT_SECONDS" disk_fault_is_observed; then
      read_disk_usage
      echo "[INFO] Disk fault is already active at ${DISK_USAGE_PCT}% usage."
      return 0
    fi
    fail "Disk fault markers exist but the expected loopback fault state was not observed. Run reset."
  fi

  mkdir -p "$STATE_DIR"
  rm -f -- "$DISK_IMPACT_MARKER"

  if ! disk_mount_is_owned_by_poc; then
    docker compose stop log-generator datadog-agent >/dev/null
    "${SCRIPT_DIR}/setup-disk-volume.sh"
  fi

  disk_mount_is_owned_by_poc || fail "Disk target is not the POC-owned loopback ext4 volume."
  "${SUDO[@]}" truncate -s 0 "$DISK_LOG_FILE"
  "${SUDO[@]}" touch "$DISK_TRIGGER_FILE"
  recreate_disk_consumers

  if ! wait_for "synthetic disk saturation at 85%" \
    "$DISK_WAIT_TIMEOUT_SECONDS" disk_fault_is_observed; then
    echo "[ERROR] Disk fault did not reach the required state; stopping the generator." >&2
    "${SUDO[@]}" rm -f -- "$DISK_TRIGGER_FILE" "$DISK_IMPACT_MARKER"
    "${SUDO[@]}" truncate -s 0 "$DISK_LOG_FILE" || true
    sync || true
    exit 1
  fi

  read_disk_usage
  echo "[OK] Disk fault active: usage=${DISK_USAGE_PCT}%, checkout health impact marker present."
}

recover_disk() {
  disk_mount_is_owned_by_poc || fail "Refusing recovery: target is not the POC-owned loopback ext4 volume."

  "${SUDO[@]}" rm -f -- "$DISK_TRIGGER_FILE" "$DISK_IMPACT_MARKER"
  "${SUDO[@]}" truncate -s 0 "$DISK_LOG_FILE"
  sync

  wait_for "synthetic disk recovery below ${SAFE_DISK_USAGE_PCT}%" \
    "$WAIT_TIMEOUT_SECONDS" disk_is_recovered
  wait_for "synthetic log growth to stop" "$WAIT_TIMEOUT_SECONDS" log_growth_is_stopped

  read_disk_usage
  read_log_bytes
  echo "[OK] Disk recovered: usage=${DISK_USAGE_PCT}%, log_bytes=${LOG_BYTES}, growth stopped."
}

start_pool_fault() {
  disk_fault_is_active && fail "Disk fault is active. Reset or recover it before starting a pool fault."
  ensure_pgbouncer_ready

  if ! pool_config_is_baseline; then
    fail "PgBouncer is ${POOL_SIZE:-unknown}/${MAX_CONNECTIONS:-unknown}; reset to the 5/5 baseline first."
  fi

  if pool_hog_is_running; then
    echo "[INFO] Dedicated pool-hog is already running; verifying the observed fault."
  else
    if pool_hog_exists; then
      docker compose --profile demo-fault rm -f pool-hog >/dev/null
    fi
    docker compose --profile demo-fault up -d pool-hog >/dev/null
    echo "[OK] Dedicated pool-hog started."
  fi

  if ! wait_for "PgBouncer saturation (sv_active>=5 and cl_waiting>0)" \
    "$WAIT_TIMEOUT_SECONDS" pool_fault_is_observed; then
    echo "[ERROR] Pool fault did not reach the required state; returning to baseline." >&2
    stop_pool_hog || true
    wait_for "PgBouncer queue recovery" "$WAIT_TIMEOUT_SECONDS" pool_is_recovered || true
    exit 1
  fi

  read_pool_metrics
  echo "[OK] Pool fault active: sv_active=${SV_ACTIVE}, cl_waiting=${CL_WAITING}, pool=5/5."
}

recover_pool() {
  ensure_pgbouncer_ready
  stop_pool_hog

  wait_for "PgBouncer queue recovery at the 5/5 baseline" \
    "$WAIT_TIMEOUT_SECONDS" pool_is_recovered

  read_pool_metrics
  echo "[OK] Pool recovered: pool=5/5, sv_active=${SV_ACTIVE}, cl_waiting=${CL_WAITING}."
}

reset_demo() {
  stop_pool_hog
  "${SCRIPT_DIR}/cleanup-full-poc.sh"

  ensure_pgbouncer_ready
  wait_for "verified PgBouncer baseline" "$WAIT_TIMEOUT_SECONDS" pool_is_recovered

  if pool_hog_exists; then
    fail "Reset validation failed: dedicated pool-hog container still exists."
  fi
  if disk_fault_is_active; then
    fail "Reset validation failed: disk trigger or impact marker still exists."
  fi
  if mountpoint -q "$LOG_DIR"; then
    fail "Reset validation failed: the synthetic loopback volume is still mounted."
  fi

  echo "[OK] Demo reset completed and the pool is ready at the 5/5 baseline."
}

print_status() {
  local docker_available=true
  local pgbouncer_ready=true
  local pool_hog_running=false
  local disk_fault_active=false
  local disk_mounted=false

  if ! docker info >/dev/null 2>&1; then
    docker_available=false
  fi
  if pool_hog_is_running; then
    pool_hog_running=true
  fi
  if disk_fault_is_active; then
    disk_fault_active=true
  fi
  DISK_USAGE_PCT=unknown
  LOG_BYTES=unknown
  if disk_mount_is_loopback_ext4; then
    disk_mounted=true
    read_disk_usage || DISK_USAGE_PCT=unknown
    read_log_bytes || LOG_BYTES=unknown
  fi

  POOL_SIZE=unknown
  MAX_CONNECTIONS=unknown
  POOL_ROW_COUNT=0
  CL_WAITING=unknown
  SV_ACTIVE=unknown

  if [ "$docker_available" = true ]; then
    if ! read_pool_config 2>/dev/null || ! read_pool_metrics 2>/dev/null; then
      pgbouncer_ready=false
      POOL_SIZE=unknown
      MAX_CONNECTIONS=unknown
      CL_WAITING=unknown
      SV_ACTIVE=unknown
    fi
  else
    pgbouncer_ready=false
  fi

  printf '{"docker_available":%s,"pgbouncer_ready":%s,"pool_hog_running":%s,' \
    "$docker_available" "$pgbouncer_ready" "$pool_hog_running"
  printf '"pool_size":"%s","max_db_connections":"%s","sv_active":"%s","cl_waiting":"%s",' \
    "$POOL_SIZE" "$MAX_CONNECTIONS" "$SV_ACTIVE" "$CL_WAITING"
  printf '"disk_fault_active":%s,"disk_mounted":%s,"disk_usage_pct":"%s","log_bytes":"%s"}\n' \
    "$disk_fault_active" "$disk_mounted" "$DISK_USAGE_PCT" "$LOG_BYTES"
}

if [ "$#" -ne 1 ]; then
  usage >&2
  exit 64
fi

ACTION="$1"

case "$ACTION" in
  pool|recover-pool|reset|status|disk|recover-disk)
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac

preflight

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  fail "Another demo-control action is already running."
fi

case "$ACTION" in
  pool)
    start_pool_fault
    ;;
  recover-pool)
    recover_pool
    ;;
  disk)
    start_disk_fault
    ;;
  recover-disk)
    recover_disk
    ;;
  reset)
    reset_demo
    ;;
  status)
    print_status
    ;;
esac
