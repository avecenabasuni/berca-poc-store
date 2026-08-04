// Hybrid Berca storefront and Medusa Store API traffic for the POC.
// Browser rendering is intentionally out of scope: storefront page requests are
// protocol-level, while cart mutations use the deterministic Medusa Store API.

import http from "k6/http"
import { check, sleep } from "k6"
import exec from "k6/execution"
import { Rate, Trend } from "k6/metrics"

const organicJourneySuccess = new Rate("organic_journey_success")
const checkoutSuccess = new Rate("checkout_success")
const checkoutFailure = new Rate("checkout_failure")
const checkoutDuration = new Trend("checkout_duration", true)
const storefrontPageDuration = new Trend("storefront_page_duration", true)
const expectedUserErrors = new Rate("expected_user_errors")
const unexpectedErrors = new Rate("unexpected_errors")

const MEDUSA_BASE_URL = __ENV.MEDUSA_BASE_URL || "http://localhost:9000"
const STOREFRONT_BASE_URL =
  __ENV.STOREFRONT_BASE_URL || "http://localhost:8000"
const API_KEY =
  __ENV.MEDUSA_PUBLISHABLE_KEY ||
  __ENV.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  ""
const COUNTRY_CODE = "id"
const PAYMENT_PROVIDER_ID = "pp_system_default"

const API_HEADERS = {
  "Content-Type": "application/json",
  "x-publishable-api-key": API_KEY,
  "User-Agent": "BercaPOC-TrafficGenerator/1.0",
  "x-poc-traffic-source": "synthetic-organic",
}

const CUSTOMER_PROFILES = [
  {
    firstName: "Adi",
    lastName: "Pratama",
    address1: "Jl. Jenderal Sudirman No. 21",
    city: "Jakarta",
    province: "DKI Jakarta",
    postalCode: "10220",
    phone: "+628111000101",
  },
  {
    firstName: "Sari",
    lastName: "Nugraha",
    address1: "Jl. Asia Afrika No. 88",
    city: "Bandung",
    province: "Jawa Barat",
    postalCode: "40111",
    phone: "+628111000102",
  },
  {
    firstName: "Bima",
    lastName: "Santoso",
    address1: "Jl. Pemuda No. 15",
    city: "Surabaya",
    province: "Jawa Timur",
    postalCode: "60271",
    phone: "+628111000103",
  },
  {
    firstName: "Maya",
    lastName: "Lestari",
    address1: "Jl. Malioboro No. 42",
    city: "Yogyakarta",
    province: "DI Yogyakarta",
    postalCode: "55271",
    phone: "+628111000104",
  },
]

function getTimeBasedConfig() {
  const utc7Hour = (new Date().getUTCHours() + 7) % 24

  if (utc7Hour < 6) {
    return { rate: 1, maxVUs: 4, label: "night" }
  }
  if (utc7Hour < 17) {
    return { rate: 3, maxVUs: 8, label: "business" }
  }
  if (utc7Hour < 22) {
    return { rate: 6, maxVUs: 12, label: "evening-peak" }
  }
  return { rate: 2, maxVUs: 6, label: "late-night" }
}

const timeConfig = getTimeBasedConfig()

export const options = {
  scenarios: {
    organic_journeys: {
      executor: "constant-arrival-rate",
      exec: "organicJourney",
      rate: timeConfig.rate,
      timeUnit: "1m",
      duration: "6h",
      preAllocatedVUs: Math.max(2, timeConfig.rate),
      maxVUs: timeConfig.maxVUs,
      gracefulStop: "30s",
      tags: {
        traffic_profile: timeConfig.label,
        traffic_type: "organic",
      },
    },
    guaranteed_checkout: {
      executor: "constant-arrival-rate",
      exec: "guaranteedCheckout",
      rate: 1,
      timeUnit: "5m",
      duration: "6h",
      preAllocatedVUs: 1,
      maxVUs: 3,
      gracefulStop: "30s",
      tags: {
        traffic_profile: "guaranteed-checkout",
        traffic_type: "checkout",
      },
    },
  },
  thresholds: {
    unexpected_errors: ["rate<0.10"],
    http_req_duration: ["p(95)<10000"],
  },
}

