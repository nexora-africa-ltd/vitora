"""Apply cloud sync entries to the local database."""

from __future__ import annotations

from typing import Any

from django.apps import apps
from django.db import transaction

from hmis.apps.core.sync_registry import SYNC_REGISTRY

SYNC_META_KEY = "sync_meta"


def materialize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Apply a sync entry to the database."""
    table = entry.get("table")
    operation = entry.get("operation")
    record_id = entry.get("record_id")
    data = entry.get("data") or {}

    if table not in SYNC_REGISTRY:
        return {"success": False, "error": f"Unknown table: {table}"}

    try:
        model = get_model_for_label(table)
    except LookupError:
        return {"success": False, "error": f"Model not found: {table}"}

    cleaned_data = clean_model_data(model, data)

    try:
        with transaction.atomic():
            if operation == "CREATE":
                if record_id is not None:
                    cleaned_data.pop(model._meta.pk.name, None)
                    model.objects.update_or_create(pk=record_id, defaults=cleaned_data)
                else:
                    model.objects.create(**cleaned_data)
            elif operation == "UPDATE":
                updated = model.objects.filter(pk=record_id).update(**cleaned_data)
                if updated == 0:
                    return {
                        "success": False,
                        "error": f"Record not found: {table}:{record_id}",
                    }
            elif operation == "DELETE":
                model.objects.filter(pk=record_id).delete()
            else:
                return {"success": False, "error": f"Unsupported operation: {operation}"}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}

    return {"success": True}


def get_model_for_label(model_label: str):
    """Resolve a Django model from a registry label like core.Facility."""
    app_label, model_name = model_label.split(".", 1)
    return apps.get_model(app_label, model_name)


def clean_model_data(model, data: dict[str, Any]) -> dict[str, Any]:
    """Keep only concrete model fields and map FK values to *_id fields."""
    cleaned: dict[str, Any] = {}
    for field in model._meta.concrete_fields:
        if field.primary_key:
            continue
        if field.name in data:
            key = field.attname if getattr(field, "many_to_one", False) else field.name
            cleaned[key] = data[field.name]
        elif field.attname in data:
            cleaned[field.attname] = data[field.attname]

    cleaned.pop(SYNC_META_KEY, None)
    return cleaned
