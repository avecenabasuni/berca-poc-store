# AI-Driven Autonomous Remediation with Datadog and Red Hat Ansible

> Ringkasan proyek untuk bahan slide deck dan live sales demo.  
> Status: POC terkontrol untuk lingkungan Lab — bukan desain production-grade.

## Executive summary

Berca Store adalah aplikasi e-commerce berbasis Medusa yang dipakai sebagai
lingkungan demo. POC ini memperlihatkan bagaimana Datadog mendeteksi degradasi
layanan backend, memakai Bits Investigation untuk membantu diagnosis, memilih
respons yang sudah disetujui, lalu memicu Red Hat Ansible Automation Platform
(AAP) untuk remediasi terkontrol. Datadog memverifikasi recovery dari
telemetry, bukan hanya dari status job Ansible.

Nilai untuk pelanggan:

- mempercepat deteksi dan remediasi incident berulang;
- mengurangi keputusan manual saat layanan terdegradasi;
- membatasi automation pada katalog tindakan yang telah disetujui;
- menggabungkan observability, AI-assisted investigation, workflow, dan
  infrastructure automation dalam closed loop yang dapat diaudit.

> Datadog mengamati dan mendiagnosis, Workflow memilih respons yang diizinkan,
> Ansible mengeksekusi, dan Datadog membuktikan hasilnya.

## Hero story

Judul demo: **AI-Driven Autonomous Remediation with Datadog and Red Hat Ansible**.

Narasi bisnisnya adalah **Berca Backend Service Degraded**: dari perspektif
user, aplikasi e-commerce lambat, checkout dapat timeout, atau health check
backend gagal. Setiap demo menjalankan satu fault saja, bukan combined fault.

```text
Detect → Investigate → Diagnose → Select approved response → Execute
→ Verify → Recover or escalate safely
```

## Arsitektur POC

```text
User / presenter
  → Berca Storefront (Next.js, :8000)
  → Berca Backend (Medusa, :9000)
  → PgBouncer (:6432, baseline pool 5/5)
  → PostgreSQL (:5432)

Redis (:6379) mendukung aplikasi
Traffic generator menjalankan sesi storefront dan guest checkout
Datadog Agent mengumpulkan APM, logs, container, DBM, pool, disk, dan health
```

| Komponen | Peran dalam demo |
|---|---|
| `medusa` | Hero service `berca-backend` |
| `storefront` | Frontend Next.js, service `berca-storefront` |
| `pgbouncer` | Connection pool yang disaturasi pada skenario pool |
| `postgres` | Database commerce dan DBM telemetry |
| `redis` | Dependency aplikasi |
| `traffic-generator` | k6 workload organik dan real guest order |
| `traefik` | Edge proxy untuk use case approval-gated storefront scale-out |
| `traffic-spike` | Generator SSR capacity spike opt-in untuk autoscaling demo |
| `pool-hog` | Fault generator pool opt-in, tidak jalan di baseline |
| `log-generator` | Fault generator log synthetic opt-in |
| `datadog-agent` | APM, metrics, logs, DBM, Autodiscovery, HTTP health |

Tag utama:

```text
env:poc
service:berca-backend
service:berca-storefront
service:berca-traffic-generator
resource_id:pgbouncer-demo
resource_id:synthetic-log-volume
```

## Pengalaman aplikasi dan workload

Guest purchase flow yang dapat didemokan:

```text
Homepage → katalog → detail produk → cart → checkout → order confirmation
```

Storefront berjalan sebagai Next.js production server (`next start`), bukan
`next dev`, agar on-demand compilation tidak memblokir Node.js event loop.
Health check menggunakan `/api/healthz`, sehingga tidak merender homepage atau
memanggil backend setiap interval.

Traffic generator menjalankan workload hybrid: halaman storefront diakses
seperti user, sedangkan mutation cart/checkout memakai Medusa Store API agar
tetap stabil dan deterministic.

