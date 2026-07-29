#!/bin/sh
# load-test/entrypoint.sh
# Docker entrypoint for the traffic-generator container.
# Waits for Medusa backend to be healthy, then runs baseline traffic in a loop.

set -e

MEDUSA_BASE_URL="${MEDUSA_BASE_URL:-http://medusa:9000}"
MAX_RETRIES=60
RETRY_INTERVAL=5

echo ""
echo "=== Traffic Generator ==="
echo "Backend URL: ${MEDUSA_BASE_URL}"
echo "Waiting for backend to be ready..."
echo ""

# Wait for backend health endpoint
attempt=0
while [ $attempt -lt $MAX_RETRIES ]; do
  attempt=$((attempt + 1))

  # Use wget (available in Alpine-based k6 image) to check health
  if wget -q --spider "${MEDUSA_BASE_URL}/health" 2>/dev/null; then
    echo "[OK] Backend is healthy (attempt ${attempt}/${MAX_RETRIES})"
    break
  fi

  echo "[WAIT] Backend not ready yet (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_INTERVAL}s..."
  sleep $RETRY_INTERVAL
done

if [ $attempt -ge $MAX_RETRIES ]; then
  echo "[ERROR] Backend did not become healthy after ${MAX_RETRIES} attempts. Exiting."
  exit 1
fi

echo ""
echo "Starting baseline traffic generator (continuous loop)..."
echo ""

# Run baseline traffic in an infinite loop.
# Each cycle runs for ~6 hours (defined in baseline-traffic.js stages).
# After each cycle, the script restarts to pick up the current time-of-day
# parameters, ensuring VU intensity stays aligned with the clock.
while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting new traffic cycle..."

  k6 run \
    -e MEDUSA_BASE_URL="${MEDUSA_BASE_URL}" \
    -e MEDUSA_PUBLISHABLE_KEY="${MEDUSA_PUBLISHABLE_KEY:-}" \
    /scripts/baseline-traffic.js \
    || echo "[WARN] k6 cycle ended with non-zero exit (threshold violation) — restarting..."

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Traffic cycle ended. Restarting in 10 seconds..."
  sleep 10
done
