# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core sync materializer helpers for Vitora HMIS.

What this file is for:
- Implement sync materializer helpers logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from __future__ import annotations

from typing import Any

from django.apps import apps
from django.db import transaction
from django.utils.dateparse import parse_date, parse_datetime, parse_time

from hmis.apps.core.models import AuditLog, SyncConflict, SyncQueue
from hmis.apps.core.sync_context import sync_materialization_context
from hmis.apps.core.sync_registry import SYNC_REGISTRY, SyncDirection, SyncRegistryEntry

SYNC_META_KEY = "sync_meta"


def parse_date_value(value: Any):
    """Parse a date/datetime/string value to a date object when possible."""
    if value is None:
        return None
    if hasattr(value, "date"):
        return value.date()
    if hasattr(value, "isoformat"):
        value = value.isoformat()
    if not isinstance(value, str):
        return None
    return parse_date(value[:10])


def parse_time_value(value: Any):
    """Parse a time/datetime/string value to a time object when possible."""
    if value is None:
        return None
    if hasattr(value, "time"):
        return value.time()
    if hasattr(value, "isoformat"):
        value = value.isoformat()
    if not isinstance(value, str):
        return None
    return parse_time(value[:8])


def remap_staff_profile_foreign_keys(
    cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Remap StaffProfile FK IDs from cloud PKs to local natural-key matches."""
    cleaned = cleaned_data.copy()

    username = str(raw_data.get("username") or "").strip()
    if username:
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.filter(username=username).first()
        if user:
            cleaned["user_id"] = user.pk

    organization_slug = str(raw_data.get("organization_slug") or "").strip()
    if organization_slug:
        from hmis.apps.core.models import Organization

        organization = Organization.objects.filter(slug=organization_slug).first()
        if organization:
            cleaned["organization_id"] = organization.pk

    facility_mfl_code = str(raw_data.get("primary_facility_mfl_code") or "").strip()
    if facility_mfl_code:
        from hmis.apps.core.models import Facility

        facility = Facility.objects.filter(mfl_code=facility_mfl_code).first()
        if facility:
            cleaned["primary_facility_id"] = facility.pk
            organization_id = getattr(facility, "organization_id", None)
            if organization_id:
                cleaned["organization_id"] = organization_id
    else:
        # Cloud profile has no facility — preserve local hub assignment
        # to prevent full-pull from wiping a manually assigned facility.
        cleaned.pop("primary_facility_id", None)

    role_code = str(raw_data.get("primary_role_code") or "").strip()
    if role_code:
        from hmis.apps.core.models import Role

        role = Role.objects.filter(code=role_code).first()
        if role:
            cleaned["primary_role_id"] = role.pk

    department_code = str(raw_data.get("primary_department_code") or "").strip()
    facility_id = cleaned.get("primary_facility_id")
    if department_code and facility_id:
        from hmis.apps.core.models import Department

        department = Department.objects.filter(
            code=department_code, facility_id=facility_id
        ).first()
        if department:
            cleaned["primary_department_id"] = department.pk

    return cleaned


def remap_role_foreign_keys(
    cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Remap Role tenant and parent FKs by natural-key hints."""
    cleaned = remap_common_tenant_foreign_keys(cleaned_data, raw_data)

    parent_role_code = str(raw_data.get("parent_role_code") or "").strip()
    if parent_role_code and "parent_role_id" in cleaned:
        from hmis.apps.core.models import Role

        parent_role = Role.objects.filter(code=parent_role_code).first()
        if parent_role:
            cleaned["parent_role_id"] = parent_role.pk

    return cleaned


def remap_department_foreign_keys(
    cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Remap Department tenant, parent, and head FKs by natural-key hints."""
    cleaned = remap_common_tenant_foreign_keys(cleaned_data, raw_data)

    parent_code = str(raw_data.get("parent_code") or "").strip()
    facility_id = cleaned.get("facility_id")
    if parent_code and facility_id and "parent_id" in cleaned:
        from hmis.apps.core.models import Department

        parent = Department.objects.filter(code=parent_code, facility_id=facility_id).first()
        if parent:
            cleaned["parent_id"] = parent.pk

    head_username = str(raw_data.get("head_username") or "").strip()
    if head_username and "head_id" in cleaned:
        from hmis.apps.core.models import StaffProfile

        head = StaffProfile.objects.filter(user__username=head_username).first()
        if head:
            cleaned["head_id"] = head.pk

    return cleaned


def remap_org_membership_foreign_keys(
    cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Remap OrgMembership FK IDs from cloud PKs to local natural-key matches."""
    cleaned = remap_common_tenant_foreign_keys(cleaned_data, raw_data)

    staff_username = str(raw_data.get("staff_username") or "").strip()
    staff_employee_id = str(raw_data.get("staff_profile_employee_id") or "").strip()
    if staff_username or staff_employee_id:
        from hmis.apps.core.models import StaffProfile

        staff_profile = None
        if staff_username:
            staff_profile = StaffProfile.objects.filter(user__username=staff_username).first()
        if staff_profile is None and staff_employee_id:
            staff_profile = StaffProfile.objects.filter(employee_id=staff_employee_id).first()
        if staff_profile:
            cleaned["staff_profile_id"] = staff_profile.pk

    role_code = str(raw_data.get("role_code") or "").strip()
    if role_code:
        from hmis.apps.core.models import Role

        role = Role.objects.filter(code=role_code).first()
        if role:
            cleaned["role_id"] = role.pk

    department_code = str(raw_data.get("department_code") or "").strip()
    facility_ids = resolve_facility_ids_from_sync_data(raw_data)
    if department_code and facility_ids:
        from hmis.apps.core.models import Department

        department = Department.objects.filter(
            code=department_code, facility_id__in=facility_ids
        ).first()
        if department:
            cleaned["department_id"] = department.pk

    return cleaned


def remap_resource_foreign_keys(
    cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Remap Resource tenant, department, and staff FKs by natural-key hints."""
    cleaned = remap_common_tenant_foreign_keys(cleaned_data, raw_data)

    staff_username = str(raw_data.get("staff_username") or "").strip()
    if staff_username and "staff_profile_id" in cleaned:
        from hmis.apps.core.models import StaffProfile

        staff_profile = StaffProfile.objects.filter(user__username=staff_username).first()
        if staff_profile:
            cleaned["staff_profile_id"] = staff_profile.pk

    department_code = str(raw_data.get("department_code") or "").strip()
    facility_id = cleaned.get("facility_id")
    if department_code and facility_id and "department_id" in cleaned:
        from hmis.apps.core.models import Department

        department = Department.objects.filter(
            code=department_code, facility_id=facility_id
        ).first()
        if department:
            cleaned["department_id"] = department.pk

    return cleaned


def remap_clinic_foreign_keys(
    cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Remap Clinic tenant and scheduling-resource FKs by natural-key hints."""
    cleaned = remap_common_tenant_foreign_keys(cleaned_data, raw_data)

    department_code = str(raw_data.get("department_code") or "").strip()
    facility_id = cleaned.get("facility_id")
    if department_code and facility_id and "department_id" in cleaned:
        from hmis.apps.core.models import Department

        department = Department.objects.filter(
            code=department_code, facility_id=facility_id
        ).first()
        if department:
            cleaned["department_id"] = department.pk

    scheduling_resource_code = str(raw_data.get("scheduling_resource_code") or "").strip()
    if scheduling_resource_code and facility_id and "scheduling_resource_id" in cleaned:
        from hmis.apps.scheduling.models import Resource

        resource = Resource.objects.filter(
            code=scheduling_resource_code, facility_id=facility_id
        ).first()
        if resource:
            cleaned["scheduling_resource_id"] = resource.pk

    return cleaned


def remap_common_tenant_foreign_keys(
    cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Remap common tenant FKs for models that carry natural-key hints."""
    cleaned = cleaned_data.copy()

    organization_slug = str(raw_data.get("organization_slug") or "").strip()
    if organization_slug and "organization_id" in cleaned:
        from hmis.apps.core.models import Organization

        organization = Organization.objects.filter(slug=organization_slug).first()
        if organization:
            cleaned["organization_id"] = organization.pk

    facility_mfl_code = str(raw_data.get("facility_mfl_code") or "").strip()
    if facility_mfl_code and "facility_id" in cleaned:
        from hmis.apps.core.models import Facility

        facility = Facility.objects.filter(mfl_code=facility_mfl_code).first()
        if facility:
            cleaned["facility_id"] = facility.pk

    return cleaned


def resolve_facility_ids_from_sync_data(raw_data: dict[str, Any]) -> list[int]:
    """Return local facility IDs from MFL-code hints, falling back to raw IDs."""
    facility_mfl_codes = raw_data.get("facility_mfl_codes") or []
    if facility_mfl_codes:
        from hmis.apps.core.models import Facility

        return list(
            Facility.objects.filter(mfl_code__in=facility_mfl_codes).values_list("pk", flat=True)
        )

    facility_ids = raw_data.get("facility_ids") or []
    return [int(facility_id) for facility_id in facility_ids if str(facility_id).isdigit()]


def apply_materialized_m2m(model, instance, raw_data: dict[str, Any]) -> None:
    """Apply supported M2M fields after materializing a concrete model row."""
    if model._meta.label != "core.OrgMembership":
        return

    facility_ids = resolve_facility_ids_from_sync_data(raw_data)
    if facility_ids:
        instance.facilities.set(facility_ids)


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
    """Keep only concrete model fields and map FK values to *_id fields.

    Field values are coerced through ``field.to_python()`` so date/time/datetime
    columns arrive as native Python objects on the hub. Without this, signals
    that call ``shift_date.strftime()`` or ``datetime.combine(shift_date, ...)``
    crash because JSON deserialization leaves them as plain strings.
    """
    import contextlib

    from django.core.exceptions import ValidationError

    cleaned: dict[str, Any] = {}
    for field in model._meta.concrete_fields:
        if field.primary_key:
            continue
        if field.name in exclude_fields or field.attname in exclude_fields:
            continue

        is_relation = getattr(field, "many_to_one", False) or getattr(field, "one_to_one", False)

        if field.name in data:
            key = field.attname if is_relation else field.name
            value = data[field.name]
        elif field.attname in data:
            key = field.attname
            value = data[field.attname]
        else:
            continue

        if value is not None and not is_relation:
            # Leave value as-is on failure; downstream validation will surface
            # a clearer error if the field truly can't accept it.
            with contextlib.suppress(ValidationError, TypeError, ValueError):
                value = field.to_python(value)

        cleaned[key] = value

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
