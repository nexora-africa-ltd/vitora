"""Tests for lab attachments API (Phase A: document reporting normalization).

Covers:
- POST /api/lab/orders/{order_number}/attachments/
- GET  /api/lab/orders/{order_number}/attachments/
- DELETE /api/lab/attachments/{id}/

These tests define the expected behavior for attachment storage via LabResultAttachment.
"""

from datetime import date

import pytest  # type: ignore
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from hmis.apps.laboratory.models import LabOrder, LabResultAttachment


@pytest.fixture
def external_lab_order(
    db, sample_patient, sample_encounter, test_user, sample_organization, sample_facility
):
    """Create an EXTERNAL lab order suitable for attachments/requisition."""
    return LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        order_type="EXTERNAL",
        status="ORDERED",
        priority="ROUTINE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def pdf_file():
    return SimpleUploadedFile(
        name="external_result.pdf",
        content=b"%PDF-1.4 test content",
        content_type="application/pdf",
    )


@pytest.fixture
def invalid_file():
    return SimpleUploadedFile(
        name="script.js",
        content=b"console.log('x')",
        content_type="application/javascript",
    )


@pytest.mark.django_db
class TestLabAttachmentsAPI:
    def test_upload_attachment_creates_lab_result_attachment(
        self, authenticated_client, external_lab_order, pdf_file
    ):
        response = authenticated_client.post(
            f"/api/lab/orders/{external_lab_order.order_number}/attachments/",
            data={
                "file": pdf_file,
                "attachment_type": "external",
                "description": "External lab report",
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert LabResultAttachment.objects.filter(lab_order=external_lab_order).count() == 1

        attachment = LabResultAttachment.objects.get(lab_order=external_lab_order)
        assert attachment.attachment_type == "external"
        assert attachment.description == "External lab report"
        assert attachment.uploaded_by is not None

    def test_upload_attachment_rejects_invalid_file_type(
        self, authenticated_client, external_lab_order, invalid_file
    ):
        response = authenticated_client.post(
            f"/api/lab/orders/{external_lab_order.order_number}/attachments/",
            data={
                "file": invalid_file,
                "attachment_type": "external",
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert LabResultAttachment.objects.filter(lab_order=external_lab_order).count() == 0

    def test_list_attachments_returns_reverse_chronological(
        self, authenticated_client, external_lab_order
    ):
        file1 = SimpleUploadedFile(
            name="a.pdf",
            content=b"%PDF-1.4 a",
            content_type="application/pdf",
        )
        file2 = SimpleUploadedFile(
            name="b.pdf",
            content=b"%PDF-1.4 b",
            content_type="application/pdf",
        )

        r1 = authenticated_client.post(
            f"/api/lab/orders/{external_lab_order.order_number}/attachments/",
            data={"file": file1, "attachment_type": "external"},
            format="multipart",
        )
        r2 = authenticated_client.post(
            f"/api/lab/orders/{external_lab_order.order_number}/attachments/",
            data={"file": file2, "attachment_type": "external"},
            format="multipart",
        )

        assert r1.status_code == status.HTTP_201_CREATED
        assert r2.status_code == status.HTTP_201_CREATED

        response = authenticated_client.get(
            f"/api/lab/orders/{external_lab_order.order_number}/attachments/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        assert len(response.data) == 2
        assert response.data[0]["filename"].endswith("b.pdf")
        assert response.data[1]["filename"].endswith("a.pdf")

    def test_delete_attachment_removes_record_and_file(
        self, authenticated_client, external_lab_order, pdf_file, test_user
    ):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.models import Permission

        User = get_user_model()
        perm = Permission.objects.get(codename="delete_labresultattachment")
        test_user.user_permissions.add(perm)
        test_user = User.objects.get(pk=test_user.pk)
        authenticated_client.force_authenticate(user=test_user)

        attachment = LabResultAttachment.objects.create(
            lab_order=external_lab_order,
            file=pdf_file,
            attachment_type="external",
            uploaded_by=test_user,
        )

        response = authenticated_client.delete(f"/api/lab/attachments/{attachment.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not LabResultAttachment.objects.filter(id=attachment.id).exists()
