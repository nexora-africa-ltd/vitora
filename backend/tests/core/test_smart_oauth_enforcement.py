# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
End-to-end SMART OAuth enforcement tests.

Run with: poetry run pytest tests/core/test_smart_oauth_enforcement.py -q
Inputs: django-oauth-toolkit AccessToken records and FHIR bearer requests.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from oauth2_provider.models import AccessToken, Application
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import SMARTTokenContext
from tests.conftest import ensure_staff_profile

User = get_user_model()


@pytest.mark.django_db
class TestSMARTOAuthFHIRAuthorization:
    """FHIR bearer requests must use persisted SMART scope and patient context."""

    @pytest.fixture
    def oauth_client(self, sample_organization, sample_facility):
        """Create a DOT access token bound to one SMART launch patient."""
        user = User.objects.create_user(username="smart-fhir-user", password="testpass123")
        ensure_staff_profile(user, sample_organization, sample_facility)
        application = Application.objects.create(
            name="SMART test app",
            client_type=Application.CLIENT_CONFIDENTIAL,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            user=user,
        )
        token = AccessToken.objects.create(
            user=user,
            application=application,
            token="smart-oauth-access-token",
            scope="patient/Patient.read",
            expires=timezone.now() + timedelta(hours=1),
        )
        return token

    def client_for(self, token):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.token}")
        return client

    def test_patient_scope_allows_context_patient_and_denies_another(
        self, oauth_client, sample_patient, sample_county, sample_sub_county
    ):
        """A DOT bearer token can only read its persisted launch patient."""
        other_patient = sample_patient.__class__.objects.create(
            first_name="Other",
            last_name="Patient",
            gender="F",
            date_of_birth="1990-01-01",
            county=sample_county,
            sub_county=sample_sub_county,
            registered_by=oauth_client.user,
        )
        SMARTTokenContext.objects.create(access_token=oauth_client, patient=sample_patient)
        client = self.client_for(oauth_client)

        allowed = client.get(f"/fhir/Patient/{sample_patient.pk}")
        denied = client.get(f"/fhir/Patient/{other_patient.pk}")

        assert allowed.status_code == status.HTTP_200_OK
        assert denied.status_code == status.HTTP_403_FORBIDDEN

    def test_patient_scope_search_is_limited_to_context_patient(
        self, oauth_client, sample_patient, sample_county, sample_sub_county
    ):
        """Patient-scoped FHIR search never leaks a second patient's record."""
        other_patient = sample_patient.__class__.objects.create(
            first_name="Other",
            last_name="Patient",
            gender="F",
            date_of_birth="1990-01-01",
            county=sample_county,
            sub_county=sample_sub_county,
            registered_by=oauth_client.user,
        )
        SMARTTokenContext.objects.create(access_token=oauth_client, patient=sample_patient)

        response = self.client_for(oauth_client).get("/fhir/Patient")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total"] == 1
        assert response.data["entry"][0]["resource"]["id"] == str(sample_patient.pk)
        returned_ids = [entry["resource"]["id"] for entry in response.data["entry"]]
        assert str(other_patient.pk) not in returned_ids

    def test_patient_scope_denies_direct_allergy_for_another_patient(
        self, oauth_client, sample_patient, sample_county, sample_sub_county, sample_organization
    ):
        """A direct clinical read must resolve ownership through Allergy.patient."""
        from hmis.apps.patients.models import Allergy

        other_patient = sample_patient.__class__.objects.create(
            first_name="Other",
            last_name="Patient",
            gender="F",
            date_of_birth="1990-01-01",
            county=sample_county,
            sub_county=sample_sub_county,
            registered_by=oauth_client.user,
        )
        allergy = Allergy.objects.create(
            patient=other_patient,
            substance="Penicillin",
            organization=sample_organization,
        )
        oauth_client.scope = "patient/AllergyIntolerance.read"
        oauth_client.save(update_fields=["scope"])
        SMARTTokenContext.objects.create(access_token=oauth_client, patient=sample_patient)

        response = self.client_for(oauth_client).get(f"/fhir/AllergyIntolerance/{allergy.pk}")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_patient_scope_denies_practitioner_without_patient_ownership(
        self, oauth_client, sample_patient
    ):
        """Patient scopes cannot be used to read reference resources without a patient owner."""
        staff = oauth_client.user.staff_profile
        oauth_client.scope = "patient/Practitioner.read"
        oauth_client.save(update_fields=["scope"])
        SMARTTokenContext.objects.create(access_token=oauth_client, patient=sample_patient)

        response = self.client_for(oauth_client).get(f"/fhir/Practitioner/{staff.pk}")

        assert response.status_code == status.HTTP_403_FORBIDDEN

        oauth_client.scope = "user/Practitioner.read"
        oauth_client.save(update_fields=["scope"])
        assert (
            self.client_for(oauth_client).get(f"/fhir/Practitioner/{staff.pk}").status_code
            == status.HTTP_200_OK
        )

        oauth_client.scope = "system/Practitioner.read"
        oauth_client.save(update_fields=["scope"])
        assert (
            self.client_for(oauth_client).get(f"/fhir/Practitioner/{staff.pk}").status_code
            == status.HTTP_200_OK
        )

    def test_oauth_fhir_request_without_clinical_scope_is_denied(self, oauth_client):
        """OAuth FHIR traffic is fail-closed when no matching SMART scope exists."""
        oauth_client.scope = "openid profile"
        oauth_client.save(update_fields=["scope"])

        response = self.client_for(oauth_client).get("/fhir/Patient/1")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_patient_scope_write_denies_a_different_patient(
        self, oauth_client, sample_patient, sample_county, sample_sub_county
    ):
        """Patient-scoped FHIR writes cannot name a patient outside launch context."""
        other_patient = sample_patient.__class__.objects.create(
            first_name="Other",
            last_name="Patient",
            gender="F",
            date_of_birth="1990-01-01",
            county=sample_county,
            sub_county=sample_sub_county,
            registered_by=oauth_client.user,
        )
        oauth_client.scope = "patient/Observation.write"
        oauth_client.save(update_fields=["scope"])
        SMARTTokenContext.objects.create(access_token=oauth_client, patient=sample_patient)

        response = self.client_for(oauth_client).post(
            "/fhir/Observation/",
            {
                "resourceType": "Observation",
                "status": "final",
                "subject": {"reference": f"Patient/{other_patient.pk}"},
                "code": {"coding": [{"system": "http://loinc.org", "code": "718-7"}]},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_clinical_fhir_resource_is_not_public(self, sample_patient):
        """Only metadata/discovery endpoints may be accessed anonymously."""
        response = APIClient().get(f"/fhir/Patient/{sample_patient.pk}")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
