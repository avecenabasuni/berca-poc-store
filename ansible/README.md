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

Workflow 1 untuk fault injection juga menggunakan AAP pada implementasi final:

```text
Presenter menjalankan Datadog Workflow 1
  -> pool  -> POST fixed Pool Fault Job Template
  -> disk  -> POST fixed Disk Fault Job Template
  -> reset -> POST Job Template 15
```

Dengan desain ini, `demo-control.sh` dan Demo Control API tidak berada pada
critical path final demo. Keduanya dipertahankan hanya sebagai development dan
emergency fallback.

```text
Datadog generic backend monitor ALERT
  -> Bits Investigation
  -> Datadog Workflow mengklasifikasikan POOL / DISK / AUTOSCALE /
     ROLLBACK / MEMORY_PRESSURE / UNKNOWN
  -> bounded action catalog
       POOL    -> POST AAP Job Template 13
       DISK    -> POST AAP Job Template 14
       MEMORY_PRESSURE -> POST fixed Memory Hot-Add Job Template
       UNKNOWN -> no change, escalation
  -> ambil AAP job ID
  -> poll AAP job sampai terminal state
  -> Datadog memverifikasi recovery dari telemetry
  -> success atau escalation
```

Posisi Job Template:

| ID | Fungsi | Pemanggil | Status |
|---:|---|---|---|
| `<POOL_FAULT_JT_ID>` | Start pool fault | Workflow 1 `pool` | Perlu dibuat owner Ansible |
| `<DISK_FAULT_JT_ID>` | Start disk fault | Workflow 1 `disk` | Perlu dibuat owner Ansible |
| 13 | Pool remediation | Workflow 2, hanya pada `POOL` | Sudah tersedia |
| 14 | Disk remediation | Workflow 2, hanya pada `DISK` | Sudah tersedia |
| 15 | Full reset | Final AAP path atau operator; fallback saat ini memakai Demo Control `reset` | Sudah tersedia |
| `<MEMORY_FAULT_JT_ID>` | Inject bounded application-VM memory pressure | Pengganti final untuk fallback Demo Control `memory` | Perlu dibuat owner Ansible |
| `<MEMORY_HOT_ADD_JT_ID>` | Hot-add Nutanix application VM ke 24 GiB | Remediation Workflow, hanya `MEMORY_PRESSURE` | Perlu dibuat owner Ansible |
| `<MEMORY_RESET_JT_ID>` | Stop pressure dan restore baseline 16 GiB | Scenario Controller `reset-memory` | Perlu dibuat owner Ansible |

Endpoint Job Template harus disimpan sebagai URL statis pada masing-masing
branch Workflow. Workflow tidak boleh membentuk Job Template ID dari output
Bits, monitor payload, atau input bebas.

EDA dapat ditambahkan kemudian bila demo memang perlu menampilkan Event Stream,
Rulebook, dan event routing milik Red Hat. EDA bukan bagian dari minimal hero
demo dan bukan fallback otomatis.

### Extension: application VM memory hot-add

Skenario memory memakai AAP sebagai execution path utama. Selama implementasi
Ansible belum tersedia, Demo Control action `memory` dan canonical `reset`
menjadi development fallback. Tidak ada action `stop-memory` terpisah. Detail
implementasi, calibration, payload, verification, dan live demo ada di
`load-test/MEMORY-HOT-ADD-POC.md`.

Tiga Job Template memory harus mengunci Inventory host, Nutanix VM UUID, Prism
endpoint, Compose project path, service name, baseline 16 GiB, dan target 24
GiB di sisi AAP. Tidak ada nilai tersebut yang boleh berasal dari monitor,
Bits, survey bebas, atau Datadog request.

Kontrak native action:

| Job Template | Native outcome |
|---|---|
| Inject Application VM Memory Pressure | Preflight 16 GiB dan `MemAvailable >=2.5 GiB`, lalu start hanya Compose profile/service `memory-demo` / `memory-pressure` |
| Hot Add Application VM Memory to 24 GiB | Nutanix hot-add 16 ke 24 GiB tanpa menghentikan pressure; no-op pada 24 GiB; tidak pernah melebihi 24 GiB |
| Restore Application VM Memory Baseline | Stop pressure secara idempotent, restore 24 ke 16 GiB, lalu tunggu guest, SSH, Datadog Agent, dan application stack sehat |

