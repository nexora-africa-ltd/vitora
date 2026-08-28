# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split MCH model modules.
How to use: import from `hmis.apps.mch.models` to access all MCH model classes/helpers.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.mch.models_child_health import *  # noqa: F403
from hmis.apps.mch.models_hei import *  # noqa: F403
from hmis.apps.mch.models_maternal import *  # noqa: F403
from hmis.apps.mch.models_shared import *  # noqa: F403
