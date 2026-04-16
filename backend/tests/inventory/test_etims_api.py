"""
Tests for eTIMS API endpoints.

Covers:
- ETIMSConfigViewSet: CRUD + test_connection action
- ETIMSInvoiceViewSet: CRUD + submit, retry, cancel actions
"""

from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

# ===========================================================================
# ETIMSConfig API Tests
# ===========================================================================


@pytest.mark.django_db
class TestETIMSConfigAPI:
    """Tests for /api/inventory/etims-config/ endpoints."""

    URL = "/api/inventory/etims-config/"

    def test_create_config(self, authenticated_client, sample_facility):
        data = {
            "bhf_id": "00",
            "dvc_srl_no": "TESTDEV001",
            "tin": "P000333444B",
            "api_base_url": "https://etims-api-sbx.kra.go.ke/etims-api",
            "api_key": "test-secret-key-123",
            "is_active": True,
            "environment": "SANDBOX",
        }
        response = authenticated_client.post(self.URL, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["tin"] == "P000333444B"
        assert response.data["bhf_id"] == "00"
        assert response.data["is_active"] is True
        # api_key should not be in the read response
        assert "api_key" not in response.data
        assert "api_key_encrypted" not in response.data

    def test_list_configs(self, authenticated_client, etims_config):
        response = authenticated_client.get(self.URL)

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_retrieve_config(self, authenticated_client, etims_config):
        response = authenticated_client.get(f"{self.URL}{etims_config.pk}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["tin"] == etims_config.tin

    def test_update_config(self, authenticated_client, etims_config):
        response = authenticated_client.patch(
            f"{self.URL}{etims_config.pk}/",
            {"is_active": False},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        etims_config.refresh_from_db()
        assert etims_config.is_active is False

    def test_delete_config(self, authenticated_client, etims_config):
        response = authenticated_client.delete(f"{self.URL}{etims_config.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_test_connection_action(self, authenticated_client, etims_config):
        """test_connection should succeed with mock client (sandbox env)."""
        response = authenticated_client.post(f"{self.URL}{etims_config.pk}/test_connection/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["message"] == "Mock connection OK"

    def test_unauthenticated_rejected(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_unique_config_per_facility(self, authenticated_client, etims_config):
        """Creating a second config for the same facility should fail."""
        data = {
            "bhf_id": "01",
            "dvc_srl_no": "TESTDEV002",
            "tin": "P000555666C",
            "api_base_url": "https://etims-api-sbx.kra.go.ke/etims-api",
            "environment": "SANDBOX",
        }
        response = authenticated_client.post(self.URL, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ===========================================================================
# ETIMSInvoice API Tests
# ===========================================================================


@pytest.mark.django_db
class TestETIMSInvoiceAPI:
    """Tests for /api/inventory/etims-invoices/ endpoints."""

    URL = "/api/inventory/etims-invoices/"

    def test_create_etims_invoice(self, authenticated_client, billing_invoice):
        data = {"invoice": billing_invoice.pk}
        response = authenticated_client.post(self.URL, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "PENDING"
        assert response.data["invoice"] == billing_invoice.pk
        assert response.data["invoice_number"] == billing_invoice.invoice_number

    def test_list_etims_invoices(self, authenticated_client, etims_invoice):
        response = authenticated_client.get(self.URL)

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_retrieve_etims_invoice(self, authenticated_client, etims_invoice):
        response = authenticated_client.get(f"{self.URL}{etims_invoice.pk}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == etims_invoice.pk
        assert response.data["status"] == "PENDING"
        assert "patient_name" in response.data
        assert "invoice_total" in response.data

    def test_filter_by_status(self, authenticated_client, etims_invoice):
        response = authenticated_client.get(f"{self.URL}?status=PENDING")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert all(r["status"] == "PENDING" for r in results)

    # ----- Submit Action -----

    def test_submit_action_queues_task(self, authenticated_client, etims_invoice, mocker):
        mock_delay = mocker.patch("hmis.apps.inventory.tasks.submit_etims_invoice_task.delay")
        response = authenticated_client.post(f"{self.URL}{etims_invoice.pk}/submit/")

        assert response.status_code == status.HTTP_202_ACCEPTED
        assert response.data["message"] == "Submission queued."
        mock_delay.assert_called_once_with(etims_invoice.pk)

    def test_submit_action_rejects_confirmed(self, authenticated_client, etims_invoice):
        etims_invoice.mark_submitted()
        etims_invoice.mark_confirmed("RCP-001")

        response = authenticated_client.post(f"{self.URL}{etims_invoice.pk}/submit/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_submit_action_allows_failed(self, authenticated_client, etims_invoice_failed, mocker):
        mocker.patch("hmis.apps.inventory.tasks.submit_etims_invoice_task.delay")
        response = authenticated_client.post(f"{self.URL}{etims_invoice_failed.pk}/submit/")
        assert response.status_code == status.HTTP_202_ACCEPTED

    # ----- Retry Action -----

    def test_retry_action_queues_task(self, authenticated_client, etims_invoice_failed, mocker):
        mock_delay = mocker.patch("hmis.apps.inventory.tasks.submit_etims_invoice_task.delay")
        response = authenticated_client.post(f"{self.URL}{etims_invoice_failed.pk}/retry/")

        assert response.status_code == status.HTTP_202_ACCEPTED
        mock_delay.assert_called_once_with(etims_invoice_failed.pk)

    def test_retry_rejects_pending(self, authenticated_client, etims_invoice):
        response = authenticated_client.post(f"{self.URL}{etims_invoice.pk}/retry/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # ----- Cancel Action -----

    def test_cancel_pending_invoice(self, authenticated_client, etims_invoice):
        response = authenticated_client.post(f"{self.URL}{etims_invoice.pk}/cancel/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_cancel_failed_invoice(self, authenticated_client, etims_invoice_failed):
        response = authenticated_client.post(f"{self.URL}{etims_invoice_failed.pk}/cancel/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_cancel_rejects_confirmed(self, authenticated_client, etims_invoice):
        etims_invoice.mark_submitted()
        etims_invoice.mark_confirmed("RCP-002")

        response = authenticated_client.post(f"{self.URL}{etims_invoice.pk}/cancel/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_rejected(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
