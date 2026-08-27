# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
What this file is for: compatibility shim for organization/facility core model modules.
How to use: import from `hmis.apps.core.models_org_facility` to access organization/facility/SNOMED models.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.core.models_facility import *  # noqa: F403
from hmis.apps.core.models_org import *  # noqa: F403
from hmis.apps.core.models_snomed import *  # noqa: F403
