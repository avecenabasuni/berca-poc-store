# 🚀 Hero Story: Closed-Loop Auto-Remediation (Datadog & Red Hat AAP / AWX)
## POC: Connection Pool Exhaustion & Disk Log Saturation (Scheduled Daily 10:00 WIB)

Dokumen ini berisi arsitektur lengkap, kontrak integrasi Red Hat Ansible Automation Platform (AAP) Controller / AWX, alur demo closed-loop 15 menit, serta panduan pengolahan jadwal otomatis `systemd` timer untuk **POC Hero Story: Datadog Closed-Loop Auto-Remediation**.

---

## 📋 Table of Contents
1. [Ringkasan Eksekutif & Visi Closed-Loop](#1-ringkasan-eksekutif--visi-closed-loop)
2. [Alur Demo 15 Menit (Closed-Loop Lifecycle)](#2-alur-demo-15-menit-closed-loop-lifecycle)
3. [Arsitektur Closed-Loop (Datadog → AAP Controller / AWX)](#3-arsitektur-closed-loop-datadog--aap-controller--awx)
4. [Jadwal Otomatis Harian (Systemd Timer 10:00 WIB)](#4-jadwal-otomatis-harian-systemd-timer-1000-wib)
5. [Kontrak Integrasi REST API Controller & AWX](#5-kontrak-integrasi-rest-api-controller--awx)
6. [Kontrak Remediation Playbook Ansible](#6-kontrak-remediation-playbook-ansible)
7. [Acceptance Criteria & Bukti Visual Lifecycle](#7-acceptance-criteria--bukti-visual-lifecycle)
8. [Narasi "Before vs After"](#8-narasi-before-vs-after)
9. [Translasi Nilai Bisnis ke 7 Vertikal Industri](#9-translasi-nilai-bisnis-ke-7-vertikal-industri)
10. [Panduan Eksekusi, Test Plan & Prosedur Reset](#10-panduan-eksekusi-test-plan--prosedur-reset)

---

## 1. Ringkasan Eksekutif & Visi Closed-Loop

Di era digital berkecepatan tinggi, insiden downtime yang diakibatkan oleh **lonjakan trafik (traffic spike)** tidak hanya memicu kegagalan database pool, tetapi juga **pembengkakan log transaksi (log saturation)** yang berdampak fatal pada sistem.

### 🌟 Visi Hero Story:
Mengubah pemantauan tradisional yang bersifat reaktif menjadi **Closed-Loop Automated Remediation** yang proaktif:
> **"Host Linux menjalankan simulasi otomatis harian pukul 10:00 WIB → Datadog mendeteksi insiden ganda secara real-time dalam < 5 menit → Datadog Workflow Automation memicu Red Hat AAP Controller / AWX via REST API → Playbook Remediasi mengeksekusi perbaikan otomatis dalam < 1 menit TANPA campur tangan manusia → Sistem pulih secara mandiri saat beban trafik tetap aktif (Soak Test)."**

---

## 2. Alur Demo 15 Menit (Closed-Loop Lifecycle)

```text
  ⏱️ Menit 0 - 5 : FAULT GENERATION
     ├── Systemd timer (10:00 WIB) memicu run-full-poc.sh
     ├── pgbench memicu 25 klien paralel (pool max=5 -> cl_waiting ~20)
     ├── log-generator mengisi disk volume hingga 85%
     └── Datadog Composite Monitor berubah status menjadi ALERT pada Menit ke-5.

  ⚡ Menit 5 - 6 : CLOSED-LOOP REMEDIATION (RED HAT AAP / AWX)
     ├── Datadog Workflow memicu Job Template 'remediate_pool_and_disk_saturation' via Controller REST API
     ├── Playbook mengeksekusi remediasi PgBouncer (SET default_pool_size=25; SET max_db_connections=25)
     └── Playbook menghentikan log generator (rm .trigger_saturation) & truncate log
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

## 3. Arsitektur Closed-Loop (Datadog → AAP Controller / AWX)

```text
+-----------------------+              +--------------------------------+
| Host Systemd Timer    |              |     Datadog Agent & DBM        |
| (10:00 WIB Daily)     |              |  (Metrics, Logs, Traces, DBM)  |
+-----------+-----------+              +---------------+----------------+
            | (flock lock)                             |
            v                                          v
+-----------+-----------+              +---------------+----------------+
|  Medusa & PgBouncer   | ------------>|   Datadog Composite Monitor    |
| (Pool Full & Disk 85%)|              | [Pool Saturation && Disk Full] |
+-----------------------+              +---------------+----------------+
                                                       | (Trigger Alert)
                                                       v
+-----------------------+              +---------------+----------------+
| AAP Controller / AWX  | <----------- |   Datadog Workflow Automation  |
| (Job Template Launch) |  REST API    | (Closed-Loop Action Trigger)   |
+-----------+-----------+  Bearer Auth +--------------------------------+
            |
            v (Auto-Remediate: SET pool=25/25 & truncate log)
+-----------+-----------+
|  Sistem Pulih Mandiri |
| (Monitor Kembali OK)  |
+-----------------------+
```

---

## 4. Jadwal Otomatis Harian (Systemd Timer 10:00 WIB)

Simulasi fault-injection 15 menit dikelola di tingkat host menggunakan **`systemd` timer & service** (`poc_scheduler` role). Ini memberikan pengelolaan lifecycle proses, locking (`flock`), timezone `Asia/Jakarta`, serta audit log `journald` yang lebih andal dibanding cron.

### ⚙️ Komponen Systemd Scheduler:
1. **Service Unit**: `/etc/systemd/system/berca-poc-simulation.service`
   - Berjalan sebagai `root` dengan `Type=oneshot`.
   - Menggunakan `/usr/bin/flock -n /var/run/berca-poc-simulation.lock` untuk mencegah eksekusi tumpang-tindih.
   - Memuat `DD_API_KEY` dari file rahasia `/etc/default/berca-poc-simulation` (mode `0600`).
2. **Timer Unit**: `/etc/systemd/system/berca-poc-simulation.timer`
   - `OnCalendar=*-*-* 10:00:00 Asia/Jakarta`
   - `Persistent=false` (Mencegah catch-up run tak terduga jika host sempat mati pada jam jadwal).

### 🚀 Cara Deploy Scheduler via Ansible:
```bash
ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-poc-scheduler.yml --tags poc_schedule
```

### 🔍 Perintah Manajemen & Audit Log Scheduler:
```bash
# Verifikasi Jadwal Eksekusi Berikutnya
systemctl list-timers berca-poc-simulation.timer

# Uji Eksekusi Manual Tanpa Menunggu Jam 10:00
systemctl start berca-poc-simulation.service

# Monitoring Log Eksekusi Real-Time
journalctl -u berca-poc-simulation.service -f
```

---

## 5. Kontrak Integrasi REST API Controller & AWX

- **Endpoint Launch**: `POST /api/v2/job_templates/<JOB_TEMPLATE_ID>/launch/`
- **Autentikasi**: Bearer Token khusus milik akun `poc-remediator` (Role: *Job Template Exec Executer*).
- **Pengaturan Job Template Controller**:
  - Nama Job Template: `remediate_pool_and_disk_saturation`
  - Playbook: `ansible/playbooks/remediate-pool-and-disk.yml`
  - Concurrent Jobs: **Disabled** (`allow_simultaneous: false`).
  - Extra Variables: Dibatasi melalui Survey terpantau (bukan `ask_variables_on_launch`).

### 📩 Webhook REST API Payload (Datadog to AAP Controller)
```json
{
  "extra_vars": {
    "incident_id": "$EVENT_ID",
    "monitor_id": "$MONITOR_ID",
    "alert_status": "$ALERT_STATUS",
    "environment": "poc",
    "requested_action": "expand_pool_and_truncate_log"
  }
}
```

---

## 6. Kontrak Remediation Playbook Ansible

- **Struktur File Artefak**:
  - `ansible/inventory/hosts.yml` & `group_vars/poc_docker_hosts.yml`: Definisi host terisolasi `poc_docker_hosts` & variable `poc_project_path`.
  - `ansible/roles/closed_loop_remediation/`: Role modular (`preflight`, `remediate_pool`, `remediate_disk`, `collect_evidence`).
  - `ansible/roles/poc_scheduler/`: Role pemasang systemd timer & service (tag: `poc_schedule`).
  - `ansible/playbooks/remediate-pool-and-disk.yml`: Playbook remediasi utama.
  - `ansible/playbooks/reset-poc-baseline.yml`: Playbook reset darurat / pemulihan baseline.
  - `ansible/playbooks/deploy-poc-scheduler.yml`: Playbook deployment timer.

### A. Perintah Remediasi Database Connection Pool (PgBouncer Admin Console)
*Preflight*: Playbook mengeksekusi `SHOW CONFIG;` dan memverifikasi kolom `changeable` bernilai `yes` untuk `default_pool_size` dan `max_db_connections`. Jika `changeable=no`, remediasi pool ditandai gagal namun remediasi disk **tetap dijalankan**.

AWX/Controller terhubung ke PgBouncer Admin Console (`postgresql://postgres@pgbouncer:6432/pgbouncer`) dan mengeksekusi:
```sql
SET default_pool_size = 25;
SET max_db_connections = 25;
```
*(Catatan: Menggunakan `-v ON_ERROR_STOP=1` tanpa `RELOAD`, agar setting runtime 25/25 aktif langsung).*

*Polling Validasi*: Playbook mem-poll `SHOW CONFIG;` hingga bernilai 25/25, dan mem-poll `SHOW POOLS;` hingga `cl_waiting = 0` untuk `medusa-store/postgres`.

### B. Perintah Remediasi Disk Log Saturation
Playbook menghapus file trigger dan membersihkan log tanpa mematikan beban `pgbench`:
```bash
rm -f ./docker/log-saturation/data/.trigger_saturation
> ./docker/log-saturation/data/app-saturation.log
sync
```
*Polling Validasi*: Playbook mem-poll `df -P` hingga persentase disk log kembali di bawah 10%.

---

## 7. Acceptance Criteria & Bukti Visual Lifecycle

### 📊 Klarifikasi Threshold & Fault Target:
- **Disk Fault Generation**: Target penulisan log berhenti di **85%** kapasitas disk 200MB terisolasi (`system.disk.in_use = 0.85`).
- **Datadog Disk Monitor**: Peringatan alert disetel pada threshold **80%** (`system.disk.in_use >= 0.80`).

### 🏆 Acceptance Criteria Closed-Loop:
1. **Window Pertama (Menit 0-5)**: Datadog Composite Monitor mendeteksi insiden dan berubah menjadi **`ALERT / CRITICAL`** pada Menit ke-5.
2. **Eksekusi AAP Controller (Menit 5-6)**: Controller memicu Playbook, memperbesar pool menjadi `25/25` dan membersihkan disk log dalam < 1 menit.
3. **Recovery Window (Menit 6-10)**: Datadog Composite Monitor mengevaluasi data bersih dan pulih ke status **`OK`** maksimal 1 window evaluasi pasca-remediasi.
4. **Soak Test (Menit 10-15)**: `pgbench` tetap aktif dengan 25 klien, namun antrean `cl_waiting` tetap **0** dan disk tetap rendah.

---

## 8. Narasi "Before vs After"

| Parameter | ❌ Before (Tanpa Observabilitas & Auto-Remediation) | ✅ After (Datadog + Ansible Closed-Loop) |
|---|---|---|
| **Waktu Deteksi Insiden** | 30–60 menit (menunggu laporan keluhan pengguna/helpdesk). | **< 5 menit** (Datadog Composite Monitor `avg(last_5m)`). |
| **Penyebab Insiden** | Penanganan parsial (hanya restart app, disk tetap penuh). | Root cause teridentifikasi menyeluruh (DB Pool & Disk Volume). |
| **Proses Remediation** | Manual via SSH oleh On-Call Engineer (butuh waktu 15–30 menit). | **Otomatis oleh Ansible Playbook dalam < 1 menit**. |
| **Total MTTR (Recovery Time)**| **45 – 90 menit downtime**. | **< 6 menit total MTTR** (Sistem pulih mandiri). |
| **Dampak Bisnis** | Kerugian transaksi masif, breach SLA OJK/BI, penurunan reputasi brand. | **Zero Human Intervention**, kelangsungan bisnis terjaga 100%. |

---

## 9. Translasi Nilai Bisnis ke 7 Vertikal Industri

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

## 10. Panduan Eksekusi, Test Plan & Prosedur Reset

### A. Testing Playbook & Scheduler Deployment
```bash
# Deploy Systemd Timer Harian (10:00 WIB)
ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-poc-scheduler.yml --tags poc_schedule

# Uji Eksekusi Playbook Remediasi Manual
ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/remediate-pool-and-disk.yml \
  -e "incident_id=TEST_123 monitor_id=MON_456 alert_status=ALERT environment=poc requested_action=expand_pool_and_truncate_log"

# Uji Eksekusi Baseline Reset Manual
ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/reset-poc-baseline.yml
```

### B. Prosedur Reset Darurat (Manual Baseline Restoration)
Jika koneksi Controller terputus atau membutuhkan reset manual:
```bash
ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/reset-poc-baseline.yml
```
*(Perintah ini me-reset runtime pool ke 5/5, menghapus trigger, me-truncate log file, dan memverifikasi SHOW CONFIG).*
