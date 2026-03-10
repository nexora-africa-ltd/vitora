"""
Tests for Birth Certificate Identification Type feature.

DHA Compliance Gap #8: Birth Certificate must be a valid identification type.

Following TDD principles, these tests verify:
1. birth_certificate is in IDENTIFICATION_TYPE_CHOICES
2. Patients can be created with birth_certificate identification
3. API accepts birth_certificate as valid identification_type
4. Serializer validates birth_certificate correctly
5. Unique constraint works correctly for birth_certificate
"""

from datetime import date

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.patients.models import Patient
from hmis.apps.patients.serializers import PatientSerializer

pytestmark = pytest.mark.django_db


class TestBirthCertificateIdentificationType:
    """Tests for birth_certificate as a valid identification type."""

    def test_birth_certificate_in_identification_type_choices(self):
        """Verify birth_certificate is included in IDENTIFICATION_TYPE_CHOICES."""
        choices = dict(Patient.IDENTIFICATION_TYPE_CHOICES)

        assert "birth_certificate" in choices
        assert choices["birth_certificate"] == "Birth Certificate"

    def test_create_patient_with_birth_certificate(self, db, sample_county, sample_sub_county):
        """Should create patient with birth_certificate identification type."""
        patient = Patient.objects.create(
            first_name="Baby",
            last_name="Wanjiku",
            date_of_birth=date(2024, 1, 15),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_type="birth_certificate",
            identification_number="BCN-2024-001234",
        )

        assert patient.pk is not None
        assert patient.identification_type == "birth_certificate"
        assert patient.identification_number == "BCN-2024-001234"

    def test_api_accepts_birth_certificate_identification(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """API should accept birth_certificate as valid identification_type."""
        patient_data = {
            "first_name": "Infant",
            "last_name": "Mwangi",
            "date_of_birth": "2023-06-20",
            "gender": "M",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
            "identification_type": "birth_certificate",
            "identification_number": "BCN-2023-005678",
        }

        response = authenticated_client.post("/api/patients/", patient_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["identification_type"] == "birth_certificate"
        assert response.data["identification_number"] == "BCN-2023-005678"

    def test_serializer_validates_birth_certificate(self, sample_county, sample_sub_county):
        """Serializer should validate birth_certificate as valid choice."""
        data = {
            "first_name": "Child",
            "last_name": "Ochieng",
            "date_of_birth": "2022-03-10",
            "gender": "M",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
            "identification_type": "birth_certificate",
            "identification_number": "BCN-2022-009876",
        }

        serializer = PatientSerializer(data=data)

        assert serializer.is_valid(), f"Serializer errors: {serializer.errors}"
        assert serializer.validated_data["identification_type"] == "birth_certificate"

    def test_different_birth_certificate_numbers_unique(self, db, sample_county, sample_sub_county):
        """Different patients can have birth certificates with different numbers."""
        # Create first patient with birth certificate
        p1 = Patient.objects.create(
            first_name="Twin",
            last_name="One",
            date_of_birth=date(2024, 2, 14),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_type="birth_certificate",
            identification_number="BCN-2024-TWIN-001",
        )

        # Create second patient with different birth certificate number
        p2 = Patient.objects.create(
            first_name="Twin",
            last_name="Two",
            date_of_birth=date(2024, 2, 14),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_type="birth_certificate",
            identification_number="BCN-2024-TWIN-002",
        )

        # Both patients should exist with different PKs
        assert p1.pk != p2.pk
        assert p1.identification_number != p2.identification_number
        assert Patient.objects.filter(identification_type="birth_certificate").count() == 2
