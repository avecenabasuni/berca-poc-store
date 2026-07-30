#!/bin/bash
# cleanup-full-poc.sh — Stop active POC tasks, clean up test logs, and reset environment to baseline

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"
LOG_FILE="${LOG_DIR}/app-saturation.log"

echo ""
echo "=========================================================================="
echo "  STOPPING POC SIMULATION & RESETTING BASELINE ENVIRONMENT"
echo "=========================================================================="
echo ""

# 1. Stop active pgbench saturation processes inside postgres container if running
echo "-> Terminating active pgbench load test processes..."
docker compose exec -T postgres pkill -9 -f pgbench >/dev/null 2>&1 || true
echo "  [OK] Terminated active pgbench sessions."

# 2. Remove trigger file to stop log generator loop
if [ -f "$TRIGGER_FILE" ]; then
  rm -f "$TRIGGER_FILE"
  echo "  [OK] Removed log saturation trigger file."
fi

# 3. Truncate log file to 0 bytes
if [ -f "$LOG_FILE" ]; then
  > "$LOG_FILE"
  echo "  [OK] Truncated app-saturation.log to 0 bytes."
fi

echo ""
echo "  Status:           Simulation stopped cleanly. Disk log & connections reset to baseline."
echo "  Datadog Monitor:  Will evaluate and return to OK status within 5 minutes."
echo "=========================================================================="
echo ""
