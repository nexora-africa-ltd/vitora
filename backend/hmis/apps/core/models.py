# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
What this file is for: backward-compatible core model export surface.
How to use: existing imports from `hmis.apps.core.models` continue to work while models live in focused modules.
Supported inputs/args: import-time model symbol re-exports only.
"""

# Import EventStore so Django discovers it for migrations.
from hmis.apps.core.events.store import EventStore  # noqa: F401

# Import MFA models so Django discovers them for migrations.
from hmis.apps.core.mfa.models import (  # noqa: F401
    BackupCode,
    MFAToken,
    UserTOTPDevice,
    UserWebAuthnCredential,
)
from hmis.apps.core.models_audit_sync import *  # noqa: F403
from hmis.apps.core.models_org_facility import *  # noqa: F403
from hmis.apps.core.models_reference import *  # noqa: F403
from hmis.apps.core.models_security import *  # noqa: F403
