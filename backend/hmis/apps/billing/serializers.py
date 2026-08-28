# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split billing serializer modules.
How to use: import from `hmis.apps.billing.serializers` for all billing serializers.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.billing.serializers_catalog_invoice import *  # noqa: F403
from hmis.apps.billing.serializers_facility_automation import *  # noqa: F403
from hmis.apps.billing.serializers_payments_receipts import *  # noqa: F403
from hmis.apps.billing.serializers_supplier import *  # noqa: F403
