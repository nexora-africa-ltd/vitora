"""
Hub health/status endpoint for monitoring and LAN client discovery.
Remote wipe endpoint for lost/stolen hub devices.

GET  /api/hub/health/     — Unauthenticated endpoint returning hub status.
POST /api/hub/wipe/       — Authenticated admin endpoint to trigger remote wipe.
GET  /api/hub/wipe-check/ — Client-side poll to check if wipe is requested.
"""

import time

from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response

from hmis.apps.core.models import SyncQueue

# Track when the hub process started
_START_TIME = time.time()

# In-memory wipe flag (persisted via _sync_meta or settings in production)
_wipe_requested: dict[str, str] = {}  # hub_id → requested_by


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


@api_view(["POST"])
@permission_classes([IsAdminUser])
def request_remote_wipe(request):
    """
    Request a remote wipe for a hub device.

    POST /api/hub/wipe/
    Body: { "hub_id": "facility-hub-001", "reason": "Device stolen" }

    Only admins can trigger a remote wipe. The hub will check for wipe
    signals on its next sync cycle and destroy local data.
    """
    hub_id = request.data.get("hub_id")
    reason = request.data.get("reason", "")

    if not hub_id:
        return Response({"error": "hub_id is required"}, status=400)

    _wipe_requested[hub_id] = request.user.get_username()

    # Also persist as a SyncQueue entry so it survives restarts
    # Use filter + create/update pattern since JSON lookup can't be a uniqueness key
    existing = (
        SyncQueue.objects.filter(
            model_name="__remote_wipe__",
            status="PENDING",
        )
        .filter(data__hub_id=hub_id)
        .first()
    )

    if existing:
        existing.data = {
            "hub_id": hub_id,
            "reason": reason,
            "requested_by": request.user.get_username(),
            "requested_at": timezone.now().isoformat(),
        }
        existing.save(update_fields=["data"])
    else:
        SyncQueue.objects.create(
            model_name="__remote_wipe__",
            operation="DELETE",
            record_id=None,
            data={
                "hub_id": hub_id,
                "reason": reason,
                "requested_by": request.user.get_username(),
                "requested_at": timezone.now().isoformat(),
            },
            status="PENDING",
        )

    return Response(
        {
            "status": "wipe_requested",
            "hub_id": hub_id,
            "requested_by": request.user.get_username(),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def check_wipe_status(request):  # noqa: ARG001
    """
    Check if a remote wipe has been requested for this hub.

    GET /api/hub/wipe-check/

    Hubs poll this endpoint on each sync cycle. If a wipe is pending,
    the hub should destroy its local database and reset to factory state.
    """
    hub_id = getattr(settings, "HUB_ID", "")

    if not hub_id:
        return Response({"wipe_requested": False})

    # Check in-memory flag
    if hub_id in _wipe_requested:
        return Response(
            {
                "wipe_requested": True,
                "hub_id": hub_id,
                "requested_by": _wipe_requested[hub_id],
            }
        )

    # Check persisted wipe requests
    wipe_entry = SyncQueue.objects.filter(
        model_name="__remote_wipe__",
        data__hub_id=hub_id,
        status="PENDING",
    ).first()

    if wipe_entry:
        return Response(
            {
                "wipe_requested": True,
                "hub_id": hub_id,
                "requested_by": wipe_entry.data.get("requested_by", "unknown"),
            }
        )

    return Response({"wipe_requested": False})
