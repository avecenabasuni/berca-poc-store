#!/bin/sh

set -eu

memory_bytes=${MEMORY_PRESSURE_BYTES:-1024M}
timeout_seconds=${MEMORY_PRESSURE_TIMEOUT_SECONDS:-1200}

case "$memory_bytes" in
  512M) expected_limit_bytes=805306368 ;;
  768M) expected_limit_bytes=1073741824 ;;
  1024M) expected_limit_bytes=1342177280 ;;
  1280M) expected_limit_bytes=1610612736 ;;
  1536M) expected_limit_bytes=1879048192 ;;
  *)
    echo "[ERROR] MEMORY_PRESSURE_BYTES must be one of 512M, 768M, 1024M, 1280M, or 1536M." >&2
    exit 64
    ;;
esac

if [ "$timeout_seconds" != "1200" ]; then
  echo "[ERROR] MEMORY_PRESSURE_TIMEOUT_SECONDS is fixed at 1200 seconds." >&2
  exit 64
fi

if [ -r /sys/fs/cgroup/memory.max ]; then
  actual_limit_bytes=$(cat /sys/fs/cgroup/memory.max)
elif [ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
  actual_limit_bytes=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
else
  echo "[ERROR] The container memory limit cannot be verified." >&2
  exit 1
fi

if [ "$actual_limit_bytes" != "$expected_limit_bytes" ]; then
  echo "[ERROR] Container memory limit must be exactly 256 MiB above the fixed allocation." >&2
  exit 1
fi

echo "[INFO] Starting bounded POC memory pressure: bytes=$memory_bytes timeout=${timeout_seconds}s"

exec stress-ng \
  --vm 1 \
  --vm-bytes "$memory_bytes" \
  --vm-keep \
  --vm-populate \
  --timeout "${timeout_seconds}s" \
  --metrics-brief
