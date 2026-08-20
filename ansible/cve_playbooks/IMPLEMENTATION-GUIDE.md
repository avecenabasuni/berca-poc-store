# RHEL 9.6 CVE Remediation -- Implementation Guide

Step-by-step implementation guide for the RHEL 9.6 Vulnerability Remediation POC
on Nutanix with Datadog and Red Hat Ansible Automation Platform (AAP).

> **Current status (19 August 2026):** the separate Datadog workflow export at
> `load-test/soar.json` has been tested for notification only. Finding query,
> prioritization, approval, AAP launch, job polling, package patching, host
> validation, Datadog rescan, and resolved-finding verification are not yet
> end-to-end tested. Do
> not present the vulnerability scenario as remediated until those gates pass.

The canonical cross-team status and payload contract is
[`load-test/datadog/ANSIBLE-HANDOFF.md`](../../load-test/datadog/ANSIBLE-HANDOFF.md).
Vulnerability remains a separate SecOps workflow and is not a branch of the
application incident-remediation workflow.

All AAP configuration is done through the **AAP web UI**. CLI commands are only
used for VM preparation and optional local testing.

This document covers two tracks:
- **Ansible/AAP track** -- for the engineer setting up the automation (Part A below)
- **Datadog track** -- for your coworker configuring the detection and workflow (Part B below, or share the dedicated standalone [Datadog Handover Guide](DATADOG-HANDOVER-GUIDE.md))

---

## Playbook overview

```text
ansible/cve_playbooks/
  inventory/
    hosts.yml                    # Reference inventory (AAP manages the actual inventory)
  group_vars/
    rhel96_vuln_poc.yml          # Allowlists, controls, and configuration
  rhel96-cve-preflight.yml       # Read-only scan: advisories, Agent, subscription
  rhel96-cve-remediation.yml     # Main patching playbook (AAP Job Template)
  rhel96-cve-validate.yml        # Post-patch health check (read-only)
  rhel96-cve-reset-check.yml     # Post-snapshot-restore verification (read-only)
  rhel96-cve-rollback.yml        # In-guest rollback / package downgrade (for fast lab reset)
```

| Playbook | Makes changes? | AAP Job Template name | Survey? |
|---|---|---|---|
| `rhel96-cve-preflight` | No | RHEL 9.6 CVE Preflight | No |
| `rhel96-cve-remediation` | **Yes** | RHEL 9.6 CVE Remediation | **Yes** (6 fields) |
| `rhel96-cve-validate` | No | RHEL 9.6 CVE Validate | Yes (2 fields, optional) |
| `rhel96-cve-reset-check` | No | RHEL 9.6 CVE Reset Check | No |
| `rhel96-cve-rollback` | **Yes** | RHEL 9.6 CVE Rollback | Yes (1 field, optional) |

---

## Playbook Functions & Expected Outcomes

Below is a detailed breakdown of what each playbook does, when to run it, what variables it takes, and the exact expected outcome upon execution.

### 1. `rhel96-cve-preflight.yml` -- Pre-Demo Discovery & Health Scan

* **AAP Template:** `RHEL 9.6 CVE Preflight`
* **Changes to VM:** **No (Read-only)**
* **When to run:** Before running a demo or test, to confirm the VM is healthy and that unpatched security advisories are present.
* **Input variables:** None required (no Survey).

#### Key Functions:
1. **Asserts OS and Host Identity:** Confirms OS is RHEL 9.x and hostname matches `rhel09-vuln-poc-01`.
2. **Checks Red Hat Subscription & Repositories:** Validates `subscription-manager identity`, subscription status, and enabled DNF repositories.
3. **Refreshes DNF Cache & Scans Advisories:** Cleans expired cache (`dnf clean expire-cache`), rebuilds metadata (`dnf makecache`), and queries available security errata (`dnf updateinfo list updates security`).
4. **Verifies Dependencies:** Checks if `dnf-utils` is installed (required for `needs-restarting`) and confirms `dnf-automatic` timer is inactive.
5. **Validates Datadog Agent:** Asserts `datadog-agent` service is active and outputs its installed version.

#### Expected Outcome:
* **Terminal / AAP Job Output:** All assertions pass with green `OK` messages.
* **Summary Block Output:**
  ```text
  TASK [Preflight summary] ******************************************************
  ok: [rhel09-vuln-poc-01] => {
      "msg": [
          "== Preflight Summary ==",
          "Host: rhel09-vuln-poc-01",
          "OS: RedHat 9.6",
          "Subscription: system identity: <UUID> org: <ORG_ID>",
          "Security advisories available: <COUNT> (e.g. 50+)",
          "Datadog Agent: Datadog Agent 7.xx.x",
          "dnf-utils installed: yes"
      ]
  }
  ```
* **Success Criteria:** `failed=0`, confirming the VM has available security advisories (e.g. `RHSA-2026:55439`) and is ready for the remediation workflow.

---

### 2. `rhel96-cve-remediation.yml` -- Automated Security Patching (12-Step Closed Loop)

* **AAP Template:** `RHEL 9.6 CVE Remediation`
* **Changes to VM:** **Yes (Applies security patch)**
* **When to run:** Triggered automatically by Datadog Workflow after human approval (or manually via AAP Survey for testing).
* **Input variables (Survey / extra_vars):**
  - `advisory_id`: `RHSA-2026:55439`
  - `package_name`: `curl`
  - `cve_id`: `CVE-2026-1965`
  - `severity`: `high` or `critical`
  - `finding_id`: Datadog Finding ID (e.g. `manual-aap-test`)
  - `approval_reference`: Workflow Run ID (e.g. `manual-dev-test`)

