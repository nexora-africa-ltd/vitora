from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.billing.models import Invoice, InvoiceItem


@pytest.mark.django_db
class TestTheatreBillingIntegration:
    def test_sync_theatre_case_billing_creates_case_level_invoice_items(
        self,
        sample_surgery_case,
        sample_procedure_catalog,
        theatre_billing_service,
        theatre_stock_drug,
        test_user,
        sample_organization,
        sample_facility,
    ):
        from hmis.apps.billing.agent import BillingAgentService
        from hmis.apps.theatre.models import TheatreConsumable

        sample_procedure_catalog.billing_service = theatre_billing_service
        sample_procedure_catalog.surgeon_fee = Decimal("5000.00")
        sample_procedure_catalog.theatre_fee = Decimal("4000.00")
        sample_procedure_catalog.anesthesia_fee = Decimal("3500.00")
        sample_procedure_catalog.save(
            update_fields=[
                "billing_service",
                "surgeon_fee",
                "theatre_fee",
                "anesthesia_fee",
                "updated_at",
            ]
        )

        consumable = TheatreConsumable.objects.create(
            surgery_case=sample_surgery_case,
            item=theatre_stock_drug,
            lot_number="TH-BATCH-001",
            quantity_used=2,
            unit_cost=Decimal("950.00"),
            added_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )

        invoice = BillingAgentService.sync_theatre_case_billing(sample_surgery_case)

        case_items = invoice.items.filter(surgery_case=sample_surgery_case)
        assert invoice.patient == sample_surgery_case.patient
        assert invoice.encounter == sample_surgery_case.encounter
        assert case_items.count() == 5
        assert case_items.filter(description__icontains="Appendectomy").exists()
        assert case_items.filter(description="Theatre surgeon fee").first().line_total == Decimal(
            "5000.00"
        )
        assert case_items.filter(description="Theatre usage fee").first().line_total == Decimal(
            "4000.00"
        )
        consumable_item = case_items.get(theatre_consumable=consumable)
        assert consumable_item.item_type == InvoiceItem.ItemType.CONSUMABLE
        assert consumable_item.drug == theatre_stock_drug
        assert consumable_item.line_total == Decimal("1900.00")

        sample_surgery_case.refresh_from_db()
        assert sample_surgery_case.total_charges == Decimal("39400.00")

    def test_sync_theatre_case_billing_is_idempotent_and_updates_consumable_lines(
        self,
        sample_surgery_case,
        sample_procedure_catalog,
        theatre_billing_service,
        theatre_stock_drug,
        test_user,
        sample_organization,
        sample_facility,
    ):
        from hmis.apps.billing.agent import BillingAgentService
        from hmis.apps.theatre.models import TheatreConsumable

        sample_procedure_catalog.billing_service = theatre_billing_service
        sample_procedure_catalog.surgeon_fee = Decimal("2000.00")
        sample_procedure_catalog.theatre_fee = Decimal("1500.00")
        sample_procedure_catalog.anesthesia_fee = Decimal("1000.00")
        sample_procedure_catalog.save(
            update_fields=[
                "billing_service",
                "surgeon_fee",
                "theatre_fee",
                "anesthesia_fee",
                "updated_at",
            ]
        )

        consumable = TheatreConsumable.objects.create(
            surgery_case=sample_surgery_case,
            item=theatre_stock_drug,
            lot_number="TH-BATCH-002",
            quantity_used=1,
            unit_cost=Decimal("900.00"),
            added_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )

        first_invoice = BillingAgentService.sync_theatre_case_billing(sample_surgery_case)
        BillingAgentService.sync_theatre_case_billing(sample_surgery_case)

        assert first_invoice.items.filter(surgery_case=sample_surgery_case).count() == 5

        consumable.quantity_used = 3
        consumable.unit_cost = Decimal("925.00")
        consumable.save(update_fields=["quantity_used", "unit_cost", "updated_at"])

        BillingAgentService.sync_theatre_case_billing(sample_surgery_case)

        updated_item = first_invoice.items.get(theatre_consumable=consumable)
        assert updated_item.quantity == Decimal("3.00")
        assert updated_item.unit_price == Decimal("925.00")
        assert updated_item.line_total == Decimal("2775.00")

    def test_discharge_workflow_creates_theatre_invoice_items(
        self,
        authenticated_client,
        in_pacu_surgery_case,
        sample_procedure_catalog,
        theatre_billing_service,
        theatre_stock_drug,
        test_user,
        sample_organization,
        sample_facility,
    ):
        from hmis.apps.theatre.models import TheatreConsumable

        sample_procedure_catalog.billing_service = theatre_billing_service
        sample_procedure_catalog.surgeon_fee = Decimal("5000.00")
        sample_procedure_catalog.theatre_fee = Decimal("4000.00")
        sample_procedure_catalog.anesthesia_fee = Decimal("3500.00")
        sample_procedure_catalog.save(
            update_fields=[
                "billing_service",
                "surgeon_fee",
                "theatre_fee",
                "anesthesia_fee",
                "updated_at",
            ]
        )

        TheatreConsumable.objects.create(
            surgery_case=in_pacu_surgery_case,
            item=theatre_stock_drug,
            lot_number="TH-BATCH-003",
            quantity_used=2,
            unit_cost=Decimal("950.00"),
            added_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )

        response = authenticated_client.post(
            f"/api/theatre/cases/{in_pacu_surgery_case.case_number}/discharge/"
        )

        assert response.status_code == 200
        invoice = Invoice.objects.filter(
            patient=in_pacu_surgery_case.patient,
            encounter=in_pacu_surgery_case.encounter,
            status=Invoice.Status.DRAFT,
        ).first()
        assert invoice is not None
        assert invoice.items.filter(surgery_case=in_pacu_surgery_case).count() == 5

    def test_theatre_workflow_exposes_case_linked_items_via_billing_api(
        self,
        authenticated_client,
        in_pacu_surgery_case,
        sample_procedure_catalog,
        theatre_billing_service,
        theatre_stock_drug,
        theatre_stock_batch,
    ):
        sample_procedure_catalog.billing_service = theatre_billing_service
        sample_procedure_catalog.surgeon_fee = Decimal("5000.00")
        sample_procedure_catalog.theatre_fee = Decimal("4000.00")
        sample_procedure_catalog.anesthesia_fee = Decimal("3500.00")
        sample_procedure_catalog.save(
            update_fields=[
                "billing_service",
                "surgeon_fee",
                "theatre_fee",
                "anesthesia_fee",
                "updated_at",
            ]
        )

        add_response = authenticated_client.post(
            f"/api/theatre/cases/{in_pacu_surgery_case.case_number}/consumables/add/",
            {
                "item": theatre_stock_drug.id,
                "quantity_used": 2,
            },
        )
        assert add_response.status_code == status.HTTP_201_CREATED

        discharge_response = authenticated_client.post(
            f"/api/theatre/cases/{in_pacu_surgery_case.case_number}/discharge/"
        )
        assert discharge_response.status_code == status.HTTP_200_OK

        invoice = Invoice.objects.get(
            patient=in_pacu_surgery_case.patient,
            encounter=in_pacu_surgery_case.encounter,
            status=Invoice.Status.DRAFT,
        )
        detail_response = authenticated_client.get(f"/api/billing/invoices/{invoice.id}/")

        assert detail_response.status_code == status.HTTP_200_OK
        case_items = [
            item
            for item in detail_response.data["items"]
            if item["surgery_case"] == in_pacu_surgery_case.id
        ]
        assert len(case_items) == 5
        consumable_item = next(
            item for item in case_items if item["theatre_consumable"] == add_response.data["id"]
        )
        assert consumable_item["surgery_case_number"] == in_pacu_surgery_case.case_number
        assert (
            consumable_item["description"]
            == f"Theatre consumable: {theatre_stock_drug.generic_name}"
        )
        assert consumable_item["line_total"] == "1900.00"

    def test_finalized_invoice_blocks_theatre_consumable_removal(
        self,
        authenticated_client,
        in_pacu_surgery_case,
        sample_procedure_catalog,
        theatre_billing_service,
        theatre_stock_drug,
        theatre_stock_batch,
    ):
        sample_procedure_catalog.billing_service = theatre_billing_service
        sample_procedure_catalog.save(update_fields=["billing_service", "updated_at"])

        add_response = authenticated_client.post(
            f"/api/theatre/cases/{in_pacu_surgery_case.case_number}/consumables/add/",
            {
                "item": theatre_stock_drug.id,
                "quantity_used": 2,
            },
        )
        assert add_response.status_code == status.HTTP_201_CREATED

        discharge_response = authenticated_client.post(
            f"/api/theatre/cases/{in_pacu_surgery_case.case_number}/discharge/"
        )
        assert discharge_response.status_code == status.HTTP_200_OK

        invoice = Invoice.objects.get(
            patient=in_pacu_surgery_case.patient,
            encounter=in_pacu_surgery_case.encounter,
            status=Invoice.Status.DRAFT,
        )
        finalize_response = authenticated_client.post(
            f"/api/billing/invoices/{invoice.id}/finalize/"
        )
        assert finalize_response.status_code == status.HTTP_200_OK

        delete_response = authenticated_client.delete(
            f"/api/theatre/cases/{in_pacu_surgery_case.case_number}/consumables/{add_response.data['id']}/"
        )

        assert delete_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "non-draft invoice item" in delete_response.data["error"]
        theatre_stock_batch.refresh_from_db()
        assert theatre_stock_batch.quantity_available == 18
