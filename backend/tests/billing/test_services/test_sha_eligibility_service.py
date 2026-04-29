"""
TDD Red Phase Tests for SHAEligibilityService.

This module contains failing tests for the SHAEligibilityService class
that handles SHA eligibility verification API calls with retry logic,
caching, and error handling.

Following TDD guidelines from docs/tdd-guidelines.md:
1. RED: Write failing tests that define expected behavior (THIS FILE)
2. GREEN: Write minimal code to make tests pass
3. REFACTOR: Improve code while keeping tests green

Test Coverage (12 tests):
- [ ] Test successful eligibility check
- [ ] Test uses cached result when valid
- [ ] Test force_refresh bypasses cache
- [ ] Test API timeout handling
- [ ] Test API error handling
- [ ] Test retry logic with exponential backoff
- [ ] Test request payload format
- [ ] Test response parsing for eligible member
- [ ] Test response parsing for ineligible member
- [ ] Test member status updated after check
- [ ] Test eligibility check logged
- [ ] Test mock API for unit tests

Reference: docs/sprint-2.1-2.2-sha-claims-integration-deliverables.md § Services & Business Logic
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest  # type: ignore
import requests
from django.conf import settings
from django.test import override_settings
from django.utils import timezone

from hmis.apps.billing.models import SHAEligibilityCheck, SHAMember


@pytest.fixture
def legacy_sha_settings(settings):
    """Force legacy SHA mode for tests that exercise the old eligibility contract."""
    settings.SHA_AUTH_MODE = "legacy"
    return settings


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create a SHA member for testing."""
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-1234567890",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        created_by=test_user,
    )


@pytest.fixture
def sha_patient_needs_check(db, test_user, sample_county, sample_sub_county, sample_organization):
    """Create a separate patient for needs_check tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Alice",
        last_name="NeedsCheck",
        date_of_birth="1990-03-15",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def sha_member_needs_check(db, sha_patient_needs_check, test_user):
    """Create a SHA member that needs eligibility check (no recent check)."""
    return SHAMember.objects.create(
        patient=sha_patient_needs_check,
        sha_number="SHA-9876543210",
        national_id="87654321",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.PENDING_VERIFICATION,
        coverage_start_date=date.today() - timedelta(days=30),
        coverage_end_date=date.today() + timedelta(days=335),
        last_eligibility_check=None,  # No previous check
        created_by=test_user,
    )


@pytest.fixture
def sha_patient_recent_check(db, test_user, sample_county, sample_sub_county, sample_organization):
    """Create a separate patient for recent_check tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Bob",
        last_name="RecentCheck",
        date_of_birth="1988-07-22",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def sha_member_with_recent_check(db, sha_patient_recent_check, test_user):
    """Create a SHA member with a recent eligibility check (should use cache)."""
    member = SHAMember.objects.create(
        patient=sha_patient_recent_check,
        sha_number="SHA-1111111111",
        national_id="11111111",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=30),
        coverage_end_date=date.today() + timedelta(days=335),
        last_eligibility_check=timezone.now(),  # Recent check
        eligibility_valid_until=date.today() + timedelta(days=30),
        eligibility_response={"eligible": True, "balance": "50000.00"},
        created_by=test_user,
    )
    return member


@pytest.fixture
def mock_sha_api_success_response():
    """Mock successful SHA API response."""
    return {
        "eligible": True,
        "valid_until": (date.today() + timedelta(days=365)).isoformat(),
        "balance": "75000.00",
        "member_name": "Jane Smith",
        "sha_number": "SHA-1234567890",
    }


@pytest.fixture
def mock_sha_api_ineligible_response():
    """Mock ineligible SHA API response."""
    return {
        "eligible": False,
        "reason": "Membership expired",
        "sha_number": "SHA-1234567890",
    }


