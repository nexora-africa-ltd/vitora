"""
Tests for SHAMember model.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the SHAMember model for SHA (Social Health Authority)
claims integration as specified in Sprint 2.1-2.2 deliverables.

Test Coverage (15 tests):
- Test SHA member creation with valid data
- Test SHA number format validation (must start with SHA-)
- Test patient one-to-one relationship constraint
- Test unique SHA number constraint
- Test membership type choices validation
- Test dependent requires principal SHA number
- Test coverage date validation (end after start)
- Test is_eligible() with active status
- Test is_eligible() with expired coverage
- Test is_eligible() with suspended status
- Test needs_eligibility_check() with no previous check
- Test needs_eligibility_check() with recent check (<24h)
- Test needs_eligibility_check() with stale check (>24h)
- Test get_eligibility_display() for eligible member
- Test get_eligibility_display() for ineligible member
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone


@pytest.mark.django_db
class TestSHAMemberModel:
    """Tests for SHAMember model following Sprint 2.1-2.2 deliverables spec."""

    # =========================================================================
    # Test 1: SHA member creation with valid data
    # =========================================================================
    def test_create_sha_member_with_valid_data(self, sample_patient, test_user):
        """Should create SHA member with valid data and default status."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            created_by=test_user,
        )

        assert member.id is not None
        assert member.patient == sample_patient
        assert member.sha_number == "SHA-1234567890"
        assert member.national_id == "12345678"
        assert member.membership_type == SHAMember.MembershipType.PRINCIPAL
        assert member.status == SHAMember.MembershipStatus.PENDING_VERIFICATION
        assert member.created_by == test_user
        assert member.created_at is not None
        assert member.updated_at is not None

    # =========================================================================
    # Test 2: SHA number format validation (must start with SHA-)
    # =========================================================================
    def test_sha_number_must_start_with_sha_prefix(self, sample_patient, test_user):
        """Should reject SHA numbers not starting with SHA-."""
        from hmis.apps.billing.models import SHAMember

        with pytest.raises(ValidationError) as exc_info:
            SHAMember.objects.create(
                patient=sample_patient,
                sha_number="INVALID123456",
                national_id="12345678",
                created_by=test_user,
            )

        assert "sha_number" in str(exc_info.value)

    def test_sha_number_with_valid_prefix_accepted(self, sample_patient, test_user):
        """Should accept SHA numbers starting with SHA-."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-9876543210",
            national_id="87654321",
            created_by=test_user,
        )

        assert member.sha_number == "SHA-9876543210"

    # =========================================================================
    # Test 3: Patient one-to-one relationship constraint
    # =========================================================================
    def test_patient_one_to_one_relationship_constraint(self, sample_patient, test_user):
        """Should reject duplicate SHA membership for same patient."""
        from hmis.apps.billing.models import SHAMember

        # Create first membership
        SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1111111111",
            national_id="12345678",
            created_by=test_user,
        )

        # Try to create second membership for same patient
        # Model uses full_clean() in save() so raises ValidationError instead of IntegrityError
        with pytest.raises((IntegrityError, ValidationError)):
            SHAMember.objects.create(
                patient=sample_patient,
                sha_number="SHA-2222222222",
                national_id="87654321",
                created_by=test_user,
            )

    def test_patient_can_access_sha_member_via_related_name(self, sample_patient, test_user):
        """Patient should be able to access SHA membership via related name."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            created_by=test_user,
        )

        # Access via related name
        assert sample_patient.sha_member == member

    # =========================================================================
    # Test 4: Unique SHA number constraint
    # =========================================================================
    def test_unique_sha_number_constraint(
        self, sample_patient, test_user, sample_county, sample_sub_county
    ):
        """Should reject duplicate SHA numbers."""
        from hmis.apps.billing.models import SHAMember
        from hmis.apps.patients.models import Patient

        # Create first membership
        SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            created_by=test_user,
        )

        # Create second patient for second membership test
        patient2 = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-01",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        # Try to create membership with same SHA number
        # Model uses full_clean() in save() so raises ValidationError instead of IntegrityError
        with pytest.raises((IntegrityError, ValidationError)):
            SHAMember.objects.create(
                patient=patient2,
                sha_number="SHA-1234567890",  # Duplicate SHA number
                national_id="99999999",
                created_by=test_user,
            )

    # =========================================================================
    # Test 5: Membership type choices validation
    # =========================================================================
    def test_membership_type_choices(self, sample_patient, test_user):
        """Should accept valid membership type choices."""
        from hmis.apps.billing.models import SHAMember

        valid_types = [
            SHAMember.MembershipType.PRINCIPAL,
            SHAMember.MembershipType.SPOUSE,
            SHAMember.MembershipType.CHILD,
            SHAMember.MembershipType.PARENT,
            SHAMember.MembershipType.OTHER_DEPENDENT,
        ]

        for i, membership_type in enumerate(valid_types):
            # Create patient for each test (since OneToOne)
            from hmis.apps.patients.models import Patient

            patient = Patient.objects.create(
                first_name=f"Test{i}",
                last_name="User",
                date_of_birth="1990-01-01",
                gender="F",
            )

            principal_sha = (
                "SHA-0000000001" if membership_type != SHAMember.MembershipType.PRINCIPAL else ""
            )

            member = SHAMember.objects.create(
                patient=patient,
                sha_number=f"SHA-{1234567890 + i}",
                national_id=f"{12345678 + i}",
                membership_type=membership_type,
                principal_sha_number=principal_sha,
                created_by=test_user,
            )

            assert member.membership_type == membership_type

    # =========================================================================
    # Test 6: Dependent requires principal SHA number
    # =========================================================================
    def test_dependent_requires_principal_sha_number(self, sample_patient, test_user):
        """Dependents must have principal SHA number or principal FK."""
        from hmis.apps.billing.models import SHAMember

        with pytest.raises(ValidationError) as exc_info:
            SHAMember.objects.create(
                patient=sample_patient,
                sha_number="SHA-1234567890",
                national_id="12345678",
                membership_type=SHAMember.MembershipType.SPOUSE,  # Dependent
                principal_sha_number="",  # Missing principal SHA
                principal=None,  # No principal FK either
                created_by=test_user,
            )

        assert "principal_sha_number" in str(exc_info.value)

    def test_dependent_with_principal_sha_number_accepted(self, sample_patient, test_user):
        """Dependent with principal SHA number should be accepted."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            membership_type=SHAMember.MembershipType.CHILD,
            principal_sha_number="SHA-0000000001",
            created_by=test_user,
        )

        assert member.principal_sha_number == "SHA-0000000001"

    def test_principal_member_does_not_require_principal_sha_number(
        self, sample_patient, test_user
    ):
        """Principal member should not require principal SHA number."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            principal_sha_number="",  # Empty is fine for principal
            created_by=test_user,
        )

        assert member.membership_type == SHAMember.MembershipType.PRINCIPAL
        assert member.principal_sha_number == ""

    # =========================================================================
    # Test 7: Coverage date validation (end after start)
    # =========================================================================
    def test_coverage_end_date_must_be_after_start_date(self, sample_patient, test_user):
        """Coverage end date must be after start date."""
        from hmis.apps.billing.models import SHAMember

        with pytest.raises(ValidationError) as exc_info:
            SHAMember.objects.create(
                patient=sample_patient,
                sha_number="SHA-1234567890",
                national_id="12345678",
                coverage_start_date=date.today(),
                coverage_end_date=date.today() - timedelta(days=1),  # Before start
                created_by=test_user,
            )

        assert "coverage_end_date" in str(exc_info.value)

    def test_coverage_dates_valid_when_end_after_start(self, sample_patient, test_user):
        """Coverage dates should be valid when end is after start."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            coverage_start_date=date.today() - timedelta(days=365),
            coverage_end_date=date.today() + timedelta(days=365),
            created_by=test_user,
        )

        assert member.coverage_start_date < member.coverage_end_date

    # =========================================================================
    # Test 8: is_eligible() with active status
    # =========================================================================
    def test_is_eligible_returns_true_for_active_member(self, sample_patient, test_user):
        """is_eligible() should return True for active member with valid coverage."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.ACTIVE,
            coverage_start_date=date.today() - timedelta(days=30),
            coverage_end_date=date.today() + timedelta(days=365),
            eligibility_valid_until=date.today() + timedelta(days=30),
            created_by=test_user,
        )

        assert member.is_eligible() is True

    # =========================================================================
    # Test 9: is_eligible() with expired coverage
    # =========================================================================
    def test_is_eligible_returns_false_for_expired_coverage(self, sample_patient, test_user):
        """is_eligible() should return False for expired coverage."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.ACTIVE,
            coverage_start_date=date.today() - timedelta(days=365),
            coverage_end_date=date.today() - timedelta(days=1),  # Expired yesterday
            created_by=test_user,
        )

        assert member.is_eligible() is False

    def test_is_eligible_returns_false_for_expired_eligibility(self, sample_patient, test_user):
        """is_eligible() should return False when eligibility_valid_until is past."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.ACTIVE,
            coverage_end_date=date.today() + timedelta(days=365),
            eligibility_valid_until=date.today() - timedelta(days=1),  # Expired
            created_by=test_user,
        )

        assert member.is_eligible() is False

    # =========================================================================
    # Test 10: is_eligible() with suspended status
    # =========================================================================
    def test_is_eligible_returns_false_for_suspended_status(self, sample_patient, test_user):
        """is_eligible() should return False for suspended member."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.SUSPENDED,
            coverage_end_date=date.today() + timedelta(days=365),
            created_by=test_user,
        )

        assert member.is_eligible() is False

    def test_is_eligible_returns_false_for_inactive_status(self, sample_patient, test_user):
        """is_eligible() should return False for inactive member."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.INACTIVE,
            created_by=test_user,
        )

        assert member.is_eligible() is False

    def test_is_eligible_returns_false_for_expired_status(self, sample_patient, test_user):
        """is_eligible() should return False for expired membership status."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.EXPIRED,
            created_by=test_user,
        )

        assert member.is_eligible() is False

    # =========================================================================
    # Test 11: needs_eligibility_check() with no previous check
    # =========================================================================
    def test_needs_eligibility_check_returns_true_with_no_previous_check(
        self, sample_patient, test_user
    ):
        """needs_eligibility_check() should return True with no previous check."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            last_eligibility_check=None,  # No previous check
            created_by=test_user,
        )

        assert member.needs_eligibility_check() is True

    # =========================================================================
    # Test 12: needs_eligibility_check() with recent check (<24h)
    # =========================================================================
    def test_needs_eligibility_check_returns_false_with_recent_check(
        self, sample_patient, test_user
    ):
        """needs_eligibility_check() should return False if checked within 24h."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            last_eligibility_check=timezone.now() - timedelta(hours=12),  # 12h ago
            created_by=test_user,
        )

        assert member.needs_eligibility_check() is False

    def test_needs_eligibility_check_returns_false_just_checked(self, sample_patient, test_user):
        """needs_eligibility_check() should return False if just checked."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            last_eligibility_check=timezone.now(),  # Just now
            created_by=test_user,
        )

        assert member.needs_eligibility_check() is False

    # =========================================================================
    # Test 13: needs_eligibility_check() with stale check (>24h)
    # =========================================================================
    def test_needs_eligibility_check_returns_true_with_stale_check(self, sample_patient, test_user):
        """needs_eligibility_check() should return True if check is >24h old."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            last_eligibility_check=timezone.now() - timedelta(hours=25),  # 25h ago
            created_by=test_user,
        )

        assert member.needs_eligibility_check() is True

    def test_needs_eligibility_check_returns_true_at_exactly_24h(self, sample_patient, test_user):
        """needs_eligibility_check() should return True at exactly 24h threshold."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            last_eligibility_check=timezone.now() - timedelta(hours=24, seconds=1),
            created_by=test_user,
        )

        assert member.needs_eligibility_check() is True

    # =========================================================================
    # Test 14: get_eligibility_display() for eligible member
    # =========================================================================
    def test_get_eligibility_display_for_eligible_member(self, sample_patient, test_user):
        """get_eligibility_display() should return 'Eligible' for eligible member."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.ACTIVE,
            coverage_end_date=date.today() + timedelta(days=365),
            created_by=test_user,
        )

        assert member.get_eligibility_display() == "Eligible"

    # =========================================================================
    # Test 15: get_eligibility_display() for ineligible member
    # =========================================================================
    def test_get_eligibility_display_for_ineligible_member(self, sample_patient, test_user):
        """get_eligibility_display() should show reason for ineligible member."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.SUSPENDED,
            created_by=test_user,
        )

        display = member.get_eligibility_display()
        assert "Not Eligible" in display
        assert "Suspended" in display

    def test_get_eligibility_display_for_expired_member(self, sample_patient, test_user):
        """get_eligibility_display() should indicate expired status."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            status=SHAMember.MembershipStatus.EXPIRED,
            created_by=test_user,
        )

        display = member.get_eligibility_display()
        assert "Not Eligible" in display
        assert "Expired" in display


@pytest.mark.django_db
class TestSHAMemberModelMeta:
    """Tests for SHAMember model Meta options."""

    def test_sha_member_str_representation(self, sample_patient, test_user):
        """Test __str__ returns SHA number and patient."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            created_by=test_user,
        )

        str_repr = str(member)
        assert "SHA-1234567890" in str_repr
        assert str(sample_patient) in str_repr

    def test_sha_member_verbose_name(self):
        """Test verbose_name is set correctly."""
        from hmis.apps.billing.models import SHAMember

        assert SHAMember._meta.verbose_name == "SHA Member"
        assert SHAMember._meta.verbose_name_plural == "SHA Members"

    def test_sha_member_ordering(self):
        """Test default ordering is by -created_at."""
        from hmis.apps.billing.models import SHAMember

        assert SHAMember._meta.ordering == ["-created_at"]

    def test_sha_member_indexes_defined(self):
        """Test that database indexes are defined."""
        from hmis.apps.billing.models import SHAMember

        index_fields = [str(idx.fields) for idx in SHAMember._meta.indexes]

        # Check expected indexes exist (as strings or tuples)
        assert any("sha_number" in str(idx) for idx in index_fields)
        assert any("national_id" in str(idx) for idx in index_fields)
        assert any("status" in str(idx) for idx in index_fields)


