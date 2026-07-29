// load-test/spike-test.js
// k6 spike test — triggers database connection pool exhaustion
// Meant to be run manually via trigger-spike.sh for live demo purposes
//
// Environment variables:
//   MEDUSA_BASE_URL        — backend URL (default: http://localhost:9000)
//   MEDUSA_PUBLISHABLE_KEY — publishable API key from Medusa admin

import http from "k6/http"
import { check, sleep } from "k6"
import { Rate, Counter } from "k6/metrics"

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const errorRate = new Rate("errors")
const timeouts = new Counter("timeouts")
const poolExhausted = new Counter("pool_exhausted_errors")

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.MEDUSA_BASE_URL || "http://localhost:9000"
const API_KEY = __ENV.MEDUSA_PUBLISHABLE_KEY || ""

if (!API_KEY) {
  console.log("[WARNING] MEDUSA_PUBLISHABLE_KEY is NOT set! Medusa v2 /store/* endpoints will return 400 Bad Request without a valid publishable API key.")
}

const HEADERS = {
  "Content-Type": "application/json",
  "x-publishable-api-key": API_KEY,
}

// ---------------------------------------------------------------------------
// Staged spike: 10 → 50 → 100 VUs then ramp down
// Total duration: ~90 seconds
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 10 },   // warm up
        { duration: "20s", target: 10 },   // hold at 10
        { duration: "10s", target: 50 },   // ramp to 50
        { duration: "30s", target: 50 },   // hold — pool stress begins
        { duration: "5s", target: 100 },   // ramp to 100 — pool exhaustion
        { duration: "30s", target: 100 },  // hold — full exhaustion
        { duration: "10s", target: 0 },    // ramp down
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    // Very loose — we EXPECT failures during spike
    errors: ["rate<0.90"],
  },
}

// ---------------------------------------------------------------------------
// Helper: get region ID (cached)
// ---------------------------------------------------------------------------
let cachedRegionId = null

function getRegionId() {
  if (cachedRegionId) return cachedRegionId

  try {
    const res = http.get(`${BASE_URL}/store/regions`, {
      headers: HEADERS,
      timeout: "5s",
    })
    if (res.status === 200 && res.json() && res.json().regions && res.json().regions.length > 0) {
      cachedRegionId = res.json().regions[0].id
    }
  } catch (e) {
    // Ignore
  }

  return cachedRegionId
}

// ---------------------------------------------------------------------------
// Main VU function — hammers cart creation (heavy DB write)
// ---------------------------------------------------------------------------
export default function () {
  // Mix of operations to simulate realistic but intense traffic
  const roll = Math.random()

  if (roll < 0.60) {
    // 60% — Create cart (heaviest DB operation, most likely to exhaust pool)
    const regionId = getRegionId()
    const payload = regionId
      ? JSON.stringify({ region_id: regionId })
      : JSON.stringify({})

    const res = http.post(`${BASE_URL}/store/carts`, payload, {
      headers: HEADERS,
      timeout: "6s",
      tags: { operation: "create_cart" },
    })

    const ok = check(res, {
      "cart created: status 200": (r) => r.status === 200,
    })
    errorRate.add(!ok)

    if (res.status === 0 || res.error_code) {
      timeouts.add(1)
    }
    if (res.status === 500 || res.status === 503) {
      poolExhausted.add(1)
    }

    // If cart created, try adding an item to increase DB pressure
    if (ok && res.json() && res.json().cart) {
      const cartId = res.json().cart.id

      // Fetch products to get a valid variant
      const prodRes = http.get(`${BASE_URL}/store/products?limit=5`, {
        headers: HEADERS,
        timeout: "5s",
      })

      if (prodRes.status === 200 && prodRes.json() && prodRes.json().products) {
        const products = prodRes.json().products
        if (products.length > 0) {
          const product = products[Math.floor(Math.random() * products.length)]
          if (product.variants && product.variants.length > 0) {
            const variant = product.variants[Math.floor(Math.random() * product.variants.length)]

            const lineRes = http.post(
              `${BASE_URL}/store/carts/${cartId}/line-items`,
              JSON.stringify({
                variant_id: variant.id,
                quantity: Math.floor(Math.random() * 5) + 1,
              }),
              { headers: HEADERS, timeout: "5s", tags: { operation: "add_line_item" } }
            )
            const lineOk = check(lineRes, {
              "line item added: status 200": (r) => r.status === 200,
            })
            errorRate.add(!lineOk)

            if (lineRes.status === 500 || lineRes.status === 503) {
              poolExhausted.add(1)
            }
          }
        }
      }
    }
  } else if (roll < 0.85) {
    // 25% — Product listing (read, but still uses DB connection)
    const res = http.get(`${BASE_URL}/store/products?limit=20`, {
      headers: HEADERS,
      timeout: "5s",
      tags: { operation: "list_products" },
    })
    const ok = check(res, {
      "products listed: status 200": (r) => r.status === 200,
    })
    errorRate.add(!ok)

    if (res.status === 500 || res.status === 503) {
      poolExhausted.add(1)
    }
  } else {
    // 15% — Product detail
    const listRes = http.get(`${BASE_URL}/store/products?limit=5`, {
      headers: HEADERS,
      timeout: "5s",
    })
    if (listRes.status === 200 && listRes.json() && listRes.json().products) {
      const products = listRes.json().products
      if (products.length > 0) {
        const product = products[Math.floor(Math.random() * products.length)]
        const res = http.get(`${BASE_URL}/store/products/${product.id}`, {
          headers: HEADERS,
          timeout: "5s",
          tags: { operation: "product_detail" },
        })
        const ok = check(res, {
          "product detail: status 200": (r) => r.status === 200,
        })
        errorRate.add(!ok)

        if (res.status === 500 || res.status === 503) {
          poolExhausted.add(1)
        }
      }
    }
  }

  // Minimal think time during spike — we want to overwhelm the pool
  sleep(Math.random() * 0.5)
}
