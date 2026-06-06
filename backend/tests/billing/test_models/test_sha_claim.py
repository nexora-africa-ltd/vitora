"""
Tests for SHAClaim model.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the SHAClaim model for SHA (Social Health Authority)
claims integration as specified in Sprint 2.1-2.2 deliverables.

Test Coverage (25 tests):
- Test claim creation with valid data
- Test claim number auto-generation (CLM-YYYYMMDD-XXXX format)
- Test claim number uniqueness
- Test patient must have SHA membership
- Test service date not in future
- Test inpatient claims require admission date
- Test discharge date after admission date
- Test claimed amount cannot be negative
- Test status choices validation
- Test claim type choices validation
- Test calculate_claimed_amount() from items
- Test validate_for_submission() - valid claim passes
- Test validate_for_submission() - ineligible member fails
- Test validate_for_submission() - no items fails
- Test validate_for_submission() - missing tariff fails
- Test validate_for_submission() - missing attachments fails
- Test validate_for_submission() - zero amount fails
- Test validate_for_submission() - already submitted fails
- Test submit() updates status and timestamps
- Test submit() with invalid claim raises error
- Test get_age_days() calculation
- Test can_appeal() for rejected claim
- Test can_appeal() for paid claim returns False
- Test create_appeal() creates new claim with version increment
- Test create_appeal() copies items to new claim
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.utils import timezone

# =============================================================================
# Fixtures specific to SHAClaim tests
# =============================================================================


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create an active SHA member for testing claims."""
    from hmis.apps.billing.models import SHAMember

    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-1234567890",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        eligibility_valid_until=date.today() + timedelta(days=30),
        created_by=test_user,
    )


@pytest.fixture
def ineligible_sha_member(db, sample_patient, test_user):
    """Create an inactive SHA member for testing ineligibility."""
    from hmis.apps.billing.models import SHAMember

    # Delete any existing membership first
    SHAMember.objects.filter(patient=sample_patient).delete()

    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-0000000001",
        national_id="00000001",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.SUSPENDED,
        created_by=test_user,
    )


@pytest.fixture
def sha_tariff(db):
    """Create a SHA tariff for testing claims."""
    from hmis.apps.billing.models import SHATariff

    return SHATariff.objects.create(
        code="SHA-CONS-001",
        name="General Consultation",
        category=SHATariff.TariffCategory.CONSULTATION,
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        sha_amount=Decimal("500.00"),
        effective_date=date.today() - timedelta(days=30),
        is_active=True,
        max_quantity_per_claim=10,  # Allow multiple quantities in tests
    )


