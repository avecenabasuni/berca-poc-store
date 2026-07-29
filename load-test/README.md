# Load Testing — Database Connection Pool Exhaustion POC

Infrastruktur load testing untuk mendemonstrasikan skenario **database connection pool exhaustion** pada Medusa.js backend. Terdiri dari dua komponen utama:

1. **Baseline Traffic** — berjalan terus-menerus otomatis via Docker, menghasilkan traffic realistis untuk historical data di monitoring (Datadog, dll.)
2. **Spike Trigger** — dijalankan manual kapan saja untuk memicu connection pool exhaustion saat live demo

## Arsitektur

```
                                    +-------------------+
                                    |   PostgreSQL      |
                                    |   max_conn: 100   |
                                    +--------+----------+
                                             |
                                    +--------+----------+
                                    |   Medusa Backend   |
                                    |   pool.max: 5      |  <-- intentionally small!
                                    |   pool.min: 1      |
                                    |   idle: 10s        |
                                    |   conn_timeout: 5s |
                                    +--------+----------+
                                             |
                          +------------------+------------------+
                          |                                     |
               +----------+----------+            +-------------+-----------+
               | traffic-generator   |            |  trigger-spike.sh       |
               | (Docker, otomatis)  |            |  (manual, kapan saja)   |
               | 1-8 VUs baseline    |            |  10 → 50 → 100 VUs     |
               +---------------------+            +-------------------------+
```

## Prerequisites

