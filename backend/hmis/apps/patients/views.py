# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Patients views for Vitora HMIS.

What this file is for:
- Maintain backward-compatible exports for the patients module split.

How to use it:
- Import from this legacy module path to keep existing imports working.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.patients.views_patient import *  # noqa: F403

# Backward-compatible patch point used by HIE integration tests.
from hmis.apps.patients.views_related_records import *  # noqa: F403
