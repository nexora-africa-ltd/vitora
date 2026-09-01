# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core sync signals for Vitora HMIS.

What this file is for:
- Implement sync signals logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from __future__ import annotations

import json
import logging

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import OperationalError, ProgrammingError
from django.db.models.fields.files import FieldFile
from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.sync_context import is_sync_materialization_active
from hmis.apps.core.sync_registry import (
    SyncDirection,
    get_registry_entry,
    is_downward_sync_model,
    is_upward_sync_model,
)

logger = logging.getLogger(__name__)


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


def _make_json_safe(data: dict) -> dict:
    """Return a copy of *data* with values safe for JSONField storage.

    Ensures date/time, UUID, Decimal and other Django-friendly values become
    JSON-safe primitives before the payload is stored in SyncQueue.data.
    """
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


def _find_non_serializable(obj, path="root"):
    """Yield (path, value) tuples for values that cannot be JSON-encoded."""
    try:
        json.dumps(obj, cls=DjangoJSONEncoder)
        return
    except (TypeError, ValueError):
        pass

    if isinstance(obj, dict):
        for key, value in obj.items():
            yield from _find_non_serializable(value, f"{path}.{key}")
    elif isinstance(obj, (list, tuple)):
        for index, value in enumerate(obj):
            yield from _find_non_serializable(value, f"{path}[{index}]")
    else:
        yield path, obj


def _create_sync_queue_entry(**kwargs) -> SyncQueue | None:
    """Create a SyncQueue entry, logging (but not raising) serialization errors.

    The caller has already persisted the underlying model change; failing to
    queue the sync entry should not roll that change back or surface a 500.
    """
    try:
        return SyncQueue.objects.create(**kwargs)
    except TypeError as exc:
        model_name = kwargs.get("model_name")
        record_id = kwargs.get("record_id")
        data = kwargs.get("data", {})
        logger.exception(
            "Sync queue payload for %s:%s is not JSON serializable: %s",
            model_name,
            record_id,
            exc,
        )
        for bad_path, bad_value in _find_non_serializable(data):
            logger.error(
                "Non-serializable sync value at %s for %s:%s: %r (type=%s)",
                bad_path,
                model_name,
                record_id,
                bad_value,
                type(bad_value).__name__,
            )
        return None


