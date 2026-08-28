# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core sync urls for Vitora HMIS.

What this file is for:
- Implement sync urls logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.urls import path

from .sync_views import (
    sync_conflicts_list,
    sync_dashboard,
    sync_pull,
    sync_push,
    sync_resolve_conflict,
    sync_status,
)

urlpatterns = [
    path("push/", sync_push, name="sync-push"),
    path("pull/", sync_pull, name="sync-pull"),
    path("status/", sync_status, name="sync-status"),
    path("resolve/", sync_resolve_conflict, name="sync-resolve-conflict"),
    path("conflicts/", sync_conflicts_list, name="sync-conflicts-list"),
    path("dashboard/", sync_dashboard, name="sync-dashboard"),
]
