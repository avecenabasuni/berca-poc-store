# Handoff contract for the Red Hat Ansible owner

## Ownership boundary

The repository owner supplies deterministic recovery commands and Datadog event
contracts. The Red Hat Ansible owner supplies the final Event Stream, Rulebook,
Decision Environment, Inventory, credentials, Job Templates, and playbooks.

The repository intentionally contains no final EDA Rulebook, Decision
Environment, AAP inventory, Job Template, credential, or remediation playbook.
Those assets remain owned by the Red Hat Ansible team.

The detailed implementation and acceptance specification for that owner is in
[`ansible/README.md`](../../ansible/README.md). It also defines how existing AAP
Job Templates 13 (pool), 14 (disk), and 15 (manual reset) fit into the final EDA
flow.

## Approved event schema

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

No EDA event is sent for `UNKNOWN`.

## Exact mapping

| Event | Approved VM command |
|---|---|
| `POOL` + `pgbouncer-demo` + `recover_pool` | `<POC_PROJECT_PATH>/demo-control.sh recover-pool` |
| `DISK` + `synthetic-log-volume` + `recover_disk` | `<POC_PROJECT_PATH>/demo-control.sh recover-disk` |

Reject all other field combinations. Do not accept a host, path, filename,
command, SQL statement, pool size, playbook name, or arbitrary extra variable
from the event.

## Expected technical results

Pool command:

```text
dedicated pool-hog stopped
default_pool_size = 5
max_db_connections = 5
cl_waiting = 0
```

Disk command:

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
<EDA_EVENT_STREAM_URL>
<EDA_EVENT_STREAM_CREDENTIAL>
<POC_VM_INVENTORY_HOST>
<POC_MACHINE_CREDENTIAL>
<POC_PROJECT_PATH>
<POOL_JOB_TEMPLATE>
<DISK_JOB_TEMPLATE>
```
