"""Tests for inpatient fluid balance sheets and entries."""

from decimal import Decimal

import pytest  # type: ignore
from django.urls import reverse
from django.utils import timezone


@pytest.mark.django_db
class TestFluidBalanceAPI:
    """Tests for MoH-style fluid balance tracking."""

    def test_create_fluid_balance_sheet(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Should create a daily fluid balance sheet for an admission."""
        payload = {
            "admission": sample_admission.id,
            "chart_date": timezone.localdate().isoformat(),
            "patient_weight_kg": "68.5",
            "intravenous_infusion_notes": "Ringer's lactate running",
            "other_instructions": "Strict input and output charting",
        }

        response = authenticated_client.post(
            reverse("inpatient:fluid-balance-sheet-list"),
            payload,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["admission"] == sample_admission.id
        assert response.data["chart_date"] == payload["chart_date"]
        assert response.data["patient_weight_kg"] == "68.5"
        assert response.data["total_intake_ml"] == 0
        assert response.data["total_output_ml"] == 0
        assert response.data["net_balance_ml"] == 0

    def test_create_fluid_balance_entry_updates_sheet_totals(
        self,
        authenticated_client,
        sample_admission,
        test_user,
    ):
        """Should compute intake, output, and balance totals from entry categories."""
        from hmis.apps.inpatient.models import FluidBalanceSheet

        sheet = FluidBalanceSheet.objects.create(
            admission=sample_admission,
            chart_date=timezone.localdate(),
            recorded_by=test_user,
        )

        entries = [
            {
                "fluid_balance_sheet": sheet.id,
                "recorded_at": timezone.now().isoformat(),
                "entry_type": "INTRAVENOUS",
                "item_type": "Ringer's Lactate",
                "bottle_number": "RL-001",
                "amount_ml": 1000,
            },
            {
                "fluid_balance_sheet": sheet.id,
                "recorded_at": timezone.now().isoformat(),
                "entry_type": "ALIMENTARY",
                "item_type": "Oral feeds",
                "amount_ml": 500,
            },
            {
                "fluid_balance_sheet": sheet.id,
                "recorded_at": timezone.now().isoformat(),
                "entry_type": "URINE",
                "amount_ml": 900,
                "specific_gravity": "1.015",
            },
            {
                "fluid_balance_sheet": sheet.id,
                "recorded_at": timezone.now().isoformat(),
                "entry_type": "STOOL",
                "amount_ml": 100,
            },
        ]

        for payload in entries:
            response = authenticated_client.post(
                reverse("inpatient:fluid-balance-entry-list"),
                payload,
                format="json",
            )
            assert response.status_code == 201

        sheet_response = authenticated_client.get(
            reverse("inpatient:fluid-balance-sheet-detail", args=[sheet.id])
        )

        assert sheet_response.status_code == 200
        assert sheet_response.data["total_intravenous_intake_ml"] == 1000
        assert sheet_response.data["total_alimentary_intake_ml"] == 500
        assert sheet_response.data["total_intake_ml"] == 1500
        assert sheet_response.data["total_urine_output_ml"] == 900
        assert sheet_response.data["total_stool_output_ml"] == 100
        assert sheet_response.data["total_output_ml"] == 1000
        assert sheet_response.data["net_balance_ml"] == 500

    def test_list_fluid_balance_entries_for_sheet(
        self,
        authenticated_client,
        sample_admission,
        test_user,
    ):
        """Should list fluid balance entries with category-specific fields."""
        from hmis.apps.inpatient.models import FluidBalanceEntry, FluidBalanceSheet

        sheet = FluidBalanceSheet.objects.create(
            admission=sample_admission,
            chart_date=timezone.localdate(),
            recorded_by=test_user,
            patient_weight_kg=Decimal("70.0"),
        )
        FluidBalanceEntry.objects.create(
            fluid_balance_sheet=sheet,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            entry_type="URINE",
            amount_ml=650,
            specific_gravity=Decimal("1.020"),
            notes="Clear urine",
        )

        response = authenticated_client.get(
            reverse("inpatient:fluid-balance-entry-list"),
            {"fluid_balance_sheet": sheet.id},
        )

        assert response.status_code == 200
        assert response.data["count"] == 1
        result = response.data["results"][0]
        assert result["entry_type"] == "URINE"
        assert result["amount_ml"] == 650
        assert result["specific_gravity"] == "1.020"
        assert result["fluid_balance_sheet"] == sheet.id
