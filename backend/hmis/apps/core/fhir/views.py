# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core views for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the core module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.core.fhir.views_clinical_resources import *  # noqa: F403
from hmis.apps.core.fhir.views_composition_medication import *  # noqa: F403
from hmis.apps.core.fhir.views_observation_condition import *  # noqa: F403
from hmis.apps.core.fhir.views_patient_admin import *  # noqa: F403
from hmis.apps.core.fhir.views_summary_bundle import *  # noqa: F403
