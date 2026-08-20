# Datadog Engineer Handover Guide
## Automated CVE Remediation: Datadog CSM + Red Hat AAP + Nutanix AHV

This document is prepared specifically for the **Datadog Engineer / Security Admin**. It contains all handover credentials, playbook function specifications, and step-by-step instructions to configure Datadog Cloud Security Management (CSM), Workflow Automation, Slack Human-in-the-Loop approvals, and Dashboards for the RHEL 9.6 Vulnerability Remediation POC.

---

## 1. Handover Credentials & Architecture Summary

### Target VM Details
| Parameter | Value |
|---|---|
| **Host Name** | `rhel09-vuln-poc-01` |
| **IP Address** | `192.168.2.65` |
| **Operating System** | Red Hat Enterprise Linux 9.6 (x86_64) |
| **Hypervisor** | Nutanix AHV (Prism Central / Element) |
| **Datadog Tags** | `env:poc`, `platform:nutanix`, `os:rhel96`, `team:secops` |

### Selected Vulnerability & Security Errata
| Field | Value |
|---|---|
| **Advisory ID** | `RHSA-2026:55439` (Important: curl security update) |
| **CVE ID** | `CVE-2026-1965` (also resolves `CVE-2026-3783`, `CVE-2026-8286`, `CVE-2026-9547`) |
| **Affected Package** | `curl`, `libcurl` |
| **Baseline Version (Vulnerable)** | `curl-7.76.1-29.el9_6.x86_64` |
| **Fixed Target Version** | `curl-7.76.1-40.el9_8.5.x86_64` |
| **Reboot Required** | `false` (in-memory services restarted) |

### Ansible Automation Platform (AAP) API Connection
| Parameter | Value |
|---|---|
| **AAP Base URL** | `https://<AAP_HOST>` *(replace with your AAP instance URL)* |
| **Service Account** | `svc_datadog_cve` |
| **Service Account Role** | `Execute` permission on Job Template 24 |
| **Remediation Job Template ID** | **`24`** |
| **API Launch Endpoint** | `POST https://<AAP_HOST>/api/v2/job_templates/24/launch/` |
| **HTTP Authorization Header** | `Authorization: Bearer <PASTE_API_TOKEN_HERE>` |
| **Content-Type** | `application/json` |

---

## 2. Playbook Suite Functions & Expected Outcomes

The Ansible team has built and validated 5 modular playbooks in the project **`Ansible Datadog Playbooks`** running on inventory **`Ansible Datadog Collab POC VMs`**:

```text
ansible/cve_playbooks/
  ├── rhel96-cve-preflight.yml     # Pre-demo scan: advisories, Agent, subscription
  ├── rhel96-cve-remediation.yml   # Main patching playbook (Job Template ID: 24)
  ├── rhel96-cve-validate.yml      # Post-patch health check (read-only)
  ├── rhel96-cve-reset-check.yml   # Post-snapshot-restore check (read-only)
  └── rhel96-cve-rollback.yml      # In-guest rollback / package downgrade (for fast lab reset)
```

### Playbook Summary Table

| Playbook | Job Template Name | Launch Trigger | Makes Changes? | Primary Function & Expected Outcome |
|---|---|---|---|---|
| `rhel96-cve-preflight` | `RHEL 9.6 CVE Preflight` | AAP UI / CLI | **No** | **Pre-Demo Scan**: Verifies host identity, subscription, and confirms `RHSA-2026:55439` is listed in pending updates. |
| `rhel96-cve-remediation` | `RHEL 9.6 CVE Remediation` *(ID: 24)* | **Datadog API** | **Yes** | **12-Step Remediation Engine**: Triggered by Datadog after Slack approval. Upgrades `curl` to `7.76.1-40.el9_8.5`, validates Agent health, and returns structured JSON evidence. |
| `rhel96-cve-validate` | `RHEL 9.6 CVE Validate` | AAP UI / CLI | **No** | **Post-Patch Verification**: Confirms `RHSA-2026:55439` is no longer pending and systemd reports 0 failed units. |
| `rhel96-cve-reset-check` | `RHEL 9.6 CVE Reset Check` | AAP UI / CLI | **No** | **Post-Restore Verification**: Run after Nutanix snapshot restore to verify VM has reverted to vulnerable state. |
| `rhel96-cve-rollback` | `RHEL 9.6 CVE Rollback` | AAP UI / CLI | **Yes** | **In-Guest Lab Reset**: Downgrades `curl` back to vulnerable baseline without touching the hypervisor. |

---

