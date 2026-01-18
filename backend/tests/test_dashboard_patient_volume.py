"""
TDD Tests for Dashboard Patient Volume History API.

Following Red-Green-Refactor cycle:
1. RED: Write these failing tests first
2. GREEN: Implement minimal code to pass
3. REFACTOR: Clean up while keeping tests green

Tests for GET /api/core/dashboard/patient-volume/

Provides historical patient registration and encounter data for dashboard charts.
Data retention: 90 days maximum.
"""

import pytest  # type: ignore
from datetime import date, timedelta
from django.utils import timezone
from rest_framework import status

# API endpoint
PATIENT_VOLUME_URL = "/api/core/dashboard/patient-volume/"


# =============================================================================
# Authentication Tests
# =============================================================================


@pytest.mark.django_db
class TestPatientVolumeAuthentication:
    """Test authentication requirements for patient volume endpoint."""

    def test_patient_volume_requires_authentication(self, api_client):
        """Should return 401 when not authenticated."""
        response = api_client.get(PATIENT_VOLUME_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_patient_volume_accessible_when_authenticated(self, authenticated_client):
        """Should return 200 when authenticated with valid params."""
        today = date.today()
        week_ago = today - timedelta(days=7)
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(week_ago), "end_date": str(today)},
        )
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Parameter Validation Tests
# =============================================================================


@pytest.mark.django_db
class TestPatientVolumeValidation:
    """Test parameter validation for patient volume endpoint."""

    def test_requires_start_date(self, authenticated_client):
        """Should return 400 when start_date is missing."""
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"end_date": str(date.today())},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "start_date" in str(response.data).lower()

    def test_requires_end_date(self, authenticated_client):
        """Should return 400 when end_date is missing."""
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(date.today() - timedelta(days=7))},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "end_date" in str(response.data).lower()

    def test_rejects_invalid_date_format(self, authenticated_client):
        """Should return 400 for invalid date format."""
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": "01-01-2026", "end_date": "07-01-2026"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_start_date_after_end_date(self, authenticated_client):
        """Should return 400 when start_date > end_date."""
        today = date.today()
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(today), "end_date": str(today - timedelta(days=7))},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_date_range_exceeding_90_days(self, authenticated_client):
        """Should return 400 when date range exceeds 90 days (data retention limit)."""
        today = date.today()
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(today - timedelta(days=100)), "end_date": str(today)},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "90" in str(response.data)

    def test_accepts_valid_granularity_values(self, authenticated_client):
        """Should accept day, week, month as granularity values."""
        today = date.today()
        week_ago = today - timedelta(days=7)
        
        for granularity in ["day", "week", "month"]:
            response = authenticated_client.get(
                PATIENT_VOLUME_URL,
                {
                    "start_date": str(week_ago),
                    "end_date": str(today),
                    "granularity": granularity,
                },
            )
            assert response.status_code == status.HTTP_200_OK

    def test_rejects_invalid_granularity(self, authenticated_client):
        """Should return 400 for invalid granularity value."""
        today = date.today()
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {
                "start_date": str(today - timedelta(days=7)),
                "end_date": str(today),
                "granularity": "invalid",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Response Structure Tests
# =============================================================================


@pytest.mark.django_db
class TestPatientVolumeResponseStructure:
    """Test response structure for patient volume endpoint."""

    def test_response_contains_date_range(self, authenticated_client):
        """Response should include the requested date range."""
        today = date.today()
        week_ago = today - timedelta(days=7)
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(week_ago), "end_date": str(today)},
        )
        assert response.status_code == status.HTTP_200_OK
        assert "date_range" in response.data
        assert response.data["date_range"]["start"] == str(week_ago)
        assert response.data["date_range"]["end"] == str(today)

    def test_response_contains_granularity(self, authenticated_client):
        """Response should include the granularity used."""
        today = date.today()
        week_ago = today - timedelta(days=7)
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(week_ago), "end_date": str(today)},
        )
        assert "granularity" in response.data
        assert response.data["granularity"] == "day"  # Default

    def test_response_contains_data_array(self, authenticated_client):
        """Response should contain a data array."""
        today = date.today()
        week_ago = today - timedelta(days=7)
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(week_ago), "end_date": str(today)},
        )
        assert "data" in response.data
        assert isinstance(response.data["data"], list)

    def test_data_item_structure(self, authenticated_client, sample_patient):
        """Each data item should have correct structure."""
        today = date.today()
        week_ago = today - timedelta(days=7)
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(week_ago), "end_date": str(today)},
        )
        
        # Should have entries for the date range
        assert len(response.data["data"]) > 0
        
        # Check structure of first item
        item = response.data["data"][0]
        assert "date" in item
        assert "registrations" in item
        assert "encounters" in item
        assert "by_type" in item

    def test_by_type_contains_all_encounter_types(self, authenticated_client, sample_patient):
        """by_type should contain all standard encounter types."""
        today = date.today()
        week_ago = today - timedelta(days=7)
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(week_ago), "end_date": str(today)},
        )
        
        if response.data["data"]:
            by_type = response.data["data"][0]["by_type"]
            # Core encounter types that must be present
            expected_types = ["OPD", "IPD", "EMERGENCY"]
            for enc_type in expected_types:
                assert enc_type in by_type


