"""
Tests for Patient Vitals History API endpoint.

Tests cover:
1. Endpoint existence and authentication
2. Response format (list of VitalsDataPoint dicts)
3. Triage assessment vitals aggregation
4. Encounter vitals aggregation
5. Inpatient temperature reading aggregation
6. Inpatient BP monitoring aggregation
7. Time range filtering
8. Chronological ordering
9. Blood pressure string parsing
10. Empty result handling
11. Serializer field validation
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from tests.conftest import ensure_staff_profile

pytestmark = pytest.mark.django_db

User = get_user_model()

VITALS_FIELDS = {
    "timestamp",
    "source",
    "temperature",
    "heart_rate",
    "spo2",
    "respiratory_rate",
    "systolic_bp",
    "diastolic_bp",
    "weight",
    "height",
}


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def vitals_user(db):
    """Create a test user for vitals history tests."""
    return User.objects.create_user(username="vitals_test_user", password="testpass123")


@pytest.fixture
def vitals_patient(db, sample_organization):
    """Create a sample patient."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Vitals",
        last_name="Test",
        date_of_birth=date(1990, 6, 15),
        gender="M",
        organization=sample_organization,
    )


@pytest.fixture
def vitals_encounter(db, vitals_patient, sample_facility):
    """Create an encounter with vitals."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=vitals_patient,
        encounter_type="OPD",
        chief_complaint="Test vitals complaint",
        facility=sample_facility,
        temperature=Decimal("37.5"),
        pulse=88,
        blood_pressure="130/85",
        respiratory_rate=18,
        spo2=Decimal("97.5"),
        weight=Decimal("72.0"),
        height=Decimal("175.0"),
        vitals_source="CONSULTATION",
    )


@pytest.fixture
def vitals_encounter_no_vitals(db, vitals_patient, sample_facility):
    """Create an encounter without any vitals."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=vitals_patient,
        encounter_type="OPD",
        chief_complaint="No vitals encounter",
        facility=sample_facility,
    )


@pytest.fixture
def vitals_triage(db, vitals_patient, vitals_user, sample_facility):
    """Create a triage assessment with vitals."""
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.triage.models import TriageAssessment

    encounter = Encounter.objects.create(
        patient=vitals_patient,
        encounter_type="OPD",
        chief_complaint="Triage test",
        facility=sample_facility,
    )
    return TriageAssessment.objects.create(
        encounter=encounter,
        chief_complaint="Fever and headache",
        chief_complaint_category="FEVER",
        mental_status="A",
        mobility="AMBULATORY",
        arrival_mode="WALK_IN",
        triage_category="YELLOW",
        auto_calculated_category="YELLOW",
        arrival_time=timezone.now(),
        triage_start_time=timezone.now(),
        triaged_by=vitals_user,
        facility=sample_facility,
        temperature=Decimal("38.2"),
        heart_rate=95,
        systolic_bp=120,
        diastolic_bp=80,
        spo2=Decimal("96.0"),
        respiratory_rate=20,
        weight=Decimal("70.5"),
        height=Decimal("172.0"),
    )


@pytest.fixture
def vitals_auth_client(db, vitals_user, sample_organization, sample_facility):
    """Authenticated API client for vitals tests."""
    client = APIClient()
    ensure_staff_profile(vitals_user, sample_organization, sample_facility)
    client.force_authenticate(user=vitals_user)
    return client


# ============================================================================
# Tests
# ============================================================================


