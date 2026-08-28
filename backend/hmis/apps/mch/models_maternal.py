# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split maternal MCH model modules.
How to use: imported by `hmis.apps.mch.models` compatibility shim.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.mch.models_maternal_journey import *  # noqa: F403
from hmis.apps.mch.models_maternal_labour_pnc import *  # noqa: F403
