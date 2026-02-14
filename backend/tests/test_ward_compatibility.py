import pytest  # type: ignore
from django.contrib.auth.models import Permission
from django.utils import timezone
from rest_framework import status


@pytest.fixture
def male_patient(sample_patient):
    sample_patient.gender = "M"
    sample_patient.save(update_fields=["gender"])
    return sample_patient


@pytest.fixture
def female_patient(sample_patient):
    sample_patient.gender = "F"
    sample_patient.save(update_fields=["gender"])
    return sample_patient


@pytest.fixture
def male_only_ward(db):
    from decimal import Decimal

    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Male Only Ward",
        code="MO-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
        gender_restriction="MALE_ONLY",
    )


@pytest.fixture
def pediatric_ward(db):
    from decimal import Decimal

    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Pediatric Ward",
        code="PED-01",
        ward_type="PEDIATRIC",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
    )


@pytest.fixture
def maternity_ward(db):
    from decimal import Decimal

    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Maternity Ward",
        code="MAT-01",
        ward_type="MATERNITY",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
    )


@pytest.fixture
def non_isolation_ward(db):
    from decimal import Decimal

    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Non Isolation Ward",
        code="NI-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
        isolation_capable=False,
    )


@pytest.fixture
def isolation_required_patient(sample_patient):
    return sample_patient


@pytest.fixture
def child_patient(db, sample_county, sample_sub_county):
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Child",
        last_name="Patient",
        date_of_birth="2016-01-15",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def adult_patient(db, sample_county, sample_sub_county):
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Adult",
        last_name="Patient",
        date_of_birth="1980-01-15",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.mark.django_db
class TestWardCompatibilityService:
    def test_male_patient_male_only_ward_compatible(self, male_patient, male_only_ward):
        from hmis.apps.inpatient.services.compatibility import ward_compatibility_service

        result = ward_compatibility_service.check_compatibility(
            patient=male_patient,
            ward=male_only_ward,
            requires_isolation=False,
        )
        assert result.compatible is True
        assert result.violations == []

    def test_female_patient_male_only_ward_violation(self, female_patient, male_only_ward):
        from hmis.apps.inpatient.services.compatibility import ward_compatibility_service

        result = ward_compatibility_service.check_compatibility(
            patient=female_patient,
            ward=male_only_ward,
            requires_isolation=False,
        )
        assert result.compatible is False
        assert any(v.code == "GENDER_MISMATCH" for v in result.violations)

    def test_child_patient_pediatric_ward_compatible(self, child_patient, pediatric_ward):
        from hmis.apps.inpatient.services.compatibility import ward_compatibility_service

        result = ward_compatibility_service.check_compatibility(
            patient=child_patient,
            ward=pediatric_ward,
            requires_isolation=False,
        )
        assert result.compatible is True

    def test_adult_patient_pediatric_ward_violation(self, adult_patient, pediatric_ward):
        from hmis.apps.inpatient.services.compatibility import ward_compatibility_service

        result = ward_compatibility_service.check_compatibility(
            patient=adult_patient,
            ward=pediatric_ward,
            requires_isolation=False,
        )
        assert result.compatible is False
        assert any(v.code in {"AGE_ABOVE_MAX", "PEDIATRIC_AGE"} for v in result.violations)

    def test_isolation_patient_non_isolation_ward_critical(
        self, isolation_required_patient, non_isolation_ward
    ):
        from hmis.apps.inpatient.services.compatibility import ward_compatibility_service

        result = ward_compatibility_service.check_compatibility(
            patient=isolation_required_patient,
            ward=non_isolation_ward,
            requires_isolation=True,
        )
        assert result.compatible is False
        assert result.has_critical_violations is True
        assert any(v.code == "ISOLATION_REQUIRED" and v.severity == "CRITICAL" for v in result.violations)


