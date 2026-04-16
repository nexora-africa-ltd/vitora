"""
Tests for Ward Stock API endpoints (Phase 3).
"""

import pytest  # type: ignore
from rest_framework import status

pytestmark = pytest.mark.django_db


class TestWardStockAPI:
    """Tests for ward stock CRUD endpoints."""

    def test_list_ward_stock(self, authenticated_client, ward_stock):
        """Should list ward stock records."""
        response = authenticated_client.get("/api/inventory/ward-stock/")
        assert response.status_code == status.HTTP_200_OK
        # May be paginated
        data = response.data.get("results", response.data)
        assert len(data) >= 1

    def test_create_ward_stock(
        self, authenticated_client, ward_store, sample_drug, sample_facility
    ):
        """Should create a ward stock record."""
        payload = {
            "store_location": ward_store.id,
            "drug": sample_drug.id,
            "quantity_available": 25,
            "par_level": 10,
            "max_level": 80,
        }
        response = authenticated_client.post("/api/inventory/ward-stock/", payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["quantity_available"] == 25

    def test_retrieve_ward_stock(self, authenticated_client, ward_stock):
        """Should retrieve a specific ward stock record."""
        response = authenticated_client.get(f"/api/inventory/ward-stock/{ward_stock.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == ward_stock.id

    def test_consume_action(self, authenticated_client, ward_stock):
        """Should consume stock and decrease quantity."""
        response = authenticated_client.post(
            f"/api/inventory/ward-stock/{ward_stock.id}/consume/",
            {"quantity": 10, "notes": "Patient use"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["quantity_available"] == 40  # 50 - 10

    def test_consume_insufficient_stock(self, authenticated_client, ward_stock):
        """Should reject consume when quantity exceeds available."""
        response = authenticated_client.post(
            f"/api/inventory/ward-stock/{ward_stock.id}/consume/",
            {"quantity": 999},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Insufficient" in response.data["error"]

    def test_replenish_action(self, authenticated_client, ward_stock):
        """Should replenish stock and increase quantity."""
        response = authenticated_client.post(
            f"/api/inventory/ward-stock/{ward_stock.id}/replenish/",
            {"quantity": 20, "notes": "Restock from main"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["quantity_available"] == 70  # 50 + 20

    def test_return_to_store_action(self, authenticated_client, ward_stock):
        """Should return stock from ward and decrease quantity."""
        response = authenticated_client.post(
            f"/api/inventory/ward-stock/{ward_stock.id}/return_to_store/",
            {"quantity": 5, "notes": "Return unused"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["quantity_available"] == 45  # 50 - 5

    def test_return_to_store_insufficient(self, authenticated_client, ward_stock):
        """Should reject return when quantity exceeds available."""
        response = authenticated_client.post(
            f"/api/inventory/ward-stock/{ward_stock.id}/return_to_store/",
            {"quantity": 999},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_access_denied(self, api_client, ward_stock):
        """Should deny unauthenticated access."""
        response = api_client.get("/api/inventory/ward-stock/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestWardStockTransactionAPI:
    """Tests for ward stock transaction endpoints (read-only)."""

    def test_list_transactions(self, authenticated_client, ward_stock, test_user):
        """Should list ward stock transactions."""
        from hmis.apps.inventory.models import WardStockTransaction, WardTransactionType

        WardStockTransaction.objects.create(
            ward_stock=ward_stock,
            transaction_type=WardTransactionType.CONSUME,
            quantity=-5,
            performed_by=test_user,
            notes="Test consume",
        )
        response = authenticated_client.get("/api/inventory/ward-transactions/")
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get("results", response.data)
        assert len(data) >= 1

    def test_transactions_read_only(self, authenticated_client):
        """POST should not be allowed on read-only viewset."""
        response = authenticated_client.post("/api/inventory/ward-transactions/", {})
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
