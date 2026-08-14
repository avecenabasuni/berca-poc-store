# Ansible Playbooks for Datadog Integration

This document explains the Ansible playbooks available in this repository and
how the Datadog Workflow owner should integrate with them through the AAP
Controller API.

## Architecture Overview

```
Datadog detects degradation
  → Bits Investigation classifies: POOL / DISK / AUTOSCALE / ROLLBACK / UNKNOWN
  → Datadog Workflow selects a fixed Job Template endpoint
  → POST to AAP Controller API with audit IDs only
  → AAP runs the pre-approved playbook on the POC VM
  → Datadog polls AAP job status until terminal
  → Datadog verifies recovery from its own telemetry
```

Ansible never determines root cause. Datadog never sends commands, hosts, paths,
or shell arguments. Each Job Template is bound to exactly one playbook with a
fixed, pre-approved action.

## Playbook Inventory

### Remediation Playbooks (called by Datadog Workflow 2)

| Playbook | Job Template | Purpose |
|---|---|---|
| `recover-pool.yml` | Pool Remediation (JT 18) | Stop the dedicated `pool-hog` process that saturates PgBouncer connection pools. Verifies `cl_waiting=0` and pool config at baseline `5/5`. Does NOT restart PgBouncer or PostgreSQL. |
| `recover-disk.yml` | Disk Remediation (JT 19) | Remove the synthetic saturation trigger and impact marker, truncate the exact saturation log file, verify disk usage drops below 20%. Does NOT unmount the loopback volume. |
| `recover-autoscale.yml` | Storefront Autoscale Remediation | Scale the observed stable storefront image from exactly one to exactly two healthy replicas while the approved spike remains active. |
| `recover-rollback.yml` | Storefront Deployment Rollback | Replace the approved `demo-bad` digest with the immutable stable digest from the root-owned VM allowlist and verify catalog HTTP 200. |

### Fault Injection Playbooks (called by Datadog Workflow 1)

| Playbook | Job Template | Purpose |
|---|---|---|
| `fault-pool.yml` | Pool Fault (JT 21) | Start the dedicated `pool-hog` container to saturate all PgBouncer connections. Polls until `sv_active>=5` and `cl_waiting>0`. |
| `fault-disk.yml` | Disk Fault (JT 22) | Create a constrained 200 MB loopback ext4 volume, mount it, place a saturation trigger, and re-create the log generator. Polls until disk usage reaches >=85%. |
| `fault-autoscale.yml` | Storefront Autoscale Fault | Start only the fixed `traffic-spike` profile at the inventory-controlled rate. It does not scale replicas. |
| `fault-rollback.yml` | Storefront Deployment Regression Fault | Deploy only the approved `demo-bad` digest and verify `/id/store` returns the known 503 regression while health remains healthy. |

### Reset Playbook (manual or Workflow 1 reset)

| Playbook | Job Template | Purpose |
|---|---|---|
| `reset.yml` | Full Reset (JT 20) | Restore full baseline: stop pool-hog, reset PgBouncer config, clean all disk artifacts (trigger, marker, log, unmount, detach, remove image), re-create consumers, and run full verification. |

### Status Playbook (operator use)

| Playbook | Job Template | Purpose |
|---|---|---|
| `status.yml` | Status | Read-only state collection. No lock, no changes. Publishes pool config, metrics, disk mount state, usage, trigger/marker status, and container health as AAP job artifacts. |

### Required storefront Inventory values

Set these as protected Inventory/Host Variables, not survey fields or Datadog
payload values:

```yaml
poc_project_path: /home/ave/berca-poc-store
poc_autoscale_spike_rate: 10
poc_storefront_release_config_file: /etc/berca-poc/storefront-release.env
```

The release file remains root-owned mode `0600` and contains only the approved
stable and demo-bad image digests and versions. Do not enable prompt-on-launch
for image, version, repository, replica count, service name, project path, or
traffic rate. The two remediation templates expose only `monitor_id`,
`investigation_id`, and `workflow_instance_id` as bounded survey fields.

## Reusable Role

All playbooks delegate to a single reusable role at
`roles/berca_poc_demo/`. The role contains isolated task files for each
operation (preflight, lock, state reading, fault, recovery, reset, status).
Playbooks are intentionally thin — each one imports exactly one action
lifecycle.

