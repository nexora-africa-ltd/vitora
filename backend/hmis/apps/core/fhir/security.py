# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Shared SMART authorization helpers for protected FHIR clinical endpoints.

FHIR views use these helpers after loading a resource or patient reference.
Internal JWT and cookie requests are unaffected; DOT bearer requests with only
patient scopes are restricted to their persisted launch patient.
"""

from collections.abc import Callable

from hmis.apps.core.fhir.tenant import resolve_fhir_tenant
from hmis.apps.core.oauth.permissions import is_patient_context_allowed


def request_can_access_patient(request, patient_id: object) -> bool:
    """Return whether a request may access or write the given patient."""
    return is_patient_context_allowed(request, patient_id)


def _relationship_patient_id(resource: object, *relationship: str) -> object | None:
    """Resolve a loaded resource's patient ID through an explicit relation path."""
    current = resource
    for attribute in relationship:
        current = getattr(current, attribute, None)
        if current is None:
            return None
    return getattr(current, "pk", current)


PATIENT_OWNERSHIP_RESOLVERS: dict[str, Callable[[object], object | None]] = {
    "Patient": lambda resource: getattr(resource, "pk", None),
    "Diagnosis": lambda resource: _relationship_patient_id(resource, "encounter", "patient"),
    "Allergy": lambda resource: getattr(resource, "patient_id", None),
    "PrescriptionItem": lambda resource: _relationship_patient_id(
        resource, "prescription", "patient"
    ),
    "TreatmentPlan": lambda resource: _relationship_patient_id(resource, "encounter", "patient"),
    "Specimen": lambda resource: _relationship_patient_id(resource, "lab_order", "patient"),
    "DiagnosticReport": lambda resource: _relationship_patient_id(resource, "lab_order", "patient"),
    "ImmunizationRecord": lambda resource: getattr(resource, "patient_id", None),
    "ProcedureOrder": lambda resource: getattr(resource, "patient_id", None),
    "DICOMStudy": lambda resource: getattr(resource, "patient_id", None),
    "DICOMInstance": lambda resource: _relationship_patient_id(
        resource, "series", "study", "patient"
    ),
    "Prescription": lambda resource: getattr(resource, "patient_id", None),
    "TheatreConsumable": lambda resource: _relationship_patient_id(
        resource, "surgery_case", "patient"
    ),
    # Observation is a dynamic endpoint: resolve from the loaded backing instance.
    "SocialHistoryObservation": lambda resource: getattr(resource, "patient_id", None),
    "PregnancyObservation": lambda resource: getattr(resource, "patient_id", None),
    "LabResult": lambda resource: _relationship_patient_id(
        resource, "order_item", "lab_order", "patient"
    ),
    "Encounter": lambda resource: getattr(resource, "patient_id", None),
}


def resolve_fhir_resource_patient_id(resource: object) -> object | None:
    """Return the patient owning a direct FHIR resource, or ``None`` when unowned."""
    resolver = PATIENT_OWNERSHIP_RESOLVERS.get(type(resource).__name__)
    return resolver(resource) if resolver else None


def request_can_access_fhir_resource(request, resource: object) -> bool:
    """Authorize a direct FHIR read by tenant first, then SMART patient context."""
    organization, _ = resolve_fhir_tenant(request)
    if not organization:
        return False

    resource_organization_id = getattr(resource, "organization_id", None)
    if resource_organization_id is not None:
        tenant_allowed = resource_organization_id == organization.pk
    elif getattr(resource, "registered_at_facility_id", None):
        tenant_allowed = resource.registered_at_facility.organization_id == organization.pk
    else:
        patient_id = resolve_fhir_resource_patient_id(resource)
        if patient_id is not None:
            from hmis.apps.patients.models import Patient

            tenant_allowed = Patient.objects.filter(
                pk=patient_id, organization=organization
            ).exists()
            if not tenant_allowed:
                tenant_allowed = Patient.objects.filter(
                    pk=patient_id,
                    organization__isnull=True,
                    registered_at_facility__organization=organization,
                ).exists()
        else:
            # Medication is a global reference catalogue, not tenant clinical data.
            tenant_allowed = type(resource).__name__ == "Drug"

    if not tenant_allowed:
        return False

    access_token = getattr(request, "access_token", None)
    if not access_token:
        return True

    scopes = (getattr(access_token, "scope", "") or "").split()
    patient_scoped = any(scope.startswith("patient/") for scope in scopes)
    broader_scoped = any(scope.startswith(("user/", "system/")) for scope in scopes)
    if not patient_scoped or broader_scoped:
        return True

    patient_id = resolve_fhir_resource_patient_id(resource)
    return patient_id is not None and request_can_access_patient(request, patient_id)