Gunakan shared scenario lock lintas seluruh Job Template POC. Inject wajib
menolak pool, disk, autoscale, rollback, atau vulnerability scenario yang aktif.
Restore wajib menolak scale-down bila pressure masih aktif setelah tahap stop.
Setiap hot-add/restore mencatat Nutanix task ID dan before/after guest memory
sebagai evidence tanpa mengekspos credential.

## 2. Peran setiap komponen

### Datadog

Datadog bertanggung jawab atas:

- generic backend degradation detection;
- Bits Investigation;
- klasifikasi terbatas `POOL`, `DISK`, `AUTOSCALE`, `ROLLBACK`,
  `MEMORY_PRESSURE`, atau `UNKNOWN`;
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
- Pool Fault, Disk Fault, dan Job Template 13, 14, dan 15;
- native Job Template autoscale, rollback, dan memory hot-add/reset;
- Inventory dan Job Template terpisah untuk RHEL vulnerability remediation;
- final idempotent playbooks;
- RBAC untuk service account Datadog;
- execution evidence dan status job.

Ansible tidak menentukan root cause dan tidak membangun command dari output AI.
Playbook hanya menjalankan remediasi yang sudah melekat pada Job Template.

### Repository aplikasi

Repository aplikasi menyediakan:

- fault injection dan traffic generator;
- target resource dan path POC yang eksplisit;
- `demo-control.sh` sebagai tested host-local fallback;
- Demo Control API sebagai development fallback transport;
- expected recovery behavior;
- Datadog telemetry dan success criteria.

## 3. Posisi `demo-control.sh`

Final AAP playbooks tidak memanggil `demo-control.sh`. Seluruh action `pool`,
`disk`, `recover-pool`, `recover-disk`, `reset`, dan read-only `status`
diimplementasikan sebagai Ansible role/tasks.

Script berikut dipertahankan sebagai emergency dan development fallback:

```text
demo-control.sh recover-pool
demo-control.sh recover-disk
demo-control.sh reset
```

Keputusan implementasi final:

| Mode | Implementasi | Posisi |
|---|---|---|
| Final hero demo | Native Ansible role/tasks | Wajib untuk fault, remediation, reset, dan status |
| Development fallback | Demo Control API -> `demo-control.sh` | Hanya jika AAP belum tersedia |
| Emergency host fallback | Operator menjalankan `demo-control.sh reset` | Manual break-glass |

Tidak menggunakan `.sh` bukan berarti semua executable Linux dilarang. Bila
tidak ada module yang sesuai, playbook boleh memakai `ansible.builtin.command`
dengan `argv` statis untuk `psql`, `findmnt`, `losetup`, `sync`, atau command
lain yang telah di-whitelist. `ansible.builtin.shell`, interpolasi command, dan
arbitrary arguments tetap dilarang.

Setelah native implementation lulus parity test, Ansible menjadi canonical
implementation. Script dibekukan sebagai fallback dan tidak dikembangkan
sebagai jalur utama kedua.

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

Workflow 2 menggunakan remediation-scoped connection dengan Bearer token dan
dua fixed actions:

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

Workflow 1 menggunakan fault-control-scoped connection yang hanya mempunyai
execute permission untuk Pool Fault Job Template, Disk Fault Job Template, dan
Job Template 15. Token Workflow 1 tidak dapat menjalankan Job Template 13/14;
token Workflow 2 tidak dapat membuat fault atau melakukan reset.

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
- Menjalankan native reset tasks; tidak memanggil shell script pada final flow.

### Pool dan disk fault Job Templates

- Masing-masing memakai dedicated playbook dengan action tetap.
- Hanya dapat dijalankan melalui Workflow 1 atau operator POC.
- Tidak menerima action, host, path, command, atau container dari survey.
- Menggunakan Inventory dan Machine Credential yang sama.
- Tidak boleh aktif bersamaan; shared host lock menjadi final guard.

Token AAP, private endpoint, SSH key, become password, dan certificate tidak
boleh disimpan di Git.

## 8. Spesifikasi native Ansible implementation

Owner Ansible disarankan membuat satu reusable role dengan task files terpisah,
bukan menyalin task yang sama ke banyak playbook:

