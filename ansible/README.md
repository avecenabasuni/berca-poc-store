# Spesifikasi Handoff Datadog ke Red Hat Ansible

Dokumen ini menjelaskan implementasi yang diharapkan dari owner Red Hat
Ansible untuk POC **AI-Driven Autonomous Remediation with Datadog and Red Hat
Ansible**.

Target dokumen ini adalah live sales demo yang sederhana, stabil, aman untuk
diulang, dan tetap memperlihatkan peran nyata kedua produk. Ini bukan desain
production-grade.

## 1. Keputusan arsitektur

Event-Driven Ansible (EDA) tidak menjadi dependency untuk versi POC ini.
Datadog Workflow Automation langsung menjalankan Job Template yang sudah
disetujui melalui Automation Controller API.

```text
Datadog generic backend monitor ALERT
  -> Bits Investigation
  -> Datadog Workflow mengklasifikasikan POOL / DISK / UNKNOWN
  -> bounded action catalog
       POOL    -> POST AAP Job Template 13
       DISK    -> POST AAP Job Template 14
       UNKNOWN -> no change, escalation
  -> ambil AAP job ID
  -> poll AAP job sampai terminal state
  -> Datadog memverifikasi recovery dari telemetry
  -> success atau escalation
```

Posisi Job Template yang sudah tersedia:

| ID | Fungsi | Pemanggil |
|---:|---|---|
| 13 | Pool remediation | Workflow 2, hanya pada klasifikasi `POOL` |
| 14 | Disk remediation | Workflow 2, hanya pada klasifikasi `DISK` |
| 15 | Reset demo | Presenter/operator; bukan autonomous remediation |

Endpoint Job Template harus disimpan sebagai URL statis pada masing-masing
branch Workflow. Workflow tidak boleh membentuk Job Template ID dari output
Bits, monitor payload, atau input bebas.

EDA dapat ditambahkan kemudian bila demo memang perlu menampilkan Event Stream,
Rulebook, dan event routing milik Red Hat. EDA bukan bagian dari minimal hero
demo dan bukan fallback otomatis.

## 2. Peran setiap komponen

### Datadog

Datadog bertanggung jawab atas:

- generic backend degradation detection;
- Bits Investigation;
- klasifikasi terbatas `POOL`, `DISK`, atau `UNKNOWN`;
- pemilihan endpoint Job Template dari katalog statis;
- authenticated launch request ke AAP;
- polling status job sebagai execution evidence;
- recovery verification dari Datadog telemetry;
- safe escalation untuk `UNKNOWN`, dispatch failure, atau recovery failure.

### Red Hat Ansible

Owner Ansible bertanggung jawab atas:

- AAP Project dan source control playbook;
- dedicated Inventory untuk satu VM POC;
- Machine Credential dan privilege escalation;
- Job Template 13, 14, dan 15;
- final idempotent playbooks;
- RBAC untuk service account Datadog;
- execution evidence dan status job.

Ansible tidak menentukan root cause dan tidak membangun command dari output AI.
Playbook hanya menjalankan remediasi yang sudah melekat pada Job Template.

### Repository aplikasi

Repository aplikasi menyediakan:

- fault injection dan traffic generator;
- target resource dan path POC yang eksplisit;
- `demo-control.sh` sebagai tested host-local reference/fallback;
- Demo Control API untuk development transport;
- expected recovery behavior;
- Datadog telemetry dan success criteria.

## 3. Apakah playbook harus memanggil `demo-control.sh`?

Tidak wajib.

Memanggil script dari Ansible adalah pola integrasi yang valid ketika script
tersebut merupakan operational interface yang sudah diuji. Untuk MVP atau
integration smoke test, pola berikut tetap diizinkan:

```text
demo-control.sh recover-pool
demo-control.sh recover-disk
demo-control.sh reset
```

Namun untuk final sales demo, playbook 13 dan 14 lebih baik memperlihatkan task
Ansible yang idempotent, tervalidasi, dan mudah dibaca. Dengan demikian AAP
tidak terlihat hanya sebagai remote shell wrapper.

Keputusan implementasi:

| Mode | Implementasi | Posisi |
|---|---|---|
| Reference/fallback | `command.argv` memanggil `demo-control.sh` | Diizinkan untuk smoke test |
| Preferred final | Native Ansible tasks dengan safety dan hasil yang sama | Direkomendasikan untuk JT 13/14 |
| Reset | Boleh memanggil `demo-control.sh reset` | Dapat diterima karena cleanup lintas-resource kompleks |

Jika owner Ansible memilih native tasks, script tetap menjadi executable
reference untuk membandingkan behavior. Datadog tetap menggunakan telemetry
yang sama untuk menentukan berhasil atau gagal.

