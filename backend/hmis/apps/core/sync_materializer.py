# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: compatibility shim for split sync materializer modules.
How to use: import from `hmis.apps.core.sync_materializer` for materialization helpers/functions.
Supported inputs/args: module exports only; no CLI args or environment variables.
"""

from hmis.apps.core.sync_materializer_core import *  # noqa: F403
from hmis.apps.core.sync_materializer_helpers import *  # noqa: F403
from hmis.apps.core.sync_materializer_resolvers import *  # noqa: F403
