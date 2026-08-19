# POC Memory Hot-Add pada VM Aplikasi Berca

Dokumen ini adalah runbook implementasi dan handoff untuk skenario keenam:
vertical scaling RAM pada VM Nutanix yang menjalankan Docker Compose Berca.
Skenario ini tidak mencakup CPU hot-add dan tidak boleh dijalankan bersamaan
dengan pool, disk, autoscale, rollback, atau vulnerability remediation.

## Cerita demo

```text
VM aplikasi Berca pada baseline 16 GiB
  -> AAP menjalankan bounded synthetic memory pressure
  -> usable memory turun dan berca-backend mengalami degradation
  -> monitor generik Berca Backend Service Degraded menjadi ALERT
  -> Bits Investigation mengumpulkan telemetry
  -> bounded classifier memilih MEMORY_PRESSURE atau UNKNOWN
  -> deterministic policy gate
  -> Slack Approve / Reject
  -> AAP hot-add RAM Nutanix 16 -> 24 GiB
  -> pressure tetap aktif
  -> Datadog memverifikasi kapasitas dan service recovery
  -> presenter stop pressure dan menjalankan reset 24 -> 16 GiB
```

Value yang ditunjukkan kepada customer:

- Datadog mendeteksi dampak ke service, bukan sekadar angka RAM tinggi.
- Bits menghubungkan service degradation dengan host memory pressure.
- Workflow hanya memilih tindakan dari katalog yang sudah disetujui.
- Human approval tetap menjadi guardrail sebelum perubahan VM.
- Ansible menjalankan perubahan Nutanix yang deterministic dan idempotent.
- Datadog, bukan status job AAP, menentukan bahwa recovery berhasil.

## Artefak repository

| Artefak | Fungsi |
|---|---|
| `docker-compose.yml` | Service opt-in `memory-pressure` pada profile `memory-demo` |
| `load-test/memory-pressure/Dockerfile` | Image lokal berisi low-CPU memory holder khusus POC |
| `load-test/memory-pressure/memory-holder.c` | Mengalokasikan, mengunci, dan menyentuh RAM sekali lalu tidur |
| `load-test/memory-pressure/entrypoint.sh` | Validasi enum alokasi, baseline host, safety floor, timeout, dan cgroup limit |
| `demo-control.sh memory` | Development fallback untuk memulai fixed memory fault |
| `demo-control.sh reset` | Canonical reset yang juga menghentikan fixed memory fault |
| `demo-control.sh status` | Evidence read-only RAM host dan status pressure container |
| `load-test/scenario-controller.json` | Manual launch `memory`, canonical `reset`, dan `reset-memory` untuk scale-down Nutanix |
| `load-test/remediation-apps.json` | Bits classification, policy, approval, hot-add dispatch, dan verification |

AAP tetap menjadi execution path final. Selama integrasi AAP belum selesai,
`demo-control.sh` dan Demo Control API menyediakan development fallback untuk
fault `memory` dan canonical `reset`. Keduanya menggunakan fixed action dan
tidak menerima byte allocation, host, path, atau argument dari request.

Fallback tidak menjalankan hot-add atau scale-down Nutanix. Untuk pengujian
sementara, perubahan 16/24 GiB dilakukan manual melalui Prism. Credential dan
operasi hypervisor tidak ditempatkan di shell guest VM. Setelah AAP tersedia,
owner Ansible menggantikan langkah manual tersebut tanpa mengubah fault,
classification, policy, atau verification Datadog.

## Konfigurasi VM

Tambahkan nilai yang sudah dikalibrasi ke `.env` pada VM. File tersebut tidak
boleh di-commit.

```text
MEMORY_PRESSURE_BYTES=8192M
MEMORY_PRESSURE_LIMIT=8448M
```

Nilai di atas adalah titik awal kalibrasi untuk VM Lab yang secara empiris
memiliki sekitar 12 GiB `MemAvailable` pada baseline. Nilai live-demo final
belum boleh dipilih sebelum pengukuran bertahap selesai.

Nilai yang diizinkan:

| Allocation | Required limit |
|---:|---:|
| `512M` | `768M` |
| `768M` | `1024M` |
| `1024M` | `1280M` |
| `1280M` | `1536M` |
| `1536M` | `1792M` |
| `4096M` | `4352M` |
| `6144M` | `6400M` |
| `8192M` | `8448M` |
| `9216M` | `9472M` |
| `9728M` | `9984M` |
| `10240M` | `10496M` |

