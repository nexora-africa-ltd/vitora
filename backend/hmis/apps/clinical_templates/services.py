"""
Clinical Template Synchronization Services.

This module provides services for bidirectional sync between clinical templates
and existing encounter/patient data:
- Auto-populate template fields from encounter/patient
- Sync template data back to encounter/patient
- Create immutable snapshots of completed templates
"""

from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Any, Optional

from hmis.apps.clinical_templates.models import ClinicalTemplate
from hmis.apps.encounters.models import Encounter

if TYPE_CHECKING:
    from django.contrib.auth.models import User

    from hmis.apps.clinical_templates.models import ClinicalTemplateSnapshot
    from hmis.apps.patients.models import Patient

# =============================================================================
# Field Mapping Service
# =============================================================================


class TemplateFieldMapper:
    """
    Maps template field names to their corresponding encounter/patient fields.

    This allows bidirectional sync between template data and the database.
    """

    # Field mappings: template_field_name -> (source, field_name)
    # source can be 'encounter', 'patient', or 'encounter.patient'
    FIELD_MAPPINGS = {
        # Encounter Vitals
        "temperature": ("encounter", "temperature"),
        "pulse": ("encounter", "pulse"),
        "heart_rate": ("encounter", "pulse"),  # Alias
        "blood_pressure": ("encounter", "blood_pressure"),
        "bp": ("encounter", "blood_pressure"),  # Alias
        "respiratory_rate": ("encounter", "respiratory_rate"),
        "resp_rate": ("encounter", "respiratory_rate"),  # Alias
        "spo2": ("encounter", "spo2"),
        "oxygen_saturation": ("encounter", "spo2"),  # Alias
        "weight": ("encounter", "weight"),
        "height": ("encounter", "height"),
        # Encounter Medical History (stored on encounter)
        "allergies": ("encounter", "allergies"),
        "chronic_conditions": ("encounter", "chronic_conditions"),
        "current_medications": ("encounter", "current_medications"),
        "past_surgeries": ("encounter", "past_surgeries"),
        "family_history": ("encounter", "family_history"),
        "social_history": ("encounter", "social_history"),
        # Patient Demographics
        "patient_name": ("patient", "full_name"),
        "date_of_birth": ("patient", "date_of_birth"),
        "gender": ("patient", "gender"),
        "age": ("patient", "age"),
        "mrn": ("patient", "mrn"),
        # Chief Complaint
        "chief_complaint": ("encounter", "chief_complaint"),
        "presenting_complaint": ("encounter", "chief_complaint"),  # Alias
        # ANC/MCH fields from enrollment
        "lmp": ("enrollment", "lmp"),
        "edd": ("enrollment", "edd"),
        "gravida": ("enrollment", "gravida"),
        "parity": ("enrollment", "parity"),
    }

    # Computed fields that require special logic (not simple mappings)
    # These need calculation based on encounter/enrollment state
    COMPUTED_FIELDS = {
        "visit_number",
        "gestational_age_weeks",
        "gestational_age",
        "gestation_weeks",
        "trimester",
    }

    # Fields that can be synced back to encounter (writable)
    SYNCABLE_FIELDS = {
        "temperature",
        "pulse",
        "heart_rate",
        "blood_pressure",
        "bp",
        "respiratory_rate",
        "resp_rate",
        "spo2",
        "oxygen_saturation",
        "weight",
        "height",
        "allergies",
        "chronic_conditions",
        "current_medications",
        "past_surgeries",
        "family_history",
        "social_history",
        "chief_complaint",
        "presenting_complaint",
    }

    # Type converters for sync back
    TYPE_CONVERTERS = {
        "temperature": lambda x: Decimal(str(x)) if x else None,
        "pulse": lambda x: int(x) if x else None,
        "heart_rate": lambda x: int(x) if x else None,
        "respiratory_rate": lambda x: int(x) if x else None,
        "resp_rate": lambda x: int(x) if x else None,
        "spo2": lambda x: Decimal(str(x)) if x else None,
        "oxygen_saturation": lambda x: Decimal(str(x)) if x else None,
        "weight": lambda x: Decimal(str(x)) if x else None,
        "height": lambda x: Decimal(str(x)) if x else None,
    }

    def get_source_field(self, template_field: str) -> tuple[str, str] | None:
        """
        Get the source and field name for a template field.

        Args:
            template_field: The template field name

        Returns:
            Tuple of (source, field_name) or None if not mapped
        """
        return self.FIELD_MAPPINGS.get(template_field.lower())

    def get_all_mappings(self) -> dict[str, tuple[str, str]]:
        """Get all field mappings."""
        return self.FIELD_MAPPINGS.copy()

    def is_syncable_field(self, template_field: str) -> bool:
        """Check if a field can be synced back to encounter."""
        return template_field.lower() in self.SYNCABLE_FIELDS

    def is_computed_field(self, template_field: str) -> bool:
        """Check if a field requires computed logic."""
        return template_field.lower() in self.COMPUTED_FIELDS

    def convert_value(self, field_name: str, value: Any) -> Any:
        """Convert value to appropriate type for database storage."""
        converter = self.TYPE_CONVERTERS.get(field_name.lower())
        if converter and value is not None:
            try:
                return converter(value)
            except (ValueError, InvalidOperation, TypeError):
                return value
        return value


