#!/usr/bin/env python3
"""Bounded HTTP adapter for demo-control.sh.

This POC-only service accepts a fixed action enum. Request data can never
select a host, path, executable, or shell argument.
"""

from __future__ import annotations

import hmac
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MAX_BODY_BYTES = 1024
MAX_OUTPUT_CHARS = 8192
FAULT_ACTIONS = frozenset({"pool", "disk", "reset"})
REMEDIATION_ACTIONS = frozenset({"recover-pool", "recover-disk"})


@dataclass(frozen=True)
class ApiConfig:
    project_path: Path
    fault_token: str
    remediation_token: str
    bind_address: str = "127.0.0.1"
    port: int = 18080
    action_timeout_seconds: int = 240

    @property
    def control_script(self) -> Path:
        return self.project_path / "demo-control.sh"


class DemoControlServer(ThreadingHTTPServer):
    config: ApiConfig


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
        self.run_action("status")

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
        allowed_actions = FAULT_ACTIONS if scope == "fault" else REMEDIATION_ACTIONS
        if not isinstance(action, str) or action not in allowed_actions:
            self.send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "action_forbidden"})
            return

        self.run_action(action)

    def run_action(self, action: str) -> None:
        config = self.server.config
        try:
            completed = subprocess.run(
                [str(config.control_script), action],
                cwd=config.project_path,
                capture_output=True,
                check=False,
                text=True,
                timeout=config.action_timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            self.send_json(
                HTTPStatus.GATEWAY_TIMEOUT,
                {"ok": False, "action": action, "error": "action_timeout"},
            )
            return
        except OSError:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"ok": False, "action": action, "error": "action_unavailable"},
            )
            return

        stdout = completed.stdout[-MAX_OUTPUT_CHARS:].strip()
        stderr = completed.stderr[-MAX_OUTPUT_CHARS:].strip()
        response_status = HTTPStatus.OK if completed.returncode == 0 else HTTPStatus.CONFLICT
        response: dict[str, object] = {
            "ok": completed.returncode == 0,
            "action": action,
            "exit_code": completed.returncode,
            "stdout": stdout,
            "stderr": stderr,
        }
        if action == "status" and completed.returncode == 0:
            try:
                response["state"] = json.loads(stdout)
            except json.JSONDecodeError:
                response_status = HTTPStatus.INTERNAL_SERVER_ERROR
                response["ok"] = False
                response["error"] = "invalid_status_output"
        self.send_json(response_status, response)


def load_config() -> ApiConfig:
    project_path_input = os.environ.get("DEMO_CONTROL_PROJECT_PATH", "").strip()
    if not project_path_input:
        raise ValueError("DEMO_CONTROL_PROJECT_PATH is required")
    project_path = Path(project_path_input).resolve()
    fault_token = os.environ.get("DEMO_CONTROL_FAULT_TOKEN", "").strip()
    remediation_token = os.environ.get("DEMO_CONTROL_REMEDIATION_TOKEN", "").strip()
    bind_address = os.environ.get("DEMO_CONTROL_BIND", "127.0.0.1")

    if not project_path.is_dir():
        raise ValueError("DEMO_CONTROL_PROJECT_PATH must be an existing directory")
    if not (project_path / "demo-control.sh").is_file():
        raise ValueError("demo-control.sh is missing from DEMO_CONTROL_PROJECT_PATH")
    if len(fault_token) < 32 or len(remediation_token) < 32:
        raise ValueError("both control tokens must contain at least 32 characters")
    for token in (fault_token, remediation_token):
        normalized_token = token.lower()
        if token.startswith("<") or "replace" in normalized_token or "placeholder" in normalized_token:
            raise ValueError("control token placeholders must be replaced")
    if hmac.compare_digest(fault_token, remediation_token):
        raise ValueError("fault and remediation tokens must be different")

    port = int(os.environ.get("DEMO_CONTROL_PORT", "18080"))
    timeout = int(os.environ.get("DEMO_CONTROL_TIMEOUT_SECONDS", "240"))
    if not 1 <= port <= 65535:
        raise ValueError("DEMO_CONTROL_PORT must be between 1 and 65535")
    if not 1 <= timeout <= 600:
        raise ValueError("DEMO_CONTROL_TIMEOUT_SECONDS must be between 1 and 600")

    return ApiConfig(
        project_path=project_path,
        fault_token=fault_token,
        remediation_token=remediation_token,
        bind_address=bind_address,
        port=port,
        action_timeout_seconds=timeout,
    )


def create_server(config: ApiConfig) -> DemoControlServer:
    server = DemoControlServer((config.bind_address, config.port), DemoControlHandler)
    server.config = config
    return server


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
