# Scenario 6: Nutanix Memory Hot-Add — Playbook & Setup Guide

## Summary

This guide covers the implementation, configuration, and verification for **Scenario 6: Nutanix Memory Hot-Add**. All Nutanix API operations target Prism Central v3 REST API directly from the AAP runner via `ansible.builtin.uri` with `delegate_to: localhost`.

## Directory Structure

```
ansible/hotaddmemory_playbooks/
├── PLAYBOOK-GUIDE.md                   # This document
├── DATADOG-HANDOVER-GUIDE.md           # Handover guide for Datadog engineer
├── ansible.cfg                         # roles_path = ./roles:../roles:../../ansible/roles
├── inject-memory.yml                   # Fault JT: start memory-pressure container (JT 33)
├── hot-add-memory.yml                  # Remediation JT: Nutanix API 16->24 GiB (JT 34)
├── restore-memory.yml                  # Reset JT: Nutanix API 24->16 GiB (JT 35)
└── roles/
    └── hotadd_memory/
        ├── defaults/main.yml           # Nutanix API polling defaults
        ├── meta/main.yml               # depends on berca_poc_demo
        └── tasks/
            ├── fault-memory.yml        # Start pressure container
            └── stop-memory.yml         # Stop pressure container

ansible/roles/berca_poc_demo/           # Shared infrastructure
├── defaults/main.yml                   # Memory container name, tolerances (shared)
└── tasks/
    ├── read-memory-state.yml           # Shared read-only state collector
    ├── read-scenario-conflicts.yml     # Checks memory conflict
    ├── status.yml                      # Publishes memory state
    └── preflight.yml                   # Verifies memory-demo profile
```

## Files & Job Templates

### Top-Level Playbooks

