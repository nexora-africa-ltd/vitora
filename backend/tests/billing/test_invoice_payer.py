"""Tests for InvoicePayer — multi-payer invoice allocation."""

from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from rest_framework import status

from hmis.apps.billing.models import InvoicePayer


# ===================================================================
# Model Tests
# ===================================================================
class TestInvoicePayerModel:
    def test_create_cash_payer(self, sample_invoice):
        payer = InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.CASH,
            allocated_amount=Decimal("5000.00"),
            priority=1,
        )
        assert payer.pk is not None
        assert payer.payer_type == "cash"
        assert payer.status == InvoicePayer.Status.PENDING

    def test_create_insurance_payer(self, sample_invoice):
        payer = InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.PRIVATE_INSURANCE,
            provider_name="Jubilee Health Insurance",
            member_number="JUB-001234",
            allocated_amount=Decimal("8000.00"),
            allocation_percent=Decimal("80.00"),
            priority=1,
        )
        assert payer.provider_name == "Jubilee Health Insurance"
        assert payer.allocation_percent == Decimal("80.00")

    def test_str(self, sample_invoice):
        payer = InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.SHA,
            provider_name="SHA",
            allocated_amount=Decimal("5000.00"),
        )
        assert "SHA" in str(payer)

    def test_balance_property(self, sample_invoice):
        payer = InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.PRIVATE_INSURANCE,
            allocated_amount=Decimal("10000.00"),
            paid_amount=Decimal("3000.00"),
        )
        assert payer.balance == Decimal("7000.00")

    def test_balance_zero_when_fully_paid(self, sample_invoice):
        payer = InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.CASH,
            allocated_amount=Decimal("5000.00"),
            paid_amount=Decimal("5000.00"),
        )
        assert payer.balance == Decimal("0.00")

    def test_allocation_percent_validation(self, sample_invoice):
        payer = InvoicePayer(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.CASH,
            allocation_percent=Decimal("110.00"),
        )
        with pytest.raises(ValidationError):
            payer.clean()

    def test_ordering_by_priority(self, sample_invoice):
        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.CASH,
            allocated_amount=Decimal("2000.00"),
            priority=2,
        )
        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.PRIVATE_INSURANCE,
            allocated_amount=Decimal("8000.00"),
            priority=1,
        )
        payers = list(sample_invoice.payers.all())
        assert payers[0].priority == 1
        assert payers[1].priority == 2

    def test_multi_payer_split(self, sample_invoice):
        """Test creating a multi-payer split: insurance primary, cash secondary."""
        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.PRIVATE_INSURANCE,
            provider_name="Jubilee",
            allocation_percent=Decimal("80.00"),
            allocated_amount=Decimal("8000.00"),
            priority=1,
        )
        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.CASH,
            allocation_percent=Decimal("20.00"),
            allocated_amount=Decimal("2000.00"),
            priority=2,
        )
        assert sample_invoice.payers.count() == 2
        total_allocated = sum(p.allocated_amount for p in sample_invoice.payers.all())
        assert total_allocated == Decimal("10000.00")


# ===================================================================
# API Tests — Nested under Invoice
# ===================================================================
class TestInvoicePayerAPI:
    def test_list_payers(self, authenticated_client, sample_invoice):
        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.CASH,
            allocated_amount=Decimal("5000.00"),
        )
        response = authenticated_client.get(f"/api/billing/invoices/{sample_invoice.pk}/payers/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_add_payer(self, authenticated_client, sample_invoice):
        data = {
            "payer_type": "private_insurance",
            "provider_name": "Jubilee",
            "member_number": "JUB-5678",
            "allocated_amount": "8000.00",
            "allocation_percent": "80.00",
            "priority": 1,
        }
        response = authenticated_client.post(
            f"/api/billing/invoices/{sample_invoice.pk}/payers/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["provider_name"] == "Jubilee"
        assert response.data["payer_type"] == "private_insurance"

    def test_update_payer(self, authenticated_client, sample_invoice):
        payer = InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.PRIVATE_INSURANCE,
            provider_name="Jubilee",
            allocated_amount=Decimal("8000.00"),
        )
        response = authenticated_client.patch(
            f"/api/billing/invoices/{sample_invoice.pk}/payers/{payer.pk}/",
            {"approved_amount": "7500.00", "status": "approved"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["approved_amount"] == "7500.00"
        assert response.data["status"] == "approved"

    def test_delete_payer(self, authenticated_client, sample_invoice):
        payer = InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.CASH,
            allocated_amount=Decimal("5000.00"),
        )
        response = authenticated_client.delete(
            f"/api/billing/invoices/{sample_invoice.pk}/payers/{payer.pk}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert sample_invoice.payers.count() == 0

    def test_payers_in_invoice_detail(self, authenticated_client, sample_invoice):
        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.SHA,
            provider_name="SHA",
            allocated_amount=Decimal("5000.00"),
        )
        response = authenticated_client.get(f"/api/billing/invoices/{sample_invoice.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert "payers" in response.data
        assert len(response.data["payers"]) == 1

    def test_unauthenticated_fails(self, api_client, sample_invoice):
        response = api_client.get(f"/api/billing/invoices/{sample_invoice.pk}/payers/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
