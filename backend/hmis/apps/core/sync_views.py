# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
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

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import identify_hasher
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import SyncConflict, SyncQueue
from hmis.apps.core.sync_registry import (
    downward_sync_models,
    get_registry_entry,
    is_upward_sync_model,
)
from hmis.apps.core.sync_serializers import (
    SyncConflictDetailSerializer,
    SyncConflictResolveSerializer,
    SyncPushRequestSerializer,
)
from hmis.apps.core.sync_signals import add_sync_meta, serialize_instance_for_sync
from hmis.apps.licensing.hub_auth import HubLicenseOrJWTAuthentication, IsAuthenticatedOrHubLicense

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

HUB_IDENTITY_TABLES = {"auth.User", "core.StaffProfile"}
HUB_USER_ALLOWED_FIELDS = {
    "id",
    "username",
    "email",
    "first_name",
    "last_name",
    "password",
    "is_active",
    "sync_meta",
}
HUB_STAFF_PROFILE_ALLOWED_FIELDS = {
    "id",
    "user",
    "user_id",
    "employee_id",
    "title",
    "middle_name",
    "primary_role",
    "primary_role_id",
    "primary_department",
    "primary_department_id",
    "organization",
    "organization_id",
    "primary_facility",
    "primary_facility_id",
    "facility",
    "facility_id",
    "hwr_id",
    "license_number",
    "license_expiry",
    "license_verified",
    "licensing_body",
    "specialization",
    "employment_status",
    "employment_type",
    "date_joined",
    "date_left",
    "sync_meta",
}


def _record_id_to_int(record_id) -> int | None:
    """Return an integer record id if one was supplied."""
    if record_id in (None, ""):
        return None
    try:
        return int(record_id)
    except (TypeError, ValueError):
        return None


def _reject_identity(reason: str) -> dict:
    """Build a common identity sync result for rejected changes."""
    return {"success": False, "reason": reason}


def _apply_hub_identity_change(*, table: str, operation: str, record_id, data: dict, installation):
    """Apply tightly scoped hub identity changes directly on the cloud."""
    if installation is None:
        return _reject_identity("Identity sync requires an active hub license.")
    if operation not in {"CREATE", "UPDATE"}:
        return _reject_identity("Identity sync only supports CREATE and UPDATE operations.")
    if table == "auth.User":
        return _upsert_hub_user(record_id=record_id, data=data, installation=installation)
    if table == "core.StaffProfile":
        return _upsert_hub_staff_profile(record_id=record_id, data=data, installation=installation)
    return _reject_identity(f"Unsupported identity table '{table}'.")


def _upsert_hub_user(*, record_id, data: dict, installation):
    """Create/update a non-privileged cloud user from a licensed hub."""
    unexpected_fields = set(data) - HUB_USER_ALLOWED_FIELDS
    if unexpected_fields:
        return _reject_identity(
            f"Field(s) not allowed for hub user sync: {', '.join(sorted(unexpected_fields))}."
        )

    record_pk = _record_id_to_int(record_id or data.get("id"))
    if record_pk is None:
        return _reject_identity("Hub user sync requires a numeric record_id.")

    username = str(data.get("username") or "").strip()
    if not username:
        return _reject_identity("Hub user sync requires a username.")

    password_hash = data.get("password")
    if password_hash:
        try:
            identify_hasher(password_hash)
        except ValueError:
            return _reject_identity("Hub user sync requires an encoded Django password hash.")

    User = get_user_model()
    existing_by_pk = User.objects.filter(pk=record_pk).first()
    existing_by_username = User.objects.filter(username=username).first()
    email = str(data.get("email") or "").strip()
    existing_by_email = User.objects.filter(email__iexact=email).first() if email else None

    for existing in (existing_by_username, existing_by_email):
        if existing and existing.pk != record_pk:
            return _reject_identity("Hub user sync would collide with an existing cloud user.")

    user = existing_by_pk or existing_by_username or existing_by_email
    profile = getattr(user, "staff_profile", None) if user else None
    if (
        profile
        and profile.organization_id
        and profile.organization_id != installation.organization_id
    ):
        return _reject_identity("Hub user belongs to a different organization.")

    creating = user is None
    if creating and not password_hash:
        return _reject_identity("Hub user creation requires a password hash.")
    if creating:
        user = User(pk=record_pk, username=username)

    object.__setattr__(user, "_from_sync_materializer", True)
    user.username = username
    user.email = email
    user.first_name = str(data.get("first_name") or "")
    user.last_name = str(data.get("last_name") or "")
    if "is_active" in data:
        user.is_active = bool(data.get("is_active"))
    elif creating:
        user.is_active = True
    if password_hash:
        user.password = password_hash
    if creating:
        user.is_staff = False
        user.is_superuser = False
    user.save()
    return {"success": True}


