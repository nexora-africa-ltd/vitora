"""Tests for inpatient consumable stock usage and reversal."""

from decimal import Decimal

import pytest  # type: ignore
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestInpatientConsumableUsageModel:
    """Model tests for inpatient consumable stock usage."""

    def test_create_usage_reduces_stock(self, sample_admission, sample_stock_batch, test_user):
        """Creating consumable usage should debit the linked pharmacy batch."""
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=5,
            used_by=test_user,
            notes="Used for ward dressing pack",
        )

        sample_stock_batch.refresh_from_db()

        assert usage.pk is not None
        assert usage.drug == sample_stock_batch.drug
        assert sample_stock_batch.quantity_available == 995
        assert sample_stock_batch.quantity_dispensed == 5

    def test_reverse_usage_restores_stock(self, sample_admission, sample_stock_batch, test_user):
        """Reversing consumable usage should restore stock to the original batch."""
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=8,
            used_by=test_user,
            notes="Used for IV setup",
        )

        usage.reverse(user=test_user, reason="Recorded against wrong patient")

        sample_stock_batch.refresh_from_db()
        usage.refresh_from_db()

        assert sample_stock_batch.quantity_available == 1000
        assert sample_stock_batch.quantity_dispensed == 0
        assert usage.is_reversed is True
        assert usage.reversed_by == test_user
        assert usage.reverse_reason == "Recorded against wrong patient"


@pytest.mark.django_db
class TestInpatientConsumableUsageAPI:
    """API tests for inpatient consumable stock usage."""

    def test_record_consumable_usage_action(
        self, authenticated_client, sample_admission, sample_stock_batch
    ):
        """Admission action should create consumable usage and debit stock."""
        response = authenticated_client.post(
            reverse(
                "inpatient:admission-record-consumable-usage", kwargs={"pk": sample_admission.id}
            ),
            {
                "batch": sample_stock_batch.id,
                "quantity_used": 4,
                "notes": "Used for inpatient dressing change",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["admission"] == sample_admission.id
        assert response.data["batch"] == sample_stock_batch.id
        assert response.data["quantity_used"] == 4
        assert response.data["drug"] == sample_stock_batch.drug.id
        assert response.data["is_reversed"] is False

        sample_stock_batch.refresh_from_db()
        assert sample_stock_batch.quantity_available == 996

    def test_stock_movement_report_includes_inpatient_consumable_usage(
        self, authenticated_client, sample_admission, sample_stock_batch, test_user
    ):
        """Pharmacy movement report should include inpatient consumable usage entries."""
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=3,
            used_by=test_user,
            notes="Ward procedure pack",
        )

        response = authenticated_client.get(reverse("pharmacy:stock-movement-report"))

        assert response.status_code == status.HTTP_200_OK
        assert any(
            movement["movement_type"] == "INPATIENT_CONSUMED"
            and movement["quantity"] == -3
            and f"Admission {sample_admission.admission_number}" in movement["reference"]
            and movement["reference"].endswith(f"Usage #{usage.pk}")
            for movement in response.data["results"]
        )

    def test_reverse_consumable_usage_action_restores_stock(
        self, authenticated_client, sample_admission, sample_stock_batch, test_user
    ):
        """Admission action should reverse usage and restore stock to the batch."""
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        usage = InpatientConsumableUsage.objects.create(
            admission=sample_admission,
            batch=sample_stock_batch,
            quantity_used=6,
            used_by=test_user,
            notes="Used for IV line setup",
        )

        response = authenticated_client.post(
            reverse(
                "inpatient:admission-reverse-consumable-usage",
                kwargs={"pk": sample_admission.id, "usage_id": usage.pk},
            ),
            {"reason": "Duplicate entry"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == usage.pk
        assert response.data["is_reversed"] is True
        assert response.data["reverse_reason"] == "Duplicate entry"

        sample_stock_batch.refresh_from_db()
        assert sample_stock_batch.quantity_available == 1000
        assert sample_stock_batch.quantity_dispensed == 0