### Role Task Files

| Task File | Function |
|---|---|
| `tasks/preflight.yml` | Verify Docker Compose v2, project path, Docker daemon |
| `tasks/acquire-lock.yml` | Atomic shared host lock at `/run/lock/berca-poc-demo` |
| `tasks/release-lock.yml` | Lock cleanup in `always` blocks |
| `tasks/read-pool-state.yml` | Query PgBouncer `SHOW CONFIG` and `SHOW POOLS` |
| `tasks/read-disk-state.yml` | Check mountpoint, loopback, disk usage, trigger, marker |
| `tasks/read-storefront-state.yml` | Read replica count, health, Traefik, spike, image, version, and release mode |
| `tasks/read-storefront-release-config.yml` | Validate the root-owned immutable stable/demo-bad release allowlist |
| `tasks/reconcile-storefront.yml` | Reconcile only one or two replicas to a fixed internal image/version target |
| `tasks/fault-pool.yml` | Start pool-hog, poll saturation |
| `tasks/fault-disk.yml` | Create image, ext4, mount, trigger, re-create consumers |
| `tasks/fault-autoscale.yml` | Start the bounded storefront traffic spike |
| `tasks/fault-rollback.yml` | Deploy the allowlisted demo-bad release and verify the known regression |
| `tasks/recover-pool.yml` | Stop pool-hog, verify baseline |
| `tasks/recover-disk.yml` | Remove trigger/marker, truncate log, verify recovery |
| `tasks/recover-autoscale.yml` | Scale one healthy stable replica to exactly two |
| `tasks/recover-rollback.yml` | Restore the allowlisted stable release and verify catalog recovery |
| `tasks/reset.yml` | Full baseline restore with block/rescue/always |
| `tasks/status.yml` | Collect and publish observed state |

## Instructions for the Datadog Workflow Owner

### AAP Controller Details

| Item | Value |
|---|---|
| **Controller base URL** | `https://192.168.2.66` |
| **API prefix** | `/api/controller/v2/` |
| **Authentication** | Bearer token (OAuth2 PAT) |
| **Network** | Private; use a Datadog Private Action Runner |

### Tokens

You will receive two scoped OAuth2 tokens from the Ansible administrator:

| Token | Scope | Allowed Job Templates |
|---|---|---|
| Remediation token | `write` | JT 18 (Pool Remediation), JT 19 (Disk Remediation) |
| Fault control token | `write` | JT 21 (Pool Fault), JT 22 (Disk Fault), JT 20 (Full Reset) |

The remediation token cannot trigger faults or reset. The fault control token
cannot trigger remediation. Store tokens in the Datadog HTTP Connection
configuration only — never in workflow bodies, logs, repositories, or
screenshots.

### Workflow 2: Remediation Dispatch

After Bits classifies the issue, select the fixed endpoint:

```
POOL → POST https://192.168.2.66/api/controller/v2/job_templates/18/launch/
DISK → POST https://192.168.2.66/api/controller/v2/job_templates/19/launch/
UNKNOWN → no request; escalate
```

#### Launch Request

Both JT 18 and JT 19 accept the same payload. Send only audit identifiers:

```http
POST https://192.168.2.66/api/controller/v2/job_templates/18/launch/
Authorization: Bearer <REMEDIATION_TOKEN>
Content-Type: application/json

{
  "extra_vars": {
    "monitor_id": "<DATADOG_MONITOR_ID>",
    "investigation_id": "<BITS_INVESTIGATION_ID>",
    "workflow_instance_id": "<DATADOG_WORKFLOW_INSTANCE_ID>"
  }
}
```

All three fields are **required** (enforced by AAP survey validation). The
playbook will reject empty values.

**Do NOT send** any of the following — they will be ignored or cause rejection:

- `target_host` or any IP/hostname
- `alert_title` or free-text descriptions
- `path`, `filename`, or `command`
- `sql`, `pool_size`, or `container`
- `playbook`, `credential`, or `job_template_id`

All operational parameters (host, path, container names, thresholds) are fixed
in the AAP Inventory and playbook configuration.

