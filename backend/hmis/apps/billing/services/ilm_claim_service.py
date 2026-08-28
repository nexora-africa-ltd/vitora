# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split ILM claim service modules.
How to use: import from `hmis.apps.billing.services.ilm_claim_service` for ILM service APIs.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.billing.services.ilm_claim_service_core import *  # noqa: F403
from hmis.apps.billing.services.ilm_claim_service_shared import *  # noqa: F403
