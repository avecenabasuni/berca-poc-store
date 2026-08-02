# Datadog Workflow contract for the hero demo

This document describes UI configuration. It is not Configuration as Code and
contains no credential values. The demo has two independent Datadog Workflows
and never runs a combined fault.

## 1. Phase 3 validation spike: Get Investigation

Do this before publishing Workflow 2. `Get Investigation` is experimental, so
the Datadog organization’s observed output is the source of truth.

1. Trigger an investigation from a real monitor alert.
2. Save the raw output of `Trigger Investigation`.
3. Call `Get Investigation` while it is running and after it completes.
4. Record the exact paths for ID, status, title, timestamps, and
   `conclusions[]`.
5. Record every actual field inside one conclusion object. Do not infer fields
   that are not present.
6. Repeat once for pool and once for disk. Capture empty/failed output if
   available.

Capture sheet:

| Observation | Actual value/path |
|---|---|
| Trigger Investigation ID | `<CAPTURE_IN_DATADOG_UI>` |
| Get status | `<CAPTURE_IN_DATADOG_UI>` |
| Completed status value | `<CAPTURE_IN_DATADOG_UI>` |
| Conclusions array | `<CAPTURE_IN_DATADOG_UI>` |
| Conclusion text fields | `<CAPTURE_IN_DATADOG_UI>` |
| Pool completion time | `<CAPTURE_IN_DATADOG_UI>` |
| Disk completion time | `<CAPTURE_IN_DATADOG_UI>` |

The reference classifier in `classify-conclusions.mjs` reads only strings and
the currently documented `summary`/`description` fields. If the captured schema
differs, adapt only the normalization function and rerun its tests. An unreadable
schema must produce `UNKNOWN`.

## 2. Workflow 1: POC - Trigger Demo Fault

Trigger: manual or Datadog dashboard Run Workflow widget.

Input:

```text
scenario: pool | disk | reset
```

Steps:

1. Switch on the exact scenario enum. Default branch fails safely.
2. Map the scenario to the same API action string.
3. POST `/v1/demo/action` through the private HTTP Connection named
   `<POC_FAULT_CONTROL_CONNECTION>`.
4. Use the fault-control token. The Connection owns the token; it is never an
   input or workflow variable.
5. Require HTTP `202`, store the returned `job_id`, and display the bounded
   accepted response.
6. Poll authenticated `GET /v1/demo/status` every five seconds until the same
   `job_id` reaches `succeeded` or `failed`, with a five-minute workflow limit.
7. Optionally display `demo_state` for presenter evidence.

Request:

```json
{"action":"{{ Trigger.scenario }}"}
```

The API independently enforces that this token can call only `pool`, `disk`,
and `reset`. A second action receives HTTP `409` while the first job is
`accepted` or `running`. Workflow 1 does not call Workflow 2 and does not pass
its scenario to the monitor or investigation.

## 3. Generic checkout degradation monitor

Create these service-impact leaf monitors after capturing the real APM resource
and tag names in Datadog:

```text
A: checkout p95 latency > max(2 * measured baseline p95, 2 seconds)
B: checkout error rate > 10% over last 1 minute
C: http.can_connect for poc-berca-checkout-health is CRITICAL twice consecutively
```

Create one top-level composite:

```text
A || B || C
```

Name it `POC - Berca Checkout Service Degraded`. Its title and message must not
name PgBouncer, disk, filesystem, or the active fault. Trigger Workflow 2 only
on the `ALERT` transition.

UI values that must be captured rather than guessed:

```text
<CHECKOUT_APM_SERVICE>
<CHECKOUT_RESOURCE_NAME>
<LATENCY_MONITOR_ID>
<ERROR_MONITOR_ID>
<HEALTH_MONITOR_ID>
<GENERIC_COMPOSITE_MONITOR_ID>
```

## 4. Workflow 2: POC - AI Autonomous Remediation

Create a workflow-level variable, not a monitor input:

```text
remediation_transport = direct_script | eda
```

