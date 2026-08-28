# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Triage views for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the triage module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.triage.views_assessment_queue import *  # noqa: F403
from hmis.apps.triage.views_escalation_public import *  # noqa: F403
from hmis.apps.triage.views_reports_beds import *  # noqa: F403
