#!/bin/bash
# Deterministic control surface for the bounded Berca hero demo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_FILE="${POC_DEMO_LOCK_FILE:-/tmp/berca-poc-demo-control.lock}"
POOL_HOG_CONTAINER="berca_poc_pool_hog"
STOREFRONT_SPIKE_CONTAINER="berca_poc_storefront_spike"
STOREFRONT_RELEASE_CONFIG_FILE="${POC_STOREFRONT_RELEASE_CONFIG_FILE:-/etc/berca-poc/storefront-release.env}"
STOREFRONT_RELEASE_IMAGE_PREFIX="ghcr.io/avecenabasuni/berca-storefront@sha256:"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
DISK_TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"
DISK_LOG_FILE="${LOG_DIR}/app-saturation.log"
STATE_DIR="${SCRIPT_DIR}/docker/demo-state"
DISK_IMPACT_MARKER="${STATE_DIR}/disk-degraded"
DISK_IMAGE_FILE="/tmp/poc-log-disk.img"
POOL_PARSER_FILE="${SCRIPT_DIR}/tools/parse-pgbouncer-pools.awk"
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
  start-storefront-spike  Start the bounded storefront capacity spike.
  stop-storefront-spike   Stop only the bounded storefront capacity spike.
  scale-storefront-to-2   Scale the storefront from one to two replicas.
  reset-storefront-scale  Return the storefront from two to one replica.
  deploy-storefront-demo-bad  Deploy the pre-approved storefront regression release.
  rollback-storefront-stable  Return the storefront to the pre-approved stable release.
  reset-storefront-deployment Return the storefront to the stable release.
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
  [ -r "$POOL_PARSER_FILE" ] || fail "PgBouncer pool parser is unavailable."

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

pgbouncer_query_with_header() {
  local sql="$1"
  docker compose exec -T postgres psql \
    -v ON_ERROR_STOP=1 \
    -h pgbouncer \
    -p 6432 \
    -U postgres \
    pgbouncer \
    -A \
    -F '|' \
    -P footer=off \
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
  local pools_out parsed_metrics
  if ! pools_out=$(pgbouncer_query_with_header "SHOW POOLS;"); then
    return 1
  fi

  if ! parsed_metrics=$(printf '%s\n' "$pools_out" | awk \
    -v target_db="$PGBOUNCER_TARGET_DB" \
    -v target_user="$PGBOUNCER_TARGET_USER" \
    -f "$POOL_PARSER_FILE"); then
    return 1
  fi

  IFS='|' read -r POOL_ROW_COUNT CL_WAITING SV_ACTIVE <<< "$parsed_metrics"
  [[ "$POOL_ROW_COUNT" =~ ^[0-9]+$ ]] && \
    [[ "$CL_WAITING" =~ ^-?[0-9]+$ ]] && \
    [[ "$SV_ACTIVE" =~ ^-?[0-9]+$ ]]
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

storefront_replica_count() {
  local container_id running count=0
  while IFS= read -r container_id; do
    [ -n "$container_id" ] || continue
    running=$(docker inspect -f '{{.State.Running}}' "$container_id" 2>/dev/null || true)
    if [ "$running" = "true" ]; then
      count=$((count + 1))
    fi
  done < <(docker compose ps -q storefront)
  printf '%s\n' "$count"
}

storefront_replicas_are_healthy() {
  local expected="$1" container_id health_status
  [ "$(storefront_replica_count)" -eq "$expected" ] || return 1
  while IFS= read -r container_id; do
    [ -n "$container_id" ] || continue
    health_status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || true)
    [ "$health_status" = "healthy" ] || return 1
  done < <(docker compose ps -q storefront)
}

storefront_primary_container_id() {
  docker compose ps -q storefront | head -n 1
}

storefront_image_reference() {
  local container_id
  container_id=$(storefront_primary_container_id)
  [ -n "$container_id" ] || return 1
  docker inspect -f '{{.Config.Image}}' "$container_id"
}