```text
roles/berca_poc_demo/
  defaults/main.yml
  tasks/preflight.yml
  tasks/acquire-lock.yml
  tasks/release-lock.yml
  tasks/read-pool-state.yml
  tasks/read-disk-state.yml
  tasks/fault-pool.yml
  tasks/fault-disk.yml
  tasks/recover-pool.yml
  tasks/recover-disk.yml
  tasks/reset.yml
  tasks/status.yml
```

Thin playbooks mengimpor tepat satu task lifecycle. External payload tidak
memilih nama task file; setiap Job Template sudah terikat ke playbook/action
yang tetap.

Pin collection versions pada Ansible repository:

```yaml
collections:
  - name: community.docker
  - name: community.general
  - name: ansible.posix
```

Gunakan:

- `community.docker.docker_compose_v2` untuk Compose services;
- `community.general.filesize` untuk disk image berukuran tetap;
- `community.general.filesystem` untuk ext4 pada image POC;
- `ansible.posix.mount` dengan state ephemeral/unmounted agar tidak mengubah
  `/etc/fstab`;
- `ansible.builtin.file`, `stat`, `assert`, `command`, dan bounded
  `until/retries/delay` untuk state dan verification.

Semua playbook minimum harus:

1. Menargetkan dedicated inventory group dengan `serial: 1`.
2. Menggunakan `become: true` dan `gather_facts: false`.
3. Menjalankan preflight sebelum task yang mengubah state.
4. Job Template 13/14 memvalidasi tiga audit IDs sebagai string non-empty;
   fault, reset, dan status tidak menerima remediation audit payload.
5. Menggunakan Fully Qualified Collection Name.
6. Menghindari `ansible.builtin.shell` bila `command.argv` atau module tersedia.
7. Tidak memakai wildcard, `pkill`, atau arbitrary process matching.
8. Tidak memakai `ignore_errors` pada preflight, remediation, atau verification.
9. Bersifat idempotent: kondisi yang sudah pulih menghasilkan sukses tanpa
   perubahan berbahaya.
10. Membiarkan kegagalan aktual menghasilkan AAP job `failed`.
11. Mencatat before/after state dan durasi sebagai job evidence.

### Shared operation lock

`allow_simultaneous: false` harus diaktifkan pada setiap Job Template, tetapi
itu belum mencegah dua Job Template berbeda berjalan bersamaan. Tambahkan satu
shared host lock, misalnya direktori root-owned di `/run/lock/berca-poc-demo`.

Acquisition harus atomic dan gagal cepat jika lock dimiliki job lain. Simpan
`awx_job_id` dan waktu pada lock metadata. Release dilakukan dalam `always`
block. Sertakan bounded stale-lock handling untuk job yang pernah terputus;
jangan menghapus lock aktif secara buta.

### Pool fault Job Template

Required behavior:

1. Verifikasi disk fault tidak aktif.
2. Pastikan PostgreSQL dan PgBouncer sehat.
3. Verifikasi PgBouncer berada pada baseline `5/5`.
4. Start hanya Compose service `pool-hog` dengan profile `demo-fault`.
5. Poll sampai `sv_active>=5` dan `cl_waiting>0`.
6. Jika saturation gagal tercapai, stop pool-hog dan kembalikan baseline.
7. Repeated invocation saat fault sudah aktif menghasilkan idempotent success.

### Disk fault Job Template

Required behavior:

1. Verifikasi pool fault tidak aktif.
2. Buat exact 200 MB image `/tmp/poc-log-disk.img`.
3. Buat ext4 tanpa journal dan tanpa reserved blocks pada image tersebut.
4. Mount hanya ke `<poc_project_path>/docker/log-saturation/data` secara
   ephemeral.
5. Verifikasi source `/dev/loopN`, filesystem ext4, dan backing image exact.
6. Buat exact trigger `.trigger_saturation`.
7. Re-create hanya `log-generator` dan `datadog-agent` agar bind mount aktif.
8. Poll sampai disk `>=85%` dan backend impact marker tersedia.
9. Jika fault gagal tercapai, hentikan generator state dan pulihkan disk aman.
10. Repeated invocation saat fault valid sudah aktif menghasilkan idempotent
    success.

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

Reset final juga menggunakan native tasks:

1. Stop dan remove exact `pool-hog` service/container.
2. Pastikan PgBouncer hidup dan reset runtime config ke baseline `5/5` hanya
   bila nilainya berbeda.
