# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Apply cloud sync entries to the local database."""

from __future__ import annotations

from typing import Any

from django.apps import apps
from django.db import transaction
from django.utils.dateparse import parse_date, parse_datetime, parse_time

from hmis.apps.core.models import AuditLog, SyncConflict, SyncQueue
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
    except Exception as exc:  # noqa: BLE001
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


def remap_materialized_foreign_keys(
    model, cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Resolve cloud FK IDs to local rows using denormalized natural keys when present."""
    cleaned_data = remap_generic_natural_foreign_keys(model, cleaned_data, raw_data)
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


def remap_generic_natural_foreign_keys(
    model, cleaned_data: dict[str, Any], raw_data: dict[str, Any]
) -> dict[str, Any]:
    """Remap common FK targets by denormalized natural-key hints."""
    cleaned = cleaned_data.copy()

    for field in model._meta.concrete_fields:
        if not (getattr(field, "many_to_one", False) or getattr(field, "one_to_one", False)):
            continue
        if field.attname not in cleaned:
            continue

        local_id = resolve_related_id_from_sync_data(field, raw_data)
        if local_id is not None:
            cleaned[field.attname] = local_id

    return cleaned


def resolve_related_id_from_sync_data(field, raw_data: dict[str, Any]) -> int | None:
    """Resolve a single FK field using its relation-specific natural-key hint."""
    related_label = field.remote_field.model._meta.label
    prefix = field.name

    if related_label == "auth.User":
        return resolve_user_id_from_sync_data(raw_data, f"{prefix}_username")
    if related_label == "patients.Patient":
        return resolve_patient_id_from_sync_data(raw_data, prefix)
    if related_label == "core.Organization":
        return resolve_organization_id_from_sync_data(raw_data, f"{prefix}_slug")
    if related_label == "core.Facility":
        return resolve_facility_id_from_sync_data(raw_data, f"{prefix}_mfl_code")
    if related_label == "encounters.Encounter":
        return resolve_encounter_id_from_sync_data(raw_data, prefix)
    if related_label == "clinics.Clinic":
        return resolve_clinic_id_from_sync_data(raw_data, prefix)
    if related_label == "scheduling.Resource":
        return resolve_resource_id_from_sync_data(raw_data, prefix)
    if related_label == "billing.ServiceCategory":
        return resolve_service_category_id_from_sync_data(raw_data, prefix)
    if related_label == "billing.Service":
        return resolve_service_id_from_sync_data(raw_data, prefix)
    if related_label == "billing.Invoice":
        return resolve_invoice_id_from_sync_data(raw_data, prefix)
    if related_label == "billing.Payment":
        return resolve_payment_id_from_sync_data(raw_data, prefix)
    if related_label == "billing.PaymentPoint":
        return resolve_payment_point_id_from_sync_data(raw_data, prefix)
    if related_label == "pharmacy.Drug":
        return resolve_drug_id_from_sync_data(raw_data, prefix)
    if related_label == "core.County":
        return resolve_county_id_from_sync_data(raw_data, prefix)
    if related_label == "core.SubCounty":
        return resolve_sub_county_id_from_sync_data(raw_data, prefix)
    if related_label == "core.Ward":
        return resolve_location_ward_id_from_sync_data(raw_data, prefix)
    if related_label == "core.Role":
        return resolve_role_id_from_sync_data(raw_data, prefix)
    if related_label == "core.Department":
        return resolve_department_id_from_sync_data(raw_data, prefix)
    if related_label == "core.StaffProfile":
        return resolve_staff_profile_id_from_sync_data(raw_data, prefix)
    if related_label == "encounters.ICD10Code":
        return resolve_icd10_id_from_sync_data(raw_data, prefix)
    if related_label == "encounters.TreatmentPlan":
        return resolve_treatment_plan_id_from_sync_data(raw_data, prefix)
    if related_label == "encounters.TreatmentPlanTemplate":
        return resolve_treatment_plan_template_id_from_sync_data(raw_data, prefix)
    if related_label == "clinical_templates.ClinicalTemplate":
        return resolve_clinical_template_id_from_sync_data(raw_data, prefix)
    if related_label == "clinics.ClinicSession":
        return resolve_clinic_session_id_from_sync_data(raw_data, prefix)
    if related_label == "clinics.ClinicVisit":
        return resolve_clinic_visit_id_from_sync_data(raw_data, prefix)
    if related_label == "triage.TriageAssessment":
        return resolve_triage_assessment_id_from_sync_data(raw_data, prefix)
    if related_label == "pharmacy.Prescription":
        return resolve_prescription_id_from_sync_data(raw_data, prefix)
    if related_label == "pharmacy.PrescriptionItem":
        return resolve_prescription_item_id_from_sync_data(raw_data, prefix)
    if related_label == "laboratory.LabOrder":
        return resolve_lab_order_id_from_sync_data(raw_data, prefix)
    if related_label == "laboratory.LabOrderItem":
        return resolve_lab_order_item_id_from_sync_data(raw_data, prefix)
    if related_label == "laboratory.TestCatalog":
        return resolve_test_catalog_id_from_sync_data(raw_data, prefix)
    if related_label == "laboratory.Specimen":
        return resolve_specimen_id_from_sync_data(raw_data, prefix)
    if related_label == "imaging.ImagingOrder":
        return resolve_imaging_order_id_from_sync_data(raw_data, prefix)
    if related_label == "imaging.RadiologyReport":
        return resolve_radiology_report_id_from_sync_data(raw_data, prefix)
    if related_label == "inpatient.Admission":
        return resolve_admission_id_from_sync_data(raw_data, prefix)
    if related_label == "inpatient.Ward":
        return resolve_inpatient_ward_id_from_sync_data(raw_data, prefix)
    if related_label == "inpatient.Bed":
        return resolve_bed_id_from_sync_data(raw_data, prefix)
    if related_label == "immunizations.VaccineDefinition":
        return resolve_vaccine_definition_id_from_sync_data(raw_data, prefix)
    if related_label == "immunizations.ImmunizationRecord":
        return resolve_immunization_record_id_from_sync_data(raw_data, prefix)
    if related_label == "scheduling.Appointment":
        return resolve_appointment_id_from_sync_data(raw_data, prefix)
    if related_label == "scheduling.Schedule":
        return resolve_schedule_id_from_sync_data(raw_data, prefix)
    if related_label == "billing.InvoiceItem":
        return resolve_invoice_item_id_from_sync_data(raw_data, prefix)

    return None


def resolve_user_id_from_sync_data(raw_data: dict[str, Any], hint_key: str) -> int | None:
    """Resolve a local User PK by username hint."""
    username = str(raw_data.get(hint_key) or "").strip()
    if not username:
        return None

    from django.contrib.auth import get_user_model

    user = get_user_model().objects.filter(username=username).first()
    return user.pk if user else None


def resolve_patient_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Patient PK by MRN or CR number hints."""
    mrn = str(raw_data.get(f"{prefix}_mrn") or "").strip()
    cr_number = str(raw_data.get(f"{prefix}_cr_number") or "").strip()
    if not mrn and not cr_number:
        return None

    from hmis.apps.patients.models import Patient

    patient = Patient.objects.filter(mrn=mrn).first() if mrn else None
    if patient is None and cr_number:
        patient = Patient.objects.filter(cr_number=cr_number).first()
    return patient.pk if patient else None


def resolve_organization_id_from_sync_data(raw_data: dict[str, Any], hint_key: str) -> int | None:
    """Resolve a local Organization PK by slug hint."""
    slug = str(raw_data.get(hint_key) or "").strip()
    if not slug:
        return None

    from hmis.apps.core.models import Organization

    organization = Organization.objects.filter(slug=slug).first()
    return organization.pk if organization else None


def resolve_facility_id_from_sync_data(raw_data: dict[str, Any], hint_key: str) -> int | None:
    """Resolve a local Facility PK by MFL-code hint."""
    mfl_code = str(raw_data.get(hint_key) or "").strip()
    if not mfl_code:
        return None

    from hmis.apps.core.models import Facility

    facility = Facility.objects.filter(mfl_code=mfl_code).first()
    return facility.pk if facility else None


def resolve_encounter_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Encounter by conservative patient/facility/date/type/complaint hints."""
    patient_id = resolve_patient_id_from_sync_data(
        {
            f"{prefix}_mrn": raw_data.get(f"{prefix}_patient_mrn"),
            f"{prefix}_cr_number": raw_data.get(f"{prefix}_patient_cr_number"),
        },
        prefix,
    )
    facility_id = resolve_facility_id_from_sync_data(raw_data, f"{prefix}_facility_mfl_code")
    encounter_date = parse_date_value(
        raw_data.get(f"{prefix}_encounter_date") or raw_data.get("encounter_date")
    )
    encounter_type = str(
        raw_data.get(f"{prefix}_encounter_type") or raw_data.get("encounter_type") or ""
    ).strip()
    chief_complaint = str(raw_data.get(f"{prefix}_chief_complaint") or "").strip()

    if not (patient_id and facility_id and encounter_date and encounter_type and chief_complaint):
        return None

    from hmis.apps.encounters.models import Encounter

    encounter = Encounter.objects.filter(
        patient_id=patient_id,
        facility_id=facility_id,
        encounter_date=encounter_date,
        encounter_type=encounter_type,
        chief_complaint=chief_complaint,
    ).first()
    return encounter.pk if encounter else None


def resolve_clinic_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Clinic PK by code hint."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    if not code:
        return None

    from hmis.apps.clinics.models import Clinic

    clinic = Clinic.objects.filter(code=code).first()
    return clinic.pk if clinic else None


def resolve_resource_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Resource PK by facility MFL code and resource code."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    facility_id = resolve_facility_id_from_sync_data(raw_data, f"{prefix}_facility_mfl_code")
    if not (code and facility_id):
        return None

    from hmis.apps.scheduling.models import Resource

    resource = Resource.objects.filter(code=code, facility_id=facility_id).first()
    return resource.pk if resource else None


def resolve_service_category_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local ServiceCategory PK by code hint."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    if not code:
        return None

    from hmis.apps.billing.models import ServiceCategory

    category = ServiceCategory.objects.filter(code=code).first()
    return category.pk if category else None


def resolve_service_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Service PK by code hint."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    if not code:
        return None

    from hmis.apps.billing.models import Service

    service = Service.objects.filter(code=code).first()
    return service.pk if service else None


def resolve_invoice_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Invoice PK by invoice number and facility hints."""
    invoice_number = str(raw_data.get(f"{prefix}_invoice_number") or "").strip()
    facility_id = resolve_facility_id_from_sync_data(raw_data, f"{prefix}_facility_mfl_code")
    if not (invoice_number and facility_id):
        return None

    from hmis.apps.billing.models import Invoice

    invoice = Invoice.objects.filter(invoice_number=invoice_number, facility_id=facility_id).first()
    return invoice.pk if invoice else None


def resolve_payment_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Payment PK by payment reference hint."""
    payment_reference = str(raw_data.get(f"{prefix}_payment_reference") or "").strip()
    if not payment_reference:
        return None

    from hmis.apps.billing.models import Payment

    payment = Payment.objects.filter(payment_reference=payment_reference).first()
    return payment.pk if payment else None


def resolve_payment_point_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local PaymentPoint PK by facility MFL code and code."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    facility_id = resolve_facility_id_from_sync_data(raw_data, f"{prefix}_facility_mfl_code")
    if not (code and facility_id):
        return None

    from hmis.apps.billing.models import PaymentPoint

    payment_point = PaymentPoint.objects.filter(code=code, facility_id=facility_id).first()
    return payment_point.pk if payment_point else None


def resolve_drug_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Drug PK by code hint."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    if not code:
        return None

    from hmis.apps.pharmacy.models import Drug

    drug = Drug.objects.filter(code=code).first()
    return drug.pk if drug else None


def resolve_county_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local County PK by county code hint."""
    code = raw_data.get(f"{prefix}_code")
    if code in (None, ""):
        return None

    from hmis.apps.core.models import County

    county = County.objects.filter(code=code).first()
    return county.pk if county else None


def resolve_sub_county_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local SubCounty PK by county code and sub-county name hints."""
    name = str(raw_data.get(f"{prefix}_name") or "").strip()
    county_code = raw_data.get(f"{prefix}_county_code")
    if not name or county_code in (None, ""):
        return None

    from hmis.apps.core.models import SubCounty

    sub_county = SubCounty.objects.filter(county__code=county_code, name=name).first()
    return sub_county.pk if sub_county else None


def resolve_location_ward_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Kenya Ward PK by county code, sub-county name, and ward name."""
    name = str(raw_data.get(f"{prefix}_name") or "").strip()
    sub_county_name = str(raw_data.get(f"{prefix}_sub_county_name") or "").strip()
    county_code = raw_data.get(f"{prefix}_county_code")
    if not (name and sub_county_name) or county_code in (None, ""):
        return None

    from hmis.apps.core.models import Ward

    ward = Ward.objects.filter(
        sub_county__county__code=county_code,
        sub_county__name=sub_county_name,
        name=name,
    ).first()
    return ward.pk if ward else None


def resolve_role_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Role PK by role code hint."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    if not code:
        return None

    from hmis.apps.core.models import Role

    role = Role.objects.filter(code=code).first()
    return role.pk if role else None


def resolve_department_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Department PK by facility MFL code and department code."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    facility_id = resolve_facility_id_from_sync_data(raw_data, f"{prefix}_facility_mfl_code")
    if not (code and facility_id):
        return None

    from hmis.apps.core.models import Department

    department = Department.objects.filter(code=code, facility_id=facility_id).first()
    return department.pk if department else None


def resolve_staff_profile_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local StaffProfile PK by username or employee ID hints."""
    username = str(raw_data.get(f"{prefix}_username") or "").strip()
    employee_id = str(raw_data.get(f"{prefix}_employee_id") or "").strip()
    if not (username or employee_id):
        return None

    from hmis.apps.core.models import StaffProfile

    profile = StaffProfile.objects.filter(user__username=username).first() if username else None
    if profile is None and employee_id:
        profile = StaffProfile.objects.filter(employee_id=employee_id).first()
    return profile.pk if profile else None


def resolve_icd10_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local ICD-10 code PK by code hint."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    if not code:
        return None

    from hmis.apps.encounters.models import ICD10Code

    icd10_code = ICD10Code.objects.filter(code=code).first()
    return icd10_code.pk if icd10_code else None


def resolve_treatment_plan_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local TreatmentPlan PK by parent encounter hints."""
    encounter_id = resolve_encounter_id_from_sync_data(raw_data, prefix)
    if not encounter_id:
        return None

    from hmis.apps.encounters.models import TreatmentPlan

    plan = TreatmentPlan.objects.filter(encounter_id=encounter_id).first()
    return plan.pk if plan else None


def resolve_treatment_plan_template_id_from_sync_data(
    raw_data: dict[str, Any], prefix: str
) -> int | None:
    """Resolve a local TreatmentPlanTemplate PK by name hint."""
    name = str(raw_data.get(f"{prefix}_name") or "").strip()
    if not name:
        return None

    from hmis.apps.encounters.models import TreatmentPlanTemplate

    template = TreatmentPlanTemplate.objects.filter(name=name).first()
    return template.pk if template else None


def resolve_clinical_template_id_from_sync_data(
    raw_data: dict[str, Any], prefix: str
) -> int | None:
    """Resolve a local ClinicalTemplate PK by name/type/specialty hints."""
    name = str(raw_data.get(f"{prefix}_name") or "").strip()
    template_type = str(raw_data.get(f"{prefix}_template_type") or "").strip()
    specialty = str(raw_data.get(f"{prefix}_specialty") or "").strip()
    if not (name and template_type):
        return None

    from hmis.apps.clinical_templates.models import ClinicalTemplate

    template = ClinicalTemplate.objects.filter(
        name=name, template_type=template_type, specialty=specialty
    ).first()
    return template.pk if template else None


def resolve_clinic_session_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local ClinicSession PK by clinic code and session date."""
    clinic_id = resolve_clinic_id_from_sync_data(
        {f"{prefix}_code": raw_data.get(f"{prefix}_clinic_code")}, prefix
    )
    session_date = parse_date_value(raw_data.get(f"{prefix}_session_date"))
    if not (clinic_id and session_date):
        return None

    from hmis.apps.clinics.models import ClinicSession

    session = ClinicSession.objects.filter(clinic_id=clinic_id, session_date=session_date).first()
    return session.pk if session else None


def resolve_clinic_visit_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local ClinicVisit PK by encounter or session queue hints."""
    encounter_id = resolve_encounter_id_from_sync_data(raw_data, prefix)
    if encounter_id:
        from hmis.apps.clinics.models import ClinicVisit

        visit = ClinicVisit.objects.filter(encounter_id=encounter_id).first()
        if visit:
            return visit.pk

    session_id = resolve_clinic_session_id_from_sync_data(raw_data, prefix)
    queue_number = raw_data.get(f"{prefix}_queue_number")
    if not (session_id and queue_number):
        return None

    from hmis.apps.clinics.models import ClinicVisit

    visit = ClinicVisit.objects.filter(session_id=session_id, queue_number=queue_number).first()
    return visit.pk if visit else None


def resolve_triage_assessment_id_from_sync_data(
    raw_data: dict[str, Any], prefix: str
) -> int | None:
    """Resolve a local TriageAssessment PK by parent encounter hints."""
    encounter_id = resolve_encounter_id_from_sync_data(raw_data, prefix)
    if not encounter_id:
        return None

    from hmis.apps.triage.models import TriageAssessment

    assessment = TriageAssessment.objects.filter(encounter_id=encounter_id).first()
    return assessment.pk if assessment else None


def resolve_prescription_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Prescription PK by prescription number hint."""
    prescription_number = str(raw_data.get(f"{prefix}_prescription_number") or "").strip()
    if not prescription_number:
        return None

    from hmis.apps.pharmacy.models import Prescription

    prescription = Prescription.objects.filter(prescription_number=prescription_number).first()
    return prescription.pk if prescription else None


def resolve_prescription_item_id_from_sync_data(
    raw_data: dict[str, Any], prefix: str
) -> int | None:
    """Resolve a local PrescriptionItem PK by prescription number and drug code."""
    prescription_id = resolve_prescription_id_from_sync_data(raw_data, prefix)
    drug_id = resolve_drug_id_from_sync_data(
        {f"{prefix}_code": raw_data.get(f"{prefix}_drug_code") or raw_data.get(f"{prefix}_code")},
        prefix,
    )
    if not (prescription_id and drug_id):
        return None

    from hmis.apps.pharmacy.models import PrescriptionItem

    item = PrescriptionItem.objects.filter(
        prescription_id=prescription_id,
        drug_id=drug_id,
        dosage=raw_data.get(f"{prefix}_dosage") or "",
    ).first()
    return item.pk if item else None


def resolve_lab_order_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local LabOrder PK by order number hint."""
    order_number = str(raw_data.get(f"{prefix}_order_number") or "").strip()
    if not order_number:
        return None

    from hmis.apps.laboratory.models import LabOrder

    lab_order = LabOrder.objects.filter(order_number=order_number).first()
    return lab_order.pk if lab_order else None


def resolve_test_catalog_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local TestCatalog PK by facility MFL code and test code."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    facility_id = resolve_facility_id_from_sync_data(raw_data, f"{prefix}_facility_mfl_code")
    if not (code and facility_id):
        return None

    from hmis.apps.laboratory.models import TestCatalog

    test = TestCatalog.objects.filter(code=code, facility_id=facility_id).first()
    return test.pk if test else None


def resolve_lab_order_item_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local LabOrderItem PK by order number and test code hints."""
    lab_order_id = resolve_lab_order_id_from_sync_data(raw_data, prefix)
    test_id = resolve_test_catalog_id_from_sync_data(raw_data, prefix)
    if not (lab_order_id and test_id):
        return None

    from hmis.apps.laboratory.models import LabOrderItem

    order_item = LabOrderItem.objects.filter(lab_order_id=lab_order_id, test_id=test_id).first()
    return order_item.pk if order_item else None


def resolve_specimen_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Specimen PK by barcode hint."""
    barcode = str(raw_data.get(f"{prefix}_barcode") or "").strip()
    if not barcode:
        return None

    from hmis.apps.laboratory.models import Specimen

    specimen = Specimen.objects.filter(barcode=barcode).first()
    return specimen.pk if specimen else None


def resolve_imaging_order_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local ImagingOrder PK by order number hint."""
    order_number = str(raw_data.get(f"{prefix}_order_number") or "").strip()
    if not order_number:
        return None

    from hmis.apps.imaging.models import ImagingOrder

    imaging_order = ImagingOrder.objects.filter(order_number=order_number).first()
    return imaging_order.pk if imaging_order else None


def resolve_radiology_report_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local RadiologyReport PK by report number hint."""
    report_number = str(raw_data.get(f"{prefix}_report_number") or "").strip()
    if not report_number:
        return None

    from hmis.apps.imaging.models import RadiologyReport

    report = RadiologyReport.objects.filter(report_number=report_number).first()
    return report.pk if report else None


def resolve_admission_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Admission PK by admission number hint."""
    admission_number = str(raw_data.get(f"{prefix}_admission_number") or "").strip()
    if not admission_number:
        return None

    from hmis.apps.inpatient.models import Admission

    admission = Admission.objects.filter(admission_number=admission_number).first()
    return admission.pk if admission else None


def resolve_inpatient_ward_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local inpatient Ward PK by ward code hint."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    if not code:
        return None

    from hmis.apps.inpatient.models import Ward

    ward = Ward.objects.filter(code=code).first()
    return ward.pk if ward else None


def resolve_bed_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Bed PK by ward code and bed number hints."""
    ward_id = resolve_inpatient_ward_id_from_sync_data(raw_data, prefix)
    bed_number = str(raw_data.get(f"{prefix}_bed_number") or "").strip()
    if not (ward_id and bed_number):
        return None

    from hmis.apps.inpatient.models import Bed

    bed = Bed.objects.filter(ward_id=ward_id, bed_number=bed_number).first()
    return bed.pk if bed else None


def resolve_vaccine_definition_id_from_sync_data(
    raw_data: dict[str, Any], prefix: str
) -> int | None:
    """Resolve a local VaccineDefinition PK by code hint."""
    code = str(raw_data.get(f"{prefix}_code") or "").strip()
    if not code:
        return None

    from hmis.apps.immunizations.models import VaccineDefinition

    vaccine = VaccineDefinition.objects.filter(code=code).first()
    return vaccine.pk if vaccine else None


def resolve_immunization_record_id_from_sync_data(
    raw_data: dict[str, Any], prefix: str
) -> int | None:
    """Resolve a local ImmunizationRecord PK by patient, vaccine, and dose number."""
    patient_id = resolve_patient_id_from_sync_data(raw_data, prefix)
    vaccine_id = resolve_vaccine_definition_id_from_sync_data(raw_data, prefix)
    dose_number = raw_data.get(f"{prefix}_dose_number")
    if not (patient_id and vaccine_id and dose_number):
        return None

    from hmis.apps.immunizations.models import ImmunizationRecord

    record = ImmunizationRecord.objects.filter(
        patient_id=patient_id, vaccine_id=vaccine_id, dose_number=dose_number
    ).first()
    return record.pk if record else None


def resolve_appointment_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Appointment PK by appointment number hint."""
    appointment_number = str(raw_data.get(f"{prefix}_appointment_number") or "").strip()
    if not appointment_number:
        return None

    from hmis.apps.scheduling.models import Appointment

    appointment = Appointment.objects.filter(appointment_number=appointment_number).first()
    return appointment.pk if appointment else None


def resolve_schedule_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local Schedule PK by resource and time-window hints."""
    resource_id = resolve_resource_id_from_sync_data(raw_data, prefix)
    if not resource_id:
        return None

    from hmis.apps.scheduling.models import Schedule

    schedule = Schedule.objects.filter(
        resource_id=resource_id,
        schedule_type=raw_data.get(f"{prefix}_schedule_type"),
        day_of_week=raw_data.get(f"{prefix}_day_of_week"),
        specific_date=parse_date_value(raw_data.get(f"{prefix}_specific_date")),
        start_time=parse_time_value(raw_data.get(f"{prefix}_start_time")),
        end_time=parse_time_value(raw_data.get(f"{prefix}_end_time")),
        effective_from=parse_date_value(raw_data.get(f"{prefix}_effective_from")),
    ).first()
    return schedule.pk if schedule else None


def resolve_invoice_item_id_from_sync_data(raw_data: dict[str, Any], prefix: str) -> int | None:
    """Resolve a local InvoiceItem PK by parent invoice and line identity hints."""
    invoice_id = resolve_invoice_id_from_sync_data(raw_data, prefix)
    if not invoice_id:
        return None

    from hmis.apps.billing.models import InvoiceItem

    queryset = InvoiceItem.objects.filter(
        invoice_id=invoice_id,
        item_type=raw_data.get(f"{prefix}_item_type"),
        description=raw_data.get(f"{prefix}_description"),
    )
    service_id = resolve_service_id_from_sync_data(raw_data, prefix)
    drug_id = resolve_drug_id_from_sync_data(
        {f"{prefix}_code": raw_data.get(f"{prefix}_drug_code")}, prefix
    )
    lab_order_id = resolve_lab_order_id_from_sync_data(
        {f"{prefix}_order_number": raw_data.get(f"{prefix}_lab_order_number")}, prefix
    )
    imaging_order_id = resolve_imaging_order_id_from_sync_data(
        {f"{prefix}_order_number": raw_data.get(f"{prefix}_imaging_order_number")}, prefix
    )
    if service_id:
        queryset = queryset.filter(service_id=service_id)
    if drug_id:
        queryset = queryset.filter(drug_id=drug_id)
    if lab_order_id:
        queryset = queryset.filter(lab_order_id=lab_order_id)
    if imaging_order_id:
        queryset = queryset.filter(imaging_order_id=imaging_order_id)
    invoice_item = queryset.first()
    return invoice_item.pk if invoice_item else None


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
