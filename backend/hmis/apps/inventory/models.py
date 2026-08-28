# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Inventory models for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the inventory module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.inventory.models_counts_etims import *  # noqa: F403
from hmis.apps.inventory.models_forecasting import *  # noqa: F403
from hmis.apps.inventory.models_procurement import *  # noqa: F403
from hmis.apps.inventory.models_stock_flow import *  # noqa: F403
