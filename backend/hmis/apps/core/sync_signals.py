# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Signals that queue model changes for hub↔cloud sync.

Two independent signal paths:
1. Hub → Cloud (upward): fires when ENVIRONMENT=hub, creates PENDING entries
   that the HubCloudSyncWorker pushes to the cloud REST API.
2. Cloud → Hub (downward): fires when ENVIRONMENT is a cloud env (production/staging),
   creates pre-SYNCED entries so hubs can pull them via GET /api/sync/pull/.
"""

from __future__ import annotations

import json

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models.fields.files import FieldFile
from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver
from django.forms.models import model_to_dict
from django.utils import timezone

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.sync_context import is_sync_materialization_active
from hmis.apps.core.sync_registry import (
    SyncDirection,
    get_registry_entry,
    is_downward_sync_model,
    is_upward_sync_model,
)


def get_model_label(instance) -> str:
    """Return the registry label for a model instance."""
    return f"{instance._meta.app_label}.{instance.__class__.__name__}"


def should_queue_upward_sync(model_label: str) -> bool:
    """Return whether upward sync auto-queueing is enabled for a model."""
    if not getattr(settings, "SYNC_ENABLED", False):
        return False
    if getattr(settings, "ENVIRONMENT", "") != "hub":
        return False
    return is_upward_sync_model(model_label)


# Cloud environments where downward sync queueing should fire.
_CLOUD_ENVIRONMENTS = {"production", "staging"}


def should_queue_downward_sync(model_label: str) -> bool:
    """Return whether a cloud-side change should be queued for hub pull.

    Fires on production/staging when a BOTH or DOWN model is modified directly
    on the cloud (web-app, admin, Celery tasks, etc.), so hubs can pull it.
    """
    if not getattr(settings, "SYNC_ENABLED", False):
        return False
    if getattr(settings, "ENVIRONMENT", "") not in _CLOUD_ENVIRONMENTS:
        return False
    return is_downward_sync_model(model_label)


def serialize_instance_for_sync(instance, *, exclude_fields: tuple[str, ...]) -> dict:
    """Serialize a model instance into JSON-safe sync data."""
    model_label = get_model_label(instance)
    if model_label == "auth.User":
        return {
            "id": instance.pk,
            "username": instance.username,
            "email": instance.email or "",
            "first_name": instance.first_name or "",
            "last_name": instance.last_name or "",
            "password": instance.password,
            "is_active": instance.is_active,
        }

    if model_label == "core.StaffProfile":
        # `username` is denormalized here so the cloud can resolve the linked
        # user even if the hub's local PK collides with an existing cloud
        # user's PK (see `_upsert_hub_user` soft-link logic).
        user = getattr(instance, "user", None)
        username = getattr(user, "username", "") if user is not None else ""
        return {
            "id": instance.pk,
            "user_id": instance.user_id,
            "username": username,
            "employee_id": instance.employee_id or "",
            "title": instance.title or "",
            "middle_name": instance.middle_name or "",
            "primary_role_id": instance.primary_role_id,
            "primary_department_id": instance.primary_department_id,
            "organization_id": instance.organization_id,
            "primary_facility_id": instance.primary_facility_id,
            "hwr_id": instance.hwr_id or "",
            "license_number": instance.license_number or "",
            "license_expiry": instance.license_expiry,
            "license_verified": instance.license_verified,
            "licensing_body": instance.licensing_body or "",
            "specialization": instance.specialization or "",
            "employment_status": instance.employment_status,
            "employment_type": instance.employment_type,
            "date_joined": instance.date_joined,
            "date_left": instance.date_left,
        }

    if model_label == "core.Role":
        return {
            "id": instance.pk,
            "code": instance.code or "",
            "name": instance.name or "",
            "category": instance.category or "",
            "description": instance.description or "",
            "scope": instance.scope or "ORG",
            "organization_id": instance.organization_id,
            "facility_id": instance.facility_id,
            "permissions_matrix": instance.permissions_matrix or {},
            "hierarchy_level": instance.hierarchy_level,
            "parent_role_id": instance.parent_role_id,
            "is_active": getattr(instance, "is_active", True),
        }

    if model_label == "core.Department":
        return {
            "id": instance.pk,
            "code": instance.code or "",
            "name": instance.name or "",
            "description": instance.description or "",
            "department_type": instance.department_type or "",
            "organization_id": instance.organization_id,
            "facility_id": instance.facility_id,
            "parent_id": instance.parent_id,
            "head_id": instance.head_id,
            "is_active": instance.is_active,
        }

    if model_label == "core.OrgMembership":
        return {
            "id": instance.pk,
            "staff_profile_id": instance.staff_profile_id,
            "organization_id": instance.organization_id,
            "role_id": instance.role_id,
            "department_id": instance.department_id,
            # M2M: list of facility PKs the member can access in this org.
            "facility_ids": list(instance.facilities.values_list("pk", flat=True))
            if instance.pk
            else [],
            "is_primary": instance.is_primary,
            "status": instance.status,
            "joined_at": instance.joined_at,
            "invited_by_id": instance.invited_by_id,
        }

    data = model_to_dict(instance, exclude=list(exclude_fields))
    # ``model_to_dict`` returns FieldFile instances for File/Image fields and
    # lists of related model instances for ManyToMany fields. Neither is JSON
    # serializable by DjangoJSONEncoder, so coerce them to safe primitives
    # (stored path / list of PKs) before dumping.
    for key, value in list(data.items()):
        if isinstance(value, FieldFile):
            data[key] = value.name or None
        elif isinstance(value, list) and value and hasattr(value[0], "pk"):
            data[key] = [item.pk for item in value]
    data["id"] = instance.pk
    json_safe = json.loads(json.dumps(data, cls=DjangoJSONEncoder))
    return json_safe


def get_tenant_context(instance) -> tuple[object | None, object | None]:
    """Resolve organization/facility context from common tenant-scoped fields."""
    organization = getattr(instance, "organization", None)
    facility = getattr(instance, "facility", None)
    if facility is None:
        facility = getattr(instance, "registered_at_facility", None)
    # ``auth.User`` carries no direct tenant FKs — its assignment lives on
    # ``core.StaffProfile``. Without this hop, every User SyncQueue row gets
    # written with organization=NULL/facility=NULL, which makes hub→cloud
    # debugging harder and breaks any future tenant-scoped filtering of the
    # outbound queue.
    if organization is None and facility is None:
        staff_profile = getattr(instance, "staff_profile", None)
        if staff_profile is not None:
            organization = getattr(staff_profile, "organization", None)
            facility = getattr(staff_profile, "primary_facility", None)
    for related_name in (
        "clinic",
        "session",
        "resource",
        "room",
        "staff_resource",
        "schedule",
        "encounter",
        "prescription",
        "invoice",
        "lab_order",
        "order",
        "order_item",
        "lab_result",
        "imaging_order",
        "admission",
    ):
        related = getattr(instance, related_name, None)
        if related is not None:
            related_organization, related_facility = get_tenant_context(related)
            if organization is None:
                organization = related_organization
            if facility is None:
                facility = related_facility
            if organization is not None and facility is not None:
                break
    if organization is None and facility is not None:
        organization = getattr(facility, "organization", None)
    patient = getattr(instance, "patient", None)
    if organization is None and patient is not None:
        organization = getattr(patient, "organization", None)
    if facility is None and patient is not None:
        facility = getattr(patient, "registered_at_facility", None)
    return organization, facility


def add_sync_meta(data: dict, *, direction: SyncDirection, priority: int) -> dict:
    """Attach sync metadata to the queued payload."""
    data["sync_meta"] = {
        "priority": priority,
        "direction": direction.value,
    }
    return data


@receiver(post_save, dispatch_uid="hub_auto_queue_for_sync")
def auto_queue_for_sync(sender, instance, created, raw=False, **kwargs):  # noqa: ARG001
    """Automatically queue registered model saves for hub-to-cloud sync."""
    if raw:
        return

    if _is_from_sync_materializer(instance):
        return

    model_label = get_model_label(instance)
    if not should_queue_upward_sync(model_label):
        return

    entry = get_registry_entry(model_label)
    if entry is None:
        return

    data = serialize_instance_for_sync(instance, exclude_fields=entry.exclude_fields)
    data = add_sync_meta(data, direction=entry.direction, priority=entry.priority)
    organization, facility = get_tenant_context(instance)

    SyncQueue.objects.create(
        operation="CREATE" if created else "UPDATE",
        organization=organization,
        facility=facility,
        model_name=model_label,
        record_id=instance.pk,
        data=data,
        status="PENDING",
    )


@receiver(post_delete, dispatch_uid="hub_auto_queue_delete_for_sync")
def auto_queue_delete_for_sync(sender, instance, **kwargs):  # noqa: ARG001
    """Automatically queue registered model deletes for hub-to-cloud sync."""
    if _is_from_sync_materializer(instance):
        return

    model_label = get_model_label(instance)
    if not should_queue_upward_sync(model_label):
        return

    entry = get_registry_entry(model_label)
    if entry is None:
        return

    organization, facility = get_tenant_context(instance)
    SyncQueue.objects.create(
        operation="DELETE",
        organization=organization,
        facility=facility,
        model_name=model_label,
        record_id=instance.pk,
        data=add_sync_meta({"id": instance.pk}, direction=entry.direction, priority=entry.priority),
        status="PENDING",
    )


@receiver(m2m_changed, dispatch_uid="hub_requeue_org_membership_on_facility_m2m")
def requeue_org_membership_on_facility_m2m(sender, instance, action, **kwargs):  # noqa: ARG001
    """Re-queue OrgMembership for upward sync when its facilities M2M changes.

    ``post_save`` only fires when the OrgMembership row itself is written.
    Code paths like ``membership.facilities.add(facility)`` mutate the join
    table only and would otherwise leave a stale (empty) ``facility_ids``
    payload in the SyncQueue. We listen for ``m2m_changed`` and synthesize a
    fresh UPDATE entry so the cloud receives the current facility set.
    """
    # Only react once both sides exist, only for OrgMembership.facilities,
    # and only for the actions that change the membership set.
    if action not in {"post_add", "post_remove", "post_clear"}:
        return
    if instance is None or getattr(instance, "pk", None) is None:
        return
    # Lazy import to avoid app-loading cycles.
    from hmis.apps.core.models import OrgMembership

    if not isinstance(instance, OrgMembership):
        return
    if _is_from_sync_materializer(instance):
        return

    model_label = "core.OrgMembership"
    if not should_queue_upward_sync(model_label):
        return
    entry = get_registry_entry(model_label)
    if entry is None:
        return

    data = serialize_instance_for_sync(instance, exclude_fields=entry.exclude_fields)
    data = add_sync_meta(data, direction=entry.direction, priority=entry.priority)
    organization, facility = get_tenant_context(instance)
    SyncQueue.objects.create(
        operation="UPDATE",
        organization=organization,
        facility=facility,
        model_name=model_label,
        record_id=instance.pk,
        data=data,
        status="PENDING",
    )


# ---------------------------------------------------------------------------
# Cloud → Hub (downward sync): queue changes for hub pull
# ---------------------------------------------------------------------------


def _is_from_sync_materializer(instance) -> bool:
    """Detect if this signal was triggered by sync materialization.

    Materialized writes already came from the opposite side of the sync link.
    Re-queueing them would turn pulled cloud changes into hub PENDING entries,
    or pushed hub changes into cloud pull entries.
    """
    return is_sync_materialization_active() or getattr(instance, "_from_sync_materializer", False)


def _is_from_hub_push(instance) -> bool:
    """Backward-compatible alias for materializer-originated writes."""
    return _is_from_sync_materializer(instance)


@receiver(post_save, dispatch_uid="cloud_auto_queue_downward_sync")
def auto_queue_downward_sync(sender, instance, created, raw=False, **kwargs):  # noqa: ARG001
    """Queue BOTH/DOWN model saves on cloud so hubs can pull them.

    Creates entries with status=SYNCED + synced_at=now() so they are
    immediately visible to GET /api/sync/pull/?direction=down.
    """
    if raw:
        return

    model_label = get_model_label(instance)
    if not should_queue_downward_sync(model_label):
        return

    # Don't re-queue changes that came from a hub push (prevents loops)
    if _is_from_hub_push(instance):
        return

    entry = get_registry_entry(model_label)
    if entry is None:
        return

    data = serialize_instance_for_sync(instance, exclude_fields=entry.exclude_fields)
    data = add_sync_meta(data, direction=entry.direction, priority=entry.priority)
    organization, facility = get_tenant_context(instance)

    SyncQueue.objects.create(
        operation="CREATE" if created else "UPDATE",
        organization=organization,
        facility=facility,
        model_name=model_label,
        record_id=instance.pk,
        data=data,
        status="SYNCED",
        synced_at=timezone.now(),
    )


@receiver(post_delete, dispatch_uid="cloud_auto_queue_downward_delete")
def auto_queue_downward_delete(sender, instance, **kwargs):  # noqa: ARG001
    """Queue BOTH/DOWN model deletes on cloud so hubs can pull them."""
    model_label = get_model_label(instance)
    if not should_queue_downward_sync(model_label):
        return

    if _is_from_hub_push(instance):
        return

    entry = get_registry_entry(model_label)
    if entry is None:
        return

    organization, facility = get_tenant_context(instance)
    SyncQueue.objects.create(
        operation="DELETE",
        organization=organization,
        facility=facility,
        model_name=model_label,
        record_id=instance.pk,
        data=add_sync_meta({"id": instance.pk}, direction=entry.direction, priority=entry.priority),
        status="SYNCED",
        synced_at=timezone.now(),
    )
