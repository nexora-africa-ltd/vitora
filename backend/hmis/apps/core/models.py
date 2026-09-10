# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core models for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the core module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
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
from hmis.apps.core.models_reference_pricing import SubscriptionPeriod  # noqa: F401
from hmis.apps.core.models_security import *  # noqa: F403
