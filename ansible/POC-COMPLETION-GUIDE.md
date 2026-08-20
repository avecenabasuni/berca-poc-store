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
| 3 | Storefront Deployment Rollback | `fault-rollback.yml`, `recover-rollback.yml` | **JT 29** (Fault), **JT 30** (Remediation) | Ready for verification |
| 4 | Storefront Horizontal Autoscale | `fault-autoscale.yml`, `recover-autoscale.yml` | **JT 31** (Fault), **JT 32** (Remediation) | Ready for verification |
| 5 | RHEL 9.6 Package Vulnerability | 5 CVE playbooks in `cve_playbooks/` | **JT 24** (Remediation) + Preflight/Validate/Reset/Rollback | Yes |
| 6 | Nutanix VM Memory Hot-Add | **No playbooks exist** | No templates | Not started |
| - | Global Reset | `reset.yml` | **JT 20** (Reset) | Yes |

### Datadog Side

| # | Scenario | Datadog Workflow File | Workflow Wired to AAP? | E2E Tested? |
|---:|---|---|---|---|
| 1 | PgBouncer Pool Saturation | `remediation-apps.json` | Handed over to Datadog | Not yet |
| 2 | Synthetic Disk Full | `remediation-apps.json` | Handed over to Datadog | Not yet |
| 3 | Storefront Deployment Rollback | `remediation-apps.json` | Handed over to Datadog (JT 29, 30) | Not yet |
| 4 | Storefront Horizontal Autoscale | `remediation-apps.json` | Handed over to Datadog (JT 31, 32) | Not yet |
| 5 | RHEL 9.6 Package Vulnerability | `soar.json` | Handed over to Datadog | Not yet |
| 6 | Nutanix VM Memory Hot-Add | `remediation-apps.json` | Blocked (no playbook/JT) | Not yet |
| - | Fault injection & Reset | `scenario-controller.json` | Handed over to Datadog | Not yet |

---

## What Is Left To Do

### Ansible Engineer TODO

#### Scenario 3: Storefront Deployment Rollback — Setup Guide & Job Templates

**Overview:**
Simulates a candidate deployment that passes container startup healthcheck (`/api/healthz` returns `200`) but degrades the catalog page (`/id/store` returns `503` with 2.5s delay). Datadog detects deployment regression, triggers a Slack approval card, and dispatches AAP to roll back to the immutable stable digest.

**1. Required Host / Group Variables in AAP:**
In Inventory **`Ansible Datadog Collab POC VMs`** > Group **`berca_poc_vm`** > **Variables (YAML)**:
```yaml
poc_project_path: /home/ave/berca-poc-store
poc_storefront_release_config_file: /etc/berca-poc/storefront-release.env
```

**2. VM Pre-requisite File (Verified on VM):**
File `/etc/berca-poc/storefront-release.env` on `berca_poc_vm` (`root:root`, `0600`):
```dotenv
STOREFRONT_STABLE_IMAGE=ghcr.io/avecenabasuni/berca-storefront@sha256:82eca70754b8bf146fa35ceac2cbf5fd3c4e62d27fd8902b6898d7f9c0349fa4
STOREFRONT_STABLE_VERSION=stable-1f5584fd0b09
STOREFRONT_BAD_IMAGE=ghcr.io/avecenabasuni/berca-storefront@sha256:138df396919fb4cc469a59df45aea603bb355a10e5b43592b947297daa7e663e
STOREFRONT_BAD_VERSION=demo-bad-1f5584fd0b09
```

**3. Create Fault Job Template:**
- [ ] **Name:** `Deploy Storefront Demo-Bad`
  - **Job Type:** `Run`
  - **Inventory:** `Ansible Datadog Collab POC VMs`
  - **Project:** `Ansible Datadog Playbooks`
  - **Playbook:** `ansible/fault-rollback.yml`
  - **Credentials:** `Datadog Credential` (with sudo/become)
  - **Limit:** `berca_poc_vm`
  - **Options:** `Privilege Escalation: Checked (become: true)`, `Enable Concurrent Jobs: Unchecked`
  - **Survey:** None (launched with empty payload `{}`)
  - **User Access (Permissions):**
    - Go to **User Access** (or **Access**) tab > Click **Add**
    - Select User: **`svc-datadog-fault-control`**
    - Select Role: **Execute** (allows Datadog Scenario Controller / Fault Token to launch this template)
  - **Verification:**
    ```bash
    curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/api/healthz  # Returns 200
    curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/id/store     # Returns 503
    ```

