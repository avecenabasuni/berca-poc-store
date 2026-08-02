import os
import time

from datadog_checks.base import AgentCheck


class PocSyntheticLogCheck(AgentCheck):
    def __init__(self, name, init_config, instances):
        super().__init__(name, init_config, instances)
        self._last_bytes = None
        self._last_timestamp = None

    def check(self, instance):
        log_path = instance.get("log_path", "/var/log/poc-app/app-saturation.log")
        trigger_path = instance.get(
            "trigger_path", "/var/log/poc-app/.trigger_saturation"
        )
        tags = instance.get("tags", [])
        now = time.monotonic()

        try:
            log_bytes = os.path.getsize(log_path)
        except FileNotFoundError:
            log_bytes = 0

        growth_rate = 0.0
        if self._last_bytes is not None and self._last_timestamp is not None:
            elapsed = now - self._last_timestamp
            if elapsed > 0:
                growth_rate = max(0.0, (log_bytes - self._last_bytes) / elapsed)

        filesystem = os.statvfs(os.path.dirname(log_path))
        available_bytes = filesystem.f_bavail * filesystem.f_frsize
        if growth_rate > 0:
            time_to_full = min(86400.0, available_bytes / growth_rate)
        else:
            time_to_full = 86400.0

        self.gauge("poc.synthetic_log.bytes", log_bytes, tags=tags)
        self.gauge(
            "poc.synthetic_log.growth_bytes_per_second", growth_rate, tags=tags
        )
        self.gauge(
            "poc.synthetic_log.time_to_full_seconds", time_to_full, tags=tags
        )
        self.gauge(
            "poc.synthetic_log.fault_active",
            1 if os.path.exists(trigger_path) else 0,
            tags=tags,
        )

        self._last_bytes = log_bytes
        self._last_timestamp = now
