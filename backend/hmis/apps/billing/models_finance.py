# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
What this file is for: compatibility shim for billing finance model modules.
How to use: import from `hmis.apps.billing.models_finance` to access invoice/payment models.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.billing.models_finance_invoice import *  # noqa: F403
from hmis.apps.billing.models_finance_payments import *  # noqa: F403