**4. Create Remediation Job Template with Survey:**
- [ ] **Name:** `Rollback Storefront to Stable`
  - **Job Type:** `Run`
  - **Inventory:** `Ansible Datadog Collab POC VMs`
  - **Project:** `Ansible Datadog Playbooks`
  - **Playbook:** `ansible/recover-rollback.yml`
  - **Credentials:** `Datadog Credential`
  - **Limit:** `berca_poc_vm`
  - **Options:** `Privilege Escalation: Checked`, `Enable Concurrent Jobs: Unchecked`
  - **Survey Configuration (Enabled):**
    | # | Question | Answer Variable | Type | Required | Default |
    |---|---|---|---|---|---|
    | 1 | Datadog Monitor ID | `monitor_id` | Text | Yes | `manual-test` |
    | 2 | Bits Investigation ID | `investigation_id` | Text | Yes | `manual-test` |
    | 3 | Workflow Instance ID | `workflow_instance_id` | Text | Yes | `manual-test` |
  - **User Access (Permissions):**
    - Go to **User Access** tab > Click **Add**
    - Select User: **`svc-datadog-remediation`**
    - Select Role: **Execute** (allows Datadog App Remediation Workflow to launch this template)
  - **Verification:**
    ```bash
    curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/id/store     # Returns 200
    ```
    - Check Datadog tag: `DD_VERSION=stable`, error rate `< 1%`.

- [x] **Record Numeric Job Template IDs** and share with Datadog colleague:
  - Fault JT ID: **`29`** (launched by `svc-datadog-fault-control` token)
  - Remediation JT ID: **`30`** (launched by `svc-datadog-remediation` token)

---

#### Scenario 4: Storefront Horizontal Autoscale — Setup Guide & Job Templates

**Overview:**
Simulates a traffic spike on the storefront service behind Traefik (port `8000`). Datadog detects capacity degradation (p95 latency spike) and prompts approval in Slack. AAP scales the storefront from 1 to 2 healthy replicas behind Traefik without touching backend or database.

**1. Required Host / Group Variables in AAP:**
In Inventory **`Ansible Datadog Collab POC VMs`** > Group **`berca_poc_vm`** > **Variables (YAML)**:
```yaml
poc_project_path: /home/ave/berca-poc-store
poc_autoscale_spike_rate: 10
```

**2. Create Fault Job Template:**
- [ ] **Name:** `Start Storefront Capacity Spike`
  - **Job Type:** `Run`
  - **Inventory:** `Ansible Datadog Collab POC VMs`
  - **Project:** `Ansible Datadog Playbooks`
  - **Playbook:** `ansible/fault-autoscale.yml`
  - **Credentials:** `Datadog Credential`
  - **Limit:** `berca_poc_vm`
  - **Options:** `Privilege Escalation: Checked`, `Enable Concurrent Jobs: Unchecked`
  - **Survey:** None (launched with empty payload `{}`)
  - **User Access (Permissions):**
    - Go to **User Access** tab > Click **Add**
    - Select User: **`svc-datadog-fault-control`**
    - Select Role: **Execute** (allows Datadog Scenario Controller to start the traffic spike)
  - **Verification:**
    - Verify `docker compose ps` shows `traffic-spike` container running under `autoscale-demo` profile.
    - Datadog p95 latency monitor transitions to `ALERT`.

**3. Create Remediation Job Template with Survey:**
- [ ] **Name:** `Scale Storefront to 2`
  - **Job Type:** `Run`
  - **Inventory:** `Ansible Datadog Collab POC VMs`
  - **Project:** `Ansible Datadog Playbooks`
  - **Playbook:** `ansible/recover-autoscale.yml`
  - **Credentials:** `Datadog Credential`
  - **Limit:** `berca_poc_vm`
  - **Options:** `Privilege Escalation: Checked`, `Enable Concurrent Jobs: Unchecked`
  - **Survey Configuration (Enabled):**
    | # | Question | Answer Variable | Type | Required | Default |
    |---|---|---|---|---|---|
    | 1 | Datadog Monitor ID | `monitor_id` | Text | Yes | `manual-test` |
    | 2 | Bits Investigation ID | `investigation_id` | Text | Yes | `manual-test` |
    | 3 | Workflow Instance ID | `workflow_instance_id` | Text | Yes | `manual-test` |
  - **User Access (Permissions):**
    - Go to **User Access** tab > Click **Add**
    - Select User: **`svc-datadog-remediation`**
    - Select Role: **Execute** (allows Datadog App Remediation Workflow to scale storefront)
  - **Verification:**
    - `docker compose ps` shows exactly 2 healthy storefront replicas.
    - Traefik routes traffic across both replicas; p95 latency drops to `< 500ms`.

