# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core sync materializer core for Vitora HMIS.

What this file is for:
- Implement sync materializer core logic for the core domain.

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


from hmis.apps.core.sync_materializer_helpers import (
    apply_materialized_m2m,
    choose_conflict_strategy,
    clean_model_data,
    create_sync_conflict,
    find_pending_local_change,
    get_model_for_label,
    suppress_duplicate_user_email,
)
from hmis.apps.core.sync_materializer_resolvers import remap_materialized_foreign_keys


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
            created_instance = False
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
                        created_instance = True
                elif record_id is not None:
                    cleaned_data.pop(model._meta.pk.name, None)
                    instance, _created = update_or_create_from_materializer(
                        model, record_id, cleaned_data
                    )
                    created_instance = _created
                else:
                    instance = create_from_materializer(model, **cleaned_data)
                    created_instance = True
            elif operation == "UPDATE":
                instance = update_existing_from_materializer(model, record_id, cleaned_data)
                if instance is None:
                    cleaned_data.pop(model._meta.pk.name, None)
                    instance, _created = update_or_create_from_materializer(
                        model, record_id, cleaned_data
                    )
                    created_instance = _created
            elif operation == "DELETE":
                model.objects.filter(pk=record_id).delete()
            else:
                return {"success": False, "error": f"Unsupported operation: {operation}"}
            if instance is not None:
                apply_materialized_m2m(model, instance, data)
                if created_instance and model._meta.label == "patients.Patient":
                    _log_patient_create_from_sync_materializer(instance)
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ) as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}

    return {"success": True}


