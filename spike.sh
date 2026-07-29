#!/bin/bash
# spike.sh — Easy shortcut to trigger connection pool exhaustion spike demo

# Extract publishable API key if not already set in environment
if [ -z "${MEDUSA_PUBLISHABLE_KEY:-}" ] && [ -f "apps/storefront/.env" ]; then
  MEDUSA_PUBLISHABLE_KEY=$(grep "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" apps/storefront/.env | cut -d '=' -f2 | tr -d '\r\n"')
fi

if [ -z "${MEDUSA_PUBLISHABLE_KEY:-}" ]; then
  MEDUSA_PUBLISHABLE_KEY=$(docker compose logs medusa 2>/dev/null | grep -i "PUBLISHABLE API KEY" | tail -n 1 | awk '{print $NF}' | tr -d '\r\n"')
fi

echo ""
echo "============================================================"
echo "  TRIGGERING DATABASE POOL EXHAUSTION SPIKE"
echo "============================================================"
echo "  API Key: ${MEDUSA_PUBLISHABLE_KEY:0:15}..."
echo ""

docker compose exec traffic-generator k6 run \
  -e MEDUSA_BASE_URL=http://medusa:9000 \
  -e MEDUSA_PUBLISHABLE_KEY="${MEDUSA_PUBLISHABLE_KEY}" \
  /scripts/spike-test.js

echo ""
echo "============================================================"
echo "  SPIKE FINISHED — SYSTEM RECOVERING IN ~10 SECONDS"
echo "============================================================"
echo ""
