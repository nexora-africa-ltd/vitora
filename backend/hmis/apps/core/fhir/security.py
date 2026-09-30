# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Shared SMART authorization helpers for protected FHIR clinical endpoints.

FHIR views use these helpers after loading a resource or patient reference.
Internal JWT and cookie requests are unaffected; DOT bearer requests with only
patient scopes are restricted to their persisted launch patient.
"""

from collections.abc import Callable

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
    """Authorize a direct FHIR read, denying unowned resources to patient-only tokens."""
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