#### Key Functions (12-Step Architecture):
1. **Step 1 -- Environment Validation:** Asserts RHEL 9 distribution.
2. **Step 2 -- Host & Parameter Validation:** Confirms target host is `rhel09-vuln-poc-01` and all required extra_vars are present.
3. **Step 3 -- Baseline Recording:** Queries and records pre-patch installed version (`curl-7.76.1-29.el9_6.x86_64`).
4. **Step 4 -- Strict Allowlist Check:** Validates that `advisory_id` and `package_name` are explicitly allowed in `group_vars/rhel96_vuln_poc.yml`. Aborts immediately if not allowlisted.
5. **Step 5 -- Repository Metadata Verification:** Refreshes DNF cache and verifies `RHSA-2026:55439` is available from signed Red Hat repos.
6. **Step 6 -- Dry-run & Bounded Patching:** Executes `dnf upgrade-minimal --assumeno` dry-run, then applies only the approved advisory via `dnf upgrade-minimal --assumeyes --advisory=RHSA-2026:55439`.
7. **Step 7 -- Post-Patch Version Verification:** Queries new RPM version and asserts version changed to fixed version (`curl-7.76.1-40.el9_8.5.x86_64`).
8. **Step 8 -- Controlled Service Restarts:** Runs `dnf needs-restarting --services` and selectively restarts only services listed in `cve_allowed_restart_services`.
9. **Step 9 -- Conditional Reboot Management:** Checks `dnf needs-restarting --reboothint`. Reboots only if required AND `cve_allow_reboot: true` (for `curl`, no reboot is required).
10. **Step 10 -- SSH Recovery Wait:** Waits for SSH availability if reboot was performed.
11. **Step 11 -- Operational Health Check:** Verifies Datadog Agent is active, checks for failed systemd units, and tests live agent telemetry.
12. **Step 12 -- Evidence Publication:** Builds a structured JSON evidence payload and publishes it via Ansible `set_stats` for AAP/Datadog callbacks.

#### Expected Outcome:
* **Package Change:** `curl` and `libcurl` are upgraded to `7.76.1-40.el9_8.5.x86_64`.
* **Telemetry & Services:** Datadog Agent remains `active`; no systemd unit failures.
* **AAP `set_stats` / Artifact Output:**
  ```json
  {
    "remediation_evidence": {
      "schema_version": "1.0",
      "environment": "poc",
      "resource_id": "rhel09-vuln-poc-01",
      "os_version": "RedHat 9.6",
      "advisory_id": "RHSA-2026:55439",
      "cve_id": "CVE-2026-1965",
      "severity": "high",
      "package_name": "curl",
      "version_before": "curl-7.76.1-29.el9_6.x86_64",
      "version_after": "curl-7.76.1-40.el9_8.5.x86_64",
      "package_changed": true,
      "services_restarted": ["curl"],
      "services_skipped": [],
      "reboot_required": false,
      "reboot_performed": false,
      "datadog_agent_active": true,
      "systemd_failures": "none",
      "finding_id": "manual-aap-test",
      "approval_reference": "manual-dev-test",
      "status": "patch_applied_pending_security_rescan"
    }
  }
  ```
* **Success Criteria:** AAP Job completes with status **Successful** (`failed=0`).

---

### 3. `rhel96-cve-validate.yml` -- Post-Patch Health & Verification

* **AAP Template:** `RHEL 9.6 CVE Validate`
* **Changes to VM:** **No (Read-only)**
* **When to run:** After remediation, to verify that the security advisory is no longer pending and the VM is fully operational.
* **Input variables (Survey / extra_vars - optional):**
  - `advisory_id`: `RHSA-2026:55439` (optional)
  - `package_name`: `curl` (optional)

#### Key Functions:
1. **Verifies Package State:** Checks the current installed RPM version.
2. **Confirms Advisory Removal:** Queries `dnf updateinfo list updates security` and confirms `RHSA-2026:55439` is **no longer listed** in pending updates.
3. **Validates Datadog Agent:** Checks that Datadog Agent is active and reporting version.
4. **Checks Systemd Units:** Scans for any failed systemd services (`systemctl list-units --state=failed`).
5. **Checks Process Restarts & Reboot:** Evaluates `needs-restarting --services` and `--reboothint`.
6. **Checks Time Synchronization:** Verifies system uptime and `chronyd` status.

#### Expected Outcome:
* **Summary Block Output:**
  ```text
  TASK [Validation summary] *****************************************************
  ok: [rhel09-vuln-poc-01] => {
      "msg": [
          "== Post-Patch Validation Summary ==",
          "Host: rhel09-vuln-poc-01",
          "OS: RedHat 9.6",
          "Package: curl-7.76.1-40.el9_8.5.x86_64",
          "Advisory still pending: no",
          "Datadog Agent: active",
          "Failed systemd units: none",
          "Services needing restart: 0",
          "Reboot recommended: no"
      ]
  }
  ```
* **Success Criteria:** `Advisory still pending: no`, `Datadog Agent: active`, and `Failed systemd units: none`.

---

### 4. `rhel96-cve-reset-check.yml` -- Post-Snapshot-Restore Verification

* **AAP Template:** `RHEL 9.6 CVE Reset Check`
* **Changes to VM:** **No (Read-only)**
* **When to run:** Immediately after restoring the Nutanix VM snapshot (`rhel09-poc-pre-security-patch-YYYYMMDD`), before re-arming the demo.
* **Input variables:** None required (no Survey).

#### Key Functions:
1. **Asserts VM Identity:** Confirms distribution and hostname (`rhel09-vuln-poc-01`).
2. **Verifies Time Sync (Chrony):** Checks `chronyc tracking` to ensure hypervisor restore did not cause clock drift.
3. **Verifies Network Connectivity:** Checks IP address (`192.168.2.65`) and interface state.
4. **Verifies Repositories:** Confirms Red Hat subscription and enabled DNF repos are functional.
5. **Confirms Vulnerability Baseline:** Queries `dnf updateinfo list updates security` and asserts that security advisories are pending again (`length > 0`).
6. **Confirms Datadog Agent:** Asserts Datadog Agent is running.

#### Expected Outcome:
* **Summary Block Output:**
  ```text
  TASK [Post-restore summary] ***************************************************
  ok: [rhel09-vuln-poc-01] => {
      "msg": [
          "== Post-Snapshot-Restore Summary ==",
          "Host: rhel09-vuln-poc-01",
          "OS: RedHat 9.6",
          "Chrony: OK",
          "Subscription: system identity: <UUID>",
          "Repos enabled: 2",
          "Security advisories: <COUNT> (advisories present again)",
          "Datadog Agent: active",
          "",
          "If all checks pass, wait for Datadog to show the vulnerability",
          "finding before arming the remediation workflow."
      ]
  }
  ```
* **Success Criteria:** Confirms VM state has cleanly reverted to the pre-patch vulnerable baseline.

---

### 5. `rhel96-cve-rollback.yml` -- In-Guest Package Downgrade (Fast Lab Reset)

* **AAP Template:** `RHEL 9.6 CVE Rollback`
* **Changes to VM:** **Yes (Downgrades package)**
* **When to run:** For quick lab iterations when you want to return `curl` back to the vulnerable version without restoring a full Nutanix snapshot.
* **Input variables (Survey / extra_vars - optional):**
  - `package_name`: `curl` (default: `curl`)

