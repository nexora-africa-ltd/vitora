# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split encounter core view modules.
How to use: imported by `hmis.apps.encounters.views` compatibility shim.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.encounters.views_encounter_lifecycle import *  # noqa: F403
from hmis.apps.encounters.views_encounter_treatment import *  # noqa: F403
