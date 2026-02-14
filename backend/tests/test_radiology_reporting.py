"""
Tests for Radiology Reporting (Phase D).

Tests the RadiologyReport model and API endpoints including:
- Report creation and draft management
- Signing/finalizing reports
- Amendments
- Critical finding communication
- PDF generation
"""

import pytest
from datetime import date
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from hmis.apps.imaging.models import (
    ImagingOrder,
    ImagingProcedure,
    RadiologyReport,
    ReportAmendment,
)

User = get_user_model()


@pytest.fixture
def radiologist(db):
    """Create a radiologist user."""
    return User.objects.create_user(
        username="radiologist",
        email="radiologist@example.com",
        password="testpass123",
        first_name="Dr",
        last_name="Radiologist",
    )


@pytest.fixture
def imaging_procedure(db):
    """Create an imaging procedure."""
    return ImagingProcedure.objects.create(
        code="XR-CHEST-PA",
        name="Chest X-Ray PA View",
        modality="XR",
        body_region="CHEST",
        cost=500.00,
        sha_claimable=True,
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def completed_imaging_order(db, sample_patient, sample_encounter, test_user, imaging_procedure):
    """Create a completed imaging order."""
    order = ImagingOrder.objects.create(
        patient=sample_patient,
        ordered_by=test_user,
        encounter=sample_encounter,
        clinical_indication="Rule out pneumonia",
        priority="ROUTINE",
        status="COMPLETED",
    )
    order.items.create(procedure=imaging_procedure, laterality="NA")
    return order


@pytest.fixture
def draft_report(db, completed_imaging_order, radiologist):
    """Create a draft radiology report."""
    return RadiologyReport.objects.create(
        imaging_order=completed_imaging_order,
        reported_by=radiologist,
        technique="PA and lateral chest radiograph",
        findings="Clear lung fields. No consolidation, effusion, or pneumothorax. Heart size normal.",
        impression="Normal chest radiograph.",
        status="DRAFT",
    )


@pytest.fixture
def signed_report(db, completed_imaging_order, radiologist):
    """Create a signed/finalized radiology report."""
    report = RadiologyReport.objects.create(
        imaging_order=completed_imaging_order,
        reported_by=radiologist,
        technique="PA and lateral chest radiograph",
        findings="Clear lung fields. No consolidation, effusion, or pneumothorax.",
        impression="Normal chest radiograph.",
        status="DRAFT",
    )
    report.sign(radiologist)
    return report


@pytest.fixture
def critical_report(db, completed_imaging_order, radiologist):
    """Create a report with critical finding."""
    return RadiologyReport.objects.create(
        imaging_order=completed_imaging_order,
        reported_by=radiologist,
        technique="PA chest radiograph",
        findings="Large right-sided pneumothorax with mediastinal shift.",
        impression="Tension pneumothorax requiring urgent intervention.",
        is_critical=True,
        critical_finding_description="Tension pneumothorax",
        status="DRAFT",
    )


# =============================================================================
# MODEL TESTS
# =============================================================================


class TestRadiologyReportModel:
    """Tests for RadiologyReport model."""

    def test_report_number_auto_generated(self, db, completed_imaging_order, radiologist):
        """Report number should be auto-generated on creation."""
        report = RadiologyReport.objects.create(
            imaging_order=completed_imaging_order,
            reported_by=radiologist,
            findings="Normal",
            impression="Normal",
        )
        assert report.report_number.startswith("RPT-")
        assert len(report.report_number) == 17  # RPT-YYYYMMDD-XXXX

    def test_can_edit_draft_report(self, draft_report):
        """Draft reports should be editable."""
        assert draft_report.can_edit() is True

    def test_cannot_edit_signed_report(self, signed_report):
        """Signed reports should not be editable."""
        assert signed_report.can_edit() is False

    def test_can_sign_draft_report(self, draft_report):
        """Draft reports should be signable."""
        assert draft_report.can_sign() is True

    def test_cannot_sign_signed_report(self, signed_report):
        """Already signed reports should not be signable."""
        assert signed_report.can_sign() is False

    def test_can_amend_signed_report(self, signed_report):
        """Signed reports should be amendable."""
        assert signed_report.can_amend() is True

    def test_cannot_amend_draft_report(self, draft_report):
        """Draft reports should not be amendable."""
        assert draft_report.can_amend() is False

    def test_sign_changes_status_to_final(self, draft_report, radiologist):
        """Signing should change status to FINAL."""
        draft_report.sign(radiologist)

        assert draft_report.status == "FINAL"
        assert draft_report.signed_at is not None

    def test_sign_updates_order_status(self, draft_report, radiologist):
        """Signing should update the imaging order to REPORTED."""
        draft_report.sign(radiologist)
        draft_report.imaging_order.refresh_from_db()

        assert draft_report.imaging_order.status == "REPORTED"

    def test_amend_creates_amendment_record(self, signed_report, radiologist):
        """Amending should create an amendment record."""
        signed_report.amend(
            user=radiologist,
            reason="Missed finding",
            new_findings="Updated findings",
        )

        assert signed_report.status == "AMENDED"
        assert signed_report.amendment_count == 1
        assert signed_report.last_amendment_reason == "Missed finding"

    def test_communicate_critical_records_communication(self, critical_report, radiologist):
        """Communicating critical finding should record details."""
        critical_report.communicate_critical(
            user=radiologist,
            communicated_to="Dr. Smith, Attending",
            method="phone",
        )

        assert critical_report.critical_communicated is True
        assert critical_report.critical_communicated_to == "Dr. Smith, Attending"
        assert critical_report.critical_communicated_method == "phone"
        assert critical_report.critical_communicated_at is not None
        assert critical_report.critical_communicated_by == radiologist


# =============================================================================
# API TESTS
# =============================================================================


class TestRadiologyReportAPI:
    """Tests for radiology report API endpoints."""

    def test_create_report_draft(
        self, authenticated_client, completed_imaging_order
    ):
        """Should create a report draft."""
        url = reverse("radiology-report-list")
        data = {
            "imaging_order": completed_imaging_order.id,
            "findings": "Clear lung fields",
            "impression": "Normal chest radiograph",
        }

        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "DRAFT"
        assert response.data["report_number"].startswith("RPT-")
        assert response.data["findings"] == "Clear lung fields"

    def test_create_report_requires_completed_order(
        self, authenticated_client, sample_patient, sample_encounter, test_user, imaging_procedure
    ):
        """Should reject creating report for non-completed order."""
        # Create an order that's not completed
        order = ImagingOrder.objects.create(
            patient=sample_patient,
            ordered_by=test_user,
            encounter=sample_encounter,
            clinical_indication="Test",
            status="ORDERED",
        )
        order.items.create(procedure=imaging_procedure, laterality="NA")

        url = reverse("radiology-report-list")
        data = {
            "imaging_order": order.id,
            "findings": "Test",
            "impression": "Test",
        }

        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "completed" in str(response.data).lower()

    def test_update_draft_report(
        self, authenticated_client, draft_report
    ):
        """Should update a draft report."""
        url = reverse("radiology-report-detail", args=[draft_report.report_number])
        data = {
            "findings": "Updated findings",
            "impression": "Updated impression",
        }

        response = authenticated_client.patch(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["findings"] == "Updated findings"

    def test_cannot_update_signed_report(
        self, authenticated_client, signed_report
    ):
        """Should reject updating a signed report."""
        url = reverse("radiology-report-detail", args=[signed_report.report_number])
        data = {"findings": "Try to update"}

        response = authenticated_client.patch(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_sign_report(self, authenticated_client, draft_report):
        """Should sign and finalize a draft report."""
        url = reverse("radiology-report-sign", args=[draft_report.report_number])

        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "FINAL"
        assert response.data["signed_at"] is not None

    def test_amend_signed_report(self, authenticated_client, signed_report):
        """Should amend a signed report."""
        url = reverse("radiology-report-amend", args=[signed_report.report_number])
        data = {
            "reason": "Correction",
            "findings": "Amended findings",
        }

        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "AMENDED"
        assert response.data["amendment_count"] == 1

    def test_communicate_critical_finding(
        self, authenticated_client, critical_report
    ):
        """Should record critical finding communication."""
        # First sign the report
        critical_report.sign(critical_report.reported_by)

        url = reverse(
            "radiology-report-communicate-critical",
            args=[critical_report.report_number]
        )
        data = {
            "communicated_to": "Dr. Smith",
            "method": "phone",
        }

        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["critical_communicated"] is True
        assert response.data["critical_communicated_to"] == "Dr. Smith"

    def test_communicate_critical_requires_critical_report(
        self, authenticated_client, draft_report
    ):
        """Should reject communication for non-critical reports."""
        url = reverse(
            "radiology-report-communicate-critical",
            args=[draft_report.report_number]
        )
        data = {"communicated_to": "Dr. Smith", "method": "phone"}

        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_draft_report(self, authenticated_client, draft_report):
        """Should delete a draft report."""
        url = reverse("radiology-report-detail", args=[draft_report.report_number])

        response = authenticated_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not RadiologyReport.objects.filter(pk=draft_report.pk).exists()

    def test_cannot_delete_signed_report(
        self, authenticated_client, signed_report
    ):
        """Should reject deleting a signed report."""
        url = reverse("radiology-report-detail", args=[signed_report.report_number])

        response = authenticated_client.delete(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_report_pdf(self, authenticated_client, signed_report):
        """Should return PDF for signed report."""
        url = reverse("radiology-report-pdf", args=[signed_report.report_number])

        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/pdf"
        assert (
            f"{signed_report.report_number}.pdf"
            in response["Content-Disposition"]
        )

    def test_list_reports_filter_by_status(
        self, authenticated_client, completed_imaging_order, radiologist
    ):
        """Should filter reports by status."""
        # Create a draft report
        draft = RadiologyReport.objects.create(
            imaging_order=completed_imaging_order,
            reported_by=radiologist,
            findings="Test findings",
            impression="Test impression",
            status="DRAFT",
        )

        url = reverse("radiology-report-list")

        # Filter for DRAFT
        response = authenticated_client.get(url, {"status": "DRAFT"})
        assert response.status_code == status.HTTP_200_OK
        assert all(r["status"] == "DRAFT" for r in response.data["results"])
        assert any(r["report_number"] == draft.report_number for r in response.data["results"])

    def test_list_reports_filter_by_order(
        self, authenticated_client, draft_report
    ):
        """Should filter reports by order number."""
        url = reverse("radiology-report-list")
        order_number = draft_report.imaging_order.order_number

        response = authenticated_client.get(url, {"order": order_number})

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1
        assert response.data["results"][0]["order_number"] == order_number


class TestReportAmendmentModel:
    """Tests for ReportAmendment model."""

    def test_amendment_stores_previous_values(
        self, signed_report, radiologist
    ):
        """Amendment should store previous findings and impression."""
        original_findings = signed_report.findings
        original_impression = signed_report.impression

        signed_report.amend(
            user=radiologist,
            reason="Correction",
            new_findings="New findings",
            new_impression="New impression",
        )

        amendment = ReportAmendment.objects.create(
            report=signed_report,
            amendment_number=1,
            reason="Correction",
            previous_findings=original_findings,
            previous_impression=original_impression,
            new_findings="New findings",
            new_impression="New impression",
            amended_by=radiologist,
        )

        assert amendment.previous_findings == original_findings
        assert amendment.new_findings == "New findings"