function requestParams(journeyId, step, extraTags = {}) {
  // journeyId is logged for correlation, but deliberately not used as a metric
  // tag because that would create an unbounded number of time series.
  void journeyId
  return {
    headers: API_HEADERS,
    timeout: "10s",
    tags: {
      journey_step: step,
      ...extraTags,
    },
  }
}

function parseJson(response) {
  try {
    return response.json()
  } catch (_) {
    return null
  }
}

function randomItem(items) {
  if (!items || items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]
}

function thinkTime() {
  sleep(Math.random() * 4 + 1)
}

function createJourneyId(prefix) {
  const randomPart = Math.floor(Math.random() * 1000000)
  return `${prefix}-${Date.now()}-${__VU}-${__ITER}-${randomPart}`
}

function emitJourneyLog({
  journeyId,
  journeyType,
  journeyOutcome,
  expectedFailure = false,
  cartId = null,
  orderId = null,
  durationMs,
  failedStep = null,
  httpStatus = null,
}) {
  console.log(
    JSON.stringify({
      event: "poc_traffic_journey",
      service: "berca-traffic-generator",
      env: "poc",
      journey_id: journeyId,
      journey_type: journeyType,
      journey_outcome: journeyOutcome,
      expected_failure: expectedFailure,
      cart_id: cartId,
      order_id: orderId,
      duration_ms: durationMs,
      failed_step: failedStep,
      http_status: httpStatus,
    })
  )
}

function visitStorefront(path, journeyId, step) {
  void journeyId
  const response = http.get(`${STOREFRONT_BASE_URL}${path}`, {
    timeout: "15s",
    redirects: 5,
    tags: {
      journey_step: step,
      target_service: "berca-storefront",
    },
  })

  storefrontPageDuration.add(response.timings.duration, {
    page: step,
  })

  return {
    ok: check(response, {
      [`${step}: storefront status 200`]: (res) => res.status === 200,
    }),
    status: response.status,
  }
}

function fetchCatalog(regionId, journeyId) {
  const response = http.get(
    `${MEDUSA_BASE_URL}/store/products?limit=20&region_id=${encodeURIComponent(
      regionId
    )}`,
    requestParams(journeyId, "catalog_api")
  )
  const body = parseJson(response)
  const products = (body && body.products) || []
  const eligibleProducts = products.filter(
    (product) =>
      product.handle && product.variants && product.variants.length > 0
  )
  const ok = check(response, {
    "catalog API: status 200": (res) => res.status === 200,
    "catalog API: purchasable product available": () =>
      eligibleProducts.length > 0,
  })

  return {
    ok,
    status: response.status,
    products: eligibleProducts,
  }
}

function createCartWithItem(regionId, product, journeyId) {
  const cartResponse = http.post(
    `${MEDUSA_BASE_URL}/store/carts`,
    JSON.stringify({
      region_id: regionId,
      metadata: {
        traffic_source: "poc-organic",
        journey_id: journeyId,
      },
    }),
    requestParams(journeyId, "create_cart")
  )
  const cartBody = parseJson(cartResponse)
  const cartId = cartBody && cartBody.cart && cartBody.cart.id
  const cartOk = check(cartResponse, {
    "create cart: status 200": (res) => res.status === 200,
    "create cart: cart ID returned": () => Boolean(cartId),
  })

  if (!cartOk || !cartId) {
    return {
      ok: false,
      failedStep: "create_cart",
      status: cartResponse.status,
      cartId: null,
    }
  }

  const variant = randomItem(product.variants)
  const quantity = Math.floor(Math.random() * 3) + 1
  const lineResponse = http.post(
    `${MEDUSA_BASE_URL}/store/carts/${cartId}/line-items`,
    JSON.stringify({
      variant_id: variant.id,
      quantity,
    }),
    requestParams(journeyId, "add_line_item")
  )
  const lineBody = parseJson(lineResponse)
  const items =
    (lineBody && lineBody.cart && lineBody.cart.items) || []
  const lineItem = items.find((item) => item.variant_id === variant.id) || items[0]
  const lineOk = check(lineResponse, {
    "add item: status 200": (res) => res.status === 200,
    "add item: line item returned": () => Boolean(lineItem && lineItem.id),
  })

  if (!lineOk || !lineItem) {
    return {
      ok: false,
      failedStep: "add_line_item",
      status: lineResponse.status,
      cartId,
    }
  }

  http.cookieJar().set(
    STOREFRONT_BASE_URL,
    "_medusa_cart_id",
    cartId,
    { path: "/" }
  )

  return {
    ok: true,
    cartId,
    lineItemId: lineItem.id,
    quantity,
    status: lineResponse.status,
  }
}