def _get_scoped_role(role_id, installation):
    """Return a role if it is global or scoped to the hub installation."""
    from hmis.apps.core.models import Role

    role = Role.objects.filter(pk=role_id).first()
    if role is None:
        return None
    role_organization_id = getattr(role, "organization_id", None)
    role_facility_id = getattr(role, "facility_id", None)
    if role_organization_id and role_organization_id != installation.organization_id:
        return None
    if role_facility_id and role_facility_id != installation.facility_id:
        return None
    return role


def _get_scoped_department(department_id, installation):
    """Return a department only when it belongs to the hub installation."""
    from hmis.apps.core.models import Department

    return Department.objects.filter(
        pk=department_id,
        organization=installation.organization,
        facility=installation.facility,
    ).first()


def _upsert_hub_staff_profile(*, record_id, data: dict, installation):
    """Create/update a staff profile forced into the hub installation scope."""
    if installation.facility is None:
        return _reject_identity("Hub staff profile sync requires an installation facility.")

    unexpected_fields = set(data) - HUB_STAFF_PROFILE_ALLOWED_FIELDS
    if unexpected_fields:
        return _reject_identity(
            f"Field(s) not allowed for hub staff profile sync: {', '.join(sorted(unexpected_fields))}."
        )

    record_pk = _record_id_to_int(record_id or data.get("id"))
    if record_pk is None:
        return _reject_identity("Hub staff profile sync requires a numeric record_id.")

    user_id = _record_id_to_int(data.get("user") or data.get("user_id"))
    if user_id is None:
        return _reject_identity("Hub staff profile sync requires a user id.")

    User = get_user_model()
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return _reject_identity("Hub staff profile user does not exist in the cloud.")

    role_id = _record_id_to_int(data.get("primary_role") or data.get("primary_role_id"))
    role = _get_scoped_role(role_id, installation) if role_id is not None else None
    if role is None:
        return _reject_identity("Hub staff profile primary role is not available to this hub.")

    department_id = _record_id_to_int(
        data.get("primary_department") or data.get("primary_department_id")
    )
    department = (
        _get_scoped_department(department_id, installation) if department_id is not None else None
    )
    if department is None:
        return _reject_identity(
            "Hub staff profile primary department is not available to this hub."
        )

    date_joined = parse_date(str(data.get("date_joined") or ""))
    if date_joined is None:
        return _reject_identity("Hub staff profile sync requires date_joined in YYYY-MM-DD format.")

    date_left = parse_date(str(data.get("date_left") or "")) if data.get("date_left") else None

    from hmis.apps.core.models import StaffProfile

    existing_by_pk = StaffProfile.objects.filter(pk=record_pk).first()
    existing_by_user = StaffProfile.objects.filter(user=user).first()
    employee_id = str(data.get("employee_id") or "").strip()
    existing_by_employee = (
        StaffProfile.objects.filter(employee_id=employee_id).first() if employee_id else None
    )

    candidates = [item for item in (existing_by_pk, existing_by_user, existing_by_employee) if item]
    if candidates and len({item.pk for item in candidates}) > 1:
        return _reject_identity("Hub staff profile sync would collide with an existing profile.")

    profile = candidates[0] if candidates else None
    if profile and getattr(profile, "organization_id", None) != installation.organization_id:
        return _reject_identity("Hub staff profile belongs to a different organization.")

    if profile is None:
        profile = StaffProfile(pk=record_pk, user=user)

    object.__setattr__(profile, "_from_sync_materializer", True)
    profile.employee_id = employee_id
    profile.title = str(data.get("title") or "")
    profile.middle_name = str(data.get("middle_name") or "")
    profile.primary_role = role
    profile.primary_department = department
    profile.organization = installation.organization
    profile.primary_facility = installation.facility
    profile.hwr_id = str(data.get("hwr_id") or "")
    profile.license_number = str(data.get("license_number") or "")
    profile.license_expiry = (
        parse_date(str(data.get("license_expiry") or "")) if data.get("license_expiry") else None
    )
    profile.license_verified = bool(data.get("license_verified", False))
    profile.licensing_body = str(data.get("licensing_body") or "")
    profile.specialization = str(data.get("specialization") or "")
    profile.employment_status = str(data.get("employment_status") or "ACTIVE")
    profile.employment_type = str(data.get("employment_type") or "PERMANENT")
    profile.date_joined = date_joined
    profile.date_left = date_left
    profile.save()
    return {"success": True}


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