- [x] **Record Numeric Job Template IDs** and share with Datadog colleague:
  - Fault JT ID: **`31`** (launched by `svc-datadog-fault-control` token)
  - Remediation JT ID: **`32`** (launched by `svc-datadog-remediation` token)

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

#### For Scenarios 3 & 4 (Rollback & Autoscale) — Handed Over (JT 29, 30, 31, 32)
- [x] Received Job Template IDs:
  - Scenario 3 (Rollback): Fault JT **`29`**, Remediation JT **`30`**
  - Scenario 4 (Autoscale): Fault JT **`31`**, Remediation JT **`32`**
- [ ] Wire `ROLLBACK` branch in `remediation-apps.json` to `POST /api/controller/v2/job_templates/30/launch/`
- [ ] Wire `AUTOSCALE` branch in `remediation-apps.json` to `POST /api/controller/v2/job_templates/32/launch/`
- [ ] Wire Workflow 1 (`scenario-controller.json`) `rollback` to JT 29, `autoscale` to JT 31

#### For Scenario 6 (Memory) — Waiting on Ansible Playbooks & JT IDs
- [ ] Receive Memory Inject, Hot-Add, and Restore Job Template IDs from Ansible engineer
- [ ] Wire `MEMORY_PRESSURE` branch in `remediation-apps.json`

#### Joint E2E Dry Run — All Scenarios
- [ ] Run full end-to-end for Pool: fault -> monitor alert -> Bits classify -> approve -> JT 18 -> verify telemetry recovery
- [ ] Run full end-to-end for Disk: fault -> monitor alert -> Bits classify -> approve -> JT 19 -> verify telemetry recovery
- [ ] Run full end-to-end for Rollback: fault -> monitor alert -> Bits classify -> approve -> JT 30 -> verify `DD_VERSION=stable`
- [ ] Run full end-to-end for Autoscale: fault -> monitor alert -> Bits classify -> approve -> JT 32 -> verify 2 replicas
- [ ] Run full end-to-end for CVE: finding -> policy gate -> Slack approve -> JT 24 -> verify SBOM rescan resolves finding
- [ ] Run full end-to-end for Memory: inject -> monitor alert -> approve -> hot-add JT -> verify 24 GiB visible
- [ ] Run full Reset: JT 20 -> verify clean baseline via `status.yml` and Datadog dashboard

---

## Job Template Verification & Testing Guide

Use this section to verify that all configured Job Templates in AAP execute correctly and produce the expected outcomes on the VM and endpoints.

### Scenario 1: PgBouncer Pool Saturation (JT 21 & JT 18)
1. **Trigger Fault (JT 21: `Inject PgBouncer Pool Saturation`):**
   * Launch in AAP (no survey).
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`).
   * **VM Verification:**
     ```bash
     docker ps --filter "name=berca_poc_pool_hog" # Container running
     sudo /home/ave/berca-poc-store/demo-control.sh status | jq .pool_saturated # Returns true
     ```
2. **Trigger Remediation (JT 18: `Recover PgBouncer Pool Saturation`):**
   * Launch in AAP → Fill survey audit IDs → Launch.
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`), published stats with `poc_classification: POOL`.
   * **VM Verification:**
     ```bash
     sudo /home/ave/berca-poc-store/demo-control.sh status | jq .pool_saturated # Returns false
     ```

---

### Scenario 2: Synthetic Disk Full (JT 22 & JT 19)
1. **Trigger Fault (JT 22: `Inject Synthetic Disk Full`):**
   * Launch in AAP (no survey).
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`).
   * **VM Verification:**
     ```bash
     sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{degraded: .disk_degraded, usage_pct: .disk_usage_pct}'
     # Expected: { "degraded": true, "usage_pct": >=95 }
     ```
2. **Trigger Remediation (JT 19: `Recover Synthetic Disk Full`):**
   * Launch in AAP → Fill survey audit IDs → Launch.
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`), published stats with `poc_classification: DISK`.
   * **VM Verification:**
     ```bash
     sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{degraded: .disk_degraded, usage_pct: .disk_usage_pct}'
     # Expected: { "degraded": false, "usage_pct": <=20 }
     ```

---