## 4. Katalog action yang dibatasi

Mapping diagnosis ke action hanya ada di Datadog Workflow:

| Classification | Endpoint tetap | Approved outcome |
|---|---|---|
| `POOL` | Job Template 13 | Hentikan dedicated pool-hog dan pulihkan antrean |
| `DISK` | Job Template 14 | Pulihkan hanya synthetic log volume yang di-whitelist |
| `UNKNOWN` | Tidak ada request | Tidak ada perubahan; escalation |

Workflow tidak boleh menerima atau meneruskan:

- target host atau inventory;
- path atau filename;
- command atau shell argument;
- SQL atau pool size;
- container name;
- playbook name;
- credential;
- Job Template ID.

Semua target teknis ditetapkan oleh Inventory, Job Template, dan playbook yang
dikendalikan owner Ansible.

## 5. Launch contract Datadog ke AAP

Karena Job Template ID sudah menentukan jenis remediation, action fields tidak
perlu diterima sebagai launch-time variables.

Job Template 13 menyimpan fixed variables berikut pada konfigurasi template
atau playbook:

```yaml
schema_version: "1.0"
environment: poc
service: berca-backend
classification: POOL
resource_id: pgbouncer-demo
requested_action: recover_pool
```

Job Template 14 menyimpan:

```yaml
schema_version: "1.0"
environment: poc
service: berca-backend
classification: DISK
resource_id: synthetic-log-volume
requested_action: recover_disk
```

Datadog hanya mengirim tiga audit identifiers:

```json
{
  "extra_vars": {
    "monitor_id": "<DATADOG_MONITOR_ID>",
    "investigation_id": "<BITS_INVESTIGATION_ID>",
    "workflow_instance_id": "<DATADOG_WORKFLOW_INSTANCE_ID>"
  }
}
```

Ketiga variable harus dibuat sebagai required text survey fields pada Job
Template 13 dan 14, dengan panjang minimum 1 dan panjang maksimum yang wajar.
Jangan mengaktifkan arbitrary `ask_variables_on_launch` jika survey yang sempit
sudah mencukupi.

Payload lama berikut dilarang:

```json
{
  "extra_vars": {
    "target_host": "192.0.2.10",
    "alert_title": "Datadog Alert Title"
  }
}
```

Target host berasal dari AAP Inventory. `alert_title` tidak digunakan sebagai
input action; konteks audit menggunakan tiga ID yang terstruktur.

## 6. Datadog Workflow dispatch

Workflow 2 menggunakan connection dengan Bearer token dan dua fixed actions:

```text
POOL -> POST <AAP_BASE_URL>/api/controller/v2/job_templates/13/launch/
DISK -> POST <AAP_BASE_URL>/api/controller/v2/job_templates/14/launch/
```

Setelah launch:

1. Pastikan respons launch berisi numeric `id`.
2. Simpan nilai tersebut sebagai `aap_job_id`.
3. Poll `GET <AAP_BASE_URL>/api/controller/v2/jobs/<aap_job_id>/`.
4. Gunakan bounded wait; jangan membuat remediation retry ladder.
5. Terminal success: `successful`.
6. Terminal failure: `failed`, `error`, atau `canceled`.
7. Setelah AAP selesai, lanjutkan ke shared Datadog telemetry verification.

HTTP 2xx dan status AAP `successful` hanya membuktikan dispatch/execution.
Keduanya tidak membuktikan service sudah pulih.

Karena Controller menggunakan alamat private, gunakan Datadog Private Action
Runner yang dapat mencapai jaringan AAP. Simpan token pada Datadog HTTP
Connection, bukan di workflow body, log, repository, atau screenshot.

Service account token untuk Workflow harus memiliki execute permission hanya
pada Job Template 13 dan 14. Reset Job Template 15 sebaiknya memakai hak
operator terpisah.

## 7. Konfigurasi AAP

### Inventory dan credential

- Gunakan dedicated group, misalnya `berca_poc_vm`.
- Group hanya berisi managed VM POC.
- VM address dan SSH user berada di Inventory/Machine Credential.
- Simpan `poc_project_path` sebagai inventory/group/host variable.
- `poc_project_path` harus absolute dan tidak diterima dari `extra_vars`.
- Gunakan dedicated Machine Credential dan `become: true`.
- Jangan memakai `hosts: all`; targetkan dedicated group.

### Job Template 13 dan 14

- Dedicated POC Inventory dan Machine Credential.
- Dedicated playbook untuk satu remediation.
- Concurrent jobs disabled.
- Timeout sekitar 300 detik.
- Tiga required audit survey fields saja.
- Fixed classification/resource/action tidak promptable.
- Tidak ada prompt untuk inventory, credential, limit, path, atau command.

