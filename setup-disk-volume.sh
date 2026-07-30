#!/bin/bash
# setup-disk-volume.sh — Setup 200MB Isolated Loopback Disk Mount for POC Log Saturation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/docker/log-saturation/data"
IMG_FILE="/tmp/poc-log-disk.img"
SIZE_MB=200

echo "=========================================================================="
echo "  PREFLIGHT & ISOLATED 200MB LOOPBACK DISK SETUP"
echo "=========================================================================="

# 1. Linux OS Preflight Check
if [ "$(uname -s)" != "Linux" ]; then
  echo "[ERROR] This POC disk saturation setup requires Linux native Docker Engine."
  echo "        Current OS '$(uname -s)' is not supported for real loopback filesystem mounts."
  exit 1
fi

# 2. Check Sudo / Root Capability
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "[ERROR] 'sudo' or root privilege is required to mount loopback filesystem."
    exit 1
  fi
fi

mkdir -p "$LOG_DIR"

# 3. Unmount existing volume if mounted
if mountpoint -q "$LOG_DIR"; then
  echo "-> Unmounting existing volume at ${LOG_DIR}..."
  $SUDO umount -f "$LOG_DIR"
fi

# 4. Create and format 200MB disk image (-O ^has_journal -m 0)
echo "-> Creating ${SIZE_MB}MB loopback image at ${IMG_FILE}..."
dd if=/dev/zero of="$IMG_FILE" bs=1M count="$SIZE_MB" status=none
echo "-> Formatting ext4 filesystem without journal overhead and 0% reserved blocks..."
mkfs.ext4 -F -O ^has_journal -m 0 "$IMG_FILE" >/dev/null

# 5. Mount to target directory
echo "-> Mounting loopback filesystem to ${LOG_DIR}..."
$SUDO mount -o loop "$IMG_FILE" "$LOG_DIR"
$SUDO chmod 777 "$LOG_DIR"

# 6. Strict Validation
if ! mountpoint -q "$LOG_DIR"; then
  echo "[ERROR] Failed to mount loopback volume to ${LOG_DIR}."
  exit 1
fi

FSTYPE=$(df -T "$LOG_DIR" | tail -1 | awk '{print $2}')
FS_SIZE=$(df -h "$LOG_DIR" | tail -1 | awk '{print $2}')

echo "  [OK] Successfully mounted 200MB isolated loopback volume."
echo "       Mountpoint:  ${LOG_DIR}"
echo "       Filesystem:  ${FSTYPE}"
echo "       Usable Size: ${FS_SIZE}"
echo "=========================================================================="
