"""Clinic billing helpers.

Implements Clinics Module Priority 2: Billing ↔ ClinicVisit integration.

This module is intentionally small and transactional:
- Create/reuse a draft invoice for a clinic visit's encounter
- Add the consultation fee line item (idempotent via ClinicVisit flags)
- Link invoice back to the clinic visit for reporting
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction

from hmis.apps.billing.models import Invoice, InvoiceItem, Service
from hmis.apps.clinics.models import ClinicVisit


def _get_system_user():
    User = get_user_model()
    system_user, _ = User.objects.get_or_create(
        username="system", defaults={"email": "system@vitora.local", "is_active": True}
    )
    return system_user


@transaction.atomic
def create_consultation_invoice(
    clinic_visit: ClinicVisit,
    *,
    created_by=None,
) -> Invoice:
    """Create (or reuse) a draft invoice and add a consultation fee item.

    Args:
        clinic_visit: ClinicVisit being started.
        created_by: User creating the invoice/item (falls back to system user).

    Returns:
        Invoice: The draft invoice linked to the visit/encounter.

    Notes:
        - Idempotent for the visit: if consultation fee already charged, returns existing invoice.
        - Uses clinic.default_service_fee and optional clinic.sha_service_code mapping to Service.
    """

    if created_by is None:
        created_by = _get_system_user()

    # If we already charged this visit, return the existing invoice (best effort)
    if getattr(clinic_visit, "billing_line_item_id", None):
        return clinic_visit.billing_line_item.invoice

    clinic = clinic_visit.session.clinic
    consultation_fee: Decimal | None = clinic.default_service_fee

    # Skip if no fee configured
    if not consultation_fee:
        # Still ensure any existing invoice gets linked for reporting
        if clinic_visit.encounter_id:
            invoice = Invoice.objects.filter(encounter_id=clinic_visit.encounter_id).first()
            if invoice and getattr(invoice, "clinic_visit_id", None) != clinic_visit.id:
                invoice.clinic_visit_id = clinic_visit.id
                invoice.save(update_fields=["clinic_visit", "updated_at"])
            return invoice  # type: ignore[return-value]
        # No encounter/invoice context; create nothing
        raise ValueError("Clinic has no default_service_fee configured")

    # Reuse existing draft/pending invoice for the encounter if present
    invoice = None
    if clinic_visit.encounter_id:
        invoice = Invoice.objects.filter(
            encounter_id=clinic_visit.encounter_id,
            status__in=[Invoice.Status.DRAFT, Invoice.Status.PENDING],
        ).first()

    if not invoice:
        invoice = Invoice.objects.create(
            patient=clinic_visit.patient,
            encounter_id=clinic_visit.encounter_id,
            clinic_visit=clinic_visit,
            status=Invoice.Status.DRAFT,
            created_by=created_by,
            facility=getattr(clinic_visit, "facility", None),
            organization=getattr(clinic_visit, "organization", None),
        )
    else:
        # Ensure the invoice points back to this visit for reporting
        updates = []
        if getattr(invoice, "clinic_visit_id", None) != clinic_visit.id:
            invoice.clinic_visit_id = clinic_visit.id
            updates.append("clinic_visit")
        if not invoice.facility_id and getattr(clinic_visit, "facility_id", None):
            invoice.facility = clinic_visit.facility
            updates.append("facility")
        if not invoice.organization_id and getattr(clinic_visit, "organization_id", None):
            invoice.organization = clinic_visit.organization
            updates.append("organization")
        if updates:
            updates.append("updated_at")
            invoice.save(update_fields=updates)

    # Determine description
    is_return = clinic_visit.visit_type in ["RETURN", "FOLLOW_UP", "REFERRAL"]
    description = (
        f"Review/Follow-up Consultation - {clinic.name}"
        if is_return
        else f"Consultation - {clinic.name}"
    )

    # Best-effort service mapping via sha_service_code
    service = None
    if clinic.sha_service_code:
        service = Service.objects.filter(code=clinic.sha_service_code).first()

    item = InvoiceItem.objects.create(
        invoice=invoice,
        service=service,
        description=description,
        quantity=1,
        unit_price=consultation_fee,
    )

    # Mark as charged and link to billing
    clinic_visit.consultation_fee_charged = True
    clinic_visit.billing_line_item = item
    clinic_visit.save(update_fields=["consultation_fee_charged", "billing_line_item", "updated_at"])

    return invoice