| Journey | Proporsi |
|---|---:|
| Homepage bounce | 30% |
| Browse katalog/produk | 25% |
| Tambah cart lalu abandon | 20% |
| Update/remove cart lalu abandon | 10% |
| Abandon setelah alamat | 8% |
| Abandon setelah shipping/payment | 3% |
| Guest checkout selesai | 2% |
| Expected invalid request | 2% |

Satu guest checkout juga dijamin selesai tiap lima menit. Checkout hanya
dianggap sukses bila Medusa mengembalikan `type=order` dan order ID; HTTP 400
dan pembuatan payment collection bukan checkout sukses. Order POC dipertahankan
agar dapat terlihat di Medusa Admin dan Datadog.

## Dua fault yang didemokan secara terpisah

### 1. PgBouncer connection pool exhaustion

`pool-hog` membuka 25 client lewat PgBouncer. Konfigurasi pool tetap baseline
`5/5`, sehingga backend connection penuh dan client mengantre.

```text
Acceptance fault: sv_active >= 5, cl_waiting > 0, latency/error backend naik
Approved recovery: stop dedicated pool-hog, pertahankan 5/5, cl_waiting = 0
```

### 2. Synthetic disk log saturation

Log generator hanya mengisi loopback ext4 POC 200 MB yang dipasang sebagai
`/var/log/poc-app`. Ini adalah coordinated synthetic fault injection, bukan
klaim bahwa pertumbuhan log organik datang dari traffic checkout.

```text
Acceptance fault: disk sekitar 85%, log growth positif, backend health = 503
Approved recovery: validate target POC, stop trigger, remove impact marker,
truncate only app-saturation.log, sync, disk <20%, growth = 0, health = 200
```

Kedua fault tidak boleh aktif bersamaan.

### Use case tambahan: approval-gated storefront scale-out

Use case capacity ini berdiri sendiri dari fault pool/disk. Traffic spike yang
terkontrol meningkatkan request storefront; Datadog meminta approval Slack
sebelum Demo Control API menskalakan storefront dari satu menjadi dua replica
di belakang Traefik. Datadog kemudian memverifikasi latency, error rate, health,
dan dua replica sehat. Reset selalu mengembalikan ke satu replica.

## Closed-loop automation

```text
Generic Berca Backend Service Degraded monitor ALERT
  → Datadog Bits Investigation
  → Read validated conclusions[]
  → bounded classification: POOL | DISK | UNKNOWN
  → fixed approved action catalog
  → launch fixed AAP Job Template
  → poll terminal job status
  → query Datadog telemetry
  → success atau safe escalation
```

### Detection dan diagnosis

Monitor utama hanya mendeteksi dampak layanan, bukan mengasumsikan root cause:

```text
backend latency tinggi
OR backend error rate >10%
OR backend health check gagal
```

Bits Investigation kemudian memakai telemetry APM, logs, PgBouncer, disk, dan
health untuk membantu diagnosis. Karena `conclusions[]` bersifat experimental,
harus ada validation spike pada tenant Datadog untuk merekam schema aktual
sebelum classifier Workflow dipublikasikan.

| Hasil investigation | Klasifikasi | Tindakan |
|---|---|---|
| PgBouncer/pool/client waiting/exhaustion | `POOL` | Remediasi pool approved |
| Disk/filesystem/storage/log saturation | `DISK` | Remediasi disk approved |
| Empty, timeout, gagal, ambigu, atau mixed | `UNKNOWN` | Tidak ada perubahan; escalation |

AI tidak pernah menghasilkan command, host, path, SQL, pool size, atau
playbook. Ia hanya membantu memilih kategori dalam katalog yang dibatasi.

## Peran Datadog dan Red Hat Ansible

