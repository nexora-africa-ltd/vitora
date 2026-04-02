"""Tests for Quality Measures & Reporting (Sprint 2.C).

Tests cover:
- QuarterlyReport model & aggregation (Item 20)
- AnnualReport model & aggregation (Item 20)
- Celery tasks for quarterly/annual generation (Item 20)
- QualityMeasure CRUD (Item 21)
- QualityMeasureResult calculation (Item 21)
- Quality dashboard endpoint (Item 21)
- Quality measure import/export (Item 22)
- Seed command (Item 21)
- API endpoint authentication (all)
"""

from __future__ import annotations

import json
from decimal import Decimal
from io import BytesIO

import pytest  # type: ignore
from django.core.management import call_command
from rest_framework import status

from hmis.apps.clinics.models import Clinic, MonthlyClinicReport
from hmis.apps.quality.models import (
    AnnualReport,
    QualityMeasure,
    QualityMeasureResult,
    QuarterlyReport,
)
from hmis.apps.quality.services.import_export import (
    export_measures_to_csv,
    export_measures_to_json,
    export_measures_to_qrda,
    import_measures_from_csv,
    import_measures_from_json,
)
from hmis.apps.quality.services.reporting import (
    generate_all_annual_reports,
    generate_all_quarterly_reports,
    generate_annual_report,
    generate_quarterly_report,
)
from hmis.apps.quality.tasks import (
    generate_annual_reports_task,
    generate_quarterly_reports_task,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sample_clinic(db, sample_facility, sample_organization):
    """Create a sample clinic for report tests."""
    return Clinic.objects.create(
        name="General OPD",
        clinic_type="GENERAL_OPD",
        code="GEN001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def second_clinic(db, sample_facility, sample_organization):
    """Create a second clinic for multi-clinic tests."""
    return Clinic.objects.create(
        name="CCC Clinic",
        clinic_type="CCC",
        code="CCC001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def monthly_reports_q1(db, sample_clinic):
    """Create 3 monthly reports for Q1 (Jan, Feb, Mar)."""
    reports = []
    for month in [1, 2, 3]:
        reports.append(
            MonthlyClinicReport.objects.create(
                clinic=sample_clinic,
                year=2026,
                month=month,
                total_visits=100,
                new_visits=40,
                revisits=60,
                priority_red=5,
                priority_orange=10,
                priority_yellow=15,
                priority_green=50,
                priority_blue=20,
                male_visits=45,
                female_visits=55,
                under_5_visits=10,
                under_18_visits=20,
                adult_visits=60,
                over_60_visits=10,
                new_enrollments=5,
                active_enrollments=50,
                defaulters=3,
                anc_first_visits=8,
                anc_revisits=12,
                deliveries=4,
                total_revenue=Decimal("50000.00"),
                sha_claims_amount=Decimal("20000.00"),
                cash_amount=Decimal("30000.00"),
            )
        )
    return reports


@pytest.fixture
def sample_quality_measure(db):
    """Create a sample quality measure."""
    return QualityMeasure.objects.create(
        code="KE-TEST-001",
        name="Test Quality Measure",
        description="A measure for testing purposes.",
        domain="CLINICAL",
        status="ACTIVE",
        numerator_logic="Patients with positive outcome",
        denominator_logic="All patients in the reporting period",
        target_percentage=Decimal("80.00"),
        low_threshold=Decimal("50.00"),
        reporting_period="QUARTERLY",
    )


@pytest.fixture
def quality_measure_data():
    """Return valid data for creating a quality measure via API."""
    return {
        "code": "KE-API-001",
        "name": "API Test Measure",
        "description": "Created via API",
        "domain": "CLINICAL",
        "status": "DRAFT",
        "numerator_logic": "Test numerator",
        "denominator_logic": "Test denominator",
        "exclusion_logic": "",
        "target_percentage": "75.00",
        "low_threshold": "40.00",
        "reporting_period": "QUARTERLY",
        "dhis2_indicator_id": "",
        "reference_url": "",
        "applicable_clinic_types": [],
    }


# =============================================================================
# QuarterlyReport Model Tests (Item 20)
# =============================================================================


class TestQuarterlyReportModel:
    """Tests for QuarterlyReport model."""

    def test_create_quarterly_report(self, sample_clinic):
        """Should create a quarterly report."""
        report = QuarterlyReport.objects.create(
            clinic=sample_clinic,
            year=2026,
            quarter=1,
            total_visits=300,
        )
        assert report.id is not None
        assert report.quarter_display == "Q1"
        assert report.months == [1, 2, 3]

    def test_quarterly_report_str(self, sample_clinic):
        """Should return readable string representation."""
        report = QuarterlyReport.objects.create(
            clinic=sample_clinic, year=2026, quarter=2
        )
        assert str(report) == "General OPD - 2026 Q2"

    def test_quarterly_report_unique_constraint(self, sample_clinic):
        """Should enforce unique_together on clinic, year, quarter."""
        QuarterlyReport.objects.create(
            clinic=sample_clinic, year=2026, quarter=1
        )
        with pytest.raises(Exception):
            QuarterlyReport.objects.create(
                clinic=sample_clinic, year=2026, quarter=1
            )

    def test_quarter_months_q1(self, sample_clinic):
        report = QuarterlyReport(clinic=sample_clinic, year=2026, quarter=1)
        assert report.months == [1, 2, 3]

    def test_quarter_months_q2(self, sample_clinic):
        report = QuarterlyReport(clinic=sample_clinic, year=2026, quarter=2)
        assert report.months == [4, 5, 6]

    def test_quarter_months_q3(self, sample_clinic):
        report = QuarterlyReport(clinic=sample_clinic, year=2026, quarter=3)
        assert report.months == [7, 8, 9]

    def test_quarter_months_q4(self, sample_clinic):
        report = QuarterlyReport(clinic=sample_clinic, year=2026, quarter=4)
        assert report.months == [10, 11, 12]


# =============================================================================
# AnnualReport Model Tests (Item 20)
# =============================================================================


class TestAnnualReportModel:
    """Tests for AnnualReport model."""

    def test_create_annual_report(self, sample_clinic):
        """Should create an annual report."""
        report = AnnualReport.objects.create(
            clinic=sample_clinic,
            year=2026,
            total_visits=1200,
        )
        assert report.id is not None
        assert str(report) == "General OPD - 2026"

    def test_annual_report_unique_constraint(self, sample_clinic):
        """Should enforce unique_together on clinic, year."""
        AnnualReport.objects.create(clinic=sample_clinic, year=2026)
        with pytest.raises(Exception):
            AnnualReport.objects.create(clinic=sample_clinic, year=2026)


# =============================================================================
# Reporting Service Tests (Item 20)
# =============================================================================


class TestReportingService:
    """Tests for quarterly/annual report generation service."""

    def test_generate_quarterly_report_aggregates_months(
        self, sample_clinic, monthly_reports_q1
    ):
        """Should aggregate 3 monthly reports into quarterly report."""
        report = generate_quarterly_report(sample_clinic, 2026, 1)

        assert report.total_visits == 300  # 100 * 3
        assert report.new_visits == 120  # 40 * 3
        assert report.revisits == 180  # 60 * 3
        assert report.male_visits == 135  # 45 * 3
        assert report.female_visits == 165  # 55 * 3
        assert report.total_revenue == Decimal("150000.00")
        assert report.sha_claims_amount == Decimal("60000.00")
        assert report.cash_amount == Decimal("90000.00")
        assert report.monthly_reports.count() == 3

    def test_generate_quarterly_report_empty_quarter(self, sample_clinic):
        """Should create report with zeros when no monthly reports exist."""
        report = generate_quarterly_report(sample_clinic, 2026, 2)

        assert report.total_visits == 0
        assert report.total_revenue == Decimal("0.00")
        assert report.monthly_reports.count() == 0

    def test_generate_quarterly_report_updates_existing(
        self, sample_clinic, monthly_reports_q1
    ):
        """Should update existing quarterly report on re-generation."""
        report1 = generate_quarterly_report(sample_clinic, 2026, 1)
        report2 = generate_quarterly_report(sample_clinic, 2026, 1)

        assert report1.id == report2.id
        assert QuarterlyReport.objects.filter(
            clinic=sample_clinic, year=2026, quarter=1
        ).count() == 1

    def test_generate_all_quarterly_reports(
        self, sample_clinic, second_clinic, monthly_reports_q1
    ):
        """Should generate reports for all clinics."""
        reports = generate_all_quarterly_reports(2026, 1)
        assert len(reports) >= 2  # At least our 2 test clinics

    def test_generate_annual_report_from_quarterly(
        self, sample_clinic, monthly_reports_q1
    ):
        """Should aggregate quarterly reports into annual report."""
        # First generate quarterly report
        generate_quarterly_report(sample_clinic, 2026, 1)

        report = generate_annual_report(sample_clinic, 2026)

        assert report.total_visits == 300  # Only Q1 exists
        assert report.quarterly_reports.count() == 1

    def test_generate_annual_report_fallback_to_monthly(
        self, sample_clinic, monthly_reports_q1
    ):
        """Should fallback to monthly reports if no quarterly exist."""
        # Don't generate quarterly reports first
        report = generate_annual_report(sample_clinic, 2026)

        assert report.total_visits == 300  # Direct from monthly
        assert report.quarterly_reports.count() == 0

    def test_generate_annual_report_updates_existing(self, sample_clinic):
        """Should update existing annual report on re-generation."""
        report1 = generate_annual_report(sample_clinic, 2026)
        report2 = generate_annual_report(sample_clinic, 2026)

        assert report1.id == report2.id

    def test_generate_all_annual_reports(self, sample_clinic, second_clinic):
        """Should generate reports for all clinics."""
        reports = generate_all_annual_reports(2026)
        assert len(reports) >= 2  # At least our 2 test clinics

    def test_generate_quarterly_report_with_user(
        self, sample_clinic, monthly_reports_q1, test_user
    ):
        """Should set generated_by to the provided user."""
        report = generate_quarterly_report(
            sample_clinic, 2026, 1, user=test_user
        )
        assert report.generated_by == test_user


# =============================================================================
# Celery Tasks Tests (Item 20)
# =============================================================================


class TestCeleryTasks:
    """Tests for Celery tasks."""

    def test_quarterly_task_with_explicit_params(
        self, sample_clinic, monthly_reports_q1
    ):
        """Should generate quarterly reports with explicit year/quarter."""
        count = generate_quarterly_reports_task(year=2026, quarter=1)
        assert count >= 1
        assert QuarterlyReport.objects.filter(year=2026, quarter=1).exists()

    def test_annual_task_with_explicit_params(self, sample_clinic):
        """Should generate annual reports with explicit year."""
        count = generate_annual_reports_task(year=2025)
        assert count >= 1
        assert AnnualReport.objects.filter(year=2025).exists()

    def test_quarterly_task_default_previous_quarter(self, sample_clinic):
        """Should default to previous quarter when no params given."""
        count = generate_quarterly_reports_task()
        assert count >= 1


# =============================================================================
# QualityMeasure Model Tests (Item 21)
# =============================================================================


class TestQualityMeasureModel:
    """Tests for QualityMeasure model."""

    def test_create_quality_measure(self, sample_quality_measure):
        """Should create a quality measure."""
        assert sample_quality_measure.id is not None
        assert sample_quality_measure.code == "KE-TEST-001"

    def test_quality_measure_str(self, sample_quality_measure):
        """Should return readable string."""
        assert str(sample_quality_measure) == "KE-TEST-001: Test Quality Measure"

    def test_quality_measure_unique_code(self, sample_quality_measure):
        """Should enforce unique code."""
        with pytest.raises(Exception):
            QualityMeasure.objects.create(
                code="KE-TEST-001",
                name="Duplicate",
                numerator_logic="n",
                denominator_logic="d",
            )


# =============================================================================
# QualityMeasureResult Model Tests (Item 21)
# =============================================================================


class TestQualityMeasureResultModel:
    """Tests for QualityMeasureResult model."""

    def test_auto_calculate_percentage(self, sample_quality_measure, sample_clinic):
        """Should auto-calculate percentage on save."""
        result = QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=80,
            denominator=100,
        )
        assert result.percentage == Decimal("80.00")

    def test_auto_calculate_meets_target(self, sample_quality_measure, sample_clinic):
        """Should auto-determine meets_target based on target_percentage."""
        result = QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=85,
            denominator=100,
        )
        assert result.meets_target is True  # 85% >= 80% target

    def test_below_target(self, sample_quality_measure, sample_clinic):
        """Should set meets_target=False when below target."""
        result = QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=50,
            denominator=100,
        )
        assert result.meets_target is False  # 50% < 80% target

    def test_zero_denominator(self, sample_quality_measure, sample_clinic):
        """Should handle zero denominator gracefully."""
        result = QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=0,
            denominator=0,
        )
        assert result.percentage == Decimal("0.00")
        assert result.meets_target is False

    def test_unique_constraint(self, sample_quality_measure, sample_clinic):
        """Should enforce unique_together constraint."""
        QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=80,
            denominator=100,
        )
        with pytest.raises(Exception):
            QualityMeasureResult.objects.create(
                measure=sample_quality_measure,
                clinic=sample_clinic,
                year=2026,
                period=1,
                period_type="QUARTERLY",
                numerator=90,
                denominator=100,
            )


