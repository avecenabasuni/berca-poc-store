# Spesifikasi Implementasi untuk Owner Red Hat Ansible

Dokumen ini adalah kontrak kerja antara owner Datadog/aplikasi demo dan owner
Red Hat Ansible untuk POC **AI-Driven Autonomous Remediation with Datadog and
Red Hat Ansible**.

Implementasi final Event-Driven Ansible (EDA), Automation Controller/AAP,
inventory, credential, Job Template, dan playbook tetap dimiliki oleh owner
Ansible. Repository aplikasi hanya menyediakan event contract dan recovery
command yang deterministic.

## 1. Target arsitektur

Final hero flow:

```text
Datadog generic backend monitor ALERT
  -> Datadog Bits Investigation
  -> Datadog Workflow mengklasifikasikan POOL / DISK / UNKNOWN
  -> EDA Event Stream menerima event POOL atau DISK
  -> EDA Rulebook melakukan exact allowlist match
  -> EDA menjalankan approved AAP Job Template
  -> AAP SSH ke satu VM POC
  -> playbook memanggil demo-control.sh
  -> Datadog memverifikasi recovery dari telemetry
```

Posisi Job Template yang sudah tersedia:

| ID | Fungsi | Pemanggil final |
|---:|---|---|
| 13 | Pool remediation | EDA Rulebook setelah exact `POOL` match |
| 14 | Disk remediation | EDA Rulebook setelah exact `DISK` match |
| 15 | Reset demo | Presenter/operator secara manual, bukan Workflow 2 |

Endpoint `/api/controller/v2/job_templates/<id>/launch/` boleh dipakai untuk
smoke test integrasi AAP. Pada final hero flow, Datadog tidak memanggil Job
Template 13 atau 14 secara langsung. Datadog mengirim event ke EDA Event
Stream, lalu EDA yang menjalankan Job Template terkait.

Development tanpa EDA tetap menggunakan transport `direct_script` menuju Demo
Control API. Direct AAP bukan fallback otomatis dan bukan transport ketiga.

## 2. Batas tanggung jawab

Owner Datadog/aplikasi menyediakan:

- `demo-control.sh recover-pool`;
- `demo-control.sh recover-disk`;
- `demo-control.sh reset`;
- fault injection dan traffic generator;
- event schema;
- Datadog Bits classification;
- final recovery verification dari telemetry.

Owner Ansible menyediakan:

- EDA Event Stream dan authentication;
- Rulebook dan Decision Environment;
- AAP Project yang mengambil playbook dari repository Ansible;
- dedicated inventory untuk VM POC;
- Machine Credential dan privilege escalation;
- Job Template 13, 14, dan 15;
- playbook final;
- RBAC dan execution evidence.

Ansible tidak menentukan root cause dan tidak membangun command dari output AI.
Ansible hanya menjalankan action dari katalog yang telah disetujui.

## 3. Event contract dari Datadog ke EDA

POOL event:

```json
{
  "schema_version": "1.0",
  "environment": "poc",
  "service": "berca-backend",
  "classification": "POOL",
  "resource_id": "pgbouncer-demo",
  "requested_action": "recover_pool",
  "monitor_id": "<DATADOG_MONITOR_ID>",
  "investigation_id": "<BITS_INVESTIGATION_ID>",
  "workflow_instance_id": "<DATADOG_WORKFLOW_INSTANCE_ID>"
}
```

DISK event:

```json
{
  "schema_version": "1.0",
  "environment": "poc",
  "service": "berca-backend",
  "classification": "DISK",
  "resource_id": "synthetic-log-volume",
  "requested_action": "recover_disk",
  "monitor_id": "<DATADOG_MONITOR_ID>",
  "investigation_id": "<BITS_INVESTIGATION_ID>",
  "workflow_instance_id": "<DATADOG_WORKFLOW_INSTANCE_ID>"
}
```

Rules:

- `schema_version`, `environment`, dan `service` harus exact match.
- Ketiga ID audit harus string non-empty.
- `POOL` hanya valid bersama `pgbouncer-demo` dan `recover_pool`.
- `DISK` hanya valid bersama `synthetic-log-volume` dan `recover_disk`.
- Kombinasi lain harus ditolak tanpa menjalankan Job Template.
- `UNKNOWN` tidak dikirim ke EDA. Bila sampai diterima, tidak boleh match rule.
- Event tidak boleh berisi atau menentukan host, inventory, path, filename,
  command, shell argument, SQL, pool size, playbook name, credential, atau Job
  Template ID.

Inventory dan target host ditentukan statis di AAP. Contoh lama berikut tidak
boleh digunakan:

```json
{
  "extra_vars": {
    "target_host": "192.0.2.10",
    "alert_title": "Datadog Alert Title"
  }
}
```

`target_host` memperluas blast radius berdasarkan input eksternal dan
`alert_title` bukan kontrak action yang dibutuhkan.

## 4. Mapping EDA ke AAP

Rule POOL:

```text
IF exact event ==
  schema_version=1.0
  environment=poc
  service=berca-backend
  classification=POOL
  resource_id=pgbouncer-demo
  requested_action=recover_pool
  all audit IDs non-empty
THEN run Job Template 13
ELSE no action
```

Rule DISK:

```text
IF exact event ==
  schema_version=1.0
  environment=poc
  service=berca-backend
  classification=DISK
  resource_id=synthetic-log-volume
  requested_action=recover_disk
  all audit IDs non-empty
THEN run Job Template 14
ELSE no action
```

Saat EDA menjalankan Job Template, event yang sudah tervalidasi dinormalisasi ke
satu variable berikut:

```json
{
  "extra_vars": {
    "remediation_event": {
      "schema_version": "1.0",
      "environment": "poc",
      "service": "berca-backend",
      "classification": "POOL",
      "resource_id": "pgbouncer-demo",
      "requested_action": "recover_pool",
      "monitor_id": "<DATADOG_MONITOR_ID>",
      "investigation_id": "<BITS_INVESTIGATION_ID>",
      "workflow_instance_id": "<DATADOG_WORKFLOW_INSTANCE_ID>"
    }
  }
}
```

Untuk DISK, object yang sama menggunakan nilai DISK yang telah ditentukan di
bagian 3. Playbook melakukan defensive assertion ulang terhadap object ini
sebelum task yang dapat mengubah state.

## 5. Konfigurasi AAP yang diminta

### Inventory dan credential

- Gunakan dedicated inventory group, misalnya `berca_poc_vm`.
- Group hanya berisi satu managed VM POC.
- VM address dan SSH user berada di Inventory/Machine Credential, bukan event.
- Simpan `poc_project_path` sebagai inventory/host variable, contoh
  `/home/<automation-user>/berca-poc-store`.
- `poc_project_path` wajib absolute dan tidak boleh diterima dari `extra_vars`.
- Gunakan dedicated Machine Credential dan `become: true`.

### Job Template 13 dan 14

- Inventory: dedicated POC inventory.
- Credential: dedicated POC Machine Credential.
- Limit: dedicated POC VM/group, tidak menggunakan `all` secara bebas.
- Concurrent jobs: disabled.
- Job timeout: 300 detik.
- Variable input hanya `remediation_event` yang berasal dari EDA.
- Jangan menyediakan survey untuk host, command, path, filename, action, atau
  playbook name.

### Job Template 15

- Hanya dapat dijalankan manual oleh presenter/operator.
- Tidak boleh dipanggil dari rule POOL, DISK, atau UNKNOWN.
- Tidak membutuhkan event payload.
- Memanggil `demo-control.sh reset` pada dedicated VM yang sama.

Token AAP, SSH key, become password, Event Stream credential, dan endpoint
private disimpan di AAP/EDA/Datadog Connection. Nilainya tidak disimpan di Git,
playbook, Workflow output, atau screenshot publik.

## 6. Bentuk playbook yang diwajibkan

Semua remediation harus menggunakan deterministic repository interface:

| Classification | Satu-satunya command yang diizinkan |
|---|---|
| POOL | `<poc_project_path>/demo-control.sh recover-pool` |
| DISK | `<poc_project_path>/demo-control.sh recover-disk` |
| Manual reset | `<poc_project_path>/demo-control.sh reset` |

Playbook minimum harus:

1. Menargetkan dedicated inventory group dengan `serial: 1`.
2. Menggunakan `become: true` dan `gather_facts: false`.
3. Memastikan `poc_project_path` defined, non-empty, dan absolute.
4. Memakai `ansible.builtin.stat` untuk memastikan `demo-control.sh` adalah file
   executable.
5. Memvalidasi seluruh `remediation_event` dengan `ansible.builtin.assert`.
6. Memanggil script menggunakan `ansible.builtin.command` bentuk `argv`.
7. Tidak memakai `shell`, wildcard, `pkill`, raw `truncate`, raw SQL, atau
   direct Docker restart.
8. Tidak memakai `ignore_errors` pada preflight atau remediation.
9. Mendaftarkan stdout, stderr, rc, dan durasi job sebagai execution evidence.
10. Membiarkan non-zero exit code menggagalkan Job Template.

Bentuk task action yang diharapkan untuk POOL:

