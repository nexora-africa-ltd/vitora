"""Tests for L5.3 Worksheets & Label Printing."""

import pytest
from rest_framework import status


@pytest.fixture
def worksheet_template(db, sample_facility, sample_organization):
    """Create a sample worksheet template."""
    from hmis.apps.laboratory.worksheets.models import WorksheetTemplate

    return WorksheetTemplate.objects.create(
        name="Morning Chem Run",
        description="Morning chemistry worksheet",
        group_by="SECTION",
        default_export_format="CSV",
        max_specimens_per_page=50,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def label_template(db, sample_facility, sample_organization):
    """Create a sample label template."""
    from hmis.apps.laboratory.worksheets.models import LabelTemplate

    return LabelTemplate.objects.create(
        name="Standard Specimen",
        label_format="ZPL",
        label_type="SPECIMEN",
        width_mm=50,
        height_mm=25,
        barcode_format="CODE128",
        include_fields=["barcode", "patient_name", "mrn", "collected_at", "test_name"],
        zpl_template="^XA^FO10,10^BC,60,Y^FD{{ barcode }}^FS^XZ",
        is_default=True,
        facility=sample_facility,
        organization=sample_organization,
    )


class TestWorksheetTemplateAPI:
    """Tests for worksheet template CRUD."""

    def test_list_templates(self, authenticated_client, worksheet_template):
        response = authenticated_client.get("/api/lab/worksheets/templates/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_template(self, authenticated_client, sample_facility):
        data = {
            "name": "Hematology Run",
            "group_by": "SECTION",
            "default_export_format": "CSV",
            "max_specimens_per_page": 40,
        }
        response = authenticated_client.post("/api/lab/worksheets/templates/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Hematology Run"

    def test_update_template(self, authenticated_client, worksheet_template):
        response = authenticated_client.patch(
            f"/api/lab/worksheets/templates/{worksheet_template.id}/",
            {"max_specimens_per_page": 100},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["max_specimens_per_page"] == 100

    def test_delete_template(self, authenticated_client, worksheet_template):
        response = authenticated_client.delete(
            f"/api/lab/worksheets/templates/{worksheet_template.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT


class TestWorksheetAPI:
    """Tests for worksheet generation."""

    def test_generate_worksheet(self, authenticated_client, sample_lab_order, worksheet_template):
        data = {"title": "Test Batch", "template_id": worksheet_template.id}
        response = authenticated_client.post("/api/lab/worksheets/batches/generate/", data)
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
        assert "worksheet_number" in response.data

    def test_list_worksheets(self, authenticated_client, sample_facility):
        response = authenticated_client.get("/api/lab/worksheets/batches/")
        assert response.status_code == status.HTTP_200_OK


class TestLabelTemplateAPI:
    """Tests for label template CRUD."""

    def test_list_label_templates(self, authenticated_client, label_template):
        response = authenticated_client.get("/api/lab/worksheets/labels/templates/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_label_template(self, authenticated_client, sample_facility):
        data = {
            "name": "Slide Label",
            "label_format": "ZPL",
            "label_type": "SLIDE",
            "width_mm": 25,
            "height_mm": 75,
            "barcode_format": "QR_CODE",
        }
        response = authenticated_client.post("/api/lab/worksheets/labels/templates/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["label_type"] == "SLIDE"


class TestLabelPrintJobAPI:
    """Tests for label print job management."""

    def test_generate_labels(self, authenticated_client, label_template, sample_lab_order):
        from hmis.apps.laboratory.models import Specimen

        specimen = sample_lab_order.specimens.first()
        if not specimen:
            pytest.skip("No specimen auto-created for lab order")
        data = {
            "template_id": label_template.id,
            "specimen_ids": [specimen.id],
        }
        response = authenticated_client.post(
            "/api/lab/worksheets/labels/jobs/generate/", data, format="json"
        )
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)

    def test_list_print_jobs(self, authenticated_client, sample_facility):
        response = authenticated_client.get("/api/lab/worksheets/labels/jobs/")
        assert response.status_code == status.HTTP_200_OK


class TestWorksheetModels:
    """Tests for worksheet model behaviour."""

    def test_worksheet_number_auto_generated(self, db, sample_facility, sample_organization):
        from hmis.apps.laboratory.worksheets.models import Worksheet

        ws = Worksheet.objects.create(
            title="Test",
            facility=sample_facility,
            organization=sample_organization,
        )
        assert ws.worksheet_number.startswith("WS-")

    def test_label_print_job_state_transitions(
        self, db, sample_facility, sample_organization, label_template
    ):
        from hmis.apps.laboratory.worksheets.models import LabelPrintJob

        job = LabelPrintJob.objects.create(
            template=label_template,
            facility=sample_facility,
            organization=sample_organization,
        )
        assert job.status == "PENDING"

        job.mark_generated("ZPL DATA", count=5)
        assert job.status == "GENERATED"
        assert job.output_data == "ZPL DATA"

        job.mark_printed()
        assert job.status == "PRINTED"
        assert job.printed_at is not None

    def test_label_print_job_mark_failed(
        self, db, sample_facility, sample_organization, label_template
    ):
        from hmis.apps.laboratory.worksheets.models import LabelPrintJob

        job = LabelPrintJob.objects.create(
            template=label_template,
            facility=sample_facility,
            organization=sample_organization,
        )
        job.mark_failed("Printer not found")
        assert job.status == "FAILED"
        assert job.error_message == "Printer not found"
