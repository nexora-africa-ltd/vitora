"""
TDD Tests for Dashboard Stats API.

Following Red-Green-Refactor cycle:
1. RED: Write these failing tests first
2. GREEN: Implement minimal code to pass
3. REFACTOR: Clean up while keeping tests green

Tests for GET /api/core/dashboard/stats/
"""

import pytest
from django.utils import timezone
from rest_framework import status

# API endpoint
DASHBOARD_STATS_URL = "/api/core/dashboard/stats/"


@pytest.mark.django_db
class TestDashboardStatsAuthentication:
    """Test authentication requirements for dashboard stats endpoint."""

    def test_dashboard_stats_requires_authentication(self, api_client):
        """Should return 401 when not authenticated."""
        response = api_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_dashboard_stats_accessible_when_authenticated(self, authenticated_client):
        """Should return 200 when authenticated."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestDashboardStatsResponse:
    """Test dashboard stats response structure."""

    def test_response_contains_timestamp(self, authenticated_client):
        """Response should include timestamp."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "timestamp" in response.data

    def test_response_contains_cache_ttl(self, authenticated_client):
        """Response should include cache TTL."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert "cache_ttl" in response.data
        assert response.data["cache_ttl"] == 300  # 5 minutes

    def test_response_contains_patients_section(self, authenticated_client):
        """Response should include patients statistics."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert "patients" in response.data
        patients = response.data["patients"]
        assert "total" in patients
        assert "today" in patients
        assert "this_week" in patients
        assert "this_month" in patients

    def test_response_contains_encounters_section(self, authenticated_client):
        """Response should include encounters statistics."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert "encounters" in response.data
        encounters = response.data["encounters"]
        assert "total" in encounters
        assert "today" in encounters
        assert "in_progress" in encounters
        assert "completed_today" in encounters

    def test_response_contains_pharmacy_section(self, authenticated_client):
        """Response should include pharmacy statistics."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert "pharmacy" in response.data
        pharmacy = response.data["pharmacy"]
        assert "prescriptions_today" in pharmacy
        assert "pending_dispensing" in pharmacy
        assert "low_stock_items" in pharmacy
        assert "expiring_soon" in pharmacy

    def test_response_contains_laboratory_section(self, authenticated_client):
        """Response should include laboratory statistics."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert "laboratory" in response.data
        laboratory = response.data["laboratory"]
        assert "pending_tests" in laboratory
        assert "completed_today" in laboratory
        assert "critical_results" in laboratory

    def test_response_contains_triage_section(self, authenticated_client):
        """Response should include triage statistics."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert "triage" in response.data
        triage = response.data["triage"]
        assert "waiting" in triage
        assert "avg_wait_time_minutes" in triage
        assert "emergency_count" in triage

    def test_response_contains_billing_section(self, authenticated_client):
        """Response should include billing statistics."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert "billing" in response.data
        billing = response.data["billing"]
        assert "revenue_today" in billing
        assert "pending_payments" in billing
        assert "sha_claims_pending" in billing

    def test_response_contains_alerts_section(self, authenticated_client):
        """Response should include alerts statistics."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert "alerts" in response.data
        alerts = response.data["alerts"]
        assert "critical" in alerts
        assert "high" in alerts
        assert "medium" in alerts
        assert "total_unresolved" in alerts


@pytest.mark.django_db
class TestDashboardStatsPatientCounts:
    """Test that patient counts are accurate."""

    def test_total_patients_count(
        self, authenticated_client, sample_patient, sample_county, sample_sub_county,
        sample_organization, sample_facility,
    ):
        """Total patients should reflect actual database count."""
        from django.core.cache import cache

        from hmis.apps.patients.models import Patient

        # Clear cache to get fresh counts
        cache.delete("dashboard_stats")

        # Create additional patients
        Patient.objects.create(
            first_name="Test",
            last_name="Patient2",
            date_of_birth="1990-01-01",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            registered_by=sample_patient.registered_by,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )

        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK

        # Should count patients in this facility (sample_patient + 1 we just created)
        actual_count = Patient.objects.filter(registered_at_facility=sample_facility).count()
        assert response.data["patients"]["total"] == actual_count

    def test_today_patients_count(
        self, authenticated_client, sample_county, sample_sub_county, test_user,
        sample_organization, sample_facility,
    ):
        """Today's patients should only count patients created today."""
        from django.core.cache import cache

        from hmis.apps.patients.models import Patient

        # Clear cache to get fresh counts
        cache.delete("dashboard_stats")

        # Create a patient today
        today_patient = Patient.objects.create(
            first_name="Today",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            registered_by=test_user,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )

        # Use refresh=true to bypass cache
        response = authenticated_client.get(DASHBOARD_STATS_URL + "?refresh=true")

        # Count actual patients created today using localdate (same as dashboard)
        from django.utils import timezone

        today = timezone.localdate()
        actual_today_count = Patient.objects.filter(created_at__date=today).count()

        # Verify the dashboard returns the correct count
        assert response.data["patients"]["today"] == actual_today_count
        # Should include the patient we just created
        assert response.data["patients"]["today"] >= 1


