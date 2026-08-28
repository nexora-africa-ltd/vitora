# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing views for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the billing module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.views_catalog import *  # noqa: F403
from hmis.apps.billing.views_invoice_payment import *  # noqa: F403
from hmis.apps.billing.views_mpesa_reports import *  # noqa: F403
from hmis.apps.billing.views_supplier import *  # noqa: F403
