"""
Billing Agent Service for Vitora HMIS.

Centralized orchestrator that automates the entire billing lifecycle:
- Invoice creation and line item management (event-driven)
- Daily bed charge accrual (scheduled)
- Invoice finalization on discharge (event-driven)
- SHA eligibility checks and claim creation (automatic)
- Overdue invoice flagging (scheduled)

All billing logic flows through this service to ensure consistency,
audit logging, and a single place to manage billing rules.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from hmis.apps.billing.models import (
    Invoice,
    InvoiceItem,
    Service,
    ServiceCategory,
    SHAClaim,
    SHAMember,
)

logger = logging.getLogger(__name__)

User = get_user_model()


def _get_system_user():
    """Get or create the system user used for automated billing actions."""
    user, _ = User.objects.get_or_create(
        username="system",
        defaults={"email": "system@vitora.local", "is_active": True},
    )
    return user


class BillingAgentService:
    """Event-driven billing automation agent.

    Provides methods for:
    - Draft invoice creation and reuse
    - Adding line items (lab, pharmacy, bed charges)
    - Discharge billing finalization
    - SHA claim auto-creation
    - Scheduled batch operations (Celery beat)
    """

    # ── Invoice Management ───────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def get_or_create_draft_invoice(patient, encounter=None) -> Invoice:
        """Get today's existing draft invoice or create a new one.

        Args:
            patient: Patient instance.
            encounter: Optional Encounter to link.

        Returns:
            Draft Invoice instance.
        """
        invoice = Invoice.objects.filter(
            patient=patient,
            invoice_date=date.today(),
            status=Invoice.Status.DRAFT,
        ).first()

        if invoice:
            # Link encounter if not already linked
            if encounter and not invoice.encounter:
                invoice.encounter = encounter
                invoice.save(update_fields=["encounter", "updated_at"])
            return invoice

        return Invoice.objects.create(
            patient=patient,
            encounter=encounter,
            invoice_date=date.today(),
            due_date=date.today()
            + timedelta(days=getattr(settings, "BILLING_DEFAULT_DUE_DAYS", 30)),
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            created_by=_get_system_user(),
        )

    @staticmethod
    @transaction.atomic
    def add_line_item(
        invoice: Invoice,
        *,
        service: Service,
        quantity: int = 1,
        description: str = "",
        item_type: str = InvoiceItem.ItemType.SERVICE,
        lab_order=None,
    ) -> InvoiceItem:
        """Add a billable line item to an invoice.

        Args:
            invoice: Target Invoice.
            service: Billing Service for pricing.
            quantity: Number of units.
            description: Line item description.
            item_type: InvoiceItem.ItemType value.
            lab_order: Optional LabOrder FK for lab items.

        Returns:
            Created InvoiceItem.
        """
        return InvoiceItem.objects.create(
            invoice=invoice,
            item_type=item_type,
            service=service,
            description=description or service.name,
            quantity=quantity,
            unit_price=service.unit_price,
            lab_order=lab_order,
        )

    # ── Event Handlers (called from signals) ─────────────────────

    @classmethod
    def handle_lab_order_confirmed(cls, lab_order) -> None:
        """Auto-bill lab tests when order is confirmed.

        Called from laboratory signal when LabOrder status → ORDERED.
        Looks up billing Service by matching TestCatalog.code → Service.code.
        """
        encounter = lab_order.encounter
        invoice = cls.get_or_create_draft_invoice(encounter.patient, encounter)

        for item in lab_order.items.select_related("test"):
            # Primary lookup: exact code match (TestCatalog.code == Service.code)
            service = Service.objects.filter(
                code=item.test.code,
                is_active=True,
            ).first()

            # Fallback: match by name within the LAB category
            if not service:
                service = Service.objects.filter(
                    category__code="LAB",
                    name__iexact=item.test.name,
                    is_active=True,
                ).first()

            if service:
                cls.add_line_item(
                    invoice,
                    service=service,
                    quantity=1,
                    description=f"Lab: {item.test.name}",
                    item_type=InvoiceItem.ItemType.LAB,
                    lab_order=lab_order,
                )
                logger.info(
                    "Billing agent: added lab item %s to invoice %s",
                    item.test.name,
                    invoice.invoice_number,
                )
            else:
                logger.warning(
                    "Billing agent: no billing Service found for test %s (code=%s). "
                    "Run 'manage.py seed_service_catalog --force' to sync.",
                    item.test.name,
                    item.test.code,
                )

    @classmethod
    def handle_admission_created(cls, admission) -> None:
        """Auto-bill admission fee and first bed night.

        Called from inpatient signal when Admission is created.
        """
        encounter = admission.ipd_encounter
        invoice = cls.get_or_create_draft_invoice(admission.patient, encounter)

        # Admission fee
        admission_service = Service.objects.filter(
            category__code="IPD",
            code="ADM-FEE",
            is_active=True,
        ).first()

        if admission_service:
            cls.add_line_item(
                invoice,
                service=admission_service,
                description="Admission fee",
            )

        # First bed night
        cls._add_bed_charge(invoice, admission)

        logger.info(
            "Billing agent: admission billing for patient %s, invoice %s",
            admission.patient_id,
            invoice.invoice_number,
        )

    @classmethod
    @transaction.atomic
    def handle_discharge(cls, discharge) -> None:
        """Finalize billing on patient discharge.

        1. Add any remaining bed charges.
        2. Finalize the invoice (DRAFT → PENDING).
        3. Create SHA claim if patient is SHA-eligible.
        """
        admission = discharge.admission
        invoice = Invoice.objects.filter(
            patient=admission.patient,
            encounter=admission.ipd_encounter,
            status=Invoice.Status.DRAFT,
        ).first()

        if not invoice:
            logger.warning(
                "Billing agent: no draft invoice found for discharge %s",
                discharge.id,
            )
            return

        # Calculate remaining bed nights
        total_nights = (discharge.discharge_date - admission.admission_date).days
        billed_nights = invoice.items.filter(
            description__istartswith="bed night:",
        ).count()
        remaining = max(0, total_nights - billed_nights)

        if remaining > 0:
            cls._add_bed_charge(invoice, admission, nights=remaining)

        # Finalize invoice
        invoice.status = Invoice.Status.PENDING
        invoice.save(update_fields=["status", "updated_at"])

        logger.info(
            "Billing agent: finalized invoice %s on discharge (total: %s)",
            invoice.invoice_number,
            invoice.total_amount,
        )

        # Auto-create SHA claim if eligible
        cls._maybe_create_sha_claim(invoice, admission.ipd_encounter)

    @classmethod
    def _add_bed_charge(cls, invoice: Invoice, admission, nights: int = 1) -> None:
        """Add bed night charge(s) for an admission.

        Uses ward.daily_rate as the price. Requires a BED-NIGHT service
        in the IPD category.
        """
        ward = admission.ward
        if not ward or not ward.daily_rate:
            return

        bed_service = Service.objects.filter(
            category__code="IPD",
            code="BED-NIGHT",
            is_active=True,
        ).first()

        if not bed_service:
            return

        InvoiceItem.objects.create(
            invoice=invoice,
            item_type=InvoiceItem.ItemType.SERVICE,
            service=bed_service,
            description=f"Bed night: {ward.name} ({date.today()})",
            quantity=nights,
            unit_price=ward.daily_rate,
        )

    # ── SHA Automation ───────────────────────────────────────────

    @classmethod
    def _maybe_create_sha_claim(cls, invoice: Invoice, encounter) -> SHAClaim | None:
        """Create an SHA claim if the patient has active SHA coverage."""
        try:
            sha_member = SHAMember.objects.filter(
                patient=invoice.patient,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()
        except SHAMember.DoesNotExist:
            return None

        if not sha_member:
            return None

        try:
            from hmis.apps.billing.services.sha_claims import SHAClaimsService

            service = SHAClaimsService()
            claim = service.create_claim_from_encounter(
                encounter=encounter,
                invoice=invoice,
                user=_get_system_user(),
            )
            logger.info(
                "Billing agent: auto-created SHA claim %s for invoice %s",
                claim.claim_number,
                invoice.invoice_number,
            )
            return claim
        except Exception:
            logger.exception(
                "Billing agent: SHA claim creation failed for invoice %s",
                invoice.invoice_number,
            )
            return None

    # ── Batch Operations (called from Celery tasks) ──────────────

    @classmethod
    def apply_daily_bed_charges(cls) -> int:
        """Apply daily bed charges to all active admissions.

        Called at midnight by Celery beat. Adds one bed night charge
        per active admission to the patient's draft invoice.

        Returns:
            Number of admissions charged.
        """
        from hmis.apps.inpatient.models import Admission

        active_admissions = Admission.objects.filter(
            admission_status="ACTIVE",
        ).select_related("patient", "ipd_encounter", "ward", "bed")

        charged = 0
        for admission in active_admissions:
            try:
                invoice = cls.get_or_create_draft_invoice(
                    admission.patient, admission.ipd_encounter
                )
                cls._add_bed_charge(invoice, admission, nights=1)
                charged += 1
            except Exception:
                logger.exception(
                    "Billing agent: bed charge failed for admission %s",
                    admission.id,
                )

        logger.info(
            "Billing agent: applied daily bed charges to %d admissions", charged
        )
        return charged

    @classmethod
    def flag_overdue_invoices(cls) -> int:
        """Flag invoices past their due date as overdue.

        Called daily at 6 AM by Celery beat. Only transitions
        PENDING invoices to OVERDUE.

        Returns:
            Number of invoices flagged.
        """
        flagged = Invoice.objects.filter(
            status=Invoice.Status.PENDING,
            due_date__lt=date.today(),
        ).update(status=Invoice.Status.OVERDUE)

        logger.info("Billing agent: flagged %d invoices as overdue", flagged)
        return flagged

    @classmethod
    def submit_pending_sha_claims(cls) -> int:
        """Batch-submit SHA claims that are in DRAFT status.

        Called hourly by Celery beat. Submits claims one at a time
        to respect SHA API rate limits. Processes up to 20 per run.

        Returns:
            Number of claims submitted.
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        pending_claims = SHAClaim.objects.filter(
            status=SHAClaim.ClaimStatus.DRAFT,
        ).order_by("created_at")[:20]

        service = SHAClaimsService()
        submitted = 0

        for claim in pending_claims:
            try:
                is_valid, errors = service.validate_claim(claim)
                if not is_valid:
                    logger.warning(
                        "Billing agent: claim %s invalid: %s",
                        claim.claim_number,
                        errors,
                    )
                    continue

                service.submit_claim(claim, _get_system_user())
                submitted += 1
            except Exception:
                logger.exception(
                    "Billing agent: claim submission failed for %s",
                    claim.claim_number,
                )

        logger.info("Billing agent: submitted %d SHA claims", submitted)
        return submitted

    @classmethod
    def poll_sha_claim_statuses(cls) -> dict:
        """Poll SHA API for status updates on submitted/under-review claims.

        Called every 15 minutes by Celery beat. Checks claims that have been
        submitted but not yet resolved (approved/rejected/paid).

        Processes up to 50 claims per run. Creates ActivityFeed entries
        for any status changes so billing staff see them on the dashboard.

        Returns:
            Dict with counts: {checked, updated, errors}.
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService
        from hmis.apps.core.models import ActivityFeed

        pollable_statuses = [
            SHAClaim.ClaimStatus.SUBMITTED,
            SHAClaim.ClaimStatus.ACKNOWLEDGED,
            SHAClaim.ClaimStatus.UNDER_REVIEW,
            SHAClaim.ClaimStatus.QUERY,
        ]

        claims = (
            SHAClaim.objects.filter(status__in=pollable_statuses)
            .exclude(sha_claim_reference="")
            .select_related("patient")
            .order_by("submitted_at")[:50]
        )

        service = SHAClaimsService()
        result = {"checked": 0, "updated": 0, "errors": 0}

        for claim in claims:
            result["checked"] += 1
            try:
                api_response = service.get_claim_status(claim.sha_claim_reference)
                new_status = cls._map_sha_status(api_response)

                if new_status and new_status != claim.status:
                    old_status = claim.status
                    cls._apply_status_update(claim, new_status, api_response)
                    cls._notify_claim_status_change(claim, old_status, new_status)
                    result["updated"] += 1
                    logger.info(
                        "Billing agent: claim %s status %s -> %s",
                        claim.claim_number,
                        old_status,
                        new_status,
                    )
            except Exception:
                result["errors"] += 1
                logger.exception(
                    "Billing agent: status poll failed for claim %s",
                    claim.claim_number,
                )

        logger.info(
            "Billing agent: polled %d claims, %d updated, %d errors",
            result["checked"],
            result["updated"],
            result["errors"],
        )
        return result

    @staticmethod
    def _map_sha_status(api_response: dict) -> str | None:
        """Map SHA API status response to internal ClaimStatus value.

        The SHA API returns various status strings depending on the
        response format (FHIR outcome or simple status field).
        """
        # Try FHIR outcome first
        outcome = api_response.get("outcome", "")
        fhir_map = {
            "complete": SHAClaim.ClaimStatus.APPROVED,
            "queued": SHAClaim.ClaimStatus.UNDER_REVIEW,
            "error": SHAClaim.ClaimStatus.REJECTED,
            "partial": SHAClaim.ClaimStatus.PARTIALLY_APPROVED,
        }
        if outcome in fhir_map:
            return fhir_map[outcome]

        # Try simple status field
        status_str = api_response.get("status", "").lower()
        simple_map = {
            "approved": SHAClaim.ClaimStatus.APPROVED,
            "rejected": SHAClaim.ClaimStatus.REJECTED,
            "partially_approved": SHAClaim.ClaimStatus.PARTIALLY_APPROVED,
            "partial": SHAClaim.ClaimStatus.PARTIALLY_APPROVED,
            "under_review": SHAClaim.ClaimStatus.UNDER_REVIEW,
            "query": SHAClaim.ClaimStatus.QUERY,
            "paid": SHAClaim.ClaimStatus.PAID,
            "acknowledged": SHAClaim.ClaimStatus.ACKNOWLEDGED,
        }
        return simple_map.get(status_str)

    @staticmethod
    def _apply_status_update(claim: SHAClaim, new_status: str, api_response: dict):
        """Apply status update from SHA API response to the claim."""
        from decimal import Decimal, InvalidOperation

        update_fields = ["status", "submission_response", "updated_at"]
        claim.status = new_status
        claim.submission_response = api_response

        # Extract approved amount
        approved = api_response.get("approved_amount") or api_response.get("total", {}).get(
            "value"
        )
        if approved is not None:
            try:
                claim.approved_amount = Decimal(str(approved))
                update_fields.append("approved_amount")
            except (InvalidOperation, TypeError, ValueError):
                pass

        # Extract adjudication info
        disposition = api_response.get("disposition", "")
        if disposition:
            claim.adjudication_notes = disposition
            update_fields.append("adjudication_notes")

        # Set adjudication date for terminal statuses
        terminal = {
            SHAClaim.ClaimStatus.APPROVED,
            SHAClaim.ClaimStatus.PARTIALLY_APPROVED,
            SHAClaim.ClaimStatus.REJECTED,
            SHAClaim.ClaimStatus.PAID,
        }
        if new_status in terminal and not claim.adjudication_date:
            claim.adjudication_date = date.today()
            update_fields.append("adjudication_date")

        # Capture rejection details
        rejection_reason = api_response.get("rejection_reason", "")
        rejection_code = api_response.get("rejection_code", "")
        if rejection_reason:
            claim.rejection_reason = rejection_reason
            update_fields.append("rejection_reason")
        if rejection_code:
            claim.rejection_code = rejection_code
            update_fields.append("rejection_code")

        # Payment info
        payment_ref = api_response.get("payment_reference", "")
        if payment_ref and new_status == SHAClaim.ClaimStatus.PAID:
            claim.payment_reference = payment_ref
            claim.payment_date = date.today()
            update_fields.extend(["payment_reference", "payment_date"])

        claim.save(update_fields=update_fields)

    @staticmethod
    def _notify_claim_status_change(claim: SHAClaim, old_status: str, new_status: str):
        """Create an ActivityFeed entry for billing staff notification."""
        from hmis.apps.core.models import ActivityFeed

        status_labels = dict(SHAClaim.ClaimStatus.choices)
        new_label = status_labels.get(new_status, new_status)
        old_label = status_labels.get(old_status, old_status)

        patient_name = ""
        if claim.patient:
            patient_name = f"{claim.patient.first_name} {claim.patient.last_name}"

        # Determine severity/icon hint
        if new_status in (SHAClaim.ClaimStatus.APPROVED, SHAClaim.ClaimStatus.PAID):
            action = "claim_approved"
            title = f"SHA Claim {claim.claim_number} — {new_label}"
        elif new_status == SHAClaim.ClaimStatus.PARTIALLY_APPROVED:
            action = "claim_partial"
            title = f"SHA Claim {claim.claim_number} — Partially Approved"
        elif new_status == SHAClaim.ClaimStatus.REJECTED:
            action = "claim_rejected"
            title = f"SHA Claim {claim.claim_number} — Rejected"
        elif new_status == SHAClaim.ClaimStatus.QUERY:
            action = "claim_query"
            title = f"SHA Claim {claim.claim_number} — Query Raised"
        else:
            action = "claim_status_changed"
            title = f"SHA Claim {claim.claim_number} — {new_label}"

        description = f"Patient: {patient_name}. Status changed from {old_label} to {new_label}."
        if claim.adjudication_notes:
            description += f" Notes: {claim.adjudication_notes}"

        ActivityFeed.objects.create(
            activity_type="billing",
            action=action,
            title=title,
            description=description,
            resource_type="SHAClaim",
            resource_id=claim.id,
            metadata={
                "claim_number": claim.claim_number,
                "patient_name": patient_name,
                "old_status": old_status,
                "new_status": new_status,
                "claimed_amount": str(claim.claimed_amount),
                "approved_amount": str(claim.approved_amount) if claim.approved_amount else None,
            },
        )
