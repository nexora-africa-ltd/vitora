"""
Tests for Phase 2: Stock Transfer domain event publishing.

Verifies that domain events are published correctly for:
- Transfer creation
- Transfer state transitions (requested, approved, dispatched, received, cancelled)
"""

import pytest  # type: ignore

from hmis.apps.core.events.types import InventoryEvents

pytestmark = pytest.mark.django_db


class TestStockTransferEvents:
    """Tests for stock transfer event publishing."""

    def test_transfer_created_event(
        self, mocker, sample_facility, second_facility, sample_organization, test_user
    ):
        """Creating a transfer should publish TRANSFER_CREATED event."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")

        from hmis.apps.inventory.models import StockTransfer

        StockTransfer.objects.create(
            source_facility=sample_facility,
            destination_facility=second_facility,
            requested_by=test_user,
            organization=sample_organization,
        )

        mock_publish.assert_called_once_with(
            InventoryEvents.TRANSFER_CREATED,
            "StockTransfer",
            mocker.ANY,
            mocker.ANY,
        )
        payload = mock_publish.call_args[0][3]
        assert payload["source_facility_id"] == sample_facility.id
        assert payload["destination_facility_id"] == second_facility.id

    def test_transfer_requested_event(self, mocker, sample_transfer):
        """Submitting a transfer should publish TRANSFER_REQUESTED event."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")

        sample_transfer.submit()

        mock_publish.assert_called_once_with(
            InventoryEvents.TRANSFER_REQUESTED,
            "StockTransfer",
            sample_transfer.pk,
            mocker.ANY,
        )
        payload = mock_publish.call_args[0][3]
        assert payload["status"] == "REQUESTED"

    def test_transfer_approved_event(self, mocker, submitted_transfer, test_user):
        """Approving a transfer should publish TRANSFER_APPROVED event."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")

        submitted_transfer.approve(test_user)

        mock_publish.assert_called_once_with(
            InventoryEvents.TRANSFER_APPROVED,
            "StockTransfer",
            submitted_transfer.pk,
            mocker.ANY,
        )

    def test_transfer_dispatched_event(self, mocker, approved_transfer, test_user):
        """Dispatching a transfer should publish TRANSFER_DISPATCHED event."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")

        approved_transfer.dispatch(test_user)

        mock_publish.assert_called_once_with(
            InventoryEvents.TRANSFER_DISPATCHED,
            "StockTransfer",
            approved_transfer.pk,
            mocker.ANY,
        )
        payload = mock_publish.call_args[0][3]
        assert payload["status"] == "IN_TRANSIT"

    def test_transfer_received_event(self, mocker, dispatched_transfer, test_user):
        """Receiving a transfer should publish TRANSFER_RECEIVED event."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")

        dispatched_transfer.receive(test_user)

        mock_publish.assert_called_once_with(
            InventoryEvents.TRANSFER_RECEIVED,
            "StockTransfer",
            dispatched_transfer.pk,
            mocker.ANY,
        )

    def test_transfer_cancelled_event(self, mocker, sample_transfer, test_user):
        """Cancelling a transfer should publish TRANSFER_CANCELLED event."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")

        sample_transfer.cancel(test_user, reason="Not needed")

        mock_publish.assert_called_once_with(
            InventoryEvents.TRANSFER_CANCELLED,
            "StockTransfer",
            sample_transfer.pk,
            mocker.ANY,
        )
