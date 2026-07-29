// load-test/baseline-traffic.js
// k6 baseline traffic generator — realistic multi-step e-commerce user journey
// Runs continuously via Docker to build historical data in monitoring tools
//
// Environment variables:
//   MEDUSA_BASE_URL        — backend URL (default: http://localhost:9000)
//   MEDUSA_PUBLISHABLE_KEY — publishable API key from Medusa admin

import http from "k6/http"
import { check, sleep, group } from "k6"
import { Rate, Trend } from "k6/metrics"

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const errorRate = new Rate("errors")
const journeyDuration = new Trend("journey_duration", true)

// ---------------------------------------------------------------------------
// Configuration from environment
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.MEDUSA_BASE_URL || "http://localhost:9000"
const API_KEY = __ENV.MEDUSA_PUBLISHABLE_KEY || ""

const HEADERS = {
  "Content-Type": "application/json",
  "x-publishable-api-key": API_KEY,
}

// ---------------------------------------------------------------------------
// VU intensity by hour (UTC+7 / WIB)
// Reads current hour at script init and picks matching scenario params.
// k6 scenarios with ramping-vus provide smooth transitions.
// ---------------------------------------------------------------------------
function getTimeBasedConfig() {
  // k6 __ENV or system time — use UTC offset +7
  const now = new Date()
  const utc7Hour = (now.getUTCHours() + 7) % 24

  if (utc7Hour >= 0 && utc7Hour < 6) {
    return { minVUs: 1, maxVUs: 2, label: "night" }
  } else if (utc7Hour >= 6 && utc7Hour < 17) {
    return { minVUs: 3, maxVUs: 5, label: "business" }
  } else if (utc7Hour >= 17 && utc7Hour < 22) {
    return { minVUs: 5, maxVUs: 8, label: "evening-peak" }
  } else {
    return { minVUs: 2, maxVUs: 3, label: "late-night" }
  }
}

const timeCfg = getTimeBasedConfig()