@pytest.fixture
def mock_sha_api_suspended_response():
    """Mock suspended membership SHA API response."""
    return {
        "eligible": False,
        "reason": "Membership suspended due to non-payment",
        "sha_number": "SHA-1234567890",
    }


@pytest.mark.django_db
@pytest.mark.usefixtures("legacy_sha_settings")
class TestSHAEligibilityServiceCheckEligibility:
    """Tests for SHAEligibilityService.check_eligibility() method."""

    def test_successful_eligibility_check(
        self, sha_member_needs_check, test_user, mock_sha_api_success_response
    ):
        """
        Test successful eligibility check creates SHAEligibilityCheck record.

        Given: A SHA member needing verification
        When: check_eligibility() is called
        Then: SHAEligibilityCheck record is created with ELIGIBLE result
        """
        # Import service - will fail until implementation exists
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(service, "_call_api", return_value=mock_sha_api_success_response):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        # Assertions
        assert isinstance(check, SHAEligibilityCheck)
        assert check.result == SHAEligibilityCheck.CheckResult.ELIGIBLE
        assert check.is_eligible is True
        assert check.sha_member == sha_member_needs_check
        assert check.patient == sha_member_needs_check.patient
        assert check.checked_by == test_user
        assert check.response_time_ms is not None
        assert check.response_time_ms >= 0

    def test_uses_cached_result_when_valid(self, sha_member_with_recent_check, test_user):
        """
        Test that cached result is used when eligibility is still valid.

        Given: A SHA member with recent valid eligibility check
        When: check_eligibility() is called without force_refresh
        Then: Cached result is returned without API call
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        # Mock _call_api to verify it's NOT called
        with patch.object(service, "_call_api") as mock_api:
            check = service.check_eligibility(sha_member_with_recent_check, test_user)

            # API should NOT be called when cache is valid
            mock_api.assert_not_called()

        # Should return a cached result
        assert isinstance(check, SHAEligibilityCheck)
        assert check.is_eligible is True

    def test_force_refresh_bypasses_cache(
        self, sha_member_with_recent_check, test_user, mock_sha_api_success_response
    ):
        """
        Test that force_refresh=True bypasses cache and calls API.

        Given: A SHA member with recent valid eligibility check
        When: check_eligibility() is called with force_refresh=True
        Then: API is called regardless of cache status
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(
            service, "_call_api", return_value=mock_sha_api_success_response
        ) as mock_api:
            check = service.check_eligibility(
                sha_member_with_recent_check, test_user, force_refresh=True
            )

            # API SHOULD be called when force_refresh=True
            mock_api.assert_called_once()

        assert isinstance(check, SHAEligibilityCheck)
        assert check.is_eligible is True