#### Launch Response

A successful launch returns HTTP `201 Created`:

```json
{
  "id": 42,
  "type": "job",
  "url": "/api/controller/v2/jobs/42/",
  "status": "pending",
  ...
}
```

Save the numeric `id` as `aap_job_id`.

#### Polling Job Status

Poll the job until it reaches a terminal state:

```http
GET https://192.168.2.66/api/controller/v2/jobs/<aap_job_id>/
Authorization: Bearer <REMEDIATION_TOKEN>
```

| Status | Terminal? | Meaning |
|---|---|---|
| `pending` | No | Queued |
| `waiting` | No | Waiting for capacity |
| `running` | No | Executing |
| `successful` | **Yes** | Playbook completed without errors |
| `failed` | **Yes** | Playbook or a task failed |
| `error` | **Yes** | System-level error |
| `canceled` | **Yes** | Job was canceled |

Use a **bounded wait** (e.g., 5 minutes). Do not build a remediation retry
ladder. If the job does not reach a terminal state in time, treat it as a
failure and escalate.

#### After AAP Completes

**AAP success only proves execution, not recovery.** After `successful`:

1. Continue to the shared Datadog telemetry verification step.
2. Check that backend latency and error rate have returned to normal.
3. Only then mark the workflow as successful.

If the AAP job fails, errors, or is canceled — or if Datadog telemetry does
not confirm recovery — escalate.

### Workflow 1: Fault Injection Dispatch

The presenter triggers Workflow 1 to inject a fault for the demo:

```
pool  → POST https://192.168.2.66/api/controller/v2/job_templates/21/launch/
disk  → POST https://192.168.2.66/api/controller/v2/job_templates/22/launch/
reset → POST https://192.168.2.66/api/controller/v2/job_templates/20/launch/
```

Fault and reset launches do not require audit IDs. Send an empty body or:

```json
{
  "extra_vars": {}
}
```

Use the **fault control token** (not the remediation token). Poll job status
the same way as Workflow 2.

### Recovery Acceptance Criteria

These are the conditions that Datadog telemetry should verify **after** AAP
reports `successful`:

#### POOL Recovery

```
pool-hog stopped
AND default_pool_size = 5
AND max_db_connections = 5
AND cl_waiting = 0
AND backend latency normal (Datadog metric)
AND backend error rate normal (Datadog metric)
```

#### DISK Recovery

```
synthetic trigger file removed
AND synthetic impact marker removed
AND app-saturation.log truncated
AND disk usage < 20%
AND synthetic log growth = 0
AND backend latency normal (Datadog metric)
AND backend error rate normal (Datadog metric)
```

#### UNKNOWN

```
no AAP launch
AND no infrastructure change
AND escalation sent to operator
```

### Concurrent Execution

All Job Templates have concurrent execution disabled. Additionally, a shared
host lock prevents different templates from running at the same time. If a
launch request arrives while another job is running, it will queue (AAP
behavior) or the playbook will fail fast on lock acquisition.

**Do not** build automatic retry logic for this — a queued or failed concurrent
launch should result in escalation.

### Checklist for the Datadog Owner

- [ ] Receive the remediation OAuth2 token from the Ansible administrator
- [ ] Receive the fault control OAuth2 token from the Ansible administrator
- [ ] Confirm Job Template IDs: Pool Remediation=18, Disk Remediation=19, Full Reset=20, Pool Fault=21, Disk Fault=22
- [ ] Deploy a Datadog Private Action Runner that can reach `192.168.2.66`
- [ ] Configure two Datadog HTTP Connections (remediation + fault control)
- [ ] Wire Workflow 2 POOL branch to the Pool Remediation JT endpoint
- [ ] Wire Workflow 2 DISK branch to the Disk Remediation JT endpoint
- [ ] Wire Workflow 1 pool/disk/reset branches to their JT endpoints
- [ ] Verify launch returns numeric `id` and poll reaches terminal state
- [ ] Confirm that AAP `successful` status alone does NOT mean recovery
- [ ] Implement independent Datadog telemetry verification after AAP completes
- [ ] Implement escalation for `UNKNOWN`, dispatch failure, or recovery failure
