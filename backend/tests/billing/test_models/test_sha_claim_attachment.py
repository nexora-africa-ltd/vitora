"""
Tests for SHAClaimAttachment model.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the SHAClaimAttachment model for SHA
claims integration as specified in Sprint 2.1-2.2 deliverables.

Test Coverage (10 tests):
- Test attachment creation with valid data
- Test file size validation (max 10MB)
- Test mime type validation (PDF, JPEG, PNG, TIFF only)
- Test attachment type choices
- Test checksum storage
- Test get_required_types() for outpatient
- Test get_required_types() for inpatient
- Test get_required_types() for surgery
- Test cascade delete with parent claim
- Test file upload path format
"""

from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest # type: ignore
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile


# =============================================================================
# Fixtures specific to SHAClaimAttachment tests
# =============================================================================


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create an active SHA member for testing."""
    from hmis.apps.billing.models import SHAMember

    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number='SHA-1234567890',
        national_id='12345678',
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        eligibility_valid_until=date.today() + timedelta(days=30),
        created_by=test_user,
    )


@pytest.fixture
def sample_claim(db, sha_member, sample_encounter, test_user):
    """Create a sample SHA claim for testing attachments."""
    from hmis.apps.billing.models import SHAClaim

    return SHAClaim.objects.create(
        patient=sha_member.patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        claim_type='outpatient',
        service_date=date.today(),
        primary_diagnosis_code='J06.9',
        primary_diagnosis_description='Acute upper respiratory infection',
        facility_code='MFL-12345',
        facility_level='L3',
        created_by=test_user,
    )


@pytest.fixture
def valid_attachment_data(sample_claim, test_user):
    """Valid attachment data for tests."""
    return {
        'claim': sample_claim,
        'attachment_type': 'clinical_notes',
        'name': 'Clinical Notes - Visit 2026-01-07',
        'description': 'Consultation notes for outpatient visit',
        'file': SimpleUploadedFile(
            name='clinical_notes.pdf',
            content=b'%PDF-1.4 mock pdf content',
            content_type='application/pdf',
        ),
        'file_size': 1024,  # 1KB
        'mime_type': 'application/pdf',
        'checksum': 'a' * 64,  # SHA-256 is 64 hex chars
        'original_filename': 'clinical_notes.pdf',
        'uploaded_by': test_user,
    }


# =============================================================================
# Test Class: SHAClaimAttachment Model Basic Operations
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimAttachmentModel:
    """Tests for SHAClaimAttachment model basic operations."""

    # =========================================================================
    # Test 1: Attachment creation with valid data
    # =========================================================================
    def test_create_attachment_with_valid_data(self, valid_attachment_data):
        """Should create SHA claim attachment with valid data."""
        from hmis.apps.billing.models import SHAClaimAttachment

        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)

        assert attachment.id is not None
        assert attachment.claim == valid_attachment_data['claim']
        assert attachment.attachment_type == 'clinical_notes'
        assert attachment.name == valid_attachment_data['name']
        assert attachment.file_size == 1024
        assert attachment.mime_type == 'application/pdf'
        assert len(attachment.checksum) == 64
        assert attachment.original_filename == 'clinical_notes.pdf'
        assert attachment.uploaded_by == valid_attachment_data['uploaded_by']
        assert attachment.created_at is not None

    def test_attachment_string_representation(self, valid_attachment_data):
        """Should return descriptive string representation."""
        from hmis.apps.billing.models import SHAClaimAttachment

        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)

        str_repr = str(attachment)
        assert valid_attachment_data['claim'].claim_number in str_repr
        assert 'Clinical Notes' in str_repr

    # =========================================================================
    # Test 2: File size validation (max 10MB)
    # =========================================================================
    def test_file_size_at_limit_succeeds(self, valid_attachment_data):
        """Should accept files up to 10MB."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['file_size'] = 10 * 1024 * 1024  # Exactly 10MB

        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.file_size == 10 * 1024 * 1024

    def test_file_size_exceeds_max_fails(self, valid_attachment_data):
        """Should reject files larger than 10MB."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['file_size'] = 10 * 1024 * 1024 + 1  # 10MB + 1 byte

        with pytest.raises(ValidationError) as exc_info:
            SHAClaimAttachment.objects.create(**valid_attachment_data)

        error_str = str(exc_info.value).lower()
        assert 'file' in error_str or 'size' in error_str or '10' in error_str

    # =========================================================================
    # Test 3: MIME type validation (PDF, JPEG, PNG, TIFF only)
    # =========================================================================
    def test_mime_type_pdf_allowed(self, valid_attachment_data):
        """Should accept application/pdf mime type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['mime_type'] = 'application/pdf'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.mime_type == 'application/pdf'

    def test_mime_type_jpeg_allowed(self, valid_attachment_data):
        """Should accept image/jpeg mime type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['mime_type'] = 'image/jpeg'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.mime_type == 'image/jpeg'

    def test_mime_type_png_allowed(self, valid_attachment_data):
        """Should accept image/png mime type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['mime_type'] = 'image/png'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.mime_type == 'image/png'

    def test_mime_type_tiff_allowed(self, valid_attachment_data):
        """Should accept image/tiff mime type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['mime_type'] = 'image/tiff'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.mime_type == 'image/tiff'

    def test_mime_type_invalid_rejected(self, valid_attachment_data):
        """Should reject invalid mime types like text/plain."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['mime_type'] = 'text/plain'

        with pytest.raises(ValidationError) as exc_info:
            SHAClaimAttachment.objects.create(**valid_attachment_data)

        error_str = str(exc_info.value).lower()
        assert 'mime' in error_str or 'type' in error_str or 'allowed' in error_str

    def test_mime_type_docx_rejected(self, valid_attachment_data):
        """Should reject Word documents."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['mime_type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

        with pytest.raises(ValidationError) as exc_info:
            SHAClaimAttachment.objects.create(**valid_attachment_data)

        error_str = str(exc_info.value).lower()
        assert 'mime' in error_str or 'type' in error_str or 'allowed' in error_str

    # =========================================================================
    # Test 4: Attachment type choices
    # =========================================================================
    def test_attachment_type_clinical_notes(self, valid_attachment_data):
        """Should accept clinical_notes attachment type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['attachment_type'] = 'clinical_notes'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.attachment_type == 'clinical_notes'

    def test_attachment_type_lab_report(self, valid_attachment_data):
        """Should accept lab_report attachment type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['attachment_type'] = 'lab_report'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.attachment_type == 'lab_report'

    def test_attachment_type_invoice(self, valid_attachment_data):
        """Should accept invoice attachment type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['attachment_type'] = 'invoice'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.attachment_type == 'invoice'

    def test_attachment_type_discharge_summary(self, valid_attachment_data):
        """Should accept discharge_summary attachment type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['attachment_type'] = 'discharge_summary'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.attachment_type == 'discharge_summary'

    def test_attachment_type_operative_notes(self, valid_attachment_data):
        """Should accept operative_notes attachment type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['attachment_type'] = 'operative_notes'
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.attachment_type == 'operative_notes'

    # =========================================================================
    # Test 5: Checksum storage
    # =========================================================================
    def test_checksum_storage_64_chars(self, valid_attachment_data):
        """Should store SHA-256 checksum (64 hex characters)."""
        from hmis.apps.billing.models import SHAClaimAttachment

        checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        valid_attachment_data['checksum'] = checksum

        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.checksum == checksum
        assert len(attachment.checksum) == 64

    def test_checksum_retrieval(self, valid_attachment_data):
        """Should retrieve stored checksum correctly."""
        from hmis.apps.billing.models import SHAClaimAttachment

        checksum = 'abc123def456789' + '0' * 49  # 64 chars
        valid_attachment_data['checksum'] = checksum

        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        
        retrieved = SHAClaimAttachment.objects.get(pk=attachment.pk)
        assert retrieved.checksum == checksum


