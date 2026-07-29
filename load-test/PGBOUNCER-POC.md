# POC: PgBouncer Saturation yang Terbaca oleh Monitor 5 Menit

## 1. Ringkasan & Tujuan

POC ini dikembangkan khusus untuk mendemonstrasikan **pola kejenuhan database connection pooler (PgBouncer)** secara deterministik yang bertahan selama **8 menit** (480 detik).

Durasi 8 menit memberikan window evaluasi yang cukup untuk Datadog Monitor dengan agregasi `avg(last_5m)` untuk mendeteksi kondisi pool jenuh dan antrean klien secara stabil tanpa fluktuasi sementara.

### Poin Kunci Desain:
- **Jalur Koneksi Otoritatif**: Medusa Backend dan Load-test Runner **keduanya melalui PgBouncer**, bukan langsung ke PostgreSQL.
- **PgBouncer** bertindak sebagai pooler database perantara dengan batas koneksi backend `default_pool_size=5` dan `max_db_connections=5`.
- **Pool Klien Medusa**: Ditingkatkan menjadi `pool.max = 25` di `medusa-config.ts` agar Medusa tidak menjadi bottleneck lebih dahulu; PgBouncer tetap membatasi koneksi fisik ke PostgreSQL maksimum 5.
- **Pgbench Runner**: Menjalankan 25 klien paralel langsung ke PgBouncer tanpa mengubah data aplikasi (`-n`).

---

## 2. Jalur Koneksi yang Dipakai

```text
User → Medusa → PgBouncer (Port 6432) → PostgreSQL (Port 5432)
Load-test runner (pgbench) → PgBouncer (Port 6432) → PostgreSQL (Port 5432)
Datadog PostgreSQL check → PostgreSQL langsung (Port 5432)
Datadog PgBouncer check → PgBouncer admin database (Port 6432)
```

```text
+-----------------------+
|  User / Storefront    |
+-----------+-----------+
            |
            v
+-----------+-----------+              +-----------------------+              +-----------------------+
|  Medusa Backend       | ------------>|  PgBouncer            | ------------>|  PostgreSQL           |
|  (pool.max = 25)      |              |  (Port 6432, pool=5)  |              |  (Port 5432)          |
+-----------------------+              +-----------+-----------+              +-----------+-----------+
                                                   ^                                      ^
+-----------------------+                          |                                      |
|  pgbench (25 clients) | -------------------------+                                      |
|  8 menit (480s)       |                                                                 |
+-----------------------+                                                                 |
                                                                                          |
+-----------------------+                                                                 |
|  Datadog Agent        | ----------------------------------------------------------------+
|  (Postgres & DBM)     |
+-----------------------+
```

### Konfigurasi PgBouncer (`docker/pgbouncer/pgbouncer.ini`)
- `pool_mode = transaction`
- `default_pool_size = 5`
- `max_db_connections = 5`
- `reserve_pool_size = 0`
- `max_client_conn = 50`
- `query_wait_timeout = 600` (agar 20 klien antre tidak diputus oleh pooler sebelum 8 menit)
- `stats_users = datadog, postgres`
- `ignore_startup_parameters = extra_float_digits, search_path, options`

### Datadog Autodiscovery Label (`docker-compose.yml`)
Agent Datadog mengumpulkan metrik dari PgBouncer menggunakan Autodiscovery Docker labels:
- `com.datadoghq.ad.check_names: '["pgbouncer"]'`
- `com.datadoghq.ad.instances`: `[{"database_url": "postgresql://datadog:datadog@%%host%%:6432/pgbouncer", ...}]`

---

## 3. Cara Menjalankan Smoke Test & Saturation Test 8 Menit

Jalankan script runner khusus PgBouncer POC dari root project:

```bash
./run-pgbouncer-poc.sh
```

Script akan mengeksekusi dua tahap:
1. **Smoke Test Medusa via PgBouncer**:
   Memastikan Medusa backend (`/health` & `/store/products`) dapat berkomunikasi dengan lancar melalui PgBouncer.
2. **Pgbench Saturation Test 8 Menit**:
   Membanjiri PgBouncer dengan 25 klien paralel selama 480 detik (8 menit):
   ```sql
   BEGIN;
   SELECT pg_sleep(30);
   COMMIT;
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
