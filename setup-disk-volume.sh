#!/bin/bash
# setup-disk-volume.sh — Setup 200MB Isolated Loopback Disk Mount for POC Log Saturation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
IMG_FILE="/tmp/poc-log-disk.img"
SIZE_MB=200

mkdir -p "$LOG_DIR"

echo "=========================================================================="
echo "  SETTING UP ISOLATED 200MB LOOPBACK DISK VOLUME FOR POC LOG SATURATION"
echo "=========================================================================="

# Create 200MB disk image if not present
if [ ! -f "$IMG_FILE" ]; then
  echo "-> Creating ${SIZE_MB}MB disk image at ${IMG_FILE}..."
  dd if=/dev/zero of="$IMG_FILE" bs=1M count="$SIZE_MB" status=none
  mkfs.ext4 -F "$IMG_FILE" >/dev/null 2>&1
  echo "  [OK] Formatted 200MB ext4 disk image."
fi

# Check if already mounted
if mountpoint -q "$LOG_DIR"; then
  echo "  [OK] ${LOG_DIR} is already mounted as an isolated filesystem."
else
  echo "-> Mounting loopback volume to ${LOG_DIR}..."
  if command -v sudo >/dev/null 2>&1; then
    sudo mount -o loop "$IMG_FILE" "$LOG_DIR" || {
      echo "[WARN] Could not mount loop device with sudo; fallback to local directory."
    }
    sudo chmod 777 "$LOG_DIR" || true
  else
    mount -o loop "$IMG_FILE" "$LOG_DIR" || true
    chmod 777 "$LOG_DIR" || true
  fi
  echo "  [OK] Mounted 200MB loopback filesystem to ${LOG_DIR}."
fi

echo "=========================================================================="
