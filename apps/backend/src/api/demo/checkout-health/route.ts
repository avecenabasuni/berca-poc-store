import { existsSync } from "node:fs"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const impactMarker =
  process.env.POC_DISK_IMPACT_MARKER || "/var/run/berca-poc/disk-degraded"

export const GET = (_req: MedusaRequest, res: MedusaResponse) => {
  const demoEnabled = process.env.POC_DEMO_MODE === "true"
  const degraded = demoEnabled && existsSync(impactMarker)

  res.status(degraded ? 503 : 200).json({
    status: degraded ? "degraded" : "ok",
  })
}
