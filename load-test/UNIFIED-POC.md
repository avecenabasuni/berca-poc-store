# 🚀 Hero Story: Closed-Loop Auto-Remediation (Datadog & Ansible)
## POC: Connection Pool Exhaustion & Disk Log Saturation (15-Minute Demo)

Dokumen ini berisi arsitektur lengkap, kontrak integrasi Ansible AWX, alur demo closed-loop 15 menit, serta kriteria pengujian untuk **POC Hero Story: Datadog Closed-Loop Auto-Remediation via Ansible Automation Platform**.

---

## 📋 Table of Contents
1. [Ringkasan Eksekutif & Visi Closed-Loop](#1-ringkasan-eksekutif--visi-closed-loop)
2. [Alur Demo 15 Menit (Closed-Loop Lifecycle)](#2-alur-demo-15-menit-closed-loop-lifecycle)
3. [Arsitektur Closed-Loop (Datadog → Ansible AWX)](#3-arsitektur-closed-loop-datadog--ansible-awx)
4. [Kontrak Remediasi Ansible AWX](#4-kontrak-remediasi-ansible-awx)
5. [Desain Integrasi Webhook Payload](#5-desain-integrasi-webhook-payload)
6. [Acceptance Criteria & Bukti Visual Lifecycle](#6-acceptance-criteria--bukti-visual-lifecycle)
7. [Narasi "Before vs After"](#7-narasi-before-vs-after)
8. [Translasi Nilai Bisnis ke 7 Vertikal Industri](#8-translasi-nilai-bisnis-ke-7-vertikal-industri)
9. [Panduan Eksekusi & Test Plan](#9-panduan-eksekusi--test-plan)

---

## 1. Ringkasan Eksekutif & Visi Closed-Loop

Di era digital berkecepatan tinggi, insiden downtime yang diakibatkan oleh **lonjakan trafik (traffic spike)** tidak hanya memicu kegagalan database pool, tetapi juga **pembengkakan log transaksi (log saturation)** yang berdampak fatal pada sistem.

### 🌟 Visi Hero Story:
Mengubah pemantauan tradisional yang bersifat reaktif menjadi **Closed-Loop Automated Remediation** yang proaktif:
> **"Datadog mendeteksi insiden ganda secara real-time dalam < 5 menit → Datadog Workflow Automation memicu Ansible Automation Platform → Playbook Remediasi mengeksekusi perbaikan otomatis dalam < 1 menit TANPA campur tangan manusia → Sistem pulih secara mandiri saat beban trafik tetap aktif (Soak Test)."**

---

## 2. Alur Demo 15 Menit (Closed-Loop Lifecycle)

```text
  ⏱️ Menit 0 - 5 : FAULT GENERATION
     ├── pgbench memicu 25 klien paralel (pool max=5 -> cl_waiting ~20)
     ├── log-generator mengisi disk volume hingga 85%
     └── Datadog Composite Monitor berubah status menjadi ALERT pada Menit ke-5.

  ⚡ Menit 5 - 6 : CLOSED-LOOP REMEDIATION (ANSIBLE AWX)
     ├── Datadog Workflow memicu Ansible AWX Job Template via Webhook REST API
     ├── AWX Playbook mengeksekusi remediasi PgBouncer (SET default_pool_size=25; SET max_db_connections=25)
     └── AWX Playbook menghentikan log generator (rm .trigger_saturation) & truncate log
     └── Antrean PgBouncer menjadi cl_waiting=0 & disk log kembali < 10% dalam < 1 menit.

  📈 Menit 6 - 10 : MONITOR EVALUATION & RECOVERY
     └── Datadog avg(last_5m) window mengevaluasi data bersih & mengembalikan Composite Monitor ke OK.

  🔄 Menit 10 - 15 : POST-REMEDIATION SOAK TEST
     └── pgbench TETAP BERJALAN dengan 25 klien, namun cl_waiting tetap 0 & disk tetap rendah
         karena PgBouncer telah berkapasitas 25/25. Membuktikan remediasi berhasil saat beban aktif!

  🧹 Menit 15 : MASTER RESET
     └── run-full-poc.sh selesai & memanggil cleanup-full-poc.sh untuk mereset pool ke 5/5 baseline.
```

---

## 3. Arsitektur Closed-Loop (Datadog → Ansible AWX)

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
            v (Auto-Remediate: SET pool=25/25 & truncate log)
+-----------+-----------+
|  Sistem Pulih Mandiri |
| (Monitor Kembali OK)  |
+-----------------------+
```

---

## 4. Kontrak Remediasi Ansible AWX

- **Prinsip Otonomi**: Datadog Workflow Automation adalah satu-satunya pemicu AWX Job Template. Script runner `run-full-poc.sh` **tidak memanggil Ansible secara langsung**.
- **Prinsip Idempotensi**: Playbook AWX hanya memproses alert aktif dan aman dieksekusi berulang kali (*retry-safe*).

### A. Perintah Remediasi Database Connection Pool (PgBouncer Admin Console)
*Preflight AWX*: AWX Playbook mengeksekusi `SHOW CONFIG;` untuk memastikan kolom `changeable` bernilai `yes` untuk `default_pool_size` dan `max_db_connections`.

AWX Playbook terhubung ke PgBouncer Admin Console (`postgresql://postgres@pgbouncer:6432/pgbouncer`) dan mengeksekusi perintah runtime tanpa restart:
```sql
SET default_pool_size = 25;
SET max_db_connections = 25;
```
*(Catatan: Jangan jalankan `RELOAD` setelah `SET`, karena `RELOAD` akan membaca ulang `pgbouncer.ini` dari disk dan mengembalikan batas koneksi ke 5).*

*Validasi oleh AWX*: Mengeksekusi `SHOW CONFIG;` untuk memverifikasi `default_pool_size = 25` dan `max_db_connections = 25`, serta `SHOW POOLS;` untuk memverifikasi `cl_waiting = 0`.

### B. Perintah Remediasi Disk Log Saturation
AWX Playbook menghapus file trigger dan membersihkan log tanpa mematikan beban `pgbench`:
```bash
rm -f ./docker/log-saturation/data/.trigger_saturation
> ./docker/log-saturation/data/app-saturation.log
sync
```
*Validasi oleh AWX*: Memverifikasi persentase disk log (`df -P`) kembali di bawah 10%.

---

## 5. Desain Integrasi Webhook Payload

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

---

## 6. Acceptance Criteria & Bukti Visual Lifecycle

### 📊 Klarifikasi Threshold & Fault Target:
- **Disk Fault Generation**: Target penulisan log berhenti di **85%** kapasitas disk 200MB terisolasi (`system.disk.in_use = 0.85`).
- **Datadog Disk Monitor**: Peringatan alert disetel pada threshold **80%** (`system.disk.in_use >= 0.80`).

### 🏆 Acceptance Criteria Closed-Loop:
1. **Window Pertama (Menit 0-5)**: Datadog Composite Monitor mendeteksi insiden dan berubah menjadi **`ALERT / CRITICAL`** pada Menit ke-5.
2. **Eksekusi AWX (Menit 5-6)**: AWX memicu Playbook, memperbesar pool menjadi `25/25` dan membersihkan disk log dalam < 1 menit.
3. **Recovery Window (Menit 6-10)**: Datadog Composite Monitor mengevaluasi data bersih dan pulih ke status **`OK`** maksimal 1 window evaluasi pasca-remediasi.
4. **Soak Test (Menit 10-15)**: `pgbench` tetap aktif dengan 25 klien, namun antrean `cl_waiting` tetap **0** dan disk tetap rendah.

---

## 7. Narasi "Before vs After"

| Parameter | ❌ Before (Tanpa Observabilitas & Auto-Remediation) | ✅ After (Datadog + Ansible Closed-Loop) |
|---|---|---|
| **Waktu Deteksi Insiden** | 30–60 menit (menunggu laporan keluhan pengguna/helpdesk). | **< 5 menit** (Datadog Composite Monitor `avg(last_5m)`). |
| **Penyebab Insiden** | Penanganan parsial (hanya restart app, disk tetap penuh). | Root cause teridentifikasi menyeluruh (DB Pool & Disk Volume). |
| **Proses Remediasi** | Manual via SSH oleh On-Call Engineer (butuh waktu 15–30 menit). | **Otomatis oleh Ansible Playbook dalam < 1 menit**. |
| **Total MTTR (Recovery Time)**| **45 – 90 menit downtime**. | **< 6 menit total MTTR** (Sistem pulih mandiri). |
| **Dampak Bisnis** | Kerugian transaksi masif, breach SLA OJK/BI, penurunan reputasi brand. | **Zero Human Intervention**, kelangsungan bisnis terjaga 100%. |

---

## 8. Translasi Nilai Bisnis ke 7 Vertikal Industri

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

## 9. Panduan Eksekusi & Test Plan

### A. Run POC Test Plan
```bash
# 1. Jalankan Master Unified POC (15 Menit)
./run-full-poc.sh

# 2. Verifikasi status saat Menit 5 (Datadog Composite Alert terbukti menyala ALERT)

# 3. Verifikasi perbaikan setelah AWX Playbook berjalan (Menit 6):
docker compose exec postgres psql -h pgbouncer -p 6432 -U postgres pgbouncer -c "SHOW POOLS;"
# (Pastikan cl_waiting = 0 dan cl_active berkapasitas 25)

# 4. Verifikasi Soak Test (Menit 10-15): pgbench tetap berjalan tanpa antrean.
# 5. Menit 15: Skenario selesai dan otomatis mereset pool ke 5/5 baseline.
```
