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

# 2. Check required tools and Sudo / Root Capability
for required_command in dd findmnt losetup mkfs.ext4 mount mountpoint umount; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "[ERROR] Required command '${required_command}' is unavailable."
    exit 1
  fi
done

SUDO=()
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO=(sudo)
  else
    echo "[ERROR] 'sudo' or root privilege is required to mount loopback filesystem."
    exit 1
  fi
fi

mkdir -p "$LOG_DIR"

# 3. Refuse to disturb any mount that is not backed by this POC image.
if mountpoint -q "$LOG_DIR"; then
  MOUNT_SOURCE=$(findmnt -n -o SOURCE --target "$LOG_DIR")
  MOUNT_FSTYPE=$(findmnt -n -o FSTYPE --target "$LOG_DIR")
  LOOP_REFS=$("${SUDO[@]}" losetup -j "$IMG_FILE" 2>/dev/null || true)

  if [ "$MOUNT_FSTYPE" != "ext4" ] || [[ ! "$MOUNT_SOURCE" =~ ^/dev/loop[0-9]+$ ]] || \
     ! printf '%s\n' "$LOOP_REFS" | awk -F ':' -v source="$MOUNT_SOURCE" \
       '$1 == source { found=1 } END { exit !found }'; then
    echo "[ERROR] Refusing to unmount ${LOG_DIR}: source='${MOUNT_SOURCE}', fstype='${MOUNT_FSTYPE}'"
    echo "        is not the ext4 loop device backed by ${IMG_FILE}."
    exit 1
  fi

  echo "-> Unmounting verified POC volume at ${LOG_DIR}..."
  "${SUDO[@]}" umount "$LOG_DIR"
fi

# Detach only loop devices that reference the exact POC image before replacing it.
while IFS=: read -r loop_device _; do
  [ -n "$loop_device" ] || continue
  echo "-> Detaching stale POC loop device ${loop_device}..."
  "${SUDO[@]}" losetup -d "$loop_device"
done < <("${SUDO[@]}" losetup -j "$IMG_FILE" 2>/dev/null || true)

# 4. Create and format 200MB disk image (-O ^has_journal -m 0)
echo "-> Creating ${SIZE_MB}MB loopback image at ${IMG_FILE}..."
"${SUDO[@]}" dd if=/dev/zero of="$IMG_FILE" bs=1M count="$SIZE_MB" status=none
echo "-> Formatting ext4 filesystem without journal overhead and 0% reserved blocks..."
"${SUDO[@]}" mkfs.ext4 -F -O ^has_journal -m 0 "$IMG_FILE" >/dev/null

# 5. Mount to target directory
echo "-> Mounting loopback filesystem to ${LOG_DIR}..."
"${SUDO[@]}" mount -o loop "$IMG_FILE" "$LOG_DIR"
"${SUDO[@]}" chown "$(id -u):$(id -g)" "$LOG_DIR"
"${SUDO[@]}" chmod 0775 "$LOG_DIR"

# 6. Strict Validation
if ! mountpoint -q "$LOG_DIR"; then
  echo "[ERROR] Failed to mount loopback volume to ${LOG_DIR}."
  exit 1
fi

FSTYPE=$(df -T "$LOG_DIR" | tail -1 | awk '{print $2}')
FS_SIZE=$(df -h "$LOG_DIR" | tail -1 | awk '{print $2}')
MOUNT_SOURCE=$(findmnt -n -o SOURCE --target "$LOG_DIR")
LOOP_REFS=$("${SUDO[@]}" losetup -j "$IMG_FILE" 2>/dev/null || true)

if [ "$FSTYPE" != "ext4" ] || [[ ! "$MOUNT_SOURCE" =~ ^/dev/loop[0-9]+$ ]] || \
   ! printf '%s\n' "$LOOP_REFS" | awk -F ':' -v source="$MOUNT_SOURCE" \
     '$1 == source { found=1 } END { exit !found }'; then
  echo "[ERROR] Expected an ext4 loop device, got source='${MOUNT_SOURCE}', fstype='${FSTYPE}'."
  exit 1
fi

echo "  [OK] Successfully mounted 200MB isolated loopback volume."
echo "       Mountpoint:  ${LOG_DIR}"
echo "       Source:      ${MOUNT_SOURCE}"
echo "       Filesystem:  ${FSTYPE}"
echo "       Usable Size: ${FS_SIZE}"
echo "=========================================================================="