storefront_release_version() {
  local container_id
  container_id=$(storefront_primary_container_id)
  [ -n "$container_id" ] || return 1
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" | \
    awk -F '=' '$1 == "DD_VERSION" { print $2; exit }'
}

load_storefront_release_config() {
  local key value config_owner config_mode stable_digest bad_digest
  STOREFRONT_STABLE_IMAGE=""
  STOREFRONT_STABLE_VERSION=""
  STOREFRONT_BAD_IMAGE=""
  STOREFRONT_BAD_VERSION=""

  [ -r "$STOREFRONT_RELEASE_CONFIG_FILE" ] || return 1
  config_owner=$(stat -c '%u' "$STOREFRONT_RELEASE_CONFIG_FILE" 2>/dev/null || true)
  config_mode=$(stat -c '%a' "$STOREFRONT_RELEASE_CONFIG_FILE" 2>/dev/null || true)
  [ "$config_owner" = "0" ] && [ "$config_mode" = "600" ] || return 1

  while IFS='=' read -r key value; do
    value=${value%$'\r'}
    case "$key" in
      STOREFRONT_STABLE_IMAGE) STOREFRONT_STABLE_IMAGE="$value" ;;
      STOREFRONT_STABLE_VERSION) STOREFRONT_STABLE_VERSION="$value" ;;
      STOREFRONT_BAD_IMAGE) STOREFRONT_BAD_IMAGE="$value" ;;
      STOREFRONT_BAD_VERSION) STOREFRONT_BAD_VERSION="$value" ;;
      ""|\#*) ;;
      *) return 1 ;;
    esac
  done < "$STOREFRONT_RELEASE_CONFIG_FILE"

  [[ "$STOREFRONT_STABLE_IMAGE" == "${STOREFRONT_RELEASE_IMAGE_PREFIX}"* ]] || return 1
  [[ "$STOREFRONT_BAD_IMAGE" == "${STOREFRONT_RELEASE_IMAGE_PREFIX}"* ]] || return 1
  stable_digest=${STOREFRONT_STABLE_IMAGE#"$STOREFRONT_RELEASE_IMAGE_PREFIX"}
  bad_digest=${STOREFRONT_BAD_IMAGE#"$STOREFRONT_RELEASE_IMAGE_PREFIX"}

  [[ "$stable_digest" =~ ^[a-f0-9]{64}$ ]] && \
    [[ "$bad_digest" =~ ^[a-f0-9]{64}$ ]] && \
    [[ "$STOREFRONT_STABLE_VERSION" =~ ^stable-[a-f0-9]{12}$ ]] && \
    [[ "$STOREFRONT_BAD_VERSION" =~ ^demo-bad-[a-f0-9]{12}$ ]] && \
    [ "$STOREFRONT_STABLE_IMAGE" != "$STOREFRONT_BAD_IMAGE" ] && \
    [ "$STOREFRONT_STABLE_VERSION" != "$STOREFRONT_BAD_VERSION" ]
}

storefront_release_state() {
  local image_reference
  load_storefront_release_config || {
    printf 'unknown\n'
    return 0
  }
  image_reference=$(storefront_image_reference 2>/dev/null || true)
  case "$image_reference" in
    "$STOREFRONT_STABLE_IMAGE") printf 'stable\n' ;;
    "$STOREFRONT_BAD_IMAGE") printf 'demo_bad\n' ;;
    *) printf 'unknown\n' ;;
  esac
}

