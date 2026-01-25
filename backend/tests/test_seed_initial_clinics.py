import pytest  # type: ignore


@pytest.mark.django_db
class TestSeedInitialClinics:
    def test_default_clinics_are_seeded(self):
        from hmis.apps.clinics.models import Clinic

        expected = {
            "OPD-DEFAULT": ("GENERAL_OPD", "General OPD"),
            "EYE-DEFAULT": ("EYE", "Eye Clinic"),
            "DENTAL-DEFAULT": ("DENTAL", "Dental Clinic"),
            "CCC-DEFAULT": ("CCC", "Comprehensive Care Clinic"),
            "ANC-DEFAULT": ("ANC", "Antenatal Clinic"),
            "PNC-DEFAULT": ("PNC", "Postnatal Clinic"),
            "FP-DEFAULT": ("FP", "Family Planning Clinic"),
            "CWC-DEFAULT": ("CWC", "Child Welfare Clinic"),
            "IMM-DEFAULT": ("IMMUNIZATION", "Immunization Clinic"),
        }

        for code, (clinic_type, name) in expected.items():
            clinic = Clinic.objects.get(code=code)
            assert clinic.clinic_type == clinic_type
            assert clinic.name == name
            assert clinic.status == "ACTIVE"

        ccc = Clinic.objects.get(code="CCC-DEFAULT")
        assert ccc.is_sensitive is True
        assert ccc.required_permission == "clinics.view_ccc_clinic"