Use `direct_script` during standalone development. Change the constant to `eda`
for the final Red Hat integration. Reject any other value before triggering an
investigation.

Shared flow:

1. Validate that the monitor status is `ALERT`.
2. Trigger Bits Investigation using the monitor event ID, event timestamp, and
   monitor ID exposed by the actual trigger context.
3. Poll `Get Investigation` every 15 seconds, at most 24 times.
4. Normalize the captured `conclusions[]` fields.
5. Run the bounded classifier and approved action catalog.
6. `UNKNOWN` skips all dispatch and goes directly to escalation.
7. For `POOL` or `DISK`, switch only on `remediation_transport`.
8. Both dispatch branches converge into the same wait and telemetry
   verification steps.

Approved catalog:

| Classification | Canonical action | Direct API action | Resource |
|---|---|---|---|
| `POOL` | `recover_pool` | `recover-pool` | `pgbouncer-demo` |
| `DISK` | `recover_disk` | `recover-disk` | `synthetic-log-volume` |
| `UNKNOWN` | `none` | `none` | `none` |

The workflow must not use Bits output as a host, URL, path, filename, command,
playbook name, or free-form parameter.

### direct_script adapter

POST `/v1/demo/action` using `<POC_DIRECT_REMEDIATION_CONNECTION>`. This
Connection uses the remediation-only token.

```json
{"action":"<approved direct_script_action>"}
```

Require HTTP `202`, store `job_id`, then poll authenticated
`GET /v1/demo/status` every five seconds. Continue only when the response
contains the same `job_id` and `job_state=succeeded`. A `failed` state,
different job ID, five-minute timeout, or HTTP `409` goes to escalation.

The API independently prevents this token from calling fault or reset actions.
Its bounded job states are `accepted`, `running`, `succeeded`, and `failed`.
`succeeded` proves only that the deterministic command exited successfully; it
does not prove service recovery.

Example accepted response:

```json
{"ok":true,"action":"recover-pool","state":"accepted","job_id":"<JOB_ID>"}
```

Status exposes `current_action`, `job_id`, `job_state`, the latest bounded job
record, and the separately observed `demo_state`.

### eda adapter

POST the payload defined in `ANSIBLE-HANDOFF.md` to
`<EDA_EVENT_STREAM_URL>`. HTTP acceptance proves only that dispatch was
accepted; it is not recovery evidence.

## 5. Shared verification

After the selected adapter reports execution completion:

1. Wait 30 seconds.
2. Query Datadog telemetry up to three times with a 15-second interval.
3. Do not dispatch remediation again.
4. Mark success only when all classification-specific conditions are true.

Pool conditions:

```text
max(last_30s):pgbouncer.pools.cl_waiting{env:poc,resource_id:pgbouncer-demo} = 0
checkout latency is below the calibrated threshold
checkout error rate < 10%
checkout health check is OK
```

`demo-control.sh recover-pool` also refuses to report command success unless
the runtime configuration remains `default_pool_size=5` and
`max_db_connections=5`. That check is a safety invariant and execution
evidence; it is not a substitute for the Datadog service-recovery conditions
above.

Disk conditions:

```text
max(last_30s):system.disk.in_use{env:poc,resource_id:synthetic-log-volume} < 0.20
max(last_30s):poc.synthetic_log.growth_bytes_per_second{env:poc} = 0
checkout latency is below the calibrated threshold
checkout error rate < 10%
checkout health check is OK
```

Use Query Scalar actions where available. Confirm the real metric tags and
response paths in the UI before publishing.

## 6. Escalation

On `UNKNOWN`, investigation timeout/failure, dispatch failure, or failed
telemetry verification:

- stop without another infrastructure action;
- mark the workflow failed;
- notify `<OPERATIONS_NOTIFICATION_HANDLE>`;
- include monitor ID/time, investigation ID/title/status, conclusion summary,
  classification reason, selected transport, dispatch result, verification
  results, and Workflow instance ID/link.

Do not create an automatic Incident, Case, retry ladder, approval, or fallback
from `eda` to `direct_script` during an active run.