@pytest.mark.django_db
@pytest.mark.usefixtures("legacy_sha_settings")
class TestSHAEligibilityServiceErrorHandling:
    """Tests for SHAEligibilityService error handling."""

    def test_api_timeout_handling(self, sha_member_needs_check, test_user):
        """
        Test handling of API timeout.

        Given: A SHA member needing verification
        When: API call times out
        Then: SHAEligibilityCheck is created with TIMEOUT result and error details
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(service, "_call_api", side_effect=requests.Timeout()):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        assert isinstance(check, SHAEligibilityCheck)
        assert check.result == SHAEligibilityCheck.CheckResult.TIMEOUT
        assert check.is_eligible is False
        assert check.error_code == "TIMEOUT"
        assert "timeout" in check.error_message.lower()

    def test_api_error_handling(self, sha_member_needs_check, test_user):
        """
        Test handling of general API errors.

        Given: A SHA member needing verification
        When: API call fails with RequestException
        Then: SHAEligibilityCheck is created with ERROR result
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(
            service, "_call_api", side_effect=requests.RequestException("Connection refused")
        ):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        assert isinstance(check, SHAEligibilityCheck)
        assert check.result == SHAEligibilityCheck.CheckResult.ERROR
        assert check.is_eligible is False
        assert check.error_code == "API_ERROR"
        assert "Connection refused" in check.error_message

    @override_settings(SHA_AUTH_MODE="ilm")
    def test_direct_eligibility_auth_error_payload(self):
        """Direct eligibility should return a structured auth failure payload for UI messaging."""
        from hmis.apps.billing.services.sha_auth import SHAAuthError
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(
            service, "_call_api", side_effect=SHAAuthError("Invalid credentials", 401)
        ):
            result = service.check_eligibility_direct("National ID", "32440686")

        assert result["error_code"] == "SHA_AUTH_FAILED"
        assert result["error_title"] == "SHA auth failed"
        assert result["reason"] == "SHA auth failed"
        assert "Unable to authenticate" in result["error"]
        assert result["upstream_status"] == 401

    @override_settings(SHA_AUTH_MODE="ilm")
    def test_direct_eligibility_timeout_payload(self):
        """Direct eligibility should return a structured timeout payload for UI messaging."""
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(service, "_call_api", side_effect=requests.Timeout()):
            result = service.check_eligibility_direct("National ID", "32440686")

        assert result["error_code"] == "SHA_UPSTREAM_TIMEOUT"
        assert result["error_title"] == "SHA upstream timed out"
        assert result["reason"] == "SHA upstream timed out"
        assert "Please retry" in result["error"]
        assert result["upstream_status"] == 504

    def test_retry_logic_with_exponential_backoff(self, sha_member_needs_check, test_user):
        """
        Test that API calls are retried with exponential backoff.

        Given: API call fails on first two attempts
        When: _call_api() is called
        Then: API is retried with exponential backoff before succeeding
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        # Track sleep calls to verify exponential backoff
        sleep_calls = []

        def mock_sleep(seconds):
            sleep_calls.append(seconds)

        # First 2 calls fail, third succeeds
        call_count = 0

        def mock_get(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise requests.RequestException("Temporary failure")
            mock_response = Mock()
            mock_response.json.return_value = {"eligible": True, "balance": "50000.00"}
            mock_response.raise_for_status = Mock()
            mock_response.status_code = 200
            return mock_response

        with patch("time.sleep", side_effect=mock_sleep):
            with patch("requests.get", side_effect=mock_get):
                with patch.object(
                    service.auth_service,
                    "get_auth_headers",
                    return_value={"Authorization": "Bearer test"},
                ):
                    # _call_api handles retries internally
                    request_data = service._build_request(sha_member_needs_check)
                    result = service._call_api(request_data)

        # Verify exponential backoff pattern: 2^0=1, 2^1=2 seconds
        assert len(sleep_calls) == 2
        assert sleep_calls[0] == 1  # 2^0
        assert sleep_calls[1] == 2  # 2^1
        assert result["eligible"] is True


@pytest.mark.django_db
@pytest.mark.usefixtures("legacy_sha_settings")
class TestSHAEligibilityServiceRequestPayload:
    """Tests for SHAEligibilityService request payload building."""

    def test_request_payload_format(self, sha_member):
        """
        Test that request payload has correct format for official SHA API.

        Given: A SHA member
        When: _build_request() is called
        Then: Payload contains doc_type and doc_value per official spec
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        request_data = service._build_request(sha_member)

        # Official API uses doc_type and doc_value
        assert "doc_type" in request_data
        assert "doc_value" in request_data
        # SHA number should be preferred when available
        assert request_data["doc_type"] == "sha_number"
        assert request_data["doc_value"] == sha_member.sha_number

    @override_settings(SHA_AUTH_MODE="ilm")
    def test_request_payload_format_for_ilm_patient_lookup(self, sha_member):
        """ILM mode should use eligibility query parameters expected by the middleware."""
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        request_data = service._build_request(sha_member)

        assert request_data == {
            "identification_type": "National ID",
            "identification_number": sha_member.national_id,
        }


