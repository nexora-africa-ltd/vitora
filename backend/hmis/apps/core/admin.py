# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split core admin modules.
How to use: Django loads this module for admin registrations; it re-exports split admin definitions.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.core.admin_facility_security import *  # noqa: F403
from hmis.apps.core.admin_pricing_org import *  # noqa: F403
from hmis.apps.core.admin_rbac_codes import *  # noqa: F403
from hmis.apps.core.admin_user_audit import *  # noqa: F403
