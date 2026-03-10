"""Tests for inpatient TPR chart readings."""

import pytest  # type: ignore
from django.urls import reverse
from django.utils import timezone


@pytest.mark.django_db
class TestTemperatureReadingAPI:
    """Tests for TPR chart readings."""

    def test_create_temperature_reading_with_vitals_only(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Should persist TPR vitals without fluid balance fields."""
        payload = {
            "admission": sample_admission.id,
            "recorded_at": timezone.now().isoformat(),
            "temperature": "37.4",
            "pulse": 88,
            "respiratory_rate": 20,
            "notes": "Patient stable",
        }

        response = authenticated_client.post(
            reverse("inpatient:temperature-reading-list"),
            payload,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["temperature"] == "37.4"
        assert response.data["pulse"] == 88
        assert response.data["respiratory_rate"] == 20
        assert "bowels" not in response.data
        assert "urine_output" not in response.data
        assert "fluid_intake_ml" not in response.data
        assert "urine_output_ml" not in response.data
        assert "fluid_balance_ml" not in response.data

    def test_list_temperature_readings_excludes_fluid_fields(
        self,
        authenticated_client,
        sample_admission,
        test_user,
    ):
        """Should expose only TPR fields in the temperature reading list."""
        from hmis.apps.inpatient.models import TemperatureReading

        TemperatureReading.objects.create(
            admission=sample_admission,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            temperature="36.9",
            pulse=76,
            respiratory_rate=18,
        )

        response = authenticated_client.get(
            reverse("inpatient:temperature-reading-list"),
            {"admission": sample_admission.id},
        )

        assert response.status_code == 200
        assert response.data["count"] == 1
        result = response.data["results"][0]
        assert result["temperature"] == "36.9"
        assert result["pulse"] == 76
        assert result["respiratory_rate"] == 18
        assert "bowels" not in result
        assert "urine_output" not in result
        assert "fluid_intake_ml" not in result
        assert "urine_output_ml" not in result
        assert "fluid_balance_ml" not in result
