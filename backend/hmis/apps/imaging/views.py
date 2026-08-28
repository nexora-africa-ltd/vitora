# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split imaging view modules.
How to use: import from `hmis.apps.imaging.views` to access imaging DRF views and helpers.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.imaging.views_dicom import *  # noqa: F403
from hmis.apps.imaging.views_reports import *  # noqa: F403
from hmis.apps.imaging.views_settings import *  # noqa: F403
from hmis.apps.imaging.views_share import *  # noqa: F403
from hmis.apps.imaging.views_shared import *  # noqa: F403
from hmis.apps.imaging.views_workflow import *  # noqa: F403
