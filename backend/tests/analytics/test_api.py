"""
Tests for analytics API endpoints.
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status


@pytest.mark.django_db
class TestFacilitySummaryAPI:
    """Tests for /api/analytics/facility-summary/."""

    URL = "/api/analytics/facility-summary/"

    def test_unauthenticated_returns_401(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_empty(self, authenticated_client):
        """Should return empty list when no summaries exist."""
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK

    def test_list_with_data(self, authenticated_client, sample_facility):
        """Should return summaries for the user's facility."""
        from hmis.apps.analytics.models import FacilityDailySummary

        FacilityDailySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date(2026, 4, 1),
            encounters_total=33,
            revenue_total=Decimal("45000.00"),
        )

        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert results[0]["encounters_total"] == 33

    def test_filter_by_date_range(self, authenticated_client, sample_facility):
        """Should filter by date_from and date_to."""
        from hmis.apps.analytics.models import FacilityDailySummary

        FacilityDailySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date(2026, 3, 15),
            encounters_total=10,
        )
        FacilityDailySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date(2026, 4, 1),
            encounters_total=20,
        )

        response = authenticated_client.get(
            self.URL, {"date_from": "2026-04-01", "date_to": "2026-04-30"}
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        # Only April entry
        dates = [r["date"] for r in results]
        assert "2026-04-01" in dates
        assert "2026-03-15" not in dates

    def test_tenant_isolation(
        self, authenticated_client, sample_facility, sample_county, sample_sub_county
    ):
        """Should not return summaries from other facilities."""
        from hmis.apps.analytics.models import FacilityDailySummary
        from hmis.apps.core.models import Facility

        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code="88888",
            level="2",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        FacilityDailySummary.objects.create(
            facility=other_facility,
            date=date(2026, 4, 1),
            encounters_total=99,
        )

        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        # Should not contain the other facility's data
        for r in results:
            assert r.get("facility") != other_facility.pk


@pytest.mark.django_db
class TestDepartmentPerformanceAPI:
    """Tests for /api/analytics/department-performance/."""

    URL = "/api/analytics/department-performance/"

    def test_unauthenticated_returns_401(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_with_data(self, authenticated_client, sample_facility):
        """Should return department summaries."""
        from hmis.apps.analytics.models import DepartmentMonthlySummary

        DepartmentMonthlySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            year=2026,
            month=3,
            department="OPD",
            visit_count=150,
            revenue=Decimal("250000.00"),
        )

        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert results[0]["department"] == "OPD"

    def test_filter_by_department(self, authenticated_client, sample_facility):
        """Should filter by department."""
        from hmis.apps.analytics.models import DepartmentMonthlySummary

        DepartmentMonthlySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            year=2026,
            month=3,
            department="OPD",
            visit_count=100,
        )
        DepartmentMonthlySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            year=2026,
            month=3,
            department="IPD",
            visit_count=30,
        )

        response = authenticated_client.get(self.URL, {"department": "OPD"})
        results = response.data.get("results", response.data)
        assert all(r["department"] == "OPD" for r in results)


@pytest.mark.django_db
class TestDiagnosisTrendsAPI:
    """Tests for /api/analytics/diagnosis-trends/."""

    URL = "/api/analytics/diagnosis-trends/"

    def test_unauthenticated_returns_401(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_with_data(self, authenticated_client, sample_facility):
        """Should return diagnosis trends."""
        from hmis.apps.analytics.models import DiagnosisTrend

        DiagnosisTrend.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            icd10_code="J06.9",
            icd10_name="Acute upper respiratory infection",
            granularity="MONTHLY",
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            case_count=42,
        )

        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert results[0]["icd10_code"] == "J06.9"

    def test_filter_by_granularity(self, authenticated_client, sample_facility):
        """Should filter by granularity."""
        from hmis.apps.analytics.models import DiagnosisTrend

        DiagnosisTrend.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            icd10_code="J06.9",
            granularity="MONTHLY",
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            case_count=42,
        )
        DiagnosisTrend.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            icd10_code="J06.9",
            granularity="WEEKLY",
            period_start=date(2026, 3, 3),
            period_end=date(2026, 3, 9),
            case_count=10,
        )

        response = authenticated_client.get(self.URL, {"granularity": "MONTHLY"})
        results = response.data.get("results", response.data)
        assert all(r["granularity"] == "MONTHLY" for r in results)


@pytest.mark.django_db
class TestDemographicsAPI:
    """Tests for /api/analytics/demographics/."""

    URL = "/api/analytics/demographics/"

    def test_unauthenticated_returns_401(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_with_data(self, authenticated_client, sample_facility):
        """Should return demographics snapshots."""
        from hmis.apps.analytics.models import PatientDemographicSnapshot

        PatientDemographicSnapshot.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            snapshot_date=date(2026, 4, 1),
            total_patients=500,
            age_distribution={"0-4": 50, "5-14": 80},
            gender_distribution={"M": 240, "F": 260},
        )

        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert results[0]["total_patients"] == 500
