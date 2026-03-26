"""
Tests for the Billing Agent Service.

TDD RED → GREEN approach: these tests define the expected behavior for the
automated billing agent, which handles:
- Draft invoice creation & line item management
- Lab order billing
- Admission billing (admission fee + bed charges)
- Discharge billing (finalize invoice + SHA claim)
- Daily bed charge accrual (Celery beat)
- Overdue invoice flagging (Celery beat)
- Pending SHA claim submission (Celery beat)
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest  # type: ignore
from django.utils import timezone

from hmis.apps.billing.models import (
    Invoice,
    InvoiceItem,
    SHAClaim,
    SHAMember,
    Service,
    ServiceCategory,
)


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def lab_service_category(db):
    """Lab billing service category."""
    return ServiceCategory.objects.create(
        name="Laboratory",
        code="LAB",
        description="Lab test services",
        display_order=2,
    )


@pytest.fixture
def lab_billing_service(db, lab_service_category, test_user):
    """Lab billing service that matches a test catalog entry by code."""
    return Service.objects.create(
        category=lab_service_category,
        code="CBC",
        name="Complete Blood Count",
        unit_price=Decimal("500.00"),
        created_by=test_user,
    )


@pytest.fixture
def ipd_service_category(db):
    """IPD billing service category."""
    return ServiceCategory.objects.create(
        name="Inpatient",
        code="IPD",
        description="Inpatient services",
        display_order=3,
    )


@pytest.fixture
def admission_fee_service(db, ipd_service_category, test_user):
    """Admission fee service."""
    return Service.objects.create(
        category=ipd_service_category,
        code="ADM-FEE",
        name="Admission Fee",
        unit_price=Decimal("1000.00"),
        created_by=test_user,
    )


@pytest.fixture
def bed_night_service(db, ipd_service_category, test_user):
    """Bed night service."""
    return Service.objects.create(
        category=ipd_service_category,
        code="BED-NIGHT",
        name="Bed Night Charge",
        unit_price=Decimal("500.00"),
        created_by=test_user,
    )


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create an active SHA member for a patient."""
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-0000000001",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        created_by=test_user,
    )


@pytest.fixture
def _no_billing_signals():
    """Temporarily disconnect billing signals to avoid side effects in tests.

    Use when you need to manually control invoice creation without
    the encounter/admission/discharge signals firing.
    """
    from hmis.apps.billing.signals import (
        create_invoice_for_encounter,
        handle_admission_billing,
        handle_discharge_billing,
    )
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.inpatient.models import Admission, Discharge

    # Disconnect
    from django.db.models.signals import post_save

    post_save.disconnect(create_invoice_for_encounter, sender=Encounter)
    post_save.disconnect(handle_discharge_billing, sender=Discharge, dispatch_uid="billing_handle_discharge")
    post_save.disconnect(handle_admission_billing, sender=Admission, dispatch_uid="billing_handle_admission")
    yield
    # Reconnect
    post_save.connect(create_invoice_for_encounter, sender=Encounter)
    post_save.connect(handle_discharge_billing, sender=Discharge, dispatch_uid="billing_handle_discharge")
    post_save.connect(handle_admission_billing, sender=Admission, dispatch_uid="billing_handle_admission")


# ============================================================================
# Test: get_or_create_draft_invoice
# ============================================================================