## 3. Detailed Breakdown of the Remediation Playbook (Template 24)

When Datadog Workflow calls the AAP launch endpoint, `rhel96-cve-remediation.yml` executes this 12-step closed loop:

```text
[1. Gather facts & verify RHEL 9.6]
  └── [2. Assert host: rhel09-vuln-poc-01 & validate inputs]
        └── [3. Dynamic check: Verify package is currently installed]
              └── [4. Clean DNF cache & verify CVE in enabled RHEL repos]
                    └── [5. Dry-run, then dnf upgrade-minimal --cves=<CVE_ID> <package>]
                          └── [6. Assert package version changed]
                                └── [7. dnf needs-restarting --services & restart services]
                                      └── [8. Conditional reboot (if needed & allowed)]
                                            └── [9. Confirm Datadog Agent active & 0 failed units]
                                                  └── [10. Publish structured evidence via set_stats]
```

### Safety Gates Enforced by Ansible
1. **Host Boundary Assertion:** Will reject execution if targeted at any host other than `rhel09-vuln-poc-01`.
2. **Scanner Component to RPM Resolution:** Resolves scanner component names (e.g. `vim`, `curl`, `openssl`) to corresponding RHEL 9 binary RPM packages via `cve_component_rpm_map`.
3. **Dynamic Pre-Flight Checks:** Dynamically verifies that target packages are installed on the host and the requested CVE update exists in enabled RHEL DNF repositories before any change is attempted.
4. **Severity Allowlist:** Accepts severities `critical`, `high`, `medium`, `low`, and `info`.
5. **Input Sanitization:** Validates regex patterns on all inputs to strictly prevent shell injection or arbitrary arguments.
6. **Minimal Blast Radius:** Uses `dnf upgrade-minimal --cves=<CVE_ID> <target_rpms>` instead of `dnf update` (does NOT upgrade the entire OS or unrelated packages).
7. **Post-Patch CVE Verification:** Asserts that the CVE is no longer listed in pending updates (`dnf updateinfo list updates --cves=<CVE_ID>`).
8. **Structured Evidence Return:** Emits JSON stats back to AAP:
   ```json
   {
     "remediation_evidence": {
       "schema_version": "1.0",
       "environment": "poc",
       "resource_id": "rhel09-vuln-poc-01",
       "advisory_id": "<ADVISORY_ID>",
       "cve_id": "<CVE_ID>",
       "component_name": "<PACKAGE_NAME>",
       "target_rpms": ["vim-enhanced", "vim-common", "vim-minimal", "vim-filesystem"],
       "severity": "<SEVERITY>",
       "versions_before": ["..."],
       "versions_after": ["..."],
       "package_changed": true,
       "cve_resolved": true,
       "datadog_agent_active": true,
       "systemd_failures": "none",
       "status": "patch_applied_pending_security_rescan"
     }
   }
   ```

---

## 4. Step-by-Step Datadog Configuration Guide

### Step D1: Verify Datadog Org Entitlements
1. Log into your Datadog organization (`https://app.datadoghq.com` or your designated regional site).
2. Navigate to **Security > Cloud Security Management (CSM)**.
3. Confirm that **Vulnerabilities** (CSM Vulnerabilities) is enabled.
4. Note your Datadog site domain (e.g. `datadoghq.com`, `us5.datadoghq.com`, `datadoghq.eu`).

---

### Step D2: Verify Datadog Agent on VM
The Ansible team has installed and started Datadog Agent on `rhel09-vuln-poc-01` (`192.168.2.65`). If you need to verify:

```bash
# Verify Agent service is running
sudo systemctl status datadog-agent --no-pager

# Check Agent version (must be >= 7.46 for host SBOM scanning)
sudo datadog-agent version
```

---

### Step D3: Configure Agent for Host SBOM Vulnerability Scanning
Ensure `/etc/datadog-agent/datadog.yaml` on `rhel09-vuln-poc-01` contains:

```yaml
# /etc/datadog-agent/datadog.yaml
hostname: rhel09-vuln-poc-01

tags:
  - env:poc
  - platform:nutanix
  - os:rhel96
  - team:secops
  - tier:infrastructure

# Enable Host SBOM analysis for OS package vulnerabilities
sbom:
  enabled: true
  host:
    analyzers:
      - os
```

Restart the agent if any changes were made:
```bash
sudo systemctl restart datadog-agent
sudo datadog-agent status
```

---

