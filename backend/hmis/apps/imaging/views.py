# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Imaging views for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the imaging module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.imaging.views_dicom import *  # noqa: F403
from hmis.apps.imaging.views_reports import *  # noqa: F403
from hmis.apps.imaging.views_settings import *  # noqa: F403
from hmis.apps.imaging.views_share import *  # noqa: F403
from hmis.apps.imaging.views_shared import *  # noqa: F403
from hmis.apps.imaging.views_workflow import *  # noqa: F403
