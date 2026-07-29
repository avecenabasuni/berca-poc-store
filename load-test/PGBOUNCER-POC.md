# POC: PgBouncer Saturation yang Terbaca oleh Monitor 5 Menit

## 1. Ringkasan & Tujuan

POC ini dikembangkan khusus untuk mendemonstrasikan **pola kejenuhan database connection pooler (PgBouncer)** secara deterministik yang bertahan selama **8 menit** (480 detik).

Durasi 8 menit memberikan window evaluasi yang cukup untuk Datadog Monitor dengan agregasi `avg(last_5m)` untuk mendeteksi kondisi pool jenuh dan antrean klien secara stabil tanpa fluktuasi sementara.

### Poin Kunci Desain:
- **PgBouncer** bertindak sebagai pooler database perantara dengan batas koneksi backend `default_pool_size=5` dan `max_db_connections=5`.
- **Medusa Backend** tetap terhubung langsung ke PostgreSQL dan **TIDAK diubah** (`DATABASE_URL` & `databaseDriverOptions.pool` tetap terisolasi).
- **Pgbench Runner** menjalankan 25 klien paralel langsung ke PgBouncer tanpa mengubah data aplikasi (`-n`).

---

## 2. Arsitektur & Konfigurasi

```text
+-----------------------+              +-----------------------+
|  Medusa Backend       | ------------>|  PostgreSQL (Port 5432|
|  (Terisolasi, normal) |              |  direct connection)   |
+-----------------------+              +-----------------------+
                                                   ^
+-----------------------+                          |
|  pgbench (25 clients) |                          | (max 5 conn)
|  8 menit (480s)       |                          |
+-----------+-----------+              +-----------+-----------+
            |                          |  PgBouncer            |
            +------------------------->|  (Port 6432, pool=5)  |
                                       +-----------+-----------+
                                                   | (autodiscovery)
                                       +-----------v-----------+
                                       |  Datadog Agent        |
                                       +-----------------------+
```

### Konfigurasi PgBouncer (`docker/pgbouncer/pgbouncer.ini`)
- `pool_mode = transaction`
- `default_pool_size = 5`
- `max_db_connections = 5`
- `reserve_pool_size = 0`
- `max_client_conn = 50`
- `query_wait_timeout = 600` (agar 20 klien antre tidak di-disconnect sebelum 8 menit)
- `stats_users = datadog, postgres`

### Datadog Autodiscovery Label (`docker-compose.yml`)
Agent Datadog mengumpulkan metrik dari PgBouncer menggunakan Autodiscovery Docker labels:
- `com.datadoghq.ad.check_names: '["pgbouncer"]'`
- `com.datadoghq.ad.instances`: `[{"database_url": "postgresql://datadog:datadog@%%host%%:6432/pgbouncer", ...}]`

---

## 3. Cara Menjalankan Test Saturation 8 Menit

Jalankan script runner khusus PgBouncer POC dari root project:

```bash
./run-pgbouncer-poc.sh
```

Atau eksekusi langsung via Docker Compose:

```bash
docker compose exec -T postgres pgbench \
  -h pgbouncer \
  -p 6432 \
  -U postgres \
  -c 25 \
  -j 5 \
  -T 480 \
  -n \
  -f /load-test/pgbench-saturation.sql \
  medusa-store
```

---

## 4. Konfigurasi Datadog Monitor & Kriteria Alert

Buat **Composite Monitor** di Datadog (`datadoghq.com` -> **Monitors** -> **New Monitor**):

### 📊 Metric Monitor 1: Backend Pool Saturation
- **Metric**: `pgbouncer.pools.sv_active{service:pgbouncer}`
- **Evaluasi**: `avg(last_5m) >= 5`
- **Tujuan**: Memastikan 100% dari 5 koneksi backend PgBouncer ke PostgreSQL terpakai penuh.

### 📊 Metric Monitor 2: Real Client Queueing
- **Metric**: `pgbouncer.pools.cl_waiting{service:pgbouncer}`
- **Evaluasi**: `avg(last_5m) >= 10`
- **Tujuan**: Memastikan terdapat antrean nyata dari 20 klien yang menunggu giliran koneksi.

### 🔀 Composite Monitor (Valid Alert)
- **Formula**: `[Monitor_1_ID] && [Monitor_2_ID]`
- **Aturan**: Alert hanya memicu pemberitahuan (`CRITICAL`) jika pool backend penuh **DAN** klien benar-benar mengantre secara konsisten selama window 5 menit.

---

## 5. Acceptance Criteria Saat Menit ke-5 Hingga ke-8

Saat pengujian memasuki **menit ke-5 hingga menit ke-8**:

1. **`sv_active = 5`** (5 koneksi backend terpakai 100%).
2. **`sv_idle = 0`** (tidak ada koneksi backend yang menganggur).
3. **`cl_waiting ≈ 20`** (20 klien mengantre stabil).
4. **`maxwait`** terus meningkat secara berurutan.
5. **PostgreSQL Connections** dari PgBouncer tidak pernah melebihi 5.
6. **Datadog Composite Monitor** berubah status menjadi **`ALERT / CRITICAL`** pada menit ke-5.

---

## 6. Auto-Recovery Setelah Test Selesai

Setelah runner 480 detik selesai:
1. PgBouncer langsung memproses sisa antrean dan mengosongkan antrean (`cl_waiting = 0`).
2. `sv_active` kembali ke `0` atau baseline.
3. Setelah window 5 menit pasca-test berlalu, nilai `avg(last_5m)` turun kembali di bawah threshold.
4. Datadog Monitor secara otomatis berganti status dari **`ALERT`** kembali ke **`OK`**.
