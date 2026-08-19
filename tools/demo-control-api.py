#!/usr/bin/env python3
"""Asynchronous, bounded HTTP adapter for demo-control.sh.

This POC-only service accepts a fixed action enum. Request data can never
select a host, path, executable, or shell argument.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import urlsplit

MAX_BODY_BYTES = 1024
FAULT_ACTIONS = frozenset(
    {
        "pool",
        "disk",
        "reset",
        "start-storefront-spike",
        "stop-storefront-spike",
        "deploy-storefront-demo-bad",
        "reset-storefront-deployment",
        "memory",
        "stop-memory",
    }
)
REMEDIATION_ACTIONS = frozenset(
    {
        "recover-pool",
        "recover-disk",
        "scale-storefront-to-2",
        "reset-storefront-scale",
        "rollback-storefront-stable",
    }
)
ACTIVE_JOB_STATES = frozenset({"accepted", "running"})
TERMINAL_JOB_STATES = frozenset({"succeeded", "failed"})


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class ApiConfig:
    project_path: Path
    fault_token: str
    remediation_token: str
    environment: str = "poc"
    bind_address: str = "127.0.0.1"
    port: int = 18080
    action_timeout_seconds: int = 240
    job_log_path: Path = Path("/var/log/berca-poc/demo-control-jobs.log")
    job_log_max_bytes: int = 1_048_576
    job_log_backup_count: int = 2

    @property
    def control_script(self) -> Path:
        return self.project_path / "demo-control.sh"


@dataclass
class JobRecord:
    job_id: str
    action: str
    state: str
    accepted_at: str
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    error: str | None = None

    def snapshot(self) -> dict[str, object]:
        return {
            "job_id": self.job_id,
            "action": self.action,
            "state": self.state,
            "accepted_at": self.accepted_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "exit_code": self.exit_code,
            "error": self.error,
        }


@dataclass(frozen=True)
class JobResult:
    exit_code: int
    error: str | None = None


class DemoControlServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        server_address: tuple[str, int],
        handler_class: type[BaseHTTPRequestHandler],
        config: ApiConfig,
    ) -> None:
        super().__init__(server_address, handler_class)
        self.config = config
        self._job_lock = threading.Lock()
        self._job: JobRecord | None = None
        self.job_executor = self._execute_action
        self.job_logger = self._create_job_logger()

    def _create_job_logger(self) -> logging.Logger:
        self.config.job_log_path.parent.mkdir(parents=True, exist_ok=True)
        handler = RotatingFileHandler(
            self.config.job_log_path,
            maxBytes=self.config.job_log_max_bytes,
            backupCount=self.config.job_log_backup_count,
            encoding="utf-8",
        )
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(message)s")
        )
        logger = logging.getLogger(f"demo-control-jobs.{id(self)}")
        logger.setLevel(logging.INFO)
        logger.propagate = False
        logger.addHandler(handler)
        return logger

    def server_close(self) -> None:
        super().server_close()
        for handler in tuple(self.job_logger.handlers):
            handler.close()
            self.job_logger.removeHandler(handler)

    def start_action(
        self, action: str
    ) -> tuple[dict[str, object] | None, dict[str, object] | None]:
        with self._job_lock:
            if self._job is not None and self._job.state in ACTIVE_JOB_STATES:
                return None, self._job.snapshot()

            job = JobRecord(
                job_id=uuid.uuid4().hex,
                action=action,
                state="accepted",
                accepted_at=utc_timestamp(),
            )
            self._job = job
            accepted_snapshot = job.snapshot()

        worker = threading.Thread(
            target=self._run_job,
            args=(job.job_id,),
            name=f"demo-control-{job.job_id}",
            daemon=True,
        )
        worker.start()
        return accepted_snapshot, None

    def job_snapshot(self) -> dict[str, object] | None:
        with self._job_lock:
            return None if self._job is None else self._job.snapshot()

    def _run_job(self, job_id: str) -> None:
        with self._job_lock:
            if self._job is None or self._job.job_id != job_id:
                return
            self._job.state = "running"
            self._job.started_at = utc_timestamp()
            action = self._job.action

        self.job_logger.info("job_id=%s action=%s state=running", job_id, action)
        try:
            result = self.job_executor(job_id, action)
        except Exception:
            self.job_logger.exception(
                "job_id=%s action=%s state=failed", job_id, action
            )
            result = JobResult(exit_code=1, error="action_execution_error")

        terminal_state = "succeeded" if result.exit_code == 0 else "failed"
        with self._job_lock:
            if self._job is None or self._job.job_id != job_id:
                return
            self._job.state = terminal_state
            self._job.finished_at = utc_timestamp()
            self._job.exit_code = result.exit_code
            self._job.error = result.error

        self.job_logger.info(
            "job_id=%s action=%s state=%s exit_code=%s error=%s",
            job_id,
            action,
            terminal_state,
            result.exit_code,
            result.error or "none",
        )

    def _pump_stream(
        self, stream: object, job_id: str, action: str, stream_name: str
    ) -> None:
        if stream is None or not hasattr(stream, "readline"):
            return
        try:
            while True:
                line = stream.readline()
                if line == "":
                    break
                self.job_logger.info(
                    "job_id=%s action=%s stream=%s %s",
                    job_id,
                    action,
                    stream_name,
                    line.rstrip("\r\n"),
                )
        finally:
            if hasattr(stream, "close"):
                stream.close()

    def _execute_action(self, job_id: str, action: str) -> JobResult:
        try:
            process = subprocess.Popen(
                [str(self.config.control_script), action],
                cwd=self.config.project_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except OSError:
            self.job_logger.exception(
                "job_id=%s action=%s process_start_failed", job_id, action
            )
            return JobResult(exit_code=127, error="action_unavailable")

        stdout_thread = threading.Thread(
            target=self._pump_stream,
            args=(process.stdout, job_id, action, "stdout"),
            daemon=True,
        )
        stderr_thread = threading.Thread(
            target=self._pump_stream,
            args=(process.stderr, job_id, action, "stderr"),
            daemon=True,
        )
        stdout_thread.start()
        stderr_thread.start()

        error = None
        try:
            exit_code = process.wait(timeout=self.config.action_timeout_seconds)
        except subprocess.TimeoutExpired:
            error = "action_timeout"
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            exit_code = 124

        stdout_thread.join(timeout=5)
        stderr_thread.join(timeout=5)
        return JobResult(exit_code=exit_code, error=error)

    def read_demo_state(self) -> tuple[dict[str, object] | None, str | None]:
        try:
            completed = subprocess.run(
                [str(self.config.control_script), "status"],
                cwd=self.config.project_path,
                capture_output=True,
                check=False,
                text=True,
                timeout=min(30, self.config.action_timeout_seconds),
            )
        except (OSError, subprocess.TimeoutExpired):
            return None, "status_unavailable"

        if completed.returncode != 0:
            return None, "status_failed"
        try:
            state = json.loads(completed.stdout)
        except json.JSONDecodeError:
            return None, "invalid_status_output"
        if not isinstance(state, dict):
            return None, "invalid_status_output"
        return state, None


class DemoControlHandler(BaseHTTPRequestHandler):
    server: DemoControlServer

    def log_message(self, format_string: str, *args: object) -> None:
        sys.stderr.write(
            "%s - - [%s] %s\n"
            % (self.client_address[0], self.log_date_time_string(), format_string % args)
        )

    def send_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def request_path(self) -> str | None:
        parsed = urlsplit(self.path)
        if parsed.query or parsed.fragment:
            return None
        return parsed.path

    def token_scope(self) -> str | None:
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return None
        supplied = authorization.removeprefix("Bearer ")
        config = self.server.config
        if hmac.compare_digest(supplied, config.fault_token):
            return "fault"
        if hmac.compare_digest(supplied, config.remediation_token):
            return "remediation"
        return None

    def do_GET(self) -> None:
        path = self.request_path()
        if path is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "query_not_allowed"})
            return
        if path == "/healthz":
            self.send_json(HTTPStatus.OK, {"ok": True, "service": "demo-control-api"})
            return
        if path != "/v1/demo/status":
            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})
            return
        if self.token_scope() is None:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "unauthorized"})
            return

        job = self.server.job_snapshot()
        demo_state, demo_state_error = self.server.read_demo_state()
        job_state = None if job is None else job["state"]
        current_action = (
            job["action"] if job is not None and job_state in ACTIVE_JOB_STATES else None
        )
        self.send_json(
            HTTPStatus.OK,
            {
                "ok": True,
                "environment": self.server.config.environment,
                "current_action": current_action,
                "job_id": None if job is None else job["job_id"],
                "job_state": job_state,
                "job": job,
                "demo_state": demo_state,
                "demo_state_error": demo_state_error,
            },
        )

    def do_POST(self) -> None:
        path = self.request_path()
        if path is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "query_not_allowed"})
            return
        if path != "/v1/demo/action":
            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})
            return

        scope = self.token_scope()
        if scope is None:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "unauthorized"})
            return

        media_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if media_type != "application/json":
            self.send_json(
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                {"ok": False, "error": "application_json_required"},
            )
            return

        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            content_length = -1
        if content_length < 1 or content_length > MAX_BODY_BYTES:
            self.send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"ok": False, "error": "invalid_body_size"},
            )
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "invalid_json"})
            return

        if not isinstance(payload, dict) or set(payload) != {"action"}:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "error": "exact_action_field_required"},
            )
            return

        action = payload["action"]
        allowed_actions = {
            "fault": FAULT_ACTIONS,
            "remediation": REMEDIATION_ACTIONS,
        }[scope]
        if not isinstance(action, str) or action not in allowed_actions:
            self.send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "action_forbidden"})
            return
        accepted_job, active_job = self.server.start_action(action)
        if accepted_job is None:
            self.send_json(
                HTTPStatus.CONFLICT,
                {
                    "ok": False,
                    "error": "action_in_progress",
                    "action": active_job["action"] if active_job else None,
                    "state": active_job["state"] if active_job else None,
                    "job_id": active_job["job_id"] if active_job else None,
                },
            )
            return

        self.send_json(
            HTTPStatus.ACCEPTED,
            {
                "ok": True,
                "action": action,
                "state": "accepted",
                "job_id": accepted_job["job_id"],
            },
        )


def load_config() -> ApiConfig:
    project_path_input = os.environ.get("DEMO_CONTROL_PROJECT_PATH", "").strip()
    if not project_path_input:
        raise ValueError("DEMO_CONTROL_PROJECT_PATH is required")
    project_path = Path(project_path_input).resolve()
    fault_token = os.environ.get("DEMO_CONTROL_FAULT_TOKEN", "").strip()
    remediation_token = os.environ.get("DEMO_CONTROL_REMEDIATION_TOKEN", "").strip()
    environment = os.environ.get("DEMO_CONTROL_ENVIRONMENT", "poc").strip()
    bind_address = os.environ.get("DEMO_CONTROL_BIND", "127.0.0.1")
    job_log_path = Path(
        os.environ.get(
            "DEMO_CONTROL_JOB_LOG_PATH",
            "/var/log/berca-poc/demo-control-jobs.log",
        )
    )

    if not project_path.is_dir():
        raise ValueError("DEMO_CONTROL_PROJECT_PATH must be an existing directory")
    if not (project_path / "demo-control.sh").is_file():
        raise ValueError("demo-control.sh is missing from DEMO_CONTROL_PROJECT_PATH")
    if any(len(token) < 32 for token in (fault_token, remediation_token)):
        raise ValueError("all control tokens must contain at least 32 characters")
    for token in (fault_token, remediation_token):
        normalized_token = token.lower()
        if token.startswith("<") or "replace" in normalized_token or "placeholder" in normalized_token:
            raise ValueError("control token placeholders must be replaced")
    if fault_token == remediation_token:
        raise ValueError("fault and remediation tokens must be different")
    if environment != "poc":
        raise ValueError("DEMO_CONTROL_ENVIRONMENT must be exactly 'poc'")
    if not job_log_path.is_absolute():
        raise ValueError("DEMO_CONTROL_JOB_LOG_PATH must be absolute")

    port = int(os.environ.get("DEMO_CONTROL_PORT", "18080"))
    timeout = int(os.environ.get("DEMO_CONTROL_TIMEOUT_SECONDS", "240"))
    log_max_bytes = int(os.environ.get("DEMO_CONTROL_JOB_LOG_MAX_BYTES", "1048576"))
    log_backup_count = int(os.environ.get("DEMO_CONTROL_JOB_LOG_BACKUP_COUNT", "2"))
    if not 1 <= port <= 65535:
        raise ValueError("DEMO_CONTROL_PORT must be between 1 and 65535")
    if not 1 <= timeout <= 600:
        raise ValueError("DEMO_CONTROL_TIMEOUT_SECONDS must be between 1 and 600")
    if not 65_536 <= log_max_bytes <= 10_485_760:
        raise ValueError("DEMO_CONTROL_JOB_LOG_MAX_BYTES must be between 65536 and 10485760")
    if not 1 <= log_backup_count <= 5:
        raise ValueError("DEMO_CONTROL_JOB_LOG_BACKUP_COUNT must be between 1 and 5")

    return ApiConfig(
        project_path=project_path,
        fault_token=fault_token,
        remediation_token=remediation_token,
        environment=environment,
        bind_address=bind_address,
        port=port,
        action_timeout_seconds=timeout,
        job_log_path=job_log_path,
        job_log_max_bytes=log_max_bytes,
        job_log_backup_count=log_backup_count,
    )


def create_server(config: ApiConfig) -> DemoControlServer:
    return DemoControlServer(
        (config.bind_address, config.port), DemoControlHandler, config
    )


def main() -> None:
    config = load_config()
    server = create_server(config)
    print(
        f"Demo Control API listening on {config.bind_address}:{config.port}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
