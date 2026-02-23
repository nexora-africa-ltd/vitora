"""Tests for core utility functions."""

from datetime import datetime
from unittest import mock

import pytest

from hmis.apps.core.utils import generate_prc_number


class TestGeneratePRCNumber:
    """Tests for generate_prc_number function."""

    @mock.patch("hmis.apps.encounters.models.Encounter")
    def test_generates_prc_number_format(self, mock_encounter_model):
        """Should generate PRC number in correct format."""
        mock_encounter_model.objects.filter.return_value.exclude.return_value = []

        result = generate_prc_number("TEST")

        year = datetime.now().year
        assert result.startswith("TEST-PRC-")
        assert result.endswith(f"/{year}")

    @mock.patch("hmis.apps.encounters.models.Encounter")
    @mock.patch("hmis.apps.core.utils.settings", spec=[])
    def test_uses_default_facility_code(self, mock_settings, mock_encounter_model):
        """Should use 'FAC' as default facility code when setting not configured."""
        # spec=[] means no attributes exist, so getattr returns the default
        mock_encounter_model.objects.filter.return_value.exclude.return_value = []

        result = generate_prc_number()

        assert result.startswith("FAC-PRC-")

    @mock.patch("hmis.apps.encounters.models.Encounter")
    @mock.patch("hmis.apps.core.utils.settings")
    def test_uses_settings_facility_code(self, mock_settings, mock_encounter_model):
        """Should use facility code from settings."""
        mock_settings.FACILITY_MFL_CODE = "HOSP"
        mock_encounter_model.objects.filter.return_value.exclude.return_value = []

        result = generate_prc_number()

        assert result.startswith("HOSP-PRC-")

    @mock.patch("hmis.apps.encounters.models.Encounter")
    def test_increments_sequence_number(self, mock_encounter_model):
        """Should increment sequence from existing PRC numbers."""
        year = datetime.now().year

        # Mock an existing encounter with PRC number
        mock_encounter = mock.Mock()
        mock_encounter.clinical_template_data = {
            "Survivor Information": {"prc_number": f"FAC-PRC-0010/{year}"}
        }
        mock_encounter_model.objects.filter.return_value.exclude.return_value = [mock_encounter]

        result = generate_prc_number("FAC")

        # Should be 0011 (next after 0010)
        assert f"FAC-PRC-0011/{year}" == result

    @mock.patch("hmis.apps.encounters.models.Encounter")
    def test_handles_flat_prc_structure(self, mock_encounter_model):
        """Should handle PRC number in flat structure."""
        year = datetime.now().year

        mock_encounter = mock.Mock()
        mock_encounter.clinical_template_data = {"prc_number": f"FAC-PRC-0005/{year}"}
        mock_encounter_model.objects.filter.return_value.exclude.return_value = [mock_encounter]

        result = generate_prc_number("FAC")

        assert f"FAC-PRC-0006/{year}" == result

    @mock.patch("hmis.apps.encounters.models.Encounter")
    def test_handles_no_existing_prc_numbers(self, mock_encounter_model):
        """Should start at 0001 if no existing PRC numbers."""
        mock_encounter_model.objects.filter.return_value.exclude.return_value = []

        year = datetime.now().year
        result = generate_prc_number("FAC")

        assert f"FAC-PRC-0001/{year}" == result

    @mock.patch("hmis.apps.encounters.models.Encounter")
    def test_handles_invalid_prc_format(self, mock_encounter_model):
        """Should ignore encounters with invalid PRC format."""
        year = datetime.now().year

        # Mock encounters with various invalid formats
        mock_encounters = [
            mock.Mock(clinical_template_data={"prc_number": "invalid"}),
            mock.Mock(clinical_template_data={"prc_number": None}),
            mock.Mock(clinical_template_data={"Survivor Information": {}}),
            mock.Mock(clinical_template_data=None),
        ]
        mock_encounter_model.objects.filter.return_value.exclude.return_value = mock_encounters

        result = generate_prc_number("FAC")

        # Should still generate 0001 since no valid sequences found
        assert f"FAC-PRC-0001/{year}" == result

    @mock.patch("hmis.apps.encounters.models.Encounter")
    def test_ignores_different_year(self, mock_encounter_model):
        """Should ignore PRC numbers from different years."""
        year = datetime.now().year

        mock_encounter = mock.Mock()
        mock_encounter.clinical_template_data = {"prc_number": "FAC-PRC-0099/2020"}  # Old year
        mock_encounter_model.objects.filter.return_value.exclude.return_value = [mock_encounter]

        result = generate_prc_number("FAC")

        # Should be 0001 since 2020 numbers don't count
        assert f"FAC-PRC-0001/{year}" == result

    @mock.patch("hmis.apps.encounters.models.Encounter")
    def test_sequence_number_zero_padded(self, mock_encounter_model):
        """Should zero-pad sequence number to 4 digits."""
        mock_encounter_model.objects.filter.return_value.exclude.return_value = []

        result = generate_prc_number("FAC")

        # Extract sequence part
        parts = result.split("-PRC-")
        sequence_part = parts[1].split("/")[0]

        assert len(sequence_part) == 4
        assert sequence_part == "0001"