function updateOrRemoveCartItem(cart, journeyId) {
  if (Math.random() < 0.5) {
    const response = http.post(
      `${MEDUSA_BASE_URL}/store/carts/${cart.cartId}/line-items/${cart.lineItemId}`,
      JSON.stringify({ quantity: Math.min(cart.quantity + 1, 4) }),
      requestParams(journeyId, "update_line_item")
    )
    return {
      ok: check(response, {
        "update item: status 200": (res) => res.status === 200,
      }),
      status: response.status,
      step: "update_line_item",
    }
  }

  const response = http.del(
    `${MEDUSA_BASE_URL}/store/carts/${cart.cartId}/line-items/${cart.lineItemId}`,
    null,
    requestParams(journeyId, "remove_line_item")
  )
  return {
    ok: check(response, {
      "remove item: status 200": (res) => res.status === 200,
    }),
    status: response.status,
    step: "remove_line_item",
  }
}

function setCheckoutAddress(cartId, journeyId) {
  const profile = randomItem(CUSTOMER_PROFILES)
  const address = {
    first_name: profile.firstName,
    last_name: profile.lastName,
    address_1: profile.address1,
    address_2: "",
    company: "",
    postal_code: profile.postalCode,
    city: profile.city,
    country_code: COUNTRY_CODE,
    province: profile.province,
    phone: profile.phone,
  }
  const response = http.post(
    `${MEDUSA_BASE_URL}/store/carts/${cartId}`,
    JSON.stringify({
      email: `poc-traffic+${journeyId}@example.invalid`,
      shipping_address: address,
      billing_address: address,
    }),
    requestParams(journeyId, "set_checkout_address")
  )

  return {
    ok: check(response, {
      "set checkout address: status 200": (res) => res.status === 200,
    }),
    status: response.status,
  }
}

function addShippingMethod(cartId, journeyId) {
  const optionsResponse = http.get(
    `${MEDUSA_BASE_URL}/store/shipping-options?cart_id=${encodeURIComponent(
      cartId
    )}`,
    requestParams(journeyId, "list_shipping_options")
  )
  const optionsBody = parseJson(optionsResponse)
  const shippingOptions =
    (optionsBody && optionsBody.shipping_options) || []
  const approvedShippingOptions = shippingOptions.filter((option) => {
    const name = String(option.name || "").toLowerCase()
    return name === "standard shipping" || name === "express shipping"
  })
  const selectedOption = randomItem(approvedShippingOptions)
  const optionsOk = check(optionsResponse, {
    "shipping options: status 200": (res) => res.status === 200,
    "shipping options: option available": () => Boolean(selectedOption),
  })

  if (!optionsOk || !selectedOption) {
    return {
      ok: false,
      failedStep: "list_shipping_options",
      status: optionsResponse.status,
    }
  }

  const response = http.post(
    `${MEDUSA_BASE_URL}/store/carts/${cartId}/shipping-methods`,
    JSON.stringify({ option_id: selectedOption.id }),
    requestParams(journeyId, "add_shipping_method")
  )

  return {
    ok: check(response, {
      "add shipping method: status 200": (res) => res.status === 200,
    }),
    failedStep: "add_shipping_method",
    status: response.status,
  }
}

