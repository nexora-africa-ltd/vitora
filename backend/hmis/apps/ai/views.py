# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split AI view modules.
How to use: import from `hmis.apps.ai.views` to access all AI API view classes.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.ai import views_chat as _views_chat
from hmis.apps.ai import views_clinical_tools as _views_clinical_tools
from hmis.apps.ai import views_core as _views_core
from hmis.apps.ai import views_feedback_insights as _views_feedback_insights
from hmis.apps.ai import views_icu_autopopulate as _views_icu_autopopulate
from hmis.apps.ai import views_ops as _views_ops
from hmis.apps.ai import views_surgical_advisory as _views_surgical_advisory
from hmis.apps.ai.views_chat import *  # noqa: F403
from hmis.apps.ai.views_clinical_tools import *  # noqa: F403
from hmis.apps.ai.views_core import *  # noqa: F403
from hmis.apps.ai.views_feedback_insights import *  # noqa: F403
from hmis.apps.ai.views_icu_autopopulate import *  # noqa: F403
from hmis.apps.ai.views_ops import *  # noqa: F403
from hmis.apps.ai.views_surgical_advisory import *  # noqa: F403
from hmis.apps.ai.views_surgical_advisory import _extract_suggestions


def _legacy_get_tibabot_client_proxy(*args, **kwargs):
    """Route submodule client access through legacy patch target `ai.views.get_tibabot_client`."""
    from hmis.apps.ai import views as legacy_views

    return legacy_views.get_tibabot_client(*args, **kwargs)


for _module in (
    _views_core,
    _views_chat,
    _views_feedback_insights,
    _views_icu_autopopulate,
    _views_clinical_tools,
    _views_surgical_advisory,
    _views_ops,
):
    _module.get_tibabot_client = _legacy_get_tibabot_client_proxy
