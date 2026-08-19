# Handoff Datadog ke Red Hat Ansible

Dokumen ini adalah ringkasan handoff terkini untuk live demo **Datadog + Red
Hat Ansible** per 19 Agustus 2026. Spesifikasi detail implementasi native ada
di [`ansible/README.md`](../../ansible/README.md). Konfigurasi AAP, Inventory,
credential, RBAC, dan Job Template final tetap menjadi milik tim Ansible.

## 1. Keputusan arsitektur

```text
Datadog mendeteksi dan mendiagnosis
  -> policy/approval gate
  -> Datadog menjalankan fixed AAP Job Template
  -> Ansible melakukan perubahan yang sudah disetujui
  -> Datadog memverifikasi hasil dari telemetry
```

- AAP/Ansible adalah execution path utama untuk demo gabungan.
- Event-Driven Ansible tidak wajib untuk POC ini; Datadog dapat langsung
  memanggil Automation Controller API.
- `demo-control.sh` dan Demo Control API hanya development/emergency fallback.
  Keduanya bukan single source of truth implementasi final Ansible.
- Keberhasilan Job Template hanya execution evidence. Status recovery tetap
  diputuskan oleh Datadog dari telemetry aplikasi, host, dan resource.
- Output Bits tidak boleh menjadi command, host, path, image, package, versi,
  replica count, atau argumen shell. Bits hanya memilih kategori dari katalog
  tindakan yang disetujui.

## 2. Status enam skenario

| # | Skenario | Jalur fallback saat ini | Artefak Ansible | Status handoff |
|---:|---|---|---|---|
| 1 | PgBouncer connection pool full | Demo Control teruji | Pool fault/remediation/reset tersedia | Skenario teruji; pastikan JT final memakai native task |
| 2 | Synthetic disk log full | Demo Control teruji | Disk fault/remediation/reset tersedia | Skenario teruji; pastikan whitelist loopback ext4 tetap ketat |
| 3 | Storefront deployment rollback | Demo Control teruji | Native fault dan recovery tersedia | Integrasi AAP sedang dikerjakan |
| 4 | Storefront horizontal scale-out | Demo Control teruji | Native fault dan recovery tersedia | Integrasi AAP sedang dikerjakan |
| 5 | RHEL package vulnerability | Tidak memakai Demo Control | Suite playbook CVE tersedia | `soar.json` baru teruji sampai notifikasi; AAP/E2E belum diuji |
| 6 | Nutanix application-VM memory hot-add | Fault `memory` dan canonical `reset` tersedia | Belum ada playbook native | Kontrak siap; implementasi Ansible masih diperlukan |

Vulnerability adalah workflow SecOps terpisah di
[`soar.json`](../soar.json). Workflow itu tidak boleh digabung ke classifier
aplikasi di `remediation-apps.json`.

## 3. Target dan Inventory

Gunakan dua Inventory/host group yang terpisah:

| Inventory group | Target | Skenario |
|---|---|---|
| `berca_poc_vm` | VM aplikasi Berca yang menjalankan Docker Compose | Pool, disk, rollback, autoscale, memory |
| `rhel96_vuln_poc` | VM RHEL 9.6 terisolasi di Nutanix | Vulnerability remediation |

Alamat host, SSH user/key, sudo credential, Nutanix UUID, Prism credential,
Compose path, GHCR credential, image digest, dan token API tidak boleh disimpan
di payload Datadog atau repository. Nilai tersebut harus berada di AAP
Inventory, Credential, atau protected variables.

## 4. Job Template yang dibutuhkan

### Application incident scenarios

