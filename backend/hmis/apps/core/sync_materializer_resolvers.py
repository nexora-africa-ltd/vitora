# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F401
"""Core sync materializer resolvers for Vitora HMIS.

What this file is for:
- Implement sync materializer resolvers logic for the core domain.

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
from hmis.apps.core.sync_materializer_helpers import (
    parse_date_value,
    parse_time_value,
    remap_clinic_foreign_keys,
    remap_common_tenant_foreign_keys,
    remap_department_foreign_keys,
    remap_org_membership_foreign_keys,
    remap_resource_foreign_keys,
    remap_role_foreign_keys,
    remap_staff_profile_foreign_keys,
)
from hmis.apps.core.sync_registry import SYNC_REGISTRY, SyncDirection, SyncRegistryEntry

SYNC_META_KEY = "sync_meta"


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
