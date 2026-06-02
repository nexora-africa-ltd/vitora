"""
Tests for capitation provider selection validation.

Tests the proactive check that verifies whether the current facility is the
patient's selected outpatient provider before submitting a PHC capitation claim.
"""

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.billing.models import SHAMember
from hmis.apps.billing.services.capitation_validation import (
    CapitationValidationResult,
    _extract_provider_code,
    validate_capitation_provider,
)


class TestExtractProviderCode:
    """Tests for _extract_provider_code helper."""

    def test_top_level_outpatient_provider_code(self):
        """Should extract from top-level outpatient_provider_code."""
        response = {"outpatient_provider_code": "12345"}
        assert _extract_provider_code(response) == "12345"

    def test_top_level_outpatient_facility_code(self):
        """Should extract from top-level outpatient_facility_code."""
        response = {"outpatient_facility_code": "MFL-001"}
        assert _extract_provider_code(response) == "MFL-001"

    def test_top_level_phc_facility_code(self):
        """Should extract from phc_facility_code."""
        response = {"phc_facility_code": "PHC-99"}
        assert _extract_provider_code(response) == "PHC-99"

    def test_raw_response_camelcase_field(self):
        """Should extract from camelCase fields in raw_response."""
        response = {
            "raw_response": {"outpatientProviderCode": "PROV-123"},
        }
        assert _extract_provider_code(response) == "PROV-123"

    def test_schemes_array_uhc_outpatient_provider(self):
        """Should extract from UHC scheme's outpatient_provider nested object."""
        response = {
            "schemes": [
                {
                    "schemeName": "UHC",
                    "outpatient_provider": {"facility_code": "FAC-456"},
                }
            ]
        }
        assert _extract_provider_code(response) == "FAC-456"

    def test_schemes_array_uhc_direct_field(self):
        """Should extract from UHC scheme's direct outpatientFacilityCode."""
        response = {
            "schemes": [
                {
                    "schemeName": "UHC",
                    "outpatientFacilityCode": "DIRECT-789",
                }
            ]
        }
        assert _extract_provider_code(response) == "DIRECT-789"

    def test_ignores_non_uhc_schemes(self):
        """Should only look in UHC scheme, not SHIF or others."""
        response = {
            "schemes": [
                {
                    "schemeName": "SHIF",
                    "outpatient_provider": {"facility_code": "SHIF-001"},
                },
            ]
        }
        assert _extract_provider_code(response) is None

    def test_returns_none_for_empty_response(self):
        """Should return None when no provider data is available."""
        assert _extract_provider_code({}) is None

    def test_returns_none_for_blank_values(self):
        """Should ignore blank/whitespace-only values."""
        response = {"outpatient_provider_code": "  ", "phc_facility_code": ""}
        assert _extract_provider_code(response) is None

    def test_strips_whitespace(self):
        """Should strip whitespace from extracted codes."""
        response = {"outpatient_provider_code": "  12345  "}
        assert _extract_provider_code(response) == "12345"


class TestValidateCapitationProvider:
    """Tests for the main validation function."""

    def test_returns_valid_when_no_sha_member(self):
        """Should pass when sha_member is None (no data to check)."""
        result = validate_capitation_provider(None, object())
        assert result.is_valid is True

    def test_returns_valid_when_no_facility(self):
        """Should pass when facility is None."""
        result = validate_capitation_provider(object(), None)
        assert result.is_valid is True

    def test_valid_when_provider_matches_mfl_code(
        self, db, sample_patient, sample_facility, test_user
    ):
        """Should validate when provider code matches facility mfl_code."""
        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-CAP-001",
            national_id="11111111",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={"outpatient_provider_code": "99999"},
        )

        result = validate_capitation_provider(sha_member, sample_facility)
        assert result.is_valid is True
        assert result.details["matched_code"] == "99999"

    def test_valid_when_provider_matches_sha_facility_code(
        self, db, sample_patient, sample_facility, test_user
    ):
        """Should validate when provider code matches facility sha_facility_code."""
        sample_facility.sha_facility_code = "SHA-FAC-42"
        sample_facility.save()

        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-CAP-002",
            national_id="22222222",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={"outpatient_provider_code": "SHA-FAC-42"},
        )

        result = validate_capitation_provider(sha_member, sample_facility)
        assert result.is_valid is True

    def test_invalid_when_provider_mismatches(self, db, sample_patient, sample_facility, test_user):
        """Should return invalid when provider code doesn't match facility."""
        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-CAP-003",
            national_id="33333333",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={"outpatient_provider_code": "DIFFERENT-FACILITY"},
        )

        result = validate_capitation_provider(sha_member, sample_facility)
        assert result.is_valid is False
        assert "does not match" in result.warning
        assert result.blocking is False
        assert result.details["patient_provider_code"] == "DIFFERENT-FACILITY"

    def test_case_insensitive_matching(self, db, sample_patient, sample_facility, test_user):
        """Should match codes case-insensitively."""
        sample_facility.sha_facility_code = "sha-fac-lower"
        sample_facility.save()

        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-CAP-004",
            national_id="44444444",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={"outpatient_provider_code": "SHA-FAC-LOWER"},
        )

        result = validate_capitation_provider(sha_member, sample_facility)
        assert result.is_valid is True

    def test_passes_when_no_provider_data_available(
        self, db, sample_patient, sample_facility, test_user
    ):
        """Should pass (is_valid=True) when no provider selection data exists."""
        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-CAP-005",
            national_id="55555555",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={"is_eligible": True, "schemes": []},
        )

        result = validate_capitation_provider(sha_member, sample_facility)
        assert result.is_valid is True
        assert result.warning == ""

    def test_passes_when_eligibility_response_is_empty(
        self, db, sample_patient, sample_facility, test_user
    ):
        """Should pass when eligibility_response is empty dict."""
        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-CAP-006",
            national_id="66666666",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={},
        )

        result = validate_capitation_provider(sha_member, sample_facility)
        assert result.is_valid is True


