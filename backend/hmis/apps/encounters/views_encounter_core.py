# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Encounters views encounter core for Vitora HMIS.

What this file is for:
- Implement views encounter core logic for the encounters domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.encounters.views_encounter_lifecycle import *  # noqa: F403
from hmis.apps.encounters.views_encounter_treatment import *  # noqa: F403
