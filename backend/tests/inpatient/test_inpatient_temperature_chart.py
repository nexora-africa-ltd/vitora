"""Tests for inpatient TPR chart readings."""

import pytest  # type: ignore
from django.urls import reverse
from django.utils import timezone

from hmis.apps.encounters.models import VitalFlagSuggestion


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

    def test_create_temperature_reading_syncs_ipd_encounter_vitals(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Creating bedside temp reading should mirror vitals to linked IPD encounter."""
        payload = {
            "admission": sample_admission.id,
            "recorded_at": timezone.now().isoformat(),
            "temperature": "38.1",
            "pulse": 102,
            "respiratory_rate": 24,
            "notes": "Patient febrile",
        }

        response = authenticated_client.post(
            reverse("inpatient:temperature-reading-list"),
            payload,
            format="json",
        )

        assert response.status_code == 201
        sample_admission.ipd_encounter.refresh_from_db()
        assert str(sample_admission.ipd_encounter.temperature) == "38.1"
        assert sample_admission.ipd_encounter.pulse == 102
        assert sample_admission.ipd_encounter.respiratory_rate == 24


@pytest.mark.django_db
class TestBPReadingVitalFlagWiring:
    """Tests BP bedside charting integration with encounter-based vital flags."""

    def test_create_bp_reading_updates_ipd_encounter_and_generates_flag(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Hypertensive bedside BP should mirror to IPD encounter and create a suggestion."""
        payload = {
            "admission": sample_admission.id,
            "recorded_at": timezone.now().isoformat(),
            "systolic": 182,
            "diastolic": 121,
            "pulse": 98,
            "position": "SITTING",
            "arm": "Right",
        }

        response = authenticated_client.post(
            reverse("inpatient:bp-reading-list"),
            payload,
            format="json",
        )

        assert response.status_code == 201

        sample_admission.ipd_encounter.refresh_from_db()
        assert sample_admission.ipd_encounter.blood_pressure == "182/121"
        assert sample_admission.ipd_encounter.pulse == 98

        suggestion = VitalFlagSuggestion.objects.filter(
            encounter=sample_admission.ipd_encounter,
            flag_key="HYPERTENSIVE_CRISIS",
        ).first()
        assert suggestion is not None
        assert suggestion.source_type == VitalFlagSuggestion.SourceType.ENCOUNTER
