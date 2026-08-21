# Datadog Engineer Handover Guide
## Scenario 6: Nutanix Infrastructure Scaling — Memory Hot-Add (16 GiB → 24 GiB)

This document is prepared specifically for the **Datadog Observability & Automation Engineer**. It contains all Job Template IDs, monitor definitions, Workflow Automation payloads, Slack approval configurations, and dashboard guidelines for **Scenario 6: Nutanix Memory Hot-Add**.

---

## 1. Architecture & Scenario Overview

```
 [1. Trigger Fault: JT 33]
           │
           ▼
┌─────────────────────────┐
│   Datadog-Lab-Ubuntu    │ ───► Datadog Agent detects MemUsable < 15% (Monitor Alert)
│      (192.168.2.44)     │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│    Datadog Workflow     │ ───► Generates Bits AI Summary & Slack Approval Card
└─────────────────────────┘
           │
           │ (Engineer approves in Slack)
           ▼
┌─────────────────────────┐
│    AAP Job Template 34  │ ───► Nutanix Prism Central v3 API (`10.10.10.88:9440`)
└─────────────────────────┘          │
                                     ▼
                      Hot-adds RAM from 16 GiB to 24 GiB
                      (NO downtime, workload remains active)
                                     │
                                     ▼
                      Datadog Agent reports MemTotal = 24 GiB
                      Usable memory recovers > 35% -> Alert Clears
```

### Infrastructure & Host Summary
| Parameter | Value |
|---|---|
| **Target Host Name** | `Datadog-Lab-Ubuntu` |
| **Target Host IP** | `192.168.2.44` |
| **Host OS** | Ubuntu 22.04 LTS (x86_64) |
| **Hypervisor** | Nutanix AHV (Prism Central `10.10.10.88:9440`) |
| **VM UUID** | `ad56d1d6-9642-4883-b69b-bea5897a0aff` |
| **Baseline RAM** | `16 GiB` (16,384 MiB) |
| **Hot-Add Target RAM** | `24 GiB` (24,576 MiB) |
| **Datadog Tags** | `env:poc`, `platform:nutanix`, `service:berca-backend`, `resource_id:berca_poc_vm` |

---

## 2. AAP Job Templates & API Integration

The Ansible team has configured and validated three Job Templates in **Ansible Automation Platform (AAP)** under the project `Ansible Datadog Playbooks`:

| Operation | Job Template Name | JT ID | Launch Permission | Expected Execution Time |
|---|---|---|---|---|
| **Fault Injection** | `Inject Application VM Memory Pressure` | **`33`** | `svc-datadog-fault-control` | ~10 seconds |
| **Remediation** | `Hot Add Application VM Memory to 24 GiB` | **`34`** | `svc-datadog-remediation` | ~25–35 seconds |
| **Reset Baseline** | `Restore Application VM Memory Baseline` | **`35`** | `svc-datadog-fault-control` | ~90–120 seconds (includes reboot) |

---

## 3. Datadog Monitor Configuration

Create a host memory metric alert monitor in Datadog:

### Monitor Definition
- **Monitor Type:** Metric Monitor
- **Metric Query:**
  ```text
  avg(last_1m):(avg:system.mem.usable{host:datadog-lab-ubuntu} / avg:system.mem.total{host:datadog-lab-ubuntu}) * 100 < 15
  ```
  *(Alternatively: `avg(last_1m):avg:system.mem.pct_usable{host:datadog-lab-ubuntu} < 15`)*

- **Alert Thresholds:**
  - **Alert:** `< 15` (%)
  - **Warning:** `< 25` (%)
  - **Recovery:** `> 30` (%)

- **Evaluation Window:** 1 minute (for fast demo responsiveness)

### Monitor Message & Workflow Linkage
```markdown
{{#is_alert}}
## ⚠️ CRITICAL: Low Usable Memory on {{host.name}} ({{host.ip}})
Memory usable fraction dropped below 15% due to active container workload.

- **Current Host RAM:** 16 GiB Baseline
- **Recommended Action:** Vertical Hot-Add Memory to 24 GiB via Nutanix Prism Central
- **Action Type:** Infrastructure Vertical Auto-Scale (Zero Downtime)

@workflow-nutanix-memory-hotadd
{{/is_alert}}

{{#is_recovery}}
## ✅ RECOVERED: Memory Capacity Restored on {{host.name}}
Host memory hot-added to 24 GiB. Usable capacity returned to healthy baseline.
{{/is_recovery}}
```

---

## 4. Datadog Workflow Automation Specification

### Workflow Trigger: Monitor Alert (`@workflow-nutanix-memory-hotadd`)

