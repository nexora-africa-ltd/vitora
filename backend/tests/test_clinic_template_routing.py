import pytest  # type: ignore


@pytest.mark.django_db
class TestClinicTemplateRouting:
    def test_resolve_default_template_by_clinic_type(self):
        from hmis.apps.clinical_templates.models import ClinicalTemplate
        from hmis.apps.clinics.services.template_routing import (
            resolve_default_clinical_template_for_clinic_type,
        )

        expected = {
            "GENERAL_OPD": "General OPD Assessment",
            "FILTER_CLINIC": "Filter/Screening Assessment",
            "ANC": "Antenatal Care (ANC) Visit",
            "CWC": "Child Wellness Check",
            "PNC": "Postnatal Care (PNC) Visit",
            "FP": "Family Planning Visit",
            "IMMUNIZATION": "Immunization Visit",
            "CCC": "HIV Care and Treatment",
            "TB": "TB Assessment",
            "DIABETIC": "Chronic Disease Follow-up",
            "HYPERTENSION": "Chronic Disease Follow-up",
            "DENTAL": "Dental Clinic Assessment",
            "EYE": "Eye Clinic Assessment",
            "ENT": "ENT Clinic Assessment",
            "SURGICAL": "Surgical OPD Assessment",
            "ORTHO": "Orthopedic Clinic Assessment",
            "PHYSIO": "Physiotherapy Session Note",
            "DERM": "Dermatology Clinic Assessment",
            "NUTRITION": "Nutrition Assessment",
            "MENTAL_HEALTH": "Mental Health Assessment",
            "ONCOLOGY": "Oncology Follow-up",
            "DIALYSIS": "Dialysis Session Note",
            "PROCEDURE": "Procedure Note",
            "DRESSING": "Dressing/Wound Care Note",
            "INJECTION": "Injection Administration Note",
            "OTHER": "Other Clinic Assessment",
            "EMERGENCY": "Emergency Triage (ETAT)",
        }

        for clinic_type, template_name in expected.items():
            ClinicalTemplate.objects.create(
                name=template_name,
                template_type="encounter",
                specialty="",
                description="",
                content={"title": template_name, "sections": []},
                is_system=True,
                is_active=True,
            )

            resolved = resolve_default_clinical_template_for_clinic_type(clinic_type)
            assert resolved is not None
            assert resolved.name == template_name

    def test_resolve_default_template_by_clinic_code_override(self):
        from hmis.apps.clinical_templates.models import ClinicalTemplate
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.clinics.services.template_routing import resolve_default_clinical_template

        ClinicalTemplate.objects.create(
            name="Gender-Based Violence Assessment",
            template_type="assessment",
            specialty="",
            description="",
            content={"title": "Gender-Based Violence Assessment", "sections": []},
            is_system=True,
            is_active=True,
        )

        clinic = Clinic.objects.get(code="GBV-DEFAULT")

        resolved = resolve_default_clinical_template(clinic)
        assert resolved is not None
        assert resolved.name == "Gender-Based Violence Assessment"