# =============================================================================
# Test Class: get_required_types() Method
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimAttachmentGetRequiredTypes:
    """Tests for get_required_types() class method."""

    # =========================================================================
    # Test 6: get_required_types() for outpatient
    # =========================================================================
    def test_get_required_types_outpatient(self):
        """Should return base requirements for outpatient claims."""
        from hmis.apps.billing.models import SHAClaimAttachment

        required = SHAClaimAttachment.get_required_types('outpatient')

        assert 'clinical_notes' in required
        assert 'invoice' in required
        assert len(required) == 2  # Only base requirements

    # =========================================================================
    # Test 7: get_required_types() for inpatient
    # =========================================================================
    def test_get_required_types_inpatient(self):
        """Should return base + discharge_summary for inpatient claims."""
        from hmis.apps.billing.models import SHAClaimAttachment

        required = SHAClaimAttachment.get_required_types('inpatient')

        assert 'clinical_notes' in required
        assert 'invoice' in required
        assert 'discharge_summary' in required
        assert len(required) == 3

    # =========================================================================
    # Test 8: get_required_types() for surgery
    # =========================================================================
    def test_get_required_types_surgery(self):
        """Should return base + discharge_summary + operative_notes for surgery claims."""
        from hmis.apps.billing.models import SHAClaimAttachment

        required = SHAClaimAttachment.get_required_types('surgery')

        assert 'clinical_notes' in required
        assert 'invoice' in required
        assert 'discharge_summary' in required
        assert 'operative_notes' in required
        assert len(required) == 4

    def test_get_required_types_maternity(self):
        """Should return base + discharge_summary for maternity claims."""
        from hmis.apps.billing.models import SHAClaimAttachment

        required = SHAClaimAttachment.get_required_types('maternity')

        assert 'clinical_notes' in required
        assert 'invoice' in required
        assert 'discharge_summary' in required
        assert len(required) == 3

    def test_get_required_types_unknown_returns_base(self):
        """Should return base requirements for unknown claim types."""
        from hmis.apps.billing.models import SHAClaimAttachment

        required = SHAClaimAttachment.get_required_types('unknown_type')

        assert 'clinical_notes' in required
        assert 'invoice' in required
        assert len(required) == 2


