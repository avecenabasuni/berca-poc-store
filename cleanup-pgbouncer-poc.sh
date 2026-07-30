#!/bin/bash
# cleanup-pgbouncer-poc.sh — Clean up standalone PgBouncer test sessions only

set -euo pipefail

echo ""
echo "=========================================================================="
echo "  CLEANING UP STANDALONE PGBOUNCER POC SESSIONS"
echo "=========================================================================="
echo ""

echo "-> Terminating active pgbench load test processes..."
docker compose exec -T postgres pkill -9 -f pgbench >/dev/null 2>&1 || true
echo "  [OK] Terminated active pgbench sessions."
echo "=========================================================================="
echo ""