# =============================================================================
# Import/Export Service Tests (Item 22)
# =============================================================================


class TestImportExportService:
    """Tests for quality measure import/export."""

    def test_import_json(self):
        """Should import measures from JSON data."""
        data = [
            {
                "code": "IMP-001",
                "name": "Imported Measure 1",
                "domain": "CLINICAL",
                "numerator_logic": "test numerator",
                "denominator_logic": "test denominator",
                "target_percentage": 80,
            },
            {
                "code": "IMP-002",
                "name": "Imported Measure 2",
                "domain": "EFFICIENCY",
                "numerator_logic": "test numerator 2",
                "denominator_logic": "test denominator 2",
            },
        ]
        result = import_measures_from_json(data)
        assert result["created"] == 2
        assert result["updated"] == 0
        assert QualityMeasure.objects.filter(code="IMP-001").exists()

    def test_import_json_updates_existing(self, sample_quality_measure):
        """Should update existing measures by code."""
        data = [
            {
                "code": "KE-TEST-001",
                "name": "Updated Name",
                "numerator_logic": "updated",
                "denominator_logic": "updated",
            }
        ]
        result = import_measures_from_json(data)
        assert result["created"] == 0
        assert result["updated"] == 1

        sample_quality_measure.refresh_from_db()
        assert sample_quality_measure.name == "Updated Name"

    def test_import_csv(self):
        """Should import measures from CSV content."""
        csv_content = (
            "code,name,description,domain,status,numerator_logic,denominator_logic,"
            "exclusion_logic,target_percentage,low_threshold,reporting_period,"
            "dhis2_indicator_id,reference_url,applicable_clinic_types\n"
            "CSV-001,CSV Measure,desc,CLINICAL,DRAFT,num,den,,80,50,QUARTERLY,,,[]"
        )
        result = import_measures_from_csv(csv_content)
        assert result["created"] == 1
        assert QualityMeasure.objects.filter(code="CSV-001").exists()

    def test_import_skips_empty_code(self):
        """Should skip items without a code."""
        data = [{"name": "No code", "numerator_logic": "n", "denominator_logic": "d"}]
        result = import_measures_from_json(data)
        assert result["created"] == 0

    def test_export_json(self, sample_quality_measure):
        """Should export measures as JSON."""
        data = export_measures_to_json()
        assert len(data) >= 1
        exported = next(d for d in data if d["code"] == "KE-TEST-001")
        assert exported["name"] == "Test Quality Measure"
        assert exported["domain"] == "CLINICAL"

    def test_export_csv(self, sample_quality_measure):
        """Should export measures as CSV string."""
        csv_output = export_measures_to_csv()
        assert "KE-TEST-001" in csv_output
        assert "Test Quality Measure" in csv_output

    def test_export_qrda(self, sample_quality_measure):
        """Should export measures in QRDA-style format."""
        data = export_measures_to_qrda()
        assert data["document_type"] == "quality_measure_set"
        assert data["version"] == "1.0"
        assert len(data["measures"]) >= 1

        m = data["measures"][0]
        assert "identifier" in m
        assert "population_criteria" in m
        assert "numerator" in m["population_criteria"]
        assert "denominator" in m["population_criteria"]

    def test_export_empty(self):
        """Should handle empty export gracefully."""
        data = export_measures_to_json(measures=[])
        assert data == []

        csv_output = export_measures_to_csv(measures=[])
        assert csv_output == ""


