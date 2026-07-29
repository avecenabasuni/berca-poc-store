# POC: Datadog Unified Monitoring — Connection Pool & Disk Log Saturation

## 1. Ringkasan & Tujuan

Dokumen ini menjelaskan rancangan **Unified POC (Satu Kesatuan Flowchart)** yang menggabungkan:
1. **Skenario 1**: PgBouncer Connection Pool Saturation (`sv_active = 5`, `cl_waiting ≈ 20`).
2. **Skenario 2**: Disk Log Saturation (`system.disk.in_use >= 85%`).

Skenario dijalankan secara simultan selama **15 menit** (900 detik) untuk memberi durasi evaluasi yang lebih dari cukup bagi Datadog Monitor dengan agregasi `avg(last_5m)`.

---

## 2. Alur Cerita (Unified Flowchart)

```text
                        +----------------------------+
                        |       Trafik Melonjak      |
                        | (ribuan user akses bersama)|
                        +--------------+-------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
     +---------------------------+           +---------------------------+
     |   Connection Pool Penuh   |           |      Volume Log Naik      |
     |   (slot koneksi db habis) |           |   (log transaksi & error  |
     +-------------+-------------+           |        ikut membengkak)   |
                   |                         +-------------+-------------+
                   v                                       |
     +---------------------------+                         v
     |       Query Timeout       |-----------+-------------+
     |  (checkout mulai gagal)   | (error    |
     +-------------+-------------+  retries) v
                   |                         +---------------------------+
                   |                         |        Disk Penuh         |
                   |                         |   (read-only atau crash)  |
                   |                         +-------------+-------------+
                   |                                       |
                   +-------------------+-------------------+
                                       |
                                       v
                         +---------------------------+
                         |       Layanan Down        |
                         | (downtime dirasakan user) |
                         +---------------------------+
```

---

## 3. Jalur Koneksi & Arsitektur Service

```text
User / Storefront → Medusa Backend → PgBouncer (Port 6432) → PostgreSQL (Port 5432)
Runner (`run-full-poc.sh`) → PgBouncer (Port 6432) + Log Generator Volume Mount
Datadog Agent → PostgreSQL (Port 5432) + PgBouncer (Port 6432) + Disk Log Volume (`/var/log/poc-app`)
```

### File & Service Terkait:
- **PgBouncer Config**: `docker/pgbouncer/pgbouncer.ini` (`default_pool_size=5`, `max_db_connections=5`, `pool_mode=transaction`).
- **Medusa Config**: `apps/backend/medusa-config.ts` (`pool.max = 25`).
- **Log Saturation Volume**: `./docker/log-saturation/data` terisolasi (max target 85%).
- **Runner Script**: `./run-full-poc.sh`
- **Cleanup Script**: `./cleanup-full-poc.sh`

---

## 4. Konfigurasi Datadog Composite Monitor

Buat **Composite Monitor** di Datadog (`datadoghq.com` -> **Monitors** -> **New Monitor**):

### 📊 Metric Monitor 1: PgBouncer Pool Saturation
- **Metric**: `pgbouncer.pools.sv_active{service:pgbouncer}`
- **Evaluasi**: `avg(last_5m) >= 5`
- **Metric Antrean**: `pgbouncer.pools.cl_waiting{service:pgbouncer}` >= 10

### 📊 Metric Monitor 2: Disk Log Saturation
- **Metric**: `system.disk.in_use{path:/var/log/poc-app}`
- **Evaluasi**: `avg(last_5m) >= 0.80` (80% disk log terpakai)

### 🔀 Datadog Composite Monitor (Critical Alert)
- **Formula**: `[Monitor_1_ID] && [Monitor_2_ID]`
- **Deskripsi**: Alert `CRITICAL` terpicu jika Connection Pool jenuh **DAN** Kapasitas Disk Log membengkak secara bersamaan dalam window 5 menit.

---

## 5. Acceptance Criteria (Menit ke-5 s.d Menit ke-15)

Saat pengujian memasuki **menit ke-5 hingga menit ke-15**:

1. **`sv_active = 5`** (Koneksi backend PgBouncer 100% penuh).
2. **`cl_waiting ≈ 20`** (Klien mengantre stabil).
3. **`system.disk.in_use >= 0.85`** (Penggunaan disk log menyentuh 85%).
4. **Datadog Composite Monitor** berubah status dari `OK` menjadi **`ALERT / CRITICAL`** pada menit ke-5 dan stabil hingga menit ke-15.
5. **PostgreSQL Direct Connections** dari PgBouncer tidak pernah melebihi 5.

---

## 6. Auto-Recovery

Setelah runner 900 detik (15 menit) selesai dan `./cleanup-full-poc.sh` dijalankan:
1. File log test langsung dikosongkan (`0 bytes`).
2. Penggunaan disk kembali ke baseline (< 5%).
3. Antrean PgBouncer dikosongkan (`cl_waiting = 0`).
4. Setelah window 5 menit berlalu, Datadog Monitor kembali berstatus **`OK`** secara otomatis.
