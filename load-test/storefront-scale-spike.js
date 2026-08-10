import http from "k6/http"
import { check, fail, sleep } from "k6"

const storefrontBaseUrl = (__ENV.STOREFRONT_BASE_URL || "").replace(/\/$/, "")
const rate = Number(__ENV.AUTOSCALE_SPIKE_RATE || "")

if (!storefrontBaseUrl) {
  fail("STOREFRONT_BASE_URL is required")
}

if (!Number.isInteger(rate) || rate < 1 || rate > 240) {
  fail("AUTOSCALE_SPIKE_RATE must be an integer between 1 and 240")
}

export const options = {
  scenarios: {
    storefront_capacity_spike: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration: "10m",
      preAllocatedVUs: Math.min(Math.max(10, rate), 60),
      maxVUs: Math.min(Math.max(20, rate * 2), 120),
      gracefulStop: "30s",
      tags: {
        traffic_profile: "autoscale-spike",
        target_service: "berca-storefront",
      },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.10"],
  },
}

const routes = ["/id", "/id/store"]

export default function storefrontCapacitySpike() {
  const route = routes[Math.floor(Math.random() * routes.length)]
  const response = http.get(`${storefrontBaseUrl}${route}`, {
    tags: {
      journey_type: "storefront_capacity_spike",
      route_class: route === "/id" ? "homepage" : "catalog",
    },
  })

  check(response, {
    "storefront spike: response is successful": (result) =>
      result.status >= 200 && result.status < 400,
  })

  sleep(0.1)
}