def _resolve_facility_from_request(request):
    """Resolve facility from either hub license identity or authenticated user."""
    installation = getattr(request, "_hub_installation", None)
    if installation:
        return installation.facility
    return _resolve_facility(request.user)


def _resolve_organization_from_request(request):
    """Resolve organization from either hub license identity or authenticated user."""
    installation = getattr(request, "_hub_installation", None)
    if installation:
        return installation.organization
    return _resolve_organization(request.user)


def _model_label_to_model(model_label: str):
    """Resolve a registry label like patients.Patient to a model class."""
    app_label, model_name = model_label.split(".", 1)
    return apps.get_model(app_label, model_name)


def _scope_snapshot_queryset(model_label: str, qs, *, facility, organization):
    """Scope a full cloud-to-hub snapshot query to the hub tenant."""
    if model_label == "core.Organization":
        return qs.filter(pk=organization.pk) if organization else qs.none()
    if model_label == "core.Facility":
        return qs.filter(organization=organization) if organization else qs.none()
    if model_label == "auth.User":
        if organization:
            return qs.filter(staff_profile__organization=organization)
        return qs.none()
    if model_label == "patients.EmergencyContact":
        if organization:
            return qs.filter(patient__organization=organization)
        return qs.none()
    parent_filters = {
        "encounters.Diagnosis": "encounter__facility",
        "encounters.TreatmentPlan": "encounter__facility",
        "encounters.Medication": "encounter__facility",
        "triage.TriageAssessment": "encounter__facility",
        "clinics.ClinicRoom": "clinic__facility",
        "clinics.ClinicSchedule": "clinic__facility",
        "clinics.ClinicStaff": "clinic__facility",
        "clinics.ClinicEnrollment": "clinic__facility",
        "scheduling.Schedule": "resource__facility",
        "scheduling.ScheduleBreak": "schedule__resource__facility",
        "scheduling.StaffConstraint": "staff_resource__facility",
        "pharmacy.PrescriptionItem": "prescription__facility",
        "laboratory.LabOrderItem": "lab_order__facility",
        "laboratory.LabResult": "order_item__lab_order__facility",
        "billing.InvoiceItem": "invoice__facility",
        "billing.Payment": "invoice__facility",
        "imaging.ImagingOrder": "encounter__facility",
        "imaging.RadiologyReport": "imaging_order__encounter__facility",
    }
    parent_filter = parent_filters.get(model_label)
    if parent_filter and facility:
        return qs.filter(**{parent_filter: facility})

    model = qs.model
    if hasattr(model, "organization") and organization:
        return qs.filter(organization=organization)
    if hasattr(model, "facility") and facility:
        return qs.filter(facility=facility)
    if hasattr(model, "registered_at_facility") and organization:
        return qs.filter(organization=organization)
    return qs.none()


def _ordered_snapshot_tables(tables: set[str]) -> list[str]:
    """Return snapshot tables in dependency order."""

    def sort_key(model_label: str):
        entry = get_registry_entry(model_label)
        return (entry.priority if entry else 999, model_label)

    return sorted(
        tables,
        key=sort_key,
    )


