# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for platform-specific SQLCipher hub artifact requirements.

Run with: poetry run pytest tests/core/test_hub_sqlcipher_requirements.py --no-cov
Inputs: backend/requirements-hub.txt generated from the Poetry lock.
"""

from pathlib import Path


def test_hub_requirements_select_sqlcipher_wheels_per_release_platform():
    """Linux and Windows hub builds must not request an unavailable wheel."""
    requirements = (Path(__file__).resolve().parents[2] / "requirements-hub.txt").read_text(
        encoding="utf-8"
    )

    assert (
        'sqlcipher3-binary==0.6.0 ; python_version >= "3.12" and python_version < "4.0" and sys_platform == "linux"'
        in requirements
    )
    assert (
        'sqlcipher3==0.6.2 ; python_version >= "3.12" and python_version < "4.0" and sys_platform == "win32"'
        in requirements
    )
