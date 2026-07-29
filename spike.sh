#!/bin/bash
# spike.sh — Easy shortcut to trigger connection pool exhaustion spike demo

echo ""
echo "============================================================"
echo "  TRIGGERING DATABASE POOL EXHAUSTION SPIKE"
echo "============================================================"
echo ""

docker compose exec traffic-generator k6 run /scripts/spike-test.js

echo ""
echo "============================================================"
echo "  SPIKE FINISHED — SYSTEM RECOVERING IN ~10 SECONDS"
echo "============================================================"
echo ""
