"""
Tests for DHA Search Service (Facility & Practitioner).

TDD GREEN PHASE: These tests verify the implemented DHASearchService
integrates correctly with Kenya DHA Search APIs.

APIs Covered:
- GET /v1/facility-search - Search facility in Master Facility List
- GET /v1/practitioner-search - Search healthcare worker in HWR

Reference: docs/dha-api-usage-analysis.md
"""

from datetime import date
from unittest.mock import Mock

import pytest  # type: ignore
from django.conf import settings  # type: ignore

from hmis.apps.billing.services.dha_search import (
    DHASearchService,
    FacilityInfo,
    PractitionerInfo,
    SearchError,
)

# =============================================================================
# Facility Search Tests
# =============================================================================


class TestFacilitySearch:
    """Tests for facility search in Kenya Master Facility List."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create DHASearchService instance with mocked auth."""
        return DHASearchService()

    def test_search_facility_by_mfl_code(self, service, mock_requests_get):
        """Should search facility by MFL code."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "message": {
                    "facility_code": "24979",
                    "found": 1,
                    "approved": True,
                    "facility_level": "LEVEL 4",
                    "operational_status": "Operational",
                    "current_license_expiry_date": "2026-12-31",
                }
            },
        )

        result = service.search_facility(facility_code="24979")

        assert result is not None
        assert result.facility_code == "24979"
        assert result.found is True
        assert result.level == 4

    def test_search_facility_by_fid(self, service, mock_requests_get):
        """Should search facility by Facility ID."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "message": {
                    "facility_code": "24979",
                    "found": 1,
                    "fid": "FID-47-103706-5",
                }
            },
        )

        result = service.search_facility(fid="FID-47-103706-5")

        assert result is not None
        assert result.fid == "FID-47-103706-5"

    def test_search_facility_not_found(self, service, mock_requests_get):
        """Should return None when facility not found."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "message": {
                    "facility_code": "99999",
                    "found": 0,
                }
            },
        )

        result = service.search_facility(facility_code="99999")

        assert result is None

    def test_facility_operational_status(self, service, mock_requests_get):
        """Should parse operational status."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "message": {
                    "facility_code": "24979",
                    "found": 1,
                    "operational_status": "Operational",
                }
            },
        )

        result = service.search_facility(facility_code="24979")

        assert result.operational_status == "Operational"
        assert result.is_operational is True

    def test_facility_license_expiry(self, service, mock_requests_get):
        """Should parse license expiry date."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "message": {
                    "facility_code": "24979",
                    "found": 1,
                    "current_license_expiry_date": "2026-12-31",
                }
            },
        )

        result = service.search_facility(facility_code="24979")

        assert result.license_expiry == date(2026, 12, 31)
        assert result.is_license_valid is True

    def test_validate_facility_for_claims(self, service, mock_requests_get):
        """Should validate facility for SHA claims."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "message": {
                    "facility_code": "24979",
                    "found": 1,
                    "approved": True,
                    "operational_status": "Operational",
                    "current_license_expiry_date": "2026-12-31",
                }
            },
        )

        is_valid, errors = service.validate_facility_for_claims(facility_code="24979")

        assert is_valid is True
        assert len(errors) == 0

    def test_validate_facility_not_approved(self, service, mock_requests_get):
        """Should fail validation if not approved."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "message": {
                    "facility_code": "24979",
                    "found": 1,
                    "approved": False,
                }
            },
        )

        is_valid, errors = service.validate_facility_for_claims(facility_code="24979")

        assert is_valid is False
        assert len(errors) > 0

    def test_search_requires_parameter(self, service):
        """Should require at least one search parameter."""
        with pytest.raises(ValueError):
            service.search_facility()


# =============================================================================
# Practitioner Search Tests
# =============================================================================


class TestPractitionerSearch:
    """Tests for healthcare worker search in HWR."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create DHASearchService instance with mocked auth."""
        return DHASearchService()

    def _create_mock_response(self, status_code=200, json_data=None):
        """Create a mock response with headers configured."""
        mock = Mock()
        mock.status_code = status_code
        mock.json = lambda: json_data or {}
        mock.text = str(json_data or {})
        mock.headers = {"Content-Type": "application/json"}
        return mock

    def test_search_practitioner_by_national_id(self, service, mock_requests_get):
        """Should search practitioner by National ID."""
        # Use actual DHA HWR API response format
        mock_requests_get.return_value = self._create_mock_response(
            status_code=200,
            json_data={
                "message": {
                    "membership": {
                        "id": "PUID-143557",
                        "status": "licensed",
                        "salutation": "Dr.",
                        "full_name": "John Doctor",
                        "gender": "Male",
                        "first_name": "John",
                        "middle_name": "",
                        "last_name": "Doctor",
                        "registration_id": "A12345",
                        "external_reference_id": "",
                        "licensing_body": "KMPDB",
                        "specialty": "General Practice",
                        "is_active": 1,
                        "is_withdrawn": 0,
                        "withdrawal_reason": "",
                        "withdrawal_date": "",
                        "license_expires_in_days": 365,
                    },
                    "licenses": [],
                    "professional_details": {
                        "professional_cadre": "MEDICAL OFFICER",
                        "practice_type": "Medical Officer",
                        "specialty": "",
                        "subspecialty": "",
                        "discipline_name": "Medical Officer",
                        "educational_qualifications": "MBChB",
                    },
                    "contacts": {
                        "phone": "",
                        "email": "",
                        "postal_address": "",
                    },
                    "identifiers": {
                        "identification_type": "National ID",
                        "identification_number": "22334289",
                        "client_registry_id": "",
                        "student_id": "",
                    },
                }
            },
        )

        result = service.search_practitioner(identification_number="22334289")

        assert result is not None
        # Access via membership dataclass
        assert result.membership.id == "PUID-143557"
        assert result.membership.first_name == "John"

    def test_search_practitioner_by_registration(self, service, mock_requests_get):
        """Should search practitioner by registration number."""
        mock_requests_get.return_value = self._create_mock_response(
            status_code=200,
            json_data={
                "message": {
                    "membership": {
                        "id": "PUID-143557",
                        "status": "licensed",
                        "salutation": "",
                        "full_name": "John Doctor",
                        "gender": "Male",
                        "first_name": "John",
                        "middle_name": "",
                        "last_name": "Doctor",
                        "registration_id": "A12345",
                        "external_reference_id": "",
                        "licensing_body": "KMPDB",
                        "specialty": "",
                        "is_active": 1,
                        "is_withdrawn": 0,
                        "withdrawal_reason": "",
                        "withdrawal_date": "",
                        "license_expires_in_days": 365,
                    },
                    "licenses": [],
                    "professional_details": {},
                    "contacts": {},
                    "identifiers": {},
                }
            },
        )

        result = service.search_practitioner(registration_number="PUID-143557")

        assert result is not None
        assert result.membership.registration_id == "A12345"

    def test_search_practitioner_not_found(self, service, mock_requests_get):
        """Should return None when not found."""
        mock_requests_get.return_value = self._create_mock_response(
            status_code=200, json_data={"message": {"found": False}}
        )

        result = service.search_practitioner(identification_number="99999999")

        assert result is None

    def test_practitioner_license_status(self, service, mock_requests_get):
        """Should include license status."""
        mock_requests_get.return_value = self._create_mock_response(
            status_code=200,
            json_data={
                "message": {
                    "membership": {
                        "id": "PUID-143557",
                        "status": "licensed",
                        "salutation": "",
                        "full_name": "John Doctor",
                        "gender": "Male",
                        "first_name": "John",
                        "middle_name": "",
                        "last_name": "Doctor",
                        "registration_id": "",
                        "external_reference_id": "",
                        "licensing_body": "KMPDB",
                        "specialty": "",
                        "is_active": 1,
                        "is_withdrawn": 0,
                        "withdrawal_reason": "",
                        "withdrawal_date": "",
                        "license_expires_in_days": 365,
                    },
                    "licenses": [],
                    "professional_details": {},
                    "contacts": {},
                    "identifiers": {},
                }
            },
        )

        result = service.search_practitioner(identification_number="22334289")

        # License is active when: is_active=1, status='licensed', license_expires_in_days > 0
        assert result.membership.status == "licensed"
        assert result.is_license_active is True

    def test_validate_practitioner_for_claims(self, service, mock_requests_get):
        """Should validate practitioner for claims."""
        mock_requests_get.return_value = self._create_mock_response(
            status_code=200,
            json_data={
                "message": {
                    "membership": {
                        "id": "PUID-143557",
                        "status": "licensed",
                        "salutation": "",
                        "full_name": "John Doctor",
                        "gender": "Male",
                        "first_name": "John",
                        "middle_name": "",
                        "last_name": "Doctor",
                        "registration_id": "",
                        "external_reference_id": "",
                        "licensing_body": "KMPDB",
                        "specialty": "",
                        "is_active": 1,
                        "is_withdrawn": 0,
                        "withdrawal_reason": "",
                        "withdrawal_date": "",
                        "license_expires_in_days": 365,
                    },
                    "licenses": [],
                    "professional_details": {},
                    "contacts": {},
                    "identifiers": {},
                }
            },
        )

        is_valid, errors = service.validate_practitioner_for_claims(
            identification_number="22334289"
        )

        assert is_valid is True
        assert len(errors) == 0