@pytest.mark.django_db
@pytest.mark.usefixtures("legacy_sha_settings")
class TestSHAEligibilityServiceResponseParsing:
    """Tests for SHAEligibilityService response parsing."""

    def test_response_parsing_for_eligible_member(
        self, sha_member_needs_check, test_user, mock_sha_api_success_response
    ):
        """
        Test parsing of eligible response.

        Given: API returns eligible=True
        When: Response is processed
        Then: SHAEligibilityCheck has correct eligibility fields
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(service, "_call_api", return_value=mock_sha_api_success_response):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        assert check.result == SHAEligibilityCheck.CheckResult.ELIGIBLE
        assert check.is_eligible is True
        assert check.eligible_until is not None
        assert check.benefit_balance == Decimal("75000.00")
        assert check.ineligibility_reason == ""
        # Response data includes original fields plus raw_response for debugging
        assert check.response_data["eligible"] == mock_sha_api_success_response["eligible"]
        assert check.response_data["balance"] == mock_sha_api_success_response["balance"]

    def test_response_parsing_for_ineligible_member(
        self, sha_member_needs_check, test_user, mock_sha_api_ineligible_response
    ):
        """
        Test parsing of ineligible response.

        Given: API returns eligible=False with reason
        When: Response is processed
        Then: SHAEligibilityCheck has ineligibility details
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(service, "_call_api", return_value=mock_sha_api_ineligible_response):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        assert check.result == SHAEligibilityCheck.CheckResult.INELIGIBLE
        assert check.is_eligible is False
        assert check.ineligibility_reason == "Membership expired"
        assert check.benefit_balance is None

    @override_settings(SHA_AUTH_MODE="ilm")
    def test_response_parsing_for_ilm_eligibility(self, sha_member_needs_check, test_user):
        """ILM eligibility responses should be interpreted from coverage fields, not patient lookup heuristics."""
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()
        ilm_eligibility_response = {
            "id": "CR0127974703399-5",
            "eligible": 1,
            "coverageEndDate": "2026-12-31",
            "reason": "Active SHA cover",
            "possible_solution": None,
            "message": "The individual is covered",
        }

        with patch.object(service, "_call_api", return_value=ilm_eligibility_response):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        assert check.result == SHAEligibilityCheck.CheckResult.ELIGIBLE
        assert check.is_eligible is True
        assert check.eligible_until is not None
        assert check.ineligibility_reason == ""
        assert check.response_data["sha_number"] == "CR0127974703399-5"
        assert check.response_data["lookup_mode"] == "ilm_eligibility"

    @override_settings(SHA_AUTH_MODE="ilm")
    def test_direct_eligibility_uses_scheme_coverage_status(self):
        """Scheme-based ILM eligibility payloads should be treated as eligible when any scheme has active coverage."""
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()
        ilm_scheme_response = {
            "requestIdType": 2,
            "requestIdNumber": "34221265",
            "dateOfBirth": "1997-11-15T01:00:00+03:00",
            "gender": "F",
            "age": 29,
            "whitelistedForOTP": False,
            "memberCrNumber": "CR8432995013637-1",
            "fullName": "SALOME KUNGU",
            "statusCode": "10",
            "statusDesc": "Member found. Check Schemes for coverages",
            "schemes": [
                {
                    "schemeName": "UHC",
                    "schemeId": 1,
                    "memberType": "PRIMARY",
                    "policy": {
                        "startDate": "2024-10-01",
                        "endDate": "2034-09-30",
                        "number": "UHC-MUN4KH1C",
                    },
                    "coverage": {
                        "startDate": "2024-10-01",
                        "endDate": "2034-09-30",
                        "message": "The individual is covered.",
                        "reason": "Payment is up to Date. ",
                        "status": "1",
                    },
                    "principalContributor": {
                        "idNumber": "34221265",
                        "idType": "NATIONAL_ID",
                        "crNumber": "CR8432995013637-1",
                        "name": "SALOME KUNGU",
                        "relationship": "",
                        "employmentType": "EMPLOYED",
                        "employerDetails": {"name": "MERCYLITE HOSPITAL LTD"},
                    },
                }
            ],
        }

        with patch.object(service, "_call_api", return_value=ilm_scheme_response):
            result = service.check_eligibility_direct("National ID", "34221265")

        assert result["is_eligible"] is True
        assert result["sha_number"] == "CR8432995013637-1"
        assert result["coverage_end_date"] == "2034-09-30"
        assert result["status_code"] == "10"
        assert result["member_cr_number"] == "CR8432995013637-1"
        assert result["employment_type"] == "EMPLOYED"
        assert result["employer_name"] == "MERCYLITE HOSPITAL LTD"
        assert len(result["schemes"]) == 1

    @override_settings(SHA_AUTH_MODE="ilm")
    def test_direct_eligibility_prefers_shif_scheme_for_summary_status(self):
        """When SHIF is present, overall eligibility should follow SHIF rather than another covered scheme."""
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()
        mixed_scheme_response = {
            "requestIdType": 2,
            "requestIdNumber": "41132081",
            "memberCrNumber": "CR1481274185029-8",
            "fullName": "DAHABO ALI",
            "statusCode": "10",
            "statusDesc": "Member found. Check Schemes for coverages",
            "schemes": [
                {
                    "schemeName": "UHC",
                    "schemeId": 1,
                    "memberType": "PRIMARY",
                    "policy": {
                        "startDate": "2024-10-01",
                        "endDate": "2034-09-30",
                        "number": "UHC-MIRIVV3D",
                    },
                    "coverage": {
                        "startDate": "2024-10-01",
                        "endDate": "2034-09-30",
                        "message": "The individual is covered.",
                        "reason": "Payment is up to Date. ",
                        "status": "1",
                    },
                    "principalContributor": {
                        "idNumber": "41132081",
                        "idType": "NATIONAL_ID",
                        "crNumber": "CR1481274185029-8",
                        "name": "DAHABO ALI",
                        "relationship": "",
                        "employmentType": "EMPLOYED",
                        "employerDetails": {"name": "NEXORA CONSULTING LIMITED"},
                    },
                },
                {
                    "schemeName": "SHIF",
                    "schemeId": 2,
                    "memberType": "PRIMARY",
                    "policy": {"startDate": "", "endDate": ""},
                    "coverage": {
                        "startDate": "2025-07-11",
                        "endDate": "2025-08-10",
                        "message": "The individual is not covered.",
                        "reason": "Payment is  not up to Date.",
                        "possibleSolution": "Contribution Required.",
                        "status": "0",
                    },
                    "principalContributor": {
                        "idNumber": "41132081",
                        "idType": "NATIONAL_ID",
                        "crNumber": "CR1481274185029-8",
                        "name": "DAHABO ALI",
                        "relationship": "",
                        "employmentType": "EMPLOYED",
                        "employerDetails": {"name": "NEXORA CONSULTING LIMITED"},
                    },
                },
            ],
        }

        with patch.object(service, "_call_api", return_value=mixed_scheme_response):
            result = service.check_eligibility_direct("National ID", "41132081")

        assert result["is_eligible"] is False
        assert result["primary_scheme_name"] == "SHIF"
        assert result["reason"] == "The individual is not covered."
        assert result["possible_solution"] == "Contribution Required."
        assert result["coverage_end_date"] == "2025-08-10"