def serialize_instance_for_sync(instance, *, exclude_fields: tuple[str, ...]) -> dict:
    """Serialize a model instance into JSON-safe sync data."""
    model_label = get_model_label(instance)
    if model_label == "auth.User":
        data = _with_relation_hints(
            {
                "id": instance.pk,
                "username": instance.username,
                "email": instance.email or "",
                "first_name": instance.first_name or "",
                "last_name": instance.last_name or "",
                "password": instance.password,
                "is_active": instance.is_active,
            },
            instance,
        )
    elif model_label == "core.StaffProfile":
        # `username` is denormalized here so the cloud can resolve the linked
        # user even if the hub's local PK collides with an existing cloud
        # user's PK (see `_upsert_hub_user` soft-link logic).
        user = getattr(instance, "user", None)
        username = getattr(user, "username", "") if user is not None else ""
        role = getattr(instance, "primary_role", None)
        department = getattr(instance, "primary_department", None)
        organization = getattr(instance, "organization", None)
        facility = getattr(instance, "primary_facility", None)
        data = _with_relation_hints(
            {
                "id": instance.pk,
                "user_id": instance.user_id,
                "username": username,
                "employee_id": instance.employee_id or "",
                "title": instance.title or "",
                "middle_name": instance.middle_name or "",
                "primary_role_id": instance.primary_role_id,
                "primary_role_code": getattr(role, "code", "") if role is not None else "",
                "primary_department_id": instance.primary_department_id,
                "primary_department_code": (
                    getattr(department, "code", "") if department is not None else ""
                ),
                "organization_id": instance.organization_id,
                "organization_slug": getattr(organization, "slug", "")
                if organization is not None
                else "",
                "primary_facility_id": instance.primary_facility_id,
                "primary_facility_mfl_code": (
                    getattr(facility, "mfl_code", "") if facility is not None else ""
                ),
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
            },
            instance,
        )
    elif model_label == "core.Role":
        organization = getattr(instance, "organization", None)
        facility = getattr(instance, "facility", None)
        parent_role = getattr(instance, "parent_role", None)
        data = _with_relation_hints(
            {
                "id": instance.pk,
                "code": instance.code or "",
                "name": instance.name or "",
                "category": instance.category or "",
                "description": instance.description or "",
                "scope": instance.scope or "ORG",
                "organization_id": instance.organization_id,
                "organization_slug": getattr(organization, "slug", "")
                if organization is not None
                else "",
                "facility_id": instance.facility_id,
                "facility_mfl_code": getattr(facility, "mfl_code", "")
                if facility is not None
                else "",
                "permissions_matrix": instance.permissions_matrix or {},
                "hierarchy_level": instance.hierarchy_level,
                "parent_role_id": instance.parent_role_id,
                "parent_role_code": getattr(parent_role, "code", "")
                if parent_role is not None
                else "",
                "is_active": getattr(instance, "is_active", True),
            },
            instance,
        )
    elif model_label == "core.Department":
        organization = getattr(instance, "organization", None)
        facility = getattr(instance, "facility", None)
        parent = getattr(instance, "parent", None)
        head = getattr(instance, "head", None)
        head_user = getattr(head, "user", None) if head is not None else None
        data = _with_relation_hints(
            {
                "id": instance.pk,
                "code": instance.code or "",
                "name": instance.name or "",
                "description": instance.description or "",
                "department_type": instance.department_type or "",
                "organization_id": instance.organization_id,
                "organization_slug": getattr(organization, "slug", "")
                if organization is not None
                else "",
                "facility_id": instance.facility_id,
                "facility_mfl_code": getattr(facility, "mfl_code", "")
                if facility is not None
                else "",
                "parent_id": instance.parent_id,
                "parent_code": getattr(parent, "code", "") if parent is not None else "",
                "head_id": instance.head_id,
                "head_username": getattr(head_user, "username", "")
                if head_user is not None
                else "",
                "is_active": instance.is_active,
            },
            instance,
        )
    elif model_label == "core.OrgMembership":
        staff_profile = getattr(instance, "staff_profile", None)
        staff_user = getattr(staff_profile, "user", None) if staff_profile is not None else None
        organization = getattr(instance, "organization", None)
        role = getattr(instance, "role", None)
        department = getattr(instance, "department", None)
        facility_mfl_codes = (
            list(instance.facilities.values_list("mfl_code", flat=True)) if instance.pk else []
        )
        data = _with_relation_hints(
            {
                "id": instance.pk,
                "staff_profile_id": instance.staff_profile_id,
                "staff_profile_employee_id": (
                    getattr(staff_profile, "employee_id", "") if staff_profile is not None else ""
                ),
                "staff_username": getattr(staff_user, "username", "")
                if staff_user is not None
                else "",
                "organization_id": instance.organization_id,
                "organization_slug": getattr(organization, "slug", "")
                if organization is not None
                else "",
                "role_id": instance.role_id,
                "role_code": getattr(role, "code", "") if role is not None else "",
                "department_id": instance.department_id,
                "department_code": getattr(department, "code", "")
                if department is not None
                else "",
                # M2M: list of facility PKs the member can access in this org.
                "facility_ids": list(instance.facilities.values_list("pk", flat=True))
                if instance.pk
                else [],
                "facility_mfl_codes": facility_mfl_codes,
                "is_primary": instance.is_primary,
                "status": instance.status,
                "joined_at": instance.joined_at,
                "invited_by_id": instance.invited_by_id,
            },
            instance,
        )
    elif model_label == "scheduling.Resource":
        organization = getattr(instance, "organization", None)
        facility = getattr(instance, "facility", None)
        department = getattr(instance, "department", None)
        staff_profile = getattr(instance, "staff_profile", None)
        staff_user = getattr(staff_profile, "user", None) if staff_profile is not None else None
        data = _with_relation_hints(
            {
                "id": instance.pk,
                "name": instance.name,
                "resource_type": instance.resource_type,
                "code": instance.code,
                "is_active": instance.is_active,
                "capacity": instance.capacity,
                "staff_profile_id": instance.staff_profile_id,
                "staff_username": getattr(staff_user, "username", "")
                if staff_user is not None
                else "",
                "metadata": instance.metadata or {},
                "description": instance.description or "",
                "department_id": instance.department_id,
                "department_code": getattr(department, "code", "")
                if department is not None
                else "",
                "organization_id": instance.organization_id,
                "organization_slug": getattr(organization, "slug", "")
                if organization is not None
                else "",
                "facility_id": instance.facility_id,
                "facility_mfl_code": getattr(facility, "mfl_code", "")
                if facility is not None
                else "",
            },
            instance,
        )
    elif model_label == "clinics.Clinic":
        organization = getattr(instance, "organization", None)
        facility = getattr(instance, "facility", None)
        department = getattr(instance, "department", None)
        scheduling_resource = getattr(instance, "scheduling_resource", None)
        data = _with_relation_hints(
            {
                "id": instance.pk,
                "name": instance.name,
                "clinic_type": instance.clinic_type,
                "code": instance.code,
                "description": instance.description or "",
                "location": instance.location or "",
                "floor": instance.floor or "",
                "capacity": instance.capacity,
                "department_id": getattr(instance, "department_id", None),
                "department_code": getattr(department, "code", "")
                if department is not None
                else "",
                "status": instance.status,
                "requires_appointment": instance.requires_appointment,
                "requires_referral": instance.requires_referral,
                "accepts_walk_ins": instance.accepts_walk_ins,
                "triage_required": instance.triage_required,
                "eligibility_rules": instance.eligibility_rules,
                "default_service_fee": instance.default_service_fee,
                "sha_service_code": instance.sha_service_code or "",
                "dhis2_org_unit_id": instance.dhis2_org_unit_id or "",
                "moh_code": instance.moh_code or "",
                "default_clinical_template_id": instance.default_clinical_template_id,
                "is_sensitive": instance.is_sensitive,
                "required_permission": instance.required_permission or "",
                "scheduling_resource_id": instance.scheduling_resource_id,
                "scheduling_resource_code": (
                    getattr(scheduling_resource, "code", "")
                    if scheduling_resource is not None
                    else ""
                ),
                "organization_id": instance.organization_id,
                "organization_slug": getattr(organization, "slug", "")
                if organization is not None
                else "",
                "facility_id": instance.facility_id,
                "facility_mfl_code": getattr(facility, "mfl_code", "")
                if facility is not None
                else "",
            },
            instance,
        )
    else:
        data = _serialize_all_concrete_fields(instance, exclude_fields)
        # Preserve M2M relations as PK lists (model_to_dict used to do this for us).
        for m2m_field in instance._meta.many_to_many:
            if m2m_field.name in exclude_fields:
                continue
            try:
                data[m2m_field.name] = list(
                    getattr(instance, m2m_field.name).values_list("pk", flat=True)
                )
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):  # noqa: BLE001 — unsaved instances, etc.
                data[m2m_field.name] = []
        data["id"] = instance.pk
        data = _with_relation_hints(data, instance)

    return _make_json_safe(data)