Entrypoint menolak nilai lain dan memverifikasi limit cgroup tepat 256 MiB di
atas allocation. Holder memakai `mmap`, `mlock`, menyentuh setiap memory page
sekali, lalu tidur. Dengan begitu alokasi tetap resident tanpa loop CPU seperti
yang terjadi pada `stress-ng --vm`. Service memiliki timeout 20 menit,
`oom_score_adj=1000`, `restart: no`, tanpa network, port, atau Docker socket.
Capability tunggal `IPC_LOCK` hanya digunakan agar fixed allocation dapat
dikunci; cgroup tetap menjadi hard limit container.

Entrypoint juga menolak start bila guest tidak berada pada profil baseline
16 GiB atau bila fixed allocation diproyeksikan menyisakan kurang dari 1,5 GiB
`MemAvailable`. Guard ini melengkapi, bukan menggantikan, preflight AAP.

Build image sebelum demo:

```bash
docker compose --profile memory-demo build memory-pressure
docker compose --profile memory-demo config
```

Normal `docker compose up -d` tidak menjalankan service karena profile-nya
tidak aktif.

Development fallback lokal:

```bash
sudo ./demo-control.sh memory
sudo ./demo-control.sh status
sudo ./demo-control.sh reset
```

Demo Control API memakai fault token yang sama dengan scenario fault lain:

```http
POST /v1/demo/action
Authorization: Bearer <DEMO_CONTROL_FAULT_TOKEN>
Content-Type: application/json

{"action":"memory"}
```

Penghentian pressure memakai canonical payload `{"action":"reset"}`; tidak ada
action `stop-memory` terpisah. Remediation token ditolak untuk kedua action
fault tersebut. `GET /v1/demo/status` tetap menerima salah satu token dan
mengekspos state memory yang diamati.

## Kalibrasi yang aman

Kalibrasi hanya dilakukan di VM Lab saat seluruh skenario lain berhenti.

1. Pastikan VM berada di profil 16 GiB dan seluruh container sehat.
2. Pastikan `MemAvailable` minimal 2.5 GiB sebelum setiap percobaan.
3. Berdasarkan pengukuran aktual VM (`MemAvailable` sekitar 12 GiB), mulai dari
   `8192M`, lalu uji `9216M`, `9728M`, dan terakhir `10240M` bila diperlukan.
   Jangan melompat langsung ke nilai terakhir.
4. Pada setiap perubahan, sesuaikan `MEMORY_PRESSURE_LIMIT` agar selalu 256 MiB
   di atas allocation dan rebuild/recreate service.
5. Jalankan fault maksimal tiga menit untuk observasi awal.
6. Pilih nilai terkecil yang membuat `system.mem.pct_usable < 0.15` dan backend
   p95 melewati threshold, sementara SSH, Agent, dan container tetap sehat.
7. Jangan melampaui `10240M`; entrypoint tetap harus menyisakan safety floor
   1,5 GiB sebelum menerima alokasi.
8. Stop dan hapus container sebelum percobaan berikutnya.

Command operator untuk kalibrasi saja:

```bash
docker compose --profile memory-demo up -d memory-pressure
docker compose --profile memory-demo ps memory-pressure
docker stats --no-stream berca_poc_memory_pressure
free -h
sudo ./demo-control.sh status
docker compose --profile memory-demo rm -sf memory-pressure
```

Jika kernel mulai melakukan OOM kill, SSH/Agent tidak responsif, atau container
aplikasi restart, hentikan percobaan dan turunkan allocation. Nilai tersebut
tidak boleh digunakan untuk live demo.

Completion gate setiap langkah kalibrasi:

- holder stabil dengan CPU mendekati idle setelah initial allocation;
- tidak ada OOM/restart pada backend, storefront, Agent, atau database;
- SSH dan Docker tetap responsif;
- nilai final adalah allocation terkecil yang menghasilkan
  `system.mem.pct_usable <0.15` dan service impact yang dapat diulang.

## Status contract

`demo-control.sh status` dan authenticated `GET /v1/demo/status` menyediakan:

```json
{
  "memory_pressure_active": true,
  "memory_pressure_state": "active",
  "memory_total_bytes": 17179869184,
  "memory_available_bytes": 2147483648,
  "memory_usable_fraction": 0.125,
  "memory_profile": "baseline_16g"
}
```

Profile menggunakan toleransi guest-reported RAM:

- `baseline_16g`: 15-17 GiB terlihat oleh kernel;
- `target_24g`: 23-25 GiB terlihat oleh kernel;
- selain itu: `unexpected`.

