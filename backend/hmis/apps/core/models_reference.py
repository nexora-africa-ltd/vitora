# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
What this file is for: compatibility shim for core reference model modules.
How to use: import from `hmis.apps.core.models_reference` to access all reference/identity/pricing models.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.core.models_reference_geo_staff import *  # noqa: F403
from hmis.apps.core.models_reference_ops import *  # noqa: F403
from hmis.apps.core.models_reference_pricing import *  # noqa: F403