| Kategori | Fault Job Template | Remediation Job Template | Playbook repository |
|---|---|---|---|
| `POOL` | Start Pool Saturation | Recover PgBouncer Pool | `fault-pool.yml`, `recover-pool.yml` |
| `DISK` | Start Synthetic Disk Saturation | Recover Synthetic Disk | `fault-disk.yml`, `recover-disk.yml` |
| `AUTOSCALE` | Start Storefront Capacity Spike | Scale Storefront to 2 | `fault-autoscale.yml`, `recover-autoscale.yml` |
| `ROLLBACK` | Deploy Storefront Demo-Bad | Rollback Storefront to Stable | `fault-rollback.yml`, `recover-rollback.yml` |
| reset | - | Reset Berca POC | `reset.yml` |

Pool remediation dan disk remediation saat ini dikenal sebagai Job Template
13 dan 14; reset sebagai Job Template 15. ID lain ditentukan oleh tim Ansible
dan dikembalikan ke owner Datadog setelah dibuat.

### Memory hot-add

Tim Ansible perlu membuat tiga Job Template fixed:

1. **Inject Application VM Memory Pressure**: jalankan hanya Compose profile
   `memory-demo` dan service `memory-pressure` pada VM aplikasi setelah
   preflight keselamatan lulus.
2. **Hot Add Application VM Memory to 24 GiB**: hot-add Nutanix dari baseline
   16 GiB ke target maksimum 24 GiB tanpa menghentikan pressure.
3. **Restore Application VM Memory to 16 GiB**: hentikan/remove
   `memory-pressure`, restore RAM ke 16 GiB, lalu tunggu guest dan aplikasi
   sehat.

Tidak ada Job Template `Stop Memory Pressure` terpisah. Scenario Controller
memakai canonical `reset` untuk menghentikan pressure pada fallback. Jalur AAP
memakai **Restore Application VM Memory to 16 GiB** sebagai reset lengkap.

### Vulnerability remediation

Artefak yang sudah tersedia:

| Job Template | Playbook | Tujuan |
|---|---|---|
| RHEL 9.6 CVE Preflight | `cve_playbooks/rhel96-cve-preflight.yml` | Pemeriksaan read-only sebelum demo |
| RHEL 9.6 CVE Remediation | `cve_playbooks/rhel96-cve-remediation.yml` | Terapkan satu RHSA/package allowlisted |
| RHEL 9.6 CVE Validate | `cve_playbooks/rhel96-cve-validate.yml` | Validasi package, service, dan Agent |
| RHEL 9.6 CVE Reset Check | `cve_playbooks/rhel96-cve-reset-check.yml` | Validasi setelah Nutanix snapshot restore |
| RHEL 9.6 CVE Rollback | `cve_playbooks/rhel96-cve-rollback.yml` | Lab-only fallback; bukan reset utama demo |

Panduan setup detail ada di
[`ansible/cve_playbooks/IMPLEMENTATION-GUIDE.md`](../../ansible/cve_playbooks/IMPLEMENTATION-GUIDE.md)
dan runbook lab di
[`RHEL96-NUTANIX-VULNERABILITY-REMEDIATION-POC.md`](../RHEL96-NUTANIX-VULNERABILITY-REMEDIATION-POC.md).
Untuk demo formal, reset yang disarankan adalah restore snapshot Nutanix lalu
menjalankan Reset Check. Jangan melakukan downgrade package bebas.

## 5. Kontrak launch aplikasi

Semua remediation aplikasi menerima hanya tiga ID audit melalui required
survey:

```json
{
  "extra_vars": {
    "monitor_id": "<DATADOG_MONITOR_ID>",
    "investigation_id": "<BITS_INVESTIGATION_ID>",
    "workflow_instance_id": "<DATADOG_WORKFLOW_INSTANCE_ID>"
  }
}
```

Classification, service, environment, resource, dan requested action harus
fixed pada Job Template/playbook, bukan dipercaya dari request.

