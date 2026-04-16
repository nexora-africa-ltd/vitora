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
    ETIMSInvoice,
    ETIMSInvoiceStatus,
    GoodsReceiptNote,
    GRNStatus,
    PurchaseOrder,
    PurchaseOrderStatus,
    StockCount,
    StockCountStatus,
    StockTransfer,
    Supplier,
    TransferStatus,
    WardStockTransaction,
    WardTransactionType,
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


# ===========================================================================
# Phase 3: Ward / Satellite Stock
# ===========================================================================


@receiver(post_save, sender=WardStockTransaction)
def publish_ward_stock_event(sender, instance, created, **kwargs):
    """Publish events for ward stock transactions (consume / replenish)."""
    if not created:
        return

    ws = instance.ward_stock
    payload = {
        "ward_stock_id": ws.pk,
        "drug_id": ws.drug_id,
        "store_location_id": ws.store_location_id,
        "transaction_type": instance.transaction_type,
        "quantity": instance.quantity,
        "quantity_available": ws.quantity_available,
        "facility_id": ws.facility_id,
    }

    if instance.transaction_type == WardTransactionType.CONSUME:
        publish_event(InventoryEvents.WARD_STOCK_CONSUMED, "WardStock", ws.pk, payload)
    elif instance.transaction_type == WardTransactionType.REPLENISH:
        publish_event(InventoryEvents.WARD_STOCK_REPLENISHED, "WardStock", ws.pk, payload)

    # Fire low-stock event if below par level after any transaction
    if ws.is_below_par:
        publish_event(InventoryEvents.WARD_STOCK_LOW, "WardStock", ws.pk, payload)


# ===========================================================================
# Phase 4: Stock Reconciliation & Cycle Counting
# ===========================================================================


@receiver(post_save, sender=StockCount)
def publish_stock_count_event(sender, instance, created, **kwargs):
    """Publish events for stock count lifecycle."""
    if created:
        return
    payload = {
        "count_number": instance.count_number,
        "status": instance.status,
        "count_type": instance.count_type,
        "store_location_id": instance.store_location_id,
        "facility_id": instance.facility_id,
    }
    if instance.status == StockCountStatus.COMPLETED:
        publish_event(InventoryEvents.STOCK_COUNT_COMPLETED, "StockCount", instance.pk, payload)
    elif instance.status == StockCountStatus.APPROVED:
        payload["approved_by_id"] = instance.approved_by_id
        publish_event(InventoryEvents.STOCK_COUNT_APPROVED, "StockCount", instance.pk, payload)


# ===========================================================================
# Phase 5: KRA eTIMS
# ===========================================================================


@receiver(post_save, sender=ETIMSInvoice)
def publish_etims_invoice_event(sender, instance, created, **kwargs):
    """Publish events for eTIMS invoice status transitions."""
    if created:
        return
    payload = {
        "invoice_id": instance.invoice_id,
        "status": instance.status,
        "facility_id": instance.facility_id,
        "retry_count": instance.retry_count,
    }
    status_event_map = {
        ETIMSInvoiceStatus.SUBMITTED: InventoryEvents.ETIMS_SUBMITTED,
        ETIMSInvoiceStatus.CONFIRMED: InventoryEvents.ETIMS_CONFIRMED,
        ETIMSInvoiceStatus.FAILED: InventoryEvents.ETIMS_FAILED,
    }
    event_type = status_event_map.get(instance.status)
    if event_type:
        if instance.etims_receipt_number:
            payload["receipt_number"] = instance.etims_receipt_number
        if instance.error_message:
            payload["error_message"] = instance.error_message
        publish_event(event_type, "ETIMSInvoice", instance.pk, payload)
