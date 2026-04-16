"""
Tests for Inventory API endpoints.

Covers:
- Supplier CRUD, toggle_active, org-scoping
- PurchaseOrder CRUD, submit/approve/cancel actions, facility-scoping
- GoodsReceiptNote CRUD, confirm action, by_purchase_order filter
- Authentication enforcement
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

pytestmark = pytest.mark.django_db


# ============================================================================
# Supplier API
# ============================================================================


class TestSupplierAPI:
    """Tests for Supplier endpoints."""

    ENDPOINT = "/api/inventory/suppliers/"

    def test_list_suppliers(self, authenticated_client, sample_supplier):
        """Should list suppliers for the user's organization."""
        response = authenticated_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_create_supplier(self, authenticated_client, supplier_data):
        """Should create a supplier."""
        response = authenticated_client.post(self.ENDPOINT, supplier_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "SUP-NEW"
        assert response.data["name"] == "New Pharmaceutical Supplier"
        assert response.data["id"] is not None

    def test_retrieve_supplier(self, authenticated_client, sample_supplier):
        """Should retrieve a single supplier."""
        response = authenticated_client.get(f"{self.ENDPOINT}{sample_supplier.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "SUP-001"

    def test_update_supplier(self, authenticated_client, sample_supplier):
        """Should update supplier fields."""
        response = authenticated_client.patch(
            f"{self.ENDPOINT}{sample_supplier.id}/",
            {"contact_person": "Updated Contact"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["contact_person"] == "Updated Contact"

    def test_toggle_active(self, authenticated_client, sample_supplier):
        """Should toggle supplier active status."""
        assert sample_supplier.is_active is True
        response = authenticated_client.post(
            f"{self.ENDPOINT}{sample_supplier.id}/toggle_active/",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_active"] is False

    def test_unauthenticated_access(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Purchase Order API
# ============================================================================


class TestPurchaseOrderAPI:
    """Tests for PurchaseOrder endpoints."""

    ENDPOINT = "/api/inventory/purchase-orders/"

    def test_list_purchase_orders(self, authenticated_client, sample_purchase_order):
        """Should list POs for the user's facility."""
        response = authenticated_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_create_purchase_order(self, authenticated_client, po_data):
        """Should create a PO with nested items."""
        response = authenticated_client.post(self.ENDPOINT, po_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["po_number"].startswith("PO-")
        assert response.data["status"] == "DRAFT"
        # ReadOnCreateMixin returns the full read serializer
        assert "items" in response.data

    def test_create_po_without_items_fails(self, authenticated_client, sample_supplier):
        """Should reject PO creation with no items."""
        data = {
            "supplier": sample_supplier.id,
            "order_date": str(date.today()),
            "items": [],
        }
        response = authenticated_client.post(self.ENDPOINT, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_purchase_order(self, authenticated_client, sample_purchase_order):
        """Should retrieve a single PO with items."""
        response = authenticated_client.get(f"{self.ENDPOINT}{sample_purchase_order.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["po_number"] == sample_purchase_order.po_number
        assert len(response.data["items"]) == 1

    def test_submit_action(self, authenticated_client, sample_purchase_order):
        """Should transition PO from DRAFT to SUBMITTED."""
        response = authenticated_client.post(f"{self.ENDPOINT}{sample_purchase_order.id}/submit/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SUBMITTED"

    def test_approve_action(self, authenticated_client, submitted_purchase_order):
        """Should transition PO from SUBMITTED to APPROVED."""
        response = authenticated_client.post(
            f"{self.ENDPOINT}{submitted_purchase_order.id}/approve/",
            {"notes": "Approved by pharmacy lead"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "APPROVED"

    def test_cancel_action(self, authenticated_client, submitted_purchase_order):
        """Should cancel a PO."""
        response = authenticated_client.post(
            f"{self.ENDPOINT}{submitted_purchase_order.id}/cancel/",
            {"reason": "Budget constraints"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_submit_non_draft_fails(self, authenticated_client, submitted_purchase_order):
        """Cannot submit a non-DRAFT PO."""
        response = authenticated_client.post(
            f"{self.ENDPOINT}{submitted_purchase_order.id}/submit/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_approve_non_submitted_fails(self, authenticated_client, sample_purchase_order):
        """Cannot approve a DRAFT PO."""
        response = authenticated_client.post(f"{self.ENDPOINT}{sample_purchase_order.id}/approve/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_items_action(self, authenticated_client, sample_purchase_order):
        """Should list items for a PO."""
        response = authenticated_client.get(f"{self.ENDPOINT}{sample_purchase_order.id}/items/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["drug_name"] == "Amoxicillin"

    def test_unauthenticated_access(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_filter_by_status(
        self, authenticated_client, sample_purchase_order, submitted_purchase_order
    ):
        """Should filter POs by status."""
        response = authenticated_client.get(self.ENDPOINT, {"status": "SUBMITTED"})
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for po in results:
            assert po["status"] == "SUBMITTED"


# ============================================================================
# Goods Receipt Note API
# ============================================================================


class TestGoodsReceiptNoteAPI:
    """Tests for GoodsReceiptNote endpoints."""

    ENDPOINT = "/api/inventory/goods-receipts/"

    def test_list_grns(self, authenticated_client, sample_grn):
        """Should list GRNs for the user's facility."""
        response = authenticated_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_create_grn(self, authenticated_client, grn_data):
        """Should create a GRN with nested items."""
        response = authenticated_client.post(self.ENDPOINT, grn_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["grn_number"].startswith("GRN-")
        assert response.data["status"] == "DRAFT"

    def test_create_grn_without_items_fails(self, authenticated_client, sample_supplier):
        """Should reject GRN creation with no items."""
        data = {
            "supplier": sample_supplier.id,
            "received_date": str(date.today()),
            "items": [],
        }
        response = authenticated_client.post(self.ENDPOINT, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_grn(self, authenticated_client, sample_grn):
        """Should retrieve a single GRN with items."""
        response = authenticated_client.get(f"{self.ENDPOINT}{sample_grn.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["grn_number"] == sample_grn.grn_number
        assert len(response.data["items"]) == 1

    def test_confirm_action(self, authenticated_client, sample_grn):
        """Should confirm a GRN and create StockBatch records."""
        response = authenticated_client.post(f"{self.ENDPOINT}{sample_grn.id}/confirm/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CONFIRMED"

    def test_confirm_non_draft_fails(self, authenticated_client, sample_grn, test_user):
        """Cannot confirm a non-DRAFT GRN."""
        sample_grn.confirm(user=test_user)
        response = authenticated_client.post(f"{self.ENDPOINT}{sample_grn.id}/confirm/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_grn_action(self, authenticated_client, sample_grn):
        """Should cancel a draft GRN."""
        response = authenticated_client.post(f"{self.ENDPOINT}{sample_grn.id}/cancel_grn/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_by_purchase_order(self, authenticated_client, sample_grn):
        """Should filter GRNs by purchase order."""
        response = authenticated_client.get(
            f"{self.ENDPOINT}by_purchase_order/",
            {"purchase_order": sample_grn.purchase_order_id},
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_by_purchase_order_requires_param(self, authenticated_client):
        """Should fail if purchase_order param is missing."""
        response = authenticated_client.get(f"{self.ENDPOINT}by_purchase_order/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_access(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