| Komponen | Tanggung jawab |
|---|---|
| Datadog Observability | APM, metrics, logs, DBM, pool/disk telemetry, health monitor |
| Datadog Workflow Automation | Trigger, Bits polling, classification, fixed dispatch, verification, escalation |
| Datadog Bits Investigation | Conclusion untuk diagnosis POOL/DISK/UNKNOWN |
| Red Hat AAP | Menjalankan Job Template dengan inventory dan credentials owner Ansible |
| Owner Ansible | Final roles/tasks, playbooks, Inventory, RBAC, idempotency, reset |
| Repository aplikasi | Fault target, expected recovery, telemetry, fallback script/API, dokumentasi |

### Integrasi final: Datadog langsung ke AAP

Untuk minimal hero demo, Datadog Workflow Automation langsung memanggil
Automation Controller REST API. Event-Driven Ansible bukan dependency demo ini.

| Job Template | Fungsi |
|---:|---|
| 13 | Pool remediation |
| 14 | Disk remediation |
| 15 | Full reset |
| `<POOL_FAULT_JT_ID>` | Pool fault — disediakan owner Ansible |
| `<DISK_FAULT_JT_ID>` | Disk fault — disediakan owner Ansible |

Datadog hanya mengirim audit identifiers melalui `extra_vars`:

```json
{
  "extra_vars": {
    "monitor_id": "<DATADOG_MONITOR_ID>",
    "investigation_id": "<BITS_INVESTIGATION_ID>",
    "workflow_instance_id": "<DATADOG_WORKFLOW_INSTANCE_ID>"
  }
}
```

Host, path, command, SQL, pool size, playbook, credential, dan inventory tidak
boleh datang dari Datadog. Semua melekat pada AAP Inventory, Job Template, dan
implementation yang dimiliki team Ansible.

## Demo Control adalah fallback, bukan jalur final

VM Linux menyediakan interface deterministic:

```bash
./demo-control.sh status
./demo-control.sh pool
./demo-control.sh recover-pool
./demo-control.sh disk
./demo-control.sh recover-disk
./demo-control.sh start-storefront-spike
./demo-control.sh stop-storefront-spike
./demo-control.sh scale-storefront-to-2
./demo-control.sh reset-storefront-scale
./demo-control.sh reset
```

Demo Control API juga menyediakan action enum tetap dengan token scope terpisah
untuk fault dan remediation. API menolak arbitrary argument dan menjalankan
job asynchronous.

Namun jalur final memakai native Ansible role/tasks. `demo-control.sh` dan API
hanya untuk development, integration testing, dan emergency break-glass;
final Job Template tidak memanggil script tersebut.

## Recovery harus dibuktikan oleh telemetry

Status HTTP 2xx, AAP job `successful`, atau script exit code hanya membuktikan
eksekusi. Workflow hanya menyatakan sukses bila Datadog menunjukkan recovery.

| Skenario | Recovery yang harus terbukti |
|---|---|
| Pool | `cl_waiting=0`, PgBouncer tetap 5/5, latency normal, error <10%, health OK |
| Disk | disk <20%, synthetic log growth=0, latency normal, error <10%, health OK |
| Unknown | Tidak ada remediation; workflow gagal aman dan escalation |

Setelah execution selesai, Workflow menunggu 30 detik kemudian melakukan
maksimum tiga telemetry check dengan interval 15 detik. Tidak ada retry ladder
atau fallback otomatis pada incident aktif.

## Urutan live demo

1. Tunjukkan storefront, checkout/order nyata, Datadog dashboard, dan baseline OK.
2. Presenter menjalankan Workflow 1 manual: `pool`, `disk`, atau `reset`.
3. Tunjukkan service impact pada backend telemetry.
4. Tunjukkan Bits Investigation dan hasil classification.
5. Tunjukkan fixed approved AAP Job Template yang dipilih Workflow.
6. Tunjukkan recovery dari Datadog: queue/disk/health/latency/error pulih.
7. Tutup dengan governance: `UNKNOWN` tidak mengubah resource dan diescalate.

Untuk sesi sales, gunakan satu fault utama (umumnya pool), reset, kemudian
jika perlu demo disk sebagai skenario kedua yang independen.