class TestGetOrCreateDraftInvoice:
    """Tests for BillingAgentService.get_or_create_draft_invoice."""

    def test_creates_draft_invoice_for_patient(self, db, sample_patient):
        """Should create a new draft invoice when none exists."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice = BillingAgentService.get_or_create_draft_invoice(sample_patient)

        assert invoice is not None
        assert invoice.status == Invoice.Status.DRAFT
        assert invoice.patient == sample_patient
        assert invoice.invoice_date == date.today()

    def test_reuses_existing_draft_invoice(self, db, sample_patient):
        """Should return existing draft invoice from today instead of creating a new one."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice1 = BillingAgentService.get_or_create_draft_invoice(sample_patient)
        invoice2 = BillingAgentService.get_or_create_draft_invoice(sample_patient)

        assert invoice1.pk == invoice2.pk

    def test_links_encounter_to_existing_draft(
        self, db, sample_patient, sample_encounter
    ):
        """Should link encounter to existing unlinked draft invoice."""
        from hmis.apps.billing.agent import BillingAgentService

        # Delete any invoices created by signals so we start clean
        Invoice.objects.filter(patient=sample_patient).delete()

        invoice = BillingAgentService.get_or_create_draft_invoice(sample_patient)
        assert invoice.encounter is None

        invoice2 = BillingAgentService.get_or_create_draft_invoice(
            sample_patient, encounter=sample_encounter
        )
        assert invoice2.pk == invoice.pk
        invoice2.refresh_from_db()
        assert invoice2.encounter == sample_encounter

    def test_creates_invoice_with_encounter(
        self, db, sample_patient, sample_encounter
    ):
        """Should create a new draft with encounter if no existing draft."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice = BillingAgentService.get_or_create_draft_invoice(
            sample_patient, encounter=sample_encounter
        )

        assert invoice.encounter == sample_encounter
        assert invoice.status == Invoice.Status.DRAFT


# ============================================================================
# Test: add_line_item
# ============================================================================


class TestAddLineItem:
    """Tests for BillingAgentService.add_line_item."""

    def test_adds_service_line_item(
        self, db, sample_patient, lab_billing_service
    ):
        """Should add a service as a line item on the invoice."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice = BillingAgentService.get_or_create_draft_invoice(sample_patient)
        item = BillingAgentService.add_line_item(
            invoice,
            service=lab_billing_service,
            quantity=1,
            description="CBC Test",
            item_type=InvoiceItem.ItemType.LAB,
        )

        assert item is not None
        assert item.invoice == invoice
        assert item.unit_price == Decimal("500.00")
        assert item.quantity == 1

    def test_updates_invoice_totals(
        self, db, sample_patient, lab_billing_service
    ):
        """Should recalculate invoice totals after adding item."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice = BillingAgentService.get_or_create_draft_invoice(sample_patient)
        BillingAgentService.add_line_item(
            invoice,
            service=lab_billing_service,
            quantity=1,
            description="CBC Test",
            item_type=InvoiceItem.ItemType.LAB,
        )

        invoice.refresh_from_db()
        assert invoice.subtotal == Decimal("500.00")


# ============================================================================
# Test: handle_lab_order_confirmed
# ============================================================================


class TestHandleLabOrderConfirmed:
    """Tests for BillingAgentService.handle_lab_order_confirmed."""

    def test_creates_invoice_items_for_lab_order(
        self,
        db,
        sample_lab_order,
        lab_billing_service,
    ):
        """Should add lab test items to invoice when order is confirmed."""
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_lab_order_confirmed(sample_lab_order)

        # Should have created an invoice for the patient
        invoice = Invoice.objects.filter(
            patient=sample_lab_order.patient,
            status=Invoice.Status.DRAFT,
        ).first()
        assert invoice is not None

        # Should have lab items
        lab_items = invoice.items.filter(item_type=InvoiceItem.ItemType.LAB)
        assert lab_items.count() == 1
        assert lab_items.first().unit_price == Decimal("500.00")

    def test_skips_items_without_matching_service(
        self, db, sample_lab_order
    ):
        """Should skip lab items that have no matching billing service."""
        from hmis.apps.billing.agent import BillingAgentService

        # No lab_billing_service fixture → no matching Service with code=CBC
        BillingAgentService.handle_lab_order_confirmed(sample_lab_order)

        # Should still create an invoice but with no items
        invoice = Invoice.objects.filter(
            patient=sample_lab_order.patient,
            status=Invoice.Status.DRAFT,
        ).first()
        assert invoice is not None
        assert invoice.items.count() == 0

    def test_links_lab_order_to_invoice_item(
        self, db, sample_lab_order, lab_billing_service
    ):
        """Should link the LabOrder FK on the InvoiceItem."""
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_lab_order_confirmed(sample_lab_order)

        invoice = Invoice.objects.filter(
            patient=sample_lab_order.patient,
            status=Invoice.Status.DRAFT,
        ).first()
        item = invoice.items.first()
        assert item.lab_order == sample_lab_order


# ============================================================================
# Test: handle_admission_created
# ============================================================================


class TestHandleAdmissionCreated:
    """Tests for BillingAgentService.handle_admission_created."""

    def test_creates_admission_fee_line_item(
        self,
        db,
        sample_admission,
        admission_fee_service,
        bed_night_service,
    ):
        """Should add admission fee to invoice."""
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_admission_created(sample_admission)

        invoice = Invoice.objects.filter(
            patient=sample_admission.patient,
            status=Invoice.Status.DRAFT,
        ).first()
        assert invoice is not None

        # Should have admission fee
        admission_items = invoice.items.filter(description__icontains="admission fee")
        assert admission_items.count() == 1
        assert admission_items.first().unit_price == Decimal("1000.00")

    def test_adds_first_bed_night_charge(
        self,
        db,
        sample_admission,
        admission_fee_service,
        bed_night_service,
    ):
        """Should add first bed night charge on admission."""
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_admission_created(sample_admission)

        invoice = Invoice.objects.filter(
            patient=sample_admission.patient,
            status=Invoice.Status.DRAFT,
        ).first()

        bed_items = invoice.items.filter(description__icontains="bed night")
        assert bed_items.count() == 1
        # Bed night uses ward's daily_rate (500.00)
        assert bed_items.first().unit_price == Decimal("500.00")


# ============================================================================
# Test: handle_discharge
# ============================================================================


class TestHandleDischarge:
    """Tests for BillingAgentService.handle_discharge."""

    @staticmethod
    def _create_discharge_no_signal(admission, test_user):
        """Create a Discharge without triggering the billing signal."""
        from contextlib import contextmanager

        from django.db.models.signals import post_save

        from hmis.apps.billing.signals import handle_discharge_billing
        from hmis.apps.inpatient.models import Discharge

        post_save.disconnect(handle_discharge_billing, sender=Discharge, dispatch_uid="billing_handle_discharge")
        try:
            discharge = Discharge.objects.create(
                admission=admission,
                discharge_type="NORMAL",
                discharge_date=timezone.now(),
                discharged_by=test_user,
                admission_diagnosis="J18.9",
                final_diagnosis="J18.9",
                final_diagnosis_text="Pneumonia, unspecified",
                treatment_summary="Treated with antibiotics",
            )
        finally:
            post_save.connect(handle_discharge_billing, sender=Discharge, dispatch_uid="billing_handle_discharge")
        return discharge

    def test_finalizes_invoice_to_pending(
        self,
        db,
        sample_admission,
        bed_night_service,
        test_user,
    ):
        """Should move draft invoice to pending on discharge."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice = BillingAgentService.get_or_create_draft_invoice(
            sample_admission.patient, encounter=sample_admission.ipd_encounter
        )

        discharge = self._create_discharge_no_signal(sample_admission, test_user)
        BillingAgentService.handle_discharge(discharge)

        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.PENDING

    def test_adds_remaining_bed_nights(
        self,
        db,
        sample_admission,
        bed_night_service,
        test_user,
    ):
        """Should add any unbilled bed nights on discharge."""
        from hmis.apps.billing.agent import BillingAgentService

        sample_admission.admission_date = timezone.now() - timedelta(days=3)
        sample_admission.save(update_fields=["admission_date"])

        BillingAgentService.get_or_create_draft_invoice(
            sample_admission.patient, encounter=sample_admission.ipd_encounter
        )

        discharge = self._create_discharge_no_signal(sample_admission, test_user)
        BillingAgentService.handle_discharge(discharge)

        invoice = Invoice.objects.filter(
            patient=sample_admission.patient,
            encounter=sample_admission.ipd_encounter,
        ).first()

        bed_items = invoice.items.filter(description__icontains="bed night")
        assert bed_items.exists()

    def test_creates_sha_claim_if_eligible(
        self,
        db,
        sample_admission,
        bed_night_service,
        sha_member,
        test_user,
    ):
        """Should auto-create SHA claim on discharge for eligible patients."""
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.get_or_create_draft_invoice(
            sample_admission.patient, encounter=sample_admission.ipd_encounter
        )

        discharge = self._create_discharge_no_signal(sample_admission, test_user)

        with patch(
            "hmis.apps.billing.agent.BillingAgentService._maybe_create_sha_claim"
        ) as mock_sha:
            BillingAgentService.handle_discharge(discharge)
            mock_sha.assert_called_once()

    def test_handles_missing_invoice_gracefully(
        self, db, sample_admission, test_user
    ):
        """Should log warning if no draft invoice exists for discharge."""
        from hmis.apps.billing.agent import BillingAgentService

        discharge = self._create_discharge_no_signal(sample_admission, test_user)

        # Delete any auto-created invoices
        Invoice.objects.filter(patient=sample_admission.patient).delete()

        # Should not raise
        BillingAgentService.handle_discharge(discharge)


