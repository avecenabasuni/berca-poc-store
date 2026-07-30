# 🚀 Hero Story: Closed-Loop Auto-Remediation (Datadog & Ansible)
## POC: Connection Pool Exhaustion & Disk Log Saturation

Dokumen ini berisi arsitektur lengkap, panduan eksekusi, serta peta translasi nilai bisnis untuk **POC Hero Story: Datadog Closed-Loop Auto-Remediation via Ansible Automation Platform**.

---

## 📋 Table of Contents
1. [Ringkasan Eksekutif & Hero Story](#1-ringkasan-eksekutif--hero-story)
2. [Arsitektur Closed-Loop (Datadog → Ansible)](#2-arsitektur-closed-loop-datadog--ansible)
3. [Alur Cerita Technical (Unified Flowchart)](#3-alur-cerita-technical-unified-flowchart)
4. [Petunjuk Bukti Visual (Before Evidence)](#4-petunjuk-bukti-visual-before-evidence)
5. [Desain Integrasi Datadog → Ansible Webhook Payload](#5-desain-integrasi-datadog--ansible-webhook-payload)
6. [Narasi "Before vs After"](#6-narasi-before-vs-after)
7. [Translasi Nilai Bisnis ke 7 Vertikal Industri](#7-translasi-nilai-bisnis-ke-7-vertikal-industri)
8. [Panduan Eksekusi POC (15 Menit)](#8-panduan-eksekusi-poc-15-menit)

---

## 1. Ringkasan Eksekutif & Hero Story

Di era digital berkecepatan tinggi, insiden downtime yang diakibatkan oleh **lonjakan trafik (traffic spike)** tidak hanya memicu kegagalan database pool, tetapi juga **pembengkakan log transaksi (log saturation)** yang berdampak fatal pada sistem.

### 🌟 Visi Hero Story:
Mengubah pemantauan tradisional yang bersifat reaktif (*manusia membaca alert -> koordinasi jam kerja -> eksekusi manual*) menjadi **Closed-Loop Automated Remediation** yang bersifat proaktif:
> **"Datadog mendeteksi insiden ganda secara real-time dalam < 5 menit → Datadog Workflow Automation memicu Ansible Automation Platform → Playbook Remediasi mengeksekusi perbaikan otomatis dalam < 1 menit TANPA campur tangan manusia."**

---

## 2. Arsitektur Closed-Loop (Datadog → Ansible)

```text
+-----------------------+              +--------------------------------+
|   Pelanggan Akses     |              |     Datadog Agent & DBM        |
|  (Flash Sale / Spike) |              |  (Metrics, Logs, Traces, DBM)  |
+-----------+-----------+              +---------------+----------------+
            |                                          |
            v                                          v
+-----------+-----------+              +---------------+----------------+
|  Medusa & PgBouncer   | ------------>|   Datadog Composite Monitor    |
| (Pool Full & Disk 85%)|              | [Pool Saturation && Disk Full] |
+-----------------------+              +---------------+----------------+
                                                       | (Trigger Alert)
                                                       v
+-----------------------+              +---------------+----------------+
|  Ansible AWX / Tower  | <----------- |   Datadog Workflow Automation  |
| (Remediation Playbook)|  Webhook /   | (Closed-Loop Action Trigger)   |
+-----------+-----------+  Rest API    +--------------------------------+
            |
            v (Auto-Remediate: Scale Pool / Rotate Log / Purge Temp)
+-----------+-----------+
|  Sistem Pulih Kembali |
| (Monitor Kembali OK)  |
+-----------------------+
```

---

## 3. Alur Cerita Technical (Unified Flowchart)

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
     |  (sv_active=5, cl_wait~20)|           | (log transaksi & error)   |
     +-------------+-------------+           +-------------+-------------+
                   |                                       |
                   v                                       v
     +---------------------------+           +---------------------------+
     |       Query Timeout       |           |     Disk Log Penuh 85%    |
     |   (checkout mulai gagal)  |           | (system.disk.in_use=0.85) |
     +-------------+-------------+           +-------------+-------------+
                   |                                       |
                   +-------------------+-------------------+
                                       |
                                       v
                         +---------------------------+
                         |  Composite Alert (Menit 5)|
                         |   Datadog Detect Critical |
                         +-------------+-------------+
                                       |
                                       v
                         +---------------------------+
                         | Closed-Loop Remediation   |
                         |  Ansible Fixes System     |
                         +---------------------------+
```

---

## 4. Petunjuk Bukti Visual (Before Evidence)

Untuk membuktikan keandalan observabilitas Datadog sebelum remediasi otomatis dijalankan, siapkan 3 tangkapan layar/rekaman dari Datadog UI:

1. **Lifecycle Monitor Status**:
   - Menunjukkan siklus transisi status Composite Monitor: **`OK`** (Menit 0-5) → **`ALERT / CRITICAL`** (Menit 5-15) → **`OK`** (Post-Cleanup).
2. **Dashboard Grafis Matriks Real-Time (15 Menit Window)**:
   - **Graph 1**: `pgbouncer.pools.sv_active` (Flat di angka 5 / 100% penuh).
   - **Graph 2**: `pgbouncer.pools.cl_waiting` (Konsisten di angka ~20 antrean).
   - **Graph 3**: `system.disk.in_use{device:/var/log/poc-app}` (Progresi dari <10% melonjak hingga menyentuh 85%).
3. **Database Monitoring (DBM) & Trace Correlation**:
   - Menunjukkan query bottleneck `pg_sleep` / connection waiting time yang terasosiasi langsung dengan APM Trace ID.

---

## 5. Desain Integrasi Datadog → Ansible Webhook Payload

Ketika Datadog Composite Monitor berubah status menjadi **`ALERT`**, **Datadog Workflow Automation** mengeksekusi HTTP Webhook Action ke Ansible Automation Platform (AWX/Tower) dengan struktur payload JSON berikut:

### 📩 Webhook Payload JSON (Datadog to Ansible AWX)
```json
{
  "event_type": "DATADOG_CLOSED_LOOP_REMEDIATION",
  "incident_id": "$EVENT_ID",
  "monitor_id": "$MONITOR_ID",
  "monitor_title": "$MONITOR_NAME",
  "alert_status": "$ALERT_STATUS",
  "environment": "production",
  "affected_services": [
    "medusa-backend",
    "pgbouncer",
    "log-storage-volume"
  ],
  "metrics": {
    "pgbouncer_sv_active": "$PG_SV_ACTIVE",
    "pgbouncer_cl_waiting": "$PG_CL_WAITING",
    "disk_usage_pct": "$DISK_IN_USE"
  },
  "action_required": "EXECUTE_CLOSED_LOOP_REMEDIATION",
  "ansible_target_job_template": "remediate_pool_and_disk_saturation",
  "extra_vars": {
    "target_host": "$HOSTNAME",
    "target_disk_path": "/var/log/poc-app",
    "requested_action": "expand_pool_size_and_truncate_log"
  }
}
```

### ⚙️ Alur Kerja Datadog Workflow Automation:
1. **Trigger Condition**: `Monitor Status` changes to `ALERT` on Composite Monitor `[Monitor_1_ID] && [Monitor_2_ID]`.
2. **Action 1**: Post notification to Slack / Teams channel (`#incident-automation`).
3. **Action 2**: Trigger Ansible AWX Job Template `remediate_pool_and_disk_saturation` via Rest API webhook.

---

## 6. Narasi "Before vs After"

| Parameter | ❌ Before (Tanpa Observabilitas & Auto-Remediation) | ✅ After (Datadog + Ansible Closed-Loop) |
|---|---|---|
| **Waktu Deteksi Insiden** | 30–60 menit (menunggu laporan keluhan pengguna/helpdesk). | **< 5 menit** (Datadog Composite Monitor `avg(last_5m)`). |
| **Penyebab Insiden** | Penanganan parsial (hanya restart app, disk tetap penuh). | Root cause teridentifikasi menyeluruh (DB Pool & Disk Volume). |
| **Proses Remediasi** | Manual via SSH oleh On-Call Engineer (butuh waktu 15–30 menit). | **Otomatis oleh Ansible Playbook dalam < 1 menit**. |
| **Total MTTR (Recovery Time)**| **45 – 90 menit downtime**. | **< 6 menit total MTTR**. |
| **Dampak Bisnis** | Kerugian transaksi masif, breach SLA OJK/BI, penurunan reputasi brand. | **Zero Human Intervention**, kelangsungan bisnis terjaga 100%. |

---

## 7. Translasi Nilai Bisnis ke 7 Vertikal Industri

POC ini relevan secara universal untuk 7 sektor vertikal bisnis utama di Indonesia:

1. **💳 BFSI (Perbankan & Keuangan)**:
   > *"Mencegah kegagalan otorisasi transaksi transfer & QRIS serta menghindari sanksi penalti breach SLA dari regulasi Bank Indonesia/OJK saat lonjakan transaksi akhir bulan (payroll spike)."*

2. **🛒 Retail & E-Commerce**:
   > *"Menghindari risiko loss revenue hingga miliaran rupiah dan hilangnya ribuan calon pembeli akibat checkout hang & abandoned cart saat event Flash Sale atau Harbolnas."*

3. **📱 Telekomunikasi**:
   > *"Menjamin ketersediaan API sistem pembelian paket data & isi ulang pulsa (provisioning) tetap responsif 100% di saat jam puncak nasional (peak usage hours)."*

4. **🏛️ Pemerintahan & BUMN**:
   > *"Menjaga reputasi layanan publik dengan mencegah crash portal pendaftaran massal (CPNS/PPDB) dan aplikasi pelayanan warga dari insiden disk log membengkak."*

5. **🏭 Manufaktur**:
   > *"Mencegah terhentinya rantai produksi pabrik akibat sistem data logger SCADA/MES gagal menulis antrean log transaksi ke database produksi."*

6. **🚚 Logistik & Supply Chain**:
   > *"Menjamin kontinuitas sistem pelacakan AWB/resi dan API auto-dispatch kurir tetap lancar tanpa terkendala server error di jam sibuk pengiriman barang."*

7. **🏥 Kesehatan (Hospital & MedTech)**:
   > *"Mencegah keterlambatan pendaftaran pasien IGD dan proses klaim BPJS Kesehatan di SIMRS akibat database gawat darurat yang terkunci saat lonjakan pasien."*

---

## 8. Panduan Eksekusi POC (15 Menit)

### A. Setup Monitor di Datadog UI
1. **Monitor 1 (PgBouncer Pool)**: `avg(last_5m):avg:pgbouncer.pools.sv_active{service:pgbouncer} >= 5`
2. **Monitor 2 (Disk Log Saturation)**: `avg(last_5m):avg:system.disk.in_use{device:/var/log/poc-app} >= 0.80` *(catatan: menggunakan `device:` sesuai `use_mount: yes`)*.
3. **Composite Monitor 3**: `[Monitor_1_ID] && [Monitor_2_ID]`

### B. Eksekusi Simulasi di VM Linux Ubuntu
```bash
# 1. Tarik update terbaru
git pull origin main

# 2. Restart container & Datadog Agent
docker compose up -d --build

# 3. Jalankan Master Unified POC (15 Menit)
./run-full-poc.sh
```

### C. Penghentian Darurat (Emergency Stop & Reset)
Tekan **`Ctrl + C`** pada terminal kapan saja. Script trap handler akan secara otomatis mematikan beban `pgbench`, menghentikan penulisan log, mengosongkan log file, dan mengembalikan lingkungan 100% ke kondisi baseline.
