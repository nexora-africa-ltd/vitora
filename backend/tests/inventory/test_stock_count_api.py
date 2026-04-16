"""
Tests for Stock Count API endpoints (Phase 4).
"""

import pytest  # type: ignore
from rest_framework import status

pytestmark = pytest.mark.django_db


class TestStockCountAPI:
    """Tests for stock count CRUD and lifecycle endpoints."""

    def test_list_stock_counts(self, authenticated_client, stock_count):
        """Should list stock counts."""
        response = authenticated_client.get("/api/inventory/stock-counts/")
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get("results", response.data)
        assert len(data) >= 1

    def test_create_stock_count(self, authenticated_client, main_store):
        """Should create a stock count."""
        payload = {
            "count_type": "CYCLE",
            "store_location": main_store.id,
            "notes": "Monthly cycle count",
        }
        response = authenticated_client.post("/api/inventory/stock-counts/", payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "DRAFT"
        assert response.data["count_number"].startswith("SC-")

    def test_retrieve_stock_count(self, authenticated_client, stock_count):
        """Should retrieve a specific stock count."""
        response = authenticated_client.get(f"/api/inventory/stock-counts/{stock_count.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == stock_count.id

    def test_generate_items_action(self, authenticated_client, stock_count, source_stock_batch):
        """Should generate count items from existing stock batches."""
        response = authenticated_client.post(
            f"/api/inventory/stock-counts/{stock_count.id}/generate_items/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] >= 1

    def test_start_action(self, authenticated_client, stock_count_with_items):
        """Should transition DRAFT → IN_PROGRESS."""
        response = authenticated_client.post(
            f"/api/inventory/stock-counts/{stock_count_with_items.id}/start/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_complete_action(self, authenticated_client, stock_count_with_counted_items):
        """Should transition IN_PROGRESS → COMPLETED."""
        stock_count_with_counted_items.start()
        response = authenticated_client.post(
            f"/api/inventory/stock-counts/{stock_count_with_counted_items.id}/complete/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"

    def test_approve_action(self, authenticated_client, stock_count_with_counted_items):
        """Should transition COMPLETED → APPROVED."""
        stock_count_with_counted_items.start()
        stock_count_with_counted_items.complete()
        response = authenticated_client.post(
            f"/api/inventory/stock-counts/{stock_count_with_counted_items.id}/approve/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "APPROVED"

    def test_cancel_action(self, authenticated_client, stock_count):
        """Should transition to CANCELLED."""
        response = authenticated_client.post(
            f"/api/inventory/stock-counts/{stock_count.id}/cancel/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_start_from_non_draft_fails(self, authenticated_client, stock_count_with_items):
        """Should reject start() when not in DRAFT status."""
        stock_count_with_items.start()
        response = authenticated_client.post(
            f"/api/inventory/stock-counts/{stock_count_with_items.id}/start/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_complete_from_draft_fails(self, authenticated_client, stock_count):
        """Should reject complete() when in DRAFT status."""
        response = authenticated_client.post(
            f"/api/inventory/stock-counts/{stock_count.id}/complete/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_item_detail_get(self, authenticated_client, stock_count_with_items):
        """Should retrieve a specific count item."""
        item = stock_count_with_items.items.first()
        response = authenticated_client.get(
            f"/api/inventory/stock-counts/{stock_count_with_items.id}/items/{item.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == item.id

    def test_item_detail_patch_count_matching(self, authenticated_client, stock_count_with_items):
        """Should update counted_quantity when it matches system_quantity (no reason needed)."""
        item = stock_count_with_items.items.first()
        response = authenticated_client.patch(
            f"/api/inventory/stock-counts/{stock_count_with_items.id}/items/{item.id}/",
            {"counted_quantity": item.system_quantity},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["counted_quantity"] == item.system_quantity

    def test_item_detail_patch_requires_reason_for_variance(
        self, authenticated_client, stock_count_with_items
    ):
        """Should require variance_reason when counted != system."""
        item = stock_count_with_items.items.first()
        # counted_quantity differs from system_quantity but no reason provided
        response = authenticated_client.patch(
            f"/api/inventory/stock-counts/{stock_count_with_items.id}/items/{item.id}/",
            {"counted_quantity": item.system_quantity - 50},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_item_detail_patch_with_reason(self, authenticated_client, stock_count_with_items):
        """Should accept update when variance_reason is provided."""
        item = stock_count_with_items.items.first()
        response = authenticated_client.patch(
            f"/api/inventory/stock-counts/{stock_count_with_items.id}/items/{item.id}/",
            {
                "counted_quantity": item.system_quantity - 50,
                "variance_reason": "Damaged stock found",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["variance_reason"] == "Damaged stock found"

    def test_unauthenticated_access_denied(self, api_client, stock_count):
        """Should deny unauthenticated access."""
        response = api_client.get("/api/inventory/stock-counts/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