#### Key Functions:
1. **Checks Current Patched Version:** Records current package version (`curl-7.76.1-40...`).
2. **Executes DNF Downgrade:** Runs `dnf downgrade -y curl libcurl` (with fallback to `dnf history undo last -y`).
3. **Confirms Baseline Version:** Verifies post-rollback version reverted to `curl-7.76.1-29...`.
4. **Cleans Cache & Validates Advisory:** Rebuilds DNF cache and verifies `RHSA-2026:55439` is listed in pending updates again.
5. **Verifies Datadog Agent:** Confirms Datadog Agent is active and ready for the next SBOM scan.

#### Expected Outcome:
* **Package Change:** `curl` and `libcurl` are downgraded back to the vulnerable baseline version.
* **Summary Block Output:**
  ```text
  TASK [Rollback Summary] *******************************************************
  ok: [rhel09-vuln-poc-01] => {
      "msg": [
          "== Rollback Execution Summary ==",
          "Host: rhel09-vuln-poc-01",
          "Package: curl",
          "Version before rollback: curl-7.76.1-40.el9_8.5.x86_64",
          "Version after rollback: curl-7.76.1-29.el9_6.x86_64",
          "Datadog Agent: active",
          "Advisories pending: 1 (or more)",
          "",
          "Datadog will detect the vulnerable package on the next SBOM scan cycle."
      ]
  }
  ```
* **Success Criteria:** Package is reverted to vulnerable baseline; `RHSA-2026:55439` is visible in pending updates; Datadog will re-detect the CVE on the next SBOM cycle.

---

## Part A: Ansible / AAP setup (your track)

### Step 1: Prepare the RHEL 9.6 VM

1. Deploy a RHEL 9.6 x86_64 VM on Nutanix AHV from approved media.
2. Set the hostname to match the VM name in Prism:
   ```bash
   # Set the static guest OS hostname to match Nutanix Prism VM name.
   # This ensures Datadog Agent telemetry and Prism hypervisor metrics map to the exact same host record.
   sudo hostnamectl set-hostname rhel09-vuln-poc-01
   ```
   *What this does:* `hostnamectl set-hostname` updates `/etc/hostname` and applies the hostname immediately without needing a reboot.

3. Configure networking, DNS, NTP (chrony), and SSH.
4. Register the VM with Red Hat or Satellite:
   ```bash
   # Register the system to Red Hat Subscription Management / Satellite using an activation key
   sudo subscription-manager register --activationkey=<KEY> --org=<ORG_ID>

   # Verify that the subscription is active and official Red Hat security errata repositories are available
   sudo subscription-manager status
   ```
   *What this does:*
   - `subscription-manager register`: Attaches the RHEL system to Red Hat CDN or Satellite using organization credentials (`--activationkey` and `--org`), providing access to signed RPM repositories and security errata metadata.
   - `subscription-manager status`: Confirms subscription status is valid and active.

5. Create the ansibleap user for AAP SSH access:
   ```bash
   # Create a dedicated system user 'ansibleap' with a home directory (-m)
   sudo useradd -m ansibleap

   # Add the user to the 'wheel' group to grant sudo privileges for administrative operations
   sudo usermod -aG wheel ansibleap

   # Configure passwordless sudo for ansibleap (required for automated AAP execution)
   echo "ansibleap ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/ansibleap
   sudo chmod 0440 /etc/sudoers.d/ansibleap

   # Create the .ssh directory for public key authentication
   sudo mkdir -p /home/ansibleap/.ssh

   # Paste your actual AAP SSH public key into authorized_keys (replace the string below with your public key)
   echo "<PASTE_YOUR_AAP_PUBLIC_KEY_HERE>" | sudo tee -a /home/ansibleap/.ssh/authorized_keys

   # Ensure the entire .ssh directory is owned by ansibleap:ansibleap
   sudo chown -R ansibleap:ansibleap /home/ansibleap/.ssh

   # Set directory permissions to 700 (drwx------: owner read/write/execute only)
   sudo chmod 700 /home/ansibleap/.ssh

   # Set authorized_keys file permissions to 600 (-rw-------: owner read/write only)
   sudo chmod 600 /home/ansibleap/.ssh/authorized_keys
   ```
   *What this does:*
   - `useradd -m ansibleap`: Creates the dedicated automation user account.
   - `usermod -aG wheel ansibleap` & `/etc/sudoers.d/ansibleap`: Grants passwordless sudo execution so AAP can perform package and service management without interactive password prompts.
   - `echo "<PUBLIC_KEY>" | sudo tee ...`: Appends your SSH public key (e.g. starting with `ssh-rsa AAAA...` or `ssh-ed25519 AAAA...`) into `authorized_keys`.
   - `chmod 700 / 600`: Enforces strict POSIX permissions required by OpenSSH server (SSH daemon rejects keys if directory or file permissions are too permissive).

6. Ensure `dnf-utils` is installed (needed for `needs-restarting`):
   ```bash
   # Install DNF utilities (provides 'needs-restarting' utility used to check running processes)
   sudo dnf install -y dnf-utils
   ```
   *What this does:* `dnf install -y dnf-utils` installs core package plugins including `needs-restarting`. The remediation playbook calls `dnf needs-restarting --services` and `dnf needs-restarting --reboothint` to determine if patched services need restarting or if a reboot is recommended.

7. Disable automatic updates for the POC:
   ```bash
   # Stop and disable the dnf-automatic systemd timer immediately
   sudo systemctl disable --now dnf-automatic.timer
   ```
   *What this does:* `systemctl disable --now` disables the timer from starting on boot and stops it immediately (`--now`). This ensures automatic background OS updates do not patch the target vulnerability before the demo is executed.

8. **Do NOT** run `dnf upgrade` yet -- you need the vulnerable baseline.

### Step 2: Discover available advisories

SSH into the VM and run:

```bash
# Query repository metadata for available Red Hat Security Advisories (RHSA) affecting this host
sudo dnf updateinfo list updates security
```
*What this does:* `dnf updateinfo list updates security` connects to enabled Red Hat repositories and filters for security errata (RHSAs) applicable to currently installed packages. Outputs advisory ID, severity, and package name (e.g., `RHSA-2026:55439 Important/Sec. curl-7.76.1-40.el9_8.5.x86_64`).

Pick an advisory that:
- Has severity Critical or Important
- Affects a package already installed on the VM
- Is userspace (not kernel/bootloader/SSH) for the first iteration
- Can be patched in isolation with `upgrade-minimal`

Record these values -- you will need them for the AAP Survey and Datadog:

