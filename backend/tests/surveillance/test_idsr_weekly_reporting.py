"""
Unit tests for IDSR Weekly Reporting.

Tests for IDSRWeeklyReport model, IDSRDiseaseSummary model,
IDSRReportingService, Celery tasks, and API endpoints.

Target: 20+ unit tests as per DHA compliance roadmap.
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# ============================================================================
# IDSRWeeklyReport Model Tests
# ============================================================================


class TestIDSRWeeklyReportModel:
    """Tests for IDSRWeeklyReport model."""

    def test_create_idsr_weekly_report(self, db, sample_county):
        """Should create an IDSR weekly report with valid data."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_code="MFL001",
            facility_name="Test Health Facility",
            county=sample_county,
            total_cases=10,
            total_deaths=1,
        )

        assert report.id is not None
        assert report.epi_year == 2026
        assert report.epi_week == 8
        assert report.status == "DRAFT"

    def test_week_label_property(self, db, sample_county):
        """Should return formatted week label."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
        )

        assert report.week_label == "W08 2026"

    def test_is_submitted_property(self, db):
        """Should return True when status is SUBMITTED."""
        from hmis.apps.surveillance.models import IDSRReportStatus, IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            status=IDSRReportStatus.SUBMITTED,
        )

        assert report.is_submitted is True

    def test_can_edit_property(self, db):
        """Should return True for DRAFT and PENDING_REVIEW statuses."""
        from hmis.apps.surveillance.models import IDSRReportStatus, IDSRWeeklyReport

        draft_report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=7,
            week_start_date=date(2026, 2, 9),
            week_end_date=date(2026, 2, 15),
            status=IDSRReportStatus.DRAFT,
        )
        submitted_report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=6,
            week_start_date=date(2026, 2, 2),
            week_end_date=date(2026, 2, 8),
            status=IDSRReportStatus.SUBMITTED,
        )

        assert draft_report.can_edit is True
        assert submitted_report.can_edit is False

    def test_approve_method(self, db, test_user):
        """Should update status and approval fields."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
        )

        report.approve(test_user)
        report.refresh_from_db()

        assert report.status == "APPROVED"
        assert report.approved_by == test_user
        assert report.approved_at is not None

    def test_mark_submitted_method(self, db):
        """Should update status and DHIS2 fields."""
        from hmis.apps.surveillance.models import IDSRReportStatus, IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            status=IDSRReportStatus.APPROVED,
        )

        dhis2_response = {"status": "SUCCESS", "importSummary": {"imported": 5}}
        report.mark_submitted(dhis2_response)
        report.refresh_from_db()

        assert report.status == "SUBMITTED"
        assert report.dhis2_submitted_at is not None
        assert report.dhis2_response == dhis2_response

    def test_unique_constraint(self, db):
        """Should prevent duplicate reports for same week/facility."""
        from django.db import IntegrityError

        from hmis.apps.surveillance.models import IDSRWeeklyReport

        IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_code="MFL001",
        )

        with pytest.raises(IntegrityError):
            IDSRWeeklyReport.objects.create(
                epi_year=2026,
                epi_week=8,
                week_start_date=date(2026, 2, 16),
                week_end_date=date(2026, 2, 22),
                facility_code="MFL001",
            )


# ============================================================================
# IDSRDiseaseSummary Model Tests
# ============================================================================


