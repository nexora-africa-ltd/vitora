# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core views for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the core module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.core.views_audit_reference import *  # noqa: F403
from hmis.apps.core.views_audit_reference import _build_user_info
from hmis.apps.core.views_document_hub import *  # noqa: F403
from hmis.apps.core.views_org_facility import *  # noqa: F403
from hmis.apps.core.views_security_documents import *  # noqa: F403
from hmis.apps.core.views_staff_rbac import *  # noqa: F403
