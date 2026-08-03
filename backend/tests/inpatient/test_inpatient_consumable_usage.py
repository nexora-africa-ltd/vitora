"""Tests for inpatient consumable stock usage and reversal."""

from decimal import Decimal

import pytest  # type: ignore
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestInpatientConsumableUsageModel:
    """Model tests for inpatient consumable stock usage."""

    def test_create_usage_reduces_stock(self, sample_admission, sample_stock_batch, test_user):
        """Creating consumable usage should debit the linked pharmacy batch."""
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=5,
            used_by=test_user,
            notes="Used for ward dressing pack",
        )

        sample_stock_batch.refresh_from_db()

        assert usage.pk is not None
        assert usage.drug == sample_stock_batch.drug
        assert sample_stock_batch.quantity_available == 995
        assert sample_stock_batch.quantity_dispensed == 5

    def test_reverse_usage_restores_stock(self, sample_admission, sample_stock_batch, test_user):
        """Reversing consumable usage should restore stock to the original batch."""
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=8,
            used_by=test_user,
            notes="Used for IV setup",
        )

        usage.reverse(user=test_user, reason="Recorded against wrong patient")

        sample_stock_batch.refresh_from_db()
        usage.refresh_from_db()

        assert sample_stock_batch.quantity_available == 1000
        assert sample_stock_batch.quantity_dispensed == 0
        assert usage.is_reversed is True
        assert usage.reversed_by == test_user
        assert usage.reverse_reason == "Recorded against wrong patient"

    def test_usage_billing_is_idempotent_on_update(
        self, sample_admission, sample_stock_batch, test_user
    ):
        """Updating a usage row should not create duplicate invoice lines."""
        from hmis.apps.billing.models import InvoiceItem
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=2,
            used_by=test_user,
            notes="Initial entry",
        )

        usage.notes = "Updated notes"
        usage.save()

        assert (
            InvoiceItem.objects.filter(
                inpatient_consumable_usage=usage,
                item_type=InvoiceItem.ItemType.CONSUMABLE,
            ).count()
            == 1
        )


@pytest.mark.django_db
class TestInpatientConsumableUsageAPI:
    """API tests for inpatient consumable stock usage."""

    def test_record_consumable_usage_action(
        self, authenticated_client, sample_admission, sample_stock_batch
    ):
        """Admission action should create consumable usage and debit stock."""
        response = authenticated_client.post(
            reverse(
                "inpatient:admission-record-consumable-usage", kwargs={"pk": sample_admission.id}
            ),
            {
                "batch": sample_stock_batch.id,
                "quantity_used": 4,
                "notes": "Used for inpatient dressing change",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["admission"] == sample_admission.id
        assert response.data["batch"] == sample_stock_batch.id
        assert response.data["quantity_used"] == 4
        assert response.data["drug"] == sample_stock_batch.drug.id
        assert response.data["is_reversed"] is False

        sample_stock_batch.refresh_from_db()
        assert sample_stock_batch.quantity_available == 996

        from hmis.apps.billing.models import InvoiceItem

        billed_line = InvoiceItem.objects.filter(
            inpatient_consumable_usage_id=response.data["id"],
            item_type=InvoiceItem.ItemType.CONSUMABLE,
        ).first()
        assert billed_line is not None
        assert billed_line.invoice.encounter_id == sample_admission.ipd_encounter_id
        assert billed_line.drug_id == sample_stock_batch.drug_id
        assert billed_line.quantity == Decimal("4")

    def test_record_consumable_usage_updates_encounter_invoice_totals(
        self, authenticated_client, sample_admission, sample_stock_batch, test_user
    ):
        """Regression: recording admission consumable usage must update invoice totals."""
        from hmis.apps.billing.models import Invoice, InvoiceItem

        admission = sample_admission
        encounter = admission.ipd_encounter

        invoice = Invoice.objects.filter(
            patient=admission.patient,
            encounter=encounter,
            status=Invoice.Status.DRAFT,
        ).first()
        if invoice is None:
            invoice = Invoice.objects.create(
                patient=admission.patient,
                encounter=encounter,
                status=Invoice.Status.DRAFT,
                invoice_date=encounter.encounter_date,
                due_date=encounter.encounter_date,
                payment_type=Invoice.PaymentType.CASH,
                payer_type=Invoice.PayerType.CASH,
                created_by=test_user,
                facility=admission.facility,
                organization=admission.organization,
            )

        before_total = invoice.total_amount
        before_count = invoice.items.count()

        response = authenticated_client.post(
            reverse("inpatient:admission-record-consumable-usage", kwargs={"pk": admission.id}),
            {
                "batch": sample_stock_batch.id,
                "quantity_used": 3,
                "notes": "Consumable regression billing test",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED

        invoice.refresh_from_db()
        expected_line_total = Decimal("3") * sample_stock_batch.selling_price
        assert invoice.total_amount == before_total + expected_line_total
        assert invoice.items.count() == before_count + 1
        assert InvoiceItem.objects.filter(
            invoice=invoice,
            inpatient_consumable_usage_id=response.data["id"],
            item_type=InvoiceItem.ItemType.CONSUMABLE,
        ).exists()

    def test_stock_movement_report_includes_inpatient_consumable_usage(
        self, authenticated_client, sample_admission, sample_stock_batch, test_user
    ):
        """Pharmacy movement report should include inpatient consumable usage entries."""
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=3,
            used_by=test_user,
            notes="Ward procedure pack",
        )

        response = authenticated_client.get(reverse("pharmacy:stock-movement-report"))

        assert response.status_code == status.HTTP_200_OK
        assert any(
            movement["movement_type"] == "INPATIENT_CONSUMED"
            and movement["quantity"] == -3
            and f"Admission {sample_admission.admission_number}" in movement["reference"]
            and movement["reference"].endswith(f"Usage #{usage.pk}")
            for movement in response.data["results"]
        )

    def test_reverse_consumable_usage_action_restores_stock(
        self, authenticated_client, sample_admission, sample_stock_batch, test_user
    ):
        """Admission action should reverse usage and restore stock to the batch."""
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=6,
            used_by=test_user,
            notes="Used for IV line setup",
        )

        response = authenticated_client.post(
            reverse(
                "inpatient:admission-reverse-consumable-usage",
                kwargs={"pk": sample_admission.id, "usage_id": usage.pk},
            ),
            {"reason": "Duplicate entry"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == usage.pk
        assert response.data["is_reversed"] is True
        assert response.data["reverse_reason"] == "Duplicate entry"

        sample_stock_batch.refresh_from_db()
        assert sample_stock_batch.quantity_available == 1000
        assert sample_stock_batch.quantity_dispensed == 0

        from hmis.apps.billing.models import InvoiceItem

        assert (
            InvoiceItem.objects.filter(
                inpatient_consumable_usage=usage,
                item_type=InvoiceItem.ItemType.CONSUMABLE,
            ).count()
            == 0
        )