def _serialize_all_concrete_fields(instance, exclude_fields: tuple[str, ...]) -> dict:
    """Serialize every concrete model field, including ``editable=False`` ones.

    Django's ``model_to_dict`` skips ``editable=False`` fields, which silently
    drops natural-key identifiers like ``order_number``, ``claim_number``,
    ``prescription_number`` and ``unit_number`` from the sync payload. That
    leaves the hub materializer creating rows with empty values for those
    columns and triggers UNIQUE constraint violations on the second insert.
    Walking ``_meta.concrete_fields`` ourselves keeps them in the payload so
    the hub can both natural-key-match existing rows and preserve identity
    information for brand-new ones.
    """
    data: dict = {}
    for field in instance._meta.concrete_fields:
        if field.primary_key:
            continue
        if field.name in exclude_fields or field.attname in exclude_fields:
            continue
        if getattr(field, "many_to_one", False) or getattr(field, "one_to_one", False):
            # Match ``model_to_dict``'s contract: store FKs under ``field.name``
            # (e.g. "clinic") with the related row's PK as the value. The
            # materializer + downstream consumers (tests, projections) all
            # expect this shape, not ``field.attname`` ("clinic_id").
            data[field.name] = getattr(instance, field.attname)
        else:
            value = getattr(instance, field.name)
            if isinstance(value, FieldFile):
                value = value.name or None
            data[field.name] = value
    return data