# ============================================================================
# Test: apply_daily_bed_charges (Celery beat)
# ============================================================================


class TestApplyDailyBedCharges:
    """Tests for BillingAgentService.apply_daily_bed_charges."""

    def test_charges_active_admissions(
        self,
        db,
        sample_admission,
        bed_night_service,
    ):
        """Should add a bed night charge for each active admission."""
        from hmis.apps.billing.agent import BillingAgentService

        charged = BillingAgentService.apply_daily_bed_charges()

        assert charged == 1

        invoice = Invoice.objects.filter(
            patient=sample_admission.patient,
            status=Invoice.Status.DRAFT,
        ).first()
        assert invoice is not None

        bed_items = invoice.items.filter(description__icontains="bed night")
        assert bed_items.count() == 1

    def test_skips_discharged_admissions(
        self,
        db,
        sample_admission,
        bed_night_service,
        test_user,
    ):
        """Should not charge discharged admissions."""
        from hmis.apps.billing.agent import BillingAgentService

        sample_admission.admission_status = "DISCHARGED"
        sample_admission.save(update_fields=["admission_status"])

        charged = BillingAgentService.apply_daily_bed_charges()
        assert charged == 0

    def test_skips_admissions_without_bed_night_service(
        self,
        db,
        sample_admission,
    ):
        """Should not add bed charges if BED-NIGHT service doesn't exist."""
        from hmis.apps.billing.agent import BillingAgentService

        charged = BillingAgentService.apply_daily_bed_charges()
        # Invoice still created but no bed item because BED-NIGHT service is missing
        assert charged == 1

        invoice = Invoice.objects.filter(
            patient=sample_admission.patient,
            status=Invoice.Status.DRAFT,
        ).first()
        assert invoice.items.filter(description__icontains="bed night").count() == 0


