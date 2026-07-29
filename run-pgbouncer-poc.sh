#!/bin/bash
# run-pgbouncer-poc.sh — Trigger 8-minute PgBouncer Saturation for 5-Minute Datadog Monitor Evaluation

set -euo pipefail

echo ""
echo "=========================================================================="
echo "  PGBOUNCER SATURATION POC RUNNER (8-MINUTE DURATION)"
echo "=========================================================================="
echo "  Target Pooler:    PgBouncer (port 6432)"
echo "  Clients:          25 parallel clients (5 backend connections max)"
echo "  Duration:         480 seconds (8 minutes)"
echo "  Transaction:      BEGIN; SELECT pg_sleep(30); COMMIT;"
echo "=========================================================================="
echo ""
echo "  Starting 8-minute saturation run in 3 seconds..."
sleep 3

docker compose exec -T postgres pgbench \
  -h pgbouncer \
  -p 6432 \
  -U postgres \
  -c 25 \
  -j 5 \
  -T 480 \
  -n \
  -f /load-test/pgbench-saturation.sql \
  medusa-store

echo ""
echo "=========================================================================="
echo "  SATURATION RUN FINISHED — MONITOR WILL EVALUATE & CLEAR IN ~5 MINUTES"
echo "=========================================================================="
echo ""
