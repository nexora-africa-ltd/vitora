"""
REST API views for offline-first sync (Tauri desktop / facility hub clients).

Endpoints:
- POST /api/sync/push/       — Batch push changes from client
- GET  /api/sync/pull/       — Incremental pull changes from server
- GET  /api/sync/status/     — Sync health check
- POST /api/sync/resolve/    — Resolve a sync conflict
- GET  /api/sync/conflicts/  — List unresolved conflicts
"""

import logging

from django.apps import apps
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import SyncConflict, SyncQueue
from hmis.apps.core.sync_serializers import (
    SyncConflictDetailSerializer,
    SyncConflictResolveSerializer,
    SyncPushRequestSerializer,
)

logger = logging.getLogger(__name__)

# Tables allowed for sync (prevent arbitrary model writes)
SYNCABLE_TABLES = {
    "patients_patient",
    "patients_emergencycontact",
    "encounters_encounter",
    "encounters_diagnosis",
    "encounters_treatmentplan",
    "encounters_medication",
    "triage_triageassessment",
    "pharmacy_prescription",
    "pharmacy_prescriptionitem",
    "laboratory_laborder",
    "laboratory_laborderitem",
    "laboratory_labresult",
    "billing_invoice",
    "scheduling_shift",
}


def _get_model_for_table(table_name: str):
    """Resolve a Django model class from a table name like 'app_model'."""
    try:
        for model in apps.get_models():
            if model._meta.db_table == table_name:
                return model
    except LookupError:
        pass
    return None


def _resolve_facility(user):
    """Resolve facility from the authenticated user's staff profile."""
    profile = getattr(user, "staff_profile", None)
    if profile:
        return profile.primary_facility
    return None


