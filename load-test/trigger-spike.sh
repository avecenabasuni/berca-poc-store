#!/bin/bash
# load-test/trigger-spike.sh
# Manual spike trigger for database connection pool exhaustion demo
#
# Usage:
#   ./load-test/trigger-spike.sh
#
# Prerequisites:
#   - k6 installed locally (https://k6.io/docs/getting-started/installation/)
#   - MEDUSA_BASE_URL env var (default: http://localhost:9000)
#   - MEDUSA_PUBLISHABLE_KEY env var
#
# Cron example (daily at 10:00 WIB for historical data variation):
#   0 3 * * * cd /path/to/berca-poc-store && MEDUSA_BASE_URL=http://localhost:9000 MEDUSA_PUBLISHABLE_KEY=pk_xxx ./load-test/trigger-spike.sh >> /var/log/spike-test.log 2>&1
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
export MEDUSA_BASE_URL="${MEDUSA_BASE_URL:-http://localhost:9000}"
export MEDUSA_PUBLISHABLE_KEY="${MEDUSA_PUBLISHABLE_KEY:-}"

echo ""
echo "============================================================"
echo "  DATABASE CONNECTION POOL EXHAUSTION — SPIKE TRIGGER"
echo "============================================================"
echo ""
echo "  Target:     ${MEDUSA_BASE_URL}"
echo "  API Key:    ${MEDUSA_PUBLISHABLE_KEY:+SET}${MEDUSA_PUBLISHABLE_KEY:-NOT SET (warning!)}"
echo "  Scenario:   10 VUs (20s) -> 50 VUs (30s) -> 100 VUs (30s)"
echo "  Duration:   ~115 seconds total"
echo ""
echo "  Starting spike in 3 seconds..."
echo ""
sleep 3

# Run the spike test
k6 run \
  -e MEDUSA_BASE_URL="${MEDUSA_BASE_URL}" \
  -e MEDUSA_PUBLISHABLE_KEY="${MEDUSA_PUBLISHABLE_KEY}" \
  "${SCRIPT_DIR}/spike-test.js"

EXIT_CODE=$?

echo ""
echo "============================================================"
echo "  SPIKE COMPLETE"
echo "============================================================"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
  echo "  Status:       Spike finished successfully"
else
  echo "  Status:       Spike finished with threshold violations (expected!)"
fi

echo "  Auto-Recovery: System will recover within ~10 seconds"
echo "                 (idleTimeoutMillis: 10000ms)"
echo ""
echo "  What to check:"
echo "    1. Response times should return to normal within 10-15s"
echo "    2. Error rate should drop back to baseline (~2-5%)"
echo "    3. Database connections will be released as idle timeout expires"
echo ""
echo "  Monitor via Datadog or:"
echo "    curl -s ${MEDUSA_BASE_URL}/store/products | head -c 200"
echo ""
echo "============================================================"
echo ""

# Always exit 0 — threshold violations during spike are expected
exit 0
