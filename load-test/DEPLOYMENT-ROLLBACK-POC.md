# POC Rollback Deployment Storefront

Use case ini menambahkan deployment regression untuk `berca-storefront` tanpa mengubah Medusa backend, PostgreSQL, PgBouncer, cart, checkout, atau order.

```text
Workflow manual deploy demo-bad release
  -> katalog /id/store lambat lalu HTTP 503
  -> Datadog deployment-regression monitor ALERT
  -> Slack Approve / Reject
  -> rollback ke stable GHCR digest
  -> telemetry verification
```

## Artifact release

GitHub Actions **Publish POC storefront rollback releases** membangun dua image immutable dari Git ref yang sama:

```text
ghcr.io/avecenabasuni/berca-storefront:stable-<12-char-git-sha>
ghcr.io/avecenabasuni/berca-storefront:demo-bad-<12-char-git-sha>
```

Set repository variable `STOREFRONT_PUBLIC_URL` dan repository secret `MEDUSA_PUBLISHABLE_KEY`, lalu pastikan package GHCR private. Salin digest yang dihasilkan workflow ke VM; tag tidak dipakai sebagai runtime release.

Candidate hanya memengaruhi `/id/store`: response menunggu 2,5 detik lalu memberi `503`. `/api/healthz` tetap `200`, sehingga demo menunjukkan release yang lolos startup healthcheck namun merusak pengalaman pengguna.

## Konfigurasi VM

Siapkan GHCR credential root dengan `read:packages`, pull kedua digest, lalu buat konfigurasi root-owned:

```bash
sudo install -d -m 0700 /etc/berca-poc
sudo install -m 0600 ops/storefront-release.env.example \
  /etc/berca-poc/storefront-release.env
sudoedit /etc/berca-poc/storefront-release.env
```

```dotenv
STOREFRONT_STABLE_IMAGE=ghcr.io/avecenabasuni/berca-storefront@sha256:<stable-digest>
STOREFRONT_STABLE_VERSION=stable-<12-char-git-sha>
STOREFRONT_BAD_IMAGE=ghcr.io/avecenabasuni/berca-storefront@sha256:<demo-bad-digest>
STOREFRONT_BAD_VERSION=demo-bad-<12-char-git-sha>
```

File wajib `root:root`, mode `0600`. Control script hanya menerima repository GHCR ini, SHA-256 digest, serta version prefix `stable-` atau `demo-bad-`.

```bash
sudo docker pull <STOREFRONT_STABLE_IMAGE>
sudo docker pull <STOREFRONT_BAD_IMAGE>
sudo ./demo-control.sh reset-storefront-deployment
sudo ./demo-control.sh status | jq
```

Tambahkan token unik ke `/etc/berca-poc/demo-control-api.env` dan restart API:

```dotenv
DEMO_DEPLOYMENT_CONTROL_TOKEN=<random-32-plus-character-token>
```

```bash
sudo chmod 0600 /etc/berca-poc/demo-control-api.env
sudo systemctl restart berca-poc-demo-control.service
```

## API dan workflow Datadog

Connection deployment-control hanya memakai token deployment. Request selalu berisi satu action fixed:

| Action | Tujuan |
|---|---|
| `deploy-storefront-demo-bad` | Memasang candidate digest yang di-whitelist |
| `rollback-storefront-stable` | Mengembalikan candidate ke stable digest |
| `reset-storefront-deployment` | Memastikan stable release aktif |

Workflow **POC - Deploy Storefront Regression** memiliki enum `deploy | reset` dan mapping fixed ke action deploy atau reset. Setelah deploy sukses, kirim deployment/change event dengan `service:berca-storefront`, `env:poc`, version, digest, dan Git SHA.

Monitor **POC - Berca Storefront Deployment Regression** hanya memantau impact layanan: error rate atau p95 `berca-storefront` pada `env:poc`. Kalibrasi query dan threshold dari telemetry VM; monitor tidak menyebut candidate atau root cause.

Workflow rollback yang dipicu monitor harus gagal aman kecuali status API menunjukkan: `environment=poc`, release `demo_bad`, satu replica sehat, Traefik sehat, tanpa pool/disk fault, tanpa autoscale spike, dan tanpa job aktif. Ia mengirim Slack **Approve / Reject**. Approve hanya mengirim:

```json
{"action":"rollback-storefront-stable"}
```

Reject tidak mengubah VM dan mengirim escalation. Setelah rollback, tunggu 30 detik lalu query telemetry maksimal tiga kali tiap 15 detik. Sukses hanya jika version stable terlihat, `/api/healthz` dan `/id/store` sehat, p95 normal, serta error rate aman. HTTP `202` dan job API `succeeded` hanya execution evidence.

## Manual validation dan Ansible handoff

```bash
sudo ./demo-control.sh deploy-storefront-demo-bad
curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/api/healthz
curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/id/store
sudo ./demo-control.sh rollback-storefront-stable
curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/id/store
```

Expected candidate: healthcheck `200`, catalog `503`, state `demo_bad`. Expected rollback: catalog `200`, state `stable`. Deployment action ditolak bila pool/disk fault atau autoscale spike aktif; autoscaling juga ditolak selama candidate aktif.

Owner Ansible nantinya menyediakan Job Template fixed **Rollback Storefront to Stable** dan **Reset Storefront Deployment**. Host, image digest, registry, Compose path, dan credential dikunci di inventory/credential Ansible. Datadog tidak mengirim image, host, tag, path, command, atau extra variable bebas.
