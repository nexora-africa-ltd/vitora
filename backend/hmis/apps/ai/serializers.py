# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split AI serializer modules.
How to use: import from `hmis.apps.ai.serializers` to access all AI serializer classes.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.ai.serializers_core_context import *  # noqa: F403
from hmis.apps.ai.serializers_docs_cds_stored import *  # noqa: F403
from hmis.apps.ai.serializers_lab_care import *  # noqa: F403
from hmis.apps.ai.serializers_prediction_feedback import *  # noqa: F403
from hmis.apps.ai.serializers_surgical_ops import *  # noqa: F403