3. Poll sampai tepat satu target pool row dan `cl_waiting=0`.
4. Verifikasi disk mount ownership sebelum menyentuh disk target.
5. Hapus exact trigger dan impact marker.
6. Stop hanya filesystem consumers.
7. Kosongkan exact saturation log.
8. Unmount POC mount secara ephemeral.
9. Detach hanya loop device dengan exact backing image.
10. Hapus image hanya setelah unmount dan detach terverifikasi.
11. Bangun baseline log directory dan readiness log.
12. Re-create `log-generator` dan `datadog-agent`.
13. Verifikasi health consumer, tidak ada mount/marker/trigger, pool `5/5`, dan
    `cl_waiting=0`.

Gunakan `block`, `rescue`, dan `always` agar semua cleanup stage yang aman tetap
dicoba dan shared lock selalu dilepas. Jangan menyembunyikan kegagalan kritis.

### Status playbook

Read-only status tasks mengumpulkan observed state untuk pool-hog, pool config,
`sv_active`, `cl_waiting`, mount source/fstype/backing image, disk usage,
trigger, marker, log size, dan container health. Publish hasil menggunakan
`ansible.builtin.set_stats` agar tersedia sebagai AAP job artifact.

## 9. Development dan emergency fallback

Final Job Template tidak memanggil script. Jika native playbook belum tersedia,
development Workflow 2 boleh memakai transport `direct_script` melalui Demo
Control API yang sudah dibatasi. Operator juga dapat memakai fixed commands
berikut secara manual untuk troubleshooting:

```text
<poc_project_path>/demo-control.sh pool
<poc_project_path>/demo-control.sh disk
<poc_project_path>/demo-control.sh recover-pool
<poc_project_path>/demo-control.sh recover-disk
<poc_project_path>/demo-control.sh reset
<poc_project_path>/demo-control.sh status
```

Fallback tidak aktif otomatis ketika AAP gagal. AAP failure harus menghasilkan
escalation agar demo tidak menyembunyikan kegagalan integrasi. Script tidak
menerima host, path, filename, SQL, pool size, atau arbitrary shell arguments.

## 10. Perubahan terhadap draft playbook sekarang

### Pool draft

Draft saat ini melakukan restart container PgBouncer. Ganti dengan native pool
recovery pada bagian 8. Container yang harus dihentikan adalah dedicated
`pool-hog`, bukan PgBouncer.

### Disk draft

Hapus `pkill`, wildcard truncate, path `/var/log/poc-saturation`, dan seluruh
`ignore_errors`. Implementasikan exact target validation dan native recovery
pada bagian 8.

### Reset draft

Ganti script wrapper dengan native reset tasks pada bagian 8, targetkan
dedicated inventory group, dan tambahkan independent post-reset verification.

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

Workflow 1 menggunakan fixed Pool Fault dan Disk Fault Job Template endpoints
yang diberikan owner Ansible. Kedua launch request tidak menerima action atau
target override. Reset menggunakan fixed Job Template 15 endpoint.

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
14. Workflow 1 pool menjalankan satu Pool Fault Job Template dan mencapai
    `sv_active>=5`, `cl_waiting>0`.
15. Workflow 1 disk menjalankan satu Disk Fault Job Template dan mencapai
    disk `>=85%` serta backend impact.
16. Pool dan disk fault tidak dapat aktif bersamaan.
17. Semua native actions memiliki parity terhadap observed results fallback
    script.

## 14. Definition of done

Handoff Ansible selesai setelah tersedia:

- AAP Project yang sinkron dengan repository playbook owner Ansible;
- dedicated Inventory dan Machine Credential untuk VM POC;
- Pool Fault, Disk Fault, dan Job Template 13/14/15 sesuai pembatasan dokumen
  ini;
- native autoscale/rollback, tiga Job Template memory, dan CVE remediation
  sesuai status serta acceptance gate pada handoff terkini;
- required audit surveys pada JT 13/14;
- satu reusable native Ansible role untuk fault, remediation, reset, dan status;
- positive dan negative test evidence;
- dua scoped Datadog service accounts/connections untuk fault control dan
  remediation;
- private connectivity dari Datadog Private Action Runner ke AAP;
- konfirmasi bahwa AAP status hanya execution evidence dan Datadog telemetry
  tetap menjadi final recovery authority.