### Job Template 15

- Manual reset atau Workflow 1 manual reset saja.
- Tidak dipanggil oleh Workflow 2.
- Tidak membutuhkan classification dari Bits.
- Menggunakan dedicated POC Inventory yang sama.

Token AAP, private endpoint, SSH key, become password, dan certificate tidak
boleh disimpan di Git.

## 8. Spesifikasi preferred native playbooks

Semua playbook minimum harus:

1. Menargetkan dedicated inventory group dengan `serial: 1`.
2. Menggunakan `become: true` dan `gather_facts: false`.
3. Menjalankan preflight sebelum task yang mengubah state.
4. Memvalidasi tiga audit IDs sebagai string non-empty.
5. Menggunakan Fully Qualified Collection Name.
6. Menghindari `ansible.builtin.shell` bila `command.argv` atau module tersedia.
7. Tidak memakai wildcard, `pkill`, atau arbitrary process matching.
8. Tidak memakai `ignore_errors` pada preflight, remediation, atau verification.
9. Bersifat idempotent: kondisi yang sudah pulih menghasilkan sukses tanpa
   perubahan berbahaya.
10. Membiarkan kegagalan aktual menghasilkan AAP job `failed`.
11. Mencatat before/after state dan durasi sebagai job evidence.

### Job Template 13: pool remediation

Required behavior:

1. Pastikan Docker Compose v2 dan project path tersedia.
2. Baca state PgBouncer dan dedicated `pool-hog`.
3. Hentikan hanya service/container `pool-hog` milik project POC.
4. Jangan restart PgBouncer atau PostgreSQL.
5. Jangan mengubah `default_pool_size` atau `max_db_connections`.
6. Poll sampai `cl_waiting=0`.
7. Verifikasi pool tetap pada baseline `5/5`.
8. Bila pool-hog sudah berhenti dan antrean sudah nol, hasilkan idempotent
   success.

Preferred modules:

- `community.docker.docker_compose_v2` atau module Docker yang menargetkan nama
  service/container exact;
- `ansible.builtin.command` bentuk `argv` untuk fixed PgBouncer admin query;
- `ansible.builtin.assert` dan bounded `until` untuk verification.

Restart container `pgbouncer` bukan approved remediation karena tidak
menghilangkan penyebab synthetic connection holder.

### Job Template 14: disk remediation

Required behavior:

1. Pastikan target tepat `/var/log/poc-app`.
2. Verifikasi target adalah ext4 pada `/dev/loopN` yang backing file-nya tepat
   `/tmp/poc-log-disk.img`.
3. Gagal aman tanpa perubahan jika validasi mount tidak cocok.
4. Hapus hanya `/var/log/poc-app/.trigger_saturation`.
5. Hapus hanya POC backend impact marker yang dikonfigurasi pada Inventory.
6. Truncate hanya `/var/log/poc-app/app-saturation.log` setelah target aman
   terverifikasi.
7. Jalankan `sync` melalui fixed `command.argv` bila diperlukan.
8. Poll sampai disk usage `<20%` dan ukuran log berhenti bertambah.
9. Jangan unmount loopback saat remediation; unmount adalah bagian reset.
10. Bila fault sudah pulih, hasilkan idempotent success.

Preferred modules:

- `ansible.builtin.command` bentuk `argv` untuk `findmnt`, `losetup`, `truncate`,
  dan `sync` dengan arguments statis;
- `ansible.builtin.file` untuk menghapus exact trigger/marker;
- `ansible.builtin.assert` sebelum truncate;
- bounded `until` untuk usage dan growth verification.

Dilarang menggunakan:

```text
pkill -f log-generator.sh
truncate /var/log/poc-saturation/*.log
wildcard file deletion
ignore_errors
```

Path `/var/log/poc-saturation` bukan target fault yang digunakan repository.

### Job Template 15: reset

Reset menyentuh beberapa resource sekaligus: pool-hog, PgBouncer baseline,
trigger, synthetic filesystem, loop device, log baseline, consumer containers,
dan health checks. Karena lifecycle ini sudah dipusatkan dan diuji di
`demo-control.sh reset`, memanggil script tersebut dari JT 15 dapat diterima dan
lebih aman daripada membuat implementasi reset kedua yang mudah menyimpang.

Jika dipanggil dari Ansible, gunakan fixed argv:

```yaml
- name: Reset the POC to its tested baseline
  ansible.builtin.command:
    argv:
      - "{{ poc_project_path }}/demo-control.sh"
      - reset
  register: reset_result
```

