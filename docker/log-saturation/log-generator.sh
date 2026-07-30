#!/bin/sh
# docker/log-saturation/log-generator.sh
# Container script to simulate high-rate application & transaction log saturation

LOG_FILE="/var/log/poc-app/app-saturation.log"
TARGET_MB=170  # Target log file size in MB (85% of 200MB volume)

mkdir -p /var/log/poc-app

# If trigger file exists, run saturation log generation
if [ -f "/var/log/poc-app/.trigger_saturation" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting log saturation generation..."

  # Generate 100KB chunks of JSON log lines rapidly
  CHUNK="{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"ERROR\",\"service\":\"medusa-backend\",\"event\":\"transaction_retry_failed\",\"error_code\":\"ERR_DB_POOL_EXHAUSTED\",\"details\":\"Connection acquire timeout after 10000ms waiting for pgbouncer slot. Retrying operation...\"}"

  count=0
  while [ -f "/var/log/poc-app/.trigger_saturation" ]; do
    CURRENT_SIZE_MB=$(du -m "$LOG_FILE" 2>/dev/null | awk '{print $1}')
    CURRENT_SIZE_MB=${CURRENT_SIZE_MB:-0}

    if [ "$CURRENT_SIZE_MB" -ge "$TARGET_MB" ]; then
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
