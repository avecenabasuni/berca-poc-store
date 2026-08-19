import http.client
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "demo-control-api.py"
SPEC = importlib.util.spec_from_file_location("demo_control_api", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load demo-control-api.py")
API = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = API
SPEC.loader.exec_module(API)


class DemoControlApiTest(unittest.TestCase):
    def setUp(self):
        self.fault_token = "f" * 40
        self.remediation_token = "r" * 40
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.config = API.ApiConfig(
            project_path=Path(__file__).resolve().parents[2],
            fault_token=self.fault_token,
            remediation_token=self.remediation_token,
            bind_address="127.0.0.1",
            port=0,
            job_log_path=Path(self.temporary_directory.name) / "jobs.log",
            job_log_max_bytes=65_536,
            job_log_backup_count=1,
        )
        self.server = API.create_server(self.config)
        self.server.job_executor = lambda _job_id, _action: API.JobResult(0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temporary_directory.cleanup()

    def request(self, method, path, *, token=None, payload=None, content_type="application/json"):
        headers = {}
        body = None
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        if payload is not None:
            body = json.dumps(payload)
            headers["Content-Type"] = content_type
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        response_body = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, response_body

    def wait_for_job_state(self, expected_state, timeout=5):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job = self.server.job_snapshot()
            if job is not None and job["state"] == expected_state:
                return job
            time.sleep(0.01)
        self.fail(f"job did not reach {expected_state}")

    def completed(self, action, stdout="done"):
        return subprocess.CompletedProcess(
            [str(self.config.control_script), action], 0, stdout, ""
        )

    def test_health_does_not_require_authentication(self):
        status, body = self.request("GET", "/healthz")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])

    def test_fault_action_returns_202_and_completes_asynchronously(self):
        executed = []

        def executor(_job_id, action):
            executed.append(action)
            return API.JobResult(0)

        self.server.job_executor = executor
        status, body = self.request(
            "POST", "/v1/demo/action", token=self.fault_token, payload={"action": "pool"}
        )

        self.assertEqual(status, 202)
        self.assertEqual(body["state"], "accepted")
        self.assertEqual(body["action"], "pool")
        self.assertTrue(body["job_id"])
        job = self.wait_for_job_state("succeeded")
        self.assertEqual(job["job_id"], body["job_id"])
        self.assertEqual(executed, ["pool"])

        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.fault_token,
            payload={"action": "recover-pool"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "action_forbidden")

    def test_remediation_token_can_only_dispatch_recovery_actions(self):
        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.remediation_token,
            payload={"action": "recover-disk"},
        )
        self.assertEqual(status, 202)
        self.assertEqual(body["action"], "recover-disk")
        self.wait_for_job_state("succeeded")

        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.remediation_token,
            payload={"action": "reset"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "action_forbidden")

    def test_fault_token_can_only_dispatch_fixed_demo_conditions(self):
        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.fault_token,
            payload={"action": "deploy-storefront-demo-bad"},
        )
        self.assertEqual(status, 202)
        self.assertEqual(body["action"], "deploy-storefront-demo-bad")
        self.wait_for_job_state("succeeded")

        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.fault_token,
            payload={"action": "rollback-storefront-stable"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "action_forbidden")

    def test_memory_fault_actions_are_limited_to_fault_token(self):
        for action in ("memory", "stop-memory"):
            status, body = self.request(
                "POST",
                "/v1/demo/action",
                token=self.fault_token,
                payload={"action": action},
            )
            self.assertEqual(status, 202)
            self.assertEqual(body["action"], action)
            self.wait_for_job_state("succeeded")

        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.remediation_token,
            payload={"action": "memory"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "action_forbidden")

    def test_remediation_token_can_only_dispatch_fixed_remediation_actions(self):
        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.remediation_token,
            payload={"action": "rollback-storefront-stable"},
        )
        self.assertEqual(status, 202)
        self.assertEqual(body["action"], "rollback-storefront-stable")
        self.wait_for_job_state("succeeded")

        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.remediation_token,
            payload={"action": "start-storefront-spike"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "action_forbidden")

    def test_second_action_is_rejected_while_job_is_running(self):
        started = threading.Event()
        release = threading.Event()

        def blocking_executor(_job_id, _action):
            started.set()
            release.wait(timeout=5)
            return API.JobResult(0)

        self.server.job_executor = blocking_executor
        try:
            first_status, first_body = self.request(
                "POST",
                "/v1/demo/action",
                token=self.fault_token,
                payload={"action": "pool"},
            )
            self.assertEqual(first_status, 202)
            self.assertTrue(started.wait(timeout=2))

            second_status, second_body = self.request(
                "POST",
                "/v1/demo/action",
                token=self.fault_token,
                payload={"action": "reset"},
            )
            self.assertEqual(second_status, 409)
            self.assertEqual(second_body["error"], "action_in_progress")
            self.assertEqual(second_body["job_id"], first_body["job_id"])
            self.assertIn(second_body["state"], API.ACTIVE_JOB_STATES)
        finally:
            release.set()
        self.wait_for_job_state("succeeded")

    def test_failed_executor_is_exposed_as_failed_job_state(self):
        self.server.job_executor = lambda _job_id, _action: API.JobResult(
            7, "action_failed"
        )
        status, _body = self.request(
            "POST", "/v1/demo/action", token=self.fault_token, payload={"action": "disk"}
        )
        self.assertEqual(status, 202)
        job = self.wait_for_job_state("failed")
        self.assertEqual(job["exit_code"], 7)
        self.assertEqual(job["error"], "action_failed")

    def test_status_requires_auth_and_exposes_action_and_job_state(self):
        status, body = self.request("GET", "/v1/demo/status")
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "unauthorized")

        state = '{"pool_hog_running":false,"disk_fault_active":false}'
        with mock.patch.object(
            API.subprocess, "run", return_value=self.completed("status", state)
        ):
            status, body = self.request(
                "GET", "/v1/demo/status", token=self.remediation_token
            )
        self.assertEqual(status, 200)
        self.assertIsNone(body["current_action"])
        self.assertIsNone(body["job_state"])
        self.assertEqual(body["demo_state"]["pool_hog_running"], False)
        self.assertEqual(body["environment"], "poc")

    def test_status_exposes_running_job_without_blocking(self):
        started = threading.Event()
        release = threading.Event()

        def blocking_executor(_job_id, _action):
            started.set()
            release.wait(timeout=5)
            return API.JobResult(0)

        self.server.job_executor = blocking_executor
        state = '{"pool_hog_running":true,"disk_fault_active":false}'
        try:
            accepted_status, accepted_body = self.request(
                "POST",
                "/v1/demo/action",
                token=self.fault_token,
                payload={"action": "pool"},
            )
            self.assertEqual(accepted_status, 202)
            self.assertTrue(started.wait(timeout=2))

            with mock.patch.object(
                API.subprocess, "run", return_value=self.completed("status", state)
            ):
                status, body = self.request(
                    "GET", "/v1/demo/status", token=self.fault_token
                )
            self.assertEqual(status, 200)
            self.assertEqual(body["current_action"], "pool")
            self.assertEqual(body["job_state"], "running")
            self.assertEqual(body["job_id"], accepted_body["job_id"])
        finally:
            release.set()
        self.wait_for_job_state("succeeded")

    def test_rejects_unknown_fields_query_strings_and_wrong_content_type(self):
        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.fault_token,
            payload={"action": "pool", "host": "forbidden"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "exact_action_field_required")

        status, body = self.request(
            "POST",
            "/v1/demo/action?command=pool",
            token=self.fault_token,
            payload={"action": "pool"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "query_not_allowed")

        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.fault_token,
            payload={"action": "pool"},
            content_type="text/plain",
        )
        self.assertEqual(status, 415)
        self.assertEqual(body["error"], "application_json_required")

    def test_default_executor_uses_fixed_argv_and_preserves_bounded_logs(self):
        process = mock.Mock()
        process.stdout = io.StringIO("stdout line\n")
        process.stderr = io.StringIO("stderr line\n")
        process.wait.return_value = 0

        with mock.patch.object(API.subprocess, "Popen", return_value=process) as popen:
            result = self.server._execute_action("fixed-job", "recover-pool")

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(
            popen.call_args.args[0],
            [str(self.config.control_script), "recover-pool"],
        )
        self.assertEqual(popen.call_args.kwargs["cwd"], self.config.project_path)
        self.assertNotIn("shell", popen.call_args.kwargs)
        for handler in self.server.job_logger.handlers:
            handler.flush()
        log_contents = self.config.job_log_path.read_text(encoding="utf-8")
        self.assertIn("stream=stdout stdout line", log_contents)
        self.assertIn("stream=stderr stderr line", log_contents)

    def test_example_token_placeholders_cannot_start_the_service(self):
        project_path = str(Path(__file__).resolve().parents[2])
        environment = {
            "DEMO_CONTROL_PROJECT_PATH": project_path,
            "DEMO_CONTROL_FAULT_TOKEN": "<REPLACE_WITH_RANDOM_32_PLUS_CHARACTER_TOKEN>",
            "DEMO_CONTROL_REMEDIATION_TOKEN": (
                "<REPLACE_WITH_DIFFERENT_RANDOM_32_PLUS_CHARACTER_TOKEN>"
            ),
        }
        with mock.patch.dict(API.os.environ, environment, clear=True):
            with self.assertRaisesRegex(ValueError, "placeholders must be replaced"):
                API.load_config()

    def test_demo_control_service_refuses_non_poc_environment(self):
        project_path = str(Path(__file__).resolve().parents[2])
        environment = {
            "DEMO_CONTROL_PROJECT_PATH": project_path,
            "DEMO_CONTROL_FAULT_TOKEN": "f" * 40,
            "DEMO_CONTROL_REMEDIATION_TOKEN": "r" * 40,
            "DEMO_CONTROL_ENVIRONMENT": "production",
        }
        with mock.patch.dict(API.os.environ, environment, clear=True):
            with self.assertRaisesRegex(ValueError, "must be exactly 'poc'"):
                API.load_config()


if __name__ == "__main__":
    unittest.main()