@pytest.mark.django_db
class TestWardAutoPopulateDefaults:
    def test_pediatric_ward_gets_default_age_range(self, db):
        from decimal import Decimal

        from hmis.apps.inpatient.models import Ward

        ward = Ward.objects.create(
            name="Auto Pediatric",
            code="AP-01",
            ward_type="PEDIATRIC",
            capacity=10,
            daily_rate=Decimal("1000.00"),
            is_active=True,
        )
        assert ward.min_age_years == 0
        assert ward.max_age_years == 14

    def test_maternity_ward_gets_default_age_and_gender(self, db):
        from decimal import Decimal

        from hmis.apps.inpatient.models import Ward

        ward = Ward.objects.create(
            name="Auto Maternity",
            code="AM-01",
            ward_type="MATERNITY",
            capacity=10,
            daily_rate=Decimal("1500.00"),
            is_active=True,
        )
        assert ward.min_age_years == 12
        assert ward.max_age_years == 55
        assert ward.gender_restriction == "FEMALE_ONLY"

    def test_medical_ward_no_default_age(self, sample_inpatient_ward):
        assert sample_inpatient_ward.min_age_years is None
        assert sample_inpatient_ward.max_age_years is None

    def test_explicit_values_not_overwritten(self, db):
        from decimal import Decimal

        from hmis.apps.inpatient.models import Ward

        ward = Ward.objects.create(
            name="Custom Pediatric",
            code="CP-01",
            ward_type="PEDIATRIC",
            capacity=10,
            daily_rate=Decimal("1500.00"),
            is_active=True,
            max_age_years=18,
        )
        assert ward.min_age_years == 0
        assert ward.max_age_years == 18


@pytest.mark.django_db
class TestCompatibilityEndpoints:
    def test_check_compatibility_endpoint(self, authenticated_client, female_patient, male_only_ward):
        response = authenticated_client.post(
            f"/api/inpatient/wards/{male_only_ward.id}/check_compatibility/",
            {"patient_id": female_patient.id, "requires_isolation": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["compatible"] is False
        assert "violations" in response.data

    def test_bulk_check_returns_compatible_wards(self, authenticated_client, child_patient, adult_patient):
        from decimal import Decimal

        from hmis.apps.inpatient.models import Ward

        Ward.objects.create(
            name="Medical Ward 2",
            code="MED-02",
            ward_type="MEDICAL",
            capacity=20,
            daily_rate=Decimal("500.00"),
            is_active=True,
        )
        response = authenticated_client.post(
            "/api/inpatient/wards/bulk_check_compatibility/",
            {
                "patient_ids": [child_patient.id, adult_patient.id],
                "requires_isolation": [False, False],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2
        for result in response.data["results"]:
            assert "compatible_wards" in result
            assert "incompatible_wards" in result

    def test_bulk_check_empty_patient_list_error(self, authenticated_client):
        response = authenticated_client.post(
            "/api/inpatient/wards/bulk_check_compatibility/",
            {"patient_ids": []},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestAdmissionOverrideFlow:
    def test_admission_requires_override_when_incompatible(
        self,
        authenticated_client,
        female_patient,
        male_only_ward,
        test_user,
    ):
        # Use the first auto-generated bed
        bed = male_only_ward.beds.filter(status="AVAILABLE").first()

        payload = {
            "patient": female_patient.id,
            "opd_encounter": None,
            "recommendation": None,
            "admission_date": timezone.now().isoformat(),
            "admitting_diagnosis": "J18.9",
            "admitting_diagnosis_text": "Pneumonia",
            "admitting_officer": test_user.id,
            "attending_doctor": test_user.id,
            "ward": male_only_ward.id,
            "bed": bed.id,
            "payer_type": "CASH",
        }

        response = authenticated_client.post(
            "/api/inpatient/admissions/",
            payload,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "compatibility" in response.data

    def test_override_admission_records_violations(self, authenticated_client, female_patient, male_only_ward, test_user):
        # Use the first auto-generated bed
        bed = male_only_ward.beds.filter(status="AVAILABLE").first()

        payload = {
            "patient": female_patient.id,
            "opd_encounter": None,
            "recommendation": None,
            "admission_date": timezone.now().isoformat(),
            "admitting_diagnosis": "J18.9",
            "admitting_diagnosis_text": "Pneumonia",
            "admitting_officer": test_user.id,
            "attending_doctor": test_user.id,
            "ward": male_only_ward.id,
            "bed": bed.id,
            "payer_type": "CASH",
            "constraint_override": True,
            "constraint_override_reason": "No other beds available",
        }

        response = authenticated_client.post(
            "/api/inpatient/admissions/",
            payload,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["constraint_override"] is True
        assert response.data["constraint_override_reason"] == "No other beds available"
        assert isinstance(response.data["constraint_violations"], list)
        assert any(v.get("code") == "GENDER_MISMATCH" for v in response.data["constraint_violations"])


@pytest.mark.django_db
class TestReceiveCriticalAlertsPermission:
    def test_receive_critical_alerts_permission_exists(self):
        assert Permission.objects.filter(codename="receive_critical_alerts").exists()