| Classification | Environment | Service | Resource | Fixed action |
|---|---|---|---|---|
| `POOL` | `poc` | `berca-backend` | `pgbouncer-demo` | `recover_pool` |
| `DISK` | `poc` | `berca-backend` | `synthetic-log-volume` | `recover_disk` |
| `AUTOSCALE` | `poc` | `berca-storefront` | `berca-storefront` | `scale_storefront_to_2` |
| `ROLLBACK` | `poc` | `berca-storefront` | `berca-storefront` | `rollback_storefront_stable` |
| `MEMORY_PRESSURE` | `poc` | `berca-backend` | approved application VM | `hot_add_memory` |

`UNKNOWN` tidak boleh meluncurkan Job Template.

## 6. Kontrak launch vulnerability

Kontrak minimal yang harus disepakati dengan `soar.json` adalah:

```json
{
  "extra_vars": {
    "advisory_id": "<ALLOWLISTED_RHSA_ID>",
    "package_name": "<ALLOWLISTED_PACKAGE>",
    "cve_id": "<DATADOG_CVE_ID>",
    "severity": "high|critical",
    "finding_id": "<DATADOG_FINDING_ID>",
    "approval_reference": "<DATADOG_WORKFLOW_INSTANCE_ID>"
  }
}
```

Saat ini `soar.json` masih mengirim field tambahan seperti environment,
installed/fixed version, resource ID, dan requested action. Tim Ansible tidak
boleh memakai field tersebut untuk menentukan target atau command. Sebelum E2E,
owner Datadog akan menyederhanakan payload ke enam survey field di atas, atau
tim bersama-sama menyepakati schema baru yang tetap bounded.

Host, advisory allowlist, package allowlist, repository, fixed version yang
benar-benar tersedia, restart allowlist, dan reboot policy tetap ditentukan dan
divalidasi di Ansible. `fixed_version` dari finding hanya evidence untuk
approval, bukan input langsung ke `dnf`.

## 7. Status dan gap `soar.json`

[`soar.json`](../soar.json) baru diuji pada jalur notifikasi. Query finding,
prioritization, policy, approval, dan integrasi Ansible masih harus divalidasi
sebagai satu alur end-to-end. Integrasi Ansible belum dianggap selesai karena:

- AAP URL dan Job Template ID masih placeholder;
- bearer token masih placeholder dan belum menjadi Datadog Connection;
- file belum mempunyai `connectionEnvs` untuk AAP;
- payload launch belum sama persis dengan enam required survey fields;
- polling AAP, host validation, post-patch rescan, dan resolved finding belum
  diuji end-to-end.

Tim Ansible perlu menyerahkan kepada owner Datadog:

```text
<AAP_BASE_URL_DENGAN_CA_VALID>
<RHEL_CVE_REMEDIATION_JOB_TEMPLATE_ID>
<SCOPED_AAP_TOKEN_OR_CONNECTION>
<EXPECTED_SUCCESS/FAILED/CANCELED_STATUS>
<RHEL_INVENTORY_HOST_ALIAS>
```

Token harus dapat menjalankan hanya Job Template yang diperlukan. Jangan
menaruh bearer token literal di JSON export atau Git.

### Gate sebelum suite CVE dipakai live

Tim Ansible perlu menutup hasil review berikut:

- ganti semua RHSA, CVE, package, fixed build, dan alamat Inventory contoh
  dengan nilai yang benar-benar ditemukan pada VM demo;
- validasi `finding_id` sebagai required non-empty bounded input di playbook,
  bukan hanya di Survey;
- gunakan `ansible.builtin.command.argv` atau module native untuk seluruh
  command yang memakai variable;
- pastikan kegagalan restart service allowlisted membuat job gagal, bukan
  dilanjutkan dengan `ignore_errors`;
- jangan menganggap `curl` sebagai nama systemd service; restart hanya unit
  nyata yang keluar dari `needs-restarting` dan masuk allowlist;
- preflight harus gagal aman bila repository/advisory/package tidak tersedia;
- uji bahwa remediation hanya menerapkan advisory allowlisted dan tidak
  berubah menjadi general `dnf upgrade`;
- perlakukan in-guest downgrade/history undo sebagai lab-only. Snapshot
  Nutanix adalah baseline reset yang direkomendasikan.