@pytest.mark.django_db
class TestSHAMemberEligibilityResponse:
    """Tests for eligibility response JSON field."""

    def test_eligibility_response_stores_json(self, sample_patient, test_user):
        """Test eligibility_response stores JSON data correctly."""
        from hmis.apps.billing.models import SHAMember

        response_data = {
            "eligible": True,
            "balance": 50000.00,
            "valid_until": "2027-12-31",
            "benefit_package": "STANDARD",
        }

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            eligibility_response=response_data,
            created_by=test_user,
        )

        member.refresh_from_db()
        assert member.eligibility_response == response_data
        assert member.eligibility_response["eligible"] is True
        assert member.eligibility_response["balance"] == 50000.00

    def test_eligibility_response_defaults_to_empty_dict(self, sample_patient, test_user):
        """Test eligibility_response defaults to empty dict."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            created_by=test_user,
        )

        assert member.eligibility_response == {}


@pytest.mark.django_db
class TestSHAMemberAuditFields:
    """Tests for SHA member audit fields."""

    def test_verified_by_and_verified_at_fields(self, sample_patient, test_user):
        """Test verified_by and verified_at audit fields."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            created_by=test_user,
        )

        # Initially not verified
        assert member.verified_by is None
        assert member.verified_at is None

        # After verification
        member.verified_by = test_user
        member.verified_at = timezone.now()
        member.save()

        member.refresh_from_db()
        assert member.verified_by == test_user
        assert member.verified_at is not None

    def test_benefit_package_field(self, sample_patient, test_user):
        """Test benefit_package field storage."""
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-1234567890",
            national_id="12345678",
            benefit_package="STANDARD",
            created_by=test_user,
        )

        assert member.benefit_package == "STANDARD"


