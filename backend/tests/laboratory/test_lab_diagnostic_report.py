"""
Tests for Phase L4 - Diagnostic Report Output.

This module tests the DiagnosticReport model for generating formal
patient-facing lab reports with PDF output support.

Following TDD methodology - these tests define the expected behavior
before implementation.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from io import BytesIO

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status

from hmis.apps.laboratory.models import (
    DiagnosticReport,
    LabOrder,
    LabOrderItem,
    LabResult,
    Specimen,
    TestCatalog,
)

User = get_user_model()


# ============================================================================
# DiagnosticReport Model Tests
# ============================================================================


@pytest.mark.django_db
class TestDiagnosticReportModel:
    """Tests for DiagnosticReport model."""

    def test_create_diagnostic_report_with_required_fields(
        self, sample_lab_order, test_user
    ):
        """Should create diagnostic report with lab_order and issued_by."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
        )
        assert report.lab_order == sample_lab_order
        assert report.issued_by == test_user
        assert report.status == "DRAFT"
        assert report.report_number is not None
        assert report.report_number != ""

    def test_report_number_auto_generation(self, sample_lab_order, test_user):
        """Should auto-generate unique report number."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
        )
        # Format: RPT-YYYYMMDD-XXXX
        assert report.report_number.startswith("RPT-")
        assert len(report.report_number) == 17  # RPT-YYYYMMDD-XXXX

    def test_report_number_uniqueness(self, sample_lab_order, test_user, sample_patient, sample_encounter, sample_organization, sample_facility):
        """Report number should be unique."""
        report1 = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
        )

        # Create another lab order
        lab_order2 = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            status="ORDERED",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        report2 = DiagnosticReport.objects.create(
            lab_order=lab_order2,
            issued_by=test_user,
        )

        assert report1.report_number != report2.report_number

    def test_report_status_choices(self, sample_lab_order, test_user):
        """Should accept valid status choices."""
        valid_statuses = ["DRAFT", "PRELIMINARY", "FINAL", "AMENDED", "CANCELLED"]
        for status_val in valid_statuses:
            report = DiagnosticReport.objects.create(
                lab_order=sample_lab_order,
                issued_by=test_user,
                status=status_val,
            )
            assert report.status == status_val
            # Clean up for next iteration
            report.delete()

    def test_report_with_all_optional_fields(self, sample_lab_order, test_user):
        """Should create report with all optional fields."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
            conclusion="All results within normal limits.",
            clinical_info="Patient presented with fatigue. Routine screening ordered.",
            issued_at=timezone.now(),
            fhir_resource_id="diagnostic-report-12345",
        )
        assert report.conclusion == "All results within normal limits."
        assert report.clinical_info == "Patient presented with fatigue. Routine screening ordered."
        assert report.fhir_resource_id == "diagnostic-report-12345"
        assert report.issued_at is not None

    def test_report_str_representation(self, sample_lab_order, test_user):
        """String representation should include report number and lab order."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
        )
        assert report.report_number in str(report)
        assert sample_lab_order.order_number in str(report)

    def test_report_timestamps(self, sample_lab_order, test_user):
        """Should auto-set created_at and updated_at."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
        )
        assert report.created_at is not None
        assert report.updated_at is not None

    def test_report_pdf_file_upload(self, sample_lab_order, test_user):
        """Should accept PDF file upload."""
        pdf_content = b"%PDF-1.4 test content"
        pdf_file = SimpleUploadedFile(
            "report.pdf",
            pdf_content,
            content_type="application/pdf",
        )
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            pdf_file=pdf_file,
        )
        assert report.pdf_file is not None
        assert report.pdf_file.name.endswith(".pdf")

    def test_report_lab_order_related_name(self, sample_lab_order, test_user):
        """Should access reports via lab_order.reports."""
        DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )
        DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
        )
        assert sample_lab_order.reports.count() == 2


