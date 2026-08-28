# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split core serializer modules.
How to use: import from `hmis.apps.core.serializers` to access all core serializer classes.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.core.serializers_audit_rbac import *  # noqa: F403
from hmis.apps.core.serializers_membership_dhis2 import *  # noqa: F403
from hmis.apps.core.serializers_org_facility import *  # noqa: F403
from hmis.apps.core.serializers_security_invite_auth import *  # noqa: F403
