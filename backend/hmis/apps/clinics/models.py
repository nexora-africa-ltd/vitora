# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Clinics models for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the clinics module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.clinics.models_core import *  # noqa: F403
from hmis.apps.clinics.models_programs_reports import *  # noqa: F403
from hmis.apps.clinics.models_sessions_visits import *  # noqa: F403
