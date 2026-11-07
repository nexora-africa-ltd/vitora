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


@pytest.fixture
def other_facility(db, sample_organization, sample_county, sample_sub_county):
    """Create a second active facility for tenant-scoping assertions."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Other Test Health Centre",
        mfl_code="99997",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
        has_surveillance=True,
    )


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

    def test_unique_constraint(self, db, sample_facility):
        """Should prevent duplicate reports for same week/facility."""
        from django.db import IntegrityError

        from hmis.apps.surveillance.models import IDSRWeeklyReport

        IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=sample_facility,
        )

        with pytest.raises(IntegrityError):
            IDSRWeeklyReport.objects.create(
                epi_year=2026,
                epi_week=8,
                week_start_date=date(2026, 2, 16),
                week_end_date=date(2026, 2, 22),
                facility_ref=sample_facility,
            )

    def test_admin_exposes_authoritative_facility_scope(self):
        """IDSR administration must expose the facility FK used for report isolation."""
        from hmis.apps.surveillance.admin import IDSRWeeklyReportAdmin

        assert "facility_ref" in IDSRWeeklyReportAdmin.raw_id_fields
        assert "facility_ref" in IDSRWeeklyReportAdmin.list_filter
        assert "facility_ref__name" in IDSRWeeklyReportAdmin.search_fields


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

    def test_generate_weekly_report_creates_report(self, db, sample_facility):
        """Should create a new IDSR weekly report."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport
        from hmis.apps.surveillance.services import IDSRReportingService

        report = IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility=sample_facility,
        )

        assert report.id is not None
        assert report.epi_year == 2026
        assert report.epi_week == 8
        assert IDSRWeeklyReport.objects.count() == 1

    def test_generate_weekly_report_updates_existing(self, db, sample_facility):
        """Should update existing report for same week."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport
        from hmis.apps.surveillance.services import IDSRReportingService

        # Create first report
        IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility=sample_facility,
        )

        # Regenerate - should update, not create new
        report = IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility=sample_facility,
        )

        assert IDSRWeeklyReport.objects.count() == 1
        assert report.facility_name == sample_facility.name

    def test_generate_weekly_report_aggregates_cases(
        self, db, sample_county, sample_patient, sample_encounter, sample_facility
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
            facility=sample_facility,
            detected_at=timezone.make_aware(timezone.datetime(2026, 2, 18, 10, 0, 0)),
        )

        report = IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility=sample_facility,
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

    def test_prepare_dhis2_payload_uses_report_facility(self, db, sample_facility, settings):
        """DHIS2 payload must use the report facility rather than global configuration."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport
        from hmis.apps.surveillance.services import IDSRReportingService

        settings.DHIS2_ORG_UNIT = "GLOBAL-ORG-UNIT"
        sample_facility.dhis2_org_unit = "FACILITY-ORG-UNIT"
        sample_facility.save(update_fields=["dhis2_org_unit"])
        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=sample_facility,
        )

        payload = IDSRReportingService.prepare_dhis2_payload(report)

        assert payload["orgUnit"] == "FACILITY-ORG-UNIT"

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

    def test_submission_validation_failure_is_persisted(self, db, sample_facility):
        """Missing KHIS configuration must leave durable, inspectable failure evidence."""
        from hmis.apps.surveillance.models import (
            IDSRReportStatus,
            IDSRSubmissionAttempt,
            IDSRWeeklyReport,
        )
        from hmis.apps.surveillance.services import IDSRReportingService

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=sample_facility,
            status=IDSRReportStatus.APPROVED,
        )

        result = IDSRReportingService.submit_to_dhis2(report, trigger="automated")

        assert result["status"] == "error"
        attempt = IDSRSubmissionAttempt.objects.get(report=report)
        assert attempt.status == "VALIDATION_FAILED"
        assert attempt.validation_response["errors"]

    @patch("requests.post")
    @patch("hmis.apps.surveillance.services.IDSRReportingService.validate_dhis2_submission")
    @patch("hmis.apps.core.dhis2.resolve_dhis2_credentials")
    def test_submission_requires_successful_dhis2_import_summary(
        self, mock_credentials, mock_validate, mock_post, db, sample_facility
    ):
        """A HTTP 2xx response with a rejected DHIS2 import must not mark a report submitted."""
        from hmis.apps.core.dhis2 import DHIS2Credentials
        from hmis.apps.surveillance.models import IDSRReportStatus, IDSRWeeklyReport
        from hmis.apps.surveillance.services import IDSRReportingService

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=sample_facility,
            status=IDSRReportStatus.APPROVED,
        )
        mock_credentials.return_value = DHIS2Credentials(
            base_url="https://khis-staging.example",
            username="user",
            password="secret",
            org_unit="org",
            environment="staging",
            source="db",
        )
        mock_validate.return_value = {
            "valid": True,
            "errors": [],
            "mapping_validation": {"valid": True},
            "payload": {"dataValues": [{"value": 1}]},
        }
        dry_run = MagicMock(ok=True, status_code=200, text="{}")
        dry_run.json.return_value = {"status": "SUCCESS", "importCount": {"rejected": 0}}
        rejected = MagicMock(ok=True, status_code=200, text="{}")
        rejected.json.return_value = {"status": "ERROR", "importCount": {"rejected": 1}}
        mock_post.side_effect = [dry_run, rejected]

        IDSRReportingService.submit_to_dhis2(report)

        report.refresh_from_db()
        assert report.status == IDSRReportStatus.FAILED