```
[Trigger: Memory Alert]
       │
       ▼
[Action 1: Bits AI Root Cause & Context Summary]
       │
       ▼
[Action 2: Slack Human-in-the-Loop Interactive Approval]
       │
       ├─► Rejected ──► Send Slack notification & close ticket
       │
       └─► Approved
              │
              ▼
       [Action 3: AAP HTTP Request (Launch JT 34)]
              │
              ▼
       [Action 4: Poll AAP Job Status until Successful]
              │
              ▼
       [Action 5: Post Slack Success Confirmation with Nutanix Task ID]
```

### Action 3: AAP API Launch Configuration (Action Details)

- **HTTP Method:** `POST`
- **URL:** `https://<AAP_HOST>/api/v2/job_templates/34/launch/`
- **Headers:**
  ```http
  Authorization: Bearer <SVC_DATADOG_REMEDIATION_TOKEN>
  Content-Type: application/json
  ```
- **Body Payload (JSON):**
  ```json
  {
    "extra_vars": {
      "monitor_id": "{{ Source.Monitor.id }}",
      "investigation_id": "{{ Context.investigation_id | default('inv-mem-hotadd-01') }}",
      "workflow_instance_id": "{{ Workflow.instance_id }}"
    }
  }
  ```

---

## 5. Structured Evidence Returned by AAP

When JT 34 completes successfully, AAP publishes structured execution artifacts back to the job record:

```json
{
  "poc_action": "hot_add_memory",
  "poc_classification": "MEMORY_PRESSURE",
  "poc_hot_add_changed": true,
  "poc_memory_before_gib": 16,
  "poc_memory_after_gib": 24,
  "poc_memory_profile": "target_24g",
  "poc_memory_pressure_active": true,
  "nutanix_task_uuid": "e816a69d-7db4-46c5-9273-049fa531b28d",
  "poc_storefront_healthy": true,
  "monitor_id": "12345678",
  "investigation_id": "inv-mem-hotadd-01",
  "workflow_instance_id": "wf-inst-987654"
}
```

### Key Validation Points to Display in Slack & Dashboards:
1. **`poc_memory_before_gib` (16) → `poc_memory_after_gib` (24):** Proves RAM was vertically expanded by 8 GiB.
2. **`poc_memory_pressure_active: true`:** Proves memory hot-add succeeded **under active live workload without interrupting the container**.
3. **`poc_storefront_healthy: true`:** Proves zero application downtime during hypervisor memory expansion.
4. **`nutanix_task_uuid`:** Audit trail linked directly to Nutanix Prism Central task log.

---

## 6. Live Presentation Demo Script

| Step | Speaker Action | Datadog & AAP Activity | Expected Audience Visual |
|---|---|---|---|
| **1. Baseline** | Explain normal 16 GiB VM operation | Dashboard shows `system.mem.total: 16 GB`, usable `~80%` | Clean green metrics on Datadog Dashboard |
| **2. Fault Trigger** | Datadog Scenario Controller launches **JT 33** (`Inject Application VM Memory Pressure`) | Synthetic memory pressure container locks memory | Usable memory drops `< 15%`. Monitor turns **RED (ALERT)** |
| **3. AI Diagnosis & Approval** | Point to Datadog Bits AI summary | Bits analyzes low memory & recommends Nutanix vertical scale | Interactive Slack card appears with **"Approve Memory Hot-Add to 24 GiB"** |
| **4. Remediation** | Click **"Approve"** in Slack | Datadog Workflow launches **JT 34** (`Hot Add Memory`) | AAP calls Nutanix Prism Central API. Task finishes in ~30s |
| **5. Live Resolution** | Show live recovery | Datadog Agent sees `system.mem.total: 24 GB`. Usable memory jumps back to `> 35%` | Monitor turns **GREEN (RESOLVED)**. Zero HTTP 5xx errors |
| **6. Reset** | Click Reset in Scenario Controller | Controller launches **JT 35** (`Restore Baseline`) | VM RAM reset to 16 GiB baseline ready for next demo run |

---

## 7. Troubleshooting & Reset Checklist

If you need to manually reset the environment between dry runs:
1. **Stop memory pressure container:**
   ```bash
   ssh ave@192.168.2.44 "docker compose --profile memory-demo rm -sf memory-pressure"
   ```
2. **Run Reset Template in AAP:**
   - Launch **JT 35** (`Restore Application VM Memory Baseline`).
   - *Note: JT 35 will power off the VM, scale RAM from 24 GiB to 16 GiB in Nutanix, power on, and verify complete health.*
3. **Confirm Baseline:**
   ```bash
   ssh ave@192.168.2.44 "free -h" # Shows 16 GiB Total
   ```
