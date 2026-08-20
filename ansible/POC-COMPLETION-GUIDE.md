# POC Implementation TODO
## Datadog + Red Hat Ansible Automation Platform (AAP) + Nutanix

Based on [`ANSIBLE-HANDOFF.md`](../load-test/datadog/ANSIBLE-HANDOFF.md) as of 20 August 2026.

---

## Scenario Status Summary

### Ansible Side

| # | Scenario | Playbooks | AAP Job Templates | Tested? |
|---:|---|---|---|---|
| 1 | PgBouncer Pool Saturation | `fault-pool.yml`, `recover-pool.yml` | **JT 21** (Fault), **JT 18** (Remediation) | Yes |
| 2 | Synthetic Disk Full | `fault-disk.yml`, `recover-disk.yml` | **JT 22** (Fault), **JT 19** (Remediation) | Yes |
| 3 | Storefront Deployment Rollback | `fault-rollback.yml`, `recover-rollback.yml` | Not yet created | Playbooks tested locally |
| 4 | Storefront Horizontal Autoscale | `fault-autoscale.yml`, `recover-autoscale.yml` | Not yet created | Playbooks tested locally |
| 5 | RHEL 9.6 Package Vulnerability | 5 CVE playbooks in `cve_playbooks/` | **JT 24** (Remediation) + Preflight/Validate/Reset/Rollback | Yes |
| 6 | Nutanix VM Memory Hot-Add | **No playbooks exist** | No templates | Not started |
| - | Global Reset | `reset.yml` | **JT 20** (Reset) | Yes |

### Datadog Side

| # | Scenario | Datadog Workflow File | Workflow Wired to AAP? | E2E Tested? |
|---:|---|---|---|---|
| 1 | PgBouncer Pool Saturation | `remediation-apps.json` | Handed over to Datadog | Not yet |
| 2 | Synthetic Disk Full | `remediation-apps.json` | Handed over to Datadog | Not yet |
| 3 | Storefront Deployment Rollback | `remediation-apps.json` | Blocked (no JT ID yet) | Not yet |
| 4 | Storefront Horizontal Autoscale | `remediation-apps.json` | Blocked (no JT ID yet) | Not yet |
| 5 | RHEL 9.6 Package Vulnerability | `soar.json` | Handed over to Datadog | Not yet |
| 6 | Nutanix VM Memory Hot-Add | `remediation-apps.json` | Blocked (no playbook/JT) | Not yet |
| - | Fault injection & Reset | `scenario-controller.json` | Handed over to Datadog | Not yet |

---

## What Is Left To Do

### Ansible Engineer TODO

#### Scenario 3: Storefront Rollback — Create AAP Job Templates
Playbooks exist (`fault-rollback.yml`, `recover-rollback.yml`). Need to create AAP Job Templates:

- [ ] Create Fault Job Template: **Deploy Storefront Demo-Bad**
  - Playbook: `fault-rollback.yml`
  - Inventory: `berca_poc_vm`
  - Survey: None (fault injection, no audit IDs)
  - Concurrent jobs: disabled
- [ ] Create Remediation Job Template: **Rollback Storefront to Stable**
  - Playbook: `recover-rollback.yml`
  - Inventory: `berca_poc_vm`
  - Survey: `monitor_id`, `investigation_id`, `workflow_instance_id` (all required)
  - Concurrent jobs: disabled
- [ ] Record the numeric Job Template IDs and hand them to Datadog colleague

#### Scenario 4: Storefront Autoscale — Create AAP Job Templates
Playbooks exist (`fault-autoscale.yml`, `recover-autoscale.yml`). Need to create AAP Job Templates:

- [ ] Create Fault Job Template: **Start Storefront Capacity Spike**
  - Playbook: `fault-autoscale.yml`
  - Inventory: `berca_poc_vm`
  - Survey: None (fault injection)
  - Concurrent jobs: disabled
- [ ] Create Remediation Job Template: **Scale Storefront to 2**
  - Playbook: `recover-autoscale.yml`
  - Inventory: `berca_poc_vm`
  - Survey: `monitor_id`, `investigation_id`, `workflow_instance_id` (all required)
  - Concurrent jobs: disabled
- [ ] Record the numeric Job Template IDs and hand them to Datadog colleague

#### Scenario 6: Nutanix Memory Hot-Add — Build Playbooks & AAP Templates
No playbooks exist yet. Reference spec: [`MEMORY-HOT-ADD-POC.md`](../load-test/MEMORY-HOT-ADD-POC.md).

- [ ] Create playbook `ansible/inject-memory.yml`
  - Target: `berca_poc_vm`
  - Action: Run `docker compose --profile memory-demo up -d memory-pressure`
  - Preflight: Verify Docker daemon, Compose v2, project path, no other scenario active
- [ ] Create playbook `ansible/hot-add-memory.yml`
  - Target: Nutanix Prism API (not SSH to guest)
  - Action: Hot-add VM memory from 16 GiB (16384 MiB) to 24 GiB (24576 MiB)
  - Verify: In-guest `free -m` shows >=24 GiB, Datadog Agent reports updated memory
  - Do NOT stop `memory-pressure` — hot-add happens while pressure is still active
- [ ] Create playbook `ansible/restore-memory.yml`
  - Target: `berca_poc_vm` (SSH) + Nutanix Prism API
  - Action: Stop and remove `memory-pressure` container, restore VM RAM to 16 GiB via Nutanix API
  - Verify: Guest sees 16 GiB, application healthy, storefront responds HTTP 200
