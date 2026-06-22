# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Apply cloud sync entries to the local database."""

from __future__ import annotations

from typing import Any

from django.apps import apps
from django.db import transaction
from django.utils.dateparse import parse_datetime

from hmis.apps.core.models import SyncConflict, SyncQueue
from hmis.apps.core.sync_context import sync_materialization_context
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
    cleaned_data = remap_materialized_foreign_keys(model, cleaned_data, data)
    cleaned_data = suppress_duplicate_user_email(model, record_id, cleaned_data)

    try:
        with transaction.atomic(), sync_materialization_context():
            instance = None
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
                        instance = existing
                    else:
                        cleaned_data.pop(model._meta.pk.name, None)
                        instance = create_from_materializer(model, **cleaned_data)
                elif record_id is not None:
                    cleaned_data.pop(model._meta.pk.name, None)
                    instance, _created = update_or_create_from_materializer(
                        model, record_id, cleaned_data
                    )
                else:
                    instance = create_from_materializer(model, **cleaned_data)
            elif operation == "UPDATE":
                instance = update_existing_from_materializer(model, record_id, cleaned_data)
                if instance is None:
                    cleaned_data.pop(model._meta.pk.name, None)
                    instance, _created = update_or_create_from_materializer(
                        model, record_id, cleaned_data
                    )
            elif operation == "DELETE":
                model.objects.filter(pk=record_id).delete()
            else:
                return {"success": False, "error": f"Unsupported operation: {operation}"}
            if instance is not None:
                apply_materialized_m2m(model, instance, data)
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
    if model._meta.label == "core.Organization":
        slug = cleaned_data.get("slug")
        if slug:
            existing = model.objects.filter(slug=slug).first()
            if existing:
                return existing
        name = cleaned_data.get("name")
        if name:
            existing = model.objects.filter(name=name).first()
            if existing:
                return existing

    if model._meta.label == "core.Facility":
        mfl_code = cleaned_data.get("mfl_code")
        if mfl_code:
            existing = model.objects.filter(mfl_code=mfl_code).first()
            if existing:
                return existing

    if model._meta.label == "core.Role":
        code = cleaned_data.get("code")
        if code:
            existing = model.objects.filter(code=code).first()
            if existing:
                return existing

    if model._meta.label == "core.Department":
        code = cleaned_data.get("code")
        facility_id = cleaned_data.get("facility_id")
        if code and facility_id:
            existing = model.objects.filter(code=code, facility_id=facility_id).first()
            if existing:
                return existing

    if model._meta.label == "scheduling.Resource":
        code = cleaned_data.get("code")
        facility_id = cleaned_data.get("facility_id")
        if code and facility_id:
            existing = model.objects.filter(code=code, facility_id=facility_id).first()
            if existing:
                return existing

    if model._meta.label == "clinics.Clinic":
        code = cleaned_data.get("code")
        if code:
            existing = model.objects.filter(code=code).first()
            if existing:
                return existing

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


def remap_materialized_foreign_keys(
    model, cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Resolve cloud FK IDs to local rows using denormalized natural keys when present."""
    if model._meta.label == "core.StaffProfile":
        return remap_staff_profile_foreign_keys(cleaned_data, raw_data)
    if model._meta.label == "core.Role":
        return remap_role_foreign_keys(cleaned_data, raw_data)
    if model._meta.label == "core.Department":
        return remap_department_foreign_keys(cleaned_data, raw_data)
    if model._meta.label == "core.OrgMembership":
        return remap_org_membership_foreign_keys(cleaned_data, raw_data)
    if model._meta.label == "scheduling.Resource":
        return remap_resource_foreign_keys(cleaned_data, raw_data)
    if model._meta.label == "clinics.Clinic":
        return remap_clinic_foreign_keys(cleaned_data, raw_data)
    return remap_common_tenant_foreign_keys(cleaned_data, raw_data)


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
