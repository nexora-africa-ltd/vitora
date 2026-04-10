"""Tests for MOH report generation services."""

from datetime import date

import pytest  # type: ignore

from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code
from hmis.apps.moh_reporting.models import MOHReportStatus
from hmis.apps.moh_reporting.services import (
    DHIS2SubmissionService,
    MOH705Generator,
    MOH711Generator,
    MOH717Generator,
    _age_on_date,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class TestAgeOnDate:
    def test_child_under_5(self):
        assert _age_on_date(date(2022, 6, 1), date(2026, 3, 15)) == 3

    def test_adult(self):
        assert _age_on_date(date(1990, 1, 1), date(2026, 3, 15)) == 36

    def test_none_dob(self):
        assert _age_on_date(None, date(2026, 3, 15)) is None

    def test_zero_age(self):
        assert _age_on_date(date(2026, 3, 15), date(2026, 3, 15)) == 0


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def icd10_malaria(db):
    return ICD10Code.objects.create(
        code="B50",
        description="Plasmodium falciparum malaria",
        short_description="Falciparum malaria",
        category="Certain infectious and parasitic diseases",
        chapter=1,
    )


@pytest.fixture
def icd10_respiratory(db):
    return ICD10Code.objects.create(
        code="J18",
        description="Pneumonia, unspecified organism",
        short_description="Pneumonia",
        category="Diseases of the respiratory system",
        chapter=10,
    )


@pytest.fixture
def opd_encounter_with_diagnosis(
    db,
    sample_patient,
    sample_facility,
    sample_organization,
    sample_icd10_code,
    test_user,
):
    """OPD encounter with a chapter-1 primary diagnosis."""
    enc = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        encounter_date=date(2026, 3, 10),
        chief_complaint="Fever",
        facility=sample_facility,
        organization=sample_organization,
    )
    Diagnosis.objects.create(
        encounter=enc,
        icd10_code=sample_icd10_code,
        diagnosis_type="PRIMARY",
        diagnosed_by=test_user,
    )
    return enc


# ---------------------------------------------------------------------------
# MOH 705 Generator
# ---------------------------------------------------------------------------


class TestMOH705Generator:
    def test_generates_report(
        self,
        sample_facility,
        opd_encounter_with_diagnosis,
    ):
        report = MOH705Generator.generate(sample_facility, 2026, 3)
        assert report.status == MOHReportStatus.DRAFT
        assert report.total_visits == 1
        assert report.disease_rows.count() == 1
        row = report.disease_rows.first()
        assert row.icd10_chapter == 1

    def test_age_band_under_5(
        self,
        db,
        sample_facility,
        sample_organization,
        sample_icd10_code,
        sample_county,
        sample_sub_county,
        test_user,
    ):
        """Child patient (age < 5) increments under-5 count."""
        from hmis.apps.patients.models import Patient

        child = Patient.objects.create(
            first_name="Baby",
            last_name="Doe",
            date_of_birth=date(2023, 1, 1),  # ~3 yrs old
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )
        enc = Encounter.objects.create(
            patient=child,
            encounter_type="OPD",
            encounter_date=date(2026, 3, 15),
            chief_complaint="Cough",
            facility=sample_facility,
            organization=sample_organization,
        )
        Diagnosis.objects.create(
            encounter=enc,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=test_user,
        )

        report = MOH705Generator.generate(sample_facility, 2026, 3)
        assert report.total_under_5 == 1

    def test_update_or_create_idempotent(
        self,
        sample_facility,
        opd_encounter_with_diagnosis,
    ):
        """Calling generate twice for the same period updates the existing report."""
        r1 = MOH705Generator.generate(sample_facility, 2026, 3)
        r2 = MOH705Generator.generate(sample_facility, 2026, 3)
        assert r1.pk == r2.pk

    def test_empty_period_produces_zero_report(self, sample_facility):
        report = MOH705Generator.generate(sample_facility, 2026, 1)
        assert report.total_visits == 0
        assert report.disease_rows.count() == 0

    def test_multiple_chapters(
        self,
        db,
        sample_facility,
        sample_organization,
        sample_patient,
        sample_icd10_code,
        icd10_respiratory,
        test_user,
    ):
        """Multiple ICD-10 chapters produce separate disease rows."""
        for icd in [sample_icd10_code, icd10_respiratory]:
            enc = Encounter.objects.create(
                patient=sample_patient,
                encounter_type="OPD",
                encounter_date=date(2026, 3, 12),
                chief_complaint="Symptoms",
                facility=sample_facility,
                organization=sample_organization,
            )
            Diagnosis.objects.create(
                encounter=enc,
                icd10_code=icd,
                diagnosis_type="PRIMARY",
                diagnosed_by=test_user,
            )

        report = MOH705Generator.generate(sample_facility, 2026, 3)
        assert report.disease_rows.count() == 2


