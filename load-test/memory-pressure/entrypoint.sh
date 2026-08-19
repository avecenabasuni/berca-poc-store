#!/bin/sh

set -eu

memory_bytes=${MEMORY_PRESSURE_BYTES:-1024M}
timeout_seconds=${MEMORY_PRESSURE_TIMEOUT_SECONDS:-1200}

case "$memory_bytes" in
  512M) allocation_bytes=536870912; expected_limit_bytes=805306368 ;;
  768M) allocation_bytes=805306368; expected_limit_bytes=1073741824 ;;
  1024M) allocation_bytes=1073741824; expected_limit_bytes=1342177280 ;;
  1280M) allocation_bytes=1342177280; expected_limit_bytes=1610612736 ;;
  1536M) allocation_bytes=1610612736; expected_limit_bytes=1879048192 ;;
  4096M) allocation_bytes=4294967296; expected_limit_bytes=4563402752 ;;
  6144M) allocation_bytes=6442450944; expected_limit_bytes=6710886400 ;;
  8192M) allocation_bytes=8589934592; expected_limit_bytes=8858370048 ;;
  9216M) allocation_bytes=9663676416; expected_limit_bytes=9932111872 ;;
  9728M) allocation_bytes=10200547328; expected_limit_bytes=10468982784 ;;
  10240M) allocation_bytes=10737418240; expected_limit_bytes=11005853696 ;;
  *)
    echo "[ERROR] MEMORY_PRESSURE_BYTES is not an approved fixed calibration value." >&2
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

total_kib=$(awk '$1 == "MemTotal:" { print $2 }' /proc/meminfo)
available_kib=$(awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo)

case "$total_kib:$available_kib" in
  *[!0-9:]*|:*|*:)
    echo "[ERROR] Host memory state cannot be validated." >&2
    exit 1
    ;;
esac

minimum_total_kib=15728640
maximum_total_kib=17825792
minimum_residual_kib=1572864
allocation_kib=$((allocation_bytes / 1024))

if [ "$total_kib" -lt "$minimum_total_kib" ] || [ "$total_kib" -gt "$maximum_total_kib" ]; then
  echo "[ERROR] Memory fault requires the approved 16 GiB application-VM baseline." >&2
  exit 1
fi

if [ "$available_kib" -lt $((allocation_kib + minimum_residual_kib)) ]; then
  echo "[ERROR] Refusing allocation: projected MemAvailable would fall below the 1.5 GiB safety floor." >&2
  exit 1
fi

echo "[INFO] Starting bounded low-CPU memory pressure: allocation=$memory_bytes timeout=${timeout_seconds}s"

exec /usr/local/bin/berca-memory-holder "$allocation_bytes" "$timeout_seconds"