### Scenario 3: Storefront Deployment Rollback (JT 29 & JT 30)
1. **Trigger Fault (JT 29: `Deploy Storefront Demo-Bad`):**
   * Launch in AAP (no survey).
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`).
   * **VM / Endpoint Verification:**
     ```bash
     curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/api/healthz  # Expected: 200
     curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/id/store     # Expected: 503 (2.5s delay)
     sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{mode: .storefront_release_mode, version: .storefront_version}'
     # Expected: { "mode": "demo_bad", "version": "demo-bad-1f5584fd0b09" }
     ```
2. **Trigger Remediation (JT 30: `Rollback Storefront to Stable`):**
   * Launch in AAP → Fill survey audit IDs (`manual-test`) → Launch.
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`), published stats with `poc_classification: ROLLBACK`.
   * **VM / Endpoint Verification:**
     ```bash
     curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/id/store     # Expected: 200
     sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{mode: .storefront_release_mode, version: .storefront_version}'
     # Expected: { "mode": "stable", "version": "stable-1f5584fd0b09" }
     ```

---

### Scenario 4: Storefront Horizontal Autoscale (JT 31 & JT 32)
1. **Trigger Fault (JT 31: `Start Storefront Capacity Spike`):**
   * Launch in AAP (no survey).
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`).
   * **VM Verification:**
     ```bash
     docker ps --filter "name=traffic-spike" # Container "berca-poc-store-traffic-spike-1" is running
     sudo /home/ave/berca-poc-store/demo-control.sh status | jq .autoscale_spike_active # Expected: true
     ```
2. **Trigger Remediation (JT 32: `Scale Storefront to 2`):**
   * Launch in AAP → Fill survey audit IDs → Launch.
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`), published stats with `poc_classification: AUTOSCALE`.
   * **VM Verification:**
     ```bash
     docker ps --filter "name=storefront" # Exactly 2 containers running
     sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{replicas: .storefront_replicas, healthy: .storefront_healthy}'
     # Expected: { "replicas": 2, "healthy": true }
     ```
3. **Reset Scale to 1 Replica:** Run **Global Reset (JT 20)** to stop the spike and return storefront to 1 replica.

---

### Scenario 5: RHEL 9.6 Package Vulnerability (JT 24)
1. **Preflight Scan (Optional):** Launch `RHEL 9.6 CVE Preflight` in AAP → Confirms available CVE advisories on `rhel09-vuln-poc-01`.
2. **Trigger Remediation (JT 24: `RHEL 9.6 CVE Remediation`):**
   * Launch in AAP → Fill Survey with:
     - `cve_id`: `CVE-2025-15467` (or target CVE)
     - `package_name`: `curl` (or target package)
     - `severity`: `high` (or `critical` / `medium`)
     - `finding_id`: `manual-test`
     - `approval_reference`: `manual-approval`
   * **Expected AAP Outcome:** Status `Successful` (`failed=0`), published stats with `status: "patch_applied_pending_security_rescan"`.
3. **Post-Patch Validation:** Launch `RHEL 9.6 CVE Validate` → Confirms CVE is no longer in pending updates.
4. **Lab Reset (Optional):** Launch `RHEL 9.6 CVE Rollback` (or restore Nutanix snapshot).

---

### Global Reset (JT 20: `Reset Berca POC Demo`)
Use JT 20 anytime to restore all application scenarios back to a clean baseline:
```bash
sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{pool: .pool_saturated, disk: .disk_degraded, scale: .storefront_replicas, mode: .storefront_release_mode}'
# Expected clean baseline: { "pool": false, "disk": false, "scale": 1, "mode": "stable" }
```

---

## Reference Documents

| Document | Purpose |
|---|---|
| [`load-test/datadog/ANSIBLE-HANDOFF.md`](../load-test/datadog/ANSIBLE-HANDOFF.md) | Canonical cross-team contract |
| [`ansible/PLAYBOOK-GUIDE.md`](PLAYBOOK-GUIDE.md) | App incident playbook details & Datadog integration (JT 18, 19, 20, 21, 22) |
| [`ansible/cve_playbooks/IMPLEMENTATION-GUIDE.md`](cve_playbooks/IMPLEMENTATION-GUIDE.md) | Full AAP setup guide for CVE playbooks |
| [`ansible/cve_playbooks/DATADOG-HANDOVER-GUIDE.md`](cve_playbooks/DATADOG-HANDOVER-GUIDE.md) | Datadog engineer handover for CVE scenario (JT 24) |
| [`load-test/MEMORY-HOT-ADD-POC.md`](../load-test/MEMORY-HOT-ADD-POC.md) | Nutanix memory hot-add specification |
