"""
Tests for the Facility DHA registry cache and PII encryption.

Covers:
* ``update_from_dha_response`` model method (non-PII + PII extraction).
* PII field encryption (biometrics_agent_national_id, dha_admin_* fields).
* ``sync-dha-registry`` API endpoint (mocks ILM service).
* Serializer includes DHA cache fields (read-only).
* PII stripped from ``dha_registry_data`` JSON blob.
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from tests.conftest import ensure_staff_profile

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def dha_response_data():
    """Sample DHA ILM facility search response payload."""
    return {
        "officialName": "Test Health Centre",
        "fidCode": "FID-001",
        "frCode": "FID-47-99999-1",
        "registrationNumber": "REG-001",
        "facilityType": "Health Centre",
        "contractTypes": ["Outpatient", "Inpatient", "Outpatient"],
        "kephLevel": "Level 3",
        "shaContractStatus": "ACTIVE",
        "shaConstractStartDate": "2025-01-01 00:00:00",
        "shaConstractEndDate": "2026-12-31 00:00:00",
        "shaContractedServices": ["Outpatient", "Pharmacy"],
        "facilityLicenseStatus": "LICENSED",
        "licenseNumber": "LIC-99999",
        "facilityLicenseStartDate": "2024-01-01 00:00:00",
        "facilityLicenseEndDate": "2027-01-01 00:00:00",
        "facilityOwnership": "GOK",
        "regulatoryBody": "kmpdb",
        "regulatoryOperationalStatus": {
            "operationalStatus": "ACTIVE",
            "operationalStatusReason": "",
        },
        "SHAOperationStatus": {"operationalStatus": "ACTIVE"},
        "bedOccupancy": {
            "totalBeds": 50,
            "normalBeds": 30,
            "icuBeds": 5,
            "hduBeds": 10,
            "dialysisBeds": 3,
            "numberOfCots": 2,
        },
        # PII fields
        "facilityAdministratorName": "Dr. Jane Doe",
        "facilityAdministratorPhone": "0712345678",
        "facilityAdministratorEmail": "jane@example.com",
        "facilityAdministratorIdentifier": "12345678",
        "facilityPhoneNumber": "0701234567",
        "facilityEmail": "info@test-hc.ke",
        # Address
        "address": {
            "county": "Nairobi",
            "subCounty": "Westlands",
            "physicalLocation": "Off Waiyaki Way",
            "postalAddress": "P.O. Box 99999",
            "town": "Nairobi",
            "latitude": "-1.263",
            "longitude": "36.803",
        },
    }


# ============================================================================
# Model Tests
# ============================================================================


class TestFacilityDhaRegistryModel:
    """Tests for Facility.update_from_dha_response and PII encryption."""

    def test_update_from_dha_response_populates_non_pii(self, sample_facility, dha_response_data):
        """Non-PII columns should be populated from DHA response."""
        sample_facility.name = "Local Name"
        sample_facility.mfl_code = "OLD-MFL-001"
        sample_facility.level = "2"
        sample_facility.ownership = "PRIVATE"
        sample_facility.sha_facility_code = ""
        sample_facility.sha_contracted = False
        sample_facility.sha_contract_expiry = None
        updated_fields = sample_facility.update_from_dha_response(dha_response_data)
        sample_facility.save()
        sample_facility.refresh_from_db()

        assert "name" in updated_fields
        assert "mfl_code" in updated_fields
        assert "level" in updated_fields
        assert "ownership" in updated_fields
        assert "sha_facility_code" in updated_fields
        assert "sha_contracted" in updated_fields
        assert "sha_contract_expiry" in updated_fields

        assert sample_facility.name == "Test Health Centre"
        assert sample_facility.mfl_code == "REG-001"
        assert sample_facility.level == "3"
        assert sample_facility.ownership == "GOK"
        assert sample_facility.sha_facility_code == "FID-47-99999-1"
        assert sample_facility.sha_contracted is True
        assert str(sample_facility.sha_contract_expiry) == "2026-12-31"

        assert sample_facility.dha_fid_code == "FID-001"
        assert sample_facility.dha_fr_code == "FID-47-99999-1"
        assert sample_facility.dha_license_status == "LICENSED"
        assert sample_facility.dha_license_number == "LIC-99999"
        assert sample_facility.dha_facility_type == "Health Centre"
        assert sample_facility.dha_facility_type_normalized == "HEALTH_CENTRE"
        assert sample_facility.dha_keph_level == "Level 3"
        assert sample_facility.dha_ownership == "GOK"
        assert sample_facility.dha_regulatory_body == "kmpdb"
        assert sample_facility.dha_contract_types == ["Outpatient", "Inpatient"]
        assert sample_facility.dha_sha_contract_status == "ACTIVE"
        assert sample_facility.dha_operational_status == "ACTIVE"
        assert sample_facility.dha_total_beds == 50
        assert sample_facility.dha_icu_beds == 5
        assert sample_facility.dha_hdu_beds == 10
        assert sample_facility.dha_registry_synced_at is not None

    def test_update_from_dha_response_encrypts_pii(self, sample_facility, dha_response_data):
        """PII fields should be encrypted and retrievable via properties."""
        sample_facility.update_from_dha_response(dha_response_data)
        sample_facility.save()
        sample_facility.refresh_from_db()

        # Decrypted values via property
        assert sample_facility.dha_admin_name == "Dr. Jane Doe"
        assert sample_facility.dha_admin_phone == "0712345678"
        assert sample_facility.dha_admin_email == "jane@example.com"
        assert sample_facility.dha_admin_id == "12345678"
        assert sample_facility.dha_facility_phone == "0701234567"
        assert sample_facility.dha_facility_email == "info@test-hc.ke"

        # Raw encrypted columns should not be plaintext
        assert sample_facility.dha_admin_name_encrypted != "Dr. Jane Doe"
        assert sample_facility.dha_admin_name_encrypted != ""

    def test_update_from_dha_response_contract_types_fallback(
        self, sample_facility, dha_response_data
    ):
        """Should fallback to shaContractedServices when contractTypes is absent."""
        payload = {
            **dha_response_data,
            "contractTypes": None,
            "shaContractedServices": ["Maternity", "Outpatient", "Maternity"],
        }

        sample_facility.update_from_dha_response(payload)
        sample_facility.save()
        sample_facility.refresh_from_db()

        assert sample_facility.dha_contract_types == ["Maternity", "Outpatient"]

    def test_dha_registry_data_excludes_pii(self, sample_facility, dha_response_data):
        """dha_registry_data JSON blob should NOT contain PII keys."""
        sample_facility.update_from_dha_response(dha_response_data)

        data = sample_facility.dha_registry_data
        assert data is not None
        pii_keys = {
            "facilityAdministratorName",
            "facilityAdministratorPhone",
            "facilityAdministratorEmail",
            "facilityAdministratorIdentifier",
            "facilityPhoneNumber",
            "facilityEmail",
        }
        for key in pii_keys:
            assert key not in data, f"PII key {key} found in dha_registry_data"

        # Non-PII should still be present
        assert data.get("fidCode") == "FID-001"
        assert data.get("shaContractStatus") == "ACTIVE"
        assert "address" in data

    def test_biometrics_agent_national_id_encrypted(self, sample_facility):
        """biometrics_agent_national_id should use encrypted storage."""
        sample_facility.biometrics_agent_national_id = "99887766"
        sample_facility.save()
        sample_facility.refresh_from_db()

        assert sample_facility.biometrics_agent_national_id == "99887766"
        assert sample_facility.biometrics_agent_national_id_encrypted != "99887766"
        assert sample_facility.biometrics_agent_national_id_encrypted != ""

    def test_update_from_dha_response_handles_empty_data(self, sample_facility):
        """Should gracefully handle empty/missing DHA fields."""
        updated_fields = sample_facility.update_from_dha_response({})
        sample_facility.save()
        sample_facility.refresh_from_db()

        assert updated_fields == []
        assert sample_facility.dha_fid_code == ""
        assert sample_facility.dha_total_beds == 0
        assert sample_facility.dha_admin_name == ""
        assert sample_facility.dha_registry_synced_at is not None

    def test_update_from_dha_response_parses_level_subtype(
        self, sample_facility, dha_response_data
    ):
        """DHA levels like 'Level 3B' should map to level=3 and subtype=B."""
        sample_facility.level = "4"
        sample_facility.level_subtype = ""

        payload = {**dha_response_data, "kephLevel": "Level 3B"}
        updated_fields = sample_facility.update_from_dha_response(payload)
        sample_facility.save()
        sample_facility.refresh_from_db()

        assert "level" in updated_fields
        assert "level_subtype" in updated_fields
        assert sample_facility.level == "3"
        assert sample_facility.level_subtype == "B"

    def test_update_from_dha_response_maps_address_to_location_fields(
        self,
        sample_facility,
        dha_response_data,
        sample_county,
        sample_sub_county,
    ):
        """DHA address should map to facility location FKs and text fields."""
        sample_facility.county = None
        sample_facility.sub_county = None
        sample_facility.region_state = ""
        sample_facility.district = ""
        sample_facility.locality = ""

        payload = {
            **dha_response_data,
            "address": {
                "county": sample_county.name,
                "subCounty": sample_sub_county.name,
                "physicalLocation": "Off Waiyaki Way",
                "postalAddress": "P.O. Box 99999",
                "town": "Nairobi",
                "latitude": "-1.263",
                "longitude": "36.803",
            },
        }

        updated_fields = sample_facility.update_from_dha_response(payload)
        sample_facility.save()
        sample_facility.refresh_from_db()

        assert "county" in updated_fields
        assert "sub_county" in updated_fields
        assert "region_state" in updated_fields
        assert "district" in updated_fields
        assert "locality" in updated_fields

        assert sample_facility.county_id == sample_county.id
        assert sample_facility.sub_county_id == sample_sub_county.id
        assert sample_facility.region_state == sample_county.name
        assert sample_facility.district == sample_sub_county.name
        assert sample_facility.locality == "Nairobi"


# ============================================================================
# API Tests
# ============================================================================


class TestSyncDhaRegistryAPI:
    """Tests for POST /api/facilities/{id}/sync-dha-registry/."""

    @pytest.fixture(autouse=True)
    def _setup(self, authenticated_client, sample_facility, sample_organization, test_user):
        self.client = authenticated_client
        self.facility = sample_facility
        self.url = f"/api/facilities/{sample_facility.id}/sync-dha-registry/"
        ensure_staff_profile(test_user, sample_organization, sample_facility, employee_id="DHA-001")

    @patch("hmis.apps.billing.services.ilm_registries_service.IlmRegistriesService")
    def test_sync_dha_registry_success(self, mock_service_class, dha_response_data):
        """Should fetch DHA data, cache it, and return updated facility."""
        self.facility.name = "Old Local Name"
        self.facility.level = "2"
        self.facility.ownership = "PRIVATE"
        self.facility.sha_contracted = False
        self.facility.sha_facility_code = ""
        self.facility.sha_contract_expiry = None
        self.facility.save()

        mock_result = MagicMock()
        mock_result.status_code = 200
        mock_result.payload = dha_response_data
        mock_service_class.return_value.search_facility.return_value = mock_result

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["dha_fid_code"] == "FID-001"
        assert response.data["dha_license_status"] == "LICENSED"
        assert response.data["dha_admin_name"] == "Dr. Jane Doe"
        assert response.data["dha_total_beds"] == 50
        assert response.data["dha_facility_type_normalized"] == "HEALTH_CENTRE"
        assert response.data["dha_contract_types"] == ["Outpatient", "Inpatient"]
        assert response.data["dha_registry_synced_at"] is not None
        assert response.data["name"] == "Test Health Centre"
        assert response.data["level"] == "3"
        assert response.data["ownership"] == "GOK"
        assert response.data["sha_facility_code"] == "FID-47-99999-1"
        assert response.data["sha_contracted"] is True
        assert response.data["sha_contract_expiry"] == "2026-12-31"

    @patch("hmis.apps.billing.services.ilm_registries_service.IlmRegistriesService")
    def test_sync_dha_registry_wraps_array_response(self, mock_service_class, dha_response_data):
        """Should handle DHA wrapping response in results array."""
        mock_result = MagicMock()
        mock_result.status_code = 200
        mock_result.payload = {"results": [dha_response_data]}
        mock_service_class.return_value.search_facility.return_value = mock_result

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["dha_fid_code"] == "FID-001"

    @patch("hmis.apps.billing.services.ilm_registries_service.IlmRegistriesService")
    def test_sync_dha_registry_dha_error(self, mock_service_class):
        """Should return 502 when DHA raises DHAError (e.g. HTTP 400/500)."""
        from hmis.apps.billing.services.dha_errors import DHAValidationError

        mock_service_class.return_value.search_facility.side_effect = DHAValidationError(
            "Invalid identifier format"
        )

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert "DHA registry lookup failed" in response.data["detail"]
        assert "Invalid identifier format" in response.data["detail"]

    @patch("hmis.apps.billing.services.ilm_registries_service.IlmRegistriesService")
    def test_sync_dha_registry_empty_response(self, mock_service_class):
        """Should return 502 when DHA returns empty payload."""
        mock_result = MagicMock()
        mock_result.status_code = 200
        mock_result.payload = None
        mock_service_class.return_value.search_facility.return_value = mock_result

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_502_BAD_GATEWAY

    def test_sync_dha_registry_no_mfl_code(self, sample_facility):
        """Should return 400 if facility has no MFL code or SHA facility code."""
        sample_facility.mfl_code = ""
        sample_facility.sha_facility_code = ""
        sample_facility.save()

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "no MFL code or SHA facility code" in response.data["detail"]

    @patch("hmis.apps.billing.services.ilm_registries_service.IlmRegistriesService")
    def test_sync_dha_registry_fallback_to_sha_facility_code(
        self, mock_service_class, sample_facility, dha_response_data
    ):
        """Should fallback to sha_facility_code (fid) when mfl_code fails."""
        from hmis.apps.billing.services.dha_errors import DHAValidationError

        sample_facility.sha_facility_code = "FID-47-105963-0"
        sample_facility.save()

        # First call (sha_facility_code/fr-code) raises error,
        # second call (mfl_code/registration-number) succeeds
        mock_result = MagicMock()
        mock_result.status_code = 200
        mock_result.payload = dha_response_data
        mock_service_class.return_value.search_facility.side_effect = [
            DHAValidationError("Invalid MFL code"),
            mock_result,
        ]

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["dha_fid_code"] == "FID-001"
        # Verify both identifiers were tried
        calls = mock_service_class.return_value.search_facility.call_args_list
        assert calls[0].kwargs["identifier"] == "FID-47-105963-0"
        assert calls[0].kwargs["identifier_type"] == "fr-code"
        assert calls[1].kwargs["identifier_type"] == "registration-number"


# ============================================================================
# Serializer Tests
# ============================================================================


class TestFacilityDetailSerializerDhaFields:
    """Tests that DHA cache fields are included in the detail serializer."""

    def test_serializer_includes_dha_fields(
        self,
        authenticated_client,
        sample_facility,
        dha_response_data,
        test_user,
        sample_organization,
    ):
        """GET facility detail should include DHA cache fields."""
        ensure_staff_profile(test_user, sample_organization, sample_facility, employee_id="DHA-002")
        sample_facility.update_from_dha_response(dha_response_data)
        sample_facility.save()

        response = authenticated_client.get(f"/api/facilities/{sample_facility.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["dha_fid_code"] == "FID-001"
        assert response.data["dha_admin_name"] == "Dr. Jane Doe"
        assert response.data["dha_admin_phone"] == "0712345678"
        assert response.data["dha_facility_phone"] == "0701234567"
        assert response.data["dha_total_beds"] == 50
        assert response.data["dha_registry_synced_at"] is not None
        # dha_registry_data should be present but PII-free
        assert response.data["dha_registry_data"] is not None
        assert "facilityAdministratorName" not in response.data["dha_registry_data"]

    def test_serializer_includes_biometrics_agent_national_id(
        self,
        authenticated_client,
        sample_facility,
        test_user,
        sample_organization,
    ):
        """biometrics_agent_national_id should round-trip through serializer."""
        ensure_staff_profile(test_user, sample_organization, sample_facility, employee_id="DHA-003")
        sample_facility.biometrics_agent_national_id = "55667788"
        sample_facility.save()

        response = authenticated_client.get(f"/api/facilities/{sample_facility.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["biometrics_agent_national_id"] == "55667788"


class TestSyncBillingServicesAPI:
    """Tests for POST /api/facilities/{id}/sync-billing-services/."""

    @pytest.fixture(autouse=True)
    def _setup(self, authenticated_client, sample_facility, sample_organization, test_user):
        self.client = authenticated_client
        self.facility = sample_facility
        self.url = f"/api/facilities/{sample_facility.id}/sync-billing-services/"
        ensure_staff_profile(
            test_user, sample_organization, sample_facility, employee_id="BILLSYNC-001"
        )

    @patch("hmis.apps.billing.services.intervention_fallback.search_local_interventions")
    def test_sync_billing_services_creates_and_links_tariff_services(self, mock_search):
        """Should materialize intervention/tariff rows into billable Service records."""
        from hmis.apps.billing.models import Service, SHATariff

        mock_search.side_effect = [
            (
                [
                    {
                        "code": "SHA-01-OPD",
                        "name": "Outpatient Consultation",
                        "description": "OPD consult",
                        "category": "consultation",
                        "price": "500",
                        "is_active": True,
                    }
                ],
                1,
            ),
            ([], 1),
        ]

        tariff = SHATariff.objects.create(
            code="SHA-02-LAB",
            name="Basic Lab Panel",
            description="Lab bundle",
            category=SHATariff.TariffCategory.LABORATORY,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount="1500.00",
            effective_date=timezone.now().date(),
            is_active=True,
        )

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 2
        assert response.data["processed"] == 2
        assert response.data["tariffs_processed"] == 1

        intervention_service = Service.objects.get(code="SHA-01-OPD")
        assert intervention_service.sha_code == "SHA-01-OPD"
        assert str(intervention_service.unit_price) == "500.00"
        assert intervention_service.category.code == "SI_CONSULTATION"

        tariff_service = Service.objects.get(code="SHA-02-LAB")
        assert str(tariff_service.unit_price) == "1500.00"

        tariff.refresh_from_db()
        assert tariff.internal_service_id == tariff_service.id

    @patch("hmis.apps.billing.services.intervention_fallback.search_local_interventions")
    def test_sync_billing_services_updates_existing_service(self, mock_search):
        """Existing services should be updated idempotently when prices/names change."""
        from hmis.apps.billing.models import Service, ServiceCategory

        category = ServiceCategory.objects.create(
            facility=self.facility,
            code="GEN",
            name="General",
        )
        user = self.client.handler._force_user
        Service.objects.create(
            facility=self.facility,
            code="SHA-01-OPD",
            name="Old Name",
            description="Old",
            category=category,
            unit_price="200.00",
            currency="KES",
            created_by=user,
            sha_code="SHA-01-OPD",
            is_active=True,
        )

        mock_search.side_effect = [
            (
                [
                    {
                        "code": "SHA-01-OPD",
                        "name": "Updated Consultation",
                        "description": "Updated desc",
                        "price": "650",
                        "is_active": True,
                    }
                ],
                1,
            ),
            ([], 1),
        ]

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["updated"] == 1

        service = Service.objects.get(code="SHA-01-OPD")
        assert service.name == "Updated Consultation"
        assert service.description == "Updated desc"
        assert str(service.unit_price) == "650.00"

    @patch("hmis.apps.billing.services.intervention_fallback.search_local_interventions")
    def test_sync_billing_services_creates_unpriced_services_as_inactive(self, mock_search):
        """Interventions without tariff should still sync as inactive pending-tariff services."""
        from hmis.apps.billing.models import Service

        mock_search.side_effect = [
            (
                [
                    {
                        "code": "SHA-88-NOTAR",
                        "name": "Unpriced Intervention",
                        "description": "No tariff yet",
                        "category": "other",
                        "price": "0",
                        "is_active": True,
                    }
                ],
                1,
            ),
            ([], 1),
        ]

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["processed"] == 1
        assert response.data["skipped"] == 0

        service = Service.objects.get(code="SHA-88-NOTAR")
        assert service.unit_price is None
        assert service.is_active is False
        assert "Pending tariff" in service.description

    @patch("hmis.apps.billing.services.intervention_fallback.search_local_interventions")
    def test_sync_billing_services_reuses_existing_category_name(self, mock_search):
        """Should reuse existing category by name to avoid UNIQUE(name) collisions."""
        from hmis.apps.billing.models import Service, ServiceCategory

        ServiceCategory.objects.create(
            facility=self.facility,
            code="CONS",
            name="Consultation",
        )

        mock_search.side_effect = [
            (
                [
                    {
                        "code": "SHA-77-CONS",
                        "name": "Special Consultation",
                        "description": "Consult service",
                        "category": "consultation",
                        "price": "800",
                        "is_active": True,
                    }
                ],
                1,
            ),
            ([], 1),
        ]

        response = self.client.post(self.url)

        assert response.status_code == status.HTTP_200_OK
        service = Service.objects.get(code="SHA-77-CONS")
        assert service.category.code == "CONS"