// ---------------------------------------------------------------------------
// k6 options — 6-hour cycle, restarted by Docker entrypoint
// Uses ramping-vus to vary intensity within the cycle
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    user_journey: {
      executor: "ramping-vus",
      startVUs: timeCfg.minVUs,
      stages: [
        { duration: "30m", target: timeCfg.maxVUs },
        { duration: "2h", target: timeCfg.maxVUs },
        { duration: "30m", target: timeCfg.minVUs + 1 },
        { duration: "2h", target: timeCfg.maxVUs },
        { duration: "30m", target: timeCfg.minVUs },
        { duration: "30m", target: timeCfg.maxVUs },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    // Intentionally loose — we expect some failures for realism
    errors: ["rate<0.10"],
    http_req_duration: ["p(95)<10000"],
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function thinkTime() {
  sleep(Math.random() * 3 + 1) // 1-4 seconds
}

function randomItem(arr) {
  if (!arr || arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

// Introduce ~3% intentional bad requests for natural failure rate
function shouldInjectError() {
  return Math.random() < 0.03
}

// ---------------------------------------------------------------------------
// Main VU function — one iteration = one user journey
// ---------------------------------------------------------------------------
export default function () {
  const journeyStart = Date.now()
  const vuId = __VU

  // -----------------------------------------------------------------------
  // Step 1: Browse product listing
  // -----------------------------------------------------------------------
  let products = []
  group("browse_products", function () {
    const isError = shouldInjectError()
    const url = isError
      ? `${BASE_URL}/store/products?limit=invalid`
      : `${BASE_URL}/store/products?limit=20`

    const res = http.get(url, { headers: HEADERS, timeout: "8s" })
    const ok = check(res, {
      "products: status 200": (r) => r.status === 200,
    })
    errorRate.add(!ok)

    if (ok && res.json() && res.json().products) {
      products = res.json().products
      console.log(`[VU ${vuId}] [STEP 1] Browse catalog -> Found ${products.length} products`)
    } else {
      console.log(`[VU ${vuId}] [STEP 1] Browse catalog -> Failed (${res.status})`)
    }
  })

  thinkTime()

  if (products.length === 0) {
    journeyDuration.add(Date.now() - journeyStart)
    return
  }

  // -----------------------------------------------------------------------
  // Step 2: View a random product detail
  // -----------------------------------------------------------------------
  let selectedProduct = null
  group("view_product_detail", function () {
    const product = randomItem(products)
    const isError = shouldInjectError()
    const productId = isError ? "non_existent_id_999" : product.id
    const res = http.get(`${BASE_URL}/store/products/${productId}`, {
      headers: HEADERS,
      timeout: "8s",
    })
    const ok = check(res, {
      "product detail: status 200": (r) => r.status === 200,
    })
    errorRate.add(!ok)

    if (ok && res.json() && res.json().product) {
      selectedProduct = res.json().product
      console.log(`[VU ${vuId}] [STEP 2] View product -> "${selectedProduct.title}" (${selectedProduct.id})`)
    } else {
      console.log(`[VU ${vuId}] [STEP 2] View product -> Failed (${res.status})`)
    }
  })

  thinkTime()

  // -----------------------------------------------------------------------
  // Step 3: 70% chance — create cart and add item
  // -----------------------------------------------------------------------
  const willCreateCart = Math.random() > 0.30
  if (!willCreateCart) {
    console.log(`[VU ${vuId}] [BOUNCE] Left store after viewing product detail`)
  } else if (selectedProduct) {
    let cartId = null

    group("create_cart", function () {
      const res = http.post(
        `${BASE_URL}/store/carts`,
        JSON.stringify({ region_id: getRegionId() }),
        { headers: HEADERS, timeout: "8s" }
      )
      const ok = check(res, {
        "create cart: status 200": (r) => r.status === 200,
      })
      errorRate.add(!ok)

      if (ok && res.json() && res.json().cart) {
        cartId = res.json().cart.id
        console.log(`[VU ${vuId}] [STEP 3a] Cart created -> ID: ${cartId}`)
      } else {
        console.log(`[VU ${vuId}] [STEP 3a] Cart creation failed (${res.status})`)
      }
    })

    thinkTime()

    if (cartId && selectedProduct.variants && selectedProduct.variants.length > 0) {
      group("add_line_item", function () {
        const variant = randomItem(selectedProduct.variants)
        const quantity = Math.floor(Math.random() * 3) + 1 // 1-3 items

        const res = http.post(
          `${BASE_URL}/store/carts/${cartId}/line-items`,
          JSON.stringify({
            variant_id: variant.id,
            quantity: quantity,
          }),
          { headers: HEADERS, timeout: "8s" }
        )
        const ok = check(res, {
          "add item: status 200": (r) => r.status === 200,
        })
        errorRate.add(!ok)

        if (ok) {
          console.log(`[VU ${vuId}] [STEP 3b] Added ${quantity}x item(s) to cart`)
        } else {
          console.log(`[VU ${vuId}] [STEP 3b] Failed adding item to cart (${res.status})`)
        }
      })

      thinkTime()

      // -----------------------------------------------------------------
      // Step 4: ~35% of cart users proceed toward checkout
      // -----------------------------------------------------------------
      const willCheckout = Math.random() < 0.35
      if (!willCheckout) {
        console.log(`[VU ${vuId}] [CART ABANDONMENT] Left items in cart without checkout`)
      } else {
        group("checkout_flow", function () {
          const emailRes = http.post(
            `${BASE_URL}/store/carts/${cartId}`,
            JSON.stringify({
              email: `testuser${vuId}@loadtest.local`,
            }),
            { headers: HEADERS, timeout: "8s" }
          )
          check(emailRes, {
            "update cart email: status 200": (r) => r.status === 200,
          })

          thinkTime()

          const paymentRes = http.post(
            `${BASE_URL}/store/payment-collections`,
            JSON.stringify({ cart_id: cartId }),
            { headers: HEADERS, timeout: "8s" }
          )
          const paymentOk = check(paymentRes, {
            "payment collection: status 200 or 400": (r) =>
              r.status === 200 || r.status === 400,
          })
          errorRate.add(!paymentOk)

          console.log(`[VU ${vuId}] [STEP 4] Completed checkout flow`)
        })

        thinkTime()
      }
    }
  }

  journeyDuration.add(Date.now() - journeyStart)
}

// ---------------------------------------------------------------------------
// Helper: get a region ID (cached after first fetch)
// ---------------------------------------------------------------------------
let cachedRegionId = null

function getRegionId() {
  if (cachedRegionId) return cachedRegionId

  try {
    const res = http.get(`${BASE_URL}/store/regions`, {
      headers: HEADERS,
      timeout: "8s",
    })
    if (res.status === 200 && res.json() && res.json().regions && res.json().regions.length > 0) {
      cachedRegionId = res.json().regions[0].id
    }
  } catch (e) {
    // Ignore — will use null which may cause cart creation to fail naturally
  }

  return cachedRegionId
}
