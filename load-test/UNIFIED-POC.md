# AI-Driven Autonomous Remediation with Datadog and Red Hat Ansible

This is the canonical runbook for the Berca live sales demo. It is a controlled
POC, not a production availability design.

## Hero story

```text
Checkout Service Degraded
  -> Datadog generic service monitor ALERT
  -> Bits Investigation
  -> bounded POOL / DISK / UNKNOWN classification
  -> approved direct_script or EDA dispatch
  -> deterministic recovery command
  -> Datadog telemetry verification
  -> success or safe escalation
```

Pool and disk are always demonstrated separately. There is no combined fault,
random fault, scheduler, or production soak test.

## Components

```text
Storefront :8000
  -> Berca checkout backend :9000
  -> PgBouncer :6432 (5/5 baseline)
  -> PostgreSQL :5432

traffic-generator -> real store/cart/checkout requests
pool-hog          -> opt-in 25-client PgBouncer saturation
log-generator     -> opt-in 200 MB loopback synthetic log saturation
Datadog Agent     -> APM, logs, PgBouncer, disk, HTTP health, custom log metrics
Demo Control API  -> authenticated fixed action adapter on the Linux VM
```

## Repository control interface

Run on the Linux Docker VM:

```bash
./demo-control.sh status
./demo-control.sh pool
./demo-control.sh recover-pool
./demo-control.sh disk
./demo-control.sh recover-disk
./demo-control.sh reset
```

The script accepts exactly one action and uses a lock. It refuses a pool fault
while disk is active and refuses a disk fault while the dedicated pool-hog is
active.

Pool fault acceptance:

```text
PgBouncer remains configured 5/5
sv_active >= 5
cl_waiting > 0
checkout latency/error increases
```

Pool recovery acceptance:

```text
dedicated pool-hog removed
PgBouncer remains 5/5
cl_waiting = 0
```

Disk fault acceptance:

```text
/var/log/poc-app is the /tmp/poc-log-disk.img loopback ext4 volume
disk usage reaches about 85%
poc.synthetic_log.growth_bytes_per_second is positive during growth
checkout health endpoint becomes 503
```

Disk recovery acceptance:

```text
trigger and impact marker removed
only the synthetic POC log is truncated
disk usage < 20%
log growth stops
checkout health returns 200
```

## Demo Control API installation

The API is a POC-only host service because loopback operations must occur on the
VM, not inside a privileged control container.

1. Copy `ops/demo-control-api.env.example` to
   `/etc/berca-poc/demo-control-api.env`.
2. Replace both token placeholders with different random values of at least 32
   characters and set mode `0600`.
3. Copy `ops/demo-control-api.service.example` to
   `/etc/systemd/system/berca-poc-demo-control.service` and replace
   `@POC_PROJECT_PATH@` with the absolute repository path.
4. Reload systemd and enable the service.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now berca-poc-demo-control.service
sudo systemctl status berca-poc-demo-control.service --no-pager
curl -s http://127.0.0.1:18080/healthz
```

Use Datadog Private Action Runner/private HTTP Connections to reach the private
endpoint. Do not expose this API directly to the internet.

Token scopes:

| Connection | Allowed actions |
|---|---|
| Workflow 1 fault-control | `pool`, `disk`, `reset` |
| Workflow 2 direct remediation | `recover-pool`, `recover-disk` |

The API rejects additional JSON fields, query-string commands, arbitrary
arguments, and cross-scope actions.

## Datadog configuration

Detailed UI steps are in `datadog/WORKFLOW-CONTRACT.md`.

Workflow 1 is manual and exposes only:

```text
scenario: pool | disk | reset
```

Workflow 2 is monitor-triggered. A workflow-level constant selects one internal
transport:

```text
direct_script  # standalone development
eda            # final Red Hat integration
```

Both transports share the same Bits polling, classifier, approved action
catalog, UNKNOWN handling, telemetry verification, and escalation. There is no
automatic fallback between transports during an incident.

## Live demo sequence

Preflight:

```bash
export DD_API_KEY='<INJECTED_ON_VM>'
docker compose up -d postgres redis pgbouncer medusa storefront \
  traffic-generator log-generator datadog-agent
./demo-control.sh reset
./demo-control.sh status
```

Pool presentation:

1. Show baseline dashboard and healthy checkout.
2. Run Workflow 1 with `scenario=pool`.
3. Show only the generic checkout degradation alert to the audience.
4. Show Bits investigation and bounded `POOL` conclusion.
5. Show Workflow 2 dispatch through the configured transport.
6. Show `cl_waiting=0`, normal checkout telemetry, and Workflow success.
7. Run reset before another scenario.

Disk presentation:

1. Show reset baseline.
2. Run Workflow 1 with `scenario=disk`.
3. Show generic degradation, disk growth, storage-specific logs, and Bits.
4. Show bounded `DISK` conclusion and approved recovery dispatch.
5. Show disk below 20%, zero growth, healthy checkout, and Workflow success.
6. Run reset.

UNKNOWN presentation:

```text
ambiguous/empty/failed/timeout investigation
  -> UNKNOWN
  -> no dispatch
  -> notification to the operational channel
```

## Red Hat Ansible handoff

The final implementation boundary and exact events are in
`datadog/ANSIBLE-HANDOFF.md`. The owner Ansible supplies EDA and AAP objects and
maps only the two approved events to the two deterministic repository recovery
commands.

## External values not stored in Git

```text
DD_API_KEY / Datadog Application Key
Demo Control fault and remediation tokens
Private Action Runner enrollment and Connections
VM address and TLS material
Datadog monitor/workflow IDs
EDA Event Stream URL/credential
AAP inventory, Machine Credential, and Job Template IDs
operational notification handle
```

## Pre-customer acceptance

Run each path at least three times:

```text
pool -> POOL -> recovery -> telemetry success -> reset
disk -> DISK -> recovery -> telemetry success -> reset
ambiguous result -> UNKNOWN -> no action -> notification
```

Also test invalid API action, cross-scope token use, API unavailable, EDA
unavailable, Bits timeout, and recovery that exits successfully but does not
clear telemetry.
