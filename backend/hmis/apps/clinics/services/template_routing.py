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


CLINIC_TYPE_DEFAULT_TEMPLATE_NAME: dict[str, str] = {
    # General OPD
    "GENERAL_OPD": "General OPD Assessment",
    # MCH
    "ANC": "Antenatal Care (ANC) Visit",
    "CWC": "Child Wellness Check",
    # Chronic care (best-fit)
    "CCC": "HIV Care and Treatment",
    # Emergency
    "EMERGENCY": "Emergency Triage (ETAT)",
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

    return resolve_default_clinical_template_for_clinic_type(getattr(clinic, "clinic_type", ""))