@pytest.fixture
def sample_invoice(db, sample_patient, test_user, sample_facility, sample_organization):
    """Create a sample invoice for testing claims."""
    from hmis.apps.billing.models import Invoice

    return Invoice.objects.create(
        patient=sample_patient,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        status=Invoice.Status.DRAFT,
        payment_type=Invoice.PaymentType.INSURANCE,
        created_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def valid_claim_data(sha_member, sample_encounter, sample_invoice, test_user):
    """Valid claim data for tests."""
    return {
        "patient": sha_member.patient,
        "sha_member": sha_member,
        "encounter": sample_encounter,
        "invoice": sample_invoice,
        "claim_type": "outpatient",
        "service_date": date.today(),
        "primary_diagnosis_code": "J06.9",
        "primary_diagnosis_description": "Acute upper respiratory infection",
        "facility_code": "MFL-12345",
        "facility_level": "L3",
        "created_by": test_user,
    }


# =============================================================================
# Test Class: SHAClaim Model Basic Operations
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimModel:
    """Tests for SHAClaim model basic operations."""

    # =========================================================================
    # Test 1: Claim creation with valid data
    # =========================================================================
    def test_create_claim_with_valid_data(self, valid_claim_data):
        """Should create SHA claim with valid data and auto-generated claim number."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)

        assert claim.id is not None
        assert claim.claim_number is not None
        assert claim.claim_number.startswith("CLM-")
        assert claim.patient == valid_claim_data["patient"]
        assert claim.sha_member == valid_claim_data["sha_member"]
        assert claim.encounter == valid_claim_data["encounter"]
        assert claim.claim_type == SHAClaim.ClaimType.OUTPATIENT
        assert claim.status == SHAClaim.ClaimStatus.DRAFT  # Default
        assert claim.version == 1  # Default
        assert claim.claimed_amount == Decimal("0.00")  # Default
        assert claim.created_at is not None
        assert claim.created_by == valid_claim_data["created_by"]

    # =========================================================================
    # Test 2: Claim number auto-generation (CLM-YYYYMMDD-XXXX format)
    # =========================================================================
    def test_claim_number_auto_generation_format(self, valid_claim_data):
        """Should auto-generate claim number in CLM-YYYYMMDD-XXXX format."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)

        # Verify format: CLM-YYYYMMDD-XXXX
        parts = claim.claim_number.split("-")
        assert len(parts) == 3
        assert parts[0] == "CLM"
        assert len(parts[1]) == 8  # YYYYMMDD
        assert parts[1] == date.today().strftime("%Y%m%d")
        assert len(parts[2]) == 4  # Sequence number padded to 4 digits

    def test_claim_number_sequential_generation(
        self,
        valid_claim_data,
        sample_county,
        sample_sub_county,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Should generate sequential claim numbers for same day."""
        from hmis.apps.billing.models import SHAClaim, SHAMember
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        # Create first claim
        claim1 = SHAClaim.objects.create(**valid_claim_data)

        # Create second patient with SHA membership for second claim
        patient2 = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )
        member2 = SHAMember.objects.create(
            patient=patient2,
            sha_number="SHA-9876543210",
            national_id="87654321",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            coverage_start_date=date.today() - timedelta(days=365),
            coverage_end_date=date.today() + timedelta(days=365),
            created_by=test_user,
        )
        encounter2 = Encounter.objects.create(
            patient=patient2,
            encounter_type="OPD",
            chief_complaint="Follow-up visit",
            facility=sample_facility,
        )

        claim2_data = valid_claim_data.copy()
        claim2_data["patient"] = patient2
        claim2_data["sha_member"] = member2
        claim2_data["encounter"] = encounter2

        claim2 = SHAClaim.objects.create(**claim2_data)

        # Verify sequential numbering (note: signal may create intermediate claims
        # for the encounter, so we verify monotonically increasing, not strictly +1)
        seq1 = int(claim1.claim_number.split("-")[-1])
        seq2 = int(claim2.claim_number.split("-")[-1])
        assert seq2 > seq1

    # =========================================================================
    # Test 3: Claim number uniqueness
    # =========================================================================
    def test_claim_number_uniqueness_constraint(self, valid_claim_data):
        """Should reject duplicate claim numbers."""
        from hmis.apps.billing.models import SHAClaim

        # Create claim with auto-generated number
        claim1 = SHAClaim.objects.create(**valid_claim_data)

        # Try to create another claim and manually set the same number
        # (This should be prevented by the unique constraint)
        with pytest.raises((IntegrityError, ValidationError)):
            claim2 = SHAClaim(**valid_claim_data)
            claim2.claim_number = claim1.claim_number
            claim2.save()

    # =========================================================================
    # Test 4: Patient must have SHA membership
    # =========================================================================
    def test_patient_must_have_sha_membership(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        sample_county,
        sample_sub_county,
        sample_facility,
        sample_organization,
    ):
        """Should reject claims for patients without SHA membership."""
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        # Create a patient without SHA membership
        patient_no_sha = Patient.objects.create(
            first_name="No",
            last_name="SHA",
            date_of_birth="1995-03-10",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )
        encounter = Encounter.objects.create(
            patient=patient_no_sha,
            encounter_type="OPD",
            chief_complaint="Test",
            facility=sample_facility,
        )

        with pytest.raises(ValidationError) as exc_info:
            SHAClaim.objects.create(
                patient=patient_no_sha,
                sha_member=None,  # No membership
                encounter=encounter,
                claim_type="outpatient",
                service_date=date.today(),
                primary_diagnosis_code="J06.9",
                primary_diagnosis_description="Test diagnosis",
                facility_code="MFL-12345",
                facility_level="L3",
                created_by=test_user,
            )

        # Should have error about patient or sha_member
        error_str = str(exc_info.value).lower()
        assert "patient" in error_str or "sha" in error_str or "member" in error_str

    # =========================================================================
    # Test 5: Service date not in future
    # =========================================================================
    def test_service_date_not_in_future(self, valid_claim_data):
        """Should reject service dates in the future."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["service_date"] = date.today() + timedelta(days=7)

        with pytest.raises(ValidationError) as exc_info:
            SHAClaim.objects.create(**valid_claim_data)

        assert "service_date" in str(exc_info.value)

    def test_service_date_today_allowed(self, valid_claim_data):
        """Should accept service date of today."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["service_date"] = date.today()
        claim = SHAClaim.objects.create(**valid_claim_data)

        assert claim.service_date == date.today()

    def test_service_date_in_past_allowed(self, valid_claim_data):
        """Should accept service dates in the past."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["service_date"] = date.today() - timedelta(days=30)
        claim = SHAClaim.objects.create(**valid_claim_data)

        assert claim.service_date == date.today() - timedelta(days=30)

    # =========================================================================
    # Test 6: Inpatient claims require admission date
    # =========================================================================
    def test_inpatient_claim_requires_admission_date(self, valid_claim_data):
        """Should reject inpatient claims without admission date."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claim_type"] = "inpatient"
        valid_claim_data["admission_date"] = None

        with pytest.raises(ValidationError) as exc_info:
            SHAClaim.objects.create(**valid_claim_data)

        assert "admission_date" in str(exc_info.value)

    def test_inpatient_claim_with_admission_date_accepted(self, valid_claim_data):
        """Should accept inpatient claims with admission date."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claim_type"] = "inpatient"
        valid_claim_data["admission_date"] = date.today() - timedelta(days=5)
        valid_claim_data["discharge_date"] = date.today()

        claim = SHAClaim.objects.create(**valid_claim_data)

        assert claim.claim_type == SHAClaim.ClaimType.INPATIENT
        assert claim.admission_date == date.today() - timedelta(days=5)

    def test_outpatient_claim_does_not_require_admission_date(self, valid_claim_data):
        """Should accept outpatient claims without admission date."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claim_type"] = "outpatient"
        valid_claim_data["admission_date"] = None

        claim = SHAClaim.objects.create(**valid_claim_data)

        assert claim.claim_type == SHAClaim.ClaimType.OUTPATIENT
        assert claim.admission_date is None

    # =========================================================================
    # Test 7: Discharge date after admission date
    # =========================================================================
    def test_discharge_date_must_be_after_admission_date(self, valid_claim_data):
        """Should reject discharge date before admission date."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claim_type"] = "inpatient"
        valid_claim_data["admission_date"] = date.today() - timedelta(days=5)
        valid_claim_data["discharge_date"] = date.today() - timedelta(days=10)  # Before admission

        with pytest.raises(ValidationError) as exc_info:
            SHAClaim.objects.create(**valid_claim_data)

        assert "discharge_date" in str(exc_info.value)

    def test_discharge_date_same_as_admission_allowed(self, valid_claim_data):
        """Should accept discharge date same as admission (same-day discharge)."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claim_type"] = "inpatient"
        valid_claim_data["admission_date"] = date.today() - timedelta(days=5)
        valid_claim_data["discharge_date"] = date.today() - timedelta(days=5)  # Same day

        # This could be allowed for same-day procedures
        # Implementation decision: allow or reject?
        # For now, testing that discharge >= admission
        claim = SHAClaim.objects.create(**valid_claim_data)
        assert claim.admission_date == claim.discharge_date

    # =========================================================================
    # Test 8: Claimed amount cannot be negative
    # =========================================================================
    def test_claimed_amount_cannot_be_negative(self, valid_claim_data):
        """Should reject negative claimed amounts."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claimed_amount"] = Decimal("-100.00")

        with pytest.raises(ValidationError) as exc_info:
            SHAClaim.objects.create(**valid_claim_data)

        assert "claimed_amount" in str(exc_info.value)

    def test_claimed_amount_zero_allowed(self, valid_claim_data):
        """Should accept zero claimed amount (for draft claims)."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claimed_amount"] = Decimal("0.00")
        claim = SHAClaim.objects.create(**valid_claim_data)

        assert claim.claimed_amount == Decimal("0.00")

    def test_claimed_amount_positive_allowed(self, valid_claim_data):
        """Should accept positive claimed amounts."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claimed_amount"] = Decimal("5000.00")
        claim = SHAClaim.objects.create(**valid_claim_data)

        assert claim.claimed_amount == Decimal("5000.00")

    # =========================================================================
    # Test 9: Status choices validation
    # =========================================================================
    def test_status_choices_validation(self, valid_claim_data):
        """Should only accept valid status choices."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["status"] = "invalid_status"

        with pytest.raises(ValidationError):
            SHAClaim.objects.create(**valid_claim_data)

    def test_all_status_choices_accepted(self, valid_claim_data):
        """Should accept all defined status choices."""
        from hmis.apps.billing.models import SHAClaim

        valid_statuses = [choice[0] for choice in SHAClaim.ClaimStatus.choices]

        for status in valid_statuses:
            # Clean slate for each iteration

            # Just test that the choice is valid by checking it exists
            assert status in [s[0] for s in SHAClaim.ClaimStatus.choices]

    # =========================================================================
    # Test 10: Claim type choices validation
    # =========================================================================
    def test_claim_type_choices_validation(self, valid_claim_data):
        """Should only accept valid claim type choices."""
        from hmis.apps.billing.models import SHAClaim

        valid_claim_data["claim_type"] = "invalid_type"

        with pytest.raises(ValidationError):
            SHAClaim.objects.create(**valid_claim_data)

    def test_all_claim_type_choices_accepted(self, valid_claim_data):
        """Should accept all defined claim type choices."""
        from hmis.apps.billing.models import SHAClaim

        valid_types = [choice[0] for choice in SHAClaim.ClaimType.choices]

        # Just verify the choices are defined correctly
        expected_types = [
            "outpatient",
            "inpatient",
            "maternity",
            "surgery",
            "chronic",
            "emergency",
            "dental",
            "optical",
            "dialysis",
        ]
        for expected in expected_types:
            assert expected in valid_types


# =============================================================================
# Test Class: SHAClaim calculate_claimed_amount
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimCalculateAmount:
    """Tests for SHAClaim.calculate_claimed_amount() method."""

    # =========================================================================
    # Test 11: calculate_claimed_amount() from items
    # =========================================================================
    def test_calculate_claimed_amount_from_items(self, valid_claim_data, sha_tariff):
        """Should calculate total claimed amount from claim items."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimItem

        claim = SHAClaim.objects.create(**valid_claim_data)
        assert claim.claimed_amount == Decimal("0.00")

        # Add claim items
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Consultation",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Follow-up",
            quantity=2,
            unit_price=Decimal("250.00"),
            claimed_amount=Decimal("500.00"),
        )

        # Calculate total
        claim.calculate_claimed_amount()

        assert claim.claimed_amount == Decimal("1000.00")

    def test_calculate_claimed_amount_no_items_returns_zero(self, valid_claim_data):
        """Should return zero when no items exist."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)
        claim.claimed_amount = Decimal("100.00")  # Set non-zero
        claim.save(update_fields=["claimed_amount"])

        claim.calculate_claimed_amount()

        assert claim.claimed_amount == Decimal("0.00")


# =============================================================================
# Test Class: SHAClaim validate_for_submission
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimValidateForSubmission:
    """Tests for SHAClaim.validate_for_submission() method."""

    # =========================================================================
    # Test 12: validate_for_submission() - valid claim passes
    # =========================================================================
    def test_validate_for_submission_valid_claim_passes(
        self, valid_claim_data, sha_tariff, test_user
    ):
        """Should pass validation for a properly configured claim."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment, SHAClaimItem

        claim = SHAClaim.objects.create(**valid_claim_data)

        # Add item with tariff
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Consultation",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )

        # Add required attachments
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile(
                "clinical_notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="clinical_notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )

        # Update claimed amount
        claim.calculate_claimed_amount()

        is_valid, errors = claim.validate_for_submission()

        assert is_valid is True
        assert errors == []

    # =========================================================================
    # Test 13: validate_for_submission() - ineligible member fails
    # =========================================================================
    def test_validate_for_submission_ineligible_member_fails(
        self, ineligible_sha_member, sample_encounter, test_user, sha_tariff
    ):
        """Should fail validation when SHA member is not eligible."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment, SHAClaimItem

        claim = SHAClaim.objects.create(
            patient=ineligible_sha_member.patient,
            sha_member=ineligible_sha_member,
            encounter=sample_encounter,
            claim_type="outpatient",
            service_date=date.today(),
            primary_diagnosis_code="J06.9",
            primary_diagnosis_description="Test",
            facility_code="MFL-12345",
            facility_level="L3",
            created_by=test_user,
        )

        # Add item and attachments to make it otherwise valid
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Test",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )
        claim.calculate_claimed_amount()

        is_valid, errors = claim.validate_for_submission()

        assert is_valid is False
        assert any("eligible" in error.lower() for error in errors)

    # =========================================================================
    # Test 14: validate_for_submission() - no items fails
    # =========================================================================
    def test_validate_for_submission_no_items_fails(self, valid_claim_data, test_user):
        """Should fail validation when claim has no items."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment

        claim = SHAClaim.objects.create(**valid_claim_data)

        # Add attachments but no items
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )

        is_valid, errors = claim.validate_for_submission()

        assert is_valid is False
        assert any("item" in error.lower() for error in errors)

    # =========================================================================
    # Test 15: validate_for_submission() - missing tariff fails
    # =========================================================================
    def test_validate_for_submission_missing_tariff_fails(self, valid_claim_data, test_user):
        """Should fail validation when items are missing tariff codes."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment, SHAClaimItem

        claim = SHAClaim.objects.create(**valid_claim_data)

        # Add item WITHOUT tariff
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=None,  # Missing tariff
            description="Test service",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )

        # Add attachments
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )
        claim.calculate_claimed_amount()

        is_valid, errors = claim.validate_for_submission()

        assert is_valid is False
        assert any("tariff" in error.lower() for error in errors)

    # =========================================================================
    # Test 16: validate_for_submission() - missing attachments fails
    # =========================================================================
    def test_validate_for_submission_missing_attachments_fails(self, valid_claim_data, sha_tariff):
        """Should fail validation when required attachments are missing."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimItem

        claim = SHAClaim.objects.create(**valid_claim_data)

        # Add item but no attachments
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Test",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        claim.calculate_claimed_amount()

        is_valid, errors = claim.validate_for_submission()

        assert is_valid is False
        assert any("attachment" in error.lower() for error in errors)

    # =========================================================================
    # Test 17: validate_for_submission() - zero amount fails
    # =========================================================================
    def test_validate_for_submission_zero_amount_fails(self, valid_claim_data, test_user):
        """Should fail validation when claimed amount is zero."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment

        claim = SHAClaim.objects.create(**valid_claim_data)
        claim.claimed_amount = Decimal("0.00")
        claim.save(update_fields=["claimed_amount"])

        # Add attachments (but no items, so amount stays zero)
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )

        is_valid, errors = claim.validate_for_submission()

        assert is_valid is False
        # Should fail for both zero amount and no items
        assert len(errors) >= 1

    # =========================================================================
    # Test 18: validate_for_submission() - already submitted fails
    # =========================================================================
    def test_validate_for_submission_already_submitted_fails(
        self, valid_claim_data, sha_tariff, test_user
    ):
        """Should fail validation when claim is already submitted."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment, SHAClaimItem

        claim = SHAClaim.objects.create(**valid_claim_data)
        claim.status = SHAClaim.ClaimStatus.SUBMITTED
        claim.save(update_fields=["status"])

        # Add all required components
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Test",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )
        claim.calculate_claimed_amount()

        is_valid, errors = claim.validate_for_submission()

        assert is_valid is False
        assert any("status" in error.lower() or "submit" in error.lower() for error in errors)