Status lintas keenam skenario, kontrak launch, dan daftar file handoff berada
di [`load-test/datadog/ANSIBLE-HANDOFF.md`](../load-test/datadog/ANSIBLE-HANDOFF.md).

## 15. Native storefront scale-out playbooks

Implementasi native tersedia untuk menggantikan transport Demo Control API pada
[`load-test/AUTOSCALE-POC.md`](../load-test/AUTOSCALE-POC.md):

| Job Template | Native outcome |
|---|---|
| `fault-autoscale.yml` | Pastikan baseline satu replica sehat, lalu start fixed `traffic-spike` pada rate dari protected Inventory |
| `recover-autoscale.yml` | Pastikan Traefik dan spike aktif, lalu scale Compose service `storefront` dari tepat 1 menjadi tepat 2 replica dan tunggu keduanya healthy |

Kedua playbook menggunakan Inventory, Machine Credential, absolute project
path, service name, dan replica count yang fixed di Ansible. Datadog tidak
mengirim `host`, `compose_path`, `service`, `replica_count`, command, atau
shell argument. Template menolak pool/disk fault aktif dan concurrent run.

Datadog mempertahankan policy `env:poc`, capacity-pressure monitor, Slack
Approve/Reject, serta verification p95/error/health. AAP success hanya
execution evidence; tidak menggantikan verification telemetry Datadog.

## 16. Native storefront deployment rollback playbooks

Implementasi native tersedia untuk menggantikan transport fallback API pada
[`load-test/DEPLOYMENT-ROLLBACK-POC.md`](../load-test/DEPLOYMENT-ROLLBACK-POC.md):

| Job Template | Native outcome |
|---|---|
| `fault-rollback.yml` | Recreate exactly one storefront replica with the pre-approved demo-bad GHCR digest and verify the bounded catalog `503` regression |
| `recover-rollback.yml` | Recreate exactly one storefront replica with the pre-approved stable GHCR digest and wait for Docker health plus catalog `200` |

The VM inventory/configuration owns the GHCR repository, stable digest, release
version, Compose path, and registry credential. Datadog sends only audit IDs;
it must not send an image, digest, tag, registry, host, path, command, or
arbitrary extra variable. Both templates refuse pool/disk fault, autoscale
spike, non-POC environment, or concurrent execution.

Datadog keeps the generic deployment-regression monitor, Slack approval, and
telemetry verification: stable `DD_VERSION`, `/api/healthz` and `/id/store`
healthy, p95 normal, and error rate safe. AAP success remains execution
evidence only.

## 17. RHEL vulnerability remediation (separate SecOps workflow)

Vulnerability remediation tidak menjadi branch pada autonomous application
workflow. Datadog memakai workflow terpisah
[`load-test/soar.json`](../load-test/soar.json) untuk query finding, prioritas,
policy gate, approval, dispatch, dan verification.

Suite Ansible tersedia di [`cve_playbooks/`](cve_playbooks/) dengan panduan
setup pada
[`cve_playbooks/IMPLEMENTATION-GUIDE.md`](cve_playbooks/IMPLEMENTATION-GUIDE.md).
Status saat ini: Datadog SOAR sudah teruji sampai notifikasi, tetapi launch AAP,
polling job, patching, host validation, rescan, dan resolved finding belum
dianggap lulus end-to-end.

Job Template remediation menerima hanya enam required survey variables:

```yaml
advisory_id: <allowlisted RHSA>
package_name: <allowlisted package>
cve_id: <Datadog CVE ID>
severity: high | critical
finding_id: <Datadog finding ID>
approval_reference: <Datadog workflow instance ID>
```

Inventory host, repository, RHSA/package allowlist, restart allowlist, reboot
policy, dan fixed package yang tersedia tetap ditentukan oleh Ansible. Nilai
`fixed_version` dari Datadog hanya evidence pada approval dan tidak boleh
diinterpolasi langsung menjadi command DNF.

Untuk formal demo, reset utama adalah Nutanix snapshot restore diikuti
`rhel96-cve-reset-check.yml`. `rhel96-cve-rollback.yml` adalah opsi lab-only dan
tidak boleh menjadi jalur rollback production. Sebelum handoff dinyatakan
selesai, tim Ansible harus mengonfirmasi advisory aktual pada VM, fail-safe
preflight, validation setelah service restart, scoped AAP token, dan Job
Template ID kepada owner Datadog.
