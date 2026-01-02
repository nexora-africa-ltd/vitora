"""
Tests for LabResultAttachment Model (Sprint 1.5-1.6 Track B Phase 1.4).

Test Coverage:
- File upload and storage
- Attachment linked to lab order
- File metadata extraction (size, type, name)
- Allowed file extensions validation
- Rejected file extensions
- File size limit validation
- Upload user tracking
- Multiple attachments per order
"""

import pytest
from datetime import date
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from hmis.apps.laboratory.models import LabOrder, LabResultAttachment
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient
from hmis.apps.core.models import County, SubCounty

User = get_user_model()


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def second_user(db):
    """Create a second test user."""
    return User.objects.create_user(username="labtech", password="testpass123")


@pytest.fixture
def sample_county(db):
    """Create a sample county."""
    return County.objects.create(code=1, name="Mombasa")


@pytest.fixture
def sample_sub_county(sample_county):
    """Create a sample sub-county."""
    return SubCounty.objects.create(county=sample_county, name="Mvita")


@pytest.fixture
def sample_patient(sample_county, sample_sub_county):
    """Create a sample patient."""
    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth=date(1985, 5, 20),
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def sample_encounter(sample_patient):
    """Create a sample encounter."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Lab test required",
    )


@pytest.fixture
def sample_lab_order(sample_encounter, test_user):
    """Create a sample lab order."""
    return LabOrder.objects.create(
        encounter=sample_encounter,
        patient=sample_encounter.patient,
        ordered_by=test_user,
        priority="ROUTINE",
        order_type="EXTERNAL",  # External lab needs attachments
    )


@pytest.fixture
def pdf_file():
    """Create a fake PDF file."""
    return SimpleUploadedFile(
        name="test_result.pdf",
        content=b"%PDF-1.4 test content",
        content_type="application/pdf"
    )


@pytest.fixture
def image_file():
    """Create a fake image file."""
    return SimpleUploadedFile(
        name="test_scan.png",
        content=b"\x89PNG\r\n\x1a\n test image content",
        content_type="image/png"
    )


@pytest.fixture
def large_file():
    """Create a file larger than 10MB."""
    # 11MB file
    return SimpleUploadedFile(
        name="large_result.pdf",
        content=b"x" * (11 * 1024 * 1024),
        content_type="application/pdf"
    )


@pytest.fixture
def invalid_file():
    """Create an invalid file type."""
    return SimpleUploadedFile(
        name="malicious.exe",
        content=b"MZ executable content",
        content_type="application/x-msdownload"
    )


@pytest.mark.django_db
class TestLabResultAttachment:
    """Test suite for LabResultAttachment model functionality."""

    def test_attachment_upload(self, sample_lab_order, pdf_file, test_user):
        """Should successfully upload and store attachment."""
        attachment = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=pdf_file,
            attachment_type="scanned",
            description="Test scan",
            uploaded_by=test_user,
        )
        
        assert attachment.id is not None
        assert attachment.file.name is not None
        assert "lab_results" in attachment.file.name

    def test_attachment_linked_to_order(self, sample_lab_order, pdf_file, test_user):
        """Attachment should be correctly linked to lab order."""
        attachment = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=pdf_file,
            attachment_type="external",
            uploaded_by=test_user,
        )
        
        assert attachment.lab_order == sample_lab_order
        assert attachment in sample_lab_order.attachments.all()

    def test_file_metadata_extracted(self, sample_lab_order, pdf_file, test_user):
        """Should automatically extract file metadata on save."""
        attachment = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=pdf_file,
            attachment_type="scanned",
            uploaded_by=test_user,
        )
        
        # File metadata should be auto-populated
        assert attachment.filename == "test_result.pdf"
        assert attachment.file_type == "application/pdf"
        assert attachment.file_size == len(b"%PDF-1.4 test content")

    def test_allowed_extensions_pdf(self, sample_lab_order, pdf_file, test_user):
        """Should accept PDF files."""
        attachment = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=pdf_file,
            attachment_type="external",
            uploaded_by=test_user,
        )
        
        assert attachment.id is not None
        assert ".pdf" in attachment.filename.lower()

    def test_allowed_extensions_image(self, sample_lab_order, image_file, test_user):
        """Should accept image files (PNG, JPG)."""
        attachment = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=image_file,
            attachment_type="image",
            uploaded_by=test_user,
        )
        
        assert attachment.id is not None
        assert ".png" in attachment.filename.lower()

    def test_rejected_extension(self, sample_lab_order, test_user):
        """Should reject invalid file extensions."""
        from hmis.apps.laboratory.validators import validate_lab_attachment
        
        invalid_file = SimpleUploadedFile(
            name="script.js",
            content=b"console.log('test')",
            content_type="application/javascript"
        )
        
        # Validator should raise ValidationError
        with pytest.raises(ValidationError) as exc_info:
            validate_lab_attachment(invalid_file)
        
        assert "File type not allowed" in str(exc_info.value)

    def test_file_size_limit_exceeded(self, sample_lab_order, test_user):
        """Should reject files larger than 10MB."""
        from hmis.apps.laboratory.validators import validate_lab_attachment
        
        # Create a file > 10MB
        large_file = SimpleUploadedFile(
            name="huge_result.pdf",
            content=b"x" * (11 * 1024 * 1024),  # 11MB
            content_type="application/pdf"
        )
        
        # Validator should raise ValidationError
        with pytest.raises(ValidationError) as exc_info:
            validate_lab_attachment(large_file)
        
        assert "File too large" in str(exc_info.value)

    def test_uploaded_by_recorded(self, sample_lab_order, pdf_file, test_user):
        """Should track who uploaded the attachment."""
        attachment = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=pdf_file,
            attachment_type="scanned",
            uploaded_by=test_user,
        )
        
        assert attachment.uploaded_by == test_user
        assert attachment.uploaded_at is not None

    def test_multiple_attachments_per_order(self, sample_lab_order, pdf_file, image_file, test_user, second_user):
        """Should support multiple attachments for one order."""
        # Upload first attachment
        attachment1 = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=pdf_file,
            attachment_type="external",
            description="Main report",
            uploaded_by=test_user,
        )
        
        # Upload second attachment
        attachment2 = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=image_file,
            attachment_type="image",
            description="Scan image",
            uploaded_by=second_user,
        )
        
        # Both should be linked to same order
        attachments = sample_lab_order.attachments.all()
        assert attachments.count() == 2
        assert attachment1 in attachments
        assert attachment2 in attachments

    def test_attachment_type_choices(self, sample_lab_order, pdf_file, test_user):
        """Should support different attachment types."""
        types = ['scanned', 'external', 'graph', 'image', 'other']
        
        for att_type in types:
            attachment = LabResultAttachment.objects.create(
                lab_order=sample_lab_order,
                file=pdf_file,
                attachment_type=att_type,
                uploaded_by=test_user,
            )
            assert attachment.attachment_type == att_type

    def test_attachment_ordering(self, sample_lab_order, pdf_file, test_user):
        """Attachments should be ordered by upload date (newest first)."""
        # Create multiple attachments
        att1 = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=pdf_file,
            attachment_type="scanned",
            uploaded_by=test_user,
        )
        
        att2 = LabResultAttachment.objects.create(
            lab_order=sample_lab_order,
            file=pdf_file,
            attachment_type="external",
            uploaded_by=test_user,
        )
        
        # Latest should come first
        attachments = list(sample_lab_order.attachments.all())
        assert attachments[0] == att2
        assert attachments[1] == att1