Toleransi diperlukan karena `MemTotal` Linux biasanya sedikit lebih kecil dari
kapasitas virtual yang dikonfigurasi Nutanix.

## Konfigurasi Datadog

Gunakan monitor generik yang sama:

```text
POC - Berca Backend Service Degraded
```

Monitor hanya dipicu pada transisi `ALERT` dan tidak menyebut memory sebagai
root cause. Threshold dikalibrasi dari baseline:

```text
backend p95 > max(1.5 x calibrated baseline, 1 second)
OR backend error rate > 10%
OR backend health check failed
```

Pastikan Bits dapat melihat telemetry host berikut pada host VM aplikasi yang
sama:

```text
system.mem.total
system.mem.usable
system.mem.pct_usable
system.mem.used
system.swap.used
system.swap.swap_in
system.swap.swap_out
```

Metric memory merupakan investigation evidence, bukan monitor trigger tunggal.
Jangan mengaktifkan workflow dari monitor memory terpisah.

## Scenario controller

`load-test/scenario-controller.json` menambahkan input enum:

```text
memory
reset-memory
reset
```

Mapping fixed:

| Input | Fixed execution path |
|---|---|
| `memory` | Demo Control API `memory` selama fallback; AAP fault template pada integrasi final |
| `reset` | Demo Control API canonical `reset`, termasuk menghentikan pressure |
| `reset-memory` | Restore Application VM Memory Baseline |

Hanya `reset-memory` yang masih memakai Job Template ID `0` sebagai fail-safe
placeholder sampai owner Ansible menyediakan scale-down Nutanix. Jangan
mengganti endpoint menjadi input workflow atau membentuk ID dari event.

`reset-memory` adalah satu orchestration Job Template yang wajib melakukan
urutan stop pressure, restore 16 GiB, lalu verifikasi baseline. Dengan begitu
presenter hanya membutuhkan satu tombol reset.

## Autonomous remediation workflow

`load-test/remediation-apps.json` menambahkan root cause
`MEMORY_PRESSURE`. Classification hanya actionable bila confidence minimal
`0.8`, `safe_to_remediate=true`, serta memory menjadi bottleneck dominan.
Evidence campuran, vulnerability, atau diagnosis tidak pasti menghasilkan
`UNKNOWN` dan tidak mengubah VM.

Memory policy gate membaca status VM tepat sebelum approval dan mewajibkan:

- environment `poc`;
- root cause `MEMORY_PRESSURE`;
- profile `baseline_16g`;
- pressure container masih aktif;
- usable memory di bawah 15%;
- tidak ada pool, disk, autoscale, atau deployment scenario aktif;
- Docker, PgBouncer, storefront, dan Traefik masih dapat diobservasi.

Approval menampilkan RAM sebelum perubahan, usable memory, diagnosis, dan fixed
target `application_vm_memory_24g`.

Endpoint `Remediate_Memory_AAP` juga memakai Job Template ID `0` sebagai
placeholder. Ganti hanya URL fixed tersebut setelah menerima ID final.

Payload launch:

```json
{
  "extra_vars": {
    "schema_version": "1.0",
    "environment": "poc",
    "service": "berca-backend",
    "classification": "MEMORY_PRESSURE",
    "requested_action": "hot_add_memory",
    "target_profile": "application_vm_memory_24g",
    "monitor_id": "<MONITOR_ID>",
    "investigation_id": "<INVESTIGATION_ID>",
    "workflow_instance_id": "<WORKFLOW_INSTANCE_ID>"
  }
}
```

VM UUID, Nutanix endpoint, cluster, credential, RAM byte value, dan Compose path
tidak datang dari Datadog.

Setelah job AAP `successful`, Workflow menunggu 30 detik lalu poll maksimal 12
kali dengan interval 15 detik. Rolling monitor yang masih `ALERT` tidak gagal
langsung; Workflow menunggu sampai window habis. Verification lulus bila:

- monitor pemicu sudah `OK`;
- profile memory guest adalah `target_24g`;
- guest melihat minimal 23 GiB, yang mewakili konfigurasi virtual 24 GiB;
- usable memory di atas 30%;
- pressure container tetap aktif;
- storefront dan Traefik sehat;
- `https://store.bercalab.my.id/id/store` memberi HTTP 200.

HTTP launch dan status AAP hanya execution evidence. Keduanya tidak cukup untuk
menandai recovery.

## Handoff owner Ansible

Owner Ansible menyediakan empat fixed Job Templates:

1. `Inject Application VM Memory Pressure`.
2. `Stop Application VM Memory Pressure`.
3. `Hot Add Application VM Memory to 24 GiB`.
4. `Restore Application VM Memory Baseline`.

Semua template harus memakai inventory VM aplikasi yang tetap,
`allow_simultaneous=false`, Machine Credential yang sesuai, dan shared scenario
lock. Tidak ada survey untuk host, VM UUID, memory size, Compose path, service,
atau target profile.

Expected behavior:

- Inject melakukan preflight 16 GiB, `MemAvailable >=2.5 GiB`, service health,
  dan conflict detection sebelum menjalankan hanya profile `memory-demo`.
- Stop menghapus hanya service `memory-pressure` dan bersifat idempotent.
- Hot-add memanggil Nutanix API/module untuk VM UUID yang dikunci, tidak
  menghentikan pressure, dan no-op bila VM sudah 24 GiB.
- Restore menolak scale-down jika pressure masih aktif, mengubah hanya 24 ke
  16 GiB, lalu menunggu guest, SSH, Agent, dan stack sehat.
- Setiap job mengembalikan before/after guest RAM serta Nutanix task ID sebagai
  evidence yang tidak mengandung credential.
- Repeated execution tidak pernah menaikkan RAM melewati 24 GiB.

Nutanix credential, VM UUID, Prism endpoint, baseline/target byte value, dan
Compose project path disimpan di AAP Inventory/Credential, bukan Git atau
Datadog payload.

## Live demo runbook

### Preflight

1. Pastikan seluruh scenario lain inactive.
2. Pastikan VM baseline 16 GiB dan `MemAvailable >=2.5 GiB`.
3. Pastikan image `berca-memory-pressure:local` sudah dibangun.
4. Pastikan Datadog Agent mengirim host memory metrics dari VM, bukan memory
   container Agent.
5. Pastikan generic backend monitor `OK`.
6. Pastikan keempat Job Template AAP dan endpoint Workflow sudah menggunakan ID
   final, bukan `0`.
7. Pastikan custom Bits Agent menerima `MEMORY_PRESSURE` sebagai allowed output.

### Demo

1. Presenter menjalankan scenario `memory`.
2. Tunjukkan pressure container aktif dan usable RAM turun.
3. Tunjukkan dampak pada `berca-backend` dan monitor berubah `ALERT`.
4. Tunjukkan Bits evidence dan classification `MEMORY_PRESSURE`.
5. Tunjukkan policy gate dan Slack approval target `16 -> 24 GiB`.
6. Approve satu kali.
7. Tunjukkan Nutanix task dan AAP job berjalan sementara pressure tetap aktif.
8. Tunjukkan `system.mem.total` naik, usable RAM pulih, dan backend monitor
   kembali `OK`.
9. Tunjukkan Workflow selesai hanya setelah telemetry verification lulus.

### Reset

1. Jalankan scenario `reset` untuk menghentikan pressure dan membersihkan state POC.
2. Jalankan `reset-memory` untuk scale-down Nutanix dari 24 GiB ke 16 GiB.
3. Jalankan `reset` sekali lagi untuk verifikasi canonical baseline.
4. Pastikan pressure container hilang sebelum scale-down.
5. Pastikan guest kembali ke profile `baseline_16g`.
6. Pastikan seluruh container, Agent, storefront, dan backend sehat.
7. Pastikan monitor kembali `OK` sebelum siklus berikutnya.

Jika VM masih berada pada profile 24 GiB, canonical `reset` sengaja melaporkan
baseline belum lengkap setelah pressure dihentikan. Selesaikan `reset-memory`,
lalu jalankan `reset` kembali untuk memperoleh verifikasi baseline penuh.

## Acceptance criteria

- Tidak ada aplikasi atau Agent yang OOM/restart.
- Service impact terdeteksi maksimal tiga menit setelah fault dimulai.
- Fault type tidak diberikan ke autonomous remediation Workflow.
- Bits memilih `MEMORY_PRESSURE` hanya dengan evidence yang cukup.
- Tepat satu fixed hot-add Job Template diluncurkan setelah approval.
- Datadog menunjukkan transisi kapasitas 16 ke 24 GiB.
- Recovery dibuktikan saat pressure masih aktif.
- Reject, `UNKNOWN`, policy blocked, AAP failure, dan verification timeout tidak
  menjalankan perubahan tambahan.
- Reset mengembalikan VM ke 16 GiB dan stack sehat.
- Tiga siklus dapat dijalankan tanpa rebuild atau perbaikan manual.
