# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing terminology for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the billing module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.services.terminology_core import *  # noqa: F403
from hmis.apps.billing.services.terminology_models import *  # noqa: F403