storefront_catalog_http_status() {
  local response
  response=$(docker compose exec -T storefront wget -S --spider --timeout=10 \
    http://127.0.0.1:8000/id/store 2>&1 || true)
  printf '%s\n' "$response" | awk '/^  HTTP\// { status=$2 } END { print status }'
}

storefront_catalog_is_available() {
  [ "$(storefront_catalog_http_status)" = "200" ]
}

storefront_catalog_is_regressed() {
  [ "$(storefront_catalog_http_status)" = "503" ]
}

storefront_release_guardrails() {
  disk_fault_is_active && fail "Disk fault is active. Refusing deployment action."
  pool_hog_is_running && fail "Pool fault is active. Refusing deployment action."
  autoscale_spike_is_running && fail "Storefront capacity spike is active. Refusing deployment action."
  [ "$(storefront_replica_count)" -eq 1 ] || fail "Storefront must have exactly one replica for a deployment action."
  traefik_is_healthy || fail "Traefik is not healthy. Refusing deployment action."
  storefront_replicas_are_healthy 1 || fail "Storefront is not healthy. Refusing deployment action."
}

activate_storefront_release() {
  local image="$1" version="$2"
  docker image inspect "$image" >/dev/null 2>&1 || \
    fail "Approved release image is not available locally. Pull the configured digest before the demo."

  STOREFRONT_IMAGE="$image" STOREFRONT_RELEASE_VERSION="$version" \
    docker compose up -d --no-build --no-deps --force-recreate --scale storefront=1 storefront >/dev/null
  wait_for "one healthy storefront replica" "$DISK_WAIT_TIMEOUT_SECONDS" storefront_replicas_are_healthy 1
  [ "$(storefront_image_reference)" = "$image" ] || fail "Storefront did not start the approved release image."
  [ "$(storefront_release_version)" = "$version" ] || fail "Storefront did not expose the approved release version."
}

reconcile_storefront_replicas() {
  local replicas="$1" image version
  image=$(storefront_image_reference) || fail "Storefront image cannot be determined."
  version=$(storefront_release_version) || fail "Storefront version cannot be determined."
  [ -n "$image" ] && [ -n "$version" ] || fail "Storefront release metadata is incomplete."

  STOREFRONT_IMAGE="$image" STOREFRONT_RELEASE_VERSION="$version" \
    docker compose up -d --no-build --no-deps --scale storefront="$replicas" storefront >/dev/null
}

traefik_is_healthy() {
  local container_id health_status
  container_id=$(docker compose ps -q traefik | head -n 1)
  [ -n "$container_id" ] || return 1
  health_status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || true)
  [ "$health_status" = "healthy" ]
}

autoscale_spike_is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$STOREFRONT_SPIKE_CONTAINER" 2>/dev/null || true)" = "true" ]
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

start_storefront_spike() {
  disk_fault_is_active && fail "Disk fault is active. Recover it before starting a storefront scale test."
  pool_hog_is_running && fail "Pool fault is active. Recover it before starting a storefront scale test."
  [ "$(storefront_release_state)" != "demo_bad" ] || fail "A storefront regression release is active. Roll it back before starting a scale test."

  if autoscale_spike_is_running; then
    echo "[INFO] Storefront capacity spike is already running."
    return 0
  fi

  [ "$(storefront_replica_count)" -eq 1 ] || fail "Storefront must be at the one-replica baseline before starting a capacity spike."
  [[ "${AUTOSCALE_SPIKE_RATE:-}" =~ ^[0-9]+$ ]] || fail "AUTOSCALE_SPIKE_RATE must be a VM-configured positive integer."
  [ "${AUTOSCALE_SPIKE_RATE}" -ge 1 ] && [ "${AUTOSCALE_SPIKE_RATE}" -le 240 ] || fail "AUTOSCALE_SPIKE_RATE must be between 1 and 240."

  docker compose up -d traefik >/dev/null
  wait_for "Traefik health" "$WAIT_TIMEOUT_SECONDS" traefik_is_healthy
  wait_for "one healthy storefront replica" "$DISK_WAIT_TIMEOUT_SECONDS" storefront_replicas_are_healthy 1
  docker compose --profile autoscale-demo up -d traffic-spike >/dev/null
  wait_for "running storefront capacity spike" "$WAIT_TIMEOUT_SECONDS" autoscale_spike_is_running
  echo "[OK] Storefront capacity spike started at the VM-configured fixed rate."
}

stop_storefront_spike() {
  if ! docker inspect "$STOREFRONT_SPIKE_CONTAINER" >/dev/null 2>&1; then
    echo "[INFO] Storefront capacity spike is already stopped."
    return 0
  fi
  docker compose --profile autoscale-demo stop -t 10 traffic-spike >/dev/null
  docker compose --profile autoscale-demo rm -f traffic-spike >/dev/null
  autoscale_spike_is_running && fail "Storefront capacity spike is still running after stop."
  echo "[OK] Storefront capacity spike stopped."
}

