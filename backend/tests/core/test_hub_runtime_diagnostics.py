# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Test the artifact A/B/C diagnostic runner and workflow wiring.

Run: poetry run pytest tests/core/test_hub_runtime_diagnostics.py --no-cov.
Inputs: disposable directories and the same runner used by Windows CI.
"""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

BACKEND = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND / "scripts" / "diagnose-hub-runtime.py"


@pytest.fixture
def runner():
    spec = importlib.util.spec_from_file_location("diagnose_hub_runtime", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_timeout_and_nonzero_exit_do_not_stop_later_probes(runner, tmp_path):
    results = [
        runner.run_probe(
            "timeout",
            [sys.executable, "-c", "import time; time.sleep(30)"],
            tmp_path,
            tmp_path,
            0.2,
        ),
        runner.run_probe(
            "failure", [sys.executable, "-c", "raise SystemExit(9)"], tmp_path, tmp_path, 5
        ),
        runner.run_probe(
            "success",
            [sys.executable, "-c", "print('completed', flush=True)"],
            tmp_path,
            tmp_path,
            5,
        ),
    ]
    assert [result["status"] for result in results] == ["timeout", "failed", "passed"]
    assert results[1]["exit_code"] == 9
    assert "completed" in (tmp_path / "success.log").read_text()


@pytest.mark.parametrize(
    "code,expected",
    [
        (-1073741819, "access_violation"),
        (3221225725, "stack_overflow"),
        (-1073740791, "fail_fast"),
    ],
)
def test_windows_exit_code_classification(runner, code, expected):
    assert runner.classify_exit(code) == expected


def test_real_abc_runner_uses_separate_processes_and_disposable_databases(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--artifact",
            str(BACKEND),
            "--output",
            str(tmp_path),
            "--allow-source",
            "--timeout",
            "90",
        ],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert [item["probe"] for item in summary] == [
        "A-standard-sqlite",
        "B-sqlcipher-driver",
        "C-django-sqlcipher",
    ]
    assert all(item["status"] == "passed" for item in summary), summary
    assert len({item["pid"] for item in summary}) == 3
    for item in summary:
        log = (tmp_path / item["log"]).read_text()
        assert "STAGE" in log
        assert "sqlcipher_loaded=" in log
        assert "PROBE PASS" in log
    assert "django.setup complete" in (tmp_path / "A-standard-sqlite.log").read_text()
    assert "django.setup complete" in (tmp_path / "C-django-sqlcipher.log").read_text()


def test_windows_diagnostic_job_is_independent_and_always_uploads_logs():
    workflow = yaml.safe_load((BACKEND.parent / ".github/workflows/build-hub.yml").read_text())
    job = workflow["jobs"]["diagnose-windows-runtime"]
    assert job["needs"] == "compile"
    assert job["runs-on"] == "windows-2022"
    assert job["timeout-minutes"] <= 15
    steps = job["steps"]
    assert any(step.get("with", {}).get("name") == "hub-windows-amd64" for step in steps)
    assert any("diagnose-hub-runtime.py" in step.get("run", "") for step in steps)
    assert any(
        step.get("uses", "").startswith("actions/upload-artifact@") and step.get("if") == "always()"
        for step in steps
    )
    assert "smoke-test-windows" in workflow["jobs"]["publish"]["needs"]
    assert any(
        "--compiled --full-migrations" in step.get("run", "")
        for step in workflow["jobs"]["smoke-test-windows"]["steps"]
    )


def test_windows_keep_plain_exclusions_are_narrow_and_evidence_backed():
    """Windows compatibility exclusions must not silently turn into source-only builds."""
    compiler = (BACKEND / "scripts" / "compile-hub.py").read_text(encoding="utf-8")
    assert "WINDOWS_KEEP_PLAIN_FILES" in compiler
    assert '"hmis/apps/core/upload_validators.py"' in compiler
    assert "python-magic/libmagic import crashes compiled startup" in compiler
