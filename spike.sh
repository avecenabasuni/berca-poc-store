#!/bin/bash
# spike.sh — Shortcut to trigger a brief k6 Storefront API traffic spike demo
# Note: This is a short API spike test, separate from the 15-minute Unified Disk Log Saturation POC.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Extract publishable API key if not already set in environment
if [ -z "${MEDUSA_PUBLISHABLE_KEY:-}" ] && [ -f "${SCRIPT_DIR}/apps/storefront/.env" ]; then
  MEDUSA_PUBLISHABLE_KEY=$(grep "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" "${SCRIPT_DIR}/apps/storefront/.env" | cut -d '=' -f2 | tr -d '\r\n"') || true
fi

if [ -z "${MEDUSA_PUBLISHABLE_KEY:-}" ]; then
  MEDUSA_PUBLISHABLE_KEY=$(docker compose logs medusa 2>/dev/null | grep -i "PUBLISHABLE API KEY" | tail -n 1 | awk '{print $NF}' | tr -d '\r\n"') || true
fi

echo ""
echo "============================================================"
echo "  TRIGGERING SHORT STOREFRONT API TRAFFIC SPIKE (K6)"
echo "============================================================"
echo "  API Key: ${MEDUSA_PUBLISHABLE_KEY:0:15}..."
echo "============================================================"
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
