#!/bin/sh
# docker/log-saturation/log-generator.sh
# Container script to simulate high-rate application & transaction log saturation

set -e

LOG_DIR="/var/log/poc-app"
LOG_FILE="${LOG_DIR}/app-saturation.log"
TRIGGER_FILE="${LOG_DIR}/.trigger_saturation"
TARGET_PCT=85

mkdir -p "$LOG_DIR"

if [ -f "$TRIGGER_FILE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [LOG GENERATOR] Saturation trigger detected. Starting log explosion..."

  CHUNK="{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"ERROR\",\"service\":\"medusa-backend\",\"event\":\"transaction_retry_failed\",\"error_code\":\"ERR_DB_POOL_EXHAUSTED\",\"details\":\"Connection acquire timeout waiting for pgbouncer slot. Retrying operation...\"}"

  while [ -f "$TRIGGER_FILE" ]; do
    # Extract current percentage used from df output
    USED_PCT=$(df -P "$LOG_DIR" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%')
    USED_PCT=${USED_PCT:-0}

    if [ "$USED_PCT" -ge "$TARGET_PCT" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [LOG GENERATOR] Reached target disk usage: ${USED_PCT}% >= ${TARGET_PCT}%. Holding capacity."
      sleep 5
      continue
    fi

    # Write high-speed batch of 5000 lines per iteration
    i=0
    while [ $i -lt 5000 ]; do
      if ! echo "$CHUNK" >> "$LOG_FILE" 2>/dev/null; then
        echo "[LOG GENERATOR] Write limit encountered." >&2
        sleep 2
        break
      fi
      i=$((i + 1))
    done

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [LOG GENERATOR] Current disk usage: ${USED_PCT}% / ${TARGET_PCT}% target."
    sleep 0.05
  done
else
  if [ ! -f "$LOG_FILE" ]; then
    echo "{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"INFO\",\"service\":\"medusa-backend\",\"event\":\"service_ready\"}" > "$LOG_FILE"
  fi
fi