# =============================================================================
# Test Class: Principal Foreign Key Relationship
# =============================================================================


@pytest.mark.django_db
class TestSHAMemberPrincipalForeignKey:
    """Tests for the principal ForeignKey relationship."""

    # =========================================================================
    # Test: Dependent with principal FK is accepted
    # =========================================================================
    def test_dependent_with_principal_fk_accepted(self, test_user):
        """Dependent with principal FK should be accepted without principal_sha_number."""
        from hmis.apps.billing.models import SHAMember
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.first()
        sub_county = SubCounty.objects.filter(county=county).first()

        # Create principal patient
        principal_patient = Patient.objects.create(
            first_name="Principal",
            last_name="Member",
            date_of_birth="1980-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            registered_by=test_user,
        )

        # Create principal member
        principal_member = SHAMember.objects.create(
            patient=principal_patient,
            sha_number="SHA-0000000001",
            national_id="12345678",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            created_by=test_user,
        )

        # Create dependent patient
        dependent_patient = Patient.objects.create(
            first_name="Dependent",
            last_name="Child",
            date_of_birth="2010-05-15",
            gender="F",
            county=county,
            sub_county=sub_county,
            registered_by=test_user,
        )

        # Create dependent with principal FK (no principal_sha_number needed)
        dependent_member = SHAMember.objects.create(
            patient=dependent_patient,
            sha_number="SHA-0000000002",
            membership_type=SHAMember.MembershipType.CHILD,
            principal=principal_member,  # FK instead of string
            created_by=test_user,
        )

        assert dependent_member.principal == principal_member
        assert dependent_member.principal_sha_number == ""

    # =========================================================================
    # Test: Reverse relationship - get dependents from principal
    # =========================================================================
    def test_principal_can_access_dependents_via_related_name(self, test_user):
        """Principal member should access dependents via related_name='dependents'."""
        from hmis.apps.billing.models import SHAMember
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.first()
        sub_county = SubCounty.objects.filter(county=county).first()

        # Create principal
        principal_patient = Patient.objects.create(
            first_name="Parent",
            last_name="Member",
            date_of_birth="1975-03-20",
            gender="M",
            county=county,
            sub_county=sub_county,
            registered_by=test_user,
        )
        principal = SHAMember.objects.create(
            patient=principal_patient,
            sha_number="SHA-PRINCIPAL1",
            national_id="11111111",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            created_by=test_user,
        )

        # Create two dependents
        for i, (name, mtype) in enumerate([("Spouse", "spouse"), ("Child", "child")]):
            dep_patient = Patient.objects.create(
                first_name=name,
                last_name="Member",
                date_of_birth=f"199{i}-01-01",
                gender="F",
                county=county,
                sub_county=sub_county,
                registered_by=test_user,
            )
            SHAMember.objects.create(
                patient=dep_patient,
                sha_number=f"SHA-DEP{i}",
                membership_type=mtype,
                principal=principal,
                created_by=test_user,
            )

        # Access via reverse relation
        assert principal.dependents.count() == 2
        assert set(principal.dependents.values_list("membership_type", flat=True)) == {
            "spouse",
            "child",
        }

    # =========================================================================
    # Test: Principal FK must point to a principal member
    # =========================================================================
    def test_principal_fk_must_reference_principal_member(self, test_user):
        """Principal FK must point to a member with membership_type=PRINCIPAL."""
        from hmis.apps.billing.models import SHAMember
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.first()
        sub_county = SubCounty.objects.filter(county=county).first()

        # Create a spouse member (not principal)
        spouse_patient = Patient.objects.create(
            first_name="Spouse",
            last_name="Member",
            date_of_birth="1985-06-15",
            gender="F",
            county=county,
            sub_county=sub_county,
            registered_by=test_user,
        )
        spouse_member = SHAMember.objects.create(
            patient=spouse_patient,
            sha_number="SHA-SPOUSE001",
            membership_type=SHAMember.MembershipType.SPOUSE,
            principal_sha_number="SHA-SOMEPRINCIPAL",  # Legacy string
            created_by=test_user,
        )

        # Try to create child with spouse as principal (should fail)
        child_patient = Patient.objects.create(
            first_name="Child",
            last_name="Member",
            date_of_birth="2015-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            registered_by=test_user,
        )

        with pytest.raises(ValidationError) as exc_info:
            SHAMember.objects.create(
                patient=child_patient,
                sha_number="SHA-CHILD001",
                membership_type=SHAMember.MembershipType.CHILD,
                principal=spouse_member,  # Invalid - spouse is not a principal
                created_by=test_user,
            )

        assert "principal" in str(exc_info.value)