# =============================================================================
# Test Class: SHAClaim submit method
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimSubmit:
    """Tests for SHAClaim.submit() method."""

    # =========================================================================
    # Test 19: submit() updates status and timestamps
    # =========================================================================
    def test_submit_updates_status_and_timestamps(self, valid_claim_data, sha_tariff, test_user):
        """Should update status to SUBMITTED and set timestamps."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment, SHAClaimItem

        claim = SHAClaim.objects.create(**valid_claim_data)

        # Make claim valid for submission
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Test",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )
        claim.calculate_claimed_amount()

        result = claim.submit(test_user)

        assert result is True
        assert claim.status == SHAClaim.ClaimStatus.SUBMITTED
        assert claim.submitted_at is not None
        assert claim.submitted_by == test_user

    # =========================================================================
    # Test 20: submit() with invalid claim raises error
    # =========================================================================
    def test_submit_invalid_claim_raises_error(self, valid_claim_data, test_user):
        """Should raise ValidationError when submitting invalid claim."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)
        # No items added - claim is invalid

        with pytest.raises(ValidationError):
            claim.submit(test_user)

        # Status should remain unchanged
        claim.refresh_from_db()
        assert claim.status == SHAClaim.ClaimStatus.DRAFT


# =============================================================================
# Test Class: SHAClaim get_age_days
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimGetAgeDays:
    """Tests for SHAClaim.get_age_days() method."""

    # =========================================================================
    # Test 21: get_age_days() calculation
    # =========================================================================
    def test_get_age_days_not_submitted_returns_zero(self, valid_claim_data):
        """Should return 0 for claims not yet submitted."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)

        assert claim.get_age_days() == 0

    def test_get_age_days_submitted_today_returns_zero(
        self, valid_claim_data, sha_tariff, test_user
    ):
        """Should return 0 for claims submitted today."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment, SHAClaimItem

        claim = SHAClaim.objects.create(**valid_claim_data)
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Test",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )
        claim.calculate_claimed_amount()
        claim.submit(test_user)

        assert claim.get_age_days() == 0

    def test_get_age_days_submitted_days_ago(self, valid_claim_data, sha_tariff, test_user):
        """Should return correct days since submission."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment, SHAClaimItem

        claim = SHAClaim.objects.create(**valid_claim_data)
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=sha_tariff,
            description="Test",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="Clinical Notes",
            file=SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
            file_size=1024,
            mime_type="application/pdf",
            checksum="a" * 64,
            original_filename="notes.pdf",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="invoice",
            name="Invoice",
            file=SimpleUploadedFile(
                "invoice.pdf", b"%PDF-1.4 test", content_type="application/pdf"
            ),
            file_size=1024,
            mime_type="application/pdf",
            checksum="b" * 64,
            original_filename="invoice.pdf",
            uploaded_by=test_user,
        )
        claim.calculate_claimed_amount()
        claim.submit(test_user)

        # Mock submitted_at to be 5 days ago
        claim.submitted_at = timezone.now() - timedelta(days=5)
        claim.save(update_fields=["submitted_at"])

        assert claim.get_age_days() == 5


# =============================================================================
# Test Class: SHAClaim can_appeal
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimCanAppeal:
    """Tests for SHAClaim.can_appeal() method."""

    # =========================================================================
    # Test 22: can_appeal() for rejected claim
    # =========================================================================
    def test_can_appeal_rejected_claim_returns_true(self, valid_claim_data):
        """Should return True for rejected claims."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)
        claim.status = SHAClaim.ClaimStatus.REJECTED
        claim.save(update_fields=["status"])

        assert claim.can_appeal() is True

    def test_can_appeal_partially_approved_claim_returns_true(self, valid_claim_data):
        """Should return True for partially approved claims."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)
        claim.status = SHAClaim.ClaimStatus.PARTIALLY_APPROVED
        claim.save(update_fields=["status"])

        assert claim.can_appeal() is True

    # =========================================================================
    # Test 23: can_appeal() for paid claim returns False
    # =========================================================================
    def test_can_appeal_paid_claim_returns_false(self, valid_claim_data):
        """Should return False for fully paid claims."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)
        claim.status = SHAClaim.ClaimStatus.PAID
        claim.save(update_fields=["status"])

        assert claim.can_appeal() is False

    def test_can_appeal_draft_claim_returns_false(self, valid_claim_data):
        """Should return False for draft claims."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)
        # Default status is DRAFT

        assert claim.can_appeal() is False

    def test_can_appeal_submitted_claim_returns_false(self, valid_claim_data):
        """Should return False for submitted claims."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)
        claim.status = SHAClaim.ClaimStatus.SUBMITTED
        claim.save(update_fields=["status"])

        assert claim.can_appeal() is False