```text
RHSA ID:              RHSA-2026:55439
CVE ID:               CVE-2026-1965 (also covers CVE-2026-3783, CVE-2026-8286, CVE-2026-9547)
Package name:         curl
Installed version:    <output of rpm -q curl, e.g. curl-7.76.1-29.el9_6.x86_64>
Fixed version:        curl-7.76.1-40.el9_8.5.x86_64
Red Hat severity:     Important
Reboot required:      no
```

### Step 3: Update the allowlists

`group_vars/rhel96_vuln_poc.yml` in this repository is already configured with this advisory and package:

```yaml
cve_allowed_advisories:
  - "RHSA-2026:55439"

cve_allowed_packages:
  - "curl"
  - "libcurl"

cve_allowed_restart_services:
  - "curl"

cve_allow_reboot: false
```

> [!IMPORTANT]
> The remediation playbook will **refuse to run** if the advisory or package
> is not in these allowlists. This is the safety gate. AAP group_vars are
> loaded automatically from the Git project during sync.

### Step 4: Create the Nutanix snapshot

**Before any patching**, create a recovery snapshot so you can reset the VM back to the vulnerable baseline at any time.

#### Option A: In Nutanix Prism Central (Web UI)
1. Open your browser and navigate to **Prism Central** (`https://<PRISM_CENTRAL_IP>:9440`).
2. Click the top-left navigation menu (☰) > **Infrastructure** (or **Compute & Storage**) > **VMs**.
3. Locate and click on the VM name **`rhel09-vuln-poc-01`** to open its details view.
4. Click the **Actions** dropdown button (top right) and select **Take Snapshot** (or switch to the **Recovery Points / Snapshots** tab and click **+ Take Snapshot**).
5. In the modal:
   - **Snapshot Name**: `rhel09-poc-pre-security-patch-YYYYMMDD` (e.g. `rhel09-poc-pre-security-patch-20260819`)
6. Click **Save** / **Submit**.
7. *Verification:* Check the Tasks bell icon in the top navigation bar to confirm the snapshot task completes with status *Succeeded*.

---

#### Option B: In Nutanix Prism Element (Cluster Web UI)
1. Open **Prism Element** (`https://<CLUSTER_IP>:9440`).
2. From the dropdown menu on the top-left (showing *Home* or current view), select **VM**.
3. Switch to the **Table** view tab.
4. Click to select the row for **`rhel09-vuln-poc-01`**.
5. In the action bar that appears below the table, click **Take Snapshot**.
6. Enter the Name: `rhel09-poc-pre-security-patch-YYYYMMDD`.
7. Click **Save**.

---

#### Option C: Via Nutanix Command Line (`acli`)
If you prefer SSH to the Nutanix Controller VM (CVM):
```bash
# Connect to any Nutanix CVM via SSH
ssh admin@<NUTANIX_CVM_IP>

# Create the VM snapshot
acli vm.snapshot_create rhel09-vuln-poc-01 snapshot_name=rhel09-poc-pre-security-patch-20260819

# Verify the snapshot exists
acli vm.snapshot_get rhel09-vuln-poc-01 snapshot_name=rhel09-poc-pre-security-patch-20260819
```

### Step 5: Configure AAP -- Organization

In the AAP web UI (`https://<AAP_HOST>/`):

1. Navigate to **Access > Organizations**.
2. Verify that the **`Default`** organization exists (it is created automatically by AAP).
3. We will associate all Credentials, Projects, and Inventories created below with the **`Default`** organization.

### Step 6: Configure AAP -- Credential (Machine)

This credential lets AAP SSH into the RHEL 9.6 VM.

1. Navigate to **Resources > Credentials**.
2. Click **Add**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Name | `RHEL 9.6 POC VM - Machine Credential` |
   | Organization | `Default` |
   | Credential Type | `Machine` |
   | Username | `ansibleap` |
   | SSH Private Key | Paste the private key for the `ansibleap` user |
   | Privilege Escalation Method | `sudo` |
   | Privilege Escalation Username | `root` |

4. Click **Save**.

### Step 7: Configure AAP -- Project

This syncs the Git repository so AAP can find the playbooks and group_vars.

1. Navigate to **Resources > Projects**.
2. Click **Add**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Name | `Ansible Datadog Playbooks` |
   | Organization | `Default` |
   | Source Control Type | `Git` |
   | Source Control URL | Your repository URL (e.g., `https://github.com/...`) |
   | Source Control Branch | `main` (or your working branch) |
   | Source Control Credential | Add a Source Control credential if the repo is private |
   | Options | Check **Update Revision on Launch** |

4. Click **Save**.
5. Click the **Sync** button (circular arrows icon) and wait for it to succeed.
6. Verify the project status shows a green checkmark.

> [!TIP]
> With **Update Revision on Launch** enabled, AAP will automatically pull the
> latest code (including allowlist changes in `group_vars/`) every time a Job
> Template is launched.

### Step 8: Configure AAP -- Inventory

1. Navigate to **Resources > Inventories**.
2. Click **Add > Add inventory**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Name | `Ansible Datadog Collab POC VMs` |
   | Organization | `Default` |

4. Click **Save**.

5. Go to the **Groups** tab, click **Add**:

   | Field | Value |
   |---|---|
   | Name | `rhel96_vuln_poc` |

   > [!IMPORTANT]
   > The group name **must** be `rhel96_vuln_poc` because the playbooks use
   > `hosts: rhel96_vuln_poc`. This also ensures that the `group_vars/rhel96_vuln_poc.yml`
   > file from the Git project is automatically loaded for this group.

6. Click **Save**, then go into the `rhel96_vuln_poc` group.

7. Go to the **Hosts** tab, click **Add > New host**:

   | Field | Value |
   |---|---|
   | Name | `rhel09-vuln-poc-01` |
   | Variables (YAML) | See below |

   ```yaml
   ansible_host: "192.168.2.65"
   ansible_python_interpreter: /usr/bin/python3
   ```

8. Click **Save**.

### Step 9: Configure AAP -- Job Template (Preflight)

1. Navigate to **Resources > Templates**.
2. Click **Add > Add job template**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Name | `RHEL 9.6 CVE Preflight` |
   | Job Type | `Run` |
   | Inventory | `Ansible Datadog Collab POC VMs` |
   | Project | `Ansible Datadog Playbooks` |
   | Playbook | `ansible/cve_playbooks/rhel96-cve-preflight.yml` |
   | Credentials | `RHEL 9.6 POC VM - Machine Credential` |
   | Verbosity | `1 (Verbose)` -- recommended for demo visibility |
   | Limit | `rhel09-vuln-poc-01` |

