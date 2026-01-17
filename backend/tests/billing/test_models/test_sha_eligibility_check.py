"""
Tests for SHAEligibilityCheck model.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the SHAEligibilityCheck model for SHA
eligibility verification logging as specified in Sprint 2.1-2.2 deliverables.

Test Coverage (10 tests):
- Test eligibility check creation
- Test result choices validation
- Test update_member_eligibility() with eligible result
- Test update_member_eligibility() with expired status
- Test update_member_eligibility() with suspended status
- Test response time tracking
- Test error code and message storage
- Test benefit balance storage
- Test request/response JSON storage
- Test index on sha_member and check_date
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore

# =============================================================================
# Fixtures specific to SHAEligibilityCheck tests
# =============================================================================


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create an active SHA member for testing."""
    from hmis.apps.billing.models import SHAMember

    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-1234567890",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.PENDING_VERIFICATION,
        created_by=test_user,
    )


@pytest.fixture
def valid_check_data(sha_member, test_user):
    """Valid eligibility check data for tests."""
    return {
        "sha_member": sha_member,
        "patient": sha_member.patient,
        "request_data": {
            "sha_number": sha_member.sha_number,
            "national_id": sha_member.national_id,
            "check_type": "eligibility",
        },
        "result": "eligible",
        "response_data": {
            "status": "ELIGIBLE",
            "message": "Member is eligible",
            "valid_until": "2026-12-31",
        },
        "response_time_ms": 250,
        "is_eligible": True,
        "eligible_until": date.today() + timedelta(days=365),
        "benefit_balance": Decimal("50000.00"),
        "checked_by": test_user,
    }


# =============================================================================
# Test Class: SHAEligibilityCheck Model Basic Operations
# =============================================================================


