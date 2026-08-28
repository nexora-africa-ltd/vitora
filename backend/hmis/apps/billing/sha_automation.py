# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split SHA automation service modules.
How to use: import from `hmis.apps.billing.sha_automation` to access SHAClaimAutomationService.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.billing.sha_automation_core import *  # noqa: F403
from hmis.apps.billing.sha_automation_shared import *  # noqa: F403
