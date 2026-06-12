"""Signals that queue hub-local changes for cloud sync."""

from __future__ import annotations

import json

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.forms.models import model_to_dict

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.sync_registry import SyncDirection, get_registry_entry, is_upward_sync_model


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


def serialize_instance_for_sync(instance, *, exclude_fields: tuple[str, ...]) -> dict:
    """Serialize a model instance into JSON-safe sync data."""
    data = model_to_dict(instance, exclude=list(exclude_fields))
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