function initializePayment(cartId, journeyId) {
  const collectionResponse = http.post(
    `${MEDUSA_BASE_URL}/store/payment-collections`,
    JSON.stringify({ cart_id: cartId }),
    requestParams(journeyId, "create_payment_collection")
  )
  const collectionBody = parseJson(collectionResponse)
  const paymentCollectionId =
    collectionBody &&
    collectionBody.payment_collection &&
    collectionBody.payment_collection.id
  const collectionOk = check(collectionResponse, {
    "payment collection: status 200": (res) => res.status === 200,
    "payment collection: ID returned": () => Boolean(paymentCollectionId),
  })

  if (!collectionOk || !paymentCollectionId) {
    return {
      ok: false,
      failedStep: "create_payment_collection",
      status: collectionResponse.status,
    }
  }

  const sessionResponse = http.post(
    `${MEDUSA_BASE_URL}/store/payment-collections/${paymentCollectionId}/payment-sessions`,
    JSON.stringify({ provider_id: PAYMENT_PROVIDER_ID }),
    requestParams(journeyId, "initialize_payment_session")
  )
  const sessionBody = parseJson(sessionResponse)
  const sessions =
    (sessionBody &&
      sessionBody.payment_collection &&
      sessionBody.payment_collection.payment_sessions) ||
    []
  const activeSession = sessions.find(
    (session) => session.provider_id === PAYMENT_PROVIDER_ID
  )
  const sessionOk = check(sessionResponse, {
    "payment session: status 200": (res) => res.status === 200,
    "payment session: manual provider initialized": () =>
      Boolean(activeSession),
  })

  return {
    ok: sessionOk,
    failedStep: "initialize_payment_session",
    status: sessionResponse.status,
  }
}

function completeCart(cartId, journeyId) {
  const response = http.post(
    `${MEDUSA_BASE_URL}/store/carts/${cartId}/complete`,
    null,
    requestParams(journeyId, "complete_cart")
  )
  const body = parseJson(response)
  const orderId = body && body.type === "order" && body.order && body.order.id
  const ok = check(response, {
    "complete cart: status 200": (res) => res.status === 200,
    "complete cart: response type is order": () =>
      Boolean(body && body.type === "order"),
    "complete cart: order ID returned": () => Boolean(orderId),
  })

  return {
    ok,
    orderId: orderId || null,
    failedStep: "complete_cart",
    status: response.status,
  }
}

function prepareCheckout(regionId, product, journeyId) {
  const cart = createCartWithItem(regionId, product, journeyId)
  if (!cart.ok) return cart

  thinkTime()
  const cartPage = visitStorefront("/id/cart", journeyId, "storefront_cart")
  if (!cartPage.ok) {
    return {
      ...cart,
      ok: false,
      failedStep: "storefront_cart",
      status: cartPage.status,
    }
  }

  thinkTime()
  const address = setCheckoutAddress(cart.cartId, journeyId)
  if (!address.ok) {
    return {
      ...cart,
      ok: false,
      failedStep: "set_checkout_address",
      status: address.status,
    }
  }

  return cart
}

function runCompletedCheckout(regionId, product, journeyId, journeyType) {
  const startedAt = Date.now()
  let cartId = null

  const prepared = prepareCheckout(regionId, product, journeyId)
  cartId = prepared.cartId || null
  if (!prepared.ok) {
    return recordCheckoutFailure({
      journeyId,
      journeyType,
      cartId,
      startedAt,
      failedStep: prepared.failedStep,
      httpStatus: prepared.status,
    })
  }

  thinkTime()
  const shipping = addShippingMethod(cartId, journeyId)
  if (!shipping.ok) {
    return recordCheckoutFailure({
      journeyId,
      journeyType,
      cartId,
      startedAt,
      failedStep: shipping.failedStep,
      httpStatus: shipping.status,
    })
  }

  thinkTime()
  const payment = initializePayment(cartId, journeyId)
  if (!payment.ok) {
    return recordCheckoutFailure({
      journeyId,
      journeyType,
      cartId,
      startedAt,
      failedStep: payment.failedStep,
      httpStatus: payment.status,
    })
  }

  thinkTime()
  const completed = completeCart(cartId, journeyId)
  if (!completed.ok) {
    return recordCheckoutFailure({
      journeyId,
      journeyType,
      cartId,
      startedAt,
      failedStep: completed.failedStep,
      httpStatus: completed.status,
    })
  }

  const confirmation = visitStorefront(
    `/id/order/${encodeURIComponent(completed.orderId)}/confirmed`,
    journeyId,
    "storefront_order_confirmation"
  )
  if (!confirmation.ok) {
    return recordCheckoutFailure({
      journeyId,
      journeyType,
      cartId,
      orderId: completed.orderId,
      startedAt,
      failedStep: "storefront_order_confirmation",
      httpStatus: confirmation.status,
    })
  }

  const durationMs = Date.now() - startedAt
  checkoutSuccess.add(true)
  checkoutFailure.add(false)
  checkoutDuration.add(durationMs)
  unexpectedErrors.add(false)
  emitJourneyLog({
    journeyId,
    journeyType,
    journeyOutcome: "order_completed",
    cartId,
    orderId: completed.orderId,
    durationMs,
    httpStatus: completed.status,
  })

  return {
    ok: true,
    cartId,
    orderId: completed.orderId,
  }
}

