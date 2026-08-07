# Handoff contract for the Red Hat Ansible owner

## Ownership boundary

The repository owner supplies deterministic recovery references and Datadog
launch contracts. The Red Hat Ansible owner supplies the final AAP Inventory,
credentials, Job Templates, and playbooks.

The repository intentionally contains no final AAP Inventory, Job Template,
credential, or remediation playbook. Those assets remain owned by the Red Hat
Ansible team.

The detailed implementation and acceptance specification for that owner is in
[`ansible/README.md`](../../ansible/README.md). It also defines how existing AAP
Job Templates 13 (pool), 14 (disk), and 15 (manual reset) fit into the direct
Datadog Workflow to AAP flow.

## Approved classification context

POOL:

```yaml
schema_version: "1.0"
environment: poc
service: berca-backend
classification: POOL
resource_id: pgbouncer-demo
requested_action: recover_pool
monitor_id: "<DATADOG_MONITOR_ID>"
investigation_id: "<BITS_INVESTIGATION_ID>"
workflow_instance_id: "<DATADOG_WORKFLOW_INSTANCE_ID>"
```

DISK:

```yaml
schema_version: "1.0"
environment: poc
service: berca-backend
classification: DISK
resource_id: synthetic-log-volume
requested_action: recover_disk
monitor_id: "<DATADOG_MONITOR_ID>"
investigation_id: "<BITS_INVESTIGATION_ID>"
workflow_instance_id: "<DATADOG_WORKFLOW_INSTANCE_ID>"
```

No AAP job is launched for `UNKNOWN`.

## Exact mapping

| Classification | Fixed AAP endpoint | Expected remediation |
|---|---|---|
| `POOL` | Job Template 13 | Stop only the dedicated pool-hog and drain the queue |
| `DISK` | Job Template 14 | Recover only the whitelisted synthetic log volume |

The Job Template stores its classification/resource/action as fixed variables.
Datadog passes only `monitor_id`, `investigation_id`, and
`workflow_instance_id` through required survey fields. Do not accept a host,
path, filename, command, SQL statement, pool size, playbook name, or arbitrary
extra variable from the launch request.

## Expected technical results

Pool result:

```text
dedicated pool-hog stopped
default_pool_size = 5
max_db_connections = 5
cl_waiting = 0
```

Disk result:

```text
target verified as /tmp/poc-log-disk.img loopback ext4
synthetic trigger removed
only app-saturation.log truncated
disk usage < 20%
synthetic log growth stopped
backend impact marker removed
```

Ansible job success is execution evidence only. Datadog Workflow performs the
final service recovery decision from telemetry.

## Integration placeholders

The Ansible owner must provide these outside Git:

```text
<AAP_BASE_URL>
<AAP_OAUTH_TOKEN_CONNECTION>
<POC_VM_INVENTORY_HOST>
<POC_MACHINE_CREDENTIAL>
<POC_PROJECT_PATH>
<POOL_JOB_TEMPLATE_ID_13>
<DISK_JOB_TEMPLATE_ID_14>
```