## 8. Guardrail wajib

- `allow_simultaneous: false` dan satu shared operation lock untuk scenario
  aplikasi.
- Semua mutating playbook memakai `serial: 1`, `become: true`, dan dedicated
  Machine Credential.
- Tolak environment selain `poc` dan host di luar Inventory yang disetujui.
- Gunakan `ansible.builtin.command.argv` atau module native; jangan bentuk
  shell command dari `extra_vars`.
- Package/RHSA/restart service, image digest, VM UUID, replica count, memory
  baseline/target, Compose path, dan filesystem target wajib allowlisted.
- Tidak ada arbitrary `host`, `path`, `filename`, `command`, `SQL`, `image`,
  `digest`, `package`, `version`, atau shell argument dari Datadog.
- Satu skenario tidak boleh dimulai ketika skenario lain aktif.
- Evidence Job Template harus memuat start/end time, action, before/after,
  audit IDs, dan Nutanix/AAP task ID bila relevan, tanpa secret.

## 9. Acceptance criteria per skenario

| Skenario | Native execution evidence | Final Datadog recovery evidence |
|---|---|---|
| Pool | pool-hog berhenti, pool tetap `5/5`, `cl_waiting=0` | backend latency/error/health normal |
| Disk | target loopback ext4 terverifikasi, trigger hilang, synthetic log ditruncate, usage `<20%` | growth nol dan backend health normal |
| Autoscale | storefront tepat dua replica dan keduanya healthy | p95/error/health kembali aman |
| Rollback | stable immutable digest dan version aktif, katalog `200` | `DD_VERSION` stable, p95/error/health normal |
| Memory | guest/Datadog melihat RAM `>=24 GiB` saat pressure masih aktif | usable memory `>30%`, monitor OK, storefront `200` |
| Vulnerability | allowlisted RHSA diterapkan dan package version berubah | host sehat dan Datadog finding resolved setelah rescan |

HTTP `202`, AAP job `successful`, atau playbook exit code `0` saja tidak cukup
untuk menyatakan recovery.

## 10. Hal yang perlu dikonfirmasi tim Ansible

1. Project SCM sync ke commit yang disepakati.
2. Dua Inventory group dan Machine Credential berfungsi.
3. Semua fixed Job Template, ID, survey, `allow_simultaneous`, dan RBAC.
4. Direct HTTPS dari Datadog ke Automation Controller beserta CA chain.
5. Native pool/disk/autoscale/rollback lulus positive dan negative test.
6. Tiga Job Template memory dan Nutanix hot-add/restore idempotent tersedia.
7. CVE allowlist berasal dari advisory yang benar-benar terlihat pada VM RHEL
   saat demo, bukan nilai contoh dokumentasi.
8. CVE remediation gagal aman jika `finding_id`/approval reference kosong,
   advisory/package tidak allowlisted, repository tidak tersedia, atau service
   restart gagal.
9. Snapshot Nutanix tersedia dan Reset Check lulus setelah restore.
10. Tim menyerahkan endpoint/ID/token scope tanpa mengirim secret melalui Git.

## 11. Paket file untuk handoff

Kirim file/direktori berikut ke tim Ansible:

```text
ansible/README.md
ansible/PLAYBOOK-GUIDE.md
ansible/requirements.yml
ansible/*.yml
ansible/roles/berca_poc_demo/
ansible/cve_playbooks/
load-test/datadog/ANSIBLE-HANDOFF.md
load-test/AUTOSCALE-POC.md
load-test/DEPLOYMENT-ROLLBACK-POC.md
load-test/MEMORY-HOT-ADD-POC.md
load-test/RHEL96-NUTANIX-VULNERABILITY-REMEDIATION-POC.md
load-test/soar.json
```

`soar.json` diberikan sebagai kontrak workflow/status terkini, bukan bukti
bahwa patching Ansible sudah selesai.
