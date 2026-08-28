# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split core dashboard view modules.
How to use: import from `hmis.apps.core.dashboard_views` for dashboard API functions.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.core.dashboard_views_activity import *  # noqa: F403
from hmis.apps.core.dashboard_views_shared import *  # noqa: F403
from hmis.apps.core.dashboard_views_stats import *  # noqa: F403
from hmis.apps.core.dashboard_views_trends import *  # noqa: F403
