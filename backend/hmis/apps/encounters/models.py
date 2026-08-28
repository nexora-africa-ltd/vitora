# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split encounter model modules.
How to use: import from `hmis.apps.encounters.models` to access all encounter models.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.encounters.models_clinical import *  # noqa: F403
from hmis.apps.encounters.models_encounter_core import *  # noqa: F403
from hmis.apps.encounters.models_observations import *  # noqa: F403
