"""Clinic → ClinicalTemplate routing helpers.

This module provides a small, explicit mapping between a clinic's `clinic_type`
(e.g., GENERAL_OPD, ANC, CCC) and the default `ClinicalTemplate` (loaded from
`backend/data/clinical_templates/*.json`).

Routing rules:
- If a clinic has `default_clinical_template` set, always prefer that.
- Otherwise, fall back to a best-fit system template by clinic_type.
- If no suitable template is found, return None (encounters remain template-less).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from hmis.apps.clinical_templates.models import ClinicalTemplate

if TYPE_CHECKING:
    from hmis.apps.clinics.models import Clinic


CLINIC_CODE_DEFAULT_TEMPLATE_NAME: dict[str, str] = {
    # Some workflows don't have a dedicated clinic_type in `Clinic.CLINIC_TYPE_CHOICES`
    # but still need a best-fit default template.
    "GBV-DEFAULT": "Gender-Based Violence Assessment",
}


CLINIC_TYPE_DEFAULT_TEMPLATE_NAME: dict[str, str] = {
    # General OPD
    "GENERAL_OPD": "General OPD Assessment",

    # Filter / screening
    "FILTER_CLINIC": "Filter/Screening Assessment",

    # MCH
    "ANC": "Antenatal Care (ANC) Visit",
    "CWC": "Child Wellness Check",
    "PNC": "Postnatal Care (PNC) Visit",
    "FP": "Family Planning Visit",
    "IMMUNIZATION": "Immunization Visit",

    # Chronic care
    "CCC": "HIV Care and Treatment",
    "TB": "TB Assessment",
    "DIABETIC": "Chronic Disease Follow-up",
    "HYPERTENSION": "Chronic Disease Follow-up",

    # Specialized clinics
    "DENTAL": "Dental Clinic Assessment",
    "EYE": "Eye Clinic Assessment",
    "ENT": "ENT Clinic Assessment",
    "SURGICAL": "Surgical OPD Assessment",
    "ORTHO": "Orthopedic Clinic Assessment",
    "PHYSIO": "Physiotherapy Session Note",
    "DERM": "Dermatology Clinic Assessment",
    "NUTRITION": "Nutrition Assessment",

    # Emergency
    "EMERGENCY": "Emergency Triage (ETAT)",

    # Chronic care (special)
    "MENTAL_HEALTH": "Mental Health Assessment",
    "ONCOLOGY": "Oncology Follow-up",
    "DIALYSIS": "Dialysis Session Note",

    # Procedure areas
    "PROCEDURE": "Procedure Note",
    "DRESSING": "Dressing/Wound Care Note",
    "INJECTION": "Injection Administration Note",

    # Fallback
    "OTHER": "Other Clinic Assessment",
}


def resolve_default_clinical_template_for_clinic_type(
    clinic_type: str,
) -> ClinicalTemplate | None:
    """Resolve a best-fit default template for a given clinic type."""

    template_name = CLINIC_TYPE_DEFAULT_TEMPLATE_NAME.get(clinic_type, "")
    if not template_name:
        return None

    return ClinicalTemplate.objects.filter(name=template_name, is_active=True).first()


def resolve_default_clinical_template(clinic: Clinic) -> ClinicalTemplate | None:
    """Resolve a default ClinicalTemplate for a clinic.

    Prefers the clinic's configured `default_clinical_template`.
    """

    if getattr(clinic, "default_clinical_template_id", None):
        return clinic.default_clinical_template

    clinic_code = getattr(clinic, "code", "")
    if clinic_code:
        template_name = CLINIC_CODE_DEFAULT_TEMPLATE_NAME.get(clinic_code, "")
        if template_name:
            return ClinicalTemplate.objects.filter(name=template_name, is_active=True).first()

    return resolve_default_clinical_template_for_clinic_type(getattr(clinic, "clinic_type", ""))


def resolve_mapped_default_clinical_template(clinic: Clinic) -> ClinicalTemplate | None:
    """Resolve the best-fit default template for a clinic ignoring configured overrides.

    This applies clinic-code overrides first, then falls back to the clinic_type mapping.
    Useful for backfill commands that want to enforce the mapping (e.g. --force).
    """

    clinic_code = getattr(clinic, "code", "")
    if clinic_code:
        template_name = CLINIC_CODE_DEFAULT_TEMPLATE_NAME.get(clinic_code, "")
        if template_name:
            return ClinicalTemplate.objects.filter(name=template_name, is_active=True).first()

    return resolve_default_clinical_template_for_clinic_type(getattr(clinic, "clinic_type", ""))