def _resolve_organization(user):
    """Resolve organization from the authenticated user's staff profile."""
    profile = getattr(user, "staff_profile", None)
    if profile:
        return profile.organization
    return None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_push(request):
    """
    Accept a batch of changes from a client device.

    Each change is validated, checked for conflicts, and queued.
    Returns counts of accepted/rejected/conflicted entries.
    """
    serializer = SyncPushRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    changes = serializer.validated_data["changes"]
    client_id = serializer.validated_data["client_id"]

    facility = _resolve_facility(request.user)
    organization = _resolve_organization(request.user)

    accepted = 0
    rejections = []
    conflicts = []

    batch_size = getattr(settings, "SYNC_BATCH_SIZE", 100)
    if len(changes) > batch_size:
        return Response(
            {"detail": f"Batch size exceeds maximum of {batch_size}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        for idx, change in enumerate(changes):
            table = change["table"]
            operation = change["operation"]
            record_id = change.get("record_id")
            data = change["data"]
            timestamp = change["timestamp"]

            # Validate table is syncable
            if table not in SYNCABLE_TABLES:
                rejections.append(
                    {
                        "index": idx,
                        "table": table,
                        "record_id": record_id,
                        "reason": f"Table '{table}' is not syncable.",
                    }
                )
                continue

            # For UPDATE/DELETE, check for conflicts
            if operation in ("UPDATE", "DELETE") and record_id:
                existing_entry = (
                    SyncQueue.objects.filter(
                        model_name=table,
                        record_id=record_id,
                        status="SYNCED",
                    )
                    .order_by("-synced_at")
                    .first()
                )

                if (
                    existing_entry
                    and existing_entry.synced_at
                    and existing_entry.synced_at > timestamp
                ):
                    # Conflict: server has newer data
                    conflict = SyncConflict.objects.create(
                        model_name=table,
                        record_id=record_id,
                        local_data=data,
                        remote_data=existing_entry.data,
                        resolution_strategy="LAST_WRITE_WINS",
                        status="PENDING",
                    )
                    conflicts.append(
                        {
                            "index": idx,
                            "table": table,
                            "record_id": record_id,
                            "conflict_id": conflict.pk,
                            "local_data": data,
                            "remote_data": existing_entry.data,
                        }
                    )
                    continue

            # Queue the change
            SyncQueue.objects.create(
                operation=operation,
                model_name=table,
                record_id=int(record_id) if record_id and record_id.isdigit() else None,
                data={
                    **data,
                    "_client_id": client_id,
                    "_client_timestamp": timestamp.isoformat(),
                },
                status="PENDING",
                facility=facility,
                organization=organization,
            )
            accepted += 1

    response_data = {
        "accepted": accepted,
        "rejected": len(rejections),
        "conflicts": conflicts,
        "rejections": rejections,
        "server_timestamp": timezone.now(),
    }
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sync_pull(request):
    """
    Return changes since a given timestamp for the client's facility.

    Query parameters:
    - since: ISO timestamp (required unless full=true)
    - full: If 'true', return all records (for full re-sync)
    - tables: Comma-separated list of tables to pull (optional, defaults to all)
    - limit: Max records to return (default 500)
    """
    facility = _resolve_facility(request.user)
    organization = _resolve_organization(request.user)

    since = request.query_params.get("since")
    full = request.query_params.get("full", "").lower() == "true"
    tables_param = request.query_params.get("tables", "")
    limit = min(int(request.query_params.get("limit", "500")), 1000)

    if not since and not full:
        return Response(
            {"detail": "Either 'since' parameter or 'full=true' is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Filter to requested tables (or all syncable)
    tables = set(tables_param.split(",")) & SYNCABLE_TABLES if tables_param else SYNCABLE_TABLES

    # Build queryset
    qs = SyncQueue.objects.filter(
        model_name__in=tables,
        status="SYNCED",
    )

    # Scope to facility/org
    if facility:
        qs = qs.filter(facility=facility)
    elif organization:
        qs = qs.filter(organization=organization)

    # Filter by time
    if since and not full:
        from django.utils.dateparse import parse_datetime

        since_dt = parse_datetime(since)
        if not since_dt:
            return Response(
                {"detail": "Invalid 'since' timestamp format. Use ISO 8601."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = qs.filter(synced_at__gt=since_dt)

    # Order and paginate
    qs = qs.order_by("id")
    entries = list(qs[: limit + 1])
    has_more = len(entries) > limit
    entries = entries[:limit]

    changes = []
    for entry in entries:
        changes.append(
            {
                "table": entry.model_name,
                "operation": entry.operation,
                "record_id": str(entry.record_id) if entry.record_id else None,
                "data": entry.data,
                "timestamp": entry.synced_at or entry.created_at,
                "server_sequence": entry.pk,
            }
        )

    response_data = {
        "changes": changes,
        "server_timestamp": timezone.now(),
        "has_more": has_more,
        "next_cursor": str(entries[-1].pk) if has_more and entries else None,
    }
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sync_status(request):
    """Return sync health/status for the client's facility."""
    facility = _resolve_facility(request.user)
    organization = _resolve_organization(request.user)

    qs = SyncQueue.objects.all()
    if facility:
        qs = qs.filter(facility=facility)
    elif organization:
        qs = qs.filter(organization=organization)

    last_synced = qs.filter(status="SYNCED").order_by("-synced_at").first()
    pending_count = qs.filter(status="PENDING").count()
    failed_count = qs.filter(status="FAILED").count()

    conflict_count = SyncConflict.objects.filter(status="PENDING").count()

    response_data = {
        "last_sync": last_synced.synced_at if last_synced else None,
        "pending_changes": pending_count,
        "failed_changes": failed_count,
        "conflicts": conflict_count,
        "server_timestamp": timezone.now(),
    }
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_resolve_conflict(request):
    """
    Resolve a sync conflict.

    Body: { conflict_id, resolution: "local_wins"|"remote_wins"|"merge", merged_data?: {} }
    """
    serializer = SyncConflictResolveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    conflict_id = serializer.validated_data["conflict_id"]
    resolution = serializer.validated_data["resolution"]
    merged_data = serializer.validated_data.get("merged_data", {})

    try:
        conflict = SyncConflict.objects.get(pk=conflict_id, status="PENDING")
    except SyncConflict.DoesNotExist:
        return Response(
            {"detail": "Conflict not found or already resolved."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Map resolution to strategy
    strategy_map = {
        "local_wins": "LOCAL_WINS",
        "remote_wins": "REMOTE_WINS",
        "merge": "MERGED",
    }

    if resolution == "local_wins":
        resolved_data = conflict.local_data
    elif resolution == "remote_wins":
        resolved_data = conflict.remote_data
    else:
        if not merged_data:
            return Response(
                {"detail": "merged_data is required for 'merge' resolution."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        resolved_data = merged_data

    conflict.resolve(
        resolved_data=resolved_data,
        strategy=strategy_map[resolution],
        user=request.user,
    )

    return Response(
        SyncConflictDetailSerializer(conflict).data,
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sync_conflicts_list(request):
    """List unresolved sync conflicts."""
    conflicts = SyncConflict.objects.filter(status="PENDING").order_by("-detected_at")

    # Pagination
    limit = min(int(request.query_params.get("limit", "50")), 200)
    offset = int(request.query_params.get("offset", "0"))

    total = conflicts.count()
    page = conflicts[offset : offset + limit]

    return Response(
        {
            "results": SyncConflictDetailSerializer(page, many=True).data,
            "count": total,
            "limit": limit,
            "offset": offset,
        }
    )
