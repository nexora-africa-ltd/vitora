"""
Tests for Patient QR Code API endpoint.

TDD: Tests written BEFORE implementation.
"""

import base64
from io import BytesIO

import pytest  # type: ignore
from PIL import Image
from rest_framework import status


@pytest.mark.django_db
class TestPatientQRCode:
    """Tests for GET /api/patients/{id}/qr-code/"""

    def test_returns_qr_data_for_valid_patient(self, authenticated_client, sample_patient):
        """Should return QR code data URI for existing patient."""
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/qr-code/")

        assert response.status_code == status.HTTP_200_OK
        assert "qr_data_uri" in response.data
        assert response.data["qr_data_uri"].startswith("data:image/png;base64,")
        assert "mrn" in response.data
        assert response.data["mrn"] == sample_patient.mrn

    def test_qr_contains_patient_mrn(self, authenticated_client, sample_patient):
        """QR payload should encode the patient MRN."""
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/qr-code/")

        assert response.status_code == status.HTTP_200_OK
        assert "qr_payload" in response.data
        assert sample_patient.mrn in response.data["qr_payload"]

    def test_qr_image_is_valid_png(self, authenticated_client, sample_patient):
        """The base64-encoded image should decode to a valid PNG."""
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/qr-code/")

        assert response.status_code == status.HTTP_200_OK
        # Strip data URI prefix
        base64_str = response.data["qr_data_uri"].replace("data:image/png;base64,", "")
        decoded = base64.b64decode(base64_str)
        img = Image.open(BytesIO(decoded))
        assert img.format == "PNG"

    def test_returns_patient_name(self, authenticated_client, sample_patient):
        """Response should include patient name for display alongside QR."""
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/qr-code/")

        assert response.status_code == status.HTTP_200_OK
        assert "patient_name" in response.data
        assert sample_patient.first_name in response.data["patient_name"]

    def test_requires_authentication(self, api_client, sample_patient):
        """Should reject unauthenticated requests."""
        response = api_client.get(f"/api/patients/{sample_patient.id}/qr-code/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_returns_404_for_nonexistent_patient(self, authenticated_client):
        """Should return 404 for non-existent patient ID."""
        response = authenticated_client.get("/api/patients/99999/qr-code/")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_deterministic_qr_for_same_patient(self, authenticated_client, sample_patient):
        """Should produce identical QR codes for the same patient."""
        response1 = authenticated_client.get(f"/api/patients/{sample_patient.id}/qr-code/")
        response2 = authenticated_client.get(f"/api/patients/{sample_patient.id}/qr-code/")

        assert response1.data["qr_data_uri"] == response2.data["qr_data_uri"]
