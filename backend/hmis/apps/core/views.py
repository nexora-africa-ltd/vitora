# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split core view modules.
How to use: import from `hmis.apps.core.views` to access all core API view classes/functions.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.core.views_audit_reference import *  # noqa: F403
from hmis.apps.core.views_audit_reference import _build_user_info
from hmis.apps.core.views_document_hub import *  # noqa: F403
from hmis.apps.core.views_org_facility import *  # noqa: F403
from hmis.apps.core.views_security_documents import *  # noqa: F403
from hmis.apps.core.views_staff_rbac import *  # noqa: F403
