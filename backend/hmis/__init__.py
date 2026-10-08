# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Vitora HMIS backend package and runtime release metadata."""

import os
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path


def get_runtime_version() -> str:
    """Return the deployed release version, preferring hub/cloud runtime metadata."""
    for variable in ("VITORA_VERSION", "HUB_VERSION"):
        value = os.getenv(variable, "").strip()
        if value:
            return value

    version_file = Path(__file__).resolve().parent.parent / "VERSION"
    try:
        value = version_file.read_text(encoding="utf-8").strip()
        if value:
            return value
    except OSError:
        pass

    try:
        return version("vitora-hmis")
    except PackageNotFoundError:
        return "1.0.33"


__version__ = get_runtime_version()

# Import Celery app so it's loaded when Django starts (optional for tests)
try:
    from hmis.celery import app as celery_app

    __all__ = ("celery_app", "__version__")
except ImportError:
    # Celery not available (e.g., in test environment)
    celery_app = None
    __all__ = ("__version__",)
