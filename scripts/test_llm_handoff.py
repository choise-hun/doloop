"""Offline behavioral checks: no model requests or changes to the project repo."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("handoff", Path(__file__).with_name("llm-handoff.py"))
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        for args in (("init", "-q"), ("config", "core.autocrlf", "false"), ("config", "user.name", "Fixture"),
                     ("config", "user.email", "fixture@example.invalid")):
            h.git(self.repo, *args)
        h.write(self.repo / "source.txt", "original\n")
        h.write(self.repo / "outside.txt", "untouched\n")
        h.git(self.repo, "add", ".")
        h.git(self.repo, "commit", "-qm", "test fixture")
        self.task = {"id": "fixture", "goal": "Test handoff", "references": ["source.txt"],
                     "write_files": ["source.txt", "new.txt"],
                     "verify": [[sys.executable, "-c", "print('check passed')"]], "timeout_seconds": 20}
        self.config = self.repo.parent / (self.repo.name + ".json")
        self.config.write_text(json.dumps(self.task), encoding="utf-8")
        self.addCleanup(self.config.unlink)

    def cli(self, *args):
        with patch.object(sys, "argv", ["handoff", *args, "--repo", str(self.repo)]), contextlib.redirect_stdout(io.StringIO()):
            h.main()

    def initialize(self):
        self.cli("init", "--task", str(self.config))
        self.folder = self.repo / ".llm-handoff/fixture"

    def state(self):
        return json.loads((self.folder / "state.json").read_text(encoding="utf-8"))

    def model(self, repo, args, text, log, timeout):
        if "이번 역할: implement" in text:
            h.write(repo / "source.txt", "implemented\n")
            h.write(repo / "new.txt", "new implementation\n")
        return "# Stage result\nObserved evidence and limitations.\n"

    def stage_run(self):
        with patch.object(h, "command", side_effect=lambda name: [name]), patch.object(h, "invoke", side_effect=self.model):
            self.cli("run", "--id", "fixture")

    def test_gate_then_resume_without_repeating_explore(self):
        self.initialize()
        self.stage_run()
        state = self.state()
        self.assertEqual(state["status"], "awaiting_spec_approval")
        self.assertEqual((self.repo / "source.txt").read_text(), "original\n")
        with patch.object(h, "command", side_effect=lambda name: [name]), patch.object(h, "invoke", side_effect=self.model) as model:
            self.cli("approve", "--id", "fixture", "--spec-sha", state["spec_sha"])
        self.assertEqual(model.call_count, 2)
        self.assertEqual(self.state()["status"], "report_ready")
        self.assertIn("check passed", (self.folder / "verify.txt").read_text())
        self.assertIn("NEW FILE: new.txt", (self.folder / "changes.diff").read_text())
        self.assertEqual(h.git(self.repo, "log", "-1", "--format=%s"), "test fixture")

    def test_dirty_init_preserves_changes(self):
        h.write(self.repo / "source.txt", "user edit")
        with self.assertRaisesRegex(ValueError, "clean dedicated"):
            self.initialize()
        self.assertEqual((self.repo / "source.txt").read_text(), "user edit")

    def test_wrong_hash_and_changed_spec_are_rejected(self):
        self.initialize()
        self.stage_run()
        old = self.state()
        with self.assertRaisesRegex(ValueError, "exact pending"):
            self.cli("approve", "--id", "fixture", "--spec-sha", "wrong")
        h.write(self.repo / old["artifacts"]["spec"], "changed")
        with self.assertRaisesRegex(ValueError, "exact pending"):
            self.cli("approve", "--id", "fixture", "--spec-sha", old["spec_sha"])

    def test_out_of_scope_change_blocks_downstream(self):
        self.initialize()
        def bad(repo, *args):
            h.write(repo / "outside.txt", "unexpected edit")
            return "report"
        with patch.object(h, "command", return_value=["fake"]), patch.object(h, "invoke", side_effect=bad) as model:
            with self.assertRaisesRegex(ValueError, "Out-of-scope"):
                self.cli("run", "--id", "fixture")
        self.assertEqual(model.call_count, 1)
        self.assertEqual(self.state()["status"], "failed")
        self.assertEqual((self.repo / "outside.txt").read_text(), "unexpected edit")
        with self.assertRaisesRegex(ValueError, "Source changed"):
            self.stage_run()

    def test_failed_verification_never_calls_audit(self):
        self.task["verify"] = [[sys.executable, "-c", "raise SystemExit(7)"]]
        self.config.write_text(json.dumps(self.task), encoding="utf-8")
        self.initialize()
        self.stage_run()
        state = self.state()
        with patch.object(h, "command", side_effect=lambda name: [name]), patch.object(h, "invoke", side_effect=self.model) as model:
            with self.assertRaisesRegex(ValueError, "Verification failed"):
                self.cli("approve", "--id", "fixture", "--spec-sha", state["spec_sha"])
        self.assertEqual(model.call_count, 1)
        self.assertEqual(self.state()["next"], "implement")
        self.assertEqual(self.state()["status"], "failed")
        self.assertIn("exit=7", (self.folder / "verify.txt").read_text())

    def test_model_process_nonzero_and_empty_output_fail(self):
        for code, message in (("raise SystemExit(3)", "Process failed"), ("pass", "Empty model output")):
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, message):
                h.invoke(self.repo, [sys.executable, "-c", code], "prompt", self.repo / "stderr.txt", 10)

    @unittest.skipUnless(os.name == "nt", "Windows CLI adapter")
    def test_powershell_cli_adapter_preserves_utf8_stdin_and_output(self):
        shim = self.repo / "fake-cli.ps1"
        h.write(shim, '& node -e "process.stdin.pipe(process.stdout)"\nexit $LASTEXITCODE\n')
        with patch.object(h.shutil, "which", return_value=str(shim)):
            args = h.command("fake-cli")
        output = h.invoke(self.repo, args, "한글 인계 입력", self.repo / "stderr.txt", 10)
        self.assertIn("한글 인계 입력", output)

    def test_external_change_blocks_resume(self):
        self.initialize()
        self.stage_run()
        h.write(self.repo / "source.txt", "external change")
        with self.assertRaisesRegex(ValueError, "Source changed"):
            self.stage_run()

    def test_duplicate_init_does_not_overwrite(self):
        self.initialize()
        previous = (self.folder / "state.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.cli("init", "--task", str(self.config))
        self.assertEqual((self.folder / "state.json").read_bytes(), previous)

    def test_completed_draft_tampering_blocks_resume(self):
        self.initialize()
        self.stage_run()
        h.write(self.repo / self.state()["artifacts"]["explore"], "changed draft")
        with self.assertRaisesRegex(ValueError, "handoff artifact changed"):
            self.stage_run()

    def test_model_cannot_modify_approved_spec(self):
        self.initialize()
        self.stage_run()
        state = self.state()
        def tamper(repo, *args):
            h.write(repo / state["artifacts"]["spec"], "changed by implementer")
            return "report"
        with patch.object(h, "command", return_value=["fake"]), patch.object(h, "invoke", side_effect=tamper):
            with self.assertRaisesRegex(ValueError, "runner-owned artifact"):
                self.cli("approve", "--id", "fixture", "--spec-sha", state["spec_sha"])
        self.assertEqual(self.state()["status"], "failed")


if __name__ == "__main__":
    unittest.main()