@pytest.mark.django_db
class TestCapitationValidationAPI:
    """Tests for the /api/billing/capitation/validate/ endpoint."""

    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/billing/capitation/validate/", {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_requires_sha_member_id(self, authenticated_client):
        """Should return 400 when sha_member_id is missing."""
        response = authenticated_client.post("/api/billing/capitation/validate/", {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "sha_member_id" in response.data["error"]

    def test_returns_404_for_invalid_sha_member(self, authenticated_client):
        """Should return 404 for non-existent SHA member."""
        response = authenticated_client.post(
            "/api/billing/capitation/validate/", {"sha_member_id": 99999}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_valid_response_structure(
        self, authenticated_client, sample_patient, sample_facility, test_user
    ):
        """Should return proper response structure."""
        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-API-001",
            national_id="77777777",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={"outpatient_provider_code": "99999"},
        )

        response = authenticated_client.post(
            "/api/billing/capitation/validate/", {"sha_member_id": sha_member.pk}
        )
        assert response.status_code == status.HTTP_200_OK
        assert "is_valid" in response.data
        assert "warning" in response.data
        assert "blocking" in response.data

    def test_returns_valid_when_matched(
        self, authenticated_client, sample_patient, sample_facility, test_user
    ):
        """Should return is_valid=True when provider matches facility."""
        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-API-002",
            national_id="88888888",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={"outpatient_provider_code": "99999"},
        )

        response = authenticated_client.post(
            "/api/billing/capitation/validate/", {"sha_member_id": sha_member.pk}
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_valid"] is True

    def test_returns_warning_when_mismatched(
        self, authenticated_client, sample_patient, sample_facility, test_user
    ):
        """Should return is_valid=False with warning when provider doesn't match."""
        SHAMember.objects.filter(patient=sample_patient).delete()
        sha_member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-API-003",
            national_id="99999999",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
            eligibility_response={"outpatient_provider_code": "OTHER-FACILITY-123"},
        )

        response = authenticated_client.post(
            "/api/billing/capitation/validate/", {"sha_member_id": sha_member.pk}
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_valid"] is False
        assert "does not match" in response.data["warning"]
        assert response.data["blocking"] is False


@pytest.mark.django_db
class TestCapitationValidateDirectAPI:
    """Tests for the /api/billing/capitation/validate-direct/ endpoint."""

    ENDPOINT = "/api/billing/capitation/validate-direct/"

    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(self.ENDPOINT, {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_requires_eligibility_response(self, authenticated_client):
        """Should return 400 when eligibility_response is missing."""
        response = authenticated_client.post(self.ENDPOINT, {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "eligibility_response" in response.data["error"]

    def test_rejects_non_dict_eligibility_response(self, authenticated_client):
        """Should return 400 when eligibility_response is not a dict."""
        response = authenticated_client.post(
            self.ENDPOINT, {"eligibility_response": "not-a-dict"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_returns_valid_when_provider_matches_facility(
        self, authenticated_client, sample_facility
    ):
        """Should return is_valid=True when provider code matches user's facility."""
        # sample_facility has mfl_code "99999" (from conftest)
        response = authenticated_client.post(
            self.ENDPOINT,
            {"eligibility_response": {"outpatient_provider_code": "99999"}},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_valid"] is True
        assert response.data["warning"] == ""

    def test_returns_warning_when_provider_mismatches(self, authenticated_client, sample_facility):
        """Should return is_valid=False with warning when provider doesn't match."""
        response = authenticated_client.post(
            self.ENDPOINT,
            {"eligibility_response": {"outpatient_provider_code": "OTHER-FAC-999"}},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_valid"] is False
        assert "does not match" in response.data["warning"]
        assert response.data["blocking"] is False
        assert response.data["details"]["patient_provider_code"] == "OTHER-FAC-999"

    def test_passes_when_no_provider_data_in_response(self, authenticated_client, sample_facility):
        """Should return is_valid=True when no provider code found in response."""
        response = authenticated_client.post(
            self.ENDPOINT,
            {"eligibility_response": {"is_eligible": True, "schemes": []}},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_valid"] is True

    def test_extracts_from_raw_response_nested(self, authenticated_client, sample_facility):
        """Should extract provider from raw_response camelCase fields."""
        response = authenticated_client.post(
            self.ENDPOINT,
            {
                "eligibility_response": {
                    "raw_response": {"outpatientProviderCode": "99999"},
                }
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_valid"] is True

    def test_extracts_from_uhc_scheme_provider(self, authenticated_client, sample_facility):
        """Should extract provider from UHC scheme outpatient_provider object."""
        response = authenticated_client.post(
            self.ENDPOINT,
            {
                "eligibility_response": {
                    "schemes": [
                        {
                            "schemeName": "UHC",
                            "outpatient_provider": {"facility_code": "WRONG-CODE"},
                        }
                    ]
                }
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_valid"] is False
        assert "WRONG-CODE" in response.data["warning"]

    def test_response_structure(self, authenticated_client, sample_facility):
        """Should always return the expected response fields."""
        response = authenticated_client.post(
            self.ENDPOINT,
            {"eligibility_response": {"outpatient_provider_code": "SOME-CODE"}},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "is_valid" in response.data
        assert "warning" in response.data
        assert "blocking" in response.data
        assert "details" in response.data