# =============================================================================
# Template Data Synchronizer
# =============================================================================


class TemplateDataSynchronizer:
    """
    Synchronizes data between clinical templates and encounters/patients.

    Supports:
    - Populating template fields from existing encounter/patient data
    - Syncing template data back to encounter/patient records
    """

    def __init__(self):
        self.mapper = TemplateFieldMapper()

    def populate_from_encounter(
        self,
        template: ClinicalTemplate,
        encounter: Encounter,
        existing_data: dict | None = None,
        structure_by_section: bool = False,
        enrollment: Any | None = None,
    ) -> dict[str, Any]:
        """
        Populate template fields from existing encounter/patient data.

        Args:
            template: The clinical template to populate
            encounter: The encounter to get data from
            existing_data: Existing template data to preserve
            structure_by_section: If True, structure by section names
            enrollment: Optional ClinicEnrollment for clinic-specific data

        Returns:
            Dict of populated template data
        """
        populated = existing_data.copy() if existing_data else {}
        patient = encounter.patient

        # Try to find enrollment if not provided
        if enrollment is None:
            enrollment = self._get_enrollment_for_encounter(encounter)

        # Get all fields from template
        sections = template.content.get("sections", [])

        for section in sections:
            section_name = section.get("name", "")
            section_data = {} if structure_by_section else populated

            if structure_by_section and section_name not in populated:
                populated[section_name] = {}
                section_data = populated[section_name]

            for field in section.get("fields", []):
                field_name = field.get("name")
                if not field_name:
                    continue

                # Skip if already has a value (don't overwrite)
                if structure_by_section:
                    if populated.get(section_name, {}).get(field_name):
                        continue
                else:
                    if populated.get(field_name):
                        continue

                value = None

                # Check if it's a computed field first
                if self.mapper.is_computed_field(field_name):
                    value = self._get_computed_value(field_name, encounter, patient, enrollment)
                else:
                    # Get mapping
                    mapping = self.mapper.get_source_field(field_name)
                    if mapping:
                        source, source_field = mapping
                        value = self._get_value_from_source(
                            source, source_field, encounter, patient, enrollment
                        )

                if value is not None:
                    if structure_by_section:
                        section_data[field_name] = value
                    else:
                        populated[field_name] = value

        return populated

    def _get_computed_value(
        self,
        field_name: str,
        encounter: Encounter,
        patient: "Patient",
        enrollment: Any | None,
    ) -> Any:
        """
        Calculate computed field values.

        These fields require logic beyond simple attribute access.
        """
        field_lower = field_name.lower()

        if field_lower in ("visit_number", "visit"):
            # Calculate visit number based on enrollment or encounter count
            return self._calculate_visit_number(encounter, patient, enrollment)

        elif field_lower in ("gestational_age_weeks", "gestational_age", "gestation_weeks"):
            if enrollment and hasattr(enrollment, "gestation_weeks"):
                weeks = enrollment.gestation_weeks()
                return weeks if weeks else None
            return None

        elif field_lower == "trimester":
            if enrollment and hasattr(enrollment, "trimester"):
                return enrollment.trimester()
            return None

        return None

    def _calculate_visit_number(
        self,
        encounter: Encounter,
        patient: "Patient",
        enrollment: Any | None,
    ) -> int:
        """
        Calculate the visit number for this encounter.

        Logic:
        1. If enrollment exists, use total_visits + 1
        2. Otherwise, count previous encounters of same type for this patient + 1
        """
        if enrollment and hasattr(enrollment, "total_visits"):
            return enrollment.total_visits + 1

        # Fallback: count encounters of same type
        encounter_type = encounter.encounter_type
        count = Encounter.objects.filter(
            patient=patient,
            encounter_type=encounter_type,
            status__in=["CREATED", "FINALIZED"],
        ).exclude(pk=encounter.pk).count()

        return count + 1

    def _get_value_from_source(
        self,
        source: str,
        field_name: str,
        encounter: Encounter,
        patient: "Patient",
        enrollment: Any | None = None,
    ) -> Any:
        """Get value from encounter, patient, or enrollment."""
        if source == "encounter":
            return getattr(encounter, field_name, None)
        elif source == "patient":
            # Handle computed properties
            if field_name == "full_name":
                return f"{patient.first_name} {patient.last_name}"
            elif field_name == "age":
                return patient.age if hasattr(patient, "age") else None
            return getattr(patient, field_name, None)
        elif source == "enrollment" and enrollment:
            # Get from enrollment_data JSON or direct attribute
            if hasattr(enrollment, "enrollment_data") and enrollment.enrollment_data:
                value = enrollment.enrollment_data.get(field_name)
                if value is not None:
                    return value
            # Fallback to direct attribute (e.g., for computed properties like edd)
            if hasattr(enrollment, field_name):
                attr = getattr(enrollment, field_name)
                # If it's a method, call it
                if callable(attr):
                    try:
                        return attr()
                    except Exception:
                        return None
                return attr
        return None

    def _get_enrollment_for_encounter(self, encounter: Encounter) -> Any | None:
        """
        Find the relevant ClinicEnrollment for an encounter.

        Looks up based on:
        1. ClinicVisit linked to encounter → clinic → patient's active enrollment
        2. Clinic template specialty (ANC, CCC, etc.)
        """
        from hmis.apps.clinics.models import ClinicEnrollment

        patient = encounter.patient

        # If encounter has a clinic_visit, find enrollment for that clinic
        clinic_visit = getattr(encounter, "clinic_visit", None)
        if clinic_visit and clinic_visit.session:
            clinic = clinic_visit.session.clinic
            enrollment = (
                ClinicEnrollment.objects.filter(
                    patient=patient,
                    clinic=clinic,
                    status="ACTIVE",
                )
                .order_by("-enrollment_date")
                .first()
            )
            if enrollment:
                return enrollment

        # Fallback: find any active enrollment for the patient
        # Prefer ANC/MCH for applicable encounter types
        if encounter.encounter_type == "ANC":
            enrollment = (
                ClinicEnrollment.objects.filter(
                    patient=patient,
                    clinic__clinic_type__in=["ANC", "MCH"],
                    status="ACTIVE",
                )
                .order_by("-enrollment_date")
                .first()
            )
            if enrollment:
                return enrollment

        return None

    def sync_to_encounter(
        self,
        template_data: dict[str, Any],
        encounter: Encounter,
        return_changes: bool = False,
    ) -> "Encounter | tuple[Encounter, list[str]]":
        """
        Sync template data back to encounter.

        Args:
            template_data: The template data to sync
            encounter: The encounter to update
            return_changes: If True, also return list of changed fields

        Returns:
            Updated encounter, or tuple of (encounter, changed_fields)
        """
        changed_fields = []

        # Flatten nested structure if needed
        flat_data = self._flatten_template_data(template_data)

        for field_name, value in flat_data.items():
            if not self.mapper.is_syncable_field(field_name):
                continue

            mapping = self.mapper.get_source_field(field_name)
            if not mapping or mapping[0] != "encounter":
                continue

            _, encounter_field = mapping

            # Skip None values (don't overwrite with None)
            if value is None:
                continue

            # Convert value to appropriate type
            converted_value = self.mapper.convert_value(field_name, value)

            # Check if value actually changed
            current_value = getattr(encounter, encounter_field, None)
            if current_value != converted_value:
                setattr(encounter, encounter_field, converted_value)
                changed_fields.append(field_name)

        # Save encounter if there were changes
        if changed_fields:
            encounter.save(
                update_fields=[
                    self.mapper.get_source_field(f)[1]
                    for f in changed_fields
                    if self.mapper.get_source_field(f)
                ]
            )

        if return_changes:
            return encounter, changed_fields
        return encounter

    def _flatten_template_data(self, data: dict[str, Any]) -> dict[str, Any]:
        """Flatten nested section structure to flat dict."""
        flat = {}
        for key, value in data.items():
            if isinstance(value, dict):
                # This is a section
                flat.update(value)
            else:
                flat[key] = value
        return flat


