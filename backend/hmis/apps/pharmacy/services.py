"""
Pharmacy services for Vitora HMIS.

This module contains business logic services including:
- FEFODispenser: First Expiry First Out dispensing logic
"""

from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


class InsufficientStockError(Exception):
    """Raised when there is insufficient stock to fulfill a dispensing request."""

    pass


class FEFODispenser:
    """First Expiry First Out dispensing logic."""

    @staticmethod
    def get_batches_for_dispensing(drug, quantity: int, facility=None) -> list[tuple]:
        """
        Get batches to dispense from, prioritizing earliest expiry.

        Args:
            drug: Drug to dispense
            quantity: Total quantity needed

        Returns:
            List of (batch, quantity) tuples

        Raises:
            InsufficientStockError: If not enough stock available
        """
        from hmis.apps.pharmacy.models import StockBatch

        # Return empty list for zero quantity
        if quantity <= 0:
            return []

        # Get available batches ordered by expiry date, then received date
        available_batches = StockBatch.objects.filter(
            drug=drug,
            status="AVAILABLE",
            expiry_date__gt=timezone.now().date(),
            quantity_available__gt=0,
        ).order_by("expiry_date", "received_date")

        if facility is not None:
            facility_id = getattr(facility, "pk", facility)
            available_batches = available_batches.filter(facility_id=facility_id)

        result = []
        remaining = quantity

        for batch in available_batches:
            if remaining <= 0:
                break

            take = min(batch.quantity_available, remaining)
            result.append((batch, take))
            remaining -= take

        if remaining > 0:
            raise InsufficientStockError(
                f"Insufficient stock for {drug.generic_name}. "
                f"Requested: {quantity}, Available: {quantity - remaining}"
            )

        return result

    @staticmethod
    def dispense(drug, quantity: int, dispensed_by: User, **kwargs) -> list:
        """
        Dispense drug using FEFO logic.
        Creates dispensing records and updates batch quantities.

        Args:
            drug: Drug to dispense
            quantity: Total quantity to dispense
            dispensed_by: User performing the dispensing
            **kwargs: Additional fields for Dispensing model (patient, etc.)

        Returns:
            List of Dispensing instances created
        """
        from hmis.apps.pharmacy.models import Dispensing

        batches = FEFODispenser.get_batches_for_dispensing(
            drug,
            quantity,
            facility=kwargs.get("facility") or kwargs.get("facility_id"),
        )
        dispensings = []

        for batch, qty in batches:
            dispensing = Dispensing.objects.create(
                drug=drug,
                batch=batch,
                quantity_dispensed=qty,
                unit_price=batch.selling_price,
                total_price=batch.selling_price * qty,
                dispensed_by=dispensed_by,
                **kwargs,
            )
            dispensings.append(dispensing)

        return dispensings