# ============================================================================
# Test: flag_overdue_invoices (Celery beat)
# ============================================================================


class TestFlagOverdueInvoices:
    """Tests for BillingAgentService.flag_overdue_invoices."""

    def test_flags_past_due_pending_invoices(self, db, sample_patient, test_user):
        """Should mark pending invoices past due date as overdue."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today() - timedelta(days=40),
            due_date=date.today() - timedelta(days=10),
            status=Invoice.Status.PENDING,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        flagged = BillingAgentService.flag_overdue_invoices()

        assert flagged == 1
        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.OVERDUE

    def test_does_not_flag_draft_invoices(self, db, sample_patient, test_user):
        """Should not flag draft invoices even if past due."""
        from hmis.apps.billing.agent import BillingAgentService

        Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today() - timedelta(days=40),
            due_date=date.today() - timedelta(days=10),
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        flagged = BillingAgentService.flag_overdue_invoices()
        assert flagged == 0

    def test_does_not_flag_future_due_invoices(self, db, sample_patient, test_user):
        """Should not flag invoices whose due date is in the future."""
        from hmis.apps.billing.agent import BillingAgentService

        Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PENDING,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        flagged = BillingAgentService.flag_overdue_invoices()
        assert flagged == 0


# ============================================================================
# Test: submit_pending_sha_claims (Celery beat)
# ============================================================================


class TestSubmitPendingSHAClaims:
    """Tests for BillingAgentService.submit_pending_sha_claims."""

    def test_submits_draft_claims(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should submit validated draft SHA claims."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PENDING,
            payment_type=Invoice.PaymentType.INSURANCE,
            created_by=test_user,
        )

        claim = SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            encounter=sample_encounter,
            invoice=invoice,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            status=SHAClaim.ClaimStatus.DRAFT,
            claimed_amount=Decimal("500.00"),
            service_date=date.today(),
            facility_code="12345",
            facility_level="L4",
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia, unspecified",
            created_by=test_user,
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.validate_claim.return_value = (True, [])
            mock_instance.submit_claim.return_value = {"status": "submitted"}

            submitted = BillingAgentService.submit_pending_sha_claims()

        assert submitted == 1

    def test_skips_invalid_claims(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should skip claims that fail validation."""
        from hmis.apps.billing.agent import BillingAgentService

        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PENDING,
            payment_type=Invoice.PaymentType.INSURANCE,
            created_by=test_user,
        )

        SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            encounter=sample_encounter,
            invoice=invoice,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            status=SHAClaim.ClaimStatus.DRAFT,
            claimed_amount=Decimal("500.00"),
            service_date=date.today(),
            facility_code="12345",
            facility_level="L4",
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia, unspecified",
            created_by=test_user,
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.validate_claim.return_value = (
                False,
                ["Missing primary diagnosis"],
            )

            submitted = BillingAgentService.submit_pending_sha_claims()

        assert submitted == 0


