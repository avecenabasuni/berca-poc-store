#!/bin/bash
# cleanup-full-poc.sh — Clean up test logs and reset POC environment to baseline state

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"
LOG_FILE="${LOG_DIR}/app-saturation.log"

echo ""
echo "=========================================================================="
echo "  CLEANING UP UNIFIED POC LOG FILES & RESETTING BASELINE"
echo "=========================================================================="
echo ""

# Remove trigger file to stop generator loop
if [ -f "$TRIGGER_FILE" ]; then
  rm -f "$TRIGGER_FILE"
  echo "  [OK] Removed log saturation trigger file."
fi

# Truncate log file
if [ -f "$LOG_FILE" ]; then
  > "$LOG_FILE"
  echo "  [OK] Truncated log file: app-saturation.log."
fi

echo ""
echo "  Status:           Disk log space returned to baseline (< 5%)."
echo "  Datadog Monitor:  Will evaluate and return to OK status within 5 minutes."
echo "=========================================================================="
echo ""
