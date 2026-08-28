# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core models reference for Vitora HMIS.

What this file is for:
- Implement models reference logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.core.models_reference_geo_staff import *  # noqa: F403
from hmis.apps.core.models_reference_ops import *  # noqa: F403
from hmis.apps.core.models_reference_pricing import *  # noqa: F403
