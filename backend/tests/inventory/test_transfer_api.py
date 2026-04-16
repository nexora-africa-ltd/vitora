"""
Tests for Phase 2: Multi-Store Stock Transfer API endpoints.

Covers:
- StoreLocation CRUD
- StockTransfer CRUD + state-transition actions (submit, approve, dispatch, receive, cancel)
- Authentication enforcement
- Filtering
"""

from datetime import date

import pytest  # type: ignore
from rest_framework import status

pytestmark = pytest.mark.django_db


# ===========================================================================
# Store Location API
# ===========================================================================


class TestStoreLocationAPI:
    """Tests for /api/inventory/store-locations/ endpoint."""

    BASE_URL = "/api/inventory/store-locations/"

    def test_list_store_locations(self, authenticated_client, main_store, ward_store):
        """Should list store locations for the facility."""
        response = authenticated_client.get(self.BASE_URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 2

    def test_create_store_location(self, authenticated_client, store_location_data):
        """Should create a store location."""
        response = authenticated_client.post(self.BASE_URL, store_location_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == store_location_data["code"]
        assert response.data["location_type"] == "SATELLITE_PHARMACY"

    def test_retrieve_store_location(self, authenticated_client, main_store):
        """Should retrieve store location detail."""
        response = authenticated_client.get(f"{self.BASE_URL}{main_store.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "STORE-MAIN"

    def test_update_store_location(self, authenticated_client, main_store):
        """Should update a store location."""
        response = authenticated_client.patch(
            f"{self.BASE_URL}{main_store.id}/",
            {"name": "Updated Main Store"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Main Store"

    def test_filter_by_location_type(self, authenticated_client, main_store, ward_store):
        """Should filter by location_type."""
        response = authenticated_client.get(f"{self.BASE_URL}?location_type=WARD_STORE")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for item in results:
            assert item["location_type"] == "WARD_STORE"

    def test_filter_by_active_status(self, authenticated_client, main_store):
        """Should filter by is_active."""
        response = authenticated_client.get(f"{self.BASE_URL}?is_active=true")
        assert response.status_code == status.HTTP_200_OK

    def test_unauthenticated_access_denied(self, api_client, store_location_data):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.BASE_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ===========================================================================
# Stock Transfer API
# ===========================================================================


class TestStockTransferCRUD:
    """Tests for /api/inventory/transfers/ CRUD operations."""

    BASE_URL = "/api/inventory/transfers/"

    def test_list_transfers(self, authenticated_client, sample_transfer):
        """Should list stock transfers."""
        response = authenticated_client.get(self.BASE_URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_create_transfer(self, authenticated_client, transfer_data):
        """Should create a stock transfer with nested items."""
        response = authenticated_client.post(self.BASE_URL, transfer_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["transfer_number"].startswith("TRF-")
        assert response.data["status"] == "DRAFT"

    def test_create_transfer_without_items_fails(
        self, authenticated_client, sample_facility, second_facility, main_store
    ):
        """Should reject creation with empty items list."""
        data = {
            "source_facility": sample_facility.id,
            "destination_facility": second_facility.id,
            "request_date": str(date.today()),
            "items": [],
        }
        response = authenticated_client.post(self.BASE_URL, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_same_store_fails(
        self, authenticated_client, sample_facility, main_store, sample_drug, source_stock_batch
    ):
        """Should reject transfer to the same store at the same facility."""
        data = {
            "source_facility": sample_facility.id,
            "destination_facility": sample_facility.id,
            "source_store": main_store.id,
            "destination_store": main_store.id,
            "request_date": str(date.today()),
            "items": [
                {
                    "drug": sample_drug.id,
                    "source_batch": source_stock_batch.id,
                    "quantity_requested": 50,
                },
            ],
        }
        response = authenticated_client.post(self.BASE_URL, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_transfer_detail(self, authenticated_client, sample_transfer):
        """Should retrieve transfer detail with nested items."""
        response = authenticated_client.get(f"{self.BASE_URL}{sample_transfer.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["transfer_number"] == sample_transfer.transfer_number
        assert "items" in response.data
        assert len(response.data["items"]) == 1

    def test_filter_by_status(self, authenticated_client, sample_transfer):
        """Should filter by status."""
        response = authenticated_client.get(f"{self.BASE_URL}?status=DRAFT")
        assert response.status_code == status.HTTP_200_OK

    def test_unauthenticated_access_denied(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.BASE_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestStockTransferActions:
    """Tests for stock transfer state-transition actions."""

    BASE_URL = "/api/inventory/transfers/"

    def test_submit_action(self, authenticated_client, sample_transfer):
        """POST /transfers/{id}/submit/ should change DRAFT → REQUESTED."""
        url = f"{self.BASE_URL}{sample_transfer.id}/submit/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REQUESTED"

    def test_submit_empty_transfer_fails(
        self,
        authenticated_client,
        sample_facility,
        second_facility,
        sample_organization,
        test_user,
    ):
        """Submit with no items should fail."""
        from hmis.apps.inventory.models import StockTransfer

        transfer = StockTransfer.objects.create(
            source_facility=sample_facility,
            destination_facility=second_facility,
            requested_by=test_user,
            organization=sample_organization,
        )
        url = f"{self.BASE_URL}{transfer.id}/submit/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_approve_action(self, authenticated_client, submitted_transfer):
        """POST /transfers/{id}/approve/ should change REQUESTED → APPROVED."""
        url = f"{self.BASE_URL}{submitted_transfer.id}/approve/"
        response = authenticated_client.post(url, {})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "APPROVED"
        assert response.data["approved_by"] is not None

    def test_approve_with_notes(self, authenticated_client, submitted_transfer):
        """Approve action should append notes."""
        url = f"{self.BASE_URL}{submitted_transfer.id}/approve/"
        response = authenticated_client.post(url, {"notes": "Approved for urgent need"})
        assert response.status_code == status.HTTP_200_OK
        assert "Approved for urgent need" in response.data["notes"]

    def test_dispatch_action(self, authenticated_client, approved_transfer):
        """POST /transfers/{id}/dispatch_transfer/ should change APPROVED → IN_TRANSIT."""
        url = f"{self.BASE_URL}{approved_transfer.id}/dispatch_transfer/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_TRANSIT"
        assert response.data["dispatched_by"] is not None

    def test_receive_action(self, authenticated_client, dispatched_transfer):
        """POST /transfers/{id}/receive/ should change IN_TRANSIT → RECEIVED."""
        url = f"{self.BASE_URL}{dispatched_transfer.id}/receive/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RECEIVED"
        assert response.data["received_by"] is not None

        # Items should have destination_batch set
        for item in response.data["items"]:
            assert item["destination_batch_id"] is not None
            assert item["quantity_received"] > 0

    def test_cancel_action(self, authenticated_client, sample_transfer):
        """POST /transfers/{id}/cancel/ should cancel the transfer."""
        url = f"{self.BASE_URL}{sample_transfer.id}/cancel/"
        response = authenticated_client.post(url, {"reason": "Duplicate request"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"
        assert response.data["cancellation_reason"] == "Duplicate request"

    def test_cancel_in_transit_fails(self, authenticated_client, dispatched_transfer):
        """Cannot cancel an in-transit transfer via API."""
        url = f"{self.BASE_URL}{dispatched_transfer.id}/cancel/"
        response = authenticated_client.post(url, {"reason": "Changed mind"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_items_action(self, authenticated_client, sample_transfer):
        """GET /transfers/{id}/items/ should list transfer items."""
        url = f"{self.BASE_URL}{sample_transfer.id}/items/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert "drug_name" in response.data[0]

    def test_full_lifecycle_via_api(self, authenticated_client, sample_transfer):
        """Test the complete DRAFT → REQUESTED → APPROVED → IN_TRANSIT → RECEIVED flow."""
        base = self.BASE_URL
        tid = sample_transfer.id

        # Submit
        resp = authenticated_client.post(f"{base}{tid}/submit/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["status"] == "REQUESTED"

        # Approve
        resp = authenticated_client.post(f"{base}{tid}/approve/", {})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["status"] == "APPROVED"

        # Dispatch
        resp = authenticated_client.post(f"{base}{tid}/dispatch_transfer/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["status"] == "IN_TRANSIT"

        # Receive
        resp = authenticated_client.post(f"{base}{tid}/receive/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["status"] == "RECEIVED"