@pytest.mark.django_db
@pytest.mark.usefixtures("legacy_sha_settings")
class TestSHAEligibilityServiceMemberUpdate:
    """Tests for SHAEligibilityService member status updates."""

    def test_member_status_updated_after_eligible_check(
        self, sha_member_needs_check, test_user, mock_sha_api_success_response
    ):
        """
        Test that SHA member status is updated after eligibility check.

        Given: A SHA member with PENDING_VERIFICATION status
        When: Eligibility check returns eligible=True
        Then: Member status is updated to ACTIVE
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        # Verify initial status
        assert sha_member_needs_check.status == SHAMember.MembershipStatus.PENDING_VERIFICATION

        with patch.object(service, "_call_api", return_value=mock_sha_api_success_response):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        # Refresh member from database
        sha_member_needs_check.refresh_from_db()

        assert sha_member_needs_check.status == SHAMember.MembershipStatus.ACTIVE
        assert sha_member_needs_check.last_eligibility_check is not None
        # Response includes raw_response for debugging, check key fields match
        assert (
            sha_member_needs_check.eligibility_response["eligible"]
            == mock_sha_api_success_response["eligible"]
        )
        assert (
            sha_member_needs_check.eligibility_response["balance"]
            == mock_sha_api_success_response["balance"]
        )

    def test_member_status_updated_to_expired(
        self, sha_member_needs_check, test_user, mock_sha_api_ineligible_response
    ):
        """
        Test that SHA member status is set to EXPIRED when reason contains 'expired'.

        Given: A SHA member
        When: Eligibility check returns ineligible with 'expired' reason
        Then: Member status is updated to EXPIRED
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(service, "_call_api", return_value=mock_sha_api_ineligible_response):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        sha_member_needs_check.refresh_from_db()

        assert sha_member_needs_check.status == SHAMember.MembershipStatus.EXPIRED

    def test_member_status_updated_to_suspended(
        self, sha_member_needs_check, test_user, mock_sha_api_suspended_response
    ):
        """
        Test that SHA member status is set to SUSPENDED when reason contains 'suspended'.

        Given: A SHA member
        When: Eligibility check returns ineligible with 'suspended' reason
        Then: Member status is updated to SUSPENDED
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        with patch.object(service, "_call_api", return_value=mock_sha_api_suspended_response):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        sha_member_needs_check.refresh_from_db()

        assert sha_member_needs_check.status == SHAMember.MembershipStatus.SUSPENDED


@pytest.mark.django_db
@pytest.mark.usefixtures("legacy_sha_settings")
class TestSHAEligibilityServiceLogging:
    """Tests for SHAEligibilityService audit logging."""

    def test_eligibility_check_logged(
        self, sha_member_needs_check, test_user, mock_sha_api_success_response
    ):
        """
        Test that eligibility checks are logged in database.

        Given: A SHA member
        When: check_eligibility() is called
        Then: SHAEligibilityCheck record is created with all details
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        initial_check_count = SHAEligibilityCheck.objects.count()

        with patch.object(service, "_call_api", return_value=mock_sha_api_success_response):
            check = service.check_eligibility(sha_member_needs_check, test_user)

        # Verify check was persisted
        assert SHAEligibilityCheck.objects.count() == initial_check_count + 1

        # Verify check has all required fields
        persisted_check = SHAEligibilityCheck.objects.get(pk=check.pk)
        assert persisted_check.sha_member == sha_member_needs_check
        assert persisted_check.patient == sha_member_needs_check.patient
        assert persisted_check.checked_by == test_user
        assert persisted_check.request_data is not None
        assert persisted_check.response_data is not None
        assert persisted_check.check_date is not None


