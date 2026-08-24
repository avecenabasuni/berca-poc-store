#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly PROJECT_PATH="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly STACK_TEMPLATE="${SCRIPT_DIR}/berca-poc-stack.service.example"
readonly API_TEMPLATE="${SCRIPT_DIR}/demo-control-api.service.example"
readonly STACK_UNIT="/etc/systemd/system/berca-poc-stack.service"
readonly API_UNIT="/etc/systemd/system/berca-poc-demo-control.service"
readonly API_ENV="/etc/berca-poc/demo-control-api.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERROR] Run this installer as root: sudo bash ops/install-vm-autostart.sh" >&2
  exit 1
fi

for command_name in docker systemctl systemd-analyze install sed grep mktemp rm chown chmod; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "[ERROR] Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] Docker Compose v2 is unavailable." >&2
  exit 1
fi

for required_file in \
  "${PROJECT_PATH}/docker-compose.yml" \
  "${PROJECT_PATH}/.env" \
  "${PROJECT_PATH}/tools/demo-control-api.py" \
  "${PROJECT_PATH}/demo-control.sh" \
  "${STACK_TEMPLATE}" \
  "${API_TEMPLATE}" \
  "${API_ENV}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "[ERROR] Required file is missing: ${required_file}" >&2
    exit 1
  fi
done

if grep -Eq \
  '(<REPLACE_WITH_|<CALIBRATED_|/absolute/path/to/berca-poc-store)' \
  "${API_ENV}"; then
  echo "[ERROR] Replace every placeholder in ${API_ENV} before installation." >&2
  exit 1
fi

if [[ ! -s "${PROJECT_PATH}/.env" ]]; then
  echo "[ERROR] ${PROJECT_PATH}/.env is empty." >&2
  exit 1
fi

chown root:root "${API_ENV}"
chmod 0600 "${API_ENV}"

docker compose --project-directory "${PROJECT_PATH}" config --quiet

escaped_project_path="${PROJECT_PATH//\/\\}"
escaped_project_path="${escaped_project_path//&/\&}"
escaped_project_path="${escaped_project_path//|/\|}"

stack_tmp="$(mktemp)"
api_tmp="$(mktemp)"
cleanup() {
  rm -f -- "${stack_tmp}" "${api_tmp}"
}
trap cleanup EXIT

sed "s|@POC_PROJECT_PATH@|${escaped_project_path}|g" \
  "${STACK_TEMPLATE}" >"${stack_tmp}"
sed "s|@POC_PROJECT_PATH@|${escaped_project_path}|g" \
  "${API_TEMPLATE}" >"${api_tmp}"

if grep -q '@POC_PROJECT_PATH@' "${stack_tmp}" "${api_tmp}"; then
  echo "[ERROR] Failed to render the systemd unit templates." >&2
  exit 1
fi

install -m 0644 "${stack_tmp}" "${STACK_UNIT}"
install -m 0644 "${api_tmp}" "${API_UNIT}"

systemd-analyze verify "${STACK_UNIT}" "${API_UNIT}"
systemctl daemon-reload
systemctl enable --now docker.service
systemctl enable --now berca-poc-stack.service
systemctl enable --now berca-poc-demo-control.service

echo "[OK] Berca POC VM autostart is installed and active."
systemctl --no-pager --full status \
  berca-poc-stack.service \
  berca-poc-demo-control.service
