# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split billing view modules.
How to use: import from `hmis.apps.billing.views` to access billing API viewsets.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.billing.views_catalog import *  # noqa: F403
from hmis.apps.billing.views_invoice_payment import *  # noqa: F403
from hmis.apps.billing.views_mpesa_reports import *  # noqa: F403
from hmis.apps.billing.views_supplier import *  # noqa: F403
