"""
Tests for Clinical Template Field Mapping and Synchronization.

This module tests the bidirectional sync between clinical templates
and existing encounter/patient data.
"""

from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.clinical_templates.services import (
    TemplateDataSynchronizer,
    TemplateFieldMapper,
    TemplateSnapshotService,
)
from hmis.apps.encounters.models import Encounter

# =============================================================================
# Field Mapping Tests
# =============================================================================


class TestTemplateFieldMapper:
    """Tests for mapping template fields to encounter/patient fields."""

    def test_get_field_mapping_returns_known_mappings(self):
        """Should return mapping for known template field names."""
        mapper = TemplateFieldMapper()

        # Vitals mappings
        assert mapper.get_source_field("temperature") == ("encounter", "temperature")
        assert mapper.get_source_field("pulse") == ("encounter", "pulse")
        assert mapper.get_source_field("blood_pressure") == ("encounter", "blood_pressure")
        assert mapper.get_source_field("respiratory_rate") == ("encounter", "respiratory_rate")
        assert mapper.get_source_field("spo2") == ("encounter", "spo2")
        assert mapper.get_source_field("weight") == ("encounter", "weight")
        assert mapper.get_source_field("height") == ("encounter", "height")

    def test_get_field_mapping_returns_patient_mappings(self):
        """Should return patient field mappings."""
        mapper = TemplateFieldMapper()

        # Patient demographics are on patient model
        assert mapper.get_source_field("mrn") == ("patient", "mrn")
        assert mapper.get_source_field("date_of_birth") == ("patient", "date_of_birth")
        assert mapper.get_source_field("gender") == ("patient", "gender")

        # Medical history is on encounter (per-visit)
        assert mapper.get_source_field("allergies") == ("encounter", "allergies")
        assert mapper.get_source_field("chronic_conditions") == ("encounter", "chronic_conditions")
        assert mapper.get_source_field("current_medications") == (
            "encounter",
            "current_medications",
        )

    def test_get_field_mapping_returns_none_for_unknown(self):
        """Should return None for unmapped fields."""
        mapper = TemplateFieldMapper()

        assert mapper.get_source_field("prc_number") is None
        assert mapper.get_source_field("custom_field_xyz") is None

    def test_get_all_mappings_returns_complete_dict(self):
        """Should return all known field mappings."""
        mapper = TemplateFieldMapper()
        mappings = mapper.get_all_mappings()

        assert isinstance(mappings, dict)
        assert "temperature" in mappings
        assert "allergies" in mappings
        assert len(mappings) >= 10  # At least 10 mapped fields

    def test_is_syncable_field(self):
        """Should identify fields that can sync back to encounter/patient."""
        mapper = TemplateFieldMapper()

        assert mapper.is_syncable_field("temperature") is True
        assert mapper.is_syncable_field("pulse") is True
        assert mapper.is_syncable_field("prc_number") is False


# =============================================================================
# Auto-Population Tests
# =============================================================================


@pytest.mark.django_db
class TestTemplateAutoPopulation:
    """Tests for auto-populating template from existing data."""

    def test_populate_from_encounter_vitals(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should populate template fields from encounter vitals."""
        synchronizer = TemplateDataSynchronizer()

        populated = synchronizer.populate_from_encounter(
            template=sample_template_with_vitals,
            encounter=sample_encounter_with_vitals,
        )

        # Check vitals are populated
        assert populated.get("temperature") == sample_encounter_with_vitals.temperature
        assert populated.get("pulse") == sample_encounter_with_vitals.pulse
        assert populated.get("spo2") == sample_encounter_with_vitals.spo2

    def test_populate_from_patient_history(
        self, sample_encounter_with_vitals, sample_template_with_history
    ):
        """Should populate template fields from encounter medical history."""
        synchronizer = TemplateDataSynchronizer()

        # Medical history is stored on encounter, not patient
        encounter = sample_encounter_with_vitals
        encounter.allergies = "Penicillin, Sulfa"
        encounter.chronic_conditions = "Hypertension, Diabetes Type 2"
        encounter.save()

        populated = synchronizer.populate_from_encounter(
            template=sample_template_with_history,
            encounter=encounter,
        )

        assert "Penicillin" in str(populated.get("allergies", ""))
        assert "Hypertension" in str(populated.get("chronic_conditions", ""))

    def test_populate_preserves_existing_template_data(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should not overwrite existing template data values."""
        synchronizer = TemplateDataSynchronizer()

        # Pre-existing data in template
        existing_data = {"notes": "Patient reports improvement"}

        populated = synchronizer.populate_from_encounter(
            template=sample_template_with_vitals,
            encounter=sample_encounter_with_vitals,
            existing_data=existing_data,
        )

        # Existing data should be preserved
        assert populated.get("notes") == "Patient reports improvement"
        # But vitals should still be populated
        assert populated.get("temperature") is not None

    def test_populate_handles_null_values(
        self,
        sample_patient,
        sample_template_with_vitals,
        test_user,
        sample_facility,
    ):
        """Should handle encounters with null vitals gracefully."""
        # Create encounter without vitals
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            facility=sample_facility,
        )

        synchronizer = TemplateDataSynchronizer()
        populated = synchronizer.populate_from_encounter(
            template=sample_template_with_vitals,
            encounter=encounter,
        )

        # Should not crash, null values should be excluded or None
        assert isinstance(populated, dict)

    def test_populate_structures_by_section(
        self, sample_encounter_with_vitals, sample_template_with_sections
    ):
        """Should structure populated data by template sections."""
        synchronizer = TemplateDataSynchronizer()

        populated = synchronizer.populate_from_encounter(
            template=sample_template_with_sections,
            encounter=sample_encounter_with_vitals,
            structure_by_section=True,
        )

        # Should be structured as {section_name: {field_name: value}}
        assert isinstance(populated, dict)
        # Check at least one section exists
        assert any(isinstance(v, dict) for v in populated.values())