# ============================================================================
# Celery Tasks Tests
# ============================================================================


class TestIDSRCeleryTasks:
    """Tests for IDSR Celery tasks."""

    def test_generate_idsr_weekly_report_task(self, db, sample_facility):
        """Should generate a separate report for each enabled surveillance facility."""
        from hmis.apps.surveillance.tasks import generate_idsr_weekly_report

        sample_facility.has_surveillance = True
        sample_facility.save(update_fields=["has_surveillance"])

        result = generate_idsr_weekly_report(epi_year=2026, epi_week=8)

        assert result["report_count"] == 1
        assert result["reports"][0]["facility_id"] == sample_facility.id
        assert result["epi_week"] == 8

    def test_automatic_submission_requires_feature_flag(self, db, sample_facility):
        """Scheduled generation must preserve review when automation is disabled."""
        from hmis.apps.core.models import FeatureFlag
        from hmis.apps.surveillance.tasks import generate_idsr_weekly_report

        sample_facility.has_surveillance = True
        sample_facility.save(update_fields=["has_surveillance"])
        FeatureFlag.objects.create(name="idsr_auto_submission", is_enabled=False)

        result = generate_idsr_weekly_report(epi_year=2026, epi_week=8)

        assert result["reports"][0]["status"] == "DRAFT"

    @patch("hmis.apps.surveillance.tasks.submit_idsr_to_dhis2.delay")
    def test_automatic_submission_is_queued_when_feature_flag_enabled(
        self, mock_submit, db, sample_facility
    ):
        """The scheduled report should queue automated submission only when explicitly enabled."""
        from hmis.apps.core.models import FeatureFlag
        from hmis.apps.surveillance.tasks import generate_idsr_weekly_report

        sample_facility.has_surveillance = True
        sample_facility.save(update_fields=["has_surveillance"])
        FeatureFlag.objects.create(name="idsr_auto_submission", is_enabled=True)

        result = generate_idsr_weekly_report(epi_year=2026, epi_week=8)

        mock_submit.assert_called_once_with(result["reports"][0]["report_id"], trigger="automated")

    @patch("hmis.apps.surveillance.services.SurveillanceService.check_overdue_cases")
    def test_check_overdue_notifications_task(self, mock_check, db):
        """Should check for overdue notifications."""
        from hmis.apps.surveillance.tasks import check_overdue_notifications

        mock_check.return_value = []

        result = check_overdue_notifications()

        mock_check.assert_called_once()
        assert result["overdue_count"] == 0