class TestIDSRDiseaseSummaryModel:
    """Tests for IDSRDiseaseSummary model."""

    @pytest.fixture
    def sample_idsr_report(self, db):
        """Create sample IDSR report."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        return IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
        )

    @pytest.fixture
    def sample_disease(self, db):
        """Create sample notifiable disease."""
        from hmis.apps.surveillance.models import NotifiableDisease

        return NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00,A00.0,A00.1,A00.9",
            category="IMMEDIATE",
            reporting_hours=24,
        )

    def test_create_disease_summary(self, sample_idsr_report, sample_disease):
        """Should create disease summary with valid data."""
        from hmis.apps.surveillance.models import IDSRDiseaseSummary

        summary = IDSRDiseaseSummary.objects.create(
            report=sample_idsr_report,
            disease=sample_disease,
            cases_under_5=3,
            cases_5_and_above=7,
            deaths_under_5=1,
            deaths_5_and_above=0,
            lab_confirmed=5,
        )

        assert summary.id is not None
        assert summary.report == sample_idsr_report
        assert summary.disease == sample_disease

    def test_auto_calculate_totals(self, sample_idsr_report, sample_disease):
        """Should auto-calculate total_cases and total_deaths on save."""
        from hmis.apps.surveillance.models import IDSRDiseaseSummary

        summary = IDSRDiseaseSummary.objects.create(
            report=sample_idsr_report,
            disease=sample_disease,
            cases_under_5=3,
            cases_5_and_above=7,
            deaths_under_5=1,
            deaths_5_and_above=2,
        )

        assert summary.total_cases == 10
        assert summary.total_deaths == 3

    def test_case_fatality_rate_calculation(self, sample_idsr_report, sample_disease):
        """Should calculate CFR as deaths/cases * 100."""
        from hmis.apps.surveillance.models import IDSRDiseaseSummary

        summary = IDSRDiseaseSummary.objects.create(
            report=sample_idsr_report,
            disease=sample_disease,
            cases_under_5=5,
            cases_5_and_above=5,
            deaths_under_5=1,
            deaths_5_and_above=1,
        )

        # CFR = 2/10 * 100 = 20%
        assert summary.case_fatality_rate == Decimal("20.00")

    def test_cfr_none_when_no_deaths(self, sample_idsr_report, sample_disease):
        """Should return None CFR when no deaths."""
        from hmis.apps.surveillance.models import IDSRDiseaseSummary

        summary = IDSRDiseaseSummary.objects.create(
            report=sample_idsr_report,
            disease=sample_disease,
            cases_under_5=5,
            cases_5_and_above=5,
            deaths_under_5=0,
            deaths_5_and_above=0,
        )

        assert summary.case_fatality_rate is None

    def test_unique_constraint_per_report_disease(self, sample_idsr_report, sample_disease):
        """Should prevent duplicate disease entries in same report."""
        from django.db import IntegrityError

        from hmis.apps.surveillance.models import IDSRDiseaseSummary

        IDSRDiseaseSummary.objects.create(
            report=sample_idsr_report,
            disease=sample_disease,
            cases_under_5=5,
            cases_5_and_above=5,
        )

        with pytest.raises(IntegrityError):
            IDSRDiseaseSummary.objects.create(
                report=sample_idsr_report,
                disease=sample_disease,
                cases_under_5=2,
                cases_5_and_above=3,
            )


# ============================================================================
# IDSRReportingService Tests
# ============================================================================


class TestIDSRReportingService:
    """Tests for IDSRReportingService."""

    def test_get_epi_week(self, db):
        """Should return correct epidemiological week."""
        from hmis.apps.surveillance.services import IDSRReportingService

        # February 22, 2026 is a Sunday in week 8
        test_date = date(2026, 2, 22)
        epi_year, epi_week, week_start, week_end = IDSRReportingService.get_epi_week(test_date)

        assert epi_year == 2026
        assert epi_week == 8
        assert week_start.weekday() == 0  # Monday
        assert week_end.weekday() == 6  # Sunday

    def test_get_previous_epi_week(self, db):
        """Should return previous epidemiological week."""
        from hmis.apps.surveillance.services import IDSRReportingService

        # February 22, 2026 is Sunday of week 8
        test_date = date(2026, 2, 22)
        epi_year, epi_week, week_start, week_end = IDSRReportingService.get_previous_epi_week(
            test_date
        )

        assert epi_year == 2026
        assert epi_week == 7

    def test_generate_weekly_report_creates_report(self, db, sample_county):
        """Should create a new IDSR weekly report."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport
        from hmis.apps.surveillance.services import IDSRReportingService

        report = IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility_code="MFL001",
            facility_name="Test Facility",
            county=sample_county,
        )

        assert report.id is not None
        assert report.epi_year == 2026
        assert report.epi_week == 8
        assert IDSRWeeklyReport.objects.count() == 1

    def test_generate_weekly_report_updates_existing(self, db, sample_county):
        """Should update existing report for same week."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport
        from hmis.apps.surveillance.services import IDSRReportingService

        # Create first report
        IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility_code="MFL001",
            facility_name="Old Name",
        )

        # Regenerate - should update, not create new
        report = IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility_code="MFL001",
            facility_name="New Name",
        )

        assert IDSRWeeklyReport.objects.count() == 1
        assert report.facility_name == "New Name"

    def test_generate_weekly_report_aggregates_cases(
        self, db, sample_county, sample_patient, sample_encounter
    ):
        """Should aggregate notifiable cases into report."""
        from hmis.apps.surveillance.models import NotifiableCase, NotifiableDisease
        from hmis.apps.surveillance.services import IDSRReportingService

        # Create disease and case
        disease = NotifiableDisease.objects.create(
            name="Measles",
            icd10_codes="B05",
            category="IMMEDIATE",
            reporting_hours=24,
        )

        NotifiableCase.objects.create(
            disease=disease,
            patient=sample_patient,
            encounter=sample_encounter,
            county=sample_county,
            detected_at=timezone.make_aware(timezone.datetime(2026, 2, 18, 10, 0, 0)),
        )

        report = IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            county=sample_county,
        )

        assert report.total_cases == 1
        assert report.disease_summaries.count() == 1

    def test_prepare_dhis2_payload(self, db, settings):
        """Should prepare valid DHIS2 payload."""
        from hmis.apps.surveillance.models import (
            IDSRDiseaseSummary,
            IDSRWeeklyReport,
            NotifiableDisease,
        )
        from hmis.apps.surveillance.services import IDSRReportingService

        # Override DHIS2_ORG_UNIT to test fallback behavior
        settings.DHIS2_ORG_UNIT = ""  # Empty = use facility_code fallback

        disease = NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00",
            category="IMMEDIATE",
        )

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_code="MFL001",
        )

        IDSRDiseaseSummary.objects.create(
            report=report,
            disease=disease,
            cases_under_5=3,
            cases_5_and_above=7,
        )

        payload = IDSRReportingService.prepare_dhis2_payload(report)

        assert "dataValues" in payload
        assert payload["period"] == "2026W08"
        # When DHIS2_ORG_UNIT not set, falls back to facility_code
        assert payload["orgUnit"] == "MFL001"
        assert len(payload["dataValues"]) > 0

    def test_calculate_age(self, db):
        """Should calculate age correctly."""
        from hmis.apps.surveillance.services import IDSRReportingService

        dob = date(2022, 6, 15)
        ref_date = date(2026, 2, 20)

        age = IDSRReportingService._calculate_age(dob, ref_date)
        assert age == 3

        # Before birthday in year
        age2 = IDSRReportingService._calculate_age(dob, date(2026, 2, 1))
        assert age2 == 3

    def test_calculate_age_none_dob(self, db):
        """Should return 0 for None DOB."""
        from hmis.apps.surveillance.services import IDSRReportingService

        age = IDSRReportingService._calculate_age(None, date(2026, 2, 20))
        assert age == 0


# ============================================================================
# Celery Tasks Tests
# ============================================================================


class TestIDSRCeleryTasks:
    """Tests for IDSR Celery tasks."""

    @patch("hmis.apps.surveillance.services.IDSRReportingService.generate_previous_week_report")
    def test_generate_idsr_weekly_report_task(self, mock_generate, db):
        """Should call service to generate report."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport
        from hmis.apps.surveillance.tasks import generate_idsr_weekly_report

        # Mock return value
        mock_report = MagicMock()
        mock_report.id = 1
        mock_report.epi_year = 2026
        mock_report.epi_week = 7
        mock_report.total_cases = 5
        mock_report.total_deaths = 0
        mock_report.status = "DRAFT"
        mock_report.disease_summaries.count.return_value = 2
        mock_generate.return_value = mock_report

        result = generate_idsr_weekly_report()

        mock_generate.assert_called_once()
        assert result["report_id"] == 1
        assert result["epi_week"] == 7

    @patch("hmis.apps.surveillance.services.SurveillanceService.check_overdue_cases")
    def test_check_overdue_notifications_task(self, mock_check, db):
        """Should check for overdue notifications."""
        from hmis.apps.surveillance.tasks import check_overdue_notifications

        mock_check.return_value = []

        result = check_overdue_notifications()

        mock_check.assert_called_once()
        assert result["overdue_count"] == 0