scale_storefront_to_two() {
  disk_fault_is_active && fail "Disk fault is active. Refusing storefront scale-out."
  pool_hog_is_running && fail "Pool fault is active. Refusing storefront scale-out."
  [ "$(storefront_release_state)" != "demo_bad" ] || fail "A storefront regression release is active. Refusing scale-out."
  autoscale_spike_is_running || fail "Storefront capacity spike is not active. Refusing scale-out without the approved test workload."
  [ "$(storefront_replica_count)" -eq 1 ] || fail "Storefront must have exactly one running replica before scale-out."
  traefik_is_healthy || fail "Traefik is not healthy. Refusing storefront scale-out."

  reconcile_storefront_replicas 2
  wait_for "two healthy storefront replicas" "$DISK_WAIT_TIMEOUT_SECONDS" storefront_replicas_are_healthy 2
  echo "[OK] Storefront scaled from one to two healthy replicas."
}

reset_storefront_scale() {
  autoscale_spike_is_running && fail "Stop the storefront capacity spike before resetting replica count."
  docker compose up -d traefik >/dev/null
  wait_for "Traefik health" "$WAIT_TIMEOUT_SECONDS" traefik_is_healthy
  reconcile_storefront_replicas 1
  wait_for "one healthy storefront replica" "$DISK_WAIT_TIMEOUT_SECONDS" storefront_replicas_are_healthy 1
  echo "[OK] Storefront reset to one healthy replica."
}

deploy_storefront_demo_bad() {
  load_storefront_release_config || fail "Storefront release configuration is missing, invalid, or not root-owned mode 0600."
  storefront_release_guardrails
  [ "$(storefront_release_state)" = "stable" ] || fail "Storefront must run the configured stable release before deploying the candidate."

  activate_storefront_release "$STOREFRONT_BAD_IMAGE" "$STOREFRONT_BAD_VERSION"
  wait_for "known storefront regression response" "$WAIT_TIMEOUT_SECONDS" storefront_catalog_is_regressed
  echo "[OK] Approved storefront regression release deployed."
}

rollback_storefront_stable() {
  load_storefront_release_config || fail "Storefront release configuration is missing, invalid, or not root-owned mode 0600."
  storefront_release_guardrails
  if [ "$(storefront_release_state)" = "stable" ] && storefront_catalog_is_available; then
    echo "[INFO] Storefront is already running the configured stable release."
    return 0
  fi
  [ "$(storefront_release_state)" = "demo_bad" ] || fail "Rollback is allowed only from the configured regression release."

  activate_storefront_release "$STOREFRONT_STABLE_IMAGE" "$STOREFRONT_STABLE_VERSION"
  wait_for "stable storefront catalog response" "$WAIT_TIMEOUT_SECONDS" storefront_catalog_is_available
  echo "[OK] Storefront rolled back to the approved stable release."
}

