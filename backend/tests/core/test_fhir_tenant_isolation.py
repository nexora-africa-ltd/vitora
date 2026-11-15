# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
FHIR tenant-isolation regression tests.

Run with:
    poetry run pytest tests/core/test_fhir_tenant_isolation.py --no-cov

Inputs:
    Shared pytest organization, facility, user, and API-client fixtures.
"""

from datetime import date

import pytest  # type: ignore
from rest_framework import status


@pytest.mark.django_db
class TestFHIRTenantIsolation:
    """FHIR APIs must never disclose or create data outside the caller's tenant."""

    @pytest.fixture
    def foreign_patient(self, sample_county, sample_sub_county):
        """Create a patient owned by a different organization."""
        from hmis.apps.core.models import Facility, Organization
        from hmis.apps.patients.models import Patient

        organization = Organization.objects.create(
            name="Foreign Health Group",
            slug="foreign-health-group",
            contact_email="admin@foreign.example",
            is_active=True,
            is_verified=True,
        )
        facility = Facility.objects.create(
            organization=organization,
            name="Foreign Clinic",
            mfl_code="88888",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        return Patient.objects.create(
            first_name="Foreign",
            last_name="Patient",
            date_of_birth=date(1984, 2, 1),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=organization,
            registered_at_facility=facility,
        )

    def test_patient_search_excludes_other_organizations(
        self, authenticated_client, sample_patient, foreign_patient
    ):
        """An internal caller receives only patients in its organization."""
        response = authenticated_client.get("/fhir/Patient", {"name": "Patient"})

        assert response.status_code == status.HTTP_200_OK
        patient_ids = {entry["resource"]["id"] for entry in response.data["entry"]}
        assert str(sample_patient.id) not in patient_ids
        assert str(foreign_patient.id) not in patient_ids

    def test_patient_read_denies_other_organization(self, authenticated_client, foreign_patient):
        """A direct FHIR read cannot cross the organization boundary."""
        response = authenticated_client.get(f"/fhir/Patient/{foreign_patient.id}")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_fhir_patient_create_stamps_request_tenant(
        self,
        authenticated_client,
        sample_county,
        sample_sub_county,
        sample_organization,
        sample_facility,
    ):
        """Inbound FHIR patient creation derives tenant ownership from the caller."""
        response = authenticated_client.post(
            "/fhir/Patient/",
            {
                "resourceType": "Patient",
                "name": [{"family": "FHIR", "given": ["Inbound"]}],
                "gender": "female",
                "birthDate": "1990-05-15",
                "address": [{"state": sample_county.name, "district": sample_sub_county.name}],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED

        from hmis.apps.patients.models import Patient

        patient = Patient.objects.get(pk=response.data["id"])
        assert patient.organization == sample_organization
        assert patient.registered_at_facility == sample_facility
