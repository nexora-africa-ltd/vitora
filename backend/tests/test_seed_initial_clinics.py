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
            "NUTRITION-DEFAULT": ("NUTRITION", "Nutrition Clinic"),
            "ENT-DEFAULT": ("ENT", "ENT Clinic"),
            "SURGICAL-DEFAULT": ("SURGICAL", "Surgical Outpatient Clinic"),
            "TB-DEFAULT": ("TB", "TB Clinic"),
            "DIABETIC-DEFAULT": ("DIABETIC", "Diabetic Clinic"),
            "HYPERTENSION-DEFAULT": ("HYPERTENSION", "Hypertension Clinic"),
            "GBV-DEFAULT": ("OTHER", "GBV Clinic"),

            # Additional specialty/procedure clinics (0007)
            "FILTER-DEFAULT": ("FILTER_CLINIC", "Filter/Screening Clinic"),
            "ORTHO-DEFAULT": ("ORTHO", "Orthopedic Clinic"),
            "PHYSIO-DEFAULT": ("PHYSIO", "Physiotherapy Clinic"),
            "DERM-DEFAULT": ("DERM", "Dermatology Clinic"),
            "MENTAL-DEFAULT": ("MENTAL_HEALTH", "Mental Health Clinic"),
            "ONCO-DEFAULT": ("ONCOLOGY", "Oncology Clinic"),
            "DIALYSIS-DEFAULT": ("DIALYSIS", "Dialysis Unit"),
            "PROCEDURE-DEFAULT": ("PROCEDURE", "Procedure Room"),
            "DRESSING-DEFAULT": ("DRESSING", "Dressing/Wound Care"),
            "INJECTION-DEFAULT": ("INJECTION", "Injection Room"),
        }

        for code, (clinic_type, name) in expected.items():
            clinic = Clinic.objects.get(code=code)
            assert clinic.clinic_type == clinic_type
            assert clinic.name == name
            assert clinic.status == "ACTIVE"

        ccc = Clinic.objects.get(code="CCC-DEFAULT")
        assert ccc.is_sensitive is True
        assert ccc.required_permission == "clinics.view_ccc_clinic"

        gbv = Clinic.objects.get(code="GBV-DEFAULT")
        assert gbv.is_sensitive is True
        assert gbv.required_permission == "patients.view_sensitive_patient"

        mental_health = Clinic.objects.get(code="MENTAL-DEFAULT")
        assert mental_health.is_sensitive is True
        assert mental_health.required_permission == "clinics.view_mental_health_clinic"