## Scope dan guardrails

Termasuk:

- dua fault deterministic yang terpisah;
- satu scale-out storefront `1 -> 2` dengan Slack approval;
- traffic e-commerce organik dan guest checkout nyata;
- generic monitor, Bits investigation, bounded classifier;
- Datadog Workflow ke AAP, telemetry verification, safe escalation;
- storefront production-ready untuk dipresentasikan.

Sengaja tidak termasuk:

- combined/random fault, scheduler, production soak test, dan HA;
- AI-generated command atau playbook;
- final EDA Rulebook/Decision Environment;
- Configuration as Code penuh, retry ladder, approval flow, Incident/Case otomatis;
- production credential architecture dan multi-environment design.

## Status dan dependency eksternal

Sudah tersedia di repository:

- Dockerized Medusa, storefront production, PgBouncer, PostgreSQL, Redis,
  traffic/log generator, dan Datadog Agent;
- pool-hog, synthetic loopback disk scenario, deterministic reset/recovery fallback;
- traffic journey dengan real guest checkout;
- Datadog Workflow contract dan Ansible handoff specification;
- Indonesian guest storefront dan checkout dengan shared visual system;
- prebuilt Medusa Admin untuk menghindari Vite dev-mode compilation di backend.

Masih perlu dikonfigurasi atau divalidasi di Lab:

- actual APM resource names, baseline latency, monitor IDs, dan metric tags;
- Bits availability, permission, duration, serta schema aktual `conclusions[]`;
- Datadog Connections, token, Query Scalar action, dan notification handle;
- final AAP Inventory, Machine Credential, RBAC, native Ansible implementation,
  serta Job Template fault;
- network/TLS connectivity, end-to-end repetition, dan visual UI validation di VM.

Secrets tidak disimpan di Git: Datadog keys/tokens, VM address, TLS material,
AAP credential, connection settings, dan notification destination.

## Rekomendasi struktur slide deck

| Slide | Judul | Pesan utama |
|---:|---|---|
| 1 | AI-Driven Autonomous Remediation | Datadog + Red Hat Ansible untuk closed-loop operations |
| 2 | Business problem | Incident manual memperlambat recovery layanan customer-facing |
| 3 | Solution principle | Observe → Investigate → Approved response → Automate → Verify |
| 4 | Berca demo environment | Storefront, backend, database, traffic, dan observability |
| 5 | Realistic customer workload | User storefront dan guest checkout memberikan service demand |
| 6 | Three controlled use cases | Pool, synthetic disk, dan approval-gated storefront scale-out |
| 7 | Datadog detection and Bits | Monitor generic, telemetry context, bounded diagnosis |
| 8 | Automation governance | POOL/DISK/UNKNOWN, tanpa arbitrary AI command |
| 9 | Datadog-to-AAP handoff | Fixed Job Templates dan payload audit minimal |
| 10 | Telemetry-based recovery | Job sukses saja tidak cukup; Datadog membuktikan recovery |
| 11 | Live demo walkthrough | Baseline → fault → investigate → remediate → verify → reset |
| 12 | Business value and next steps | Faster response, safer automation, repeatable operating model |

## Dokumen sumber

- [`load-test/UNIFIED-POC.md`](load-test/UNIFIED-POC.md) — runbook dan validasi teknis POC.
- [`load-test/datadog/WORKFLOW-CONTRACT.md`](load-test/datadog/WORKFLOW-CONTRACT.md) — konfigurasi Datadog Workflow.
- [`ansible/README.md`](ansible/README.md) — spesifikasi untuk owner Ansible dan AAP handoff.
- [`load-test/datadog/ANSIBLE-HANDOFF.md`](load-test/datadog/ANSIBLE-HANDOFF.md) — kontrak ringkas Datadog ke Ansible.
- [`load-test/AUTOSCALE-POC.md`](load-test/AUTOSCALE-POC.md) — runbook autoscaling storefront dengan Slack approval.
