"""Tests for MOH Reporting models."""

from datetime import date

import pytest  # type: ignore
from django.db import IntegrityError

from hmis.apps.moh_reporting.models import (
    MOH705DiseaseRow,
    MOH705Report,
    MOH711Report,
    MOH717Report,
    MOHDataElementMapping,
    MOHReportStatus,
)

pytestmark = pytest.mark.django_db


class TestMOH705Report:
    """Tests for MOH 705 model."""

    def test_create_report(self, sample_facility, sample_organization):
        report = MOH705Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            total_visits=120,
            total_under_5=30,
            total_5_and_above=90,
        )
        assert report.status == MOHReportStatus.DRAFT
        assert report.period_label == "March 2026"
        assert report.dhis2_period == "202603"
        assert report.can_edit is True
        assert report.is_submitted is False

    def test_unique_together_facility_period(self, sample_facility, sample_organization):
        MOH705Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
        )
        with pytest.raises(IntegrityError):
            MOH705Report.objects.create(
                facility=sample_facility,
                organization=sample_organization,
                period_start=date(2026, 3, 1),
                period_end=date(2026, 3, 31),
            )

    def test_approve_transition(self, sample_facility, sample_organization, test_user):
        report = MOH705Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
        )
        report.approve(user=test_user)
        report.refresh_from_db()
        assert report.status == MOHReportStatus.APPROVED
        assert report.approved_by == test_user
        assert report.approved_at is not None
        assert report.can_edit is False

    def test_mark_submitted(self, sample_facility, sample_organization):
        report = MOH705Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            status=MOHReportStatus.APPROVED,
        )
        report.mark_submitted({"status": "SUCCESS", "importCount": {"imported": 10}})
        report.refresh_from_db()
        assert report.status == MOHReportStatus.SUBMITTED
        assert report.is_submitted is True
        assert report.dhis2_submitted_at is not None
        assert report.dhis2_import_summary == {"imported": 10}

    def test_mark_failed(self, sample_facility, sample_organization):
        report = MOH705Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            status=MOHReportStatus.APPROVED,
        )
        report.mark_failed({"status": "error", "message": "Connection refused"})
        report.refresh_from_db()
        assert report.status == MOHReportStatus.FAILED
        assert report.can_edit is True

    def test_disease_row_creation(self, sample_facility, sample_organization):
        report = MOH705Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
        )
        MOH705DiseaseRow.objects.create(
            report=report,
            icd10_chapter=1,
            category_name="Infectious diseases",
            cases_under_5=10,
            cases_5_and_above=20,
            total_cases=30,
        )
        assert report.disease_rows.count() == 1


class TestMOH711Report:
    """Tests for MOH 711 model."""

    def test_create_report(self, sample_facility, sample_organization):
        report = MOH711Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            deliveries_total=50,
            live_births=48,
        )
        assert report.status == MOHReportStatus.DRAFT
        assert report.deliveries_total == 50

    def test_unique_together(self, sample_facility, sample_organization):
        MOH711Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
        )
        with pytest.raises(IntegrityError):
            MOH711Report.objects.create(
                facility=sample_facility,
                organization=sample_organization,
                period_start=date(2026, 3, 1),
                period_end=date(2026, 3, 31),
            )


class TestMOH717Report:
    """Tests for MOH 717 model."""

    def test_create_report(self, sample_facility, sample_organization):
        report = MOH717Report.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            opd_total=300,
            admissions_total=40,
        )
        assert report.status == MOHReportStatus.DRAFT
        assert report.opd_total == 300


class TestMOHDataElementMapping:
    """Tests for DHIS2 data element mapping."""

    def test_create_mapping(self, db):
        mapping = MOHDataElementMapping.objects.create(
            report_type="MOH705",
            indicator_code="ch1_under_5",
            environment="local",
            data_element_uid="abc12345678",
        )
        assert str(mapping) == "MOH705/ch1_under_5 → abc12345678"

    def test_get_uid(self, db):
        MOHDataElementMapping.objects.create(
            report_type="MOH705",
            indicator_code="ch1_under_5",
            environment="local",
            data_element_uid="abc12345678",
        )
        uid = MOHDataElementMapping.get_uid("MOH705", "ch1_under_5", "local")
        assert uid == "abc12345678"

    def test_get_uid_not_found(self, db):
        uid = MOHDataElementMapping.get_uid("MOH705", "nonexistent", "local")
        assert uid is None
