from __future__ import annotations

from decimal import Decimal

from django.db.models import Prefetch, QuerySet

from hmis.apps.billing.models import InvoiceItem, SHAClaim, SHAClaimItem

EXCLUDE_SHA_PORTION_STATUSES = {
    SHAClaim.ClaimStatus.DRAFT,
    SHAClaim.ClaimStatus.VALIDATED,
    SHAClaim.ClaimStatus.PENDING_SUBMISSION,
    SHAClaim.ClaimStatus.SUBMITTED,
    SHAClaim.ClaimStatus.ACKNOWLEDGED,
    SHAClaim.ClaimStatus.UNDER_REVIEW,
    SHAClaim.ClaimStatus.QUERY,
    SHAClaim.ClaimStatus.APPROVED,
    SHAClaim.ClaimStatus.PARTIALLY_APPROVED,
    SHAClaim.ClaimStatus.APPEALED,
    SHAClaim.ClaimStatus.PAID,
}


def _sha_excludable_amount(item: SHAClaimItem) -> Decimal:
    """Return the non-patient amount for a claim item when it should not block discharge."""
    claim_status = getattr(item.claim, "status", "")

    # Rejected/cancelled/written-off claims no longer protect billing clearance.
    if claim_status not in EXCLUDE_SHA_PORTION_STATUSES:
        return Decimal("0.00")

    # Unresolved allocation means patient liability is not finalized yet.
    if item.allocation_status != SHAClaimItem.AllocationStatus.RESOLVED:
        return Decimal("0.00")

    claimed_amount = Decimal(item.claimed_amount or 0)
    patient_payable_amount = Decimal(item.patient_payable_amount or 0)
    excludable = claimed_amount - patient_payable_amount
    if excludable <= 0:
        return Decimal("0.00")
    return excludable.quantize(Decimal("0.01"))


def calculate_patient_blocking_balance(
    unpaid_invoices: QuerySet,
) -> dict[str, Decimal | int | None]:
    """Calculate discharge-blocking patient balance from unpaid invoices.

    Any invoice portions linked to SHA claim lines are excluded from the
    discharge-blocking total when:
    - the claim status still represents an insurer receivable lifecycle, and
    - line allocation is resolved (patient portion is known).
    """

    invoices = unpaid_invoices.prefetch_related(
        Prefetch(
            "items",
            queryset=InvoiceItem.objects.only("id", "invoice_id", "line_total").prefetch_related(
                Prefetch(
                    "sha_claim_items",
                    queryset=SHAClaimItem.objects.select_related("claim").only(
                        "id",
                        "invoice_item_id",
                        "claimed_amount",
                        "patient_payable_amount",
                        "allocation_status",
                        "claim__status",
                    ),
                )
            ),
        )
    )

    outstanding_amount = Decimal("0.00")
    invoice_count = 0
    first_pending_id = None

    for invoice in invoices:
        invoice_sha_exclusion = Decimal("0.00")

        for invoice_item in invoice.items.all():
            line_total = Decimal(invoice_item.line_total or 0)
            max_for_line = line_total if line_total > 0 else Decimal("0.00")

            excludable_for_line = sum(
                (
                    _sha_excludable_amount(claim_item)
                    for claim_item in invoice_item.sha_claim_items.all()
                ),
                Decimal("0.00"),
            )
            invoice_sha_exclusion += min(excludable_for_line, max_for_line)

        blocking_for_invoice = Decimal(invoice.balance_due or 0) - invoice_sha_exclusion
        if blocking_for_invoice <= 0:
            continue

        blocking_for_invoice = blocking_for_invoice.quantize(Decimal("0.01"))
        outstanding_amount += blocking_for_invoice
        invoice_count += 1
        if first_pending_id is None:
            first_pending_id = invoice.id

    return {
        "outstanding_amount": outstanding_amount.quantize(Decimal("0.01")),
        "invoice_count": invoice_count,
        "first_pending_id": first_pending_id,
    }
