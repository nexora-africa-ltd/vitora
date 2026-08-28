# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Inpatient models for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the inpatient module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.inpatient.models_atr_templates import *  # noqa: F403
from hmis.apps.inpatient.models_kardex import *  # noqa: F403
from hmis.apps.inpatient.models_monitoring import *  # noqa: F403
from hmis.apps.inpatient.models_transfer_rounds import *  # noqa: F403
from hmis.apps.inpatient.models_ward_admission import *  # noqa: F403
