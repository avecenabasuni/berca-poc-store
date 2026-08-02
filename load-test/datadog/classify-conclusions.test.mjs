import assert from "node:assert/strict"
import test from "node:test"

import {
  APPROVED_ACTION_CATALOG,
  classifyInvestigation,
} from "./classify-conclusions.mjs"

test("classifies exclusive PgBouncer evidence as POOL", () => {
  const result = classifyInvestigation({
    status: "completed",
    conclusions: [
      {
        summary: "PgBouncer connection pool saturation",
        description: "Clients waiting for an available server connection",
      },
    ],
  })

  assert.equal(result.classification, "POOL")
  assert.equal(result.direct_script_action, "recover-pool")
  assert.equal(result.canonical_action, "recover_pool")
})

test("classifies exclusive storage evidence as DISK", () => {
  const result = classifyInvestigation({
    status: "COMPLETED",
    conclusions: [
      {
        summary: "Filesystem storage saturation",
        description: "The synthetic log volume is nearly full",
      },
    ],
  })

  assert.equal(result.classification, "DISK")
  assert.equal(result.direct_script_action, "recover-disk")
  assert.equal(result.canonical_action, "recover_disk")
})

test("returns UNKNOWN when both categories are present", () => {
  const result = classifyInvestigation({
    status: "completed",
    conclusions: ["PgBouncer is waiting while the disk storage is full"],
  })

  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.reason, "ambiguous_pool_and_disk_evidence")
})

test("returns UNKNOWN for incomplete, empty, or malformed results", () => {
  assert.equal(classifyInvestigation({ status: "running", conclusions: [] }).classification, "UNKNOWN")
  assert.equal(classifyInvestigation({ status: "completed", conclusions: [] }).classification, "UNKNOWN")
  assert.equal(
    classifyInvestigation({ status: "completed", conclusions: [{ unexpected: "disk" }] }).classification,
    "UNKNOWN"
  )
})

test("UNKNOWN catalog cannot dispatch a remediation", () => {
  assert.equal(APPROVED_ACTION_CATALOG.UNKNOWN.canonical_action, "none")
  assert.equal(APPROVED_ACTION_CATALOG.UNKNOWN.direct_script_action, "none")
})
