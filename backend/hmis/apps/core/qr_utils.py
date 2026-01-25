"""
QR Code Generation Utilities

Generates QR codes as base64-encoded PNG images for embedding in documents.
Used for receipt/invoice validation and verification.
"""

import base64
import hashlib
import hmac
from io import BytesIO

import qrcode
from django.conf import settings
from qrcode.image.pil import PilImage


def generate_qr_base64(
    data: str,
    box_size: int = 4,
    border: int = 2,
    error_correction: int = qrcode.constants.ERROR_CORRECT_M,
) -> str:
    """
    Generate a QR code and return it as a base64-encoded PNG string.

    Args:
        data: The data to encode in the QR code
        box_size: Size of each box in pixels (default: 4)
        border: Border size in boxes (default: 2)
        error_correction: Error correction level (default: M = 15%)

    Returns:
        Base64-encoded PNG image string (without data URI prefix)
    """
    qr = qrcode.QRCode(
        version=None,  # Auto-determine version based on data
        error_correction=error_correction,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img: PilImage = qr.make_image(fill_color="black", back_color="white")

    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def generate_qr_data_uri(
    data: str,
    box_size: int = 4,
    border: int = 2,
) -> str:
    """
    Generate a QR code and return it as a data URI for direct HTML embedding.

    Args:
        data: The data to encode in the QR code
        box_size: Size of each box in pixels
        border: Border size in boxes

    Returns:
        Data URI string ready for use in img src attribute
    """
    base64_data = generate_qr_base64(data, box_size, border)
    return f"data:image/png;base64,{base64_data}"


def generate_document_signature(
    document_type: str,
    document_number: str,
    amount: str,
    date: str,
    secret_key: str | None = None,
) -> str:
    """
    Generate a HMAC signature for document verification.

    This creates a short signature that can be included in QR codes
    to verify document authenticity without exposing the secret key.

    Args:
        document_type: Type of document (e.g., 'RECEIPT', 'INVOICE')
        document_number: The document number/reference
        amount: The total amount as string
        date: The document date as ISO string
        secret_key: Optional secret key (defaults to Django SECRET_KEY)

    Returns:
        8-character hex signature
    """
    key = (secret_key or settings.SECRET_KEY).encode("utf-8")
    message = f"{document_type}:{document_number}:{amount}:{date}".encode()
    signature = hmac.new(key, message, hashlib.sha256).hexdigest()
    return signature[:8].upper()


def get_verification_base_url() -> str:
    """
    Get the base URL for document verification.

    Reads from DOCUMENT_VERIFICATION_URL setting, falls back to default.
    """
    return getattr(settings, "DOCUMENT_VERIFICATION_URL", "https://vitora.health/verify")


def generate_receipt_qr_url(
    receipt_number: str,
    amount: str,
    receipt_date: str,
    base_url: str | None = None,
) -> str:
    """
    Generate a verification URL for a receipt that can be encoded in a QR code.

    When scanned, opens the verification page with the document pre-verified.

    Args:
        receipt_number: The receipt number
        amount: Payment amount as string
        receipt_date: Receipt date as ISO string
        base_url: Optional custom base URL (defaults to settings)

    Returns:
        Full verification URL
    """
    date_str = receipt_date[:10] if receipt_date else ""
    # Use date_str for signature so it matches what's in the URL
    sig = generate_document_signature("RECEIPT", receipt_number, amount, date_str)

    url = base_url or get_verification_base_url()
    params = (
        f"?type=RECEIPT&number={receipt_number}&amount={amount}&date={date_str}&signature={sig}"
    )

    return f"{url}{params}"


def generate_invoice_qr_url(
    invoice_number: str,
    total_amount: str,
    invoice_date: str,
    base_url: str | None = None,
) -> str:
    """
    Generate a verification URL for an invoice that can be encoded in a QR code.

    Args:
        invoice_number: The invoice number
        total_amount: Total invoice amount as string
        invoice_date: Invoice date as ISO string
        base_url: Optional custom base URL (defaults to settings)

    Returns:
        Full verification URL
    """
    date_str = invoice_date[:10] if invoice_date else ""
    # Use date_str for signature so it matches what's in the URL
    sig = generate_document_signature("INVOICE", invoice_number, total_amount, date_str)

    url = base_url or get_verification_base_url()
    params = f"?type=INVOICE&number={invoice_number}&amount={total_amount}&date={date_str}&signature={sig}"

    return f"{url}{params}"


def generate_receipt_qr_data(
    receipt_number: str,
    amount: str,
    receipt_date: str,
    facility_id: int | None = None,
    include_signature: bool = True,
) -> str:
    """
    Generate QR code data for a payment receipt.

    The QR contains structured data that can be used for:
    - Quick lookup of receipt details
    - Verification of receipt authenticity
    - Mobile scanning for record keeping

    Args:
        receipt_number: The receipt number
        amount: Payment amount as string
        receipt_date: Receipt date as ISO string
        facility_id: Optional facility identifier
        include_signature: Whether to include verification signature

    Returns:
        Formatted string for QR encoding
    """
    parts = [
        "VITORA-RCPT",
        f"N:{receipt_number}",
        f"A:{amount}",
        f"D:{receipt_date[:10]}",  # Date only (YYYY-MM-DD)
    ]

    if facility_id:
        parts.append(f"F:{facility_id}")

    if include_signature:
        sig = generate_document_signature("RECEIPT", receipt_number, amount, receipt_date)
        parts.append(f"S:{sig}")

    return "|".join(parts)


def generate_invoice_qr_data(
    invoice_number: str,
    total_amount: str,
    invoice_date: str,
    patient_mrn: str | None = None,
    facility_id: int | None = None,
    include_signature: bool = True,
) -> str:
    """
    Generate QR code data for an invoice.

    Args:
        invoice_number: The invoice number
        total_amount: Total invoice amount as string
        invoice_date: Invoice date as ISO string
        patient_mrn: Optional patient MRN
        facility_id: Optional facility identifier
        include_signature: Whether to include verification signature

    Returns:
        Formatted string for QR encoding
    """
    parts = [
        "VITORA-INV",
        f"N:{invoice_number}",
        f"A:{total_amount}",
        f"D:{invoice_date[:10]}",
    ]

    if patient_mrn:
        parts.append(f"P:{patient_mrn}")

    if facility_id:
        parts.append(f"F:{facility_id}")

    if include_signature:
        sig = generate_document_signature("INVOICE", invoice_number, total_amount, invoice_date)
        parts.append(f"S:{sig}")

    return "|".join(parts)


def verify_document_signature(
    document_type: str,
    document_number: str,
    amount: str,
    date: str,
    signature: str,
    secret_key: str | None = None,
) -> bool:
    """
    Verify a document signature.

    Args:
        document_type: Type of document ('RECEIPT' or 'INVOICE')
        document_number: The document number
        amount: The amount as string
        date: The document date
        signature: The signature to verify (8-char hex)
        secret_key: Optional secret key

    Returns:
        True if signature is valid, False otherwise
    """
    expected = generate_document_signature(document_type, document_number, amount, date, secret_key)
    return hmac.compare_digest(expected, signature.upper())
