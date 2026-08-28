# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core serializers for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the core module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.core.serializers_audit_rbac import *  # noqa: F403
from hmis.apps.core.serializers_membership_dhis2 import *  # noqa: F403
from hmis.apps.core.serializers_org_facility import *  # noqa: F403
from hmis.apps.core.serializers_security_invite_auth import *  # noqa: F403