# =============================================================================
# Template Snapshot Service
# =============================================================================


class TemplateSnapshotService:
    """
    Creates and manages immutable snapshots of completed clinical templates.

    Snapshots serve as permanent records (attachments) of assessments
    completed using clinical templates.
    """

    def create_snapshot(
        self,
        encounter: Encounter,
        template: ClinicalTemplate,
        template_data: dict[str, Any],
        created_by: Optional["User"] = None,
    ) -> "ClinicalTemplateSnapshot":
        """
        Create an immutable snapshot of a completed template.

        Args:
            encounter: The encounter this snapshot belongs to
            template: The clinical template used
            template_data: The completed template data
            created_by: The user who created this snapshot

        Returns:
            The created ClinicalTemplateSnapshot instance
        """
        from hmis.apps.clinical_templates.models import ClinicalTemplateSnapshot

        snapshot = ClinicalTemplateSnapshot.objects.create(
            encounter=encounter,
            template=template,
            template_name=template.name,
            template_version=template.content.get("version", "1.0"),
            data=template_data,
            created_by=created_by,
        )

        return snapshot

    def get_snapshots_for_encounter(self, encounter: Encounter) -> list["ClinicalTemplateSnapshot"]:
        """Get all template snapshots for an encounter."""
        from hmis.apps.clinical_templates.models import ClinicalTemplateSnapshot

        return list(
            ClinicalTemplateSnapshot.objects.filter(encounter=encounter).order_by("-created_at")
        )

    def generate_pdf(self, snapshot: "ClinicalTemplateSnapshot") -> bytes:
        """
        Generate a PDF document from a snapshot.

        This is a placeholder - actual PDF generation would use
        a library like reportlab or weasyprint.

        Args:
            snapshot: The snapshot to generate PDF from

        Returns:
            PDF bytes
        """
        # Placeholder for PDF generation
        # In production, use reportlab, weasyprint, or similar
        raise NotImplementedError("PDF generation not yet implemented")


# =============================================================================
# Convenience Functions
# =============================================================================


def populate_template_from_encounter(
    template: ClinicalTemplate,
    encounter: Encounter,
    existing_data: dict | None = None,
) -> dict[str, Any]:
    """
    Convenience function to populate template from encounter.

    Args:
        template: The clinical template
        encounter: The encounter with data
        existing_data: Existing template data to preserve

    Returns:
        Populated template data dict
    """
    synchronizer = TemplateDataSynchronizer()
    return synchronizer.populate_from_encounter(
        template=template,
        encounter=encounter,
        existing_data=existing_data,
    )


def sync_template_to_encounter(
    template_data: dict[str, Any],
    encounter: Encounter,
) -> Encounter:
    """
    Convenience function to sync template data to encounter.

    Args:
        template_data: The template data to sync
        encounter: The encounter to update

    Returns:
        Updated encounter
    """
    synchronizer = TemplateDataSynchronizer()
    return synchronizer.sync_to_encounter(
        template_data=template_data,
        encounter=encounter,
    )
