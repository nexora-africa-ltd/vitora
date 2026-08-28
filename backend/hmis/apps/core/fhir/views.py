# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split FHIR core view modules.
How to use: import from `hmis.apps.core.fhir.views` to access all FHIR API view classes.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.core.fhir.views_clinical_resources import *  # noqa: F403
from hmis.apps.core.fhir.views_composition_medication import *  # noqa: F403
from hmis.apps.core.fhir.views_observation_condition import *  # noqa: F403
from hmis.apps.core.fhir.views_patient_admin import *  # noqa: F403
from hmis.apps.core.fhir.views_summary_bundle import *  # noqa: F403