4. Click **Save**.
5. Click **Launch** to test. Review the output and verify all checks pass.

### Step 10: Configure AAP -- Job Template (Remediation) with Survey

This is the main Job Template that Datadog will trigger.

1. Navigate to **Resources > Templates**.
2. Click **Add > Add job template**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Name | `RHEL 9.6 CVE Remediation` |
   | Job Type | `Run` |
   | Inventory | `Ansible Datadog Collab POC VMs` |
   | Project | `Ansible Datadog Playbooks` |
   | Playbook | `ansible/cve_playbooks/rhel96-cve-remediation.yml` |
   | Credentials | `RHEL 9.6 POC VM - Machine Credential` |
   | Verbosity | `1 (Verbose)` |
   | Limit | `rhel09-vuln-poc-01` |
   | Options | Leave **Enable Webhook** unchecked *(Datadog uses the standard REST API)* |

4. Click **Save**.

5. Go to the **Survey** tab, click **Add** to create each survey question:

   | # | Question | Answer Variable | Answer Type | Required | Default |
   |---|---|---|---|---|---|
   | 1 | Red Hat Security Advisory ID | `advisory_id` | Text | Yes | `RHSA-2026:55439` |
   | 2 | Package name to patch | `package_name` | Text | Yes | `curl` |
   | 3 | CVE ID | `cve_id` | Text | Yes | `CVE-2026-1965` |
   | 4 | Severity (critical/high) | `severity` | Multiple Choice (single) | Yes | `high` |
   | 5 | Datadog Finding ID | `finding_id` | Text | Yes | `manual-test` |
   | 6 | Approval Reference | `approval_reference` | Text | Yes | `manual-approval` |

   For the **Severity** field (question 4), set the multiple choice options to:
   ```text
   critical
   high
   ```

6. Toggle the Survey to **Enabled**.
7. Click **Save**.

> [!IMPORTANT]
> **Why is "Enable Webhook" NOT needed?**
> In AAP, the "Enable Webhook" checkbox is strictly for GitHub/GitLab Git push events.
> Datadog connects directly via the **AAP REST API endpoint** (`POST /api/v2/job_templates/<ID>/launch/`)
> using the API Token configured in Step 15. The Survey fields are automatically populated
> by Datadog's payload in `extra_vars`.

8. The **Job Template ID** is **`24`** (from URL `https://<AAP>/#/templates/job_template/24/details`).
   Share this ID (`24`) with your Datadog coworker for Step D7.

### Step 11: Configure AAP -- Job Template (Validate)

1. Navigate to **Resources > Templates > Add > Add job template**.
2. Fill in:

   | Field | Value |
   |---|---|
   | Name | `RHEL 9.6 CVE Validate` |
   | Job Type | `Run` |
   | Inventory | `Ansible Datadog Collab POC VMs` |
   | Project | `Ansible Datadog Playbooks` |
   | Playbook | `ansible/cve_playbooks/rhel96-cve-validate.yml` |
   | Credentials | `RHEL 9.6 POC VM - Machine Credential` |
   | Verbosity | `1 (Verbose)` |
   | Limit | `rhel09-vuln-poc-01` |

3. Go to the **Survey** tab, add these optional fields:

   | # | Question | Answer Variable | Answer Type | Required | Default |
   |---|---|---|---|---|---|
   | 1 | Advisory ID to verify | `advisory_id` | Text | No | _(empty)_ |
   | 2 | Package name to verify | `package_name` | Text | No | _(empty)_ |

4. Toggle Survey to **Enabled**, click **Save**.

### Step 12: Configure AAP -- Job Template (Reset Check)

1. Navigate to **Resources > Templates > Add > Add job template**.
2. Fill in:

   | Field | Value |
   |---|---|
   | Name | `RHEL 9.6 CVE Reset Check` |
   | Job Type | `Run` |
   | Inventory | `Ansible Datadog Collab POC VMs` |
   | Project | `Ansible Datadog Playbooks` |
   | Playbook | `ansible/cve_playbooks/rhel96-cve-reset-check.yml` |
   | Credentials | `RHEL 9.6 POC VM - Machine Credential` |
   | Verbosity | `1 (Verbose)` |
   | Limit | `rhel09-vuln-poc-01` |

### Step 13: Configure AAP -- Job Template (Rollback) [Optional Lab Reset]

This Job Template executes the in-guest DNF downgrade to return the VM to the vulnerable baseline without restoring a VM snapshot.

1. Navigate to **Resources > Templates > Add > Add job template**.
2. Fill in:

   | Field | Value |
   |---|---|
   | Name | `RHEL 9.6 CVE Rollback` |
   | Job Type | `Run` |
   | Inventory | `Ansible Datadog Collab POC VMs` |
   | Project | `Ansible Datadog Playbooks` |
   | Playbook | `ansible/cve_playbooks/rhel96-cve-rollback.yml` |
   | Credentials | `RHEL 9.6 POC VM - Machine Credential` |
   | Verbosity | `1 (Verbose)` |
   | Limit | `rhel09-vuln-poc-01` |

3. Go to the **Survey** tab, click **Add**:

   | # | Question | Answer Variable | Answer Type | Required | Default |
   |---|---|---|---|---|---|
   | 1 | Package name to rollback | `package_name` | Text | Yes | `curl` |

4. Toggle Survey to **Enabled**, click **Save**.

### Step 14: Configure AAP -- Workflow Job Template (optional)

To chain preflight, remediation, and validation into one visual pipeline:

1. Navigate to **Resources > Templates > Add > Add workflow job template**.
2. Fill in:
   - **Name**: `RHEL 9.6 CVE Full Pipeline`
   - **Organization**: `Default`
   - **Inventory**: `Ansible Datadog Collab POC VMs`
3. Click **Save**, then switch to the **Visualizer** tab.
4. Click **Start** (or the **Add Node** button) to configure the first node:
   - **Node Type**: `Job Template`
   - **Job Template**: Select `RHEL 9.6 CVE Preflight`
   - **Convergence**: `All` (default)
   - **Node Alias**: *(leave empty or enter `Preflight Scan`)*
   - Click **Save**.

