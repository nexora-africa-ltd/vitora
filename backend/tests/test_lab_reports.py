"""Tests for laboratory operational reports."""

from datetime import timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, LabQueue, TestCatalog


@pytest.fixture
def lab_test_catalog(db):
    return [
        TestCatalog.objects.create(
            code="HB",
            name="Hemoglobin",
            short_name="Hb",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("250.00"),
        ),
        TestCatalog.objects.create(
            code="RBS",
            name="Random Blood Sugar",
            short_name="RBS",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("150.00"),
        ),
    ]


@pytest.fixture
def report_data(sample_patient, sample_encounter, test_user, another_user, lab_test_catalog):
    now = timezone.now()
    start_date = (now - timedelta(days=7)).date()
    end_date = now.date()

    order1 = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        priority="ROUTINE",
        status="ORDERED",
    )
    item1 = LabOrderItem.objects.create(
        lab_order=order1,
        test=lab_test_catalog[0],
        unit_cost=lab_test_catalog[0].cost,
    )

    entered_at_1 = now - timedelta(days=5, hours=4)
    verified_at_1 = entered_at_1 + timedelta(hours=2)
    result1 = LabResult.objects.create(
        order_item=item1,
        numeric_value=Decimal("12.5"),
        entered_by=test_user,
    )
    LabResult.objects.filter(pk=result1.pk).update(
        entered_at=entered_at_1,
        verified_at=verified_at_1,
        verified_by=test_user,
        verification_status="VERIFIED",
    )

    order2 = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=another_user,
        priority="STAT",
        status="ORDERED",
    )
    item2 = LabOrderItem.objects.create(
        lab_order=order2,
        test=lab_test_catalog[1],
        unit_cost=lab_test_catalog[1].cost,
    )

    entered_at_2 = now - timedelta(days=3, hours=2)
    verified_at_2 = entered_at_2 + timedelta(hours=1)
    result2 = LabResult.objects.create(
        order_item=item2,
        numeric_value=Decimal("18.0"),
        entered_by=another_user,
        result_flag="CRITICAL_HIGH",
        is_critical_result=True,
    )
    LabResult.objects.filter(pk=result2.pk).update(
        entered_at=entered_at_2,
        verified_at=verified_at_2,
        verified_by=another_user,
        verification_status="VERIFIED",
    )

    order3 = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        priority="ROUTINE",
        status="ORDERED",
    )

    order_dates = now - timedelta(days=6)
    LabOrder.objects.filter(pk=order1.pk).update(ordered_at=order_dates)
    LabOrder.objects.filter(pk=order2.pk).update(ordered_at=order_dates)
    LabOrder.objects.filter(pk=order3.pk).update(ordered_at=order_dates, status="REJECTED")

    queue1 = LabQueue.objects.get(lab_order=order1)
    queue2 = LabQueue.objects.get(lab_order=order2)
    queue3 = LabQueue.objects.get(lab_order=order3)

    queue1.specimen.collected_at = entered_at_1 - timedelta(hours=1)
    queue1.processing_started_at = entered_at_1 - timedelta(minutes=30)
    queue1.released_at = verified_at_1
    queue1.specimen.save(update_fields=["collected_at"])
    queue1.save(update_fields=["processing_started_at", "released_at"])

    queue2.specimen.collected_at = entered_at_2 - timedelta(hours=2)
    queue2.processing_started_at = entered_at_2 - timedelta(hours=1)
    queue2.released_at = verified_at_2
    queue2.specimen.save(update_fields=["collected_at"])
    queue2.save(update_fields=["processing_started_at", "released_at"])

    queue3.rejection_reason = "Hemolyzed sample"
    queue3.save(update_fields=["rejection_reason"])

    return {
        "start": start_date,
        "end": end_date,
        "entered_at_1": entered_at_1,
        "entered_at_2": entered_at_2,
    }


@pytest.mark.django_db
class TestLabReportsAPI:
    def test_turnaround_time_report(self, authenticated_client, report_data):
        start = report_data["start"].isoformat()
        end = report_data["end"].isoformat()

        response = authenticated_client.get(
            f"/api/lab/reports/turnaround-time/?start={start}&end={end}"
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.data
        assert payload["start"] == start
        assert payload["end"] == end
        assert payload["overall"]["results_verified"] == 2

        by_test = {row["test_code"]: row for row in payload["by_test"]}
        assert by_test["HB"]["result_count"] == 1
        assert by_test["RBS"]["result_count"] == 1

        by_priority = {row["priority"]: row for row in payload["by_priority"]}
        assert by_priority["ROUTINE"]["result_count"] == 1
        assert by_priority["STAT"]["result_count"] == 1

    def test_workload_report(self, authenticated_client, report_data):
        start = report_data["start"].isoformat()
        end = report_data["end"].isoformat()

        response = authenticated_client.get(
            f"/api/lab/reports/workload/?start={start}&end={end}"
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.data
        assert payload["totals"]["tests_entered"] == 2
        assert payload["totals"]["tests_verified"] == 2

        dates = {row["date"] for row in payload["by_day"]}
        assert report_data["entered_at_1"].date().isoformat() in dates
        assert report_data["entered_at_2"].date().isoformat() in dates

        technicians = {row["technician_id"] for row in payload["by_technician"]}
        assert len(technicians) == 2

    def test_critical_values_report(self, authenticated_client, report_data):
        start = report_data["start"].isoformat()
        end = report_data["end"].isoformat()

        response = authenticated_client.get(
            f"/api/lab/reports/critical-values/?start={start}&end={end}"
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.data
        assert payload["total_critical"] == 1
        assert payload["by_test"][0]["critical_count"] == 1

    def test_rejection_report(self, authenticated_client, report_data):
        start = report_data["start"].isoformat()
        end = report_data["end"].isoformat()

        response = authenticated_client.get(
            f"/api/lab/reports/rejections/?start={start}&end={end}"
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.data
        assert payload["total_orders"] == 3
        assert payload["rejected_orders"] == 1
        assert payload["reasons"][0]["reason"] == "Hemolyzed sample"

    def test_missing_date_params_returns_400(self, authenticated_client):
        response = authenticated_client.get("/api/lab/reports/turnaround-time/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "start" in response.data
        assert "end" in response.data