# =============================================================================
# Service Configuration Tests
# =============================================================================


class TestDHASearchServiceConfig:
    """Tests for DHASearchService configuration."""

    def test_service_uses_sha_endpoints(self, mock_sha_auth):
        """Should use endpoints from settings."""
        service = DHASearchService()

        assert service.facility_endpoint is not None
        assert service.practitioner_endpoint is not None

    def test_service_initializes_with_settings(self, mock_sha_auth):
        """Should initialize with Django settings."""
        service = DHASearchService()

        assert service.api_base_url == settings.SHA_API_BASE_URL.rstrip("/")
        assert service.auth_service is not None

    def test_service_has_timeout(self, mock_sha_auth):
        """Should have configurable timeout."""
        service = DHASearchService()

        assert service.timeout > 0


# =============================================================================
# Error Handling Tests
# =============================================================================


class TestSearchErrorHandling:
    """Tests for error handling in search service."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create service with mocked auth."""
        return DHASearchService()

    def test_handles_timeout(self, service, mock_requests_get):
        """Should handle API timeout."""
        import requests as req

        mock_requests_get.side_effect = req.Timeout()

        with pytest.raises(SearchError) as exc_info:
            service.search_facility(facility_code="24979")

        assert (
            "timed out" in str(exc_info.value).lower() or "timeout" in str(exc_info.value).lower()
        )

    def test_handles_auth_failure(self, service, mock_requests_get):
        """Should handle authentication failure."""
        mock_requests_get.return_value = Mock(status_code=401)

        with pytest.raises(SearchError) as exc_info:
            service.search_facility(facility_code="24979")

        assert exc_info.value.status_code == 401