# ============================================================================
# Test: Celery tasks
# ============================================================================


class TestBillingCeleryTasks:
    """Tests for billing Celery tasks."""

    def test_apply_daily_bed_charges_task(self, db):
        """Task should call BillingAgentService.apply_daily_bed_charges."""
        from hmis.apps.billing.tasks import apply_daily_bed_charges

        with patch(
            "hmis.apps.billing.agent.BillingAgentService.apply_daily_bed_charges"
        ) as mock:
            mock.return_value = 0
            result = apply_daily_bed_charges()
            mock.assert_called_once()

    def test_flag_overdue_invoices_task(self, db):
        """Task should call BillingAgentService.flag_overdue_invoices."""
        from hmis.apps.billing.tasks import flag_overdue_invoices

        with patch(
            "hmis.apps.billing.agent.BillingAgentService.flag_overdue_invoices"
        ) as mock:
            mock.return_value = 0
            result = flag_overdue_invoices()
            mock.assert_called_once()

    def test_submit_pending_sha_claims_task(self, db):
        """Task should call BillingAgentService.submit_pending_sha_claims."""
        from hmis.apps.billing.tasks import submit_pending_sha_claims

        with patch(
            "hmis.apps.billing.agent.BillingAgentService.submit_pending_sha_claims"
        ) as mock:
            mock.return_value = 0
            result = submit_pending_sha_claims()
            mock.assert_called_once()


# ============================================================================
# Test: Celery beat schedule registration
# ============================================================================


class TestBillingBeatSchedule:
    """Tests for billing tasks registered in Celery beat schedule."""

    def test_daily_bed_charges_in_beat_schedule(self):
        """Daily bed charges task should be in Celery beat schedule."""
        from hmis.celery import app

        schedule = app.conf.beat_schedule
        task_names = [v["task"] for v in schedule.values()]
        assert "hmis.apps.billing.tasks.apply_daily_bed_charges" in task_names

    def test_flag_overdue_invoices_in_beat_schedule(self):
        """Flag overdue invoices task should be in Celery beat schedule."""
        from hmis.celery import app

        schedule = app.conf.beat_schedule
        task_names = [v["task"] for v in schedule.values()]
        assert "hmis.apps.billing.tasks.flag_overdue_invoices" in task_names

    def test_submit_sha_claims_in_beat_schedule(self):
        """Submit SHA claims task should be in Celery beat schedule."""
        from hmis.celery import app

        schedule = app.conf.beat_schedule
        task_names = [v["task"] for v in schedule.values()]
        assert "hmis.apps.billing.tasks.submit_pending_sha_claims" in task_names

    def test_poll_sha_claim_statuses_in_beat_schedule(self):
        """Poll SHA claim statuses task should be in Celery beat schedule."""
        from hmis.celery import app

        schedule = app.conf.beat_schedule
        task_names = [v["task"] for v in schedule.values()]
        assert "hmis.apps.billing.tasks.poll_sha_claim_statuses" in task_names


# ============================================================================
# Test: poll_sha_claim_statuses (Celery beat)
# ============================================================================


