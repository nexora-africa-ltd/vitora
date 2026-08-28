# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Ai serializers for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the ai module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.ai.serializers_core_context import *  # noqa: F403
from hmis.apps.ai.serializers_docs_cds_stored import *  # noqa: F403
from hmis.apps.ai.serializers_lab_care import *  # noqa: F403
from hmis.apps.ai.serializers_prediction_feedback import *  # noqa: F403
from hmis.apps.ai.serializers_surgical_ops import *  # noqa: F403
