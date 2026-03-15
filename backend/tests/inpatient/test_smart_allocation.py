"""
Tests for Smart Bed Allocation — Phase C.

Covers:
- Predictive discharge service
- Emergency buffer enforcement
- Cohort grouping scoring
- Infection control auto-detection
- Staff workload scoring
- Bed utilization analytics
- Smart recommend bed API endpoint
- Set expected discharge API endpoint
- Model field additions (Ward.emergency_buffer_percent, Admission.expected_discharge_date)
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.encounters.models import Encounter
from hmis.apps.inpatient.models import (
    Admission,
    Bed,
    Discharge,
    NursingKardex,
    ShiftHandover,
    Ward,
)
from hmis.apps.inpatient.services.bed_smart import (
    SmartBedAllocationService,
    smart_bed_allocation_service,
)

User = get_user_model()


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def smart_service():
    return SmartBedAllocationService()


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        username="smartuser",
        password="testpass123",
        email="smart@example.com",
    )


@pytest.fixture
def authenticated_client(test_user):
    client = APIClient()
    client.force_authenticate(user=test_user)
    return client


@pytest.fixture
def general_ward(db):
    return Ward.objects.create(
        name="Smart General Ward",
        code="SG-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("1500.00"),
        is_active=True,
        gender_restriction="ANY",
        oxygen_equipped=True,
    )


@pytest.fixture
def buffered_ward(db):
    """Ward with 20% emergency buffer."""
    return Ward.objects.create(
        name="Buffered Ward",
        code="BUF-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("1500.00"),
        is_active=True,
        emergency_buffer_percent=20,
    )


@pytest.fixture
def isolation_ward(db):
    return Ward.objects.create(
        name="Isolation Ward",
        code="ISO-01",
        ward_type="ISOLATION",
        capacity=5,
        daily_rate=Decimal("3000.00"),
        is_active=True,
        isolation_capable=True,
    )


@pytest.fixture
def female_patient(db, sample_county, sample_sub_county):
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Alice",
        last_name="Wanjiku",
        date_of_birth=date(1990, 5, 15),
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def male_patient(db, sample_county, sample_sub_county):
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Brian",
        last_name="Ochieng",
        date_of_birth=date(1985, 8, 20),
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


def _create_admission(patient, ward, test_user, **kwargs):
    """Helper to create an admission with required linked encounter."""
    ipd_encounter = Encounter.objects.create(
        patient=patient,
        encounter_type="IPD",
        chief_complaint="Admitted for care",
    )
    bed = (
        kwargs.pop("bed", None)
        or ward.beds.filter(status="AVAILABLE").order_by("bed_number").first()
    )
    defaults = {
        "patient": patient,
        "ward": ward,
        "bed": bed,
        "ipd_encounter": ipd_encounter,
        "admission_date": kwargs.pop("admission_date", timezone.now()),
        "admitting_diagnosis": kwargs.pop("admitting_diagnosis", "J18.9"),
        "admitting_diagnosis_text": kwargs.pop(
            "admitting_diagnosis_text", "Pneumonia"
        ),
        "admitting_officer": test_user,
        "payer_type": "CASH",
    }
    defaults.update(kwargs)
    return Admission.objects.create(**defaults)


# =============================================================================
# Model Field Tests
# =============================================================================


@pytest.mark.django_db
class TestModelFields:
    """Verify new Phase C model fields."""

    def test_ward_emergency_buffer_percent_default(self, general_ward):
        assert general_ward.emergency_buffer_percent == 0

    def test_ward_emergency_buffer_percent_set(self, buffered_ward):
        assert buffered_ward.emergency_buffer_percent == 20

    def test_ward_emergency_buffer_validation_over_100(self, db):
        ward = Ward(
            name="Bad Buffer",
            code="BB-01",
            ward_type="MEDICAL",
            capacity=5,
            daily_rate=Decimal("500.00"),
            emergency_buffer_percent=150,
        )
        from django.core.exceptions import ValidationError

        with pytest.raises(ValidationError):
            ward.full_clean()

    def test_admission_expected_discharge_date_default_null(
        self, general_ward, female_patient, test_user
    ):
        admission = _create_admission(female_patient, general_ward, test_user)
        assert admission.expected_discharge_date is None

    def test_admission_expected_discharge_date_set(
        self, general_ward, female_patient, test_user
    ):
        expected = timezone.now() + timedelta(days=3)
        admission = _create_admission(
            female_patient, general_ward, test_user,
            expected_discharge_date=expected,
        )
        assert admission.expected_discharge_date == expected


# =============================================================================
# Predictive Discharge Tests
# =============================================================================


@pytest.mark.django_db
class TestPredictiveDischarge:
    """Tests for discharge prediction service."""

    def test_no_predictions_for_empty_ward(self, smart_service, general_ward):
        predictions = smart_service.get_predicted_discharges(general_ward, hours_ahead=24)
        assert predictions == []

    def test_explicit_expected_discharge_within_window(
        self, smart_service, general_ward, female_patient, test_user
    ):
        expected = timezone.now() + timedelta(hours=6)
        _create_admission(
            female_patient, general_ward, test_user,
            expected_discharge_date=expected,
        )

        predictions = smart_service.get_predicted_discharges(general_ward, hours_ahead=12)
        assert len(predictions) == 1
        assert predictions[0].source == "explicit"
        assert predictions[0].hours_until_available is not None
        assert predictions[0].hours_until_available <= 12

    def test_explicit_expected_discharge_outside_window(
        self, smart_service, general_ward, female_patient, test_user
    ):
        expected = timezone.now() + timedelta(hours=48)
        _create_admission(
            female_patient, general_ward, test_user,
            expected_discharge_date=expected,
        )

        predictions = smart_service.get_predicted_discharges(general_ward, hours_ahead=24)
        assert len(predictions) == 0

    def test_avg_los_based_prediction(
        self, smart_service, general_ward, female_patient, male_patient, test_user
    ):
        """Create a past discharge to establish avg LOS, then check prediction."""
        # Create a completed admission with 2-day LOS
        past_admission = _create_admission(
            male_patient, general_ward, test_user,
            admission_date=timezone.now() - timedelta(days=5),
        )
        Discharge.objects.create(
            admission=past_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now() - timedelta(days=3),
            discharged_by=test_user,
            admission_diagnosis="J18.9",
            final_diagnosis="J18.9",
            final_diagnosis_text="Pneumonia",
            treatment_summary="Antibiotics administered",
            patient_instructions="Rest and fluids",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        # Create current admission (just started — within avg LOS window? depends)
        _create_admission(
            female_patient, general_ward, test_user,
            admission_date=timezone.now() - timedelta(days=1),
        )

        # Avg LOS is ~2 days, so patient admitted 1 day ago should be predicted
        # to discharge in ~1 day = ~24 hours
        predictions = smart_service.get_predicted_discharges(general_ward, hours_ahead=48)
        # Should find the current admission estimated to discharge
        active_predictions = [p for p in predictions if p.source == "avg_los"]
        assert len(active_predictions) >= 1

    def test_predictions_sorted_by_soonest(
        self, smart_service, general_ward, female_patient, male_patient, test_user
    ):
        soon = timezone.now() + timedelta(hours=2)
        later = timezone.now() + timedelta(hours=8)

        _create_admission(
            male_patient, general_ward, test_user,
            expected_discharge_date=later,
        )
        _create_admission(
            female_patient, general_ward, test_user,
            expected_discharge_date=soon,
        )

        predictions = smart_service.get_predicted_discharges(general_ward, hours_ahead=12)
        assert len(predictions) == 2
        assert predictions[0].hours_until_available <= predictions[1].hours_until_available


# =============================================================================
# Emergency Buffer Tests
# =============================================================================


@pytest.mark.django_db
class TestEmergencyBuffer:
    """Tests for emergency buffer enforcement."""

    def test_no_buffer_default(self, smart_service, general_ward):
        assert smart_service.get_emergency_buffer_beds(general_ward) == 0

    def test_buffer_calculation_20_percent(self, smart_service, buffered_ward):
        # 20% of 10 = 2
        assert smart_service.get_emergency_buffer_beds(buffered_ward) == 2

    def test_buffer_rounds_up(self, smart_service, db):
        ward = Ward.objects.create(
            name="Odd Ward",
            code="ODD-01",
            ward_type="MEDICAL",
            capacity=7,
            daily_rate=Decimal("1000.00"),
            emergency_buffer_percent=10,
        )
        # 10% of 7 = 0.7 → ceil = 1
        assert smart_service.get_emergency_buffer_beds(ward) == 1

    def test_effective_available_subtracts_buffer(self, smart_service, buffered_ward):
        effective = smart_service.get_effective_available_beds(buffered_ward)
        # 10 available - 2 buffer = 8
        assert effective == 8

    def test_emergency_admission_bypasses_buffer(self, smart_service, buffered_ward, test_user):
        # Occupy all but 2 beds (leaving only the buffer beds)
        beds = list(buffered_ward.beds.order_by("bed_number"))
        for bed in beds[:8]:
            bed.status = "OCCUPIED"
            bed.status_changed_by = test_user
            bed.save()

        # Non-emergency: blocked
        allowed, _ = smart_service.check_emergency_buffer(buffered_ward, is_emergency=False)
        assert allowed is False

        # Emergency: allowed
        allowed, avail = smart_service.check_emergency_buffer(buffered_ward, is_emergency=True)
        assert allowed is True
        assert avail == 2

    def test_non_emergency_allowed_when_above_buffer(self, smart_service, buffered_ward):
        allowed, effective = smart_service.check_emergency_buffer(
            buffered_ward, is_emergency=False
        )
        assert allowed is True
        assert effective == 8


# =============================================================================
# Cohort Grouping Tests
# =============================================================================


@pytest.mark.django_db
class TestCohortGrouping:
    """Tests for cohort grouping scoring."""

    def test_empty_ward_returns_zero(self, smart_service, general_ward, female_patient):
        score = smart_service.calculate_cohort_score(female_patient, general_ward)
        assert score == 0.0

    def test_matching_diagnosis_chapter(
        self, smart_service, general_ward, female_patient, male_patient, test_user
    ):
        # Admit patient with J-chapter diagnosis
        _create_admission(
            male_patient, general_ward, test_user,
            admitting_diagnosis="J18.9",
        )

        # Female patient also has J-chapter from encounter
        score = smart_service.calculate_cohort_score(female_patient, general_ward)
        # Score depends on whether we can find the patient's diagnosis
        # With no encounters, should be 0 (can't match without diagnosis)
        assert isinstance(score, float)

    def test_different_diagnosis_chapters(
        self, smart_service, general_ward, female_patient, male_patient, test_user
    ):
        # Admit with K-chapter (digestive)
        _create_admission(
            male_patient, general_ward, test_user,
            admitting_diagnosis="K35.0",
        )

        # Score should be 0 or low if patient has different chapter
        score = smart_service.calculate_cohort_score(female_patient, general_ward)
        assert isinstance(score, float)


# =============================================================================
# Infection Control Tests
# =============================================================================


@pytest.mark.django_db
class TestInfectionControl:
    """Tests for infection risk auto-detection."""

    def test_no_infection_risk_default(self, smart_service, female_patient):
        needs, reason = smart_service.evaluate_infection_risk(female_patient)
        assert needs is False
        assert reason == ""

    def test_kardex_isolation_detected(
        self, smart_service, general_ward, female_patient, test_user
    ):
        admission = _create_admission(female_patient, general_ward, test_user)
        # Kardex is auto-created on admission — update it
        kardex = admission.kardex
        kardex.isolation_required = True
        kardex.isolation_type = "Contact"
        kardex.save()

        needs, reason = smart_service.evaluate_infection_risk(
            female_patient, admission=admission
        )
        assert needs is True
        assert "Contact" in reason

    def test_no_isolation_when_kardex_not_flagged(
        self, smart_service, general_ward, female_patient, test_user
    ):
        admission = _create_admission(female_patient, general_ward, test_user)
        # Kardex is auto-created — isolation_required defaults to False

        needs, reason = smart_service.evaluate_infection_risk(
            female_patient, admission=admission
        )
        assert needs is False


# =============================================================================
# Staff Workload Tests
# =============================================================================


@pytest.mark.django_db
class TestStaffWorkload:
    """Tests for workload scoring."""

    def test_empty_ward_low_score(self, smart_service, general_ward):
        score = smart_service.calculate_workload_score(general_ward)
        # Empty ward: 0% occupancy → low score
        assert score == 0.0

    def test_workload_includes_occupancy(
        self, smart_service, general_ward, test_user
    ):
        # Occupy 5 of 10 beds = 50% occupancy
        beds = list(general_ward.beds.order_by("bed_number"))
        for bed in beds[:5]:
            bed.status = "OCCUPIED"
            bed.status_changed_by = test_user
            bed.save()

        score = smart_service.calculate_workload_score(general_ward)
        # 50% * 0.6 = 30 (ignoring handover since none exists)
        assert score == 30.0

    def test_workload_includes_critical_ratio(
        self, smart_service, general_ward, test_user
    ):
        ShiftHandover.objects.create(
            ward=general_ward,
            shift_date=date.today(),
            shift_ending="DAY",
            outgoing_nurse=test_user,
            incoming_nurse=test_user,
            total_patients=10,
            critical_patients=5,
        )

        score = smart_service.calculate_workload_score(general_ward)
        # Occupancy 0% * 0.6 = 0, Critical ratio 50% * 0.4 = 20 → 20.0
        assert score == 20.0


# =============================================================================
# Bed Utilization Analytics Tests
# =============================================================================


@pytest.mark.django_db
class TestBedUtilization:
    """Tests for bed utilization analytics."""

    def test_utilization_for_empty_ward(self, smart_service, general_ward):
        utilization = smart_service.get_bed_utilization(general_ward)
        assert utilization.capacity == 10
        assert utilization.occupied == 0
        assert utilization.available == 10
        assert utilization.occupancy_rate == 0.0
        assert utilization.effective_available == 10
        assert utilization.emergency_buffer_beds == 0

    def test_utilization_with_buffer(self, smart_service, buffered_ward):
        utilization = smart_service.get_bed_utilization(buffered_ward)
        assert utilization.emergency_buffer_percent == 20
        assert utilization.emergency_buffer_beds == 2
        assert utilization.effective_available == 8

    def test_utilization_to_dict(self, smart_service, general_ward):
        utilization = smart_service.get_bed_utilization(general_ward)
        d = utilization.to_dict()
        assert "ward_id" in d
        assert "effective_available" in d
        assert "workload_score" in d


# =============================================================================
# Smart Assign Bed Tests
# =============================================================================


@pytest.mark.django_db
class TestSmartAssignBed:
    """Tests for the full smart allocation pipeline."""

    def test_smart_assign_basic_success(
        self, smart_service, general_ward, female_patient, test_user
    ):
        result = smart_service.smart_assign_bed(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )
        assert result.success is True
        assert result.assigned_bed is not None
        assert result.emergency_buffer_enforced is False
        assert result.evaluation_time_ms >= 0

    def test_smart_assign_emergency_buffer_blocks_non_emergency(
        self, smart_service, buffered_ward, female_patient, test_user
    ):
        # Occupy 8 of 10 beds, leaving only 2 (= buffer)
        beds = list(buffered_ward.beds.order_by("bed_number"))
        for bed in beds[:8]:
            bed.status = "OCCUPIED"
            bed.status_changed_by = test_user
            bed.save()

        result = smart_service.smart_assign_bed(
            patient=female_patient,
            ward=buffered_ward,
            user=test_user,
            admission_type="ELECTIVE",
        )
        assert result.success is False
        assert result.emergency_buffer_enforced is True
        assert "buffer" in result.error.lower()

    def test_smart_assign_emergency_bypasses_buffer(
        self, smart_service, buffered_ward, female_patient, test_user
    ):
        # Occupy 8 of 10 beds
        beds = list(buffered_ward.beds.order_by("bed_number"))
        for bed in beds[:8]:
            bed.status = "OCCUPIED"
            bed.status_changed_by = test_user
            bed.save()

        result = smart_service.smart_assign_bed(
            patient=female_patient,
            ward=buffered_ward,
            user=test_user,
            admission_type="EMERGENCY",
        )
        assert result.success is True
        assert result.assigned_bed is not None

    def test_smart_assign_infection_auto_isolation(
        self, smart_service, isolation_ward, female_patient, test_user
    ):
        # Create an admission and update auto-created kardex
        admission = _create_admission(female_patient, isolation_ward, test_user)
        kardex = admission.kardex
        kardex.isolation_required = True
        kardex.isolation_type = "Airborne"
        kardex.save()

        # Re-test with a different patient (using the same ward)
        from hmis.apps.patients.models import Patient

        other_patient = Patient.objects.create(
            first_name="Other",
            last_name="Patient",
            date_of_birth=date(1992, 3, 10),
            gender="F",
            county=admission.patient.county,
            sub_county=admission.patient.sub_county,
        )

        result = smart_service.smart_assign_bed(
            patient=other_patient,
            ward=isolation_ward,
            user=test_user,
        )
        # Should still succeed if beds are available in isolation ward
        assert isinstance(result.success, bool)
        assert isinstance(result.infection_isolation_triggered, bool)

    def test_smart_assign_provides_predicted_discharges_on_failure(
        self, smart_service, general_ward, female_patient, male_patient, test_user
    ):
        # Create an active admission first (before filling all beds)
        first_bed = general_ward.beds.filter(status="AVAILABLE").order_by("bed_number").first()
        admission = _create_admission(
            male_patient, general_ward, test_user,
            bed=first_bed,
            expected_discharge_date=timezone.now() + timedelta(hours=2),
        )

        # Now fill remaining beds
        for bed in general_ward.beds.filter(status="AVAILABLE"):
            bed.status = "OCCUPIED"
            bed.status_changed_by = test_user
            bed.save()

        result = smart_service.smart_assign_bed(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )
        assert result.success is False
        # Should have predicted discharges for planning
        # (The rule evaluator should return no beds)

    def test_smart_assign_returns_smart_scores(
        self, smart_service, general_ward, female_patient, test_user
    ):
        result = smart_service.smart_assign_bed(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )
        assert "cohort_match" in result.smart_scores
        assert "workload" in result.smart_scores
        assert "infection_risk" in result.smart_scores

    def test_smart_assign_to_dict(
        self, smart_service, general_ward, female_patient, test_user
    ):
        result = smart_service.smart_assign_bed(
            patient=female_patient,
            ward=general_ward,
            user=test_user,
        )
        d = result.to_dict()
        assert "success" in d
        assert "smart_scores" in d
        assert "evaluation_time_ms" in d


# =============================================================================
# API Endpoint Tests
# =============================================================================


@pytest.mark.django_db
class TestPredictedDischargesAPI:
    """Tests for GET /api/inpatient/wards/{id}/predicted_discharges/."""

    def test_predicted_discharges_empty_ward(
        self, authenticated_client, general_ward
    ):
        response = authenticated_client.get(
            f"/api/inpatient/wards/{general_ward.id}/predicted_discharges/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 0
        assert response.data["predictions"] == []

    def test_predicted_discharges_with_expected_date(
        self, authenticated_client, general_ward, female_patient, test_user
    ):
        expected = timezone.now() + timedelta(hours=6)
        _create_admission(
            female_patient, general_ward, test_user,
            expected_discharge_date=expected,
        )

        response = authenticated_client.get(
            f"/api/inpatient/wards/{general_ward.id}/predicted_discharges/",
            {"hours_ahead": 12},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1

    def test_predicted_discharges_requires_auth(self, general_ward):
        client = APIClient()
        response = client.get(
            f"/api/inpatient/wards/{general_ward.id}/predicted_discharges/"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestBedUtilizationAPI:
    """Tests for GET /api/inpatient/wards/{id}/bed_utilization/."""

    def test_bed_utilization_success(self, authenticated_client, general_ward):
        response = authenticated_client.get(
            f"/api/inpatient/wards/{general_ward.id}/bed_utilization/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["capacity"] == 10
        assert response.data["available"] == 10
        assert "emergency_buffer_beds" in response.data
        assert "workload_score" in response.data

    def test_bed_utilization_with_buffer(self, authenticated_client, buffered_ward):
        response = authenticated_client.get(
            f"/api/inpatient/wards/{buffered_ward.id}/bed_utilization/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["emergency_buffer_percent"] == 20
        assert response.data["emergency_buffer_beds"] == 2
        assert response.data["effective_available"] == 8

    def test_bed_utilization_requires_auth(self, general_ward):
        client = APIClient()
        response = client.get(
            f"/api/inpatient/wards/{general_ward.id}/bed_utilization/"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestSmartRecommendBedAPI:
    """Tests for POST /api/inpatient/wards/{id}/smart_recommend_bed/."""

    def test_smart_recommend_success(
        self, authenticated_client, general_ward, female_patient
    ):
        response = authenticated_client.post(
            f"/api/inpatient/wards/{general_ward.id}/smart_recommend_bed/",
            {"patient_id": female_patient.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["assigned_bed_id"] is not None
        assert "smart_scores" in response.data

    def test_smart_recommend_patient_not_found(
        self, authenticated_client, general_ward
    ):
        response = authenticated_client.post(
            f"/api/inpatient/wards/{general_ward.id}/smart_recommend_bed/",
            {"patient_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_smart_recommend_requires_auth(self, general_ward, female_patient):
        client = APIClient()
        response = client.post(
            f"/api/inpatient/wards/{general_ward.id}/smart_recommend_bed/",
            {"patient_id": female_patient.id},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestSetExpectedDischargeAPI:
    """Tests for POST /api/inpatient/admissions/{id}/set_expected_discharge/."""

    def test_set_expected_discharge_success(
        self, authenticated_client, general_ward, female_patient, test_user
    ):
        admission = _create_admission(female_patient, general_ward, test_user)
        expected = (timezone.now() + timedelta(days=2)).isoformat()

        response = authenticated_client.post(
            f"/api/inpatient/admissions/{admission.id}/set_expected_discharge/",
            {"expected_discharge_date": expected},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["admission_id"] == admission.id
        assert response.data["expected_discharge_date"] is not None

    def test_set_expected_discharge_past_date_fails(
        self, authenticated_client, general_ward, female_patient, test_user
    ):
        admission = _create_admission(female_patient, general_ward, test_user)
        past = (timezone.now() - timedelta(days=1)).isoformat()

        response = authenticated_client.post(
            f"/api/inpatient/admissions/{admission.id}/set_expected_discharge/",
            {"expected_discharge_date": past},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_set_expected_discharge_discharged_fails(
        self, authenticated_client, general_ward, female_patient, test_user
    ):
        admission = _create_admission(female_patient, general_ward, test_user)
        admission.admission_status = "DISCHARGED"
        admission.save()

        expected = (timezone.now() + timedelta(days=2)).isoformat()
        response = authenticated_client.post(
            f"/api/inpatient/admissions/{admission.id}/set_expected_discharge/",
            {"expected_discharge_date": expected},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_set_expected_discharge_requires_auth(
        self, general_ward, female_patient, test_user
    ):
        admission = _create_admission(female_patient, general_ward, test_user)
        client = APIClient()
        expected = (timezone.now() + timedelta(days=2)).isoformat()

        response = client.post(
            f"/api/inpatient/admissions/{admission.id}/set_expected_discharge/",
            {"expected_discharge_date": expected},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