5. Hover over the `Preflight` node and click the **+** (Add node) icon on the right edge:
   - **Status / Run Type**: `On Success` (green line)
   - **Node Type**: `Job Template`
   - **Job Template**: Select `RHEL 9.6 CVE Remediation`
   - **Convergence**: `All`
   - **Node Alias**: `Remediate CVE`
   - When the modal asks for the **Survey / Prompt** values, fill in these defaults:
     - **Red Hat Security Advisory ID**: `RHSA-2026:55439`
     - **Package name to patch**: `curl`
     - **CVE ID**: `CVE-2026-1965`
     - **Severity**: `high`
     - **Datadog Finding ID**: `manual-test`
     - **Approval Reference**: `manual-approval`
   - Click **Save**.

6. Hover over the `Remediation` node and click the **+** (Add node) icon:
   - **Status / Run Type**: `On Success` (green line)
   - **Node Type**: `Job Template`
   - **Job Template**: Select `RHEL 9.6 CVE Validate`
   - **Convergence**: `All`
   - **Node Alias**: *(leave empty or enter `Post-Patch Validate`)*
   - Click **Save**.

7. Click the **Save** button at the top-right of the Visualizer to save the workflow.

```text
[Preflight Scan] --(On Success)--> [Remediate CVE] --(On Success)--> [Post-Patch Validate]
```

> [!TIP]
> When you launch this Workflow Template, AAP automatically detects that the Remediation node has an active Survey and will prompt you to enter the `advisory_id`, `package_name`, and `cve_id` at launch!

### Step 15: Configure AAP -- Service Account & API Token for Datadog

To follow security best practices, create a dedicated service account user for Datadog instead of using your personal administrator account.

#### A. Create the Service Account User
1. In AAP Web UI, navigate to **Access > Users**.
2. Click **Add > Add user**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Username | `svc_datadog_cve` |
   | Password | *(enter a secure password)* |
   | Confirm Password | *(re-enter password)* |
   | First Name | `Datadog` |
   | Last Name | `Service Account` |
   | Email | `datadog-sa@example.com` *(or your team email)* |
   | Organization | `Default` |
   | User Type | `Normal User` |

4. Click **Save**.

#### B. Grant Permissions to the Service Account
1. While on the `svc_datadog_cve` user page, switch to the **Roles** tab (or **User Access** tab).
2. Click **Add roles** (or **Add permissions**).
3. Select resource type: **Job Templates**.
4. Check the box for:
   - **`RHEL 9.6 CVE Remediation`** (ID `24`)
   - *(Optional)* **`RHEL 9.6 CVE Full Pipeline`**
5. Under Role, select **Execute** (or **Admin**).
6. Click **Save**.

#### C. Generate the API Token
1. Still under **Access > Users > `svc_datadog_cve`**, go to the **Tokens** tab.
2. Click **Add**.
3. Fill in:
   - **Application**: *(leave empty for Personal Access Token)*
   - **Description**: `Datadog Workflow Integration Token`
   - **Scope**: `Write`
4. Click **Save**.
5. **Copy the token string immediately** -- AAP will only display this token once.
6. Store and share the token securely with your Datadog coworker (never commit to Git).

#### D. Information Handover for Datadog Coworker
Provide these details to your Datadog teammate for configuring Step D6 & D7:

```text
AAP Host URL:      https://<AAP_HOST>
Job Template ID:   24
Service Account:   svc_datadog_cve
API Token:         <PASTE_COPIED_TOKEN_HERE>
```

### Step 16: Test the full AAP flow

1. In AAP web UI, go to **Resources > Templates**.
2. Click the **Launch** (rocket) icon on `RHEL 9.6 CVE Preflight`.
3. Verify all checks pass in the job output.
4. Click **Launch** on `RHEL 9.6 CVE Remediation`.
5. Fill in the Survey with the selected advisory values:
   - Advisory ID: `RHSA-2026:55439`
   - Package name: `curl`
   - CVE ID: `CVE-2026-1965`
   - Severity: `high` (or `critical` depending on Datadog finding score; both are accepted in the survey)
   - Finding ID: `manual-aap-test`
   - Approval Reference: `manual-aap-test`
6. Watch the job output -- all 12 steps should execute.
7. Launch `RHEL 9.6 CVE Validate` to confirm post-patch health.

### Step 17: Step-by-Step Rollback & Lab Reset

To reset the environment back to the vulnerable baseline state for another live demo or test run, choose one of the two methods below:

#### Method A: Nutanix Snapshot Restore (Recommended for Formal Demos)
*Best for: Exact bit-level restoration of disk and memory state, clean SBOM baseline.*

1. **Disarm Datadog Automation:**
   - Have your Datadog coworker temporarily disable the Workflow trigger or set the finding status to a test state so automated remediation doesn't fire unexpectedly during VM boot.

2. **Restore Snapshot in Nutanix Prism:**
   - Open **Nutanix Prism Central** (or Prism Element).
   - Navigate to **Compute & Storage > VMs > `rhel09-vuln-poc-01`**.
   - Go to the **Snapshots / Recovery Points** tab.
   - Select your pre-patch snapshot: `rhel09-poc-pre-security-patch-YYYYMMDD`.
   - Click **Restore** (or Power Off VM -> Revert to Snapshot -> Power On).

3. **Wait for VM Initialization:**
   - Allow ~1–2 minutes for the guest OS to boot, network connectivity to restore, and Chrony (NTP) time sync to stabilize.

4. **Run Verification Playbook in AAP:**
   - In AAP Web UI, go to **Resources > Templates**.
   - Click **Launch** on **`RHEL 9.6 CVE Reset Check`** (or run via CLI: `ansible-playbook -i inventory/hosts.yml rhel96-cve-reset-check.yml`).
   - Confirm all green checks:
     - [x] Host identity is `rhel09-vuln-poc-01`
     - [x] Chrony time is synchronized
     - [x] Subscription and Red Hat repos are active
     - [x] `RHSA-2026:55439` is listed in pending updates
     - [x] Datadog Agent service is active

5. **Wait for Datadog SBOM Rescan:**
   - The Datadog Agent will scan the host package database on its next SBOM cycle (up to ~1 hour).
   - In Datadog UI (**Cloud Security > Vulnerabilities > Findings**), verify that `CVE-2026-1965` / `RHSA-2026:55439` is marked as **Open** again.

6. **Re-arm Workflow:**
   - Enable the Datadog Workflow trigger. The environment is 100% ready for the next live demo run.

---

#### Method B: In-Guest Rollback Playbook (Fast for Local Lab Testing)
*Best for: Rapid iterations (<1 minute) without touching the Nutanix hypervisor.*

1. **Disarm Datadog Automation:**
   - Pause the Datadog Workflow trigger.