# ============================================================================
# API Endpoints Tests
# ============================================================================


class TestIDSRAPIEndpoints:
    """Tests for IDSR Weekly Report API endpoints."""

    def test_list_idsr_reports(self, authenticated_client, db):
        """Should list IDSR reports."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
        )

        response = authenticated_client.get("/api/surveillance/idsr/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_retrieve_idsr_report(self, authenticated_client, db):
        """Should retrieve single IDSR report with disease summaries."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
        )

        response = authenticated_client.get(f"/api/surveillance/idsr/{report.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["epi_week"] == 8
        assert "disease_summaries" in response.data

    def test_generate_idsr_report_endpoint(self, authenticated_client, db):
        """Should generate new IDSR report via API."""
        response = authenticated_client.post("/api/surveillance/idsr/generate/", {})

        assert response.status_code == status.HTTP_201_CREATED
        assert "epi_week" in response.data

    def test_generate_idsr_report_with_specific_week(self, authenticated_client, db):
        """Should generate report for specific week."""
        response = authenticated_client.post(
            "/api/surveillance/idsr/generate/",
            {"epi_year": 2026, "epi_week": 5},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["epi_week"] == 5

    def test_generate_idsr_report_validation(self, authenticated_client, db):
        """Should require both year and week if one is provided."""
        response = authenticated_client.post(
            "/api/surveillance/idsr/generate/",
            {"epi_year": 2026},  # Missing epi_week
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_approve_idsr_report(self, authenticated_client, db):
        """Should approve IDSR report."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            status="DRAFT",
        )

        response = authenticated_client.post(
            f"/api/surveillance/idsr/{report.id}/approve/",
            {"notes": "Reviewed and approved"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "APPROVED"

    def test_approve_already_submitted_fails(self, authenticated_client, db):
        """Should not approve already submitted report."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            status="SUBMITTED",
        )

        response = authenticated_client.post(f"/api/surveillance/idsr/{report.id}/approve/", {})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_idsr_dashboard_endpoint(self, authenticated_client, db):
        """Should return IDSR dashboard statistics."""
        response = authenticated_client.get("/api/surveillance/idsr/dashboard/")

        assert response.status_code == status.HTTP_200_OK
        assert "current_week" in response.data
        assert "previous_weeks" in response.data
        assert "total_reports_this_year" in response.data

    def test_dhis2_preview_endpoint(self, authenticated_client, db):
        """Should return DHIS2 payload preview."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_code="MFL001",
        )

        response = authenticated_client.get(f"/api/surveillance/idsr/{report.id}/dhis2_preview/")

        assert response.status_code == status.HTTP_200_OK
        assert "payload" in response.data
        assert response.data["payload"]["period"] == "2026W08"

    def test_filter_by_status(self, authenticated_client, db):
        """Should filter reports by status."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            status="DRAFT",
            facility_code="MFL001",
        )
        IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=7,
            week_start_date=date(2026, 2, 9),
            week_end_date=date(2026, 2, 15),
            status="SUBMITTED",
            facility_code="MFL002",
        )

        response = authenticated_client.get("/api/surveillance/idsr/?status=DRAFT")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["status"] == "DRAFT"


