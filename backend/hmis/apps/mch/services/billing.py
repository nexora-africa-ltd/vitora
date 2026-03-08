"""
MCH Billing Services.

Handles billing automation for MCH-related visits with Linda Jamii exemption support.

Linda Jamii is a SHA (Social Health Authority) maternal health package that provides
free maternity services for enrolled beneficiaries.
"""

import logging
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from django.db import transaction

if TYPE_CHECKING:
    from hmis.apps.billing.models import Invoice
    from hmis.apps.mch.models import ANCVisit, Delivery, MCHRegistration, PNCVisit

logger = logging.getLogger(__name__)


# Standard ANC visit service codes (would typically come from a service catalog)
ANC_SERVICE_CODES = {
    "ANC_VISIT": ("ANC001", "ANC Visit - Consultation", Decimal("500.00")),
    "ANC_LAB_SCREENING": ("ANC002", "ANC Lab Screening Package", Decimal("2500.00")),
    "ANC_ULTRASOUND": ("ANC003", "Obstetric Ultrasound", Decimal("3000.00")),
}

DELIVERY_SERVICE_CODES = {
    "NORMAL_DELIVERY": ("DEL001", "Normal Vaginal Delivery", Decimal("15000.00")),
    "ASSISTED_DELIVERY": ("DEL002", "Assisted Vaginal Delivery", Decimal("20000.00")),
    "CESAREAN_SECTION": ("DEL003", "Cesarean Section", Decimal("50000.00")),
}

PNC_SERVICE_CODES = {
    "PNC_VISIT": ("PNC001", "PNC Visit - Consultation", Decimal("500.00")),
}


def _resolve_created_by(explicit_user=None, fallback_user=None):
    """Resolve the invoice creator for signal and service callers."""
    if explicit_user is not None:
        return explicit_user
    if fallback_user is not None:
        return fallback_user

    from hmis.apps.billing.services.clinic_billing import _get_system_user

    return _get_system_user()


def is_linda_jamii_exempt(registration: "MCHRegistration") -> bool:
    """
    Check if MCH registration qualifies for Linda Jamii exemption.

    Linda Jamii beneficiaries receive free maternal health services through SHA.

    Returns:
        True if the patient should be exempt from ANC/delivery charges
    """
    return registration.linda_jamii_beneficiary


def create_anc_visit_invoice(
    anc_visit: "ANCVisit",
    services: list[str] | None = None,
    created_by=None,
) -> Optional["Invoice"]:
    """
    Create invoice for an ANC visit.

    Args:
        anc_visit: The ANC visit to bill
        services: List of service codes to include. Defaults to ["ANC_VISIT"]
        created_by: User creating the invoice

    Returns:
        Invoice instance, or None if exempt
    """
    from datetime import date, timedelta

    from hmis.apps.billing.models import Invoice, InvoiceItem

    registration = anc_visit.registration
    patient = registration.mother

    # Check Linda Jamii exemption
    if is_linda_jamii_exempt(registration):
        logger.info(
            "ANC visit %s exempt from billing - Linda Jamii beneficiary",
            anc_visit.pk,
        )
        return None

    if services is None:
        services = ["ANC_VISIT"]

    created_by = _resolve_created_by(created_by, getattr(anc_visit, "conducted_by", None))

    with transaction.atomic():
        # Create invoice
        invoice = Invoice.objects.create(
            patient=patient,
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            notes=f"ANC Visit #{anc_visit.visit_number} - MCH: {registration.mch_number}",
            created_by=created_by,
        )

        # Add line items
        for service_key in services:
            if service_key not in ANC_SERVICE_CODES:
                logger.warning("Unknown ANC service code: %s", service_key)
                continue

            code, description, unit_price = ANC_SERVICE_CODES[service_key]
            InvoiceItem.objects.create(
                invoice=invoice,
                sha_code=code,
                description=description,
                quantity=1,
                unit_price=unit_price,
                line_total=unit_price,
            )

        # Recalculate invoice totals
        invoice.calculate_totals()
        invoice.save()

        logger.info(
            "Created invoice %s for ANC visit %s, amount: %s",
            invoice.invoice_number,
            anc_visit.pk,
            invoice.total_amount,
        )

        return invoice


def create_delivery_invoice(
    delivery: "Delivery",
    created_by=None,
) -> Optional["Invoice"]:
    """
    Create invoice for a delivery.

    Args:
        delivery: The delivery record to bill
        created_by: User creating the invoice

    Returns:
        Invoice instance, or None if exempt
    """
    from datetime import date, timedelta

    from hmis.apps.billing.models import Invoice, InvoiceItem

    registration = delivery.registration
    patient = registration.mother

    # Check Linda Jamii exemption
    if is_linda_jamii_exempt(registration):
        logger.info(
            "Delivery %s exempt from billing - Linda Jamii beneficiary",
            delivery.pk,
        )
        return None

    # Determine service based on delivery type
    delivery_type = delivery.delivery_type
    if delivery_type in ("ELECTIVE_CESAREAN", "EMERGENCY_CESAREAN"):
        service_key = "CESAREAN_SECTION"
    elif delivery_type in ("ASSISTED_VAGINAL", "VACUUM", "FORCEPS"):
        service_key = "ASSISTED_DELIVERY"
    else:
        service_key = "NORMAL_DELIVERY"

    code, description, unit_price = DELIVERY_SERVICE_CODES[service_key]
    created_by = _resolve_created_by(created_by, getattr(delivery, "delivered_by", None))

    with transaction.atomic():
        invoice = Invoice.objects.create(
            patient=patient,
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            notes=f"Delivery - MCH: {registration.mch_number}",
            created_by=created_by,
        )

        InvoiceItem.objects.create(
            invoice=invoice,
            sha_code=code,
            description=description,
            quantity=1,
            unit_price=unit_price,
            line_total=unit_price,
        )

        invoice.calculate_totals()
        invoice.save()

        logger.info(
            "Created invoice %s for delivery %s, amount: %s",
            invoice.invoice_number,
            delivery.pk,
            invoice.total_amount,
        )

        return invoice


def create_pnc_visit_invoice(
    pnc_visit: "PNCVisit",
    created_by=None,
) -> Optional["Invoice"]:
    """
    Create invoice for a PNC visit.

    Args:
        pnc_visit: The PNC visit to bill
        created_by: User creating the invoice

    Returns:
        Invoice instance, or None if exempt
    """
    from datetime import date, timedelta

    from hmis.apps.billing.models import Invoice, InvoiceItem

    registration = pnc_visit.registration
    patient = registration.mother

    # Check Linda Jamii exemption
    if is_linda_jamii_exempt(registration):
        logger.info(
            "PNC visit %s exempt from billing - Linda Jamii beneficiary",
            pnc_visit.pk,
        )
        return None

    code, description, unit_price = PNC_SERVICE_CODES["PNC_VISIT"]
    created_by = _resolve_created_by(created_by, getattr(pnc_visit, "conducted_by", None))

    with transaction.atomic():
        invoice = Invoice.objects.create(
            patient=patient,
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            notes=f"PNC Visit #{pnc_visit.visit_number} - MCH: {registration.mch_number}",
            created_by=created_by,
        )

        InvoiceItem.objects.create(
            invoice=invoice,
            sha_code=code,
            description=description,
            quantity=1,
            unit_price=unit_price,
            line_total=unit_price,
        )

        invoice.calculate_totals()
        invoice.save()

        logger.info(
            "Created invoice %s for PNC visit %s, amount: %s",
            invoice.invoice_number,
            pnc_visit.pk,
            invoice.total_amount,
        )

        return invoice