@pytest.mark.django_db
class TestDashboardStatsEncounterCounts:
    """Test that encounter counts are accurate."""

    def test_today_encounters_count(self, authenticated_client, sample_encounter):
        """Today's encounters should reflect actual count."""
        from django.core.cache import cache

        from hmis.apps.encounters.models import Encounter

        # Clear cache to get fresh counts
        cache.delete("dashboard_stats")

        response = authenticated_client.get(DASHBOARD_STATS_URL)

        # Count encounters for today using localdate (same as dashboard)
        today = timezone.localdate()
        today_count = Encounter.objects.filter(encounter_date=today).count()
        assert response.data["encounters"]["today"] == today_count


@pytest.mark.django_db
class TestDashboardStatsCaching:
    """Test caching behavior of dashboard stats."""

    def test_stats_are_cached(self, authenticated_client):
        """Subsequent requests should return cached data with same timestamp."""
        from django.core.cache import cache

        # Clear cache first
        cache.delete("dashboard_stats")

        response1 = authenticated_client.get(DASHBOARD_STATS_URL)
        timestamp1 = response1.data["timestamp"]

        response2 = authenticated_client.get(DASHBOARD_STATS_URL)
        timestamp2 = response2.data["timestamp"]

        # Same timestamp means cache hit
        assert timestamp1 == timestamp2

    def test_cache_can_be_bypassed(self, authenticated_client):
        """Cache should be bypassable with query param for debugging."""
        from django.core.cache import cache

        # Clear cache
        cache.delete("dashboard_stats")

        response1 = authenticated_client.get(DASHBOARD_STATS_URL)
        timestamp1 = response1.data["timestamp"]

        # Bypass cache
        response2 = authenticated_client.get(f"{DASHBOARD_STATS_URL}?refresh=true")
        timestamp2 = response2.data["timestamp"]

        # Different timestamps when cache bypassed
        assert timestamp1 != timestamp2


@pytest.mark.django_db
class TestDashboardStatsValueTypes:
    """Test that all values have correct types."""

    def test_all_counts_are_integers(self, authenticated_client):
        """All count values should be integers."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        data = response.data

        # Patients
        assert isinstance(data["patients"]["total"], int)
        assert isinstance(data["patients"]["today"], int)
        assert isinstance(data["patients"]["this_week"], int)
        assert isinstance(data["patients"]["this_month"], int)

        # Encounters
        assert isinstance(data["encounters"]["total"], int)
        assert isinstance(data["encounters"]["today"], int)
        assert isinstance(data["encounters"]["in_progress"], int)
        assert isinstance(data["encounters"]["completed_today"], int)

        # Pharmacy
        assert isinstance(data["pharmacy"]["prescriptions_today"], int)
        assert isinstance(data["pharmacy"]["pending_dispensing"], int)
        assert isinstance(data["pharmacy"]["low_stock_items"], int)
        assert isinstance(data["pharmacy"]["expiring_soon"], int)

        # Laboratory
        assert isinstance(data["laboratory"]["pending_tests"], int)
        assert isinstance(data["laboratory"]["completed_today"], int)
        assert isinstance(data["laboratory"]["critical_results"], int)

        # Triage
        assert isinstance(data["triage"]["waiting"], int)
        assert isinstance(data["triage"]["emergency_count"], int)

        # Alerts
        assert isinstance(data["alerts"]["critical"], int)
        assert isinstance(data["alerts"]["high"], int)
        assert isinstance(data["alerts"]["medium"], int)
        assert isinstance(data["alerts"]["total_unresolved"], int)

    def test_avg_wait_time_is_number(self, authenticated_client):
        """Average wait time should be a number (int or float)."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        avg_wait = response.data["triage"]["avg_wait_time_minutes"]
        assert isinstance(avg_wait, (int, float))

    def test_revenue_is_number(self, authenticated_client):
        """Revenue should be a number."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        revenue = response.data["billing"]["revenue_today"]
        assert isinstance(revenue, (int, float))