### Step D4: Locate the Finding in Datadog UI
1. In Datadog, go to **Cloud Security > Vulnerabilities > Findings**.
2. Filter the findings view using facets:
   - **Resource Type:** `Host`
   - **Hostname:** `rhel09-vuln-poc-01`
   - **Environment:** `poc`
   - **Status:** `Open`
3. Click on the finding for **`CVE-2026-1965`** (or `curl`).
4. Verify finding details:
   - **Package:** `curl` / `libcurl`
   - **Installed Version:** `7.76.1-29.el9_6`
   - **Advisory:** `RHSA-2026:55439`
   - **Fix Available:** `true`

---

### Step D5: Create HTTP Connection to AAP in Datadog
1. In Datadog, navigate to **Workflow Automation > Connections**.
2. Click **New Connection**.
3. Fill in the connection parameters:

| Field | Value | Notes |
|---|---|---|
| **Connection Name** | `AAP - CVE Remediation` | Used in Workflow HTTP action |
| **Connection Type** | `HTTP` | |
| **Base URL** | `https://<AAP_HOST>` | Your AAP instance hostname / IP |
| **Authentication** | `Token Auth` | |
| **Token Name / Header** | `Authorization` | |
| **Token Value** | `Bearer <AAP_API_TOKEN>` | Token generated for `svc_datadog_cve` |

4. Click **Save**.

---

### Step D6: Build the Remediation Workflow in Datadog

Navigate to **Workflow Automation > New Workflow**. Name it: **`RHEL 9.6 CVE Remediation Pipeline`**.

Build the following 5-step pipeline:

```text
[Trigger: Vulnerability Finding or Manual]
                     │
                     ▼
        [Step 1: Policy Safety Gate]
                     │ (Passed)
                     ▼
        [Step 2: Slack Approval Action]
                     │ (Approved)
                     ▼
        [Step 3: Launch AAP Job Template 24]
                     │
                     ▼
        [Step 4: Poll AAP Job Status]
                     │ (Successful)
                     ▼
        [Step 5: Notify Result via Slack]
```

#### Step 1: Policy Safety Gate (Expression Condition)
Add a Condition step checking:
```text
Finding.environment == "poc" &&
Finding.hostname == "rhel09-vuln-poc-01" &&
Finding.resource_type == "host" &&
Finding.severity in ["critical", "high", "medium", "low", "info"] &&
Finding.fix_available == true
```
*If condition fails, workflow exits safely without making any changes.*

#### Step 2: Slack Human-in-the-Loop Approval
Add a Slack Action: **Send message and wait for approval**.
* **Channel:** `#secops-approvals` (or your demo channel)
* **Message Body:**
  ```text
  :shield: *CVE Remediation Approval Required*

  *Host:* rhel09-vuln-poc-01 (192.168.2.65)
  *CVE ID:* {{ Finding.cve_id }}
  *Severity:* {{ Finding.severity }}
  *Package:* {{ Finding.package_name }}
  *Installed Version:* {{ Finding.installed_version }}
  *Fixed Version:* {{ Finding.fixed_version }}
  *Advisory ID:* {{ Finding.advisory_id }}
  *Platform:* Nutanix AHV

  Click *Approve* to trigger automated remediation in Red Hat Ansible Automation Platform.
  ```
* **Buttons:** `Approve` / `Reject`
* **On Reject:** End workflow with notification.

#### Step 3: Launch AAP Job Template (HTTP Request Action)
Add an **HTTP Request** step:
* **Connection:** `AAP - CVE Remediation`
* **Method:** `POST`
* **URL Path:** `/api/v2/job_templates/24/launch/`
* **Headers:**
  ```text
  Content-Type: application/json
  ```
* **Request Body (JSON):**
  ```json
  {
    "extra_vars": {
      "advisory_id": "RHSA-2026:55439",
      "package_name": "{{ Finding.package_name }}",
      "cve_id": "{{ Finding.cve_id }}",
      "severity": "{{ Finding.severity }}",
      "finding_id": "{{ Finding.id }}",
      "approval_reference": "{{ WorkflowRun.id }}"
    }
  }
  ```

#### Step 4: Poll AAP Job Execution Status (HTTP Loop)
Add an HTTP Request step to track job completion:
* **Connection:** `AAP - CVE Remediation`
* **Method:** `GET`
* **URL Path:** `/api/v2/jobs/{{ Step3.body.job }}/`
* **Retry / Wait Condition:** Repeat every 5 seconds until `body.status` is `successful` or `failed`.