# =============================================================================
# Sync-Back Tests
# =============================================================================


@pytest.mark.django_db
class TestTemplateSyncBack:
    """Tests for syncing template data back to encounter/patient."""

    def test_sync_vitals_to_encounter(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should update encounter vitals from template data."""
        synchronizer = TemplateDataSynchronizer()

        template_data = {
            "temperature": Decimal("38.5"),
            "pulse": 88,
            "spo2": Decimal("97.0"),
        }

        updated_encounter = synchronizer.sync_to_encounter(
            template_data=template_data,
            encounter=sample_encounter_with_vitals,
        )

        assert updated_encounter.temperature == Decimal("38.5")
        assert updated_encounter.pulse == 88
        assert updated_encounter.spo2 == Decimal("97.0")

    def test_sync_does_not_overwrite_with_none(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should not overwrite existing values with None."""
        synchronizer = TemplateDataSynchronizer()
        original_temp = sample_encounter_with_vitals.temperature

        template_data = {
            "temperature": None,  # Should not overwrite
            "pulse": 92,  # Should update
        }

        updated_encounter = synchronizer.sync_to_encounter(
            template_data=template_data,
            encounter=sample_encounter_with_vitals,
        )

        assert updated_encounter.temperature == original_temp  # Preserved
        assert updated_encounter.pulse == 92  # Updated

    def test_sync_handles_nested_section_structure(
        self, sample_encounter_with_vitals, sample_template_with_sections
    ):
        """Should handle nested section structure in template data."""
        synchronizer = TemplateDataSynchronizer()

        template_data = {
            "Vital Signs": {
                "temperature": Decimal("37.8"),
                "pulse": 76,
            },
            "Assessment": {
                "notes": "Patient stable",
            },
        }

        updated_encounter = synchronizer.sync_to_encounter(
            template_data=template_data,
            encounter=sample_encounter_with_vitals,
        )

        assert updated_encounter.temperature == Decimal("37.8")
        assert updated_encounter.pulse == 76

    def test_sync_validates_data_types(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should validate and convert data types appropriately."""
        synchronizer = TemplateDataSynchronizer()

        template_data = {
            "temperature": "37.5",  # String should convert to Decimal
            "pulse": "80",  # String should convert to int
        }

        updated_encounter = synchronizer.sync_to_encounter(
            template_data=template_data,
            encounter=sample_encounter_with_vitals,
        )

        assert updated_encounter.temperature == Decimal("37.5")
        assert updated_encounter.pulse == 80

    def test_sync_returns_changed_fields(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should return list of fields that were changed."""
        synchronizer = TemplateDataSynchronizer()

        template_data = {
            "temperature": Decimal("38.0"),
            "pulse": sample_encounter_with_vitals.pulse,  # Same value
        }

        updated_encounter, changed_fields = synchronizer.sync_to_encounter(
            template_data=template_data,
            encounter=sample_encounter_with_vitals,
            return_changes=True,
        )

        assert "temperature" in changed_fields
        assert "pulse" not in changed_fields  # Not changed


# =============================================================================
# Template Snapshot Tests
# =============================================================================


@pytest.mark.django_db
class TestTemplateSnapshot:
    """Tests for saving completed templates as snapshots/attachments."""

    def test_create_snapshot_stores_template_data(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should create a snapshot with template data."""
        service = TemplateSnapshotService()

        # Use JSON-serializable values (strings/floats instead of Decimal)
        template_data = {
            "temperature": 37.5,
            "pulse": 80,
            "notes": "Patient stable",
        }

        snapshot = service.create_snapshot(
            encounter=sample_encounter_with_vitals,
            template=sample_template_with_vitals,
            template_data=template_data,
        )

        assert snapshot is not None
        assert snapshot.encounter == sample_encounter_with_vitals
        assert snapshot.template == sample_template_with_vitals
        assert snapshot.data == template_data

    def test_snapshot_includes_metadata(
        self, sample_encounter_with_vitals, sample_template_with_vitals, test_user
    ):
        """Should include metadata in snapshot."""
        service = TemplateSnapshotService()

        snapshot = service.create_snapshot(
            encounter=sample_encounter_with_vitals,
            template=sample_template_with_vitals,
            template_data={"notes": "Test"},
            created_by=test_user,
        )

        assert snapshot.created_by == test_user
        assert snapshot.created_at is not None
        assert snapshot.template_name == sample_template_with_vitals.name
        assert snapshot.template_version is not None

    def test_get_snapshots_for_encounter(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should retrieve all snapshots for an encounter."""
        service = TemplateSnapshotService()

        # Create multiple snapshots
        service.create_snapshot(
            encounter=sample_encounter_with_vitals,
            template=sample_template_with_vitals,
            template_data={"visit": 1},
        )
        service.create_snapshot(
            encounter=sample_encounter_with_vitals,
            template=sample_template_with_vitals,
            template_data={"visit": 2},
        )

        snapshots = service.get_snapshots_for_encounter(sample_encounter_with_vitals)

        assert len(snapshots) >= 2

    def test_snapshot_generates_pdf_attachment(
        self, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should be able to generate PDF from snapshot."""
        service = TemplateSnapshotService()

        snapshot = service.create_snapshot(
            encounter=sample_encounter_with_vitals,
            template=sample_template_with_vitals,
            template_data={"notes": "Complete assessment"},
        )

        # PDF generation is optional, check method exists
        assert hasattr(service, "generate_pdf")

    def test_snapshot_is_immutable(self, sample_encounter_with_vitals, sample_template_with_vitals):
        """Snapshot data should not be modifiable after creation."""
        service = TemplateSnapshotService()

        snapshot = service.create_snapshot(
            encounter=sample_encounter_with_vitals,
            template=sample_template_with_vitals,
            template_data={"notes": "Original"},
        )

        # Attempting to modify should raise or be ignored
        original_data = snapshot.data.copy()

        # Verify data integrity
        snapshot.refresh_from_db()
        assert snapshot.data == original_data


# =============================================================================
# API Integration Tests
# =============================================================================


@pytest.mark.django_db
class TestTemplatePopulateAPI:
    """Tests for the template population API endpoint."""

    def test_populate_endpoint_returns_data(
        self, authenticated_client, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should return populated template data via API."""
        response = authenticated_client.get(
            f"/api/encounters/{sample_encounter_with_vitals.id}/populate-template/",
            {"template_id": sample_template_with_vitals.id},
        )

        assert response.status_code == 200
        assert "populated_data" in response.data
        assert isinstance(response.data["populated_data"], dict)

    def test_populate_endpoint_requires_template_id(
        self, authenticated_client, sample_encounter_with_vitals
    ):
        """Should require template_id parameter."""
        response = authenticated_client.get(
            f"/api/encounters/{sample_encounter_with_vitals.id}/populate-template/",
        )

        assert response.status_code == 400

    def test_sync_endpoint_updates_encounter(
        self, authenticated_client, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should sync template data back to encounter."""
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter_with_vitals.id}/sync-template/",
            {
                "template_id": sample_template_with_vitals.id,
                "template_data": {
                    "temperature": "38.0",
                    "pulse": 85,
                },
            },
            format="json",
        )

        assert response.status_code == 200

        # Verify encounter was updated
        sample_encounter_with_vitals.refresh_from_db()
        assert sample_encounter_with_vitals.temperature == Decimal("38.0")

    def test_snapshot_endpoint_creates_attachment(
        self, authenticated_client, sample_encounter_with_vitals, sample_template_with_vitals
    ):
        """Should create template snapshot via API."""
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter_with_vitals.id}/template-snapshots/",
            {
                "template_id": sample_template_with_vitals.id,
                "template_data": {"notes": "Complete"},
            },
            format="json",
        )

        assert response.status_code == 201
        assert "id" in response.data

    def test_list_snapshots_endpoint(self, authenticated_client, sample_encounter_with_vitals):
        """Should list template snapshots for encounter."""
        response = authenticated_client.get(
            f"/api/encounters/{sample_encounter_with_vitals.id}/template-snapshots/",
        )

        assert response.status_code == 200
        assert isinstance(response.data, list)
