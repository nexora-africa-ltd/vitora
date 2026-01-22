"""
Tests for QR Code Generation Utilities
"""

import base64
from io import BytesIO

import pytest
from PIL import Image

from hmis.apps.core.qr_utils import (
    generate_document_signature,
    generate_invoice_qr_data,
    generate_qr_base64,
    generate_qr_data_uri,
    generate_receipt_qr_data,
    verify_document_signature,
)


class TestGenerateQRBase64:
    """Tests for generate_qr_base64 function."""

    def test_generates_valid_base64_string(self):
        """Should generate a valid base64-encoded string."""
        result = generate_qr_base64("test data")

        assert isinstance(result, str)
        # Verify it's valid base64
        decoded = base64.b64decode(result)
        assert len(decoded) > 0

    def test_generates_valid_png_image(self):
        """Should generate a valid PNG image."""
        result = generate_qr_base64("test data")

        decoded = base64.b64decode(result)
        img = Image.open(BytesIO(decoded))

        assert img.format == "PNG"
        assert img.size[0] > 0
        assert img.size[1] > 0

    def test_different_data_produces_different_qr(self):
        """Different input data should produce different QR codes."""
        result1 = generate_qr_base64("data1")
        result2 = generate_qr_base64("data2")

        assert result1 != result2

    def test_same_data_produces_same_qr(self):
        """Same input data should produce identical QR codes."""
        result1 = generate_qr_base64("same data")
        result2 = generate_qr_base64("same data")

        assert result1 == result2

    def test_handles_unicode_data(self):
        """Should handle Unicode characters."""
        result = generate_qr_base64("Kenya Shillings: KES 1,000")

        decoded = base64.b64decode(result)
        img = Image.open(BytesIO(decoded))
        assert img.format == "PNG"

    def test_handles_long_data(self):
        """Should handle longer data strings."""
        long_data = "A" * 500
        result = generate_qr_base64(long_data)

        decoded = base64.b64decode(result)
        img = Image.open(BytesIO(decoded))
        assert img.format == "PNG"

    def test_custom_box_size(self):
        """Should respect custom box size parameter."""
        small = generate_qr_base64("test", box_size=2)
        large = generate_qr_base64("test", box_size=8)

        # Larger box size should produce larger image
        small_img = Image.open(BytesIO(base64.b64decode(small)))
        large_img = Image.open(BytesIO(base64.b64decode(large)))

        assert large_img.size[0] > small_img.size[0]


class TestGenerateQRDataURI:
    """Tests for generate_qr_data_uri function."""

    def test_returns_valid_data_uri(self):
        """Should return a properly formatted data URI."""
        result = generate_qr_data_uri("test data")

        assert result.startswith("data:image/png;base64,")

    def test_data_uri_contains_valid_base64(self):
        """The data URI should contain valid base64 image data."""
        result = generate_qr_data_uri("test data")

        # Extract base64 part
        base64_part = result.replace("data:image/png;base64,", "")
        decoded = base64.b64decode(base64_part)

        img = Image.open(BytesIO(decoded))
        assert img.format == "PNG"


class TestGenerateDocumentSignature:
    """Tests for generate_document_signature function."""

    def test_generates_8_char_signature(self):
        """Should generate an 8-character hex signature."""
        sig = generate_document_signature("RECEIPT", "RCP-001", "1000.00", "2026-01-22")

        assert len(sig) == 8
        assert all(c in "0123456789ABCDEF" for c in sig)

    def test_same_inputs_produce_same_signature(self):
        """Same inputs should produce identical signatures."""
        sig1 = generate_document_signature("RECEIPT", "RCP-001", "1000.00", "2026-01-22")
        sig2 = generate_document_signature("RECEIPT", "RCP-001", "1000.00", "2026-01-22")

        assert sig1 == sig2

    def test_different_inputs_produce_different_signatures(self):
        """Different inputs should produce different signatures."""
        sig1 = generate_document_signature("RECEIPT", "RCP-001", "1000.00", "2026-01-22")
        sig2 = generate_document_signature("RECEIPT", "RCP-002", "1000.00", "2026-01-22")
        sig3 = generate_document_signature("INVOICE", "RCP-001", "1000.00", "2026-01-22")

        assert sig1 != sig2
        assert sig1 != sig3

    def test_custom_secret_key(self):
        """Should use custom secret key when provided."""
        sig1 = generate_document_signature(
            "RECEIPT", "RCP-001", "1000.00", "2026-01-22", secret_key="key1"
        )
        sig2 = generate_document_signature(
            "RECEIPT", "RCP-001", "1000.00", "2026-01-22", secret_key="key2"
        )

        assert sig1 != sig2


class TestVerifyDocumentSignature:
    """Tests for verify_document_signature function."""

    def test_valid_signature_returns_true(self):
        """Should return True for valid signatures."""
        sig = generate_document_signature("RECEIPT", "RCP-001", "1000.00", "2026-01-22")

        result = verify_document_signature("RECEIPT", "RCP-001", "1000.00", "2026-01-22", sig)

        assert result is True

    def test_invalid_signature_returns_false(self):
        """Should return False for invalid signatures."""
        result = verify_document_signature(
            "RECEIPT", "RCP-001", "1000.00", "2026-01-22", "INVALID1"
        )

        assert result is False

    def test_tampered_data_fails_verification(self):
        """Should fail verification if data was tampered."""
        sig = generate_document_signature("RECEIPT", "RCP-001", "1000.00", "2026-01-22")

        # Try with different amount
        result = verify_document_signature(
            "RECEIPT", "RCP-001", "2000.00", "2026-01-22", sig
        )

        assert result is False

    def test_case_insensitive_signature(self):
        """Signature verification should be case-insensitive."""
        sig = generate_document_signature("RECEIPT", "RCP-001", "1000.00", "2026-01-22")

        result = verify_document_signature(
            "RECEIPT", "RCP-001", "1000.00", "2026-01-22", sig.lower()
        )

        assert result is True