@pytest.mark.django_db
class TestDiagnosticReportMethods:
    """Tests for DiagnosticReport model methods."""

    def test_finalize_report(self, sample_lab_order, test_user):
        """Should finalize report and set issued_at."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )
        assert report.issued_at is None

        report.finalize()

        report.refresh_from_db()
        assert report.status == "FINAL"
        assert report.issued_at is not None

    def test_finalize_already_final_report_raises(self, sample_lab_order, test_user):
        """Should raise error when finalizing already-final report."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
            issued_at=timezone.now(),
        )

        with pytest.raises(ValidationError) as exc_info:
            report.finalize()
        assert "already final" in str(exc_info.value).lower()

    def test_amend_report(self, sample_lab_order, test_user):
        """Should amend finalized report."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
            issued_at=timezone.now(),
            conclusion="Original conclusion",
        )

        report.amend(new_conclusion="Amended conclusion after review", amended_by=test_user)

        report.refresh_from_db()
        assert report.status == "AMENDED"
        assert report.conclusion == "Amended conclusion after review"

    def test_amend_draft_report_raises(self, sample_lab_order, test_user):
        """Should raise error when amending draft report."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )

        with pytest.raises(ValidationError) as exc_info:
            report.amend(new_conclusion="Test", amended_by=test_user)
        assert "draft" in str(exc_info.value).lower() or "final" in str(exc_info.value).lower()

    def test_cancel_report(self, sample_lab_order, test_user):
        """Should cancel report."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )

        report.cancel(reason="Duplicate report")

        report.refresh_from_db()
        assert report.status == "CANCELLED"
        assert "Duplicate" in report.cancellation_reason

    def test_is_finalized_property(self, sample_lab_order, test_user):
        """Should return True if status is FINAL or AMENDED."""
        draft = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )
        final = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
        )
        amended = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="AMENDED",
        )

        assert draft.is_finalized is False
        assert final.is_finalized is True
        assert amended.is_finalized is True


# ============================================================================
# DiagnosticReport API Tests
# ============================================================================


@pytest.mark.django_db
class TestDiagnosticReportListAPI:
    """Tests for listing diagnostic reports."""

    def test_list_diagnostic_reports(self, authenticated_client, sample_lab_order, test_user):
        """Should list all diagnostic reports."""
        DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )
        DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
        )

        response = authenticated_client.get("/api/lab/diagnostic-reports/")

        assert response.status_code == status.HTTP_200_OK
        # Handle paginated or non-paginated responses
        results = response.data.get("results", response.data)
        assert len(results) == 2

    def test_list_diagnostic_reports_unauthenticated(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/lab/diagnostic-reports/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_filter_by_status(self, authenticated_client, sample_lab_order, test_user):
        """Should filter reports by status."""
        DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )
        DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
        )

        response = authenticated_client.get("/api/lab/diagnostic-reports/?status=FINAL")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["status"] == "FINAL"

    def test_filter_by_lab_order(self, authenticated_client, sample_lab_order, test_user, sample_patient, sample_encounter, sample_organization, sample_facility):
        """Should filter reports by lab order."""
        DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
        )

        # Create another lab order with report
        lab_order2 = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            status="ORDERED",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        DiagnosticReport.objects.create(
            lab_order=lab_order2,
            issued_by=test_user,
        )

        response = authenticated_client.get(
            f"/api/lab/diagnostic-reports/?lab_order={sample_lab_order.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1


@pytest.mark.django_db
class TestDiagnosticReportCreateAPI:
    """Tests for creating diagnostic reports."""

    def test_create_diagnostic_report(self, authenticated_client, sample_lab_order, test_user):
        """Should create diagnostic report with minimal data."""
        response = authenticated_client.post(
            "/api/lab/diagnostic-reports/",
            {
                "lab_order": sample_lab_order.id,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "DRAFT"
        assert response.data["report_number"].startswith("RPT-")
        assert response.data["lab_order"] == sample_lab_order.id

    def test_create_diagnostic_report_with_content(self, authenticated_client, sample_lab_order):
        """Should create diagnostic report with conclusion and clinical info."""
        response = authenticated_client.post(
            "/api/lab/diagnostic-reports/",
            {
                "lab_order": sample_lab_order.id,
                "conclusion": "All results normal.",
                "clinical_info": "Routine check-up requested.",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["conclusion"] == "All results normal."
        assert response.data["clinical_info"] == "Routine check-up requested."

    def test_create_sets_issued_by_to_current_user(self, authenticated_client, sample_lab_order, test_user):
        """Should auto-set issued_by to current user."""
        response = authenticated_client.post(
            "/api/lab/diagnostic-reports/",
            {
                "lab_order": sample_lab_order.id,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["issued_by"] == test_user.id


@pytest.mark.django_db
class TestDiagnosticReportRetrieveAPI:
    """Tests for retrieving diagnostic reports."""

    def test_retrieve_diagnostic_report(self, authenticated_client, sample_lab_order, test_user):
        """Should retrieve diagnostic report by ID."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            conclusion="Test conclusion",
        )

        response = authenticated_client.get(f"/api/lab/diagnostic-reports/{report.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == report.id
        assert response.data["report_number"] == report.report_number
        assert response.data["conclusion"] == "Test conclusion"

    def test_retrieve_includes_lab_order_details(self, authenticated_client, sample_lab_order, test_user):
        """Should include lab order details in response."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
        )

        response = authenticated_client.get(f"/api/lab/diagnostic-reports/{report.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "lab_order_number" in response.data
        assert response.data["lab_order_number"] == sample_lab_order.order_number


@pytest.mark.django_db
class TestDiagnosticReportUpdateAPI:
    """Tests for updating diagnostic reports."""

    def test_update_draft_report(self, authenticated_client, sample_lab_order, test_user):
        """Should allow updating draft report."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )

        response = authenticated_client.patch(
            f"/api/lab/diagnostic-reports/{report.id}/",
            {
                "conclusion": "Updated conclusion",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["conclusion"] == "Updated conclusion"

    def test_update_final_report_restricted(self, authenticated_client, sample_lab_order, test_user):
        """Should not allow updating finalized report status directly."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
            issued_at=timezone.now(),
        )

        response = authenticated_client.patch(
            f"/api/lab/diagnostic-reports/{report.id}/",
            {
                "status": "DRAFT",  # Should not be allowed
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestDiagnosticReportActionsAPI:
    """Tests for diagnostic report actions."""

    def test_finalize_action(self, authenticated_client, sample_lab_order, test_user):
        """Should finalize draft report via action endpoint."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )

        response = authenticated_client.post(
            f"/api/lab/diagnostic-reports/{report.id}/finalize/",
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        assert report.status == "FINAL"
        assert report.issued_at is not None

    def test_amend_action(self, authenticated_client, sample_lab_order, test_user):
        """Should amend finalized report via action endpoint."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
            issued_at=timezone.now(),
            conclusion="Original",
        )

        response = authenticated_client.post(
            f"/api/lab/diagnostic-reports/{report.id}/amend/",
            {
                "conclusion": "Amended after pathologist review",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        assert report.status == "AMENDED"
        assert report.conclusion == "Amended after pathologist review"

    def test_cancel_action(self, authenticated_client, sample_lab_order, test_user):
        """Should cancel report via action endpoint."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="DRAFT",
        )

        response = authenticated_client.post(
            f"/api/lab/diagnostic-reports/{report.id}/cancel/",
            {
                "reason": "Created in error",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        assert report.status == "CANCELLED"
        assert "Created in error" in report.cancellation_reason

    def test_generate_pdf_action(self, authenticated_client, sample_lab_order, sample_lab_result, test_user):
        """Should generate PDF for diagnostic report."""
        report = DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
            status="FINAL",
            issued_at=timezone.now(),
            conclusion="Normal results",
        )

        response = authenticated_client.post(
            f"/api/lab/diagnostic-reports/{report.id}/generate_pdf/",
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        report.refresh_from_db()
        assert report.pdf_file is not None
        assert "pdf_url" in response.data


@pytest.mark.django_db
class TestDiagnosticReportNestedAPI:
    """Tests for nested diagnostic report endpoints."""

    def test_list_reports_for_order(self, authenticated_client, sample_lab_order, test_user):
        """Should list reports for a specific lab order."""
        DiagnosticReport.objects.create(
            lab_order=sample_lab_order,
            issued_by=test_user,
        )

        # LabOrderViewSet uses order_number as lookup_field
        response = authenticated_client.get(
            f"/api/lab/orders/{sample_lab_order.order_number}/reports/"
        )

        assert response.status_code == status.HTTP_200_OK
        # The nested endpoint returns a list directly, not paginated
        results = response.data if isinstance(response.data, list) else response.data.get("results", [])
        assert len(results) == 1

    def test_create_report_for_order(self, authenticated_client, sample_lab_order, test_user):
        """Should create report for a specific lab order via nested endpoint."""
        # LabOrderViewSet uses order_number as lookup_field
        response = authenticated_client.post(
            f"/api/lab/orders/{sample_lab_order.order_number}/reports/",
            {
                "conclusion": "Test report",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["lab_order"] == sample_lab_order.id