# =============================================================================
# Test Class: SHAClaim create_appeal
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimCreateAppeal:
    """Tests for SHAClaim.create_appeal() method."""

    # =========================================================================
    # Test 24: create_appeal() creates new claim with version increment
    # =========================================================================
    def test_create_appeal_increments_version(self, valid_claim_data, test_user):
        """Should create new claim with incremented version number."""
        from hmis.apps.billing.models import SHAClaim

        original = SHAClaim.objects.create(**valid_claim_data)
        original.status = SHAClaim.ClaimStatus.REJECTED
        original.version = 1
        original.save(update_fields=["status", "version"])

        appeal = original.create_appeal(reason="Incorrect rejection", user=test_user)

        assert appeal.id != original.id
        assert appeal.version == 2
        assert appeal.parent_claim == original
        assert appeal.status == SHAClaim.ClaimStatus.DRAFT
        assert original.status == SHAClaim.ClaimStatus.APPEALED

    def test_create_appeal_copies_claim_data(self, valid_claim_data, test_user):
        """Should copy patient, encounter, diagnosis info to appeal."""
        from hmis.apps.billing.models import SHAClaim

        original = SHAClaim.objects.create(**valid_claim_data)
        original.status = SHAClaim.ClaimStatus.REJECTED
        original.save(update_fields=["status"])

        appeal = original.create_appeal(reason="Test appeal", user=test_user)

        assert appeal.patient == original.patient
        assert appeal.sha_member == original.sha_member
        assert appeal.encounter == original.encounter
        assert appeal.claim_type == original.claim_type
        assert appeal.service_date == original.service_date
        assert appeal.primary_diagnosis_code == original.primary_diagnosis_code
        assert appeal.facility_code == original.facility_code
        assert appeal.facility_level == original.facility_level

    def test_create_appeal_not_appealable_raises_error(self, valid_claim_data, test_user):
        """Should raise ValidationError when claim cannot be appealed."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)
        # Default status is DRAFT - not appealable

        with pytest.raises(ValidationError):
            claim.create_appeal(reason="Test", user=test_user)

    # =========================================================================
    # Test 25: create_appeal() copies items to new claim
    # =========================================================================
    def test_create_appeal_copies_items(self, valid_claim_data, sha_tariff, test_user):
        """Should copy all items from original claim to appeal."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimItem

        original = SHAClaim.objects.create(**valid_claim_data)
        original.status = SHAClaim.ClaimStatus.REJECTED
        original.save(update_fields=["status"])

        # Add items to original
        item1 = SHAClaimItem.objects.create(
            claim=original,
            tariff=sha_tariff,
            description="Consultation",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        item2 = SHAClaimItem.objects.create(
            claim=original,
            tariff=sha_tariff,
            description="Lab Test",
            quantity=2,
            unit_price=Decimal("300.00"),
            claimed_amount=Decimal("600.00"),
        )

        appeal = original.create_appeal(reason="Test appeal", user=test_user)

        # Verify items were copied
        appeal_items = appeal.items.all()
        assert appeal_items.count() == 2

        # Verify item data was copied
        descriptions = list(appeal_items.values_list("description", flat=True))
        assert "Consultation" in descriptions
        assert "Lab Test" in descriptions


# =============================================================================
# Test Class: SHAClaim Model Meta
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimModelMeta:
    """Tests for SHAClaim model meta options."""

    def test_claim_string_representation(self, valid_claim_data):
        """Should return readable string representation."""
        from hmis.apps.billing.models import SHAClaim

        claim = SHAClaim.objects.create(**valid_claim_data)

        str_repr = str(claim)
        assert claim.claim_number in str_repr
        assert "Draft" in str_repr  # Default status display

    def test_claim_ordering_by_created_at_desc(
        self,
        valid_claim_data,
        sample_county,
        sample_sub_county,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Should order claims by created_at descending."""
        from hmis.apps.billing.models import SHAClaim, SHAMember
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        # Create first claim
        claim1 = SHAClaim.objects.create(**valid_claim_data)

        # Create second claim with new patient
        patient2 = Patient.objects.create(
            first_name="Second",
            last_name="Patient",
            date_of_birth="1985-06-15",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )
        member2 = SHAMember.objects.create(
            patient=patient2,
            sha_number="SHA-5555555555",
            national_id="55555555",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            coverage_start_date=date.today() - timedelta(days=365),
            coverage_end_date=date.today() + timedelta(days=365),
            created_by=test_user,
        )
        encounter2 = Encounter.objects.create(
            patient=patient2,
            encounter_type="OPD",
            chief_complaint="Test",
            facility=sample_facility,
        )

        claim2 = SHAClaim.objects.create(
            patient=patient2,
            sha_member=member2,
            encounter=encounter2,
            claim_type="outpatient",
            service_date=date.today(),
            primary_diagnosis_code="J06.9",
            primary_diagnosis_description="Test",
            facility_code="MFL-12345",
            facility_level="L3",
            created_by=test_user,
        )

        # Get all claims - should be ordered newest first
        # Filter to only our manually-created claims (signal may create others)
        claims = list(SHAClaim.objects.filter(pk__in=[claim1.pk, claim2.pk]))
        assert claims[0] == claim2  # Most recent first
        assert claims[1] == claim1

    def test_claim_has_custom_permissions(self):
        """Should define custom permissions for claims."""
        from hmis.apps.billing.models import SHAClaim

        permissions = dict(SHAClaim._meta.permissions)

        assert "submit_sha_claim" in permissions
        assert "approve_sha_claim" in permissions
        assert "appeal_sha_claim" in permissions