def _build_downward_snapshot_changes(
    *, tables: set[str], facility, organization, limit: int, cursor: int = 0
):
    """Build a current-state snapshot for full cloud-to-hub sync pulls."""
    items = []
    now = timezone.now()
    skipped = 0

    for model_label in _ordered_snapshot_tables(tables):
        entry = get_registry_entry(model_label)
        if entry is None:
            continue
        model = _model_label_to_model(model_label)
        pk_name = model._meta.pk.name if model._meta.pk is not None else "pk"
        qs = _scope_snapshot_queryset(
            model_label,
            model.objects.all(),
            facility=facility,
            organization=organization,
        ).order_by(pk_name)

        for instance in qs:
            if skipped < cursor:
                skipped += 1
                continue

            data = serialize_instance_for_sync(instance, exclude_fields=entry.exclude_fields)
            data = add_sync_meta(data, direction=entry.direction, priority=entry.priority)
            timestamp = (
                getattr(instance, "updated_at", None)
                or getattr(instance, "created_at", None)
                or now
            )
            items.append(
                {
                    "table": model_label,
                    "operation": "CREATE",
                    "record_id": instance.pk,
                    "data": data,
                    "timestamp": timestamp,
                    "server_sequence": cursor + len(items) + 1,
                }
            )
            if len(items) > limit:
                return items[:limit], True

    return items[:limit], len(items) > limit


