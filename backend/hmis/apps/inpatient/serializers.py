# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split inpatient serializer modules.
How to use: import from `hmis.apps.inpatient.serializers` to access serializer classes and helpers.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.inpatient.serializers_atr_templates import *  # noqa: F403
from hmis.apps.inpatient.serializers_discharge_transfer import *  # noqa: F403
from hmis.apps.inpatient.serializers_kardex_alerts import *  # noqa: F403
from hmis.apps.inpatient.serializers_monitoring_medication import *  # noqa: F403
from hmis.apps.inpatient.serializers_shared import *  # noqa: F403
from hmis.apps.inpatient.serializers_ward_admission import *  # noqa: F403