| File | Job Template Name | JT ID | Purpose |
|------|------------------|---|---------|
| [`inject-memory.yml`](file:///C:/Users/User/OneDrive/Dokumen/GitHub/berca-poc-store/ansible/hotaddmemory_playbooks/inject-memory.yml) | `Inject Application VM Memory Pressure` | **33** | Starts `memory-pressure` container with preflight checks |
| [`hot-add-memory.yml`](file:///C:/Users/User/OneDrive/Dokumen/GitHub/berca-poc-store/ansible/hotaddmemory_playbooks/hot-add-memory.yml) | `Hot Add Application VM Memory to 24 GiB` | **34** | Nutanix API hot-add 16->24 GiB while pressure active |
| [`restore-memory.yml`](file:///C:/Users/User/OneDrive/Dokumen/GitHub/berca-poc-store/ansible/hotaddmemory_playbooks/restore-memory.yml) | `Restore Application VM Memory Baseline` | **35** | Stop pressure + Nutanix API restore 24->16 GiB + health check |

---

## AAP Configuration Guide

### 1. Nutanix Infrastructure Details
- **Prism Central URL**: `https://10.10.10.88:9440`
- **VM Name**: `Datadog-Lab-Ubuntu`
- **VM IP Address**: `192.168.2.44`
- **VM UUID**: `ad56d1d6-9642-4883-b69b-bea5897a0aff`

> [!WARNING]
> **One-Time Hypervisor Prerequisite:** Memory Hot Plug must be enabled on `Datadog-Lab-Ubuntu` in Prism Central (**Update VM > Advanced Settings > Enable Memory Hot Plug**). This requires a one-time VM power cycle prior to demo execution.

---

### 2. Custom Credential Type & Credential in AAP

#### Custom Credential Type: `Nutanix Prism Central`
In AAP → **Administration > Credential Types > Add**:
- **Name:** `Nutanix Prism Central`
- **Input Configuration (YAML):**
  ```yaml
  fields:
    - id: nutanix_prism_endpoint
      type: string
      label: Prism Central URL
      help_text: "e.g. https://10.10.10.88:9440"
    - id: nutanix_vm_uuid
      type: string
      label: VM UUID
    - id: nutanix_username
      type: string
      label: Username
    - id: nutanix_password
      type: string
      label: Password
      secret: true
  required:
    - nutanix_prism_endpoint
    - nutanix_vm_uuid
    - nutanix_username
    - nutanix_password
  ```
- **Injector Configuration (YAML):**
  ```yaml
  extra_vars:
    nutanix_prism_endpoint: "{{ nutanix_prism_endpoint }}"
    nutanix_vm_uuid: "{{ nutanix_vm_uuid }}"
    nutanix_username: "{{ nutanix_username }}"
    nutanix_password: "{{ nutanix_password }}"
  ```

#### Credential: `Nutanix Prism - Datadog Lab`
In AAP → **Resources > Credentials > Add**:
- **Name:** `Nutanix Prism - Datadog Lab`
- **Credential Type:** `Nutanix Prism Central`
- **Prism Central URL:** `https://10.10.10.88:9440`
- **VM UUID:** `ad56d1d6-9642-4883-b69b-bea5897a0aff`
- **Username:** `aqila`
- **Password:** `<NUTANIX_PASSWORD>` *(encrypted at rest by AAP)*

---

### 3. Job Template Specifications

#### Fault JT: `Inject Application VM Memory Pressure` (JT 33)
- **Job Type:** `Run`
- **Inventory:** `Ansible Datadog Collab POC VMs`
- **Project:** `Ansible Datadog Playbooks`
- **Playbook:** `ansible/hotaddmemory_playbooks/inject-memory.yml`
- **Credentials:** Machine Credential (`Datadog Credential` - SSH)
- **Limit:** `berca_poc_vm`
- **Options:** `Privilege Escalation: Checked`, `Enable Concurrent Jobs: Unchecked`
- **Survey:** None
- **User Access:** User `svc-datadog-fault-control` → Role: `Execute`

#### Remediation JT: `Hot Add Application VM Memory to 24 GiB` (JT 34)
- **Job Type:** `Run`
- **Inventory:** `Ansible Datadog Collab POC VMs`
- **Project:** `Ansible Datadog Playbooks`
- **Playbook:** `ansible/hotaddmemory_playbooks/hot-add-memory.yml`
- **Credentials:**
  1. Machine Credential (`Datadog Credential` - SSH)
  2. Custom Credential (`Nutanix Prism - Datadog Lab`)
- **Limit:** `berca_poc_vm`
- **Options:** `Privilege Escalation: Checked`, `Enable Concurrent Jobs: Unchecked`
- **Survey Configuration (Enabled):**
  | # | Prompt / Question | Description | Answer Variable Name | Type | Required | Default Answer |
  |---|---|---|---|---|---|---|
  | 1 | Datadog Monitor ID | ID of the Datadog monitor triggering remediation | `monitor_id` | Text | Yes | `manual-test` |
  | 2 | Bits Investigation ID | ID of the Bits investigation session | `investigation_id` | Text | Yes | `manual-test` |
  | 3 | Workflow Instance ID | Execution ID of the Datadog remediation workflow | `workflow_instance_id` | Text | Yes | `manual-test` |
- **User Access:** User `svc-datadog-remediation` → Role: `Execute`

#### Reset JT: `Restore Application VM Memory Baseline` (JT 35)
- **Job Type:** `Run`
- **Inventory:** `Ansible Datadog Collab POC VMs`
- **Project:** `Ansible Datadog Playbooks`
- **Playbook:** `ansible/hotaddmemory_playbooks/restore-memory.yml`
- **Credentials:**
  1. Machine Credential (`Datadog Credential` - SSH)
  2. Custom Credential (`Nutanix Prism - Datadog Lab`)
- **Limit:** `berca_poc_vm`
- **Options:** `Privilege Escalation: Checked`, `Enable Concurrent Jobs: Unchecked`
- **Survey:** None
- **User Access:** User `svc-datadog-fault-control` → Role: `Execute`

---

## Testing & Verification Sequence

```
[1. Baseline Check] ──> [2. Trigger Fault: JT 33] ──> [3. Trigger Remediation: JT 34] ──> [4. Reset: JT 35]
      (16 GiB)                (Pressure Active)                (Hot-Add to 24 GiB)           (Back to 16 GiB)
```

### Step 1: Pre-Flight Baseline Check (16 GiB)
On VM `192.168.2.44`:
```bash
free -h
# Expected: Total shows ~15-16 GiB, MemAvailable >= 2.5 GiB

sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{profile: .memory_profile, pressure: .memory_pressure_active, total_bytes: .memory_total_bytes}'
# Expected: { "profile": "baseline_16g", "pressure": false, "total_bytes": 17179869184 }
```

### Step 2: Trigger Memory Fault (JT 33)
1. In AAP → Launch JT **33** (`Inject Application VM Memory Pressure`).
2. Verify on VM:
   ```bash
   docker ps --filter "name=memory_pressure"
   # Expected: Container "berca_poc_memory_pressure" is Up
   sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{profile: .memory_profile, pressure: .memory_pressure_active, usable_pct: .memory_usable_fraction}'
   # Expected: { "profile": "baseline_16g", "pressure": true, "usable_pct": <0.15 }
   ```
3. Idempotency Check: Re-run JT 33 → Succeeds with `poc_memory_fault_changed: false`.

### Step 3: Trigger Remediation (JT 34)
1. In AAP → Launch JT **34** (`Hot Add Application VM Memory to 24 GiB`) with default survey answers (`manual-test`).
2. Verify on VM:
   ```bash
   free -h
   # Expected: Total shows ~23-24 GiB
   docker ps --filter "name=memory_pressure"
   # Expected: Container is STILL running (hot-add succeeded under active workload)
   sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{profile: .memory_profile, pressure: .memory_pressure_active, usable_pct: .memory_usable_fraction}'
   # Expected: { "profile": "target_24g", "pressure": true, "usable_pct": >0.30 }
   curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/id/store
   # Expected: 200
   ```
3. Prism Central Check: VM `Datadog-Lab-Ubuntu` memory shows **24 GiB**.

### Step 4: Stop Pressure and Reset Baseline (JT 35)
1. Stop pressure container on VM:
   ```bash
   docker compose --profile memory-demo rm -sf memory-pressure
   ```
2. In AAP → Launch JT **35** (`Restore Application VM Memory Baseline`).
3. Verify on VM:
   ```bash
   free -h
   # Expected: Total shows ~15-16 GiB
   sudo /home/ave/berca-poc-store/demo-control.sh status | jq '{profile: .memory_profile, pressure: .memory_pressure_active}'
   # Expected: { "profile": "baseline_16g", "pressure": false }
   curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/id/store
   # Expected: 200
   ```
4. Prism Central Check: VM `Datadog-Lab-Ubuntu` memory shows **16 GiB**.
