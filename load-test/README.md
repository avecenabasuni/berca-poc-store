# Berca hero demo load-test assets

The canonical design and live-demo procedure are in
[`UNIFIED-POC.md`](UNIFIED-POC.md). Pool and disk faults are always run
separately through the repository control interface:

```bash
./demo-control.sh pool
./demo-control.sh recover-pool
./demo-control.sh disk
./demo-control.sh recover-disk
./demo-control.sh reset
./demo-control.sh status
```

Active files in this directory:

- `baseline-traffic.js`: continuous hybrid storefront traffic, bounded organic
  user behavior, and a real guest order every five minutes.
- `entrypoint.sh`: validates the publishable key, waits for the backend and
  storefront, and starts the six-hour k6 traffic cycle.
- `pgbench-saturation.sql`: bounded `pg_sleep` workload used only by the
  opt-in `pool-hog` Compose profile.
- `AUTOSCALE-POC.md`: approval-gated storefront scale-out scenario.
- `DEPLOYMENT-ROLLBACK-POC.md`: GHCR-backed storefront regression and
  approval-gated rollback scenario.
- `RHEL10-NUTANIX-VULNERABILITY-REMEDIATION-POC.md`: isolated RHEL 10 host
  vulnerability detection, approval-gated Red Hat advisory patching, and
  Nutanix snapshot-based demo reset.
- `datadog/WORKFLOW-CONTRACT.md`: Datadog UI workflow, monitor, classifier,
  verification, and escalation contract.
- `datadog/ANSIBLE-HANDOFF.md`: bounded EDA event contract and ownership
  boundary for the Red Hat Ansible owner.
- `datadog/classify-conclusions.mjs`: fail-closed reference classifier, with
  its Node test file alongside it.

The former combined 15-minute runner, standalone spike scripts, scheduler, and
repository-owned Ansible implementation were removed because they are outside
the final sales-demo scope.