function recordCheckoutFailure({
  journeyId,
  journeyType,
  cartId,
  orderId = null,
  startedAt,
  failedStep,
  httpStatus,
}) {
  const durationMs = Date.now() - startedAt
  checkoutSuccess.add(false)
  checkoutFailure.add(true)
  checkoutDuration.add(durationMs)
  unexpectedErrors.add(true)
  emitJourneyLog({
    journeyId,
    journeyType,
    journeyOutcome: "checkout_failed",
    cartId,
    orderId,
    durationMs,
    failedStep,
    httpStatus,
  })

  return { ok: false, cartId, orderId, failedStep }
}

function recordOrganicResult({
  journeyId,
  journeyType,
  journeyOutcome,
  startedAt,
  ok,
  cartId = null,
  failedStep = null,
  httpStatus = null,
}) {
  organicJourneySuccess.add(ok)
  unexpectedErrors.add(!ok)
  emitJourneyLog({
    journeyId,
    journeyType,
    journeyOutcome: ok ? journeyOutcome : "journey_failed",
    cartId,
    durationMs: Date.now() - startedAt,
    failedStep,
    httpStatus,
  })
}

export function setup() {
  if (!API_KEY) {
    exec.test.abort(
      "MEDUSA_PUBLISHABLE_KEY or NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is required"
    )
  }

  const backendHealth = http.get(`${MEDUSA_BASE_URL}/health`, {
    timeout: "10s",
  })
  if (backendHealth.status !== 200) {
    exec.test.abort(`Backend health check returned ${backendHealth.status}`)
  }

  const storefrontHealth = http.get(`${STOREFRONT_BASE_URL}/id`, {
    timeout: "15s",
    redirects: 5,
  })
  if (storefrontHealth.status !== 200) {
    exec.test.abort(
      `Storefront health check returned ${storefrontHealth.status}`
    )
  }

  const regionsResponse = http.get(
    `${MEDUSA_BASE_URL}/store/regions`,
    requestParams("setup", "list_regions")
  )
  const regionsBody = parseJson(regionsResponse)
  const regions = (regionsBody && regionsBody.regions) || []
  const indonesia = regions.find((region) =>
    (region.countries || []).some((country) => country.iso_2 === COUNTRY_CODE)
  )

  if (regionsResponse.status !== 200 || !indonesia) {
    exec.test.abort("Indonesia region is not available")
  }

  const providersResponse = http.get(
    `${MEDUSA_BASE_URL}/store/payment-providers?region_id=${encodeURIComponent(
      indonesia.id
    )}`,
    requestParams("setup", "list_payment_providers")
  )
  const providersBody = parseJson(providersResponse)
  const providers =
    (providersBody && providersBody.payment_providers) || []
  const manualProviderAvailable = providers.some(
    (provider) => provider.id === PAYMENT_PROVIDER_ID
  )

  if (providersResponse.status !== 200 || !manualProviderAvailable) {
    exec.test.abort(
      `Payment provider ${PAYMENT_PROVIDER_ID} is not available for Indonesia`
    )
  }

  const catalog = fetchCatalog(indonesia.id, "setup")
  if (!catalog.ok) {
    exec.test.abort("No purchasable product variant is available")
  }

  return { regionId: indonesia.id }
}

