# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for platform-managed SDMX contracts, codelists, and mappings."""

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.quality.models import FacilitySDMXConfiguration, SDMXCodeMapping, SDMXContract
from tests.conftest import ensure_staff_profile


@pytest.fixture
def contract_data():
    """Return a valid DHA/KHIS SDMX contract payload."""
    return {
        "partner": "KHIS",
        "environment": "SANDBOX",
        "agency_id": "KHIS",
        "dataflow_id": "FACILITY_STATS",
        "dsd_id": "DSD_FACILITY_STATS",
        "version": "1.0",
        "endpoint_url": "https://sandbox.khis.example/sdmx/data",
        "receiver_id": "KHIS",
        "is_active": False,
    }


@pytest.fixture
def sdmx_contract(db, contract_data):
    """Create a global SDMX contract."""
    return SDMXContract.objects.create(**contract_data)


@pytest.fixture
def superuser_client(db, sample_organization, sample_facility):
    """Return an authenticated Nexora superuser client."""
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_superuser(
        username="sdmx-superuser",
        email="sdmx-superuser@example.com",
        password="superpass123",
    )
    ensure_staff_profile(user, sample_organization, sample_facility)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class TestSDMXContractModel:
    """Tests for SDMX contract invariants."""

    def test_contract_is_global_and_identified_by_external_version(self, sdmx_contract):
        """A contract has no tenant context and retains its external identifiers."""
        assert not hasattr(sdmx_contract, "organization_id")
        assert not hasattr(sdmx_contract, "facility_id")
        assert str(sdmx_contract) == "KHIS FACILITY_STATS v1.0 (Sandbox)"

    def test_contract_external_identity_is_unique(self, db, contract_data, sdmx_contract):
        """The same partner/dataflow/version cannot be registered twice."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            SDMXContract.objects.create(**contract_data)

    def test_active_mapping_requires_a_code(self, sdmx_contract):
        """Mappings cannot be activated without an authoritative target code."""
        mapping = SDMXCodeMapping(
            contract=sdmx_contract,
            dimension="INDICATOR",
            source_code="TOTAL_VISITS",
            target_code="",
            is_active=True,
        )

        with pytest.raises(Exception, match="target_code"):
            mapping.full_clean()


class TestSDMXContractApi:
    """Tests for the Nexora-only contract configuration API."""

    def test_anonymous_user_cannot_list_contracts(self, api_client):
        """Contract configuration must require authentication."""
        response = api_client.get("/api/quality/sdmx/contracts/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_tenant_user_cannot_list_contracts(self, authenticated_client):
        """Tenant staff cannot view national integration configuration."""
        response = authenticated_client.get("/api/quality/sdmx/contracts/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_superuser_can_create_and_list_contracts(self, superuser_client, contract_data):
        """Platform superusers receive the read serializer shape after creation."""
        create_response = superuser_client.post(
            "/api/quality/sdmx/contracts/",
            contract_data,
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        assert create_response.data["id"]
        assert create_response.data["display_name"] == "KHIS FACILITY_STATS v1.0"
        assert create_response.data["mapping_count"] == 0

        list_response = superuser_client.get("/api/quality/sdmx/contracts/")
        assert list_response.status_code == status.HTTP_200_OK
        assert list_response.data["count"] == 1

    def test_superuser_can_create_mapping(self, superuser_client, sdmx_contract):
        """Mappings are created under a selected contract."""
        response = superuser_client.post(
            "/api/quality/sdmx/mappings/",
            {
                "contract": sdmx_contract.id,
                "dimension": "INDICATOR",
                "source_code": "TOTAL_VISITS",
                "target_code": "OPD_TOTAL",
                "target_name": "Total outpatient visits",
                "is_active": True,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["target_code"] == "OPD_TOTAL"


class TestFacilitySDMXConfiguration:
    """Tests for per-facility SDMX enablement and tenant inheritance."""

    def test_facility_configuration_inherits_organization(self, sdmx_contract, sample_facility):
        """The facility scope determines the organization scope automatically."""
        config = FacilitySDMXConfiguration.objects.create(
            facility=sample_facility,
            contract=sdmx_contract,
            is_enabled=True,
            facility_code="12345",
            report_types=["QuarterlyReport"],
        )

        assert config.organization_id == sample_facility.organization_id
        assert config.is_ready is True

    def test_only_one_configuration_per_facility_and_contract(
        self, db, sdmx_contract, sample_facility
    ):
        """A facility cannot enable the same contract more than once."""
        from django.db import IntegrityError

        FacilitySDMXConfiguration.objects.create(facility=sample_facility, contract=sdmx_contract)
        with pytest.raises(IntegrityError):
            FacilitySDMXConfiguration.objects.create(
                facility=sample_facility,
                contract=sdmx_contract,
            )

    def test_superuser_can_enable_contract_for_facility(
        self, superuser_client, sdmx_contract, sample_facility
    ):
        """Only platform staff can enable national submission for a facility."""
        response = superuser_client.post(
            "/api/quality/sdmx/facility-configs/",
            {
                "facility": sample_facility.id,
                "contract": sdmx_contract.id,
                "is_enabled": True,
                "facility_code": "12345",
                "report_types": ["QuarterlyReport", "IDSRWeeklyReport"],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["organization"] == sample_facility.organization_id
        assert response.data["is_ready"] is True