def _with_relation_hints(data: dict, instance) -> dict:
    """Add stable natural-key hints for common FK targets in sync payloads."""
    hints = data.copy()

    for field in instance._meta.concrete_fields:
        if not (getattr(field, "many_to_one", False) or getattr(field, "one_to_one", False)):
            continue
        related = getattr(instance, field.name, None)
        if related is None:
            continue

        prefix = field.name
        related_label = related._meta.label

        if related_label == "auth.User":
            hints[f"{prefix}_username"] = getattr(related, "username", "") or ""
        elif related_label == "patients.Patient":
            hints[f"{prefix}_mrn"] = getattr(related, "mrn", "") or ""
            hints[f"{prefix}_cr_number"] = getattr(related, "cr_number", "") or ""
        elif related_label == "core.County":
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
            hints[f"{prefix}_name"] = getattr(related, "name", "") or ""
        elif related_label == "core.SubCounty":
            county = getattr(related, "county", None)
            hints[f"{prefix}_name"] = getattr(related, "name", "") or ""
            hints[f"{prefix}_county_code"] = getattr(county, "code", "") if county else ""
        elif related_label == "core.Ward":
            sub_county = getattr(related, "sub_county", None)
            county = getattr(sub_county, "county", None) if sub_county is not None else None
            hints[f"{prefix}_name"] = getattr(related, "name", "") or ""
            hints[f"{prefix}_sub_county_name"] = (
                getattr(sub_county, "name", "") if sub_county is not None else ""
            )
            hints[f"{prefix}_county_code"] = getattr(county, "code", "") if county else ""
        elif related_label == "core.Role":
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
        elif related_label == "core.Department":
            facility = getattr(related, "facility", None)
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(facility, "mfl_code", "") if facility is not None else ""
            )
        elif related_label == "core.StaffProfile":
            user = getattr(related, "user", None)
            hints[f"{prefix}_employee_id"] = getattr(related, "employee_id", "") or ""
            hints[f"{prefix}_username"] = getattr(user, "username", "") if user else ""
        elif related_label == "encounters.Encounter":
            patient = getattr(related, "patient", None)
            facility = getattr(related, "facility", None)
            hints[f"{prefix}_patient_mrn"] = getattr(patient, "mrn", "") if patient else ""
            hints[f"{prefix}_encounter_date"] = related.encounter_date
            hints[f"{prefix}_encounter_type"] = related.encounter_type or ""
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(facility, "mfl_code", "") if facility is not None else ""
            )
            hints[f"{prefix}_chief_complaint"] = (related.chief_complaint or "")[:200]
        elif related_label == "encounters.ICD10Code":
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
        elif related_label == "encounters.TreatmentPlan":
            encounter = getattr(related, "encounter", None)
            if encounter is not None:
                hints.update(_encounter_hints(prefix, encounter))
        elif related_label == "encounters.TreatmentPlanTemplate":
            hints[f"{prefix}_name"] = getattr(related, "name", "") or ""
        elif related_label == "clinical_templates.ClinicalTemplate":
            hints[f"{prefix}_name"] = getattr(related, "name", "") or ""
            hints[f"{prefix}_template_type"] = getattr(related, "template_type", "") or ""
            hints[f"{prefix}_specialty"] = getattr(related, "specialty", "") or ""
        elif related_label == "clinics.Clinic":
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
        elif related_label == "clinics.ClinicSession":
            clinic = getattr(related, "clinic", None)
            hints[f"{prefix}_clinic_code"] = getattr(clinic, "code", "") if clinic else ""
            hints[f"{prefix}_session_date"] = related.session_date
        elif related_label == "clinics.ClinicVisit":
            session = getattr(related, "session", None)
            clinic = getattr(session, "clinic", None) if session is not None else None
            encounter = getattr(related, "encounter", None)
            hints[f"{prefix}_clinic_code"] = getattr(clinic, "code", "") if clinic else ""
            hints[f"{prefix}_session_date"] = getattr(session, "session_date", None)
            hints[f"{prefix}_queue_number"] = getattr(related, "queue_number", None)
            if encounter is not None:
                hints.update(_encounter_hints(prefix, encounter))
        elif related_label == "triage.TriageAssessment":
            encounter = getattr(related, "encounter", None)
            if encounter is not None:
                hints.update(_encounter_hints(prefix, encounter))
        elif related_label == "scheduling.Resource":
            facility = getattr(related, "facility", None)
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(facility, "mfl_code", "") if facility is not None else ""
            )
        elif related_label == "scheduling.Appointment":
            hints[f"{prefix}_appointment_number"] = getattr(related, "appointment_number", "") or ""
        elif related_label == "scheduling.Schedule":
            resource = getattr(related, "resource", None)
            facility = getattr(resource, "facility", None) if resource is not None else None
            hints[f"{prefix}_code"] = getattr(resource, "code", "") if resource else ""
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(facility, "mfl_code", "") if facility is not None else ""
            )
            hints[f"{prefix}_schedule_type"] = related.schedule_type
            hints[f"{prefix}_day_of_week"] = related.day_of_week
            hints[f"{prefix}_specific_date"] = related.specific_date
            hints[f"{prefix}_start_time"] = related.start_time
            hints[f"{prefix}_end_time"] = related.end_time
            hints[f"{prefix}_effective_from"] = related.effective_from
        elif related_label == "billing.Invoice":
            facility = getattr(related, "facility", None)
            hints[f"{prefix}_invoice_number"] = getattr(related, "invoice_number", "") or ""
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(facility, "mfl_code", "") if facility is not None else ""
            )
        elif related_label == "billing.InvoiceItem":
            invoice = getattr(related, "invoice", None)
            service = getattr(related, "service", None)
            drug = getattr(related, "drug", None)
            lab_order = getattr(related, "lab_order", None)
            imaging_order = getattr(related, "imaging_order", None)
            hints[f"{prefix}_invoice_number"] = (
                getattr(invoice, "invoice_number", "") if invoice is not None else ""
            )
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(invoice.facility, "mfl_code", "")
                if invoice is not None and invoice.facility_id is not None
                else ""
            )
            hints[f"{prefix}_item_type"] = related.item_type
            hints[f"{prefix}_description"] = related.description
            hints[f"{prefix}_code"] = getattr(service, "code", "") if service else ""
            hints[f"{prefix}_drug_code"] = getattr(drug, "code", "") if drug else ""
            hints[f"{prefix}_lab_order_number"] = (
                getattr(lab_order, "order_number", "") if lab_order is not None else ""
            )
            hints[f"{prefix}_imaging_order_number"] = (
                getattr(imaging_order, "order_number", "") if imaging_order is not None else ""
            )
        elif related_label == "billing.Payment":
            hints[f"{prefix}_payment_reference"] = getattr(related, "payment_reference", "") or ""
        elif related_label == "billing.PaymentPoint":
            facility = getattr(related, "facility", None)
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(facility, "mfl_code", "") if facility is not None else ""
            )
        elif related_label == "pharmacy.Prescription":
            hints[f"{prefix}_prescription_number"] = (
                getattr(related, "prescription_number", "") or ""
            )
        elif related_label == "pharmacy.PrescriptionItem":
            prescription = getattr(related, "prescription", None)
            drug = getattr(related, "drug", None)
            hints[f"{prefix}_prescription_number"] = (
                getattr(prescription, "prescription_number", "") if prescription is not None else ""
            )
            hints[f"{prefix}_code"] = getattr(drug, "code", "") if drug else ""
            hints[f"{prefix}_dosage"] = related.dosage
        elif related_label == "laboratory.LabOrder":
            hints[f"{prefix}_order_number"] = getattr(related, "order_number", "") or ""
        elif related_label == "laboratory.TestCatalog":
            facility = getattr(related, "facility", None)
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(facility, "mfl_code", "") if facility is not None else ""
            )
        elif related_label == "laboratory.LabOrderItem":
            lab_order = getattr(related, "lab_order", None)
            test = getattr(related, "test", None)
            facility = getattr(test, "facility", None) if test is not None else None
            hints[f"{prefix}_order_number"] = (
                getattr(lab_order, "order_number", "") if lab_order is not None else ""
            )
            hints[f"{prefix}_code"] = getattr(test, "code", "") if test else ""
            hints[f"{prefix}_facility_mfl_code"] = (
                getattr(facility, "mfl_code", "") if facility is not None else ""
            )
        elif related_label == "laboratory.Specimen":
            hints[f"{prefix}_barcode"] = getattr(related, "barcode", "") or ""
        elif related_label == "imaging.ImagingOrder":
            hints[f"{prefix}_order_number"] = getattr(related, "order_number", "") or ""
        elif related_label == "imaging.RadiologyReport":
            hints[f"{prefix}_report_number"] = getattr(related, "report_number", "") or ""
        elif related_label == "inpatient.Admission":
            hints[f"{prefix}_admission_number"] = getattr(related, "admission_number", "") or ""
        elif related_label == "inpatient.Ward":
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
        elif related_label == "inpatient.Bed":
            ward = getattr(related, "ward", None)
            hints[f"{prefix}_code"] = getattr(ward, "code", "") if ward else ""
            hints[f"{prefix}_bed_number"] = getattr(related, "bed_number", "") or ""
        elif related_label == "immunizations.VaccineDefinition":
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""
        elif related_label == "immunizations.ImmunizationRecord":
            patient = getattr(related, "patient", None)
            vaccine = getattr(related, "vaccine", None)
            hints[f"{prefix}_mrn"] = getattr(patient, "mrn", "") if patient else ""
            hints[f"{prefix}_code"] = getattr(vaccine, "code", "") if vaccine else ""
            hints[f"{prefix}_dose_number"] = related.dose_number
        elif related_label in {"billing.Service", "billing.ServiceCategory", "pharmacy.Drug"}:
            hints[f"{prefix}_code"] = getattr(related, "code", "") or ""

    return hints