2. **Launch Rollback Playbook in AAP:**
   - In AAP Web UI, go to **Resources > Templates**.
   - Click the **Launch** (rocket icon) on **`RHEL 9.6 CVE Rollback`**.
   - In the Survey prompt:
     - `Package name to rollback`: `curl` (default)
   - Click **Next** and **Launch**.

   *(Alternatively via CLI)*:
   ```bash
   # Run the in-guest rollback playbook from your workstation
   ansible-playbook -i inventory/hosts.yml rhel96-cve-rollback.yml -e package_name=curl
   ```

3. **Review Playbook Execution:**
   - The playbook automatically:
     - Queries the current installed version (`curl-7.76.1-40.el9_8.5.x86_64`).
     - Executes `dnf downgrade -y curl libcurl` to reinstall the vulnerable baseline (`curl-7.76.1-29...`).
     - Flushes the DNF metadata cache.
     - Confirms `RHSA-2026:55439` is present in `dnf updateinfo list updates security`.
     - Validates that the Datadog Agent is running.

4. **Run Preflight Check:**
   - In AAP, launch **`RHEL 9.6 CVE Preflight`** to verify overall system health.

5. **Wait for Datadog Finding & Re-arm:**
   - Wait for Datadog SBOM re-evaluation. Once the finding is **Open**, re-enable the Workflow trigger.

---

## Part B: Datadog setup (your coworker's track)

Share this section with the team member responsible for Datadog configuration.

### Step D1: Verify Datadog org entitlements

1. Log into Datadog and confirm **Cloud Security Management** (CSM) is enabled.
2. Confirm **Cloud Security Vulnerabilities** is licensed for the org.
3. Note the Datadog `site` value (e.g., `datadoghq.com`, `datadoghq.eu`).

### Step D2: Install Datadog Agent on the VM

1. Go to **Integrations > Agent** (or Fleet Automation) in Datadog UI.
2. Copy the one-liner install command -- it includes the API key and site.
3. SSH to the VM and run the install command.
4. Verify:
   ```bash
   # Enable Datadog Agent service to start on boot and start it immediately
   sudo systemctl enable --now datadog-agent

   # Display the installed Datadog Agent version (must be >= 7.46 for host SBOM scanning)
   sudo datadog-agent version

   # Verify the Agent service is in the active (running) state
   sudo systemctl status datadog-agent --no-pager
   ```
   *What this does:*
   - `systemctl enable --now datadog-agent`: Starts the agent process and configures systemd to start it on boot.
   - `datadog-agent version`: Verifies the agent version (7.46+ is required for Agent-based host SBOM vulnerability scanning).
   - `systemctl status datadog-agent --no-pager`: Validates that the systemd service is active and running cleanly.

5. The Agent must be version 7.46 or newer for host vulnerability scanning.

### Step D3: Configure Agent for SBOM scanning

Edit `/etc/datadog-agent/datadog.yaml` on the VM:

```yaml
hostname: rhel09-vuln-poc-01

tags:
  - env:poc
  - service:rhel-os-patching-lab
  - platform:nutanix
  - hypervisor:ahv
  - os_family:rhel
  - os_major:9
  - use_case:vulnerability-remediation

sbom:
  enabled: true
  host:
    enabled: true
    analyzers: ["os"]
```

Restart the Agent:
```bash
# Validate YAML syntax and configuration directives before restarting
sudo datadog-agent configcheck

# Restart the Datadog Agent daemon to apply the new SBOM and tag settings
sudo systemctl restart datadog-agent

# View full Datadog Agent diagnostic status, including active collectors and SBOM analyzer
sudo datadog-agent status
```
*What this does:*
- `datadog-agent configcheck`: Parses `/etc/datadog-agent/datadog.yaml` to detect syntax errors or invalid fields before attempting a restart.
- `systemctl restart datadog-agent`: Restarts the daemon so it initializes the host OS SBOM analyzer (`analyzers: ["os"]`).
- `datadog-agent status`: Displays the full runtime report, confirming active connection to Datadog endpoints, valid API keys, and active SBOM collection.

### Step D4: Wait for initial SBOM evaluation

- It can take **up to ~1 hour** for the first vulnerability findings to appear.
- Do NOT install the Agent right before a live demo. Set it up at least a day
  before.

### Step D5: Verify findings in Datadog UI

1. Go to **Infrastructure > Host List**.
   - Confirm only ONE host named `rhel09-vuln-poc-01` with tags `env:poc` and
     `platform:nutanix`.
   - If there are duplicates, the hostname on the VM does not match the Agent
     config.

2. Go to **Cloud Security > Vulnerabilities > Findings**.
   - Use facets:
     - Resource Type: `Host`
     - Hostname: `rhel09-vuln-poc-01`
     - Environment: `poc`
     - Status: `Open`
   - Confirm the finding shows:
     - CVE ID
     - Severity (Critical/High)
     - Affected package and installed version
     - Fixed version or fix availability
     - Remediation guidance

3. Cross-reference the CVE/RHSA with the Ansible team's chosen advisory.

### Step D6: Create an AAP Connection in Datadog

Before building the Workflow, set up a Connection credential for AAP.

1. In Datadog, go to **Workflow Automation > Connections**.
2. Click **New Connection**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Name | `AAP - CVE Remediation` |
   | Connection Type | `HTTP` |
   | Base URL | `https://<AAP_HOST>` |
   | Authentication | `Token Auth` |
   | Token Name | `Authorization` |
   | Token Value | `Bearer <AAP_API_TOKEN>` |

   Replace `<AAP_HOST>` and `<AAP_API_TOKEN>` with the values from the Ansible
   engineer (Part A, Step 14).

4. Click **Save**.

### Step D7: Create the Datadog Workflow

1. Go to **Workflow Automation** in Datadog.

2. Create a new Workflow. Name it `RHEL 9.6 CVE Remediation Pipeline`.

3. **Set the trigger**:
   - For development: use **Manual** trigger.
   - For the demo: use **Security Signal** or **Vulnerability** trigger
     (depending on what your Datadog org supports).

4. **Step 1 -- Policy Gate** (add a conditional/branch step):

   Add a condition that checks ALL of these:

   ```text
   environment == poc
   hostname == rhel09-vuln-poc-01
   resource_type == host
   severity in [critical, high]
   fix_available == true
   ```

   If any condition fails, the workflow stops without taking action.