# ============================================================================
# Serializer Tests
# ============================================================================


class TestIDSRSerializers:
    """Tests for IDSR serializers."""

    def test_idsr_weekly_report_serializer(self, db):
        """Should serialize IDSR report correctly."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport
        from hmis.apps.surveillance.serializers import IDSRWeeklyReportSerializer

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            total_cases=10,
        )

        serializer = IDSRWeeklyReportSerializer(report)
        data = serializer.data

        assert data["epi_week"] == 8
        assert data["week_label"] == "W08 2026"
        assert data["total_cases"] == 10
        assert "disease_summaries" in data

    def test_idsr_disease_summary_serializer(self, db):
        """Should serialize disease summary correctly."""
        from hmis.apps.surveillance.models import (
            IDSRDiseaseSummary,
            IDSRWeeklyReport,
            NotifiableDisease,
        )
        from hmis.apps.surveillance.serializers import IDSRDiseaseSummarySerializer

        disease = NotifiableDisease.objects.create(
            name="Typhoid",
            icd10_codes="A01",
            category="WEEKLY",
        )

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
        )

        summary = IDSRDiseaseSummary.objects.create(
            report=report,
            disease=disease,
            cases_under_5=2,
            cases_5_and_above=8,
        )

        serializer = IDSRDiseaseSummarySerializer(summary)
        data = serializer.data

        assert data["disease_name"] == "Typhoid"
        assert data["total_cases"] == 10
        assert data["cases_under_5"] == 2

    def test_generate_serializer_validation(self, db):
        """Should validate generate serializer correctly."""
        from hmis.apps.surveillance.serializers import IDSRReportGenerateSerializer

        # Both provided - valid
        serializer = IDSRReportGenerateSerializer(data={"epi_year": 2026, "epi_week": 8})
        assert serializer.is_valid()

        # Neither provided - valid
        serializer = IDSRReportGenerateSerializer(data={})
        assert serializer.is_valid()

        # Only one provided - invalid
        serializer = IDSRReportGenerateSerializer(data={"epi_year": 2026})
        assert not serializer.is_valid()
