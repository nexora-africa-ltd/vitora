# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Apply cloud sync entries to the local database."""

from __future__ import annotations

from typing import Any

from django.apps import apps
from django.db import transaction
from django.utils.dateparse import parse_datetime

from hmis.apps.core.models import SyncConflict, SyncQueue
from hmis.apps.core.sync_registry import SYNC_REGISTRY, SyncDirection, SyncRegistryEntry

SYNC_META_KEY = "sync_meta"


def materialize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Apply a sync entry to the database."""
    table = entry.get("table")
    operation = entry.get("operation")
    record_id = entry.get("record_id")
    data = entry.get("data") or {}

    if not isinstance(operation, str):
        return {"success": False, "error": "Missing operation"}

    if table not in SYNC_REGISTRY:
        return {"success": False, "error": f"Unknown table: {table}"}

    try:
        model = get_model_for_label(table)
    except LookupError:
        return {"success": False, "error": f"Model not found: {table}"}

    registry_entry = SYNC_REGISTRY[table]
    local_change = find_pending_local_change(table, record_id)
    if local_change:
        strategy = choose_conflict_strategy(
            direction=registry_entry.direction,
            conflict_policy=registry_entry.conflict_policy,
            local_change=local_change,
            remote_entry=entry,
        )
        conflict = create_sync_conflict(
            table=table,
            record_id=record_id,
            local_change=local_change,
            remote_data=data,
        )
        if strategy == "LOCAL_WINS":
            conflict.resolve(local_change.data, strategy=strategy)
            return {"success": True, "conflict": True, "strategy": strategy}

        result = apply_entry(model, operation, record_id, data, registry_entry=registry_entry)
        if result.get("success"):
            conflict.resolve(data, strategy=strategy)
            return {"success": True, "conflict": True, "strategy": strategy}
        return result

    return apply_entry(model, operation, record_id, data, registry_entry=registry_entry)


def apply_entry(
    model,
    operation: str,
    record_id: Any,
    data: dict[str, Any],
    *,
    registry_entry: SyncRegistryEntry | None = None,
) -> dict[str, Any]:
    """Apply a non-conflicting entry to the database."""
    exclude = registry_entry.exclude_fields if registry_entry else ()
    cleaned_data = clean_model_data(model, data, exclude_fields=exclude)
    cleaned_data = suppress_duplicate_user_email(model, record_id, cleaned_data)

    try:
        with transaction.atomic():
            if operation == "CREATE":
                # Origin-based dedup: if record carries origin_hub_id + origin_local_id,
                # check if we already have it (prevents PK collision on re-sync).
                origin_hub = cleaned_data.get("origin_hub_id")
                origin_local = cleaned_data.get("origin_local_id")
                has_origin_fields = hasattr(model, "origin_hub_id")

                if has_origin_fields and origin_hub and origin_local:
                    # Dedup by origin pair
                    existing = model.objects.filter(
                        origin_hub_id=origin_hub, origin_local_id=origin_local
                    ).first()
                    if existing:
                        # Already exists — update instead of create
                        cleaned_data.pop(model._meta.pk.name, None)
                        model.objects.filter(pk=existing.pk).update(**cleaned_data)
                    else:
                        cleaned_data.pop(model._meta.pk.name, None)
                        create_from_materializer(model, **cleaned_data)
                elif record_id is not None:
                    cleaned_data.pop(model._meta.pk.name, None)
                    update_or_create_from_materializer(model, record_id, cleaned_data)
                else:
                    create_from_materializer(model, **cleaned_data)
            elif operation == "UPDATE":
                instance = update_existing_from_materializer(model, record_id, cleaned_data)
                if instance is None:
                    cleaned_data.pop(model._meta.pk.name, None)
                    update_or_create_from_materializer(model, record_id, cleaned_data)
            elif operation == "DELETE":
                model.objects.filter(pk=record_id).delete()
            else:
                return {"success": False, "error": f"Unsupported operation: {operation}"}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}

    return {"success": True}


def create_from_materializer(model, **cleaned_data):
    """Create an instance without letting sync signals re-queue the pull."""
    instance = model(**cleaned_data)
    instance._from_sync_materializer = True
    instance.save()
    return instance


def update_or_create_from_materializer(model, record_id: Any, cleaned_data: dict[str, Any]):
    """Update/create by PK while marking the save as materializer-originated."""
    pk_name = model._meta.pk.name
    instance = resolve_materialization_target(model, record_id, cleaned_data)
    if instance is not None:
        for field_name, value in cleaned_data.items():
            setattr(instance, field_name, value)
        instance._from_sync_materializer = True
        update_fields = list(cleaned_data.keys())
        if update_fields:
            instance.save(update_fields=update_fields)
        else:
            instance.save()
        return instance, False

    instance = model(**{pk_name: record_id, **cleaned_data})
    instance._from_sync_materializer = True
    instance.save()
    return instance, True


def update_existing_from_materializer(model, record_id: Any, cleaned_data: dict[str, Any]):
    """Update an existing row, preferring natural-key matches over colliding PKs."""
    instance = resolve_materialization_target(model, record_id, cleaned_data)
    if instance is None:
        return None

    for field_name, value in cleaned_data.items():
        setattr(instance, field_name, value)
    instance._from_sync_materializer = True
    update_fields = list(cleaned_data.keys())
    if update_fields:
        instance.save(update_fields=update_fields)
    else:
        instance.save()
    return instance


def resolve_materialization_target(model, record_id: Any, cleaned_data: dict[str, Any]):
    """Resolve the local row to update without violating natural unique keys."""
    natural_match = find_existing_for_materialized_create(model, cleaned_data)
    pk_match = model.objects.filter(pk=record_id).first() if record_id is not None else None

    if natural_match is not None:
        return natural_match
    return pk_match


def find_existing_for_materialized_create(model, cleaned_data: dict[str, Any]):
    """Find an existing local row by a stable natural key before creating by cloud PK."""
    if model._meta.label == "auth.User":
        username = cleaned_data.get("username")
        if username:
            existing = model.objects.filter(username=username).first()
            if existing:
                return existing
        email = cleaned_data.get("email")
        if email:
            existing = model.objects.filter(email__iexact=email).first()
            if existing:
                return existing

    if model._meta.label == "core.StaffProfile":
        user_id = cleaned_data.get("user_id")
        if user_id:
            existing = model.objects.filter(user_id=user_id).first()
            if existing:
                return existing
        employee_id = cleaned_data.get("employee_id")
        if employee_id:
            existing = model.objects.filter(employee_id=employee_id).first()
            if existing:
                return existing

    if model._meta.label == "patients.Patient":
        mrn = cleaned_data.get("mrn")
        if mrn:
            existing = model.objects.filter(mrn=mrn).first()
            if existing:
                return existing
        cr_number = cleaned_data.get("cr_number")
        if cr_number:
            existing = model.objects.filter(cr_number=cr_number).first()
            if existing:
                return existing

    return None


def find_pending_local_change(model_label: str, record_id: Any) -> SyncQueue | None:
    """Find the newest local unsynced change for a model/record pair."""
    return (
        SyncQueue.objects.filter(
            model_name=model_label,
            record_id=record_id,
            status__in=["PENDING", "SYNCING"],
        )
        .order_by("-created_at")
        .first()
    )


def choose_conflict_strategy(
    *,
    direction: SyncDirection,
    conflict_policy: str | None,
    local_change: SyncQueue,
    remote_entry: dict[str, Any],
) -> str:
    """Choose a conflict strategy from sync direction and timestamps."""
    if conflict_policy in {"LOCAL_WINS", "REMOTE_WINS"}:
        return conflict_policy

    if direction == SyncDirection.DOWN:
        return "REMOTE_WINS"
    if direction == SyncDirection.UP:
        return "LOCAL_WINS"

    remote_timestamp = parse_datetime(str(remote_entry.get("timestamp") or ""))
    if remote_timestamp and remote_timestamp >= local_change.created_at:
        return "REMOTE_WINS"
    return "LOCAL_WINS"


def create_sync_conflict(
    *, table: str, record_id: Any, local_change: SyncQueue, remote_data: dict[str, Any]
) -> SyncConflict:
    """Create a SyncConflict row for audit/resolution tracking."""
    return SyncConflict.objects.create(
        model_name=table,
        record_id=record_id,
        local_data=local_change.data,
        remote_data=remote_data,
        resolution_strategy="LAST_WRITE_WINS",
        status="PENDING",
    )


def get_model_for_label(model_label: str):
    """Resolve a Django model from a registry label like core.Facility."""
    app_label, model_name = model_label.split(".", 1)
    return apps.get_model(app_label, model_name)


def clean_model_data(
    model, data: dict[str, Any], *, exclude_fields: tuple[str, ...] = ()
) -> dict[str, Any]:
    """Keep only concrete model fields and map FK values to *_id fields."""
    cleaned: dict[str, Any] = {}
    for field in model._meta.concrete_fields:
        if field.primary_key:
            continue
        if field.name in exclude_fields or field.attname in exclude_fields:
            continue
        if field.name in data:
            key = (
                field.attname
                if getattr(field, "many_to_one", False) or getattr(field, "one_to_one", False)
                else field.name
            )
            cleaned[key] = data[field.name]
        elif field.attname in data:
            cleaned[field.attname] = data[field.attname]

    cleaned.pop(SYNC_META_KEY, None)
    return cleaned


def suppress_duplicate_user_email(
    model, record_id: Any, cleaned_data: dict[str, Any]
) -> dict[str, Any]:
    """Drop auth.User email updates that would collide with another local row."""
    if model._meta.label != "auth.User" or not cleaned_data.get("email"):
        return cleaned_data

    duplicate_qs = model.objects.filter(email__iexact=cleaned_data["email"])
    if record_id is not None:
        duplicate_qs = duplicate_qs.exclude(pk=record_id)
    if not duplicate_qs.exists():
        return cleaned_data

    cleaned = cleaned_data.copy()
    cleaned.pop("email", None)
    return cleaned