```yaml
- name: Run approved pool recovery
  ansible.builtin.command:
    argv:
      - "{{ poc_project_path }}/demo-control.sh"
      - recover-pool
  register: recovery_result
  changed_when: recovery_result.rc == 0
```

Untuk DISK, satu-satunya perbedaan adalah argument `recover-disk`. Untuk reset,
gunakan argument `reset` dan jangan menerima `remediation_event`.

Playbook tidak perlu mengimplementasikan ulang validasi loopback, truncate,
PgBouncer polling, atau cleanup. Semua safety logic itu sudah menjadi tanggung
jawab `demo-control.sh`.

## 7. Perubahan wajib terhadap draft sekarang

### Pool remediation

Hapus task restart PgBouncer. Restart tidak menghentikan dedicated pool-hog dan
bukan recovery yang disetujui. Ganti dengan:

```text
demo-control.sh recover-pool
```

### Disk remediation

Hapus seluruh task berikut:

```text
pkill -f log-generator.sh
truncate -s 0 /var/log/poc-saturation/*.log
ignore_errors
```

Path tersebut bukan target project dan wildcard tidak memenuhi whitelist.
Ganti seluruhnya dengan:

```text
demo-control.sh recover-disk
```

### Reset demo

Pertahankan pemanggilan `demo-control.sh reset`, tetapi:

- ganti placeholder `/path/to/berca-poc-store` dengan
  `{{ poc_project_path }}` dari inventory;
- gunakan `command.argv`;
- targetkan dedicated POC group;
- jadikan Job Template 15 manual-only;
- tambahkan preflight dan independent post-command status check.

## 8. AAP API smoke test

Direct Controller API hanya untuk menguji Job Template secara terisolasi.
Gunakan HTTPS dengan CA/certificate yang dipercaya; jangan menaruh token dalam
command history atau repository.

Request POOL ke Job Template 13:

```http
POST <AAP_BASE_URL>/api/controller/v2/job_templates/13/launch/
Authorization: Bearer <AAP_OAUTH_TOKEN>
Content-Type: application/json

{
  "extra_vars": {
    "remediation_event": {
      "schema_version": "1.0",
      "environment": "poc",
      "service": "berca-backend",
      "classification": "POOL",
      "resource_id": "pgbouncer-demo",
      "requested_action": "recover_pool",
      "monitor_id": "smoke-monitor",
      "investigation_id": "smoke-investigation",
      "workflow_instance_id": "smoke-workflow"
    }
  }
}
```

DISK menggunakan endpoint Job Template 14 dan exact DISK values. Reset Job
Template 15 menggunakan `{"extra_vars": {}}` dan hanya dijalankan manual.

HTTP 2xx atau status AAP `successful` belum membuktikan service recovery. Itu
hanya membuktikan dispatch/execution. Final success tetap ditentukan oleh
Datadog telemetry.

## 9. Acceptance tests

Owner Ansible menyerahkan bukti untuk test berikut:

1. Valid POOL event menjalankan tepat satu Job Template 13.
2. Job 13 menghentikan pool-hog, mempertahankan PgBouncer `5/5`, dan menghasilkan
   `cl_waiting=0`.
3. Valid DISK event menjalankan tepat satu Job Template 14.
4. Job 14 hanya memulihkan POC loopback filesystem, menghasilkan disk `<20%`,
   zero log growth, dan menghapus backend impact marker.
5. `UNKNOWN` tidak menjalankan Job Template apa pun.
6. Mismatched classification/resource/action tidak menjalankan Job Template.
7. Missing/empty audit ID tidak menjalankan Job Template.
8. Extra variable tidak dapat mengganti host, path, command, inventory, atau
   Job Template.
9. Non-zero `demo-control.sh` exit membuat AAP job `failed`.
10. Job Template 15 hanya berhasil dari manual operator launch.
11. Concurrent remediation tidak berjalan bersamaan; VM script lock tetap
    menjadi final guard.
12. Datadog melakukan verification setelah AAP execution dan melakukan
    escalation bila telemetry belum pulih.

## 10. Definition of done

Handoff Ansible dinyatakan selesai setelah tersedia:

- EDA Event Stream URL dan authentication yang dapat dipakai Datadog;
- Rulebook dengan dua exact-match rules dan safe no-match behavior;
- Decision Environment yang tervalidasi;
- Project, Inventory, Machine Credential, dan Job Template 13/14/15;
- playbook pool, disk, dan manual reset sesuai kontrak ini;
- successful and negative test evidence;
- nama connection/credential untuk integrasi tanpa mengungkap secret;
- konfirmasi bahwa Datadog mengirim ke EDA pada final demo, bukan langsung ke
  Controller Job Template.
