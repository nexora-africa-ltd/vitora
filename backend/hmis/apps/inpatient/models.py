# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split inpatient model modules.
How to use: import from `hmis.apps.inpatient.models` to access all inpatient models.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.inpatient.models_atr_templates import *  # noqa: F403
from hmis.apps.inpatient.models_kardex import *  # noqa: F403
from hmis.apps.inpatient.models_monitoring import *  # noqa: F403
from hmis.apps.inpatient.models_transfer_rounds import *  # noqa: F403
from hmis.apps.inpatient.models_ward_admission import *  # noqa: F403
