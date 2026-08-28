# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Inpatient serializers for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the inpatient module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.inpatient.serializers_atr_templates import *  # noqa: F403
from hmis.apps.inpatient.serializers_discharge_transfer import *  # noqa: F403
from hmis.apps.inpatient.serializers_kardex_alerts import *  # noqa: F403
from hmis.apps.inpatient.serializers_monitoring_medication import *  # noqa: F403
from hmis.apps.inpatient.serializers_shared import *  # noqa: F403
from hmis.apps.inpatient.serializers_ward_admission import *  # noqa: F403