Tambahkan preflight executable dan independent post-reset checks. Non-zero exit
code harus menggagalkan Job Template.

## 9. Reference/fallback playbook mode

Jika native playbook belum selesai saat integration test dimulai, JT 13 dan 14
boleh sementara memanggil fixed recovery interface berikut menggunakan
`command.argv`:

```text
<poc_project_path>/demo-control.sh recover-pool
<poc_project_path>/demo-control.sh recover-disk
```

Mode ini harus diberi label `REFERENCE INTEGRATION FALLBACK`, bukan dianggap
final best-practice playbook. Script tidak menerima host, path, filename, SQL,
pool size, atau arbitrary shell arguments.

## 10. Perubahan terhadap draft playbook sekarang

### Pool draft

Draft saat ini melakukan restart container PgBouncer. Ganti dengan native pool
recovery pada bagian 8, atau gunakan reference fallback sementara. Container
yang harus dihentikan adalah dedicated `pool-hog`, bukan PgBouncer.

### Disk draft

Hapus `pkill`, wildcard truncate, path `/var/log/poc-saturation`, dan seluruh
`ignore_errors`. Implementasikan exact target validation dan native recovery
pada bagian 8, atau gunakan reference fallback sementara.

### Reset draft

Ganti placeholder personal dengan `{{ poc_project_path }}` dari Inventory,
gunakan `command.argv`, targetkan dedicated inventory group, dan tambahkan
independent post-reset verification.

## 11. API smoke tests

Pool launch:

```http
POST <AAP_BASE_URL>/api/controller/v2/job_templates/13/launch/
Authorization: Bearer <AAP_OAUTH_TOKEN>
Content-Type: application/json

{
  "extra_vars": {
    "monitor_id": "smoke-monitor",
    "investigation_id": "smoke-investigation",
    "workflow_instance_id": "smoke-workflow"
  }
}
```

Disk menggunakan body yang sama menuju Job Template 14. Reset Job Template 15
menggunakan `{"extra_vars": {}}` dan dijalankan manual.

Gunakan HTTPS dengan certificate/CA yang dipercaya. Jangan menggunakan token
nyata dalam dokumentasi, shell history, atau screenshot publik.

## 12. Recovery acceptance criteria

### POOL

```text
pool-hog stopped
AND default_pool_size = 5
AND max_db_connections = 5
AND cl_waiting = 0
AND backend health OK
```

Final Workflow success juga membutuhkan backend latency dan error rate kembali
normal berdasarkan Datadog telemetry.

### DISK

```text
only the POC loopback target changed
AND synthetic trigger removed
AND synthetic impact marker removed
AND app-saturation.log truncated
AND disk usage < 20%
AND synthetic log growth = 0
AND backend health OK
```

Final Workflow success juga membutuhkan backend latency dan error rate kembali
normal berdasarkan Datadog telemetry.

### UNKNOWN

```text
no AAP launch
AND no infrastructure change
AND escalation sent
```

## 13. Required tests from the Ansible owner

1. Valid POOL branch menjalankan tepat satu Job Template 13.
2. Valid DISK branch menjalankan tepat satu Job Template 14.
3. `UNKNOWN` tidak menjalankan Job Template apa pun.
4. Empty audit ID ditolak oleh survey atau playbook preflight.
5. Launch payload tidak dapat mengganti host, path, action, inventory, atau
   credential.
6. Duplicate invocation setelah recovery menghasilkan idempotent success.
7. Non-zero remediation result membuat AAP job `failed`.
8. Pool remediation tidak restart PgBouncer/PostgreSQL.
9. Disk remediation menolak non-loopback/non-ext4/wrong backing file.
10. Disk remediation tidak menyentuh log di luar exact whitelist.
11. Concurrent execution tidak diperbolehkan.
12. Job Template 15 dapat mengembalikan baseline untuk demo berikutnya.
13. Datadog mendapatkan job ID, membaca terminal status, lalu melakukan
    independent telemetry verification.

## 14. Definition of done

Handoff Ansible selesai setelah tersedia:

- AAP Project yang sinkron dengan repository playbook owner Ansible;
- dedicated Inventory dan Machine Credential untuk VM POC;
- Job Template 13/14/15 sesuai pembatasan dokumen ini;
- required audit surveys pada JT 13/14;
- preferred native pool dan disk playbooks, atau fallback yang diberi label;
- positive dan negative test evidence;
- Datadog service account dengan execute-only access ke JT 13/14;
- private connectivity dari Datadog Private Action Runner ke AAP;
- konfirmasi bahwa AAP status hanya execution evidence dan Datadog telemetry
  tetap menjadi final recovery authority.
