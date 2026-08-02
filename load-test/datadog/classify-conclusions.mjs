const POOL_INDICATORS = [
  ["pgbouncer", /\bpgbouncer\b/i],
  ["connection_pool", /\bconnection\s+pool\b/i],
  ["client_waiting", /\bclients?\s+waiting\b/i],
  ["pool_saturation", /\bpool\s+saturat(?:ed|ion)\b/i],
  ["exhausted_connections", /\b(?:exhausted|exhaustion)\s+connections?\b/i],
]

const DISK_INDICATORS = [
  ["disk", /\bdisk\b/i],
  ["filesystem", /\bfile\s*system\b/i],
  ["storage", /\bstorage\b/i],
  ["log_volume", /\blog\s+volume\b/i],
  ["no_space_left", /\bno\s+space\s+left\b/i],
  ["storage_saturation", /\bstorage\s+saturat(?:ed|ion)\b/i],
]

export const APPROVED_ACTION_CATALOG = Object.freeze({
  POOL: Object.freeze({
    classification: "POOL",
    canonical_action: "recover_pool",
    direct_script_action: "recover-pool",
    resource_id: "pgbouncer-demo",
  }),
  DISK: Object.freeze({
    classification: "DISK",
    canonical_action: "recover_disk",
    direct_script_action: "recover-disk",
    resource_id: "synthetic-log-volume",
  }),
  UNKNOWN: Object.freeze({
    classification: "UNKNOWN",
    canonical_action: "none",
    direct_script_action: "none",
    resource_id: "none",
  }),
})

function conclusionText(conclusion) {
  if (typeof conclusion === "string") {
    return conclusion.trim()
  }
  if (!conclusion || typeof conclusion !== "object" || Array.isArray(conclusion)) {
    return ""
  }

  return [conclusion.summary, conclusion.description]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n")
}

function findIndicators(text, indicators) {
  return indicators
    .filter(([, expression]) => expression.test(text))
    .map(([name]) => name)
}

export function classifyInvestigation({ status, conclusions } = {}) {
  if (typeof status !== "string" || status.toLowerCase() !== "completed") {
    return {
      ...APPROVED_ACTION_CATALOG.UNKNOWN,
      reason: "investigation_not_completed",
      pool_indicators: [],
      disk_indicators: [],
    }
  }
  if (!Array.isArray(conclusions) || conclusions.length === 0) {
    return {
      ...APPROVED_ACTION_CATALOG.UNKNOWN,
      reason: "conclusions_empty_or_unreadable",
      pool_indicators: [],
      disk_indicators: [],
    }
  }

  const text = conclusions.map(conclusionText).filter(Boolean).join("\n")
  if (!text) {
    return {
      ...APPROVED_ACTION_CATALOG.UNKNOWN,
      reason: "conclusions_empty_or_unreadable",
      pool_indicators: [],
      disk_indicators: [],
    }
  }

  const poolIndicators = findIndicators(text, POOL_INDICATORS)
  const diskIndicators = findIndicators(text, DISK_INDICATORS)

  if (poolIndicators.length > 0 && diskIndicators.length === 0) {
    return {
      ...APPROVED_ACTION_CATALOG.POOL,
      reason: "exclusive_pool_evidence",
      pool_indicators: poolIndicators,
      disk_indicators: [],
    }
  }
  if (diskIndicators.length > 0 && poolIndicators.length === 0) {
    return {
      ...APPROVED_ACTION_CATALOG.DISK,
      reason: "exclusive_disk_evidence",
      pool_indicators: [],
      disk_indicators: diskIndicators,
    }
  }

  return {
    ...APPROVED_ACTION_CATALOG.UNKNOWN,
    reason:
      poolIndicators.length > 0 && diskIndicators.length > 0
        ? "ambiguous_pool_and_disk_evidence"
        : "no_approved_indicator",
    pool_indicators: poolIndicators,
    disk_indicators: diskIndicators,
  }
}
