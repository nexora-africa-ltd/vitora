# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Scheduling views for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the scheduling module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.scheduling.views_assignment import *  # noqa: F403
from hmis.apps.scheduling.views_resources_appointments import *  # noqa: F403
from hmis.apps.scheduling.views_shift_management import *  # noqa: F403
from hmis.apps.scheduling.views_shift_swap import *  # noqa: F403