# =============================================================================
# Data Accuracy Tests
# =============================================================================


@pytest.mark.django_db
class TestPatientVolumeDataAccuracy:
    """Test data accuracy for patient volume endpoint."""

    def test_counts_patient_registrations(self, authenticated_client, sample_county, sample_sub_county):
        """Should accurately count patient registrations per day."""
        from hmis.apps.patients.models import Patient
        
        today = date.today()
        
        # Create patients for today
        for i in range(3):
            Patient.objects.create(
                first_name=f"Test{i}",
                last_name="Patient",
                date_of_birth=date(1990, 1, 1),
                gender="M",
                county=sample_county,
                sub_county=sample_sub_county,
            )
        
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(today), "end_date": str(today)},
        )
        
        assert response.status_code == status.HTTP_200_OK
        # Find today's entry
        today_data = next(
            (d for d in response.data["data"] if d["date"] == str(today)), None
        )
        assert today_data is not None
        assert today_data["registrations"] >= 3

    def test_counts_encounters_by_type(self, authenticated_client, sample_patient):
        """Should accurately count encounters by type."""
        from django.core.cache import cache
        
        from hmis.apps.encounters.models import Encounter
        
        # Clear cache to ensure fresh data
        cache.clear()
        
        today = date.today()
        
        # Create encounters of different types
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=today,
            chief_complaint="Test complaint",
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            encounter_date=today,
            chief_complaint="Emergency complaint",
        )
        
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(today), "end_date": str(today)},
        )
        
        today_data = next(
            (d for d in response.data["data"] if d["date"] == str(today)), None
        )
        assert today_data is not None
        assert today_data["encounters"] >= 2
        assert today_data["by_type"]["OPD"] >= 1
        assert today_data["by_type"]["EMERGENCY"] >= 1

    def test_fills_gaps_with_zeros(self, authenticated_client):
        """Should include all dates in range, even with no data."""
        today = date.today()
        week_ago = today - timedelta(days=7)
        
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {"start_date": str(week_ago), "end_date": str(today)},
        )
        
        # Should have 8 entries (7 days + today)
        assert len(response.data["data"]) == 8
        
        # Each entry should have all required fields even if zero
        for item in response.data["data"]:
            assert item["registrations"] >= 0
            assert item["encounters"] >= 0


# =============================================================================
# Granularity Tests
# =============================================================================


@pytest.mark.django_db
class TestPatientVolumeGranularity:
    """Test granularity options for patient volume endpoint."""

    def test_daily_granularity(self, authenticated_client):
        """Daily granularity should return one entry per day."""
        today = date.today()
        week_ago = today - timedelta(days=6)  # 7 days total
        
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {
                "start_date": str(week_ago),
                "end_date": str(today),
                "granularity": "day",
            },
        )
        
        assert len(response.data["data"]) == 7

    def test_weekly_granularity(self, authenticated_client):
        """Weekly granularity should aggregate by week."""
        today = date.today()
        month_ago = today - timedelta(days=28)
        
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {
                "start_date": str(month_ago),
                "end_date": str(today),
                "granularity": "week",
            },
        )
        
        # Should have fewer entries than days
        assert len(response.data["data"]) <= 5  # ~4 weeks
        assert response.data["granularity"] == "week"

    def test_monthly_granularity(self, authenticated_client):
        """Monthly granularity should aggregate by month."""
        today = date.today()
        three_months_ago = today - timedelta(days=60)
        
        response = authenticated_client.get(
            PATIENT_VOLUME_URL,
            {
                "start_date": str(three_months_ago),
                "end_date": str(today),
                "granularity": "month",
            },
        )
        
        # Should have 2-3 month entries
        assert len(response.data["data"]) <= 3
        assert response.data["granularity"] == "month"


# =============================================================================
# Caching Tests
# =============================================================================


@pytest.mark.django_db
class TestPatientVolumeCaching:
    """Test Redis caching for patient volume endpoint."""

    def test_response_is_cached(self, authenticated_client):
        """Subsequent requests should be served from cache."""
        from django.core.cache import cache
        
        today = date.today()
        week_ago = today - timedelta(days=7)
        params = {"start_date": str(week_ago), "end_date": str(today)}
        
        # First request
        response1 = authenticated_client.get(PATIENT_VOLUME_URL, params)
        assert response1.status_code == status.HTTP_200_OK
        
        # Second request should return same data (from cache)
        response2 = authenticated_client.get(PATIENT_VOLUME_URL, params)
        assert response2.data == response1.data

    def test_cache_bypass_with_refresh_param(self, authenticated_client, sample_patient):
        """refresh=true should bypass cache."""
        from hmis.apps.encounters.models import Encounter
        
        today = date.today()
        week_ago = today - timedelta(days=7)
        params = {"start_date": str(week_ago), "end_date": str(today)}
        
        # First request (populates cache)
        response1 = authenticated_client.get(PATIENT_VOLUME_URL, params)
        initial_count = sum(d["encounters"] for d in response1.data["data"])
        
        # Create new encounter
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=today,
            chief_complaint="New complaint",
        )
        
        # Request with refresh=true should get new data
        params["refresh"] = "true"
        response2 = authenticated_client.get(PATIENT_VOLUME_URL, params)
        new_count = sum(d["encounters"] for d in response2.data["data"])
        
        assert new_count > initial_count
