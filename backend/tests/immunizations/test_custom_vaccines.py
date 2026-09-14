# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests facility-scoped custom vaccines and their non-KEPI workflows.

Run with: poetry run pytest tests/immunizations/test_custom_vaccines.py -q
Inputs: standard tenant and authenticated-client pytest fixtures.
"""

from datetime import date

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.immunizations.models import FacilityCustomVaccine
from hmis.apps.immunizations.services.schedule import generate_kepi_schedule


@pytest.mark.django_db
class TestFacilityCustomVaccines:
    """Facility custom vaccines remain local and are never part of KEPI schedules."""

    def test_api_scopes_custom_vaccines_to_active_facility(
        self,
        authenticated_client,
        sample_facility,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        from hmis.apps.core.models import Facility

        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code="CUSTOM-OTHER",
            organization=sample_organization,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        FacilityCustomVaccine.objects.create(
            facility=other_facility,
            organization=sample_organization,
            code="OTHER-FLU",
            name="Other Flu",
            workflow="PRIVATE",
        )

        response = authenticated_client.get("/api/immunizations/custom-vaccines/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 0

    def test_custom_vaccine_can_be_created_for_manual_workflows(
        self, authenticated_client, sample_facility
    ):
        response = authenticated_client.post(
            "/api/immunizations/custom-vaccines/",
            {
                "code": "CLINIC-FLU",
                "name": "Private Influenza Vaccine",
                "workflow": "PRIVATE",
                "route": "IM",
                "target_population": "ADULT",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["facility"] == sample_facility.id
        assert response.data["workflow"] == "PRIVATE"

    def test_custom_vaccine_is_excluded_from_kepi_generation(
        self,
        sample_facility,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        from hmis.apps.patients.models import Patient

        child_patient = Patient.objects.create(
            first_name="Custom",
            last_name="Child",
            date_of_birth=date.today(),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )
        FacilityCustomVaccine.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            code="LOCAL-BCG",
            name="Local BCG Alternative",
            workflow="MANUAL",
        )

        records = generate_kepi_schedule(child_patient, create_appointments=False)

        assert records == []

    def test_campaign_accepts_its_facility_custom_vaccine(
        self, authenticated_client, sample_facility, sample_organization
    ):
        vaccine = FacilityCustomVaccine.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            code="CAMPAIGN-LOCAL",
            name="Local Campaign Vaccine",
            workflow="CAMPAIGN",
        )

        response = authenticated_client.post(
            "/api/immunizations/campaigns/",
            {
                "name": "Local Campaign",
                "start_date": str(date.today()),
                "end_date": str(date.today()),
                "target_population": "ALL",
                "custom_vaccines": [vaccine.id],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["custom_vaccines"] == [vaccine.id]