- [ ] Create Fault Job Template: **Inject Application VM Memory Pressure**
  - Playbook: `inject-memory.yml`
  - Inventory: `berca_poc_vm`
  - Concurrent jobs: disabled
- [ ] Create Remediation Job Template: **Hot Add Application VM Memory to 24 GiB**
  - Playbook: `hot-add-memory.yml`
  - Credential: Nutanix Prism API credential (stored in AAP, not in playbook)
  - Concurrent jobs: disabled
- [ ] Create Reset Job Template: **Restore Application VM Memory to 16 GiB**
  - Playbook: `restore-memory.yml`
  - Credential: Nutanix Prism API + Machine SSH
  - Concurrent jobs: disabled
- [ ] Record the numeric Job Template IDs and hand them to Datadog colleague

#### Cross-Scenario: Final Verification Items from ANSIBLE-HANDOFF.md Section 10

- [ ] Confirm SCM project synced to agreed commit
- [ ] Confirm both inventory groups (`berca_poc_vm` + `rhel96_vuln_poc`) and Machine Credentials work
- [ ] Confirm all Job Templates have `allow_simultaneous: false` and shared operation lock
- [ ] Verify native pool/disk/autoscale/rollback pass positive AND negative tests
- [ ] Verify CVE allowlist uses advisory actually present on the demo RHEL VM (not placeholder values)
- [ ] Verify CVE remediation fails safely if `finding_id` empty, advisory not allowlisted, or repo unavailable
- [ ] Confirm Nutanix snapshot available and Reset Check passes after restore
- [ ] Hand over endpoint, Job Template IDs, and scoped token to Datadog colleague (never via Git)

---

### Datadog Engineer TODO

#### For Scenarios 1 & 2 (Pool & Disk) — Already Handed Over
- [ ] Configure Datadog HTTP Connection with **Remediation Token** for `https://192.168.2.66`
- [ ] Configure Datadog HTTP Connection with **Fault Control Token** for `https://192.168.2.66`
- [ ] Wire Workflow 2 `POOL` branch to `POST /api/controller/v2/job_templates/18/launch/`
- [ ] Wire Workflow 2 `DISK` branch to `POST /api/controller/v2/job_templates/19/launch/`
- [ ] Wire Workflow 1 `pool` to JT 21, `disk` to JT 22, `reset` to JT 20
- [ ] Test launch returns numeric `id` and poll reaches terminal state

#### For Scenario 5 (CVE) — Already Handed Over
- [ ] Configure Datadog HTTP Connection with **`svc_datadog_cve` Token** for `https://192.168.2.66`
- [ ] Update `soar.json` with real AAP URL and Job Template ID 24
- [ ] Wire SecOps Workflow to `POST /api/v2/job_templates/24/launch/` with 6 survey fields
- [ ] Simplify `soar.json` payload to match the 6 agreed fields (remove extra fields per Section 7 of ANSIBLE-HANDOFF)

#### For Scenarios 3 & 4 (Rollback & Autoscale) — Waiting on Ansible JT IDs
- [ ] Receive Rollback and Autoscale Job Template IDs from Ansible engineer
- [ ] Wire `ROLLBACK` and `AUTOSCALE` branches in `remediation-apps.json`

#### For Scenario 6 (Memory) — Waiting on Ansible Playbooks & JT IDs
- [ ] Receive Memory Inject, Hot-Add, and Restore Job Template IDs from Ansible engineer
- [ ] Wire `MEMORY_PRESSURE` branch in `remediation-apps.json`

#### Joint E2E Dry Run — All Scenarios
- [ ] Run full end-to-end for Pool: fault -> monitor alert -> Bits classify -> approve -> JT 18 -> verify telemetry recovery
- [ ] Run full end-to-end for Disk: fault -> monitor alert -> Bits classify -> approve -> JT 19 -> verify telemetry recovery
- [ ] Run full end-to-end for Rollback: fault -> monitor alert -> Bits classify -> approve -> JT -> verify `DD_VERSION=stable`
- [ ] Run full end-to-end for Autoscale: fault -> monitor alert -> Bits classify -> approve -> JT -> verify 2 replicas
- [ ] Run full end-to-end for CVE: finding -> policy gate -> Slack approve -> JT 24 -> verify SBOM rescan resolves finding
- [ ] Run full end-to-end for Memory: inject -> monitor alert -> approve -> hot-add JT -> verify 24 GiB visible
- [ ] Run full Reset: JT 20 -> verify clean baseline via `status.yml` and Datadog dashboard

---

## Reference Documents

| Document | Purpose |
|---|---|
| [`load-test/datadog/ANSIBLE-HANDOFF.md`](../load-test/datadog/ANSIBLE-HANDOFF.md) | Canonical cross-team contract |
| [`ansible/PLAYBOOK-GUIDE.md`](PLAYBOOK-GUIDE.md) | App incident playbook details & Datadog integration (JT 18, 19, 20, 21, 22) |
| [`ansible/cve_playbooks/IMPLEMENTATION-GUIDE.md`](cve_playbooks/IMPLEMENTATION-GUIDE.md) | Full AAP setup guide for CVE playbooks |
| [`ansible/cve_playbooks/DATADOG-HANDOVER-GUIDE.md`](cve_playbooks/DATADOG-HANDOVER-GUIDE.md) | Datadog engineer handover for CVE scenario (JT 24) |
| [`load-test/MEMORY-HOT-ADD-POC.md`](../load-test/MEMORY-HOT-ADD-POC.md) | Nutanix memory hot-add specification |