# ---------------------------------------------------------------------------
# MOH 711 Generator
# ---------------------------------------------------------------------------


class TestMOH711Generator:
    def test_generates_report(self, sample_facility):
        report = MOH711Generator.generate(sample_facility, 2026, 3)
        assert report.status == MOHReportStatus.DRAFT

    def test_counts_anc_encounters(
        self,
        db,
        sample_facility,
        sample_organization,
        sample_patient,
    ):
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="ANC",
            encounter_date=date(2026, 3, 5),
            chief_complaint="ANC visit",
            facility=sample_facility,
            organization=sample_organization,
        )
        report = MOH711Generator.generate(sample_facility, 2026, 3)
        assert report.anc_visits == 1

    def test_counts_malaria(
        self,
        db,
        sample_facility,
        sample_organization,
        sample_patient,
        icd10_malaria,
        test_user,
    ):
        enc = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date(2026, 3, 10),
            chief_complaint="Malaria symptoms",
            facility=sample_facility,
            organization=sample_organization,
        )
        Diagnosis.objects.create(
            encounter=enc,
            icd10_code=icd10_malaria,
            diagnosis_type="PRIMARY",
            diagnosed_by=test_user,
        )
        report = MOH711Generator.generate(sample_facility, 2026, 3)
        assert report.malaria_cases_5_and_above == 1


# ---------------------------------------------------------------------------
# MOH 717 Generator
# ---------------------------------------------------------------------------


class TestMOH717Generator:
    def test_generates_report(self, sample_facility):
        report = MOH717Generator.generate(sample_facility, 2026, 3)
        assert report.status == MOHReportStatus.DRAFT

    def test_counts_opd(
        self,
        sample_facility,
        opd_encounter_with_diagnosis,
    ):
        report = MOH717Generator.generate(sample_facility, 2026, 3)
        assert report.opd_total >= 1

    def test_counts_emergency(
        self,
        db,
        sample_facility,
        sample_organization,
        sample_patient,
    ):
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            encounter_date=date(2026, 3, 15),
            chief_complaint="Car accident",
            facility=sample_facility,
            organization=sample_organization,
        )
        report = MOH717Generator.generate(sample_facility, 2026, 3)
        assert report.emergency_visits == 1

    def test_empty_period(self, sample_facility):
        report = MOH717Generator.generate(sample_facility, 2026, 1)
        assert report.opd_total == 0
        assert report.emergency_visits == 0


# ---------------------------------------------------------------------------
# DHIS2 Submission Service
# ---------------------------------------------------------------------------


class TestDHIS2SubmissionService:
    def test_prepare_705_payload(
        self,
        db,
        sample_facility,
        sample_organization,
    ):
        from hmis.apps.moh_reporting.models import MOH705DiseaseRow

        report = MOH705Generator.generate(sample_facility, 2026, 3)
        MOH705DiseaseRow.objects.create(
            report=report,
            icd10_chapter=1,
            category_name="Infectious",
            cases_under_5=5,
            cases_5_and_above=10,
            total_cases=15,
        )
        payload = DHIS2SubmissionService.prepare_payload(report)
        assert "dataValues" in payload
        assert payload["period"] == "202603"

    def test_prepare_711_payload(self, sample_facility, sample_organization):
        report = MOH711Generator.generate(sample_facility, 2026, 3)
        payload = DHIS2SubmissionService.prepare_payload(report)
        assert "dataValues" in payload
        assert payload["period"] == "202603"

    def test_prepare_717_payload(self, sample_facility, sample_organization):
        report = MOH717Generator.generate(sample_facility, 2026, 3)
        payload = DHIS2SubmissionService.prepare_payload(report)
        assert "dataValues" in payload
        assert payload["period"] == "202603"

    def test_submit_rejects_non_approved(self, sample_facility, sample_organization):
        report = MOH705Generator.generate(sample_facility, 2026, 3)
        assert report.status == MOHReportStatus.DRAFT
        with pytest.raises(ValueError, match="Only approved"):
            DHIS2SubmissionService.submit(report)
