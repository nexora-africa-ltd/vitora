"""
Tests for the combined triage report summary endpoint.

GET /api/triage/reports/
"""

from datetime import timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.triage.models import TriageAssessment, TriageQueue

URL = "/api/triage/reports/"


def _create_assessment(
    encounter,
    user,
    facility,
    organization,
    *,
    category="GREEN",
    area="OPD",
    arrival_offset_hours=1,
    wait_minutes=5,
    completed=True,
):
    """Helper to create a TriageAssessment with predictable wait times."""
    now = timezone.now()
    arrival = now - timedelta(hours=arrival_offset_hours)
    triage_start = arrival + timedelta(minutes=wait_minutes)

    return TriageAssessment.objects.create(
        encounter=encounter,
        chief_complaint="Test complaint",
        chief_complaint_category="OTHER",
        mental_status="A",
        mobility="AMBULATORY",
        triage_category=category,
        auto_calculated_category=category,
        assigned_area=area,
        arrival_time=arrival,
        triage_start_time=triage_start,
        triage_end_time=triage_start + timedelta(minutes=3) if completed else None,
        triaged_by=user,
        facility=facility,
        organization=organization,
    )


@pytest.mark.django_db
class TestTriageReportSummary:
    """Tests for GET /api/triage/reports/."""

    def test_unauthenticated_returns_401(self, api_client):
        response = api_client.get(URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_empty_response_structure(self, authenticated_client):
        """Endpoint returns valid structure even with no assessments."""
        response = authenticated_client.get(URL)

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert "date_range" in data
        assert "start" in data["date_range"]
        assert "end" in data["date_range"]
        assert data["total_assessments"] == 0
        assert data["avg_wait_time_minutes"] == 0
        assert data["median_wait_time_minutes"] == 0
        assert data["target_met_percentage"] == 100  # No violations
        assert len(data["wait_times_by_category"]) == 5
        assert isinstance(data["volume_by_category"], list)
        assert isinstance(data["volume_by_area"], list)
        assert isinstance(data["staff_performance"], list)
        assert len(data["staff_performance"]) == 0
        assert isinstance(data["wait_time_trend"], list)
        assert len(data["wait_time_trend"]) == 0

        # LWBS stats
        lwbs = data["lwbs_stats"]
        assert lwbs["total_lwbs"] == 0
        assert lwbs["lwbs_rate"] == 0
        assert lwbs["avg_wait_before_lwbs_minutes"] == 0
        assert len(lwbs["by_category"]) == 5

    def test_with_assessments(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Endpoint returns correct counts with real data."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="RED",
            area="ER_RESUS",
            wait_minutes=2,
        )

        response = authenticated_client.get(URL, {"date_range": "last_7_days"})

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["total_assessments"] == 1
        assert data["avg_wait_time_minutes"] > 0

        # RED category should have 1 assessment
        red_stats = next(c for c in data["wait_times_by_category"] if c["category"] == "RED")
        assert red_stats["total_count"] == 1
        assert red_stats["target_minutes"] == 0

        # Volume by category should include RED
        red_vol = next((v for v in data["volume_by_category"] if v["category"] == "RED"), None)
        assert red_vol is not None
        assert red_vol["count"] == 1

    def test_wait_times_by_category_structure(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Each category entry has all required fields."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="YELLOW",
            wait_minutes=30,
        )

        response = authenticated_client.get(URL)
        data = response.data

        yellow = next(c for c in data["wait_times_by_category"] if c["category"] == "YELLOW")
        assert "target_minutes" in yellow
        assert "avg_wait_minutes" in yellow
        assert "median_wait_minutes" in yellow
        assert "exceeded_count" in yellow
        assert "exceeded_percentage" in yellow
        assert "total_count" in yellow
        assert yellow["target_minutes"] == 60
        assert yellow["total_count"] == 1
        # 30 min wait for YELLOW (target 60) → not exceeded
        assert yellow["exceeded_count"] == 0

    def test_exceeded_target(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Exceeded count increments when wait exceeds KETA target."""
        # ORANGE target is 10 min; wait 15 min → exceeded
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="ORANGE",
            wait_minutes=15,
        )

        response = authenticated_client.get(URL)
        orange = next(
            c for c in response.data["wait_times_by_category"] if c["category"] == "ORANGE"
        )
        assert orange["exceeded_count"] == 1
        assert orange["exceeded_percentage"] == 100.0

    def test_date_range_today(self, authenticated_client):
        """Default date_range='today' returns 200."""
        response = authenticated_client.get(URL, {"date_range": "today"})
        assert response.status_code == status.HTTP_200_OK

    def test_date_range_last_7_days(self, authenticated_client):
        response = authenticated_client.get(URL, {"date_range": "last_7_days"})
        assert response.status_code == status.HTTP_200_OK

    def test_date_range_last_30_days(self, authenticated_client):
        response = authenticated_client.get(URL, {"date_range": "last_30_days"})
        assert response.status_code == status.HTTP_200_OK

    def test_date_range_week_alias(self, authenticated_client):
        response = authenticated_client.get(URL, {"date_range": "week"})
        assert response.status_code == status.HTTP_200_OK

    def test_date_range_custom(self, authenticated_client):
        response = authenticated_client.get(
            URL,
            {
                "date_range": "custom",
                "start_date": "2026-05-01",
                "end_date": "2026-05-15",
            },
        )
        assert response.status_code == status.HTTP_200_OK

    def test_filter_by_category(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Category filter narrows results."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
            wait_minutes=5,
        )

        # Filter for RED → should find 0
        response = authenticated_client.get(URL, {"category": "RED"})
        assert response.data["total_assessments"] == 0

        # Filter for GREEN → should find 1
        response = authenticated_client.get(URL, {"category": "GREEN"})
        assert response.data["total_assessments"] == 1

    def test_filter_by_area(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Area filter narrows results."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            area="ER_RESUS",
            wait_minutes=5,
        )

        # Filter for OPD → should find 0
        response = authenticated_client.get(URL, {"area": "OPD"})
        assert response.data["total_assessments"] == 0

        # Filter for ER_RESUS → should find 1
        response = authenticated_client.get(URL, {"area": "ER_RESUS"})
        assert response.data["total_assessments"] == 1

    def test_volume_by_area(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Volume by area returns area labels."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            area="ER_RESUS",
        )

        response = authenticated_client.get(URL)
        areas = response.data["volume_by_area"]
        assert len(areas) >= 1
        er = next((a for a in areas if a["area"] == "ER_RESUS"), None)
        assert er is not None
        assert er["count"] == 1
        assert er["area_label"] == "ER - Resuscitation"

    def test_lwbs_stats_with_lwbs_entry(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """LWBS stats counted from TriageQueue entries."""
        # Create an assessment so total_assessments > 0
        assessment = _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
        )

        # Create a LWBS triage queue entry linked to the assessment
        TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
            status="LEFT_WITHOUT_BEING_SEEN",
        )

        response = authenticated_client.get(URL)
        lwbs = response.data["lwbs_stats"]
        assert lwbs["total_lwbs"] == 1
        assert lwbs["lwbs_rate"] > 0

    def test_target_met_percentage_all_met(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """100% target met when all waits are within KETA targets."""
        # GREEN target is 240 min; wait 5 min → well within target
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
            wait_minutes=5,
        )

        response = authenticated_client.get(URL)
        assert response.data["target_met_percentage"] == 100.0

    def test_target_met_percentage_none_met(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """0% target met when RED patient waits > 0 min."""
        # RED target is 0 min; any wait exceeds it
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="RED",
            wait_minutes=5,
        )

        response = authenticated_client.get(URL)
        assert response.data["target_met_percentage"] == 0.0

    def test_date_range_yesterday(self, authenticated_client):
        response = authenticated_client.get(URL, {"date_range": "yesterday"})
        assert response.status_code == status.HTTP_200_OK

    def test_date_range_this_month(self, authenticated_client):
        response = authenticated_client.get(URL, {"date_range": "this_month"})
        assert response.status_code == status.HTTP_200_OK

    def test_date_range_last_month(self, authenticated_client):
        response = authenticated_client.get(URL, {"date_range": "last_month"})
        assert response.status_code == status.HTTP_200_OK

    def test_date_range_this_quarter(self, authenticated_client):
        response = authenticated_client.get(URL, {"date_range": "this_quarter"})
        assert response.status_code == status.HTTP_200_OK

    def test_this_quarter_includes_current_data(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """this_quarter includes assessments created now."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
            wait_minutes=5,
        )

        response = authenticated_client.get(URL, {"date_range": "this_quarter"})
        assert response.data["total_assessments"] == 1

    def test_facility_scoping(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_county,
        sample_sub_county,
        sample_patient,
    ):
        """Assessments from other facilities are excluded."""
        from hmis.apps.core.models import Facility
        from hmis.apps.encounters.models import Encounter

        other_facility = Facility.objects.create(
            name="Other Facility",
            organization=sample_organization,
            level="HEALTH_CENTRE",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        # Create a second encounter for the other-facility assessment
        other_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Other facility visit",
            facility=other_facility,
            organization=sample_organization,
        )

        # Create assessment at the OTHER facility
        now = timezone.now()
        TriageAssessment.objects.create(
            encounter=other_encounter,
            chief_complaint="Other facility",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="RED",
            auto_calculated_category="RED",
            arrival_time=now - timedelta(hours=1),
            triage_start_time=now - timedelta(minutes=50),
            triaged_by=test_user,
            facility=other_facility,
            organization=sample_organization,
        )

        # Create assessment at the user's facility
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
            wait_minutes=5,
        )

        response = authenticated_client.get(URL, {"date_range": "last_7_days"})
        # Only the user's facility assessment should appear
        assert response.data["total_assessments"] == 1

    def test_staff_performance_structure(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Staff performance returns per-staff aggregation."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
            wait_minutes=5,
        )

        response = authenticated_client.get(URL, {"date_range": "last_7_days"})
        data = response.data

        assert len(data["staff_performance"]) == 1
        staff = data["staff_performance"][0]
        assert staff["user_id"] == test_user.id
        assert staff["assessment_count"] == 1
        assert staff["avg_wait_minutes"] == 5
        assert staff["median_wait_minutes"] == 5
        assert "name" in staff
        assert "keta_compliance_pct" in staff
        # 5 min wait for GREEN (target 240) → compliant
        assert staff["keta_compliance_pct"] == 100.0

    def test_staff_performance_multiple_staff(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_patient,
    ):
        """Staff performance correctly aggregates multiple staff members."""
        from django.contrib.auth import get_user_model

        from hmis.apps.encounters.models import Encounter

        User = get_user_model()
        other_user = User.objects.create_user(
            username="nurse2",
            password="testpass123",
            first_name="Alice",
            last_name="Nurse",
        )

        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
            wait_minutes=10,
        )

        # Create a second encounter for the second assessment
        enc2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Second visit",
            facility=sample_facility,
            organization=sample_organization,
        )
        _create_assessment(
            enc2,
            other_user,
            sample_facility,
            sample_organization,
            category="ORANGE",
            wait_minutes=15,
        )

        response = authenticated_client.get(URL, {"date_range": "last_7_days"})
        data = response.data

        assert len(data["staff_performance"]) == 2
        # Both should have 1 assessment each, sorted by count desc (equal → insertion order)
        user_ids = {s["user_id"] for s in data["staff_performance"]}
        assert test_user.id in user_ids
        assert other_user.id in user_ids

        # Check other_user: 15 min wait for ORANGE (target 10) → 0% compliance
        other_staff = next(s for s in data["staff_performance"] if s["user_id"] == other_user.id)
        assert other_staff["keta_compliance_pct"] == 0.0
        assert other_staff["name"] == "Alice Nurse"

    def test_wait_time_trend_structure(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Wait time trend returns time-bucketed data."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
            wait_minutes=5,
        )

        response = authenticated_client.get(URL, {"date_range": "last_7_days"})
        data = response.data

        assert isinstance(data["wait_time_trend"], list)
        assert len(data["wait_time_trend"]) >= 1
        entry = data["wait_time_trend"][0]
        assert "timestamp" in entry
        assert "category" in entry
        assert "avg_wait_minutes" in entry
        assert "count" in entry
        # Daily bucket for last_7_days
        assert len(entry["timestamp"]) == 10  # YYYY-MM-DD

    def test_wait_time_trend_hourly_for_today(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Trend uses hourly buckets for 'today' date range."""
        _create_assessment(
            sample_encounter,
            test_user,
            sample_facility,
            sample_organization,
            category="GREEN",
            wait_minutes=5,
        )

        response = authenticated_client.get(URL, {"date_range": "today"})
        data = response.data

        assert len(data["wait_time_trend"]) >= 1
        entry = data["wait_time_trend"][0]
        # Hourly bucket: YYYY-MM-DDTHH:00:00
        assert "T" in entry["timestamp"]
        assert entry["timestamp"].endswith(":00:00")