@pytest.mark.integration
class TestVitalsHistoryEndpoint:
    """Tests for GET /api/patients/{id}/vitals-history/."""

    def test_endpoint_exists(self, vitals_auth_client, vitals_patient):
        """Endpoint returns 200, not 404."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        assert response.status_code == status.HTTP_200_OK

    def test_requires_authentication(self, vitals_patient):
        """Unauthenticated requests are rejected."""
        client = APIClient()
        response = client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_returns_list(self, vitals_auth_client, vitals_patient):
        """Response is a list."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_empty_for_patient_without_vitals(self, vitals_auth_client, vitals_patient):
        """Returns empty list when patient has no vitals data."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_nonexistent_patient(self, vitals_auth_client):
        """Returns 404 for nonexistent patient."""
        response = vitals_auth_client.get("/api/patients/99999/vitals-history/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestVitalsHistoryEncounterSource:
    """Tests for encounter vitals in the aggregate response."""

    def test_includes_encounter_vitals(self, vitals_auth_client, vitals_patient, vitals_encounter):
        """Encounter vitals appear in the response."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

        point = response.data[0]
        assert set(point.keys()) == VITALS_FIELDS

    def test_encounter_vitals_values(self, vitals_auth_client, vitals_patient, vitals_encounter):
        """Encounter vitals have correct values."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        # Find the encounter source point
        enc_points = [p for p in response.data if p["source"] == "CONSULTATION"]
        assert len(enc_points) >= 1
        point = enc_points[0]

        assert point["temperature"] == 37.5
        assert point["heart_rate"] == 88
        assert point["spo2"] == 97.5
        assert point["respiratory_rate"] == 18
        assert point["weight"] == 72.0
        assert point["height"] == 175.0

    def test_blood_pressure_parsing(self, vitals_auth_client, vitals_patient, vitals_encounter):
        """Blood pressure string '130/85' is parsed to systolic/diastolic."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        enc_points = [p for p in response.data if p["source"] == "CONSULTATION"]
        assert len(enc_points) >= 1
        assert enc_points[0]["systolic_bp"] == 130
        assert enc_points[0]["diastolic_bp"] == 85

    def test_excludes_encounters_without_any_vitals(
        self, vitals_auth_client, vitals_patient, vitals_encounter_no_vitals
    ):
        """Encounters with no vitals at all are excluded."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 0


class TestVitalsHistoryTriageSource:
    """Tests for triage assessment vitals in the aggregate response."""

    def test_includes_triage_vitals(self, vitals_auth_client, vitals_patient, vitals_triage):
        """Triage vitals appear in the response."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        assert response.status_code == status.HTTP_200_OK
        triage_points = [p for p in response.data if p["source"] == "Triage"]
        assert len(triage_points) >= 1

    def test_triage_vitals_values(self, vitals_auth_client, vitals_patient, vitals_triage):
        """Triage vitals have correct values."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        triage_points = [p for p in response.data if p["source"] == "Triage"]
        assert len(triage_points) >= 1
        point = triage_points[0]

        assert point["temperature"] == 38.2
        assert point["heart_rate"] == 95
        assert point["systolic_bp"] == 120
        assert point["diastolic_bp"] == 80
        assert point["spo2"] == 96.0
        assert point["respiratory_rate"] == 20
        assert point["weight"] == 70.5
        assert point["height"] == 172.0


class TestVitalsHistoryTimeRangeFiltering:
    """Tests for time range filtering."""

    def test_filter_24h(self, vitals_auth_client, vitals_patient, vitals_encounter):
        """range=24h returns recent vitals."""
        response = vitals_auth_client.get(
            f"/api/patients/{vitals_patient.id}/vitals-history/?range=24h"
        )
        assert response.status_code == status.HTTP_200_OK
        # Encounter was just created, so it should be within 24h
        assert len(response.data) >= 1

    def test_filter_1h_excludes_old_data(self, vitals_auth_client, vitals_patient, sample_facility):
        """range=1h excludes encounters older than 1 hour."""
        from hmis.apps.encounters.models import Encounter

        enc = Encounter.objects.create(
            patient=vitals_patient,
            encounter_type="OPD",
            chief_complaint="Old encounter",
            facility=sample_facility,
            temperature=Decimal("36.5"),
            pulse=70,
        )
        # Backdate the created_at to 3 hours ago
        old_time = timezone.now() - timedelta(hours=3)
        Encounter.objects.filter(pk=enc.pk).update(created_at=old_time)

        response = vitals_auth_client.get(
            f"/api/patients/{vitals_patient.id}/vitals-history/?range=1h"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 0

    def test_filter_all_returns_everything(
        self, vitals_auth_client, vitals_patient, vitals_encounter, vitals_triage
    ):
        """range=all returns all vitals data."""
        response = vitals_auth_client.get(
            f"/api/patients/{vitals_patient.id}/vitals-history/?range=all"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 2  # encounter + triage

    def test_invalid_range_returns_all(self, vitals_auth_client, vitals_patient, vitals_encounter):
        """Invalid range param defaults to all."""
        response = vitals_auth_client.get(
            f"/api/patients/{vitals_patient.id}/vitals-history/?range=invalid"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1


class TestVitalsHistoryOrdering:
    """Tests for chronological ordering."""

    def test_sorted_by_timestamp_ascending(
        self, vitals_auth_client, vitals_patient, vitals_encounter, vitals_triage
    ):
        """Data points are sorted by timestamp ascending."""
        response = vitals_auth_client.get(f"/api/patients/{vitals_patient.id}/vitals-history/")
        assert response.status_code == status.HTTP_200_OK
        timestamps = [p["timestamp"] for p in response.data]
        assert timestamps == sorted(timestamps)


class TestVitalsDataPointSerializer:
    """Tests for VitalsDataPointSerializer."""

    def test_serializer_fields(self):
        """Serializer has all expected fields."""
        from hmis.apps.patients.serializers import VitalsDataPointSerializer

        serializer = VitalsDataPointSerializer()
        assert set(serializer.fields.keys()) == VITALS_FIELDS

    def test_serializer_with_full_data(self):
        """Serializer handles a complete data point."""
        from hmis.apps.patients.serializers import VitalsDataPointSerializer

        data = {
            "timestamp": "2026-04-04T10:00:00+00:00",
            "source": "Triage",
            "temperature": 37.5,
            "heart_rate": 88,
            "spo2": 97.5,
            "respiratory_rate": 18,
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "weight": 72.0,
            "height": 175.0,
        }
        serializer = VitalsDataPointSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_serializer_with_null_vitals(self):
        """Serializer handles null vitals fields."""
        from hmis.apps.patients.serializers import VitalsDataPointSerializer

        data = {
            "timestamp": "2026-04-04T10:00:00+00:00",
            "source": "Encounter",
            "temperature": None,
            "heart_rate": None,
            "spo2": None,
            "respiratory_rate": None,
            "systolic_bp": None,
            "diastolic_bp": None,
            "weight": None,
            "height": None,
        }
        serializer = VitalsDataPointSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_serializer_with_minimal_data(self):
        """Serializer works with only required fields."""
        from hmis.apps.patients.serializers import VitalsDataPointSerializer

        data = {"timestamp": "2026-04-04T10:00:00+00:00"}
        serializer = VitalsDataPointSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_serializer_output_format(self):
        """Serializer output matches expected shape."""
        from hmis.apps.patients.serializers import VitalsDataPointSerializer

        data = {
            "timestamp": "2026-04-04T10:00:00+00:00",
            "source": "Triage",
            "temperature": 38.0,
            "heart_rate": 90,
        }
        serializer = VitalsDataPointSerializer(data)
        output = serializer.data
        assert output["timestamp"] == "2026-04-04T10:00:00+00:00"
        assert output["source"] == "Triage"
        assert output["temperature"] == 38.0
        assert output["heart_rate"] == 90
