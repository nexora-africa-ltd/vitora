# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split shift management view modules.
How to use: imported by `hmis.apps.scheduling.views` compatibility shim.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.scheduling.views_shift_config import *  # noqa: F403
from hmis.apps.scheduling.views_shift_roster import *  # noqa: F403
