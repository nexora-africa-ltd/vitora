# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Laboratory models for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the laboratory module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.laboratory.models_instruments_reports import *  # noqa: F403
from hmis.apps.laboratory.models_orders_results import *  # noqa: F403
from hmis.apps.laboratory.models_queue_templates import *  # noqa: F403
from hmis.apps.laboratory.models_reference_settings import *  # noqa: F403