# =============================================================================
# Data Class Tests
# =============================================================================


class TestFacilityInfo:
    """Tests for FacilityInfo data class."""

    def test_from_api_response(self):
        """Should create from API response."""
        data = {
            "facility_code": "24979",
            "found": 1,
            "facility_level": "LEVEL 4",
            "operational_status": "Operational",
        }

        facility = FacilityInfo.from_api_response(data)

        assert facility.facility_code == "24979"
        assert facility.found is True
        assert facility.level == 4

    def test_is_operational_property(self):
        """Should check operational status."""
        facility = FacilityInfo(
            facility_code="24979",
            found=True,
            operational_status="Operational",
        )

        assert facility.is_operational is True


class TestPractitionerInfo:
    """Tests for PractitionerInfo data class."""

    def test_from_api_response(self):
        """Should create from API response."""
        # Use actual DHA HWR API response format
        data = {
            "message": {
                "membership": {
                    "id": "MEM-12345",
                    "status": "licensed",
                    "salutation": "Dr.",
                    "full_name": "John Kamau Doctor",
                    "gender": "Male",
                    "first_name": "John",
                    "middle_name": "Kamau",
                    "last_name": "Doctor",
                    "registration_id": "PUID-12345",
                    "external_reference_id": "",
                    "licensing_body": "KMPDB",
                    "specialty": "",
                    "is_active": 1,
                    "is_withdrawn": 0,
                    "withdrawal_reason": "",
                    "withdrawal_date": "",
                    "license_expires_in_days": 365,
                },
                "licenses": [],
                "professional_details": {},
                "contacts": {},
                "identifiers": {},
            }
        }

        practitioner = PractitionerInfo.from_api_response(data)

        # Use backward compatibility properties
        assert practitioner.puid == "PUID-12345"  # from membership.registration_id
        assert practitioner.first_name == "John"  # from membership.first_name

    def test_full_name_property(self):
        """Should format full name."""
        from hmis.apps.billing.services.dha_search import (
            PractitionerContacts,
            PractitionerIdentifiers,
            PractitionerMembership,
            PractitionerProfessionalDetails,
        )

        practitioner = PractitionerInfo(
            membership=PractitionerMembership(
                id="MEM-12345",
                status="licensed",
                salutation="Dr.",
                full_name="John Kamau Doctor",
                gender="Male",
                first_name="John",
                middle_name="Kamau",
                last_name="Doctor",
                registration_id="PUID-12345",
                external_reference_id="",
                licensing_body="KMPDB",
                specialty="",
                is_active=1,
                is_withdrawn=0,
                withdrawal_reason="",
                withdrawal_date="",
                license_expires_in_days=365,
            ),
            licenses=[],
            professional_details=PractitionerProfessionalDetails(
                professional_cadre="",
                practice_type="",
                specialty="",
                subspecialty="",
                discipline_name="",
                educational_qualifications="",
            ),
            contacts=PractitionerContacts(
                phone="",
                email="",
                postal_address="",
            ),
            identifiers=PractitionerIdentifiers(
                identification_type="",
                identification_number="",
                client_registry_id="",
                student_id="",
            ),
            found=True,
        )

        assert practitioner.full_name == "John Kamau Doctor"

    def test_is_license_active_property(self):
        """Should check license status."""
        from hmis.apps.billing.services.dha_search import (
            PractitionerContacts,
            PractitionerIdentifiers,
            PractitionerMembership,
            PractitionerProfessionalDetails,
        )

        practitioner = PractitionerInfo(
            membership=PractitionerMembership(
                id="MEM-12345",
                status="licensed",
                salutation="",
                full_name="John Doctor",
                gender="Male",
                first_name="John",
                middle_name="",
                last_name="Doctor",
                registration_id="PUID-12345",
                external_reference_id="",
                licensing_body="KMPDB",
                specialty="",
                is_active=1,
                is_withdrawn=0,
                withdrawal_reason="",
                withdrawal_date="",
                license_expires_in_days=365,
            ),
            licenses=[],
            professional_details=PractitionerProfessionalDetails(
                professional_cadre="",
                practice_type="",
                specialty="",
                subspecialty="",
                discipline_name="",
                educational_qualifications="",
            ),
            contacts=PractitionerContacts(
                phone="",
                email="",
                postal_address="",
            ),
            identifiers=PractitionerIdentifiers(
                identification_type="",
                identification_number="",
                client_registry_id="",
                student_id="",
            ),
            found=True,
        )

        assert practitioner.is_license_active is True