# =============================================================================
# Seed Command Tests (Item 21)
# =============================================================================


class TestSeedQualityMeasures:
    """Tests for seed_quality_measures management command."""

    def test_seed_creates_measures(self):
        """Should create Kenya-specific quality measures."""
        call_command("seed_quality_measures")
        assert QualityMeasure.objects.count() >= 12

    def test_seed_idempotent(self):
        """Should be idempotent (running twice doesn't duplicate)."""
        call_command("seed_quality_measures")
        count_1 = QualityMeasure.objects.count()

        call_command("seed_quality_measures")
        count_2 = QualityMeasure.objects.count()

        assert count_1 == count_2

    def test_seed_dry_run(self):
        """Should not create records in dry run mode."""
        call_command("seed_quality_measures", dry_run=True)
        assert QualityMeasure.objects.count() == 0

    def test_seeded_measures_are_active(self):
        """Seeded measures should have ACTIVE status."""
        call_command("seed_quality_measures")
        active_count = QualityMeasure.objects.filter(status="ACTIVE").count()
        assert active_count >= 12


# =============================================================================
# API Endpoint Tests — QuarterlyReport (Item 20)
# =============================================================================


class TestQuarterlyReportAPI:
    """Tests for quarterly report API endpoints."""

    def test_list_quarterly_reports(self, authenticated_client, sample_clinic):
        """Should list quarterly reports."""
        QuarterlyReport.objects.create(
            clinic=sample_clinic, year=2026, quarter=1, total_visits=300
        )
        response = authenticated_client.get("/api/quality/quarterly-reports/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_quarterly_report(self, authenticated_client, sample_clinic):
        """Should retrieve a specific quarterly report."""
        report = QuarterlyReport.objects.create(
            clinic=sample_clinic, year=2026, quarter=1, total_visits=300
        )
        response = authenticated_client.get(f"/api/quality/quarterly-reports/{report.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_visits"] == 300
        assert response.data["quarter_display"] == "Q1"
        assert response.data["months"] == [1, 2, 3]
        assert response.data["clinic_name"] == "General OPD"

    def test_generate_quarterly_report_endpoint(
        self, authenticated_client, sample_clinic, monthly_reports_q1
    ):
        """Should generate quarterly report via API."""
        response = authenticated_client.post(
            "/api/quality/quarterly-reports/generate/",
            {"clinic_id": sample_clinic.id, "year": 2026, "quarter": 1},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["total_visits"] == 300

    def test_generate_requires_params(self, authenticated_client):
        """Should require clinic_id, year, and quarter."""
        response = authenticated_client.post(
            "/api/quality/quarterly-reports/generate/",
            {"year": 2026},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_generate_invalid_clinic(self, authenticated_client):
        """Should return 404 for non-existent clinic."""
        response = authenticated_client.post(
            "/api/quality/quarterly-reports/generate/",
            {"clinic_id": 99999, "year": 2026, "quarter": 1},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_filter_by_year(self, authenticated_client, sample_clinic):
        """Should filter quarterly reports by year."""
        QuarterlyReport.objects.create(
            clinic=sample_clinic, year=2025, quarter=4
        )
        QuarterlyReport.objects.create(
            clinic=sample_clinic, year=2026, quarter=1
        )
        response = authenticated_client.get(
            "/api/quality/quarterly-reports/", {"year": 2026}
        )
        assert response.status_code == status.HTTP_200_OK
        assert all(r["year"] == 2026 for r in response.data["results"])

    def test_unauthenticated_request_fails(self, api_client, sample_clinic):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/quality/quarterly-reports/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# API Endpoint Tests — AnnualReport (Item 20)
# =============================================================================


class TestAnnualReportAPI:
    """Tests for annual report API endpoints."""

    def test_list_annual_reports(self, authenticated_client, sample_clinic):
        """Should list annual reports."""
        AnnualReport.objects.create(
            clinic=sample_clinic, year=2026, total_visits=1200
        )
        response = authenticated_client.get("/api/quality/annual-reports/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_annual_report(self, authenticated_client, sample_clinic):
        """Should retrieve a specific annual report."""
        report = AnnualReport.objects.create(
            clinic=sample_clinic, year=2026, total_visits=1200
        )
        response = authenticated_client.get(f"/api/quality/annual-reports/{report.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_visits"] == 1200
        assert response.data["clinic_name"] == "General OPD"

    def test_generate_annual_report_endpoint(
        self, authenticated_client, sample_clinic
    ):
        """Should generate annual report via API."""
        response = authenticated_client.post(
            "/api/quality/annual-reports/generate/",
            {"clinic_id": sample_clinic.id, "year": 2026},
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_unauthenticated_request_fails(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/quality/annual-reports/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# API Endpoint Tests — QualityMeasure (Item 21)
# =============================================================================


class TestQualityMeasureAPI:
    """Tests for quality measure CRUD API."""

    def test_list_quality_measures(self, authenticated_client, sample_quality_measure):
        """Should list quality measures."""
        response = authenticated_client.get("/api/quality/measures/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_quality_measure(
        self, authenticated_client, sample_quality_measure
    ):
        """Should retrieve a specific quality measure."""
        response = authenticated_client.get(
            f"/api/quality/measures/{sample_quality_measure.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "KE-TEST-001"
        assert response.data["domain_display"] == "Clinical Quality"
        assert response.data["status_display"] == "Active"
        assert response.data["reporting_period_display"] == "Quarterly"

    def test_create_quality_measure(
        self, authenticated_client, quality_measure_data
    ):
        """Should create a quality measure."""
        response = authenticated_client.post(
            "/api/quality/measures/", quality_measure_data, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "KE-API-001"

    def test_update_quality_measure(
        self, authenticated_client, sample_quality_measure
    ):
        """Should update a quality measure."""
        response = authenticated_client.patch(
            f"/api/quality/measures/{sample_quality_measure.id}/",
            {"name": "Updated Measure Name"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Measure Name"

    def test_delete_quality_measure(
        self, authenticated_client, sample_quality_measure
    ):
        """Should delete a quality measure."""
        response = authenticated_client.delete(
            f"/api/quality/measures/{sample_quality_measure.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_search_quality_measures(
        self, authenticated_client, sample_quality_measure
    ):
        """Should search quality measures by code/name."""
        response = authenticated_client.get(
            "/api/quality/measures/", {"search": "KE-TEST"}
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_filter_by_domain(
        self, authenticated_client, sample_quality_measure
    ):
        """Should filter measures by domain."""
        response = authenticated_client.get(
            "/api/quality/measures/", {"domain": "CLINICAL"}
        )
        assert response.status_code == status.HTTP_200_OK
        assert all(
            r["domain"] == "CLINICAL" for r in response.data["results"]
        )

    def test_unauthenticated_request_fails(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/quality/measures/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# API Endpoint Tests — QualityMeasureResult (Item 21)
# =============================================================================


class TestQualityMeasureResultAPI:
    """Tests for quality measure result API."""

    def test_create_result(
        self, authenticated_client, sample_quality_measure, sample_clinic
    ):
        """Should create a measure result and auto-calculate percentage."""
        response = authenticated_client.post(
            "/api/quality/results/",
            {
                "measure": sample_quality_measure.id,
                "clinic": sample_clinic.id,
                "year": 2026,
                "period": 1,
                "period_type": "QUARTERLY",
                "numerator": 85,
                "denominator": 100,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["percentage"] == "85.00"
        assert response.data["meets_target"] is True
        assert response.data["measure_code"] == "KE-TEST-001"
        assert response.data["measure_name"] == "Test Quality Measure"
        assert response.data["clinic_name"] == "General OPD"

    def test_list_results(
        self, authenticated_client, sample_quality_measure, sample_clinic
    ):
        """Should list measure results."""
        QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=85,
            denominator=100,
        )
        response = authenticated_client.get("/api/quality/results/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_filter_by_meets_target(
        self, authenticated_client, sample_quality_measure, sample_clinic
    ):
        """Should filter results by meets_target."""
        QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=85,
            denominator=100,
        )
        response = authenticated_client.get(
            "/api/quality/results/", {"meets_target": "true"}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_trends_endpoint(
        self, authenticated_client, sample_quality_measure, sample_clinic
    ):
        """Should return trend data for a measure."""
        for q in range(1, 5):
            QualityMeasureResult.objects.create(
                measure=sample_quality_measure,
                clinic=sample_clinic,
                year=2026,
                period=q,
                period_type="QUARTERLY",
                numerator=70 + q * 5,
                denominator=100,
            )
        response = authenticated_client.get(
            "/api/quality/results/trends/",
            {"measure_id": sample_quality_measure.id, "clinic_id": sample_clinic.id},
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 4

    def test_trends_requires_measure_id(self, authenticated_client):
        """Should require measure_id query parameter."""
        response = authenticated_client.get("/api/quality/results/trends/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# API Endpoint Tests — Import/Export (Item 22)
# =============================================================================


class TestQualityMeasureImportExportAPI:
    """Tests for quality measure import/export API endpoints."""

    def test_import_json_file(self, authenticated_client):
        """Should import measures from JSON file upload."""
        data = json.dumps([
            {
                "code": "IMPORT-001",
                "name": "Imported via API",
                "domain": "CLINICAL",
                "numerator_logic": "test",
                "denominator_logic": "test",
            }
        ])
        file = BytesIO(data.encode("utf-8"))
        file.name = "measures.json"

        response = authenticated_client.post(
            "/api/quality/measures/import/",
            {"file": file, "format": "json"},
            format="multipart",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 1
        assert QualityMeasure.objects.filter(code="IMPORT-001").exists()

    def test_import_csv_file(self, authenticated_client):
        """Should import measures from CSV file upload."""
        csv_content = (
            "code,name,description,domain,status,numerator_logic,denominator_logic,"
            "exclusion_logic,target_percentage,low_threshold,reporting_period,"
            "dhis2_indicator_id,reference_url,applicable_clinic_types\n"
            "CSVAPI-001,CSV API Measure,desc,CLINICAL,DRAFT,num,den,,80,50,QUARTERLY,,,[]"
        )
        file = BytesIO(csv_content.encode("utf-8"))
        file.name = "measures.csv"

        response = authenticated_client.post(
            "/api/quality/measures/import/",
            {"file": file, "format": "csv"},
            format="multipart",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 1

    def test_export_json(self, authenticated_client, sample_quality_measure):
        """Should export measures as JSON."""
        response = authenticated_client.post(
            "/api/quality/measures/export/",
            {"format": "json"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_export_csv(self, authenticated_client, sample_quality_measure):
        """Should export measures as CSV."""
        response = authenticated_client.post(
            "/api/quality/measures/export/",
            {"format": "csv"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "text/csv"

    def test_export_qrda(self, authenticated_client, sample_quality_measure):
        """Should export measures in QRDA format."""
        response = authenticated_client.post(
            "/api/quality/measures/export/",
            {"format": "qrda"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["document_type"] == "quality_measure_set"

    def test_export_specific_measures(
        self, authenticated_client, sample_quality_measure
    ):
        """Should export only specified measures."""
        response = authenticated_client.post(
            "/api/quality/measures/export/",
            {"format": "json", "measures": [sample_quality_measure.id]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1


# =============================================================================
# Quality Dashboard Tests (Item 21)
# =============================================================================


class TestQualityDashboard:
    """Tests for quality dashboard API."""

    def test_dashboard_empty(self, authenticated_client):
        """Should return dashboard data with zeros when no data exists."""
        response = authenticated_client.get("/api/quality/dashboard/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_measures"] == 0
        assert response.data["overall_compliance_rate"] == 0

    def test_dashboard_with_data(
        self, authenticated_client, sample_quality_measure, sample_clinic
    ):
        """Should return computed dashboard data."""
        QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=85,
            denominator=100,
        )
        response = authenticated_client.get("/api/quality/dashboard/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_measures"] >= 1
        assert response.data["active_measures"] >= 1
        assert response.data["measures_meeting_target"] >= 1
        assert len(response.data["domain_summary"]) > 0

    def test_dashboard_filter_by_year(
        self, authenticated_client, sample_quality_measure, sample_clinic
    ):
        """Should filter dashboard data by year."""
        QualityMeasureResult.objects.create(
            measure=sample_quality_measure,
            clinic=sample_clinic,
            year=2026,
            period=1,
            period_type="QUARTERLY",
            numerator=85,
            denominator=100,
        )
        response = authenticated_client.get(
            "/api/quality/dashboard/", {"year": 2026}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_dashboard_unauthenticated(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/quality/dashboard/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