reset_storefront_deployment() {
  load_storefront_release_config || fail "Storefront release configuration is missing, invalid, or not root-owned mode 0600."
  autoscale_spike_is_running && fail "Stop the storefront capacity spike before resetting the deployment."
  traefik_is_healthy || fail "Traefik is not healthy. Refusing deployment reset."
  if [ "$(storefront_release_state)" = "stable" ] && storefront_catalog_is_available; then
    echo "[INFO] Storefront deployment is already at the configured stable release."
    return 0
  fi

  activate_storefront_release "$STOREFRONT_STABLE_IMAGE" "$STOREFRONT_STABLE_VERSION"
  wait_for "stable storefront catalog response" "$WAIT_TIMEOUT_SECONDS" storefront_catalog_is_available
  echo "[OK] Storefront deployment reset to the approved stable release."
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
  echo "[OK] Disk fault active: usage=${DISK_USAGE_PCT}%, backend health impact marker present."
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
    echo "[INFO] Last pool-hog logs:" >&2
    docker logs --tail 50 "$POOL_HOG_CONTAINER" >&2 || true
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
  stop_storefront_spike
  reset_storefront_scale
  if [ -r "$STOREFRONT_RELEASE_CONFIG_FILE" ]; then
    reset_storefront_deployment
  fi
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
  local autoscale_spike_active=false
  local storefront_replicas=unknown
  local storefront_healthy=false
  local traefik_healthy=false
  local autoscale_state=unavailable
  local storefront_release_state=unknown
  local storefront_version=unknown
  local storefront_image=unknown
  local deployment_demo_active=false

  if ! docker info >/dev/null 2>&1; then
    docker_available=false
  fi
  if pool_hog_is_running; then
    pool_hog_running=true
  fi
  if disk_fault_is_active; then
    disk_fault_active=true
  fi
  if [ "$docker_available" = true ]; then
    storefront_replicas=$(storefront_replica_count 2>/dev/null || printf 'unknown')
    if traefik_is_healthy; then
      traefik_healthy=true
    fi
    if [[ "$storefront_replicas" =~ ^[1-9][0-9]*$ ]] && storefront_replicas_are_healthy "$storefront_replicas"; then
      storefront_healthy=true
    fi
    if autoscale_spike_is_running; then
      autoscale_spike_active=true
    fi
    storefront_release_state=$(storefront_release_state)
    storefront_version=$(storefront_release_version 2>/dev/null || printf 'unknown')
    storefront_image=$(storefront_image_reference 2>/dev/null || printf 'unknown')
    if [ "$storefront_release_state" = "demo_bad" ]; then
      deployment_demo_active=true
    fi
    if [ "$storefront_replicas" = "1" ] && [ "$autoscale_spike_active" = false ]; then
      autoscale_state=baseline
    elif [ "$storefront_replicas" = "1" ] && [ "$autoscale_spike_active" = true ]; then
      autoscale_state=spike_running
    elif [ "$storefront_replicas" = "2" ] && [ "$autoscale_spike_active" = true ]; then
      autoscale_state=scaled_out
    else
      autoscale_state=unexpected
    fi
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
  printf '"disk_fault_active":%s,"disk_mounted":%s,"disk_usage_pct":"%s","log_bytes":"%s",' \
    "$disk_fault_active" "$disk_mounted" "$DISK_USAGE_PCT" "$LOG_BYTES"
  printf '"storefront_replicas":"%s","storefront_healthy":%s,"traefik_healthy":%s,' \
    "$storefront_replicas" "$storefront_healthy" "$traefik_healthy"
  printf '"autoscale_spike_active":%s,"autoscale_state":"%s",' \
    "$autoscale_spike_active" "$autoscale_state"
  printf '"storefront_release_state":"%s","storefront_version":"%s","storefront_image":"%s","deployment_demo_active":%s}\n' \
    "$storefront_release_state" "$storefront_version" "$storefront_image" "$deployment_demo_active"
}

if [ "$#" -ne 1 ]; then
  usage >&2
  exit 64
fi

ACTION="$1"

case "$ACTION" in
  pool|recover-pool|reset|status|disk|recover-disk|start-storefront-spike|stop-storefront-spike|scale-storefront-to-2|reset-storefront-scale|deploy-storefront-demo-bad|rollback-storefront-stable|reset-storefront-deployment)
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac

preflight

if [ "$ACTION" = "status" ]; then
  print_status
  exit 0
fi

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
  start-storefront-spike)
    start_storefront_spike
    ;;
  stop-storefront-spike)
    stop_storefront_spike
    ;;
  scale-storefront-to-2)
    scale_storefront_to_two
    ;;
  reset-storefront-scale)
    reset_storefront_scale
    ;;
  deploy-storefront-demo-bad)
    deploy_storefront_demo_bad
    ;;
  rollback-storefront-stable)
    rollback_storefront_stable
    ;;
  reset-storefront-deployment)
    reset_storefront_deployment
    ;;
  reset)
    reset_demo
    ;;
esac
