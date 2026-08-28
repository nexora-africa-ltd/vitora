# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Scheduling models for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the scheduling module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.scheduling.models_assignment import *  # noqa: F403
from hmis.apps.scheduling.models_resource_schedule import *  # noqa: F403
from hmis.apps.scheduling.models_shifting import *  # noqa: F403
