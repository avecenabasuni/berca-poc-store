#!/bin/sh
# docker/log-saturation/log-generator.sh
# Container script to simulate high-rate application & transaction log saturation

LOG_DIR="/var/log/poc-app"
LOG_FILE="${LOG_DIR}/app-saturation.log"

mkdir -p "$LOG_DIR"

# If trigger file exists, run saturation log generation
if [ -f "${LOG_DIR}/.trigger_saturation" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting log saturation generation..."

  # Calculate target dynamically: 85% of actual usable filesystem capacity (in KB)
  TOTAL_KB=$(df -k "$LOG_DIR" 2>/dev/null | tail -1 | awk '{print $2}')
  TOTAL_KB=${TOTAL_KB:-200000}
  TARGET_KB=$(( TOTAL_KB * 85 / 100 ))

  # Chunk of JSON log line
  CHUNK="{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"ERROR\",\"service\":\"medusa-backend\",\"event\":\"transaction_retry_failed\",\"error_code\":\"ERR_DB_POOL_EXHAUSTED\",\"details\":\"Connection acquire timeout after 10000ms waiting for pgbouncer slot. Retrying operation...\"}"

  while [ -f "${LOG_DIR}/.trigger_saturation" ]; do
    CURRENT_SIZE_KB=$(du -k "$LOG_FILE" 2>/dev/null | awk '{print $1}')
    CURRENT_SIZE_KB=${CURRENT_SIZE_KB:-0}

    if [ "$CURRENT_SIZE_KB" -ge "$TARGET_KB" ]; then
      # Hold at 85% capacity for the remainder of the test
      sleep 5
      continue
    fi

    # Append log batch
    i=0
    while [ $i -lt 500 ]; do
      echo "$CHUNK" >> "$LOG_FILE"
      i=$((i + 1))
    done

    sleep 0.2
  done
else
  # Baseline state: maintain small log file
  if [ ! -f "$LOG_FILE" ]; then
    echo "{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"INFO\",\"service\":\"medusa-backend\",\"event\":\"service_ready\"}" > "$LOG_FILE"
  fi
fi