5. **Step 2 -- Slack Approval** (add a Slack action):
   - Action: **Send message and wait for approval**
   - Channel: your designated approval channel
   - Message template:
     ```text
     :shield: CVE Remediation Approval Required

     Host: rhel09-vuln-poc-01
     CVE: {{ Finding.cve_id }}
     Severity: {{ Finding.severity }}
     Package: {{ Finding.package_name }}
     Installed: {{ Finding.installed_version }}
     Fixed: {{ Finding.fixed_version }}
     Advisory: RHSA-2026:55439

     Approve to apply the security patch via AAP.
     ```
   - Wait for explicit **Approve** / **Reject**
   - On **Reject**: workflow stops, no changes

6. **Step 3 -- Launch AAP Job Template** (add an HTTP Request action):

   | Field | Value |
   |---|---|
   | Connection | `AAP - CVE Remediation` |
   | Method | `POST` |
   | URL Path | `/api/v2/job_templates/24/launch/` |
   | Headers | `Content-Type: application/json` |
   | Body | See below |

   Request body:
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

   Replace `<TEMPLATE_ID>` with the Job Template ID from Part A, Step 10.

   > [!NOTE]
   > The `advisory_id` is intentionally hardcoded to the allowlisted RHSA
   > rather than dynamically derived. This ensures the playbook's allowlist
   > check will pass and prevents arbitrary advisories from being injected.
   > For a multi-advisory demo, you can create a mapping lookup step in the
   > workflow or maintain one Workflow per advisory.

7. **Step 4 -- Poll AAP Job Status** (optional, add another HTTP Request):

   | Field | Value |
   |---|---|
   | Connection | `AAP - CVE Remediation` |
   | Method | `GET` |
   | URL Path | `/api/v2/jobs/{{ Step3.body.job }}/` |

   Add a retry/wait loop until `status == "successful"` or `status == "failed"`.

8. **Step 5 -- Notify Result** (add a Slack action):
   - Post the AAP job result to the same channel:
     ```text
     :white_check_mark: CVE Remediation Complete

     Job: {{ Step3.body.job }}
     Status: {{ Step4.body.status }}
     Advisory: <RHSA-ID>

     Waiting for Datadog SBOM re-evaluation to confirm finding closure.
     ```

### Step D8: Configure Slack integration

1. In Datadog, go to **Integrations > Slack**.
2. Connect your Slack workspace if not already done.
3. Ensure the approval channel is configured.
4. Test the connection by running the workflow manually.

### Step D9: Optional -- Nutanix integration

If you want hypervisor metrics alongside vulnerability data:

1. Confirm Prism Central has API v4.0 or later.
2. Create a service account with `Prism Viewer` role.
3. In Datadog, go to **Integrations > Nutanix**.
4. Configure with the Prism Central URL and credentials.
5. This adds VM CPU/memory/storage metrics to dashboards.

### Step D10: Create a dashboard (recommended)

Create a Datadog dashboard for the live demo that shows:

| Panel | Data source |
|---|---|
| Host info | Infrastructure host widget for `rhel09-vuln-poc-01` |
| Open vulnerabilities | CSM Vulnerabilities query, filtered to `env:poc` |
| Vulnerability timeline | Finding status over time |
| Host metrics | CPU, memory, disk I/O from Agent |
| Nutanix VM metrics | (optional) from Nutanix integration |
| Workflow run history | Workflow Automation events |
| Agent health | `datadog.agent.running` metric |

### Step D11: Test the full end-to-end flow

1. Confirm the vulnerability finding is Open in Datadog.
2. Trigger the Workflow (manually or via policy trigger).
3. Verify the Slack approval message appears with correct CVE details.
4. Click **Approve** in Slack.
5. Verify the AAP Job Template launches (check the AAP web UI **Jobs** page).
6. Watch the job output in AAP for all 12 remediation steps.
7. In AAP, launch `RHEL 9.6 CVE Validate` to confirm health.
8. Wait for Datadog SBOM re-evaluation (up to ~1 hour).
9. Confirm the finding status changes to resolved/closed in Datadog.

---

## AAP Job Templates summary

After completing Part A, you should have these five Job Templates in AAP:

| Job Template | Playbook | Survey | Launch Method | Purpose |
|---|---|---|---|---|
| `RHEL 9.6 CVE Preflight` | `rhel96-cve-preflight.yml` | No | AAP UI / CLI | Pre-demo advisory scan |
| `RHEL 9.6 CVE Remediation` | `rhel96-cve-remediation.yml` | Yes (6 fields) | Datadog REST API | Main patching (Datadog triggers this) |
| `RHEL 9.6 CVE Validate` | `rhel96-cve-validate.yml` | Yes (2 optional) | AAP UI / CLI | Post-patch health check |
| `RHEL 9.6 CVE Reset Check` | `rhel96-cve-reset-check.yml` | No | AAP UI / CLI | Post-snapshot-restore check |
| `RHEL 9.6 CVE Rollback` | `rhel96-cve-rollback.yml` | Yes (1 optional) | AAP UI / CLI | In-guest package downgrade for lab reset |

All five templates share the same:
- Inventory: `Ansible Datadog Collab POC VMs`
- Credential: `RHEL 9.6 POC VM - Machine Credential`
- Project: `Ansible Datadog Playbooks`
- Limit: `rhel09-vuln-poc-01`

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| AAP project sync fails | Check Git URL, branch, and Source Control Credential |
| Playbook not found in template dropdown | Ensure project synced successfully; playbook path is relative to repo root |
| Survey not prompting on API launch | Survey must be **Enabled** in the Survey tab |
| Playbook fails on allowlist assertion | Add the advisory/package to `group_vars/rhel96_vuln_poc.yml`, commit, push, and re-sync the AAP project |
| `group_vars` not loading in AAP | Verify the inventory group name is exactly `rhel96_vuln_poc` (matches the filename) |
| No security advisories found | VM may be fully patched. Restore an older Nutanix snapshot |
| Datadog shows duplicate hosts | Ensure VM hostname matches `hostname:` in `datadog.yaml` |
| Datadog finding not appearing | Wait up to 1 hour. Check SBOM is enabled. Verify Agent 7.46+ |
| AAP cannot SSH to VM | Check `ansibleap` user, SSH key, firewall rules, and Machine Credential in AAP |
| Datadog workflow fails to launch AAP job | Verify Connection URL, API token, Job Template ID, and `extra_vars` JSON format |
| Package version unchanged after remediation | Advisory may not cover that package. Check with `dnf updateinfo info <RHSA>` |
| Reboot required but not performed | Set `cve_allow_reboot: true` in group_vars, commit, push, re-sync project |
| Datadog finding not closing after patch | Wait for next SBOM cycle. Do not force or claim closure early |
