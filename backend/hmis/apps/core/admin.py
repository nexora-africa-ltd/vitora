# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core admin for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the core module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.core.admin_facility_security import *  # noqa: F403
from hmis.apps.core.admin_pricing_org import *  # noqa: F403
from hmis.apps.core.admin_rbac_codes import *  # noqa: F403
from hmis.apps.core.admin_user_audit import *  # noqa: F403
