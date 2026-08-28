# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Encounters models for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the encounters module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.encounters.models_clinical import *  # noqa: F403
from hmis.apps.encounters.models_encounter_core import *  # noqa: F403
from hmis.apps.encounters.models_observations import *  # noqa: F403
