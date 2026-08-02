import http.client
import importlib.util
import json
import subprocess
import sys
import threading
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
    @classmethod
    def setUpClass(cls):
        cls.fault_token = "f" * 40
        cls.remediation_token = "r" * 40
        cls.config = API.ApiConfig(
            project_path=Path(__file__).resolve().parents[2],
            fault_token=cls.fault_token,
            remediation_token=cls.remediation_token,
            bind_address="127.0.0.1",
            port=0,
        )
        cls.server = API.create_server(cls.config)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

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

    def completed(self, action, stdout="done"):
        return subprocess.CompletedProcess(
            [str(self.config.control_script), action], 0, stdout, ""
        )

    def test_health_does_not_require_authentication(self):
        status, body = self.request("GET", "/healthz")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])

    def test_fault_token_can_only_call_fault_actions(self):
        with mock.patch.object(API.subprocess, "run", return_value=self.completed("pool")) as run:
            status, body = self.request(
                "POST", "/v1/demo/action", token=self.fault_token, payload={"action": "pool"}
            )
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(run.call_args.args[0], [str(self.config.control_script), "pool"])

        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.fault_token,
            payload={"action": "recover-pool"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "action_forbidden")

    def test_remediation_token_can_only_call_recovery_actions(self):
        with mock.patch.object(
            API.subprocess, "run", return_value=self.completed("recover-disk")
        ):
            status, body = self.request(
                "POST",
                "/v1/demo/action",
                token=self.remediation_token,
                payload={"action": "recover-disk"},
            )
        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "recover-disk")

        status, body = self.request(
            "POST",
            "/v1/demo/action",
            token=self.remediation_token,
            payload={"action": "reset"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "action_forbidden")

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

    def test_status_requires_a_valid_token_and_returns_parsed_state(self):
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
        self.assertEqual(body["state"]["pool_hog_running"], False)

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


if __name__ == "__main__":
    unittest.main()
