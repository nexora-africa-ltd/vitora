"""
Hub health/status endpoint for monitoring and LAN client discovery.

GET /api/hub/health/ — Unauthenticated endpoint returning hub status.
Used by LAN clients to discover the hub and verify it's operational.
"""

import time

from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from hmis.apps.core.models import SyncQueue

# Track when the hub process started
_START_TIME = time.time()


@api_view(["GET"])
@permission_classes([AllowAny])
def hub_health(request):  # noqa: ARG001
    """
    Hub health status — unauthenticated for LAN discovery.

    Returns:
        - status: "healthy" | "degraded" | "unhealthy"
        - hub_id: unique hub identifier
        - facility_id: facility this hub serves
        - uptime_seconds: process uptime
        - database: DB connectivity check
        - sync: pending/failed counts, last sync time
        - version: software version
    """
    health = {
        "status": "healthy",
        "hub_id": getattr(settings, "HUB_ID", ""),
        "facility_id": getattr(settings, "HUB_FACILITY_ID", ""),
        "organization_id": getattr(settings, "HUB_ORGANIZATION_ID", ""),
        "uptime_seconds": int(time.time() - _START_TIME),
        "server_time": timezone.now().isoformat(),
        "version": "0.3.0",
    }

    # Database check
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        health["database"] = {"status": "ok"}
    except Exception as e:
        health["database"] = {"status": "error", "message": str(e)[:100]}
        health["status"] = "unhealthy"

    # Sync queue status
    try:
        pending_count = SyncQueue.objects.filter(status="PENDING").count()
        failed_count = SyncQueue.objects.filter(status="FAILED").count()
        last_synced = (
            SyncQueue.objects.filter(status="SYNCED")
            .order_by("-synced_at")
            .values_list("synced_at", flat=True)
            .first()
        )

        health["sync"] = {
            "pending": pending_count,
            "failed": failed_count,
            "last_synced_at": last_synced.isoformat() if last_synced else None,
        }

        if failed_count > 10:
            health["status"] = "degraded"

    except Exception as e:
        health["sync"] = {"status": "error", "message": str(e)[:100]}
        health["status"] = "degraded"

    return Response(health)