class TestIDSRFacilityScopedGeneration:
    """Tests that IDSR generation never aggregates cases across facilities."""

    @pytest.fixture
    def second_facility(self, db, sample_organization, sample_county, sample_sub_county):
        """Create a second surveillance-enabled facility in the same organization."""
        from hmis.apps.core.models import Facility

        return Facility.objects.create(
            organization=sample_organization,
            name="Second Test Health Centre",
            mfl_code="99998",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
            has_surveillance=True,
        )

    def test_weekly_reports_only_aggregate_cases_from_their_facility(
        self,
        db,
        sample_facility,
        second_facility,
        sample_patient,
        sample_encounter,
        sample_county,
    ):
        """Each facility report must exclude cases assigned to another facility."""
        from hmis.apps.surveillance.models import NotifiableCase, NotifiableDisease
        from hmis.apps.surveillance.services import IDSRReportingService

        sample_facility.has_surveillance = True
        sample_facility.save(update_fields=["has_surveillance"])
        disease_a = NotifiableDisease.objects.create(
            name="Facility A Cholera",
            icd10_codes="A00",
            category="IMMEDIATE",
        )
        disease_b = NotifiableDisease.objects.create(
            name="Facility B Measles",
            icd10_codes="B05",
            category="IMMEDIATE",
        )
        detected_at = timezone.make_aware(timezone.datetime(2026, 2, 18, 10, 0, 0))
        NotifiableCase.objects.create(
            disease=disease_a,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_facility.organization,
            county=sample_county,
            detected_at=detected_at,
        )
        NotifiableCase.objects.create(
            disease=disease_b,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=second_facility,
            organization=second_facility.organization,
            county=sample_county,
            detected_at=detected_at,
        )

        report_a = IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility=sample_facility,
        )
        report_b = IDSRReportingService.generate_weekly_report(
            epi_year=2026,
            epi_week=8,
            week_start=date(2026, 2, 16),
            week_end=date(2026, 2, 22),
            facility=second_facility,
        )

        assert report_a.facility_ref == sample_facility
        assert report_a.organization == sample_facility.organization
        assert report_a.total_cases == 1
        assert list(report_a.disease_summaries.values_list("disease__name", flat=True)) == [
            "Facility A Cholera"
        ]
        assert report_b.facility_ref == second_facility
        assert report_b.organization == second_facility.organization
        assert report_b.total_cases == 1
        assert list(report_b.disease_summaries.values_list("disease__name", flat=True)) == [
            "Facility B Measles"
        ]

    def test_scheduled_task_generates_one_report_per_enabled_facility(
        self, db, sample_facility, second_facility
    ):
        """The weekly task must run generation separately for each active surveillance facility."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport
        from hmis.apps.surveillance.tasks import generate_idsr_weekly_report

        sample_facility.has_surveillance = True
        sample_facility.save(update_fields=["has_surveillance"])

        result = generate_idsr_weekly_report(epi_year=2026, epi_week=8)

        assert result["report_count"] == 2
        assert result["failure_count"] == 0
        assert set(
            IDSRWeeklyReport.objects.filter(epi_year=2026, epi_week=8).values_list(
                "facility_ref_id", flat=True
            )
        ) == {sample_facility.id, second_facility.id}

    @patch("hmis.apps.surveillance.services.IDSRReportingService.generate_weekly_report")
    def test_scheduled_task_continues_after_one_facility_fails(
        self, mock_generate, db, sample_facility, second_facility
    ):
        """A failed facility report must not prevent other facilities from generating."""
        from hmis.apps.surveillance.tasks import generate_idsr_weekly_report

        sample_facility.has_surveillance = True
        sample_facility.save(update_fields=["has_surveillance"])
        successful_report = MagicMock(
            id=22,
            epi_year=2026,
            epi_week=8,
            total_cases=0,
            total_deaths=0,
            status="DRAFT",
        )
        successful_report.disease_summaries.count.return_value = 0
        mock_generate.side_effect = [ValueError("bad facility data"), successful_report]

        result = generate_idsr_weekly_report(epi_year=2026, epi_week=8)

        assert mock_generate.call_count == 2
        assert result["report_count"] == 1
        assert result["failure_count"] == 1
        assert result["reports"][0]["facility_id"] == second_facility.id
        assert result["failures"][0]["facility_id"] == sample_facility.id


# ============================================================================
# API Endpoints Tests
# ============================================================================


class TestIDSRAPIEndpoints:
    """Tests for IDSR Weekly Report API endpoints."""

    def test_list_idsr_reports(self, authenticated_client, db, sample_facility):
        """Should list IDSR reports."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=sample_facility,
        )

        response = authenticated_client.get("/api/surveillance/idsr/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_retrieve_idsr_report(self, authenticated_client, db, sample_facility):
        """Should retrieve single IDSR report with disease summaries."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=sample_facility,
        )

        response = authenticated_client.get(f"/api/surveillance/idsr/{report.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["epi_week"] == 8
        assert "disease_summaries" in response.data

    def test_retrieve_idsr_report_from_other_facility_is_hidden(
        self, authenticated_client, db, sample_facility, other_facility
    ):
        """Facility-scoped IDSR reports must not be retrievable from another facility."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=other_facility,
        )

        response = authenticated_client.get(f"/api/surveillance/idsr/{report.id}/")

        assert response.status_code == status.HTTP_404_NOT_FOUND

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

    def test_approve_idsr_report(self, authenticated_client, db, sample_facility):
        """Should approve IDSR report."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            status="DRAFT",
            facility_ref=sample_facility,
        )

        response = authenticated_client.post(
            f"/api/surveillance/idsr/{report.id}/approve/",
            {"notes": "Reviewed and approved"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "APPROVED"

    def test_approve_already_submitted_fails(self, authenticated_client, db, sample_facility):
        """Should not approve already submitted report."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            status="SUBMITTED",
            facility_ref=sample_facility,
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

    def test_dhis2_preview_endpoint(self, authenticated_client, db, sample_facility):
        """Should return DHIS2 payload preview."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=sample_facility,
        )

        response = authenticated_client.get(f"/api/surveillance/idsr/{report.id}/dhis2_preview/")

        assert response.status_code == status.HTTP_200_OK
        assert "payload" in response.data
        assert response.data["payload"]["period"] == "2026W08"

    def test_export_endpoints_support_legacy_idsr_reports_post_paths(
        self, authenticated_client, db, sample_facility
    ):
        """Should support legacy idsr-reports POST export endpoints with underscore action names."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        report = IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            facility_ref=sample_facility,
        )

        adx_response = authenticated_client.post(
            f"/api/surveillance/idsr-reports/{report.id}/export_adx/",
            {},
        )
        sdmx_response = authenticated_client.post(
            f"/api/surveillance/idsr-reports/{report.id}/export_sdmx/",
            {},
        )

        assert adx_response.status_code == status.HTTP_200_OK
        assert sdmx_response.status_code == status.HTTP_200_OK
        assert adx_response["Content-Type"].startswith("application/xml")
        assert sdmx_response["Content-Type"].startswith("application/xml")

    def test_filter_by_status(self, authenticated_client, db, sample_facility):
        """Should filter reports by status."""
        from hmis.apps.surveillance.models import IDSRWeeklyReport

        IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=8,
            week_start_date=date(2026, 2, 16),
            week_end_date=date(2026, 2, 22),
            status="DRAFT",
            facility_ref=sample_facility,
        )
        IDSRWeeklyReport.objects.create(
            epi_year=2026,
            epi_week=7,
            week_start_date=date(2026, 2, 9),
            week_end_date=date(2026, 2, 15),
            status="SUBMITTED",
            facility_ref=sample_facility,
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
