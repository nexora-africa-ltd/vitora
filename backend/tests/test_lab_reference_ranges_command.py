"""
Tests for load_lab_reference_ranges management command.

Test Coverage:
- Command loads all panels successfully
- Command loads specific panel
- Command clears existing data when --clear flag used
- Dry-run mode validates without saving
- Created and updated counts are correct
- Reference ranges are correctly structured
"""

from io import StringIO

import pytest # type: ignore
from django.core.management import call_command

from hmis.apps.laboratory.models import LabResultTemplate


@pytest.mark.django_db
class TestLoadLabReferenceRangesCommand:
    """Test suite for load_lab_reference_ranges management command."""

    def test_command_loads_all_panels(self):
        """Command should load all panels when no --panel specified."""
        # Initial count should be 0
        assert LabResultTemplate.objects.count() == 0

        # Run command
        out = StringIO()
        call_command("load_lab_reference_ranges", stdout=out)

        # Check that data was loaded
        assert LabResultTemplate.objects.count() > 0

        # Check that all panels are represented
        test_codes = set(LabResultTemplate.objects.values_list("test_code", flat=True))
        assert "CBC" in test_codes
        assert "LIVER" in test_codes
        assert "RENAL" in test_codes
        assert "LIPID" in test_codes
        assert "GLUCOSE" in test_codes
        assert "ELECTROLYTES" in test_codes
        assert "THYROID" in test_codes

        # Check output
        output = out.getvalue()
        assert "Successfully loaded" in output

    def test_command_loads_specific_panel(self):
        """Command should load only specified panel with --panel flag."""
        # Run command with CBC panel only
        out = StringIO()
        call_command("load_lab_reference_ranges", panel="CBC", stdout=out)

        # Check that only CBC was loaded
        assert LabResultTemplate.objects.filter(test_code="CBC").count() == 8  # 8 CBC parameters
        assert LabResultTemplate.objects.exclude(test_code="CBC").count() == 0

        # Check output mentions the panel
        output = out.getvalue()
        assert "CBC" in output

    def test_command_clears_existing_data(self):
        """Command should clear existing data when --clear flag used."""
        # Create some existing data
        LabResultTemplate.objects.create(
            test_code="TEST",
            test_name="Test",
            parameter_code="TEST1",
            parameter_name="Test Parameter",
            unit="test",
            reference_ranges={"default": {"low": 1, "high": 2}},
        )
        assert LabResultTemplate.objects.count() == 1

        # Run command with --clear
        out = StringIO()
        call_command("load_lab_reference_ranges", panel="CBC", clear=True, stdout=out)

        # Old data should be cleared
        assert not LabResultTemplate.objects.filter(test_code="TEST").exists()

        # New CBC data should exist
        assert LabResultTemplate.objects.filter(test_code="CBC").count() == 8

        # Check output mentions clearing
        output = out.getvalue()
        assert "Cleared" in output

    def test_dry_run_validates_without_saving(self):
        """Dry-run mode should validate data without saving to database."""
        # Run command in dry-run mode
        out = StringIO()
        call_command("load_lab_reference_ranges", panel="CBC", dry_run=True, stdout=out)

        # No data should be saved
        assert LabResultTemplate.objects.count() == 0

        # Output should indicate dry-run
        output = out.getvalue()
        assert "DRY RUN" in output
        assert "Would create" in output

    def test_update_existing_ranges(self):
        """Command should update existing ranges instead of creating duplicates."""
        # Create initial CBC HGB parameter
        LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="HGB",
            parameter_name="Hemoglobin (old)",
            unit="g/dL",
            reference_ranges={"default": {"low": 10, "high": 15}},
        )

        # Run command
        out = StringIO()
        call_command("load_lab_reference_ranges", panel="CBC", stdout=out)

        # Should still have only one HGB entry (updated, not duplicated)
        hgb_count = LabResultTemplate.objects.filter(
            test_code="CBC", parameter_code="HGB"
        ).count()
        assert hgb_count == 1

        # Parameter should be updated
        hgb = LabResultTemplate.objects.get(test_code="CBC", parameter_code="HGB")
        assert hgb.parameter_name == "Hemoglobin"  # Not "Hemoglobin (old)"
        assert hgb.reference_ranges["adult_male"]["low"] == 13.5  # Updated value

        # Output should mention update
        output = out.getvalue()
        assert "Updated" in output

    def test_reference_ranges_structure(self):
        """Reference ranges should have correct structure for different demographics."""
        # Load CBC panel
        call_command("load_lab_reference_ranges", panel="CBC", stdout=StringIO())

        # Check HGB has correct ranges
        hgb = LabResultTemplate.objects.get(test_code="CBC", parameter_code="HGB")

        assert "adult_male" in hgb.reference_ranges
        assert "adult_female" in hgb.reference_ranges
        assert "pediatric" in hgb.reference_ranges

        # Check adult male range
        assert hgb.reference_ranges["adult_male"]["low"] == 13.5
        assert hgb.reference_ranges["adult_male"]["high"] == 17.5

        # Check critical values
        assert hgb.critical_low is not None
        assert hgb.critical_high is not None

    def test_display_order_preserved(self):
        """Parameters should have correct display order."""
        # Load CBC panel
        call_command("load_lab_reference_ranges", panel="CBC", stdout=StringIO())

        # Get CBC parameters ordered by display_order
        params = list(
            LabResultTemplate.objects.filter(test_code="CBC").order_by("display_order")
        )

        # Check order
        assert params[0].parameter_code == "WBC"  # display_order=1
        assert params[1].parameter_code == "RBC"  # display_order=2
        assert params[2].parameter_code == "HGB"  # display_order=3

    def test_critical_values_optional(self):
        """Some parameters should not have critical values."""
        # Load CBC panel
        call_command("load_lab_reference_ranges", panel="CBC", stdout=StringIO())

        # MCV should not have critical values
        mcv = LabResultTemplate.objects.get(test_code="CBC", parameter_code="MCV")
        assert mcv.critical_low is None
        assert mcv.critical_high is None

        # But HGB should have critical values
        hgb = LabResultTemplate.objects.get(test_code="CBC", parameter_code="HGB")
        assert hgb.critical_low is not None
        assert hgb.critical_high is not None

    def test_all_parameters_have_units(self):
        """All parameters should have units specified."""
        # Load all panels
        call_command("load_lab_reference_ranges", stdout=StringIO())

        # Check all have units
        params_without_units = LabResultTemplate.objects.filter(unit="")
        assert params_without_units.count() == 0

    def test_panels_have_correct_parameter_counts(self):
        """Each panel should have expected number of parameters."""
        # Load all panels
        call_command("load_lab_reference_ranges", stdout=StringIO())

        # CBC should have 8 parameters
        assert LabResultTemplate.objects.filter(test_code="CBC").count() == 8

        # LIVER should have 5 parameters
        assert LabResultTemplate.objects.filter(test_code="LIVER").count() == 5

        # RENAL should have 3 parameters
        assert LabResultTemplate.objects.filter(test_code="RENAL").count() == 3

        # LIPID should have 4 parameters
        assert LabResultTemplate.objects.filter(test_code="LIPID").count() == 4

        # GLUCOSE should have 3 parameters
        assert LabResultTemplate.objects.filter(test_code="GLUCOSE").count() == 3

        # ELECTROLYTES should have 4 parameters
        assert LabResultTemplate.objects.filter(test_code="ELECTROLYTES").count() == 4

        # THYROID should have 3 parameters
        assert LabResultTemplate.objects.filter(test_code="THYROID").count() == 3

    def test_is_active_flag_set(self):
        """All loaded parameters should be active."""
        # Load all panels
        call_command("load_lab_reference_ranges", stdout=StringIO())

        # All should be active
        inactive_count = LabResultTemplate.objects.filter(is_active=False).count()
        assert inactive_count == 0