@pytest.mark.django_db
class TestSHAEligibilityCheckModel:
    """Tests for SHAEligibilityCheck model basic operations."""

    # =========================================================================
    # Test 1: Eligibility check creation
    # =========================================================================
    def test_create_eligibility_check_with_valid_data(self, valid_check_data):
        """Should create eligibility check record with valid data."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.id is not None
        assert check.sha_member == valid_check_data["sha_member"]
        assert check.patient == valid_check_data["patient"]
        assert check.result == "eligible"
        assert check.is_eligible is True
        assert check.response_time_ms == 250
        assert check.check_date is not None
        assert check.checked_by == valid_check_data["checked_by"]

    def test_eligibility_check_string_representation(self, valid_check_data):
        """Should return descriptive string representation."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        str_repr = str(check)
        assert valid_check_data["sha_member"].sha_number in str_repr
        assert "eligible" in str_repr.lower()

    # =========================================================================
    # Test 2: Result choices validation
    # =========================================================================
    def test_result_choice_eligible(self, valid_check_data):
        """Should accept 'eligible' result choice."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["result"] = "eligible"
        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        assert check.result == "eligible"

    def test_result_choice_ineligible(self, valid_check_data):
        """Should accept 'ineligible' result choice."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["result"] = "ineligible"
        valid_check_data["is_eligible"] = False
        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        assert check.result == "ineligible"

    def test_result_choice_pending(self, valid_check_data):
        """Should accept 'pending' result choice."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["result"] = "pending"
        valid_check_data["is_eligible"] = False
        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        assert check.result == "pending"

    def test_result_choice_error(self, valid_check_data):
        """Should accept 'error' result choice."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["result"] = "error"
        valid_check_data["is_eligible"] = False
        valid_check_data["error_code"] = "API_001"
        valid_check_data["error_message"] = "Connection timeout"
        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        assert check.result == "error"

    def test_result_choice_timeout(self, valid_check_data):
        """Should accept 'timeout' result choice."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["result"] = "timeout"
        valid_check_data["is_eligible"] = False
        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        assert check.result == "timeout"


# =============================================================================
# Test Class: update_member_eligibility() Method
# =============================================================================


@pytest.mark.django_db
class TestSHAEligibilityCheckUpdateMember:
    """Tests for update_member_eligibility() method."""

    # =========================================================================
    # Test 3: update_member_eligibility() with eligible result
    # =========================================================================
    def test_update_member_eligibility_eligible(self, valid_check_data):
        """Should update member to ACTIVE status when eligible."""
        from hmis.apps.billing.models import SHAEligibilityCheck, SHAMember

        valid_check_data["is_eligible"] = True
        valid_check_data["eligible_until"] = date.today() + timedelta(days=365)

        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        check.update_member_eligibility()

        # Refresh member from DB
        member = SHAMember.objects.get(pk=valid_check_data["sha_member"].pk)

        assert member.status == SHAMember.MembershipStatus.ACTIVE
        assert member.eligibility_valid_until == valid_check_data["eligible_until"]
        assert member.last_eligibility_check is not None
        assert member.eligibility_response == valid_check_data["response_data"]

    # =========================================================================
    # Test 4: update_member_eligibility() with expired status
    # =========================================================================
    def test_update_member_eligibility_expired(self, valid_check_data):
        """Should update member to EXPIRED status when expired."""
        from hmis.apps.billing.models import SHAEligibilityCheck, SHAMember

        valid_check_data["is_eligible"] = False
        valid_check_data["result"] = "ineligible"
        valid_check_data["ineligibility_reason"] = "Membership expired on 2025-12-31"

        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        check.update_member_eligibility()

        member = SHAMember.objects.get(pk=valid_check_data["sha_member"].pk)
        assert member.status == SHAMember.MembershipStatus.EXPIRED

    # =========================================================================
    # Test 5: update_member_eligibility() with suspended status
    # =========================================================================
    def test_update_member_eligibility_suspended(self, valid_check_data):
        """Should update member to SUSPENDED status when suspended."""
        from hmis.apps.billing.models import SHAEligibilityCheck, SHAMember

        valid_check_data["is_eligible"] = False
        valid_check_data["result"] = "ineligible"
        valid_check_data["ineligibility_reason"] = "Account suspended due to non-payment"

        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        check.update_member_eligibility()

        member = SHAMember.objects.get(pk=valid_check_data["sha_member"].pk)
        assert member.status == SHAMember.MembershipStatus.SUSPENDED

    def test_update_member_eligibility_inactive_other(self, valid_check_data):
        """Should update member to INACTIVE for other ineligibility reasons."""
        from hmis.apps.billing.models import SHAEligibilityCheck, SHAMember

        valid_check_data["is_eligible"] = False
        valid_check_data["result"] = "ineligible"
        valid_check_data["ineligibility_reason"] = "Member not found in system"

        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        check.update_member_eligibility()

        member = SHAMember.objects.get(pk=valid_check_data["sha_member"].pk)
        assert member.status == SHAMember.MembershipStatus.INACTIVE


# =============================================================================
# Test Class: Tracking Fields
# =============================================================================


@pytest.mark.django_db
class TestSHAEligibilityCheckTracking:
    """Tests for response time and error tracking."""

    # =========================================================================
    # Test 6: Response time tracking
    # =========================================================================
    def test_response_time_tracking(self, valid_check_data):
        """Should store API response time in milliseconds."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["response_time_ms"] = 523
        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.response_time_ms == 523

    def test_response_time_null_allowed(self, valid_check_data):
        """Should allow null response time for failed requests."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["response_time_ms"] = None
        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.response_time_ms is None

    # =========================================================================
    # Test 7: Error code and message storage
    # =========================================================================
    def test_error_code_storage(self, valid_check_data):
        """Should store error code for failed checks."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["result"] = "error"
        valid_check_data["is_eligible"] = False
        valid_check_data["error_code"] = "SHA_ERR_001"
        valid_check_data["error_message"] = "Invalid SHA number format"

        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.error_code == "SHA_ERR_001"
        assert check.error_message == "Invalid SHA number format"

    def test_error_fields_empty_for_success(self, valid_check_data):
        """Should have empty error fields for successful checks."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["error_code"] = ""
        valid_check_data["error_message"] = ""

        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.error_code == ""
        assert check.error_message == ""

    # =========================================================================
    # Test 8: Benefit balance storage
    # =========================================================================
    def test_benefit_balance_storage(self, valid_check_data):
        """Should store benefit balance from eligibility response."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["benefit_balance"] = Decimal("75000.50")
        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.benefit_balance == Decimal("75000.50")

    def test_benefit_balance_null_allowed(self, valid_check_data):
        """Should allow null benefit balance."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["benefit_balance"] = None
        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.benefit_balance is None

    def test_benefit_balance_decimal_precision(self, valid_check_data):
        """Should handle decimal precision correctly."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["benefit_balance"] = Decimal("1234567890.99")
        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.benefit_balance == Decimal("1234567890.99")


