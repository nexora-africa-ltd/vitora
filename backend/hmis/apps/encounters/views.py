# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split encounter view modules.
How to use: import from `hmis.apps.encounters.views` to access encounter API views/viewsets.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.encounters.views_catalog_diagnosis import *  # noqa: F403
from hmis.apps.encounters.views_clinical_history import *  # noqa: F403
from hmis.apps.encounters.views_encounter_core import *  # noqa: F403
from hmis.apps.encounters.views_shared import *  # noqa: F403
