# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for the FUNC-QUAL-001 vaccination-quality lab workflow.

Run with: poetry run pytest tests/quality/test_cqm_lab.py --no-cov
Inputs: standard pytest fixtures plus no command-line arguments.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO

import pytest  # type: ignore
from openpyxl import load_workbook
from rest_framework import status

from hmis.apps.clinics.models import Clinic
from hmis.apps.core.models import Facility, Organization
from hmis.apps.immunizations.models import ImmunizationRecord, VaccineDefinition
from hmis.apps.patients.models import Patient
from hmis.apps.quality.models import QualityMeasure, QualityMeasureResult
from hmis.apps.quality.services.evaluation import evaluate_immunization_completeness
from hmis.apps.quality.services.result_exports import result_export_rows


@pytest.fixture
def immunization_clinic(sample_facility, sample_organization):
    """Create the clinic type supported by the vaccination measure."""
    return Clinic.objects.create(
        name="Child Welfare Clinic",
        clinic_type="IMMUNIZATION",
        code="CWC-QUALITY",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def other_quality_clinic(sample_facility, sample_organization):
    """Create a second facility clinic to prove filtered export isolation."""
    return Clinic.objects.create(
        name="Other Quality Clinic",
        clinic_type="CCC",
        code="OTHER-QUALITY",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def vaccination_measure():
    """Create the canonical KEPI coverage measure used for the lab evidence."""
    return QualityMeasure.objects.create(
        code="KE-CQM-007",
        name="Under-5 Immunization Completeness",
        domain="PUBLIC_HEALTH",
        status="ACTIVE",
        numerator_logic="Children under 5 with all due KEPI vaccines administered",
        denominator_logic="Eligible children with due KEPI vaccine doses",
        target_percentage=Decimal("90.00"),
        reporting_period="MONTHLY",
        applicable_clinic_types=["CWC", "IMMUNIZATION"],
        evaluation_rule={
            "type": "immunization_completeness",
            "params": {
                "vaccine_program": "KEPI",
                "max_patient_age_years": 5,
                "strict_due_in_period": True,
            },
        },
    )


@pytest.fixture
def kepi_vaccine():
    """Create a KEPI vaccine definition for the controlled cohort."""
    return VaccineDefinition.objects.create(
        code="LAB-KEPI-BCG",
        name="Lab BCG",
        program="KEPI",
        standard_age_days=0,
        dose_number=1,
    )


@pytest.fixture
def vaccination_cohort(
    sample_county,
    sample_sub_county,
    sample_facility,
    sample_organization,
    test_user,
    kepi_vaccine,
):
    """Create ten eligible children: eight complete and two with due doses outstanding."""
    scheduled_date = date(2026, 11, 15)
    for index in range(10):
        patient = Patient.objects.create(
            first_name=f"Quality{index}",
            last_name="Child",
            gender="F" if index % 2 else "M",
            date_of_birth=date(2024, 6, 1),
            county=sample_county,
            sub_county=sample_sub_county,
            registered_by=test_user,
            organization=sample_organization,
            referral_source="clinic",
        )
        # The MCH signal generates the default KEPI schedule on patient creation.
        # Replace it with this test's controlled single-dose scenario.
        ImmunizationRecord.objects.filter(patient=patient).delete()
        ImmunizationRecord.objects.create(
            patient=patient,
            vaccine=kepi_vaccine,
            scheduled_date=scheduled_date,
            administered_date=scheduled_date if index < 8 else None,
            status="ADMINISTERED" if index < 8 else "SCHEDULED",
            dose_number=1,
            administered_by=test_user if index < 8 else None,
            facility=sample_facility,
            organization=sample_organization,
        )


class TestVaccinationQualityMeasure:
    """Coverage calculation, persistence, visibility, and exports for FUNC-QUAL-001."""

    def test_vaccination_coverage_calculates_complete_children(
        self, immunization_clinic, vaccination_cohort
    ):
        """Eight fully immunized children out of ten should produce 80 percent coverage."""
        result = evaluate_immunization_completeness(
            immunization_clinic.id,
            date(2026, 11, 1),
            date(2026, 11, 30),
            {"vaccine_program": "KEPI", "max_patient_age_years": 5, "strict_due_in_period": True},
        )

        assert result.numerator == 8
        assert result.denominator == 10
        assert result.percentage == Decimal("80.00")
        assert result.status == "EVALUATED"
        assert result.evaluation_details["due_doses"] == 10
        assert result.evaluation_details["administered_doses"] == 8

    def test_vaccination_coverage_is_not_evaluable_without_due_doses(self, immunization_clinic):
        """A reporting period without due KEPI doses must not report a zero-performance score."""
        result = evaluate_immunization_completeness(
            immunization_clinic.id,
            date(2026, 11, 1),
            date(2026, 11, 30),
            {"vaccine_program": "KEPI", "max_patient_age_years": 5, "strict_due_in_period": True},
        )

        assert result.numerator == 0
        assert result.denominator == 0
        assert result.status == "NOT_EVALUABLE"

    def test_evaluation_persists_result_with_api_contract(
        self,
        authenticated_client,
        test_staff_profile,
        sample_facility,
        immunization_clinic,
        vaccination_measure,
        vaccination_cohort,
    ):
        """Evaluation must persist the result and return the documented result summary shape."""
        response = authenticated_client.post(
            "/api/quality/results/evaluate/",
            {
                "clinic_id": immunization_clinic.id,
                "year": 2026,
                "period": 11,
                "period_type": "MONTHLY",
            },
            format="json",
            HTTP_X_FACILITY_ID=str(sample_facility.id),
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        result = next(
            item for item in response.data["results"] if item["measure_code"] == "KE-CQM-007"
        )
        assert result["numerator"] == 8
        assert result["denominator"] == 10
        assert result["percentage"] == "80.00"
        assert result["notes"] == "Patients complete for due immunization doses"
        assert result["meets_target"] is False
        persisted = QualityMeasureResult.objects.get(
            measure=vaccination_measure,
            clinic=immunization_clinic,
            year=2026,
            period=11,
            period_type="MONTHLY",
        )
        assert persisted.percentage == Decimal("80.00")
        assert persisted.evaluation_status == "EVALUATED"

    def test_dashboard_reflects_tenant_evaluable_vaccination_result(
        self,
        authenticated_client,
        test_staff_profile,
        sample_facility,
        immunization_clinic,
        vaccination_measure,
        vaccination_cohort,
    ):
        """The dashboard must count the facility's evaluated vaccination result."""
        QualityMeasureResult.objects.create(
            measure=vaccination_measure,
            clinic=immunization_clinic,
            year=2026,
            period=11,
            period_type="MONTHLY",
            numerator=8,
            denominator=10,
        )

        response = authenticated_client.get(
            f"/api/quality/dashboard/?clinic_id={immunization_clinic.id}&year=2026",
            HTTP_X_FACILITY_ID=str(sample_facility.id),
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["measures_meeting_target"] == 0
        assert response.data["overall_compliance_rate"] == 0
        public_health = next(
            item for item in response.data["domain_summary"] if item["domain"] == "PUBLIC_HEALTH"
        )
        assert public_health["total_results"] == 1

    @pytest.mark.parametrize(
        ("export_format", "content_type"),
        [
            ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            ("pdf", "application/pdf"),
        ],
    )
    def test_quality_export_includes_vaccination_result(
        self,
        authenticated_client,
        test_staff_profile,
        sample_facility,
        immunization_clinic,
        vaccination_measure,
        export_format,
        content_type,
    ):
        """PDF and XLSX reports must include a persisted vaccination quality row."""
        QualityMeasureResult.objects.create(
            measure=vaccination_measure,
            clinic=immunization_clinic,
            year=2026,
            period=11,
            period_type="MONTHLY",
            numerator=8,
            denominator=10,
        )

        response = authenticated_client.get(
            "/api/quality/results/export/",
            {"export_format": export_format, "year": 2026},
            HTTP_X_FACILITY_ID=str(sample_facility.id),
        )

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"].startswith(content_type)
        if export_format == "xlsx":
            workbook = load_workbook(BytesIO(response.content))
            rows = list(workbook.active.iter_rows(values_only=True))
            assert any(row[0] == "KE-CQM-007" and row[4] == 8 and row[5] == 10 for row in rows)
        else:
            assert response.content.startswith(b"%PDF")
            result = QualityMeasureResult.objects.get(
                measure=vaccination_measure,
                clinic=immunization_clinic,
                year=2026,
                period=11,
                period_type="MONTHLY",
            )
            assert result_export_rows([result])[0][:6] == [
                "KE-CQM-007",
                "Under-5 Immunization Completeness",
                "Child Welfare Clinic",
                "2026 Monthly 11",
                8,
                10,
            ]

    def test_quality_export_respects_clinic_measure_and_period_filters(
        self,
        authenticated_client,
        test_staff_profile,
        sample_facility,
        immunization_clinic,
        other_quality_clinic,
        vaccination_measure,
    ):
        """Audit exports must not include other clinics or reporting periods."""
        QualityMeasureResult.objects.create(
            measure=vaccination_measure,
            clinic=immunization_clinic,
            year=2026,
            period=11,
            period_type="MONTHLY",
            numerator=8,
            denominator=10,
        )
        QualityMeasureResult.objects.create(
            measure=vaccination_measure,
            clinic=immunization_clinic,
            year=2026,
            period=10,
            period_type="MONTHLY",
            numerator=7,
            denominator=10,
        )
        QualityMeasureResult.objects.create(
            measure=vaccination_measure,
            clinic=other_quality_clinic,
            year=2026,
            period=11,
            period_type="MONTHLY",
            numerator=6,
            denominator=10,
        )

        response = authenticated_client.get(
            "/api/quality/results/export/",
            {
                "export_format": "xlsx",
                "year": 2026,
                "clinic": immunization_clinic.id,
                "measure": vaccination_measure.id,
                "period": 11,
                "period_type": "MONTHLY",
            },
            HTTP_X_FACILITY_ID=str(sample_facility.id),
        )

        assert response.status_code == status.HTTP_200_OK
        workbook = load_workbook(BytesIO(response.content))
        rows = list(workbook.active.iter_rows(values_only=True))
        data_rows = rows[2:]
        assert len(data_rows) == 1
        assert data_rows[0][0] == "KE-CQM-007"
        assert data_rows[0][2] == "Child Welfare Clinic"
        assert data_rows[0][3] == "2026 Monthly 11"


class TestQualityTenantIsolation:
    """Facility isolation for quality dashboard and direct evaluation actions."""

    def test_dashboard_excludes_results_from_another_facility(
        self,
        authenticated_client,
        test_staff_profile,
        sample_county,
        sample_sub_county,
        sample_facility,
        immunization_clinic,
        vaccination_measure,
    ):
        """A facility dashboard must not aggregate another tenant's quality result."""
        other_org = Organization.objects.create(
            name="Other Quality Organization",
            slug="other-quality-organization",
            contact_email="other-quality@example.test",
            is_active=True,
            is_verified=True,
        )
        other_facility = Facility.objects.create(
            organization=other_org,
            name="Other Quality Facility",
            mfl_code="88888",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        other_clinic = Clinic.objects.create(
            name="Other Immunization Clinic",
            clinic_type="IMMUNIZATION",
            code="OTHER-CWC",
            status="ACTIVE",
            facility=other_facility,
            organization=other_org,
        )
        QualityMeasureResult.objects.create(
            measure=vaccination_measure,
            clinic=other_clinic,
            year=2026,
            period=11,
            period_type="MONTHLY",
            numerator=10,
            denominator=10,
        )

        response = authenticated_client.get(
            "/api/quality/dashboard/?year=2026",
            HTTP_X_FACILITY_ID=str(sample_facility.id),
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["measures_meeting_target"] == 0
        assert response.data["overall_compliance_rate"] == 0

    def test_direct_evaluation_rejects_a_clinic_outside_active_facility(
        self,
        authenticated_client,
        test_staff_profile,
        sample_county,
        sample_sub_county,
        sample_facility,
        vaccination_measure,
    ):
        """A user cannot evaluate and persist data for a clinic outside their facility scope."""
        other_org = Organization.objects.create(
            name="Restricted Quality Organization",
            slug="restricted-quality-organization",
            contact_email="restricted-quality@example.test",
            is_active=True,
            is_verified=True,
        )
        other_facility = Facility.objects.create(
            organization=other_org,
            name="Restricted Quality Facility",
            mfl_code="77777",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        other_clinic = Clinic.objects.create(
            name="Restricted Immunization Clinic",
            clinic_type="IMMUNIZATION",
            code="RESTRICTED-CWC",
            status="ACTIVE",
            facility=other_facility,
            organization=other_org,
        )

        response = authenticated_client.post(
            "/api/quality/results/evaluate/",
            {"clinic_id": other_clinic.id, "year": 2026, "period": 11, "period_type": "MONTHLY"},
            format="json",
            HTTP_X_FACILITY_ID=str(sample_facility.id),
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not QualityMeasureResult.objects.filter(clinic=other_clinic).exists()
