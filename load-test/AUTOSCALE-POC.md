# POC Storefront Autoscaling dengan Datadog Approval

Use case ini terpisah dari POC PgBouncer dan disk saturation. Targetnya
`berca-storefront`; backend Medusa dan database tidak diskalakan.

## Arsitektur

```text
User / traffic-spike
  -> Traefik :8000
  -> berca-storefront (baseline 1 replica, scale-out 2 replica)
  -> berca-backend :9000 (tetap 1 replica)

Datadog capacity-pressure monitor
  -> Slack Make a decision (Approve / Reject)
  -> Demo Control API
  -> docker compose scale storefront=2
  -> telemetry verification
```

Traefik adalah satu-satunya publisher port `8000`. `storefront` tidak memiliki
`container_name` atau host port, sehingga Docker Compose dapat menjalankan dua
replica di belakang load balancer.

## Guardrail

- Hanya berlaku pada `env:poc` dan service `berca-storefront`.
- Baseline tepat satu replica; scale-out hanya `1 -> 2`.
- Pool fault, disk fault, atau Demo Control job aktif menolak scale-out.
- Traffic spike harus aktif sebelum scale-out dapat dieksekusi.
- API tidak menerima host, compose path, service, URL, rate, VU, command, atau
  replica count dari request.
- Scale-in tidak otomatis: presenter menghentikan spike lalu reset ke satu
  replica sesudah monitor normal.

## API contract

Gunakan Datadog Connection dengan `DEMO_SCALE_CONTROL_TOKEN`, terpisah dari
token fault dan remediation.

| Action | Tujuan |
|---|---|
| `start-storefront-spike` | Menjalankan fixed k6 spike profile pada VM |
| `stop-storefront-spike` | Menghentikan dan menghapus container spike |
| `scale-storefront-to-2` | Mengubah tepat satu storefront replica menjadi dua |
| `reset-storefront-scale` | Mengubah storefront kembali ke satu replica |

Request selalu tepat seperti ini:

```json
{"action":"scale-storefront-to-2"}
```

`POST /v1/demo/action` mengembalikan `202 Accepted` dan `job_id`; polling
`GET /v1/demo/status` membuktikan execution status, bukan service recovery.
Status menyediakan `storefront_replicas`, `storefront_healthy`,
`traefik_healthy`, `autoscale_spike_active`, dan `autoscale_state`.

## Konfigurasi VM dan calibration

Tambahkan ke file root-owned systemd API, misalnya
`/etc/berca-poc/demo-control-api.env`:

```text
DEMO_SCALE_CONTROL_TOKEN=<RANDOM_32_PLUS_CHARACTERS>
DEMO_CONTROL_ENVIRONMENT=poc
AUTOSCALE_SPIKE_RATE=<CALIBRATED_INTEGER_1_TO_240>
```

Rate tidak masuk Git dan tidak dapat ditimpa lewat API. Restart API setelah
mengubah file:

```bash
sudo systemctl restart berca-poc-demo-control.service
```

1. Ukur 15 menit p95 dan request rate storefront pada `/id` serta `/id/store`.
2. Mulai dari rate 10; naikkan hanya lewat file VM sampai p95 melampaui
   threshold selama dua menit tanpa memory pressure atau container failure.
3. Simpan monitor dengan policy:

```text
p95 > max(2 x measured baseline p95, 1.5 seconds)
AND request rate >= 4 x measured baseline
for two consecutive one-minute windows
```

Nama APM resource dan query metric harus direkam dari tenant Datadog Lab
sebelum monitor dipublikasikan.

## Datadog Workflows

### POC - Start Storefront Scale Test

Workflow manual memakai input enum `start | stop | reset` dengan mapping fixed:

```text
start -> start-storefront-spike
stop  -> stop-storefront-spike
reset -> reset-storefront-scale
```

Workflow memerlukan `202`, menyimpan `job_id`, lalu polling API sampai terminal.

### POC - Approved Storefront Scale-Out

Trigger hanya pada transisi ALERT monitor `POC - Berca Storefront Capacity
Pressure`.

1. GET status API.
2. Gagal aman kecuali state `spike_running`, replica `1`, storefront dan
   Traefik sehat, serta pool/disk fault tidak aktif.
3. Slack **Make a decision** menampilkan p95, request rate, replica `1`, dan
   target `2`.
4. **Approve** POST `scale-storefront-to-2`; **Reject** tidak mengubah VM dan
   mengirim audit message Slack.
5. Poll job sampai terminal state.
6. Tunggu 30 detik lalu query telemetry maksimal tiga kali setiap 15 detik.
7. Sukses hanya bila dua replica sehat, p95 normal, error rate aman, dan
   `/api/healthz` OK. Jika gagal, Slack escalation dikirim tanpa action lain.

Gunakan service account dan Connection yang hanya memiliki token scale-control.

## Live demo dan validation

1. Tunjukkan Traefik sehat, satu replica storefront, dan monitor OK.
2. Jalankan `start`; tunjukkan capacity pressure di Datadog.
3. Pilih **Reject** sekali untuk membuktikan tidak ada perubahan.
4. Jalankan ulang jika perlu dan pilih **Approve**.
5. Tunjukkan dua replica sehat dan telemetry pulih ketika spike tetap aktif.
6. Jalankan `stop`, tunggu monitor OK, lalu jalankan `reset`.

```bash
docker compose config --quiet
docker compose ps traefik storefront
sudo -E ./demo-control.sh status
curl -fsS http://127.0.0.1:8000/api/healthz
docker compose run --rm --no-deps --entrypoint k6 traffic-spike \
  inspect /scripts/storefront-scale-spike.js
python3 -m unittest tools/tests/test_demo_control_api.py
```

Setelah API transport lulus, owner Ansible mengganti hanya dispatch dengan Job
Template fixed **Scale Storefront to 2** dan **Reset Storefront Scale**.
Inventory, compose path, service, dan replica count ditetapkan pada native
Ansible tasks, bukan dikirim dari Datadog.
