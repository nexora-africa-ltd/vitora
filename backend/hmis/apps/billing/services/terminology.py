# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split billing terminology service modules.
How to use: import from `hmis.apps.billing.services.terminology` for TerminologyService and models.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.billing.services.sha_auth import SHAAuthService
from hmis.apps.billing.services.terminology_core import *  # noqa: F403
from hmis.apps.billing.services.terminology_models import *  # noqa: F403
