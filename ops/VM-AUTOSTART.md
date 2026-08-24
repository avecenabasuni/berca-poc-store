# Berca POC VM Autostart

The VM boot contract is:

```text
systemd starts Docker
  -> berca-poc-stack.service bootstraps the baseline Compose services
  -> berca-poc-demo-control.service starts the host control API
  -> Docker restart policies keep baseline containers running after crashes
```

The baseline unit starts only:

- PostgreSQL
- Redis
- PgBouncer
- Medusa backend
- Traefik
- Storefront
- Organic traffic generator
- Synthetic log consumer
- Datadog Agent

The `pool-hog`, `traffic-spike`, and `memory-pressure` services remain opt-in.
They use Compose profiles and `restart: "no"`, so a VM reboot never injects a
fault automatically.

The stack unit is a boot bootstrap, not a second container supervisor. Docker
owns runtime restart behavior through each baseline service's
`restart: unless-stopped` policy.

## One-time installation on the Linux VM

Run these commands from the repository root. The repository must already have
the production images and a populated root `.env` file.

```bash
cp -n .env.example .env
chmod 0600 .env
```

Set at least `DD_API_KEY`, `DD_SITE`, `MEDUSA_PUBLISHABLE_KEY`, and
`STOREFRONT_PUBLIC_URL` in `.env`. Do not commit the populated file.

Prepare the existing Demo Control API environment if it has not been installed
yet:

```bash
sudo install -d -m 0700 /etc/berca-poc

if [ ! -f /etc/berca-poc/demo-control-api.env ]; then
  sudo install -m 0600 \
    ops/demo-control-api.env.example \
    /etc/berca-poc/demo-control-api.env
fi

sudoedit /etc/berca-poc/demo-control-api.env
```

Replace every placeholder, then run the idempotent installer:

```bash
sudo bash ops/install-vm-autostart.sh
```

The installer resolves the repository's absolute path, renders both unit
templates, validates Compose and systemd, and enables Docker, the baseline
stack bootstrap, and the Demo Control API.

### Manual installation reference

Install the baseline stack unit with the absolute repository path:

```bash
POC_PROJECT_PATH="$(pwd -P)"

sudo install -m 0644 \
  ops/berca-poc-stack.service.example \
  /etc/systemd/system/berca-poc-stack.service

sudo sed -i \
  "s|@POC_PROJECT_PATH@|${POC_PROJECT_PATH}|g" \
  /etc/systemd/system/berca-poc-stack.service
```

Install the Demo Control API unit the same way if the installer cannot be used:

```bash
sudo install -m 0644 \
  ops/demo-control-api.service.example \
  /etc/systemd/system/berca-poc-demo-control.service

sudo sed -i \
  "s|@POC_PROJECT_PATH@|${POC_PROJECT_PATH}|g" \
  /etc/systemd/system/berca-poc-demo-control.service
```

Replace all placeholders in `/etc/berca-poc/demo-control-api.env`. Keep the
file root-owned with mode `0600`.

Verify and enable the complete boot chain:

```bash
sudo systemd-analyze verify \
  /etc/systemd/system/berca-poc-stack.service \
  /etc/systemd/system/berca-poc-demo-control.service

sudo systemctl daemon-reload
sudo systemctl enable --now docker.service
sudo systemctl enable --now berca-poc-stack.service
sudo systemctl enable --now berca-poc-demo-control.service
```

`berca-poc-stack.service` uses `docker compose up -d --no-build`. This prevents
an unexpected source build during VM boot. Build or pull the required images
before enabling the unit.

## Validation before reboot

```bash
sudo systemctl is-enabled docker.service
sudo systemctl is-enabled berca-poc-stack.service
sudo systemctl is-enabled berca-poc-demo-control.service

sudo systemctl status berca-poc-stack.service --no-pager
sudo systemctl status berca-poc-demo-control.service --no-pager

docker compose ps
curl -fsS http://127.0.0.1:8000/api/healthz
curl -fsS http://127.0.0.1:18080/healthz
```

Confirm every baseline container has a restart policy:

```bash
for id in $(docker compose ps -q); do
  docker inspect \
    --format '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}} status={{.State.Status}}' \
    "$id"
done
```

## Reboot acceptance test

```bash
sudo reboot
```

After SSH becomes available again:

```bash
systemctl is-active docker.service
systemctl is-active berca-poc-stack.service
systemctl is-active berca-poc-demo-control.service

docker compose ps
curl -fsS http://127.0.0.1:8000/api/healthz
curl -fsS http://127.0.0.1:18080/healthz
```

Expected results:

- All three systemd units report `active`.
- Baseline containers are running and health checks converge to `healthy`.
- Datadog Agent is healthy and resumes telemetry.
- No fault-profile container is running.

Check failures with:

```bash
journalctl -u berca-poc-stack.service -b --no-pager
journalctl -u berca-poc-demo-control.service -b --no-pager
docker compose ps -a
docker compose logs --tail=200
```

Because systemd runs `docker compose up`, the baseline stack is recreated even
if containers were previously removed. A deliberately stopped baseline service
is restored on the next stack-unit start or VM boot. During normal runtime,
Docker alone applies the per-container restart policies.
