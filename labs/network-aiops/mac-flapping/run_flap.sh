#!/usr/bin/env bash
set -euo pipefail

# Tested lab setting: 40 alternating rounds with a 0.4s interval.
COUNT="${1:-40}"
DELAY="${FLAP_DELAY:-0.4}"

if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || (( COUNT < 1 || COUNT > 200 )); then
  echo 'Usage: ./run_flap.sh [alternating rounds (1-200); default 40]' >&2
  exit 2
fi

for (( i=1; i<=COUNT; i++ )); do
  echo "Round $i/$COUNT: Host A -> Host B (same source MAC)"
  sudo docker exec clab-macflap-host-a python3 /send_frame.py 198.18.0.11
  sleep "$DELAY"
  sudo docker exec clab-macflap-host-b python3 /send_frame.py 198.18.0.12
  sleep "$DELAY"
done
