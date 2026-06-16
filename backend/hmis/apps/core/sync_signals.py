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
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.forms.models import model_to_dict
from django.utils import timezone

from hmis.apps.core.models import SyncQueue
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
    data = model_to_dict(instance, exclude=list(exclude_fields))
    # FileField / ImageField return FieldFile instances that DjangoJSONEncoder
    # cannot serialize. Convert them to their stored path string (or None when
    # no file is attached) so the sync payload stays JSON-safe.
    for key, value in list(data.items()):
        if isinstance(value, FieldFile):
            data[key] = value.name or None
    data["id"] = instance.pk
    json_safe = json.loads(json.dumps(data, cls=DjangoJSONEncoder))
    return json_safe


def get_tenant_context(instance) -> tuple[object | None, object | None]:
    """Resolve organization/facility context from common tenant-scoped fields."""
    organization = getattr(instance, "organization", None)
    facility = getattr(instance, "facility", None)
    if facility is None:
        facility = getattr(instance, "registered_at_facility", None)
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


# ---------------------------------------------------------------------------
# Cloud → Hub (downward sync): queue changes for hub pull
# ---------------------------------------------------------------------------


def _is_from_hub_push(instance) -> bool:
    """Detect if this save was triggered by materializing a hub push.

    When the cloud materializes a hub push (sync_materializer.py), it sets a
    transient attribute on the instance to prevent re-queueing the same change
    back as a downward entry (which would cause infinite sync loops).
    """
    return getattr(instance, "_from_sync_materializer", False)


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
