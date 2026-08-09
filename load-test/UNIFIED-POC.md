# AI-Driven Autonomous Remediation with Datadog and Red Hat Ansible

This is the canonical runbook for the Berca live sales demo. It is a controlled
POC, not a production availability design.

## Hero story

```text
Backend Service Degraded
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
  -> Berca backend :9000
  -> PgBouncer :6432 (5/5 baseline)
  -> PostgreSQL :5432

traffic-generator -> organic storefront visits and real guest orders
pool-hog          -> opt-in 25-client PgBouncer saturation
log-generator     -> opt-in 200 MB loopback synthetic log saturation
Datadog Agent     -> APM, logs, PgBouncer, disk, HTTP health, custom log metrics
Demo Control API  -> authenticated fixed action adapter on the Linux VM
```

## Organic traffic and storefront access

The continuous traffic generator is a hybrid workload. It requests real
storefront pages through `berca-storefront` and performs deterministic cart and
checkout mutations through the Medusa Store API. It does not run Chromium.

Organic sessions follow a bounded distribution:

| Outcome | Share |
|---|---:|
| Homepage bounce | 30% |
| Catalog/product browse | 25% |
| Add cart then abandon | 20% |
| Update/remove cart then abandon | 10% |
| Address-stage abandonment | 8% |
| Shipping/payment abandonment | 3% |
| Completed guest order | 2% |
| Expected invalid user request | 2% |

A separate journey guarantees one completed guest checkout every five minutes.
Checkout is successful only when Medusa returns `type=order` with an order ID;
HTTP `400` and payment-collection creation are never treated as completion.
This produces about 288 guaranteed POC orders per day when the generator runs
continuously, plus the 2% organic completions.

Traffic intensity uses WIB and is recalculated at the start of each six-hour
k6 cycle: 1 session/minute overnight, 3 during business hours, 6 at evening
peak, and 2 at late night. Expected invalid requests are tracked independently
from unexpected errors and remain below the generic backend alert threshold.

Generated carts and orders use bounded Indonesian guest profiles and email
addresses under `example.invalid`. They are retained so that the presenter can
show real orders in Medusa Admin. `demo-control.sh reset` deliberately does not
delete commerce data. Stop continuous data generation with:

```bash
docker compose stop traffic-generator
```

On the Linux VM, create an ignored root `.env` from `.env.example` and replace
the placeholders:

```text
STOREFRONT_PUBLIC_URL=https://store.bercalab.my.id
```

Also add `https://store.bercalab.my.id` to `STORE_CORS` and `AUTH_CORS` in the
VM's ignored `apps/backend/.env`. Server-side storefront requests and the
same-origin `/api/medusa` browser proxy use `http://medusa:9000` on the Docker
network. The browser must never call the VM's private HTTP backend directly.

The Docker storefront is a production-only Next.js server. Its public URL and
publishable key are compiled into the browser bundle, so changing either value
requires rebuilding the storefront image. Always confirm that the VM value is
the public HTTPS URL, not the VM's private address:

```bash
docker compose build storefront
docker compose up -d storefront
```

The Medusa startup script now runs the idempotent POC commerce-data repair
after database migrations. It ensures the Indonesia service zone and its
approved Standard and Express shipping options exist without reseeding products
or deleting commerce data. Therefore, deploy the backend image together with
the storefront whenever this checkout fix changes:

```bash
docker compose build --no-cache medusa storefront
docker compose up -d --force-recreate medusa storefront
docker compose logs --tail=100 medusa
```

The backend log must include both `Reconciling idempotent Berca POC commerce
data...` and `Indonesia POC shipping options are ready.` (or the already-exist
equivalent). To run the same repair manually for diagnosis, use:

```bash
docker compose exec medusa ./node_modules/.bin/medusa exec \
  src/migration-scripts/initial-data-seed.js
```

The container runs `next start`, has no source or build-output bind mounts, and
uses `/api/healthz` for its Docker healthcheck. That endpoint is intentionally
local-only in behavior: it does not fetch Medusa, cart, customer, database, or
disk state.

After one warm-up request, a simple server-TTFB check on the VM is:

```bash
curl -fsS http://127.0.0.1:8000/api/healthz
curl -so /dev/null http://127.0.0.1:8000/id
for path in /id /id/checkout; do
  for run in $(seq 1 10); do
    curl -so /dev/null -w "$path run=$run ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
      "http://127.0.0.1:8000$path"
  done
done
```

Run the checkout measurement with a valid cart cookie when comparing the exact
checkout trace; a request without a cart may return `404` and is not a useful
checkout performance sample. The target is warm TTFB p95 below one second and
the first request after a storefront restart below two seconds.

Human storefront validation from another Lab machine:

1. Open `http://<VM_IP>:8000/id`.
2. Browse a product, add it to the cart, and continue as a guest.
3. Use the Manual Payment provider and place the order.
4. Confirm that the order-confirmation page loads and the order appears in
   Medusa Admin.

Traffic logs use `service:berca-traffic-generator` and include journey type,
outcome, cart/order IDs, duration, failed step, and HTTP status. Checkout
remains a business workload; the hero service and generic monitor remain
`berca-backend` and `Berca Backend Service Degraded`.

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
backend request latency/error increases
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
backend health endpoint becomes 503
```

Disk recovery acceptance:

```text
trigger and impact marker removed
only the synthetic POC log is truncated
disk usage < 20%
log growth stops
backend health returns 200
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
arguments, and cross-scope actions. `POST /v1/demo/action` returns HTTP `202`
with a generated `job_id`; the fixed command runs asynchronously. Only one job
may be `accepted` or `running`, and a concurrent request receives HTTP `409`.

Authenticated `GET /v1/demo/status` returns the current action, bounded job
state (`accepted`, `running`, `succeeded`, or `failed`), and observed demo
state. Command stdout/stderr is written to the bounded rotating log:

```text
/var/log/berca-poc/demo-control-jobs.log
```

API job success remains execution evidence only. Workflow success still
requires Datadog telemetry recovery.

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
cp -n .env.example .env
# Set MEDUSA_PUBLISHABLE_KEY and STOREFRONT_PUBLIC_URL.
# Add the Lab storefront origin to apps/backend/.env CORS values.
docker compose up -d --build postgres redis pgbouncer medusa storefront \
  traffic-generator log-generator datadog-agent
./demo-control.sh reset
./demo-control.sh status
```

Verify organic traffic before injecting a fault:

```bash
docker compose run --rm --no-deps --entrypoint k6 traffic-generator \
  inspect /scripts/baseline-traffic.js
docker compose ps medusa storefront traffic-generator
docker compose logs --since 6m traffic-generator | grep 'order_completed'
```

The `k6 inspect` command must succeed before starting the continuous generator.
If no completed order appears within six minutes, inspect the structured
`failed_step` value and verify the Indonesia region, Standard/Express shipping
options, and `pp_system_default` payment provider in Medusa Admin.

Pool presentation:

1. Show baseline dashboard and healthy backend service.
2. Run Workflow 1 with `scenario=pool`.
3. Show only the generic backend degradation alert to the audience.
4. Show Bits investigation and bounded `POOL` conclusion.
5. Show Workflow 2 dispatch through the configured transport.
6. Show `cl_waiting=0`, normal backend telemetry, and Workflow success.
7. Run reset before another scenario.

Disk presentation:

1. Show reset baseline.
2. Run Workflow 1 with `scenario=disk`.
3. Show generic degradation, disk growth, storage-specific logs, and Bits.
4. Show bounded `DISK` conclusion and approved recovery dispatch.
5. Show disk below 20%, zero growth, healthy backend, and Workflow success.
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
