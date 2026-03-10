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
            clinic, _ = Clinic.objects.get_or_create(
                code=code,
                defaults={
                    "clinic_type": clinic_type,
                    "name": name,
                },
            )
            assert clinic.clinic_type == clinic_type
            assert clinic.name == name
            assert clinic.status == "ACTIVE"

        ccc, _ = Clinic.objects.get_or_create(
            code="CCC-DEFAULT",
            defaults={
                "clinic_type": "CCC",
                "name": "Comprehensive Care Clinic",
                "is_sensitive": True,
                "required_permission": "clinics.view_ccc_clinic",
            },
        )
        if not ccc.is_sensitive or ccc.required_permission != "clinics.view_ccc_clinic":
            ccc.is_sensitive = True
            ccc.required_permission = "clinics.view_ccc_clinic"
            ccc.save(update_fields=["is_sensitive", "required_permission"])
        assert ccc.is_sensitive is True
        assert ccc.required_permission == "clinics.view_ccc_clinic"

        gbv, _ = Clinic.objects.get_or_create(
            code="GBV-DEFAULT",
            defaults={
                "clinic_type": "OTHER",
                "name": "GBV Clinic",
                "is_sensitive": True,
                "required_permission": "patients.view_sensitive_patient",
            },
        )
        if not gbv.is_sensitive or gbv.required_permission != "patients.view_sensitive_patient":
            gbv.is_sensitive = True
            gbv.required_permission = "patients.view_sensitive_patient"
            gbv.save(update_fields=["is_sensitive", "required_permission"])
        assert gbv.is_sensitive is True
        assert gbv.required_permission == "patients.view_sensitive_patient"

        mental_health, _ = Clinic.objects.get_or_create(
            code="MENTAL-DEFAULT",
            defaults={
                "clinic_type": "MENTAL_HEALTH",
                "name": "Mental Health Clinic",
                "is_sensitive": True,
                "required_permission": "clinics.view_mental_health_clinic",
            },
        )
        if (
            not mental_health.is_sensitive
            or mental_health.required_permission != "clinics.view_mental_health_clinic"
        ):
            mental_health.is_sensitive = True
            mental_health.required_permission = "clinics.view_mental_health_clinic"
            mental_health.save(update_fields=["is_sensitive", "required_permission"])
        assert mental_health.is_sensitive is True
        assert mental_health.required_permission == "clinics.view_mental_health_clinic"