def _log_patient_create_from_sync_materializer(instance) -> None:
    """Record patient creation audits for cloud-to-hub sync materialization."""
    creator = getattr(instance, "registered_by", None)
    AuditLog.log(
        action="patient_create",
        user=creator,
        resource_type="Patient",
        resource_id=instance.id,
        patient_id=instance.id,
        user_agent="sync_materializer",
        details={
            "source": "sync_materializer",
            "patient_mrn": getattr(instance, "mrn", ""),
            "registered_by": getattr(creator, "username", ""),
        },
        facility=getattr(instance, "registered_at_facility", None),
        organization=getattr(instance, "organization", None),
    )


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
    if model._meta.label == "core.County":
        code = cleaned_data.get("code")
        if code:
            existing = model.objects.filter(code=code).first()
            if existing:
                return existing

    if model._meta.label == "core.SubCounty":
        county_id = cleaned_data.get("county_id")
        name = cleaned_data.get("name")
        if county_id and name:
            existing = model.objects.filter(county_id=county_id, name=name).first()
            if existing:
                return existing

    if model._meta.label == "core.Ward":
        sub_county_id = cleaned_data.get("sub_county_id")
        name = cleaned_data.get("name")
        if sub_county_id and name:
            existing = model.objects.filter(sub_county_id=sub_county_id, name=name).first()
            if existing:
                return existing

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

    if model._meta.label == "clinics.ClinicSession":
        clinic_id = cleaned_data.get("clinic_id")
        session_date = cleaned_data.get("session_date")
        if clinic_id and session_date:
            existing = model.objects.filter(clinic_id=clinic_id, session_date=session_date).first()
            if existing:
                return existing

    if model._meta.label == "clinics.ClinicVisit":
        encounter_id = cleaned_data.get("encounter_id")
        if encounter_id:
            existing = model.objects.filter(encounter_id=encounter_id).first()
            if existing:
                return existing
        session_id = cleaned_data.get("session_id")
        queue_number = cleaned_data.get("queue_number")
        if session_id and queue_number:
            existing = model.objects.filter(
                session_id=session_id, queue_number=queue_number
            ).first()
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

    if model._meta.label == "encounters.Encounter":
        patient_id = cleaned_data.get("patient_id")
        facility_id = cleaned_data.get("facility_id")
        encounter_date = cleaned_data.get("encounter_date")
        encounter_type = cleaned_data.get("encounter_type")
        chief_complaint = cleaned_data.get("chief_complaint")
        if patient_id and facility_id and encounter_date and encounter_type and chief_complaint:
            existing = model.objects.filter(
                patient_id=patient_id,
                facility_id=facility_id,
                encounter_date=encounter_date,
                encounter_type=encounter_type,
                chief_complaint=chief_complaint,
            ).first()
            if existing:
                return existing

    if model._meta.label == "billing.ServiceCategory":
        code = cleaned_data.get("code")
        if code:
            existing = model.objects.filter(code=code).first()
            if existing:
                return existing

    if model._meta.label == "billing.Service":
        code = cleaned_data.get("code")
        if code:
            existing = model.objects.filter(code=code).first()
            if existing:
                return existing

    if model._meta.label == "billing.Invoice":
        invoice_number = cleaned_data.get("invoice_number")
        facility_id = cleaned_data.get("facility_id")
        if invoice_number and facility_id:
            existing = model.objects.filter(
                invoice_number=invoice_number, facility_id=facility_id
            ).first()
            if existing:
                return existing

    if model._meta.label == "billing.PaymentPoint":
        code = cleaned_data.get("code")
        facility_id = cleaned_data.get("facility_id")
        if code and facility_id:
            existing = model.objects.filter(code=code, facility_id=facility_id).first()
            if existing:
                return existing

    if model._meta.label == "billing.Payment":
        payment_reference = cleaned_data.get("payment_reference")
        if payment_reference:
            existing = model.objects.filter(payment_reference=payment_reference).first()
            if existing:
                return existing

    if model._meta.label == "billing.Receipt":
        receipt_number = cleaned_data.get("receipt_number")
        if receipt_number:
            existing = model.objects.filter(receipt_number=receipt_number).first()
            if existing:
                return existing

    if model._meta.label == "encounters.ICD10Code":
        code = cleaned_data.get("code")
        if code:
            existing = model.objects.filter(code=code).first()
            if existing:
                return existing

    if model._meta.label == "encounters.TreatmentPlan":
        encounter_id = cleaned_data.get("encounter_id")
        if encounter_id:
            existing = model.objects.filter(encounter_id=encounter_id).first()
            if existing:
                return existing

    if model._meta.label == "clinical_templates.ClinicalTemplate":
        name = cleaned_data.get("name")
        template_type = cleaned_data.get("template_type")
        specialty = cleaned_data.get("specialty")
        if name and template_type:
            existing = model.objects.filter(
                name=name, template_type=template_type, specialty=specialty or ""
            ).first()
            if existing:
                return existing

    if model._meta.label == "triage.TriageAssessment":
        encounter_id = cleaned_data.get("encounter_id")
        if encounter_id:
            existing = model.objects.filter(encounter_id=encounter_id).first()
            if existing:
                return existing

    if model._meta.label == "pharmacy.Prescription":
        prescription_number = cleaned_data.get("prescription_number")
        if prescription_number:
            existing = model.objects.filter(prescription_number=prescription_number).first()
            if existing:
                return existing

    if model._meta.label == "laboratory.TestCatalog":
        code = cleaned_data.get("code")
        facility_id = cleaned_data.get("facility_id")
        if code and facility_id:
            existing = model.objects.filter(code=code, facility_id=facility_id).first()
            if existing:
                return existing

    if model._meta.label == "laboratory.LabOrder":
        order_number = cleaned_data.get("order_number")
        if order_number:
            existing = model.objects.filter(order_number=order_number).first()
            if existing:
                return existing

    if model._meta.label == "laboratory.LabOrderItem":
        lab_order_id = cleaned_data.get("lab_order_id")
        test_id = cleaned_data.get("test_id")
        if lab_order_id and test_id:
            existing = model.objects.filter(lab_order_id=lab_order_id, test_id=test_id).first()
            if existing:
                return existing

    if model._meta.label == "laboratory.Specimen":
        barcode = cleaned_data.get("barcode")
        if barcode:
            existing = model.objects.filter(barcode=barcode).first()
            if existing:
                return existing

    if model._meta.label == "laboratory.LabResult":
        order_item_id = cleaned_data.get("order_item_id")
        if order_item_id:
            existing = model.objects.filter(order_item_id=order_item_id).first()
            if existing:
                return existing

    if model._meta.label == "imaging.ImagingOrder":
        order_number = cleaned_data.get("order_number")
        if order_number:
            existing = model.objects.filter(order_number=order_number).first()
            if existing:
                return existing

    if model._meta.label == "imaging.RadiologyReport":
        report_number = cleaned_data.get("report_number")
        if report_number:
            existing = model.objects.filter(report_number=report_number).first()
            if existing:
                return existing

    if model._meta.label == "inpatient.Ward":
        code = cleaned_data.get("code")
        if code:
            existing = model.objects.filter(code=code).first()
            if existing:
                return existing

    if model._meta.label == "inpatient.Bed":
        ward_id = cleaned_data.get("ward_id")
        bed_number = cleaned_data.get("bed_number")
        if ward_id and bed_number:
            existing = model.objects.filter(ward_id=ward_id, bed_number=bed_number).first()
            if existing:
                return existing

    if model._meta.label == "inpatient.Admission":
        admission_number = cleaned_data.get("admission_number")
        if admission_number:
            existing = model.objects.filter(admission_number=admission_number).first()
            if existing:
                return existing

    if model._meta.label == "immunizations.VaccineDefinition":
        code = cleaned_data.get("code")
        if code:
            existing = model.objects.filter(code=code).first()
            if existing:
                return existing

    if model._meta.label == "immunizations.ImmunizationRecord":
        patient_id = cleaned_data.get("patient_id")
        vaccine_id = cleaned_data.get("vaccine_id")
        dose_number = cleaned_data.get("dose_number")
        if patient_id and vaccine_id and dose_number:
            existing = model.objects.filter(
                patient_id=patient_id, vaccine_id=vaccine_id, dose_number=dose_number
            ).first()
            if existing:
                return existing

    if model._meta.label == "scheduling.Appointment":
        appointment_number = cleaned_data.get("appointment_number")
        if appointment_number:
            existing = model.objects.filter(appointment_number=appointment_number).first()
            if existing:
                return existing

    if model._meta.label == "scheduling.Schedule":
        resource_id = cleaned_data.get("resource_id")
        if resource_id:
            existing = model.objects.filter(
                resource_id=resource_id,
                schedule_type=cleaned_data.get("schedule_type"),
                day_of_week=cleaned_data.get("day_of_week"),
                specific_date=cleaned_data.get("specific_date"),
                start_time=cleaned_data.get("start_time"),
                end_time=cleaned_data.get("end_time"),
                effective_from=cleaned_data.get("effective_from"),
            ).first()
            if existing:
                return existing

    if model._meta.label == "scheduling.ScheduleBreak":
        schedule_id = cleaned_data.get("schedule_id")
        if schedule_id:
            existing = model.objects.filter(
                schedule_id=schedule_id,
                start_time=cleaned_data.get("start_time"),
                end_time=cleaned_data.get("end_time"),
            ).first()
            if existing:
                return existing

    return None