export function organicJourney(data) {
  const journeyId = createJourneyId("organic")
  const startedAt = Date.now()
  const roll = Math.random() * 100

  const homepage = visitStorefront("/id", journeyId, "storefront_home")
  if (!homepage.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "homepage",
      journeyOutcome: "homepage_bounce",
      startedAt,
      ok: false,
      failedStep: "storefront_home",
      httpStatus: homepage.status,
    })
    return
  }

  if (roll < 30) {
    recordOrganicResult({
      journeyId,
      journeyType: "homepage",
      journeyOutcome: "homepage_bounce",
      startedAt,
      ok: true,
      httpStatus: homepage.status,
    })
    return
  }

  thinkTime()

  if (roll >= 98) {
    const response = http.get(
      `${MEDUSA_BASE_URL}/store/products/non-existent-poc-product`,
      requestParams(journeyId, "expected_invalid_product", {
        expected_failure: "true",
      })
    )
    const expected = response.status === 400 || response.status === 404
    expectedUserErrors.add(expected)
    organicJourneySuccess.add(expected)
    unexpectedErrors.add(!expected)
    emitJourneyLog({
      journeyId,
      journeyType: "expected_user_error",
      journeyOutcome: expected ? "expected_error_observed" : "journey_failed",
      expectedFailure: true,
      durationMs: Date.now() - startedAt,
      failedStep: expected ? null : "expected_invalid_product",
      httpStatus: response.status,
    })
    return
  }

  const storePage = visitStorefront("/id/store", journeyId, "storefront_store")
  const catalog = fetchCatalog(data.regionId, journeyId)
  if (!storePage.ok || !catalog.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "browse",
      journeyOutcome: "catalog_browse",
      startedAt,
      ok: false,
      failedStep: !storePage.ok ? "storefront_store" : "catalog_api",
      httpStatus: !storePage.ok ? storePage.status : catalog.status,
    })
    return
  }

  const product = randomItem(catalog.products)
  thinkTime()
  const productPage = visitStorefront(
    `/id/products/${encodeURIComponent(product.handle)}`,
    journeyId,
    "storefront_product"
  )
  if (!productPage.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "browse",
      journeyOutcome: "product_view",
      startedAt,
      ok: false,
      failedStep: "storefront_product",
      httpStatus: productPage.status,
    })
    return
  }

  if (roll < 55) {
    recordOrganicResult({
      journeyId,
      journeyType: "browse",
      journeyOutcome: "product_view",
      startedAt,
      ok: true,
      httpStatus: productPage.status,
    })
    return
  }

  thinkTime()
  const cart = createCartWithItem(data.regionId, product, journeyId)
  if (!cart.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "cart",
      journeyOutcome: "cart_created",
      startedAt,
      ok: false,
      cartId: cart.cartId,
      failedStep: cart.failedStep,
      httpStatus: cart.status,
    })
    return
  }

  thinkTime()
  const cartPage = visitStorefront("/id/cart", journeyId, "storefront_cart")
  if (!cartPage.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "cart",
      journeyOutcome: "cart_abandoned",
      startedAt,
      ok: false,
      cartId: cart.cartId,
      failedStep: "storefront_cart",
      httpStatus: cartPage.status,
    })
    return
  }

  if (roll < 75) {
    recordOrganicResult({
      journeyId,
      journeyType: "cart",
      journeyOutcome: "cart_abandoned",
      startedAt,
      ok: true,
      cartId: cart.cartId,
      httpStatus: cartPage.status,
    })
    return
  }

  if (roll < 85) {
    thinkTime()
    const mutation = updateOrRemoveCartItem(cart, journeyId)
    recordOrganicResult({
      journeyId,
      journeyType: "cart_mutation",
      journeyOutcome: "cart_mutated_then_abandoned",
      startedAt,
      ok: mutation.ok,
      cartId: cart.cartId,
      failedStep: mutation.ok ? null : mutation.step,
      httpStatus: mutation.status,
    })
    return
  }

  thinkTime()
  const address = setCheckoutAddress(cart.cartId, journeyId)
  if (!address.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "checkout",
      journeyOutcome: "address_abandoned",
      startedAt,
      ok: false,
      cartId: cart.cartId,
      failedStep: "set_checkout_address",
      httpStatus: address.status,
    })
    return
  }

  const deliveryPage = visitStorefront(
    "/id/checkout?step=delivery",
    journeyId,
    "storefront_checkout_delivery"
  )

  if (!deliveryPage.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "checkout",
      journeyOutcome: "address_abandoned",
      startedAt,
      ok: false,
      cartId: cart.cartId,
      failedStep: "storefront_checkout_delivery",
      httpStatus: deliveryPage.status,
    })
    return
  }

  if (roll < 93) {
    recordOrganicResult({
      journeyId,
      journeyType: "checkout",
      journeyOutcome: "address_abandoned",
      startedAt,
      ok: true,
      cartId: cart.cartId,
      httpStatus: address.status,
    })
    return
  }

  thinkTime()
  const shipping = addShippingMethod(cart.cartId, journeyId)
  if (!shipping.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "checkout",
      journeyOutcome: "payment_abandoned",
      startedAt,
      ok: false,
      cartId: cart.cartId,
      failedStep: shipping.failedStep,
      httpStatus: shipping.status,
    })
    return
  }

  thinkTime()
  const payment = initializePayment(cart.cartId, journeyId)
  if (!payment.ok) {
    recordOrganicResult({
      journeyId,
      journeyType: "checkout",
      journeyOutcome: "payment_abandoned",
      startedAt,
      ok: false,
      cartId: cart.cartId,
      failedStep: payment.failedStep,
      httpStatus: payment.status,
    })
    return
  }

  if (roll < 96) {
    const reviewPage = visitStorefront(
      "/id/checkout?step=review",
      journeyId,
      "storefront_checkout_review"
    )
    recordOrganicResult({
      journeyId,
      journeyType: "checkout",
      journeyOutcome: "payment_abandoned",
      startedAt,
      ok: reviewPage.ok,
      cartId: cart.cartId,
      failedStep: reviewPage.ok ? null : "storefront_checkout_review",
      httpStatus: reviewPage.ok ? payment.status : reviewPage.status,
    })
    return
  }

  const completionStartedAt = Date.now()
  const completed = completeCart(cart.cartId, journeyId)
  if (!completed.ok) {
    recordCheckoutFailure({
      journeyId,
      journeyType: "organic_checkout",
      cartId: cart.cartId,
      startedAt: completionStartedAt,
      failedStep: completed.failedStep,
      httpStatus: completed.status,
    })
    organicJourneySuccess.add(false)
    return
  }

  const confirmation = visitStorefront(
    `/id/order/${encodeURIComponent(completed.orderId)}/confirmed`,
    journeyId,
    "storefront_order_confirmation"
  )
  const successful = confirmation.ok
  checkoutSuccess.add(successful)
  checkoutFailure.add(!successful)
  checkoutDuration.add(Date.now() - completionStartedAt)
  organicJourneySuccess.add(successful)
  unexpectedErrors.add(!successful)
  emitJourneyLog({
    journeyId,
    journeyType: "organic_checkout",
    journeyOutcome: successful ? "order_completed" : "checkout_failed",
    cartId: cart.cartId,
    orderId: completed.orderId,
    durationMs: Date.now() - startedAt,
    failedStep: successful ? null : "storefront_order_confirmation",
    httpStatus: successful ? completed.status : confirmation.status,
  })
}

