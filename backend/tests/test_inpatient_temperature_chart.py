"""Tests for inpatient temperature chart intake and output tracking."""

from datetime import timedelta

import pytest  # type: ignore
from django.urls import reverse
from django.utils import timezone


@pytest.mark.django_db
class TestTemperatureReadingAPI:
    """Tests for measured fluid input/output on temperature readings."""

    def test_create_temperature_reading_with_measured_io(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Should persist fluid intake and urine output measurements in mL."""
        payload = {
            "admission": sample_admission.id,
            "recorded_at": timezone.now().isoformat(),
            "temperature": "37.4",
            "pulse": 88,
            "respiratory_rate": 20,
            "fluid_intake_ml": 1500,
            "urine_output_ml": 900,
            "notes": "IV fluids running",
        }

        response = authenticated_client.post(
            reverse("inpatient:temperature-reading-list"),
            payload,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["fluid_intake_ml"] == 1500
        assert response.data["urine_output_ml"] == 900
        assert response.data["fluid_balance_ml"] == 600

    def test_list_temperature_readings_includes_measured_io_fields(
        self,
        authenticated_client,
        sample_admission,
        test_user,
    ):
        """Should expose measured I/O fields in the temperature reading list."""
        from hmis.apps.inpatient.models import TemperatureReading

        TemperatureReading.objects.create(
            admission=sample_admission,
            recorded_at=timezone.now() - timedelta(hours=2),
            recorded_by=test_user,
            temperature="36.9",
            fluid_intake_ml=1000,
            urine_output_ml=700,
            bowels="Normal",
        )

        response = authenticated_client.get(
            reverse("inpatient:temperature-reading-list"),
            {"admission": sample_admission.id},
        )

        assert response.status_code == 200
        assert response.data["count"] == 1
        result = response.data["results"][0]
        assert result["fluid_intake_ml"] == 1000
        assert result["urine_output_ml"] == 700
        assert result["fluid_balance_ml"] == 300