def _broadcast_sync_changes(facility_id: int, changes: list, client_id: str):
    """
    Broadcast accepted sync changes to all WebSocket clients in the facility group.

    This is fire-and-forget: failures are logged but never block the HTTP response.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        group_name = f"sync_{facility_id}"
        broadcast_payload = {
            "type": "sync_broadcast",
            "source_client_id": client_id,
            "changes": [
                {
                    "table": c.get("table"),
                    "operation": c.get("operation"),
                    "record_id": c.get("record_id"),
                    "data": c.get("data"),
                }
                for c in changes
            ],
            "server_timestamp": timezone.now().isoformat(),
        }

        async_to_sync(channel_layer.group_send)(group_name, broadcast_payload)
    except Exception:
        logger.exception("Failed to broadcast sync changes to facility %s", facility_id)


@api_view(["POST"])
@authentication_classes([HubLicenseOrJWTAuthentication])
@permission_classes([IsAuthenticatedOrHubLicense])
@throttle_classes([])
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

    facility = _resolve_facility_from_request(request)
    organization = _resolve_organization_from_request(request)

    accepted = 0
    rejections = []
    conflicts = []
    broadcast_changes = []

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

            if table in HUB_IDENTITY_TABLES:
                result = _apply_hub_identity_change(
                    table=table,
                    operation=operation,
                    record_id=record_id,
                    data=data,
                    installation=getattr(request, "_hub_installation", None),
                )
                if result.get("success"):
                    accepted += 1
                else:
                    rejections.append(
                        {
                            "index": idx,
                            "table": table,
                            "record_id": record_id,
                            "reason": result.get("reason", "Identity sync failed."),
                        }
                    )
                continue

            # Validate table is syncable
            if table not in SYNCABLE_TABLES and not is_upward_sync_model(table):
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
            broadcast_changes.append(change)

    # Broadcast accepted changes to other LAN clients via WebSocket
    if broadcast_changes and facility:
        _broadcast_sync_changes(
            facility_id=facility.pk,
            changes=broadcast_changes,
            client_id=client_id,
        )

    response_data = {
        "accepted": accepted,
        "rejected": len(rejections),
        "conflicts": conflicts,
        "rejections": rejections,
        "server_timestamp": timezone.now(),
    }
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(["GET"])
@authentication_classes([HubLicenseOrJWTAuthentication])
@permission_classes([IsAuthenticatedOrHubLicense])
@throttle_classes([])
def sync_pull(request):
    """
    Return changes since a given timestamp for the client's facility.

    Query parameters:
    - since: ISO timestamp (required unless full=true)
    - full: If 'true', return all records (for full re-sync)
    - tables: Comma-separated list of tables to pull (optional, defaults to all)
    - limit: Max records to return (default 500)
    """
    facility = _resolve_facility_from_request(request)
    organization = _resolve_organization_from_request(request)

    since = request.query_params.get("since")
    full = request.query_params.get("full", "").lower() == "true"
    direction = request.query_params.get("direction", "").lower()
    tables_param = request.query_params.get("tables", "")
    limit = min(int(request.query_params.get("limit", "500")), 1000)
    cursor = max(int(request.query_params.get("cursor", "0")), 0)

    if not since and not full:
        return Response(
            {"detail": "Either 'since' parameter or 'full=true' is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Filter to requested tables (or all syncable)
    allowed_tables = downward_sync_models() if direction == "down" else SYNCABLE_TABLES
    requested_tables = {table.strip() for table in tables_param.split(",") if table.strip()}
    tables = requested_tables & allowed_tables if requested_tables else allowed_tables

    if direction == "down" and full:
        changes, has_more = _build_downward_snapshot_changes(
            tables=tables,
            facility=facility,
            organization=organization,
            limit=limit,
            cursor=cursor,
        )
        return Response(
            {
                "changes": changes,
                "entries": changes,
                "server_timestamp": timezone.now(),
                "has_more": has_more,
                "next_cursor": str(cursor + len(changes)) if has_more and changes else None,
            },
            status=status.HTTP_200_OK,
        )

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
        record_id = entry.record_id if direction == "down" else str(entry.record_id)
        changes.append(
            {
                "table": entry.model_name,
                "operation": entry.operation,
                "record_id": record_id if entry.record_id else None,
                "data": entry.data,
                "timestamp": entry.synced_at or entry.created_at,
                "server_sequence": entry.pk,
            }
        )

    response_data = {
        "changes": changes,
        "entries": changes,
        "server_timestamp": timezone.now(),
        "has_more": has_more,
        "next_cursor": str(entries[-1].pk) if has_more and entries else None,
    }
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(["GET"])
@authentication_classes([HubLicenseOrJWTAuthentication])
@permission_classes([IsAuthenticatedOrHubLicense])
@throttle_classes([])
def sync_status(request):
    """Return sync health/status for the client's facility."""
    facility = _resolve_facility_from_request(request)
    organization = _resolve_organization_from_request(request)

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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sync_dashboard(request):
    """
    Sync health dashboard for admin UI.

    Returns:
    - queue_summary: counts by status (PENDING, SYNCING, SYNCED, FAILED, CONFLICT)
    - conflict_summary: counts by model_name, top unresolved conflicts
    - throughput: entries synced in last hour/day
    - stale_entries: entries stuck in PENDING > 1 hour
    """
    from datetime import timedelta

    from django.db.models import Count

    facility = _resolve_facility(request.user)
    organization = _resolve_organization(request.user)

    qs = SyncQueue.objects.all()
    if facility:
        qs = qs.filter(facility=facility)
    elif organization:
        qs = qs.filter(organization=organization)

    now = timezone.now()
    one_hour_ago = now - timedelta(hours=1)
    one_day_ago = now - timedelta(days=1)

    # Queue summary by status
    queue_summary = dict(
        qs.values("status").annotate(count=Count("id")).values_list("status", "count")
    )

    # Throughput
    synced_last_hour = qs.filter(status="SYNCED", synced_at__gte=one_hour_ago).count()
    synced_last_day = qs.filter(status="SYNCED", synced_at__gte=one_day_ago).count()

    # Stale entries (pending > 1 hour)
    stale_count = qs.filter(status="PENDING", created_at__lt=one_hour_ago).count()

    # High-retry entries (retry_count >= 5)
    high_retry = qs.filter(
        status__in=["PENDING", "FAILED"],
        retry_count__gte=5,
    ).count()

    # Conflict summary by model
    conflict_qs = SyncConflict.objects.filter(status="PENDING")
    conflict_by_model = list(
        conflict_qs.values("model_name").annotate(count=Count("id")).order_by("-count")[:10]
    )

    # Recent conflicts (last 10)
    recent_conflicts = SyncConflictDetailSerializer(
        conflict_qs.order_by("-detected_at")[:10], many=True
    ).data

    return Response(
        {
            "queue_summary": {
                "PENDING": queue_summary.get("PENDING", 0),
                "SYNCING": queue_summary.get("SYNCING", 0),
                "SYNCED": queue_summary.get("SYNCED", 0),
                "FAILED": queue_summary.get("FAILED", 0),
                "CONFLICT": queue_summary.get("CONFLICT", 0),
            },
            "throughput": {
                "synced_last_hour": synced_last_hour,
                "synced_last_day": synced_last_day,
            },
            "health": {
                "stale_entries": stale_count,
                "high_retry_entries": high_retry,
            },
            "conflicts": {
                "total_pending": conflict_qs.count(),
                "by_model": conflict_by_model,
                "recent": recent_conflicts,
            },
            "server_timestamp": now,
        }
    )