export function guaranteedCheckout(data) {
  const journeyId = createJourneyId("guaranteed")
  const startedAt = Date.now()
  const homepage = visitStorefront("/id", journeyId, "storefront_home")
  if (!homepage.ok) {
    recordCheckoutFailure({
      journeyId,
      journeyType: "guaranteed_checkout",
      cartId: null,
      startedAt,
      failedStep: "storefront_home",
      httpStatus: homepage.status,
    })
    return
  }

  const catalog = fetchCatalog(data.regionId, journeyId)
  if (!catalog.ok) {
    recordCheckoutFailure({
      journeyId,
      journeyType: "guaranteed_checkout",
      cartId: null,
      startedAt,
      failedStep: "catalog_api",
      httpStatus: catalog.status,
    })
    return
  }

  const product = randomItem(catalog.products)
  const productPage = visitStorefront(
    `/id/products/${encodeURIComponent(product.handle)}`,
    journeyId,
    "storefront_product"
  )
  if (!productPage.ok) {
    recordCheckoutFailure({
      journeyId,
      journeyType: "guaranteed_checkout",
      cartId: null,
      startedAt,
      failedStep: "storefront_product",
      httpStatus: productPage.status,
    })
    return
  }
  runCompletedCheckout(
    data.regionId,
    product,
    journeyId,
    "guaranteed_checkout"
  )
}
