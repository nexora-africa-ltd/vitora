# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core dashboard views for Vitora HMIS.

What this file is for:
- Implement dashboard views logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.core.dashboard_views_activity import *  # noqa: F403
from hmis.apps.core.dashboard_views_shared import *  # noqa: F403
from hmis.apps.core.dashboard_views_stats import *  # noqa: F403
from hmis.apps.core.dashboard_views_trends import *  # noqa: F403