#### Step 5: Notify Slack of Completion
Add a Slack Message step:
```text
:white_check_mark: *CVE Remediation Completed Successfully!*

*Host:* rhel09-vuln-poc-01
*AAP Job ID:* {{ Step3.body.job }}
*Status:* {{ Step4.body.status }}
*Advisory Applied:* RHSA-2026:55439 (curl)

The package has been updated on the host. Datadog SBOM will re-evaluate on the next cycle to close the finding.
```

---

### Step D7: Configure Live Demo Dashboard

In Datadog, create a dashboard titled **`RHEL 9.6 Security Remediation Live Demo`** with these 7 widgets:

| Widget Title | Type | Data Source / Query |
|---|---|---|
| **Target Host Overview** | Host Map / Infobox | `host:rhel09-vuln-poc-01`, tags: `env:poc`, `platform:nutanix` |
| **Open Vulnerability Findings** | Table / List | CSM Vulnerabilities query: `status:open host:rhel09-vuln-poc-01` |
| **Vulnerability Lifecycle Timeline** | Timeseries | Finding state events over time |
| **Host CPU & Memory Health** | Timeseries | `system.cpu.user`, `system.mem.used` from Agent |
| **Datadog Agent Heartbeat** | Status Check | `datadog.agent.running` for host `rhel09-vuln-poc-01` |
| **Workflow Run History** | List | Datadog Workflow Automation execution history |
| **AAP Job Execution Status** | Event Stream | Events tagged `source:ansible` |

---

## 5. Testing & Verification Runbook

### Full End-to-End Test Procedure
1. Confirm `CVE-2026-1965` is listed as **Open** in Datadog CSM Vulnerabilities.
2. Trigger the Datadog Workflow (manually or via test event).
3. Check the Slack channel and click **Approve** on the interactive card.
4. Watch the AAP Web UI (**Jobs** tab): Job ID corresponding to Template 24 will execute all 12 steps.
5. In Slack, confirm the completion notification is received.
6. In Datadog, monitor the host finding. **Note:** Datadog SBOM rescan evaluates periodically (up to ~1 hour) before marking the finding as resolved/closed.

---

## 6. Demo Reset & Rollback Procedures

To run multiple demos or tests, reset the environment using either method:

### Option A: Nutanix Snapshot Restore (Recommended for Formal Demos)
1. In Datadog, temporarily **pause/disable** the Workflow trigger.
2. In Nutanix Prism Central/Element:
   - Navigate to **VMs > `rhel09-vuln-poc-01` > Snapshots**.
   - Restore snapshot: `rhel09-poc-pre-security-patch-YYYYMMDD`.
3. Wait 1–2 minutes for VM boot and Chrony time sync.
4. In AAP, launch **`RHEL 9.6 CVE Reset Check`** to verify all 5 baseline health checks pass.
5. Once Datadog SBOM detects the vulnerable package again, re-enable the Workflow trigger.

### Option B: In-Guest Rollback Playbook (Fast Local Reset)
1. In AAP Web UI, launch Job Template **`RHEL 9.6 CVE Rollback`** (accept default `package_name: curl`).
2. The playbook will execute `dnf downgrade -y curl libcurl` to reinstall the vulnerable baseline in <30 seconds.
3. In AAP, run **`RHEL 9.6 CVE Preflight`** to verify `RHSA-2026:55439` is visible in pending updates again.
4. Re-arm the Datadog Workflow.

---

## 7. Troubleshooting & FAQ

| Symptom | Cause | Solution |
|---|---|---|
| **HTTP 401 Unauthorized from AAP** | Invalid or expired API token | Re-generate API token for `svc_datadog_cve` in AAP (Step 15) and update Datadog Connection. |
| **HTTP 400 Bad Request on Launch** | Missing required `extra_vars` | Ensure request body contains all 6 fields: `advisory_id`, `package_name`, `cve_id`, `severity`, `finding_id`, `approval_reference`. |
| **AAP Job Fails on Pre-Patch Verification** | Package not installed or advisory not in repos | Ansible safety gate aborted execution. Verify the package is currently installed and the advisory is available in enabled RHEL repositories. |
| **Finding Not Visible in Datadog UI** | SBOM analyzer disabled or initial scan pending | Ensure `sbom.host.analyzers: ["os"]` in `datadog.yaml` and Agent >= 7.46. Wait up to 1 hour for first scan. |
| **Duplicate Host in Datadog** | Hostname mismatch | Ensure `/etc/datadog-agent/datadog.yaml` has `hostname: rhel09-vuln-poc-01`. |
| **Finding Does Not Close Immediately** | Asynchronous SBOM evaluation cycle | Datadog updates vulnerability state on the next host SBOM scan. Do not manually close the finding. |
