"""Tests for PaymentPoint endpoints and required linkage to payments.

These payment points represent cashier/till/bank accounts to support multiple
payment counters and auditability (cash drawer / M-Pesa till / bank account).
"""

from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.billing.models import Payment

pytestmark = pytest.mark.django_db


class TestPaymentPointAPI:
    def test_create_payment_point_mpesa_till(self, authenticated_client):
        data = {
            "name": "Cashier 1 M-Pesa Till",
            "code": "MPESA-01",
            "method": Payment.Method.MPESA,
            "till_number": "123456",
        }

        response = authenticated_client.post("/api/billing/payment-points/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "MPESA-01"
        assert response.data["method"] == Payment.Method.MPESA
        assert response.data["till_number"] == "123456"

    def test_list_payment_points(self, authenticated_client, sample_payment_point):
        response = authenticated_client.get("/api/billing/payment-points/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data or isinstance(response.data, list)


class TestPaymentRequiresPaymentPointForMpesaAndBank:
    def test_mpesa_payment_without_payment_point_rejected(
        self, authenticated_client, sample_invoice, sample_invoice_item
    ):
        sample_invoice.calculate_totals()
        sample_invoice.save()

        data = {
            "invoice": sample_invoice.id,
            "method": Payment.Method.MPESA,
            "amount": "100.00",
        }

        response = authenticated_client.post("/api/billing/payments/", data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "payment_point" in response.data

    def test_bank_transfer_payment_without_payment_point_rejected(
        self, authenticated_client, sample_invoice, sample_invoice_item
    ):
        sample_invoice.calculate_totals()
        sample_invoice.save()

        data = {
            "invoice": sample_invoice.id,
            "method": Payment.Method.BANK_TRANSFER,
            "amount": "100.00",
        }

        response = authenticated_client.post("/api/billing/payments/", data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "payment_point" in response.data

    def test_cash_payment_payment_point_optional(
        self, authenticated_client, sample_invoice, sample_invoice_item
    ):
        sample_invoice.calculate_totals()
        sample_invoice.save()

        data = {
            "invoice": sample_invoice.id,
            "method": Payment.Method.CASH,
            "amount": str(Decimal("100.00")),
        }

        response = authenticated_client.post("/api/billing/payments/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["method"] == Payment.Method.CASH