@pytest.mark.django_db
@pytest.mark.usefixtures("legacy_sha_settings")
class TestSHAEligibilityServiceMockAPI:
    """Tests for using mock SHA API in unit tests."""

    def test_mock_api_for_unit_tests(self, sha_member_needs_check, test_user):
        """
        Test that SHA API can be properly mocked for unit tests.

        Given: A SHA member
        When: Service is used with mocked API
        Then: Mock responses are handled correctly
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        # Create a mock response
        mock_response = Mock()
        mock_response.json.return_value = {
            "eligible": True,
            "coverageEndDate": "2027-01-07",
            "balance": "100000.00",
        }
        mock_response.raise_for_status = Mock()
        mock_response.status_code = 200

        with patch("requests.get", return_value=mock_response) as mock_get:
            with patch.object(
                service.auth_service,
                "get_auth_headers",
                return_value={"Authorization": "Bearer test"},
            ):
                check = service.check_eligibility(sha_member_needs_check, test_user)

                # Verify requests.get was called with correct parameters
                mock_get.assert_called()
                call_args = mock_get.call_args

                # Verify URL contains eligibility endpoint
                assert "eligibility" in call_args[0][0] or "eligibility" in str(call_args)

                # Verify headers include Authorization
                assert "headers" in call_args[1]
                assert "Authorization" in call_args[1]["headers"]

        assert check.is_eligible is True

    @override_settings(
        SHA_AUTH_MODE="ilm",
        SHA_API_BASE_URL="https://uat.dha.go.ke",
        SHA_ENDPOINTS={
            "eligibility": "/v2/eligibility",
            "ilm_eligibility": "/api/v1/patients/eligibility",
        },
    )
    def test_ilm_mode_calls_documented_eligibility_endpoint(self, sha_member_needs_check):
        """ILM mode should call the documented eligibility endpoint instead of patient lookup."""
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        mock_response = Mock()
        mock_response.json.return_value = {
            "id": "CR0127974703399-5",
            "resourceType": "Patient",
            "identification_type": "National ID",
            "identification_number": "32440686",
        }
        mock_response.raise_for_status = Mock()
        mock_response.status_code = 200

        with patch("requests.get", return_value=mock_response) as mock_get:
            with patch.object(
                service.auth_service,
                "get_auth_headers",
                return_value={"Authorization": "Bearer test"},
            ):
                service._call_api(
                    {
                        "identification_type": "National ID",
                        "identification_number": "32440686",
                    }
                )

        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert (
            call_args.args[0]
            == "https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/eligibility"
        )
        assert call_args.kwargs["params"] == {
            "identification_type": "National ID",
            "identification_number": "32440686",
        }


@pytest.mark.django_db
@pytest.mark.usefixtures("legacy_sha_settings")
class TestSHAEligibilityServiceConfiguration:
    """Tests for SHAEligibilityService configuration."""

    def test_service_uses_settings_for_api_config(self):
        """
        Test that service reads API configuration from Django settings.

        Given: Django settings with SHA API configuration
        When: SHAEligibilityService is instantiated
        Then: Service uses settings for api_base_url, api_key, and timeout
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        # Verify service has configuration from settings
        assert hasattr(service, "api_base_url")
        assert hasattr(service, "api_key")
        assert hasattr(service, "timeout")
        assert hasattr(service, "max_retries")
        assert hasattr(service, "auth_service")

        # Verify max_retries is 3 as per spec
        assert service.max_retries == 3

    def test_service_reads_from_django_settings(self):
        """
        Test that service configuration matches Django settings.

        Given: SHA_API_BASE_URL, SHA_API_KEY, SHA_API_TIMEOUT in settings
        When: Service is instantiated
        Then: Service uses those values
        """
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        # These settings should be defined in Django settings
        assert service.api_base_url == settings.SHA_API_BASE_URL.rstrip("/")
        assert service.api_key == settings.SHA_API_KEY
        assert service.timeout == settings.SHA_API_TIMEOUT

    @override_settings(
        SHA_AUTH_MODE="ilm",
        SHA_AUTH_BASE_URL="https://ilm-dev.dha.go.ke/uat-middleware",
        SHA_API_BASE_URL="https://uat.dha.go.ke",
        SHA_CLIENT_ID="vitora",
        SHA_CLIENT_SECRET="ilm-secret",
    )
    def test_service_uses_auth_base_url_in_ilm_mode(self):
        """ILM mode should send eligibility lookups to the ILM middleware host."""
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()

        assert service.api_base_url == "https://ilm-dev.dha.go.ke/uat-middleware"