class TestPollSHAClaimStatuses:
    """Tests for BillingAgentService.poll_sha_claim_statuses."""

    def _make_submitted_claim(
        self, sample_patient, sample_encounter, sha_member, test_user, **overrides
    ):
        """Helper to create a submitted SHA claim with a SHA reference."""
        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PENDING,
            payment_type=Invoice.PaymentType.INSURANCE,
            created_by=test_user,
        )

        defaults = dict(
            patient=sample_patient,
            sha_member=sha_member,
            encounter=sample_encounter,
            invoice=invoice,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            status=SHAClaim.ClaimStatus.SUBMITTED,
            sha_claim_reference="SHA-REF-001",
            claimed_amount=Decimal("5000.00"),
            service_date=date.today(),
            submitted_at=timezone.now(),
            facility_code="12345",
            facility_level="L4",
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia, unspecified",
            created_by=test_user,
        )
        defaults.update(overrides)
        return SHAClaim.objects.create(**defaults)

    def test_polls_submitted_claims(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should poll SHA API for submitted claims and update status."""
        from hmis.apps.billing.agent import BillingAgentService

        claim = self._make_submitted_claim(
            sample_patient, sample_encounter, sha_member, test_user
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.get_claim_status.return_value = {
                "outcome": "complete",
                "disposition": "Claim approved in full",
                "approved_amount": 5000.00,
            }

            result = BillingAgentService.poll_sha_claim_statuses()

        claim.refresh_from_db()
        assert result["checked"] == 1
        assert result["updated"] == 1
        assert result["errors"] == 0
        assert claim.status == SHAClaim.ClaimStatus.APPROVED
        assert claim.approved_amount == Decimal("5000.00")
        assert claim.adjudication_notes == "Claim approved in full"

    def test_skips_claims_without_sha_reference(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should skip claims that have no SHA reference to query."""
        from hmis.apps.billing.agent import BillingAgentService

        self._make_submitted_claim(
            sample_patient,
            sample_encounter,
            sha_member,
            test_user,
            sha_claim_reference="",
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            result = BillingAgentService.poll_sha_claim_statuses()

        assert result["checked"] == 0
        MockService.return_value.get_claim_status.assert_not_called()

    def test_handles_rejected_claims(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should update rejected claims with rejection details."""
        from hmis.apps.billing.agent import BillingAgentService

        claim = self._make_submitted_claim(
            sample_patient, sample_encounter, sha_member, test_user
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.get_claim_status.return_value = {
                "outcome": "error",
                "disposition": "Missing pre-authorization",
                "rejection_reason": "Pre-auth required for this procedure",
                "rejection_code": "AUTH_REQUIRED",
            }

            result = BillingAgentService.poll_sha_claim_statuses()

        claim.refresh_from_db()
        assert result["updated"] == 1
        assert claim.status == SHAClaim.ClaimStatus.REJECTED
        assert claim.rejection_reason == "Pre-auth required for this procedure"
        assert claim.rejection_code == "AUTH_REQUIRED"
        assert claim.adjudication_date == date.today()

    def test_no_update_if_status_unchanged(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should not update if SHA returns the same status."""
        from hmis.apps.billing.agent import BillingAgentService

        claim = self._make_submitted_claim(
            sample_patient, sample_encounter, sha_member, test_user
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.get_claim_status.return_value = {
                "status": "submitted",
            }

            result = BillingAgentService.poll_sha_claim_statuses()

        assert result["checked"] == 1
        assert result["updated"] == 0

    def test_creates_activity_feed_on_status_change(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should create an ActivityFeed notification when claim status changes."""
        from hmis.apps.billing.agent import BillingAgentService
        from hmis.apps.core.models import ActivityFeed

        claim = self._make_submitted_claim(
            sample_patient, sample_encounter, sha_member, test_user
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.get_claim_status.return_value = {
                "outcome": "complete",
                "approved_amount": 5000.00,
            }

            BillingAgentService.poll_sha_claim_statuses()

        feed = ActivityFeed.objects.filter(
            activity_type="billing",
            resource_type="SHAClaim",
            resource_id=claim.id,
        ).first()
        assert feed is not None
        assert feed.action == "claim_approved"
        assert claim.claim_number in feed.title
        assert feed.metadata["new_status"] == SHAClaim.ClaimStatus.APPROVED

    def test_handles_api_errors_gracefully(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should handle API errors without crashing the batch."""
        from hmis.apps.billing.agent import BillingAgentService

        self._make_submitted_claim(
            sample_patient, sample_encounter, sha_member, test_user
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.get_claim_status.side_effect = Exception("Connection timed out")

            result = BillingAgentService.poll_sha_claim_statuses()

        assert result["checked"] == 1
        assert result["errors"] == 1
        assert result["updated"] == 0

    def test_poll_task_calls_agent(self, db):
        """Celery task should delegate to BillingAgentService."""
        from hmis.apps.billing.tasks import poll_sha_claim_statuses

        with patch(
            "hmis.apps.billing.agent.BillingAgentService.poll_sha_claim_statuses"
        ) as mock:
            mock.return_value = {"checked": 0, "updated": 0, "errors": 0}
            result = poll_sha_claim_statuses()
            mock.assert_called_once()

    def test_handles_partial_approval(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should handle partial approval and record approved amount."""
        from hmis.apps.billing.agent import BillingAgentService

        claim = self._make_submitted_claim(
            sample_patient, sample_encounter, sha_member, test_user
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.get_claim_status.return_value = {
                "outcome": "partial",
                "approved_amount": 3000.00,
                "disposition": "Optical excluded from coverage",
            }

            result = BillingAgentService.poll_sha_claim_statuses()

        claim.refresh_from_db()
        assert result["updated"] == 1
        assert claim.status == SHAClaim.ClaimStatus.PARTIALLY_APPROVED
        assert claim.approved_amount == Decimal("3000.00")

    def test_handles_payment_status(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Should handle paid status with payment reference."""
        from hmis.apps.billing.agent import BillingAgentService

        claim = self._make_submitted_claim(
            sample_patient, sample_encounter, sha_member, test_user
        )

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.get_claim_status.return_value = {
                "status": "paid",
                "approved_amount": 5000.00,
                "payment_reference": "SHA-PAY-2026-001",
            }

            result = BillingAgentService.poll_sha_claim_statuses()

        claim.refresh_from_db()
        assert result["updated"] == 1
        assert claim.status == SHAClaim.ClaimStatus.PAID
        assert claim.payment_reference == "SHA-PAY-2026-001"
        assert claim.payment_date == date.today()


# ============================================================================
# Test: Webhook claim status update with notifications
# ============================================================================


class TestWebhookClaimNotifications:
    """Tests for SHA webhook _update_claim_status with ActivityFeed."""

    def test_webhook_creates_activity_feed(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Webhook status update should create ActivityFeed notification."""
        from hmis.apps.billing.sha_views import SHAWebhookView
        from hmis.apps.core.models import ActivityFeed

        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PENDING,
            payment_type=Invoice.PaymentType.INSURANCE,
            created_by=test_user,
        )

        claim = SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            encounter=sample_encounter,
            invoice=invoice,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            status=SHAClaim.ClaimStatus.SUBMITTED,
            sha_claim_reference="SHA-WH-001",
            claimed_amount=Decimal("3000.00"),
            service_date=date.today(),
            submitted_at=timezone.now(),
            facility_code="12345",
            facility_level="L4",
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia",
            created_by=test_user,
        )

        view = SHAWebhookView()
        updated = view._update_claim_status(
            claim_reference="SHA-WH-001",
            new_status="approved",
            disposition="Approved in full",
            approved_amount=3000.00,
            response_payload={"outcome": "complete"},
        )

        assert updated is True

        claim.refresh_from_db()
        assert claim.status == "approved"
        assert claim.adjudication_notes == "Approved in full"

        feed = ActivityFeed.objects.filter(
            activity_type="billing",
            resource_type="SHAClaim",
            resource_id=claim.id,
        ).first()
        assert feed is not None
        assert feed.action == "claim_approved"

    def test_webhook_no_notification_if_status_unchanged(
        self, db, sample_patient, sample_encounter, sha_member, test_user
    ):
        """Webhook should not create ActivityFeed if status didn't change."""
        from hmis.apps.billing.sha_views import SHAWebhookView
        from hmis.apps.core.models import ActivityFeed

        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PENDING,
            payment_type=Invoice.PaymentType.INSURANCE,
            created_by=test_user,
        )

        claim = SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            encounter=sample_encounter,
            invoice=invoice,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            status=SHAClaim.ClaimStatus.APPROVED,
            sha_claim_reference="SHA-WH-002",
            claimed_amount=Decimal("2000.00"),
            service_date=date.today(),
            submitted_at=timezone.now(),
            facility_code="12345",
            facility_level="L4",
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia",
            created_by=test_user,
        )

        view = SHAWebhookView()
        view._update_claim_status(
            claim_reference="SHA-WH-002",
            new_status="approved",
            disposition="",
            approved_amount=2000.00,
            response_payload={},
        )

        feed_count = ActivityFeed.objects.filter(
            activity_type="billing",
            resource_type="SHAClaim",
            resource_id=claim.id,
        ).count()
        assert feed_count == 0