- Docker & Docker Compose
- [k6](https://k6.io/docs/getting-started/installation/) (hanya untuk spike trigger lokal)
- Medusa publishable API key (dari admin dashboard: Settings → API Keys)

## Environment Variables

| Variable | Diperlukan | Default | Deskripsi |
|----------|-----------|---------|-----------|
| `MEDUSA_PUBLISHABLE_KEY` | Ya | - | Publishable API key dari Medusa admin |
| `MEDUSA_BASE_URL` | Tidak | `http://localhost:9000` (lokal) / `http://medusa:9000` (Docker) | URL backend |

> **Tips Ambil API Key**: Kamu bisa langsung mengambil `MEDUSA_PUBLISHABLE_KEY` yang di-generate otomatis saat seed:
> ```bash
> docker compose logs medusa | grep "PUBLISHABLE API KEY"
> ```

Set di root `.env` atau export sebelum menjalankan Docker Compose:

```bash
export MEDUSA_PUBLISHABLE_KEY=pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
docker compose up -d
```

## 1. Baseline Traffic (Otomatis via Docker)

Baseline traffic **berjalan otomatis** saat `docker compose up`. Service `traffic-generator` akan:

1. Menunggu Medusa backend healthy (healthcheck via `/health`)
2. Menjalankan k6 `baseline-traffic.js` dalam loop terus-menerus
3. Restart cycle setiap ~6 jam untuk menyesuaikan VU intensity dengan jam

### User Journey yang Disimulasikan

Setiap virtual user menjalani flow belanja realistis:

| Step | Endpoint | Peluang Dilakukan |
|------|----------|-------------------|
| Browse produk | `GET /store/products` | 100% |
| Lihat detail produk | `GET /store/products/{id}` | 100% |
| Buat cart + tambah item | `POST /store/carts` + `POST /store/carts/{id}/line-items` | 70% |
| Checkout flow | `POST /store/carts/{id}` + payment | ~35% dari yang buat cart |

Think time 1-4 detik antar step. ~3% request sengaja dibuat gagal untuk natural error rate.

### Intensitas VU Berdasarkan Waktu (WIB)

| Jam | Virtual Users | Keterangan |
|-----|--------------|------------|
| 00:00 - 06:00 | 1-2 VUs | Malam — traffic minimal |
| 06:00 - 17:00 | 3-5 VUs | Jam kerja — traffic normal |
| 17:00 - 22:00 | 5-8 VUs | Peak evening — traffic tinggi |
| 22:00 - 00:00 | 2-3 VUs | Late night — menurun |

### Cara Monitor

```bash
# Lihat log traffic generator
docker compose logs -f traffic-generator

# Cek status container
docker compose ps traffic-generator
```

## 2. Spike Trigger (Manual)

Jalankan kapan saja untuk memicu pool exhaustion saat live demo:

```bash
# Set env vars
export MEDUSA_BASE_URL=http://localhost:9000
export MEDUSA_PUBLISHABLE_KEY=pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Trigger!
./load-test/trigger-spike.sh
```

### Skenario Spike

```
0s          20s         50s         80s        115s
|--10 VUs---|--50 VUs---|--100 VUs--|--ramp 0--|
  warm up     stress      EXHAUST     recover
```

- **0-20s**: 10 VUs — warm up, semua masih normal
- **20-50s**: 50 VUs — pool mulai penuh, beberapa request antri
- **50-80s**: 100 VUs — **pool exhaustion!** Banyak request timeout (5s) atau error 500
- **80-115s**: Ramp down — request mulai berhasil lagi

### Dari Docker Container (Tanpa Install k6 Lokal)

```bash
docker compose exec traffic-generator k6 run \
  -e MEDUSA_BASE_URL=http://medusa:9000 \
  -e MEDUSA_PUBLISHABLE_KEY=pk_xxx \
  /scripts/spike-test.js
```

## 3. Expected Behavior Saat Spike

Hal-hal yang **seharusnya terjadi** (ini bukan bug, ini yang mau di-demo):

| Metric | Normal | Saat Spike |
|--------|--------|------------|
| Response time (p95) | < 500ms | **2000-5000ms** (antri tunggu koneksi) |
| Error rate | ~2-5% | **30-70%** (timeout + 500 errors) |
| HTTP status | Mayoritas 200 | Banyak **500** dan **timeout** |
| DB active connections | 1-3 | **5/5** (full) |

### Apa yang Terlihat di Datadog

- **Response time spike** yang dramatis saat 50-100 VUs
- **Error rate** melonjak tajam
- **Database connections** stuck di max (5)
- Setelah spike selesai: **grafik turun kembali normal** dalam 10-15 detik

## 4. Verifikasi Auto-Recovery

Setelah spike selesai, sistem harus recover otomatis **tanpa restart**:

```bash
# Tunggu 10-15 detik setelah spike selesai, lalu:

# 1. Cek response time kembali normal
time curl -s -H "x-publishable-api-key: $MEDUSA_PUBLISHABLE_KEY" \
  http://localhost:9000/store/products | head -c 100

# 2. Harus respond < 500ms

# 3. Jalankan beberapa kali untuk konfirmasi konsistensi
for i in 1 2 3 4 5; do
  time curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
    -H "x-publishable-api-key: $MEDUSA_PUBLISHABLE_KEY" \
    http://localhost:9000/store/products
done
```

**Kenapa bisa auto-recover?**
- `idleTimeoutMillis: 10000` — koneksi idle dilepas setelah 10 detik
- Setelah spike berhenti, semua 5 koneksi jadi idle
- Dalam 10 detik, koneksi dikembalikan ke pool → available lagi

## 5. Cron Scheduling (Opsional)

Untuk variasi di historical data, jadwalkan spike otomatis:

```bash
# Spike otomatis jam 10:00 WIB setiap hari kerja (Senin-Jumat)
# 3 = jam 3 UTC = jam 10 WIB
0 3 * * 1-5 cd /path/to/berca-poc-store && \
  MEDUSA_BASE_URL=http://localhost:9000 \
  MEDUSA_PUBLISHABLE_KEY=pk_xxx \
  ./load-test/trigger-spike.sh >> /var/log/spike-test.log 2>&1
```

## Konfigurasi Database Pool

Dikonfigurasi di `apps/backend/medusa-config.ts`:

```typescript
pool: {
  min: 1,              // minimum 1 koneksi tetap hidup
  max: 5,              // SENGAJA KECIL — untuk mudah di-exhaust
  idleTimeoutMillis: 10000,    // lepas koneksi idle setelah 10s (auto-recovery)
  connectionTimeoutMillis: 5000, // request baru gagal setelah tunggu 5s
}
```

> **WARNING**: Konfigurasi ini hanya untuk POC/demo. Production pool biasanya `max: 20-50`.

## File Structure

```
load-test/
  baseline-traffic.js   # k6 baseline — multi-step user journey
  spike-test.js         # k6 spike — ramp to 100 VUs
  trigger-spike.sh      # Manual spike trigger (bash)
  entrypoint.sh         # Docker entrypoint (wait + loop)
  README.md             # This file
```