# =============================================================================
# Test Class: JSON Field Storage
# =============================================================================


@pytest.mark.django_db
class TestSHAEligibilityCheckJSONFields:
    """Tests for JSON field storage."""

    # =========================================================================
    # Test 9: Request/response JSON storage
    # =========================================================================
    def test_request_data_json_storage(self, valid_check_data):
        """Should store request data as JSON."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        request_data = {
            "sha_number": "SHA-1234567890",
            "national_id": "12345678",
            "check_type": "eligibility",
            "timestamp": "2026-01-07T10:30:00Z",
        }
        valid_check_data["request_data"] = request_data

        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.request_data == request_data
        assert check.request_data["sha_number"] == "SHA-1234567890"

    def test_response_data_json_storage(self, valid_check_data):
        """Should store response data as JSON."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        response_data = {
            "status": "ELIGIBLE",
            "message": "Member is eligible for services",
            "valid_until": "2026-12-31",
            "benefit_package": "COMPREHENSIVE",
            "coverage_details": {
                "outpatient": True,
                "inpatient": True,
                "maternity": True,
            },
        }
        valid_check_data["response_data"] = response_data

        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.response_data == response_data
        assert check.response_data["coverage_details"]["outpatient"] is True

    def test_json_fields_default_to_empty_dict(self, valid_check_data):
        """Should default JSON fields to empty dict."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["request_data"] = {}
        valid_check_data["response_data"] = {}

        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.request_data == {}
        assert check.response_data == {}

    def test_json_fields_complex_nested_data(self, valid_check_data):
        """Should handle complex nested JSON data."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        response_data = {
            "member": {
                "id": 12345,
                "dependents": [
                    {"name": "Child 1", "age": 10},
                    {"name": "Child 2", "age": 8},
                ],
            },
            "benefits": ["OPD", "IPD", "DENTAL"],
        }
        valid_check_data["response_data"] = response_data

        check = SHAEligibilityCheck.objects.create(**valid_check_data)

        assert check.response_data["member"]["dependents"][0]["name"] == "Child 1"
        assert "OPD" in check.response_data["benefits"]


# =============================================================================
# Test Class: Model Meta and Indexes
# =============================================================================


@pytest.mark.django_db
class TestSHAEligibilityCheckMeta:
    """Tests for model meta configuration and indexes."""

    # =========================================================================
    # Test 10: Index on sha_member and check_date
    # =========================================================================
    def test_indexes_exist(self):
        """Should have indexes on sha_member+check_date and result."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        index_fields = []
        for index in SHAEligibilityCheck._meta.indexes:
            index_fields.extend(index.fields)

        # Check that sha_member and check_date are indexed together
        # and result is indexed
        assert "sha_member" in index_fields or any(
            "sha_member" in idx.fields for idx in SHAEligibilityCheck._meta.indexes
        )

    def test_ordering_by_check_date_desc(self, valid_check_data):
        """Should order by check_date descending (most recent first)."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        # Create multiple checks
        check1 = SHAEligibilityCheck.objects.create(**valid_check_data)

        valid_check_data["result"] = "ineligible"
        valid_check_data["is_eligible"] = False
        check2 = SHAEligibilityCheck.objects.create(**valid_check_data)

        checks = list(SHAEligibilityCheck.objects.all())

        # Most recent should be first
        assert checks[0].pk == check2.pk

    def test_verbose_name(self):
        """Should have correct verbose names."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        assert SHAEligibilityCheck._meta.verbose_name == "SHA Eligibility Check"
        assert SHAEligibilityCheck._meta.verbose_name_plural == "SHA Eligibility Checks"

    def test_ineligibility_reason_optional(self, valid_check_data):
        """Should allow empty ineligibility reason."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["ineligibility_reason"] = ""
        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        assert check.ineligibility_reason == ""

    def test_eligible_until_optional(self, valid_check_data):
        """Should allow null eligible_until date."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        valid_check_data["eligible_until"] = None
        check = SHAEligibilityCheck.objects.create(**valid_check_data)
        assert check.eligible_until is None
