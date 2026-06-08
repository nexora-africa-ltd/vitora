"""
URL configuration for REST sync API endpoints.

These endpoints serve Tauri desktop clients and facility hubs
for offline-first data synchronization.
"""

from django.urls import path

from .sync_views import (
    sync_conflicts_list,
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
]
