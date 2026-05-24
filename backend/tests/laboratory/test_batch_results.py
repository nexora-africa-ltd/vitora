"""Tests for batch lab results endpoint."""

import pytest
from rest_framework import status

from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog


@pytest.fixture
def test_catalog_cbc(db):
    """Create a set of CBC panel test catalog items."""
    tests = []
    for code, name, unit, ref in [
        ("WBC", "White Blood Cells", "×10⁹/L", "4.0-11.0"),
        ("RBC", "Red Blood Cells", "×10¹²/L", "4.5-5.5"),
        ("HGB", "Hemoglobin", "g/dL", "12.0-16.0"),
        ("HCT", "Hematocrit", "%", "36.0-46.0"),
        ("PLT", "Platelets", "×10⁹/L", "150-400"),
    ]:
        tests.append(
            TestCatalog.objects.create(
                code=code,
                name=name,
                short_name=code,
                category="HEMATOLOGY",
                specimen_type="BLOOD",
                result_type="NUMERIC",
                result_unit=unit,
                normal_range_male=ref,
                normal_range_female=ref,
            )
        )
    return tests


@pytest.fixture
def lab_order_with_items(
    db, sample_patient, sample_facility, sample_encounter, test_user, test_catalog_cbc
):
    """Create a lab order with multiple items (simulating a CBC panel)."""
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        status="SPECIMEN_COLLECTED",
        priority="ROUTINE",
        order_type="IN_HOUSE",
        facility=sample_facility,
        organization=sample_facility.organization,
    )
    items = []
    for test in test_catalog_cbc:
        items.append(
            LabOrderItem.objects.create(
                lab_order=order,
                test=test,
                status="PENDING",
            )
        )
    return order, items


class TestBatchResults:
    """Tests for POST /api/lab/orders/{order_number}/results/batch/."""

    def test_batch_create_all_results(self, authenticated_client, lab_order_with_items):
        """Should create all results in one request."""
        order, items = lab_order_with_items
        results_data = [
            {"order_item": items[0].id, "numeric_value": 7.5},
            {"order_item": items[1].id, "numeric_value": 4.8},
            {"order_item": items[2].id, "numeric_value": 14.2},
            {"order_item": items[3].id, "numeric_value": 42.0},
            {"order_item": items[4].id, "numeric_value": 250},
        ]

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": results_data},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) == 5
        assert LabResult.objects.filter(order_item__lab_order=order).count() == 5

    def test_batch_cascades_order_status(self, authenticated_client, lab_order_with_items):
        """Should cascade order status to IN_PROGRESS after batch."""
        order, items = lab_order_with_items
        results_data = [
            {"order_item": items[0].id, "numeric_value": 7.5},
            {"order_item": items[1].id, "numeric_value": 4.8},
        ]

        authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": results_data},
            format="json",
        )

        order.refresh_from_db()
        assert order.status == "IN_PROGRESS"

    def test_batch_auto_flags_results(self, authenticated_client, lab_order_with_items):
        """Should auto-flag numeric results based on reference ranges."""
        order, items = lab_order_with_items
        # WBC normal is 4.0-11.0 — send 15.0 (HIGH)
        results_data = [
            {"order_item": items[0].id, "numeric_value": 15.0},
        ]

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": results_data},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        result = LabResult.objects.get(order_item=items[0])
        assert result.result_flag in ("HIGH", "CRITICAL_HIGH")

    def test_batch_rejects_empty_list(self, authenticated_client, lab_order_with_items):
        """Should reject empty results array."""
        order, _ = lab_order_with_items

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": []},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "non-empty" in response.data["detail"].lower()

    def test_batch_rejects_missing_results_key(self, authenticated_client, lab_order_with_items):
        """Should reject request without results key."""
        order, _ = lab_order_with_items

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"data": []},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_batch_rejects_item_not_in_order(
        self,
        authenticated_client,
        lab_order_with_items,
        sample_facility,
        sample_encounter,
        test_user,
    ):
        """Should reject items that don't belong to the order."""
        order, items = lab_order_with_items

        # Create another order with its own item
        other_order = LabOrder.objects.create(
            patient=order.patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            status="SPECIMEN_COLLECTED",
            priority="ROUTINE",
            order_type="IN_HOUSE",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        other_item = LabOrderItem.objects.create(
            lab_order=other_order,
            test=items[0].test,
            status="PENDING",
        )

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": [{"order_item": other_item.id, "numeric_value": 5.0}]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "errors" in response.data

    def test_batch_rejects_duplicate_result(self, authenticated_client, lab_order_with_items):
        """Should reject if item already has a result."""
        order, items = lab_order_with_items

        # Create a result for the first item
        LabResult.objects.create(
            order_item=items[0],
            numeric_value=7.0,
            entered_by=order.ordered_by,
        )

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": [{"order_item": items[0].id, "numeric_value": 8.0}]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "errors" in response.data

    def test_batch_all_or_nothing(self, authenticated_client, lab_order_with_items):
        """If one result in batch is invalid, none should be created."""
        order, items = lab_order_with_items

        # Mix valid and invalid (item 99999 doesn't exist)
        results_data = [
            {"order_item": items[0].id, "numeric_value": 7.5},
            {"order_item": 99999, "numeric_value": 4.8},
        ]

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": results_data},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # None should have been created
        assert LabResult.objects.filter(order_item__lab_order=order).count() == 0

    def test_batch_respects_max_limit(self, authenticated_client, lab_order_with_items):
        """Should reject batches over 100 items."""
        order, items = lab_order_with_items

        results_data = [{"order_item": items[0].id, "numeric_value": i} for i in range(101)]

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": results_data},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "100" in response.data["detail"]

    def test_batch_unauthenticated(self, api_client, lab_order_with_items):
        """Should reject unauthenticated requests."""
        order, items = lab_order_with_items

        response = api_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": [{"order_item": items[0].id, "numeric_value": 7.5}]},
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_batch_partial_panel(self, authenticated_client, lab_order_with_items):
        """Should allow submitting results for subset of items."""
        order, items = lab_order_with_items

        # Only submit 2 out of 5
        results_data = [
            {"order_item": items[0].id, "numeric_value": 7.5},
            {"order_item": items[2].id, "numeric_value": 14.0},
        ]

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": results_data},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) == 2
        assert LabResult.objects.filter(order_item__lab_order=order).count() == 2

    def test_batch_with_reference_ranges(self, authenticated_client, lab_order_with_items):
        """Should accept optional reference range fields."""
        order, items = lab_order_with_items

        results_data = [
            {
                "order_item": items[0].id,
                "numeric_value": 7.5,
                "reference_low": 4.0,
                "reference_high": 11.0,
                "reference_range_text": "4.0-11.0",
            },
        ]

        response = authenticated_client.post(
            f"/api/lab/orders/{order.order_number}/results/batch/",
            {"results": results_data},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, f"Response: {response.data}"
        result = LabResult.objects.get(order_item=items[0])
        assert float(result.reference_low) == 4.0
        assert float(result.reference_high) == 11.0
