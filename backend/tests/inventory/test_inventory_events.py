"""
Tests for Inventory domain event publishing.

Verifies that state transitions publish the correct events via signals.
"""

import pytest  # type: ignore

from hmis.apps.core.events import InventoryEvents
from hmis.apps.inventory.models import GoodsReceiptNote, PurchaseOrder, PurchaseOrderItem, Supplier

pytestmark = pytest.mark.django_db


class TestSupplierEvents:
    """Tests for Supplier event publishing."""

    def test_supplier_creation_publishes_event(self, mocker, sample_organization):
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        Supplier.objects.create(
            code="EVT-001",
            name="Event Test Supplier",
            organization=sample_organization,
        )
        mock_publish.assert_called_once_with(
            InventoryEvents.SUPPLIER_CREATED,
            "Supplier",
            mocker.ANY,
            mocker.ANY,
        )
        payload = mock_publish.call_args[0][3]
        assert payload["code"] == "EVT-001"
        assert payload["name"] == "Event Test Supplier"


class TestPurchaseOrderEvents:
    """Tests for PurchaseOrder event publishing."""

    def test_po_creation_publishes_event(
        self, mocker, sample_supplier, test_user, sample_facility, sample_organization, sample_drug
    ):
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        PurchaseOrder.objects.create(
            supplier=sample_supplier,
            ordered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called_with(
            InventoryEvents.PO_CREATED, "PurchaseOrder", mocker.ANY, mocker.ANY
        )

    def test_po_submit_publishes_event(self, mocker, sample_purchase_order):
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        sample_purchase_order.submit()
        mock_publish.assert_called_with(
            InventoryEvents.PO_SUBMITTED, "PurchaseOrder", mocker.ANY, mocker.ANY
        )

    def test_po_approve_publishes_event(self, mocker, submitted_purchase_order, test_user):
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        submitted_purchase_order.approve(test_user)
        mock_publish.assert_called_with(
            InventoryEvents.PO_APPROVED, "PurchaseOrder", mocker.ANY, mocker.ANY
        )

    def test_po_cancel_publishes_event(self, mocker, sample_purchase_order, test_user):
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        sample_purchase_order.cancel(test_user, reason="Test cancel")
        mock_publish.assert_called_with(
            InventoryEvents.PO_CANCELLED, "PurchaseOrder", mocker.ANY, mocker.ANY
        )


class TestGRNEvents:
    """Tests for GoodsReceiptNote event publishing."""

    def test_grn_creation_publishes_event(
        self, mocker, sample_supplier, test_user, sample_facility, sample_organization
    ):
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        GoodsReceiptNote.objects.create(
            supplier=sample_supplier,
            received_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called_with(
            InventoryEvents.GRN_CREATED, "GoodsReceiptNote", mocker.ANY, mocker.ANY
        )

    def test_grn_confirm_publishes_event(self, mocker, sample_grn, test_user):
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        sample_grn.confirm(user=test_user)
        mock_publish.assert_called_with(
            InventoryEvents.GRN_CONFIRMED, "GoodsReceiptNote", mocker.ANY, mocker.ANY
        )

    def test_grn_cancel_publishes_event(self, mocker, sample_grn):
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        sample_grn.cancel()
        mock_publish.assert_called_with(
            InventoryEvents.GRN_CANCELLED, "GoodsReceiptNote", mocker.ANY, mocker.ANY
        )
