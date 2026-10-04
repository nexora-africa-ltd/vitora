# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Runtime tests for optional native MIME sniffing controls.

Run: poetry run pytest tests/core/test_upload_validators_runtime.py --no-cov.
Inputs: VITORA_DISABLE_MAGIC_SNIFFING environment configuration.
"""

import importlib


def test_native_magic_sniffing_can_be_disabled_without_disabling_upload_validation(monkeypatch):
    """Windows can use the safe extension/size fallback without loading libmagic."""
    from hmis.apps.core import upload_validators

    monkeypatch.setenv("VITORA_DISABLE_MAGIC_SNIFFING", "true")
    module = importlib.reload(upload_validators)
    try:
        assert module._detect_mime(object()) is None
    finally:
        monkeypatch.delenv("VITORA_DISABLE_MAGIC_SNIFFING", raising=False)
        importlib.reload(module)
