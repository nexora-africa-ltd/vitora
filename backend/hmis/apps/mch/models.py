# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Mch models for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the mch module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.mch.models_child_health import *  # noqa: F403
from hmis.apps.mch.models_hei import *  # noqa: F403
from hmis.apps.mch.models_maternal import *  # noqa: F403
from hmis.apps.mch.models_shared import *  # noqa: F403
