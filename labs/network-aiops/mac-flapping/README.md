# Network AIOps: MAC Flapping Lab

A reproducible Layer 2 MAC flapping lab running **Nokia SR Linux 25.3.1** with **Containerlab**. Intended as the network fault-injection stage of a Datadog + AI classification + Ansible AAP remediation demonstration.

> Status: MAC duplication fault injection was confirmed in the lab. Datadog Syslog ingestion and Ansible remediation are **still being integrated and have not yet been verified end-to-end**.

## Scenario

- A Nokia SR Linux switch uses a MAC-VRF named **mac-flap**, bridging ethernet-1/1.1 and ethernet-1/2.1.
- Two Linux traffic-generator containers transmit ARP broadcasts with the same spoofed source MAC **02:00:00:00:00:aa** on separate switch ports.
- Repeated MAC moves can cross SR Linux MAC duplication thresholds and produce device evidence.
- This deliberately demonstrates **duplicate MAC movement**, not proof of a physical Layer 2 loop.

## Requirements

- Ubuntu Linux (tested host: Ubuntu Server 22.04 running as a Nutanix AHV VM)
- Docker Engine and Containerlab
- Nokia SR Linux container image availability: ghcr.io/nokia/srlinux:25.3.1
- Privileged Docker access on an **isolated lab network**; do not connect the spoofing traffic to production networks.

## Deploy

~~~bash
cd labs/network-aiops/mac-flapping
sudo containerlab deploy -t macflap.clab.yml
sudo containerlab inspect -t macflap.clab.yml
~~~

Containers: clab-macflap-sw1, clab-macflap-host-a, clab-macflap-host-b.

## Verify the switch

~~~bash
sudo docker exec -it clab-macflap-sw1 sr_cli
~~~

From SR Linux CLI:

~~~text
show network-instance mac-flap summary
show network-instance mac-flap bridge-table mac-table all
show network-instance mac-flap bridge-table mac-duplication duplicate-entries
~~~

The MAC-VRF should bridge ethernet-1/1.1 and ethernet-1/2.1.

## Trigger MAC flapping

In a separate Ubuntu terminal:

~~~bash
chmod +x run_flap.sh
./run_flap.sh
~~~

Default is **40 alternating rounds** with **0.4 seconds between sends**. The initial 16-round / 0.15-second settings did not reliably trigger the event on the first attempt.

Customize if needed:

~~~bash
./run_flap.sh 40
FLAP_DELAY=0.4 ./run_flap.sh 40
~~~

Watch the MAC duplication state in SR Linux CLI:

~~~text
show network-instance mac-flap bridge-table mac-duplication duplicate-entries
~~~

Inspect local device logs (path may vary by image/version):

~~~bash
sudo docker exec clab-macflap-sw1 sh -lc 'tail -n 80 /var/log/srlinux/debug/sr_l2_mac_mgr.log'
~~~

The configuration uses **num-moves 3**, **monitoring-window 1 minute**, **hold-down-time 3 minutes**, and **action stop-learning**. A second test inside the hold-down interval may not produce a new detection event. Confirm current MAC table / duplicate entries before repeating.

## Datadog and Ansible integration (in progress)

The target flow is:

1. Nokia logs a MAC duplication event.
2. Nokia forwards its bridge-table Syslog events to a Datadog Agent UDP listener.
3. Datadog log monitor triggers a workflow.
4. AI-assisted investigation evaluates diagnostic evidence instead of treating every MAC move as a confirmed loop.
5. Ansible AAP performs an approved, predefined remediation only after validating the affected interface.
6. Datadog and read-only checks confirm that duplicate MAC movement stopped.

The Docker Containerlab management gateway is environment-dependent; discover it instead of hardcoding an IP:

~~~bash
sudo docker inspect clab-macflap-sw1 \
  --format '{{range $name, $cfg := .NetworkSettings.Networks}}{{println $name $cfg.Gateway $cfg.IPAddress}}{{end}}'
~~~

Do not store Datadog API keys, Ansible credentials, or live private network addresses in this public repository. The baseline switch config intentionally does **not** include site-specific remote Syslog destinations.

## Cleanup

~~~bash
sudo containerlab destroy -t macflap.clab.yml
~~~

This lab is separate from the Day 2 OSPF experiment. Destroy only the topology you intend to stop.

## References

- https://containerlab.dev/manual/kinds/srl/
- https://containerlab.dev/manual/kinds/linux/
- https://documentation.nokia.com/srlinux/25-3/books/vpn-services/layer-2-services-infrastructure.html
