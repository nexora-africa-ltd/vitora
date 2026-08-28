# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split scheduling view modules.
How to use: import from `hmis.apps.scheduling.views` to access scheduling filters and viewsets.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.scheduling.views_assignment import *  # noqa: F403
from hmis.apps.scheduling.views_resources_appointments import *  # noqa: F403
from hmis.apps.scheduling.views_shift_management import *  # noqa: F403
from hmis.apps.scheduling.views_shift_swap import *  # noqa: F403
