"""Stock-aware theatre consumable services."""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction

from hmis.apps.pharmacy.services import FEFODispenser
from hmis.apps.theatre.models import TheatreConsumable, TheatreConsumableAllocation


def _weighted_unit_cost(total_cost: Decimal, quantity: int) -> Decimal:
    if quantity <= 0:
        return Decimal("0.00")
    return (total_cost / Decimal(str(quantity))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@transaction.atomic
def create_theatre_consumable(*, surgery_case, added_by, data: dict, tenant_kwargs: dict):
    """Create a theatre consumable and deduct stock from FEFO pharmacy batches."""
    item = data["item"]
    quantity_used = data["quantity_used"]
    batches = FEFODispenser.get_batches_for_dispensing(
        item,
        quantity_used,
        facility=surgery_case.facility_id,
    )

    total_cost = sum((batch.cost_price * qty for batch, qty in batches), Decimal("0.00"))
    unit_cost = _weighted_unit_cost(total_cost, quantity_used)

    lot_number = data.get("lot_number") or ""
    expiry_date = data.get("expiry_date")
    if len(batches) == 1:
        batch, _ = batches[0]
        lot_number = lot_number or batch.batch_number
        expiry_date = expiry_date or batch.expiry_date

    consumable = TheatreConsumable.objects.create(
        surgery_case=surgery_case,
        item=item,
        lot_number=lot_number,
        expiry_date=expiry_date,
        quantity_used=quantity_used,
        unit_cost=unit_cost,
        added_by=added_by,
        is_implant=data.get("is_implant", False),
        implant_serial_number=data.get("implant_serial_number", ""),
        **tenant_kwargs,
    )

    for batch, quantity in batches:
        batch.dispense(quantity)
        TheatreConsumableAllocation.objects.create(
            theatre_consumable=consumable,
            batch=batch,
            quantity_used=quantity,
            unit_cost=batch.cost_price,
        )

    return consumable


@transaction.atomic
def restore_theatre_consumable_stock(consumable: TheatreConsumable) -> None:
    """Restore stock for all FEFO allocations tied to a theatre consumable line."""
    for allocation in consumable.allocations.select_related("batch").all():
        allocation.batch.return_stock(allocation.quantity_used)