def _encounter_hints(prefix: str, encounter) -> dict:
    """Return the stable encounter signature used by hub full-pull remapping."""
    patient = getattr(encounter, "patient", None)
    facility = getattr(encounter, "facility", None)
    return {
        f"{prefix}_patient_mrn": getattr(patient, "mrn", "") if patient else "",
        f"{prefix}_encounter_date": encounter.encounter_date,
        f"{prefix}_encounter_type": encounter.encounter_type or "",
        f"{prefix}_facility_mfl_code": getattr(facility, "mfl_code", "")
        if facility is not None
        else "",
        f"{prefix}_chief_complaint": (encounter.chief_complaint or "")[:200],
    }


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

    try:
        data = serialize_instance_for_sync(instance, exclude_fields=entry.exclude_fields)
        organization, facility = get_tenant_context(instance)
    except (AttributeError, TypeError, OperationalError, ProgrammingError):
        # During migrations/bootstrap, model fields and columns may be missing
        # temporarily. Skip auto-queueing instead of aborting the save path.
        return

    data = add_sync_meta(data, direction=entry.direction, priority=entry.priority)

    _create_sync_queue_entry(
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

    try:
        organization, facility = get_tenant_context(instance)
    except (AttributeError, TypeError, OperationalError, ProgrammingError):
        return
    _create_sync_queue_entry(
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

    try:
        data = serialize_instance_for_sync(instance, exclude_fields=entry.exclude_fields)
        organization, facility = get_tenant_context(instance)
    except (AttributeError, TypeError, OperationalError, ProgrammingError):
        return

    data = add_sync_meta(data, direction=entry.direction, priority=entry.priority)
    _create_sync_queue_entry(
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

    try:
        data = serialize_instance_for_sync(instance, exclude_fields=entry.exclude_fields)
    except (AttributeError, TypeError):
        # During migrations, model fields may not yet exist — skip sync queueing.
        return
    data = add_sync_meta(data, direction=entry.direction, priority=entry.priority)
    organization, facility = get_tenant_context(instance)

    _create_sync_queue_entry(
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
    _create_sync_queue_entry(
        operation="DELETE",
        organization=organization,
        facility=facility,
        model_name=model_label,
        record_id=instance.pk,
        data=add_sync_meta({"id": instance.pk}, direction=entry.direction, priority=entry.priority),
        status="SYNCED",
        synced_at=timezone.now(),
    )