class TestGenerateReceiptQRData:
    """Tests for generate_receipt_qr_data function."""

    def test_generates_formatted_qr_data(self):
        """Should generate properly formatted QR data."""
        result = generate_receipt_qr_data(
            receipt_number="RCP-20260122-0001",
            amount="1500.00",
            receipt_date="2026-01-22T10:30:00Z",
        )

        assert "VITORA-RCPT" in result
        assert "N:RCP-20260122-0001" in result
        assert "A:1500.00" in result
        assert "D:2026-01-22" in result
        assert "S:" in result  # Signature included by default

    def test_includes_facility_id_when_provided(self):
        """Should include facility ID when provided."""
        result = generate_receipt_qr_data(
            receipt_number="RCP-001",
            amount="1000.00",
            receipt_date="2026-01-22",
            facility_id=42,
        )

        assert "F:42" in result

    def test_excludes_signature_when_disabled(self):
        """Should not include signature when disabled."""
        result = generate_receipt_qr_data(
            receipt_number="RCP-001",
            amount="1000.00",
            receipt_date="2026-01-22",
            include_signature=False,
        )

        assert "S:" not in result

    def test_qr_data_is_scannable(self):
        """Generated QR data should be encodable in a QR code."""
        qr_data = generate_receipt_qr_data(
            receipt_number="RCP-20260122-0001",
            amount="1500.00",
            receipt_date="2026-01-22T10:30:00Z",
        )

        # Should be able to generate QR code without error
        result = generate_qr_base64(qr_data)
        assert len(result) > 0


class TestGenerateInvoiceQRData:
    """Tests for generate_invoice_qr_data function."""

    def test_generates_formatted_qr_data(self):
        """Should generate properly formatted QR data."""
        result = generate_invoice_qr_data(
            invoice_number="INV-20260122-0001",
            total_amount="5000.00",
            invoice_date="2026-01-22T09:00:00Z",
        )

        assert "VITORA-INV" in result
        assert "N:INV-20260122-0001" in result
        assert "A:5000.00" in result
        assert "D:2026-01-22" in result
        assert "S:" in result

    def test_includes_patient_mrn_when_provided(self):
        """Should include patient MRN when provided."""
        result = generate_invoice_qr_data(
            invoice_number="INV-001",
            total_amount="5000.00",
            invoice_date="2026-01-22",
            patient_mrn="MRN-12345",
        )

        assert "P:MRN-12345" in result

    def test_includes_facility_id_when_provided(self):
        """Should include facility ID when provided."""
        result = generate_invoice_qr_data(
            invoice_number="INV-001",
            total_amount="5000.00",
            invoice_date="2026-01-22",
            facility_id=99,
        )

        assert "F:99" in result

    def test_qr_data_is_scannable(self):
        """Generated QR data should be encodable in a QR code."""
        qr_data = generate_invoice_qr_data(
            invoice_number="INV-20260122-0001",
            total_amount="5000.00",
            invoice_date="2026-01-22T09:00:00Z",
            patient_mrn="MRN-20260101-0001",
        )

        result = generate_qr_base64(qr_data)
        assert len(result) > 0


class TestQRCodeIntegration:
    """Integration tests for QR code generation flow."""

    def test_full_receipt_qr_flow(self):
        """Test complete flow from data to verifiable QR code."""
        # Generate receipt QR data
        receipt_number = "RCP-20260122-0001"
        amount = "2500.00"
        date = "2026-01-22T14:30:00Z"

        qr_data = generate_receipt_qr_data(receipt_number, amount, date)

        # Generate QR code image
        qr_image = generate_qr_data_uri(qr_data)

        # Verify the QR image is valid
        assert qr_image.startswith("data:image/png;base64,")

        # Extract and verify signature from QR data
        parts = qr_data.split("|")
        sig_part = next(p for p in parts if p.startswith("S:"))
        signature = sig_part.replace("S:", "")

        # Verify signature is correct
        assert verify_document_signature("RECEIPT", receipt_number, amount, date, signature)

    def test_full_invoice_qr_flow(self):
        """Test complete flow from invoice data to verifiable QR code."""
        invoice_number = "INV-20260122-0001"
        amount = "15000.00"
        date = "2026-01-22T09:00:00Z"

        qr_data = generate_invoice_qr_data(invoice_number, amount, date)
        qr_image = generate_qr_data_uri(qr_data)

        assert qr_image.startswith("data:image/png;base64,")

        # Verify signature
        parts = qr_data.split("|")
        sig_part = next(p for p in parts if p.startswith("S:"))
        signature = sig_part.replace("S:", "")

        assert verify_document_signature("INVOICE", invoice_number, amount, date, signature)
