"""
Inventory signals for domain event publishing.

Publishes events for:
- Supplier creation
- Purchase order state transitions
- GRN confirmation
- Stock transfer state transitions
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import InventoryEvents, publish_event

from .models import (
    GoodsReceiptNote,
    GRNStatus,
    PurchaseOrder,
    PurchaseOrderStatus,
    StockTransfer,
    Supplier,
    TransferStatus,
)

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Supplier)
def publish_supplier_event(sender, instance, created, **kwargs):
    """Publish event when a supplier is created."""
    if created:
        publish_event(
            InventoryEvents.SUPPLIER_CREATED,
            "Supplier",
            instance.pk,
            {
                "code": instance.code,
                "name": instance.name,
                "supplier_type": instance.supplier_type,
                "organization_id": instance.organization_id,
            },
        )


@receiver(post_save, sender=PurchaseOrder)
def publish_purchase_order_event(sender, instance, created, **kwargs):
    """Publish events for PO state transitions."""
    payload = {
        "po_number": instance.po_number,
        "status": instance.status,
        "supplier_id": instance.supplier_id,
        "facility_id": instance.facility_id,
    }
    if created:
        publish_event(InventoryEvents.PO_CREATED, "PurchaseOrder", instance.pk, payload)
    else:
        status_event_map = {
            PurchaseOrderStatus.SUBMITTED: InventoryEvents.PO_SUBMITTED,
            PurchaseOrderStatus.APPROVED: InventoryEvents.PO_APPROVED,
            PurchaseOrderStatus.CANCELLED: InventoryEvents.PO_CANCELLED,
        }
        event_type = status_event_map.get(instance.status)
        if event_type:
            publish_event(event_type, "PurchaseOrder", instance.pk, payload)


@receiver(post_save, sender=GoodsReceiptNote)
def publish_grn_event(sender, instance, created, **kwargs):
    """Publish events for GRN state transitions."""
    payload = {
        "grn_number": instance.grn_number,
        "status": instance.status,
        "supplier_id": instance.supplier_id,
        "purchase_order_id": instance.purchase_order_id,
        "facility_id": instance.facility_id,
    }
    if created:
        publish_event(InventoryEvents.GRN_CREATED, "GoodsReceiptNote", instance.pk, payload)
    elif instance.status == GRNStatus.CONFIRMED:
        publish_event(InventoryEvents.GRN_CONFIRMED, "GoodsReceiptNote", instance.pk, payload)
    elif instance.status == GRNStatus.CANCELLED:
        publish_event(InventoryEvents.GRN_CANCELLED, "GoodsReceiptNote", instance.pk, payload)


@receiver(post_save, sender=StockTransfer)
def publish_stock_transfer_event(sender, instance, created, **kwargs):
    """Publish events for stock transfer state transitions."""
    payload = {
        "transfer_number": instance.transfer_number,
        "status": instance.status,
        "source_facility_id": instance.source_facility_id,
        "destination_facility_id": instance.destination_facility_id,
        "organization_id": instance.organization_id,
    }
    if created:
        publish_event(InventoryEvents.TRANSFER_CREATED, "StockTransfer", instance.pk, payload)
    else:
        status_event_map = {
            TransferStatus.REQUESTED: InventoryEvents.TRANSFER_REQUESTED,
            TransferStatus.APPROVED: InventoryEvents.TRANSFER_APPROVED,
            TransferStatus.IN_TRANSIT: InventoryEvents.TRANSFER_DISPATCHED,
            TransferStatus.RECEIVED: InventoryEvents.TRANSFER_RECEIVED,
            TransferStatus.CANCELLED: InventoryEvents.TRANSFER_CANCELLED,
        }
        event_type = status_event_map.get(instance.status)
        if event_type:
            publish_event(event_type, "StockTransfer", instance.pk, payload)
