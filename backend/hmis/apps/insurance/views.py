# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Insurance views for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the insurance module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.insurance.views_claims import *  # noqa: F403
from hmis.apps.insurance.views_core import *  # noqa: F403
from hmis.apps.insurance.views_remittance_webhook import *  # noqa: F403