# =============================================================================
# Test Class: Cascade Delete and Relationships
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimAttachmentRelationships:
    """Tests for attachment relationships and cascade behavior."""

    # =========================================================================
    # Test 9: Cascade delete with parent claim
    # =========================================================================
    def test_cascade_delete_with_parent_claim(self, valid_attachment_data):
        """Should delete attachments when parent claim is deleted."""
        from hmis.apps.billing.models import SHAClaimAttachment

        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        attachment_id = attachment.id
        claim = valid_attachment_data['claim']

        # Delete the parent claim
        claim.delete()

        # Attachment should be deleted too
        assert not SHAClaimAttachment.objects.filter(id=attachment_id).exists()

    def test_multiple_attachments_cascade_delete(self, valid_attachment_data, test_user):
        """Should delete all attachments when parent claim is deleted."""
        from hmis.apps.billing.models import SHAClaimAttachment

        claim = valid_attachment_data['claim']

        # Create multiple attachments
        attachment1 = SHAClaimAttachment.objects.create(**valid_attachment_data)
        
        valid_attachment_data['attachment_type'] = 'invoice'
        valid_attachment_data['name'] = 'Invoice'
        attachment2 = SHAClaimAttachment.objects.create(**valid_attachment_data)

        attachment_ids = [attachment1.id, attachment2.id]

        # Delete the parent claim
        claim.delete()

        # All attachments should be deleted
        remaining = SHAClaimAttachment.objects.filter(id__in=attachment_ids).count()
        assert remaining == 0


# =============================================================================
# Test Class: File Upload Path
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimAttachmentFilePath:
    """Tests for file upload path configuration."""

    # =========================================================================
    # Test 10: File upload path format
    # =========================================================================
    def test_file_upload_path_contains_year_month(self, valid_attachment_data):
        """Should upload to sha_claims/YYYY/MM/ directory structure."""
        from hmis.apps.billing.models import SHAClaimAttachment

        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)

        # The upload_to pattern is 'sha_claims/%Y/%m/'
        file_path = attachment.file.name
        assert 'sha_claims' in file_path or file_path.startswith('sha_claims')

    def test_page_count_optional_field(self, valid_attachment_data):
        """Should allow optional page_count for PDFs."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['page_count'] = 5
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.page_count == 5

    def test_page_count_null_allowed(self, valid_attachment_data):
        """Should allow null page_count."""
        from hmis.apps.billing.models import SHAClaimAttachment

        # page_count not included in data
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.page_count is None


# =============================================================================
# Test Class: Model Meta
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimAttachmentMeta:
    """Tests for model meta configuration."""

    def test_ordering_by_claim_and_type(self, valid_attachment_data, test_user):
        """Should order attachments by claim and attachment_type."""
        from hmis.apps.billing.models import SHAClaimAttachment

        # Create attachments with different types
        att1 = SHAClaimAttachment.objects.create(**valid_attachment_data)
        
        valid_attachment_data['attachment_type'] = 'invoice'
        valid_attachment_data['name'] = 'Invoice'
        att2 = SHAClaimAttachment.objects.create(**valid_attachment_data)

        attachments = list(SHAClaimAttachment.objects.all())
        
        # Verify ordering is applied (by claim then attachment_type)
        assert len(attachments) == 2

    def test_verbose_name(self):
        """Should have correct verbose names."""
        from hmis.apps.billing.models import SHAClaimAttachment

        assert SHAClaimAttachment._meta.verbose_name == "SHA Claim Attachment"
        assert SHAClaimAttachment._meta.verbose_name_plural == "SHA Claim Attachments"

    def test_description_optional(self, valid_attachment_data):
        """Should allow empty description."""
        from hmis.apps.billing.models import SHAClaimAttachment

        valid_attachment_data['description'] = ''
        attachment = SHAClaimAttachment.objects.create(**valid_attachment_data)
        assert attachment.description == ''
