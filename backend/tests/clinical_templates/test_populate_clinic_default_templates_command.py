"""Tests for populate_clinic_default_templates management command.

Coverage:
- Command is registered
- Populates Clinic.default_clinical_template for existing clinics
- Dry-run mode does not persist changes
- Force mode overwrites existing defaults

This command is intended to backfill defaults for already-created clinics,
using the same best-fit mapping as ClinicVisit.start_consultation.
"""

from io import StringIO

import pytest  # type: ignore
from django.core.management import call_command, get_commands

from hmis.apps.clinical_templates.models import ClinicalTemplate
from hmis.apps.clinics.models import Clinic


@pytest.mark.django_db
class TestPopulateClinicDefaultTemplatesCommand:
    def test_command_is_registered(self):
        """Command should be discoverable by Django."""
        commands = get_commands()
        assert "populate_clinic_default_templates" in commands

    def test_populates_defaults_for_missing_clinics(self):
        """Should set default_clinical_template for clinics missing one."""
        opd_template = ClinicalTemplate.objects.create(
            name="General OPD Assessment",
            template_type="encounter",
            specialty="General Practice",
            description="",
            content={"title": "OPD", "version": "1.0", "sections": []},
            is_system=True,
            is_active=True,
        )
        cwc_template = ClinicalTemplate.objects.create(
            name="Child Wellness Check",
            template_type="encounter",
            specialty="Pediatrics",
            description="",
            content={"title": "CWC", "version": "1.0", "sections": []},
            is_system=True,
            is_active=True,
        )

        opd = Clinic.objects.create(name="OPD", clinic_type="GENERAL_OPD", code="OPD-001")
        cwc = Clinic.objects.create(name="CWC", clinic_type="CWC", code="CWC-001")

        assert opd.default_clinical_template is None
        assert cwc.default_clinical_template is None

        out = StringIO()
        call_command("populate_clinic_default_templates", stdout=out)

        opd.refresh_from_db()
        cwc.refresh_from_db()
        assert opd.default_clinical_template == opd_template
        assert cwc.default_clinical_template == cwc_template

        output = out.getvalue()
        assert "Updated" in output

    def test_dry_run_does_not_persist(self):
        """dry_run should report changes but not update rows."""
        ClinicalTemplate.objects.create(
            name="General OPD Assessment",
            template_type="encounter",
            specialty="General Practice",
            description="",
            content={"title": "OPD", "version": "1.0", "sections": []},
            is_system=True,
            is_active=True,
        )
        opd = Clinic.objects.create(name="OPD", clinic_type="GENERAL_OPD", code="OPD-002")

        out = StringIO()
        call_command("populate_clinic_default_templates", dry_run=True, stdout=out)

        opd.refresh_from_db()
        assert opd.default_clinical_template is None

        output = out.getvalue()
        assert "DRY RUN" in output

    def test_force_overwrites_existing_default(self):
        """force=True should overwrite an existing default template."""
        mapped = ClinicalTemplate.objects.create(
            name="General OPD Assessment",
            template_type="encounter",
            specialty="General Practice",
            description="",
            content={"title": "OPD", "version": "1.0", "sections": []},
            is_system=True,
            is_active=True,
        )
        existing = ClinicalTemplate.objects.create(
            name="Some Other Template",
            template_type="encounter",
            specialty="General",
            description="",
            content={"title": "Other", "version": "1.0", "sections": []},
            is_system=False,
            is_active=True,
        )
        clinic = Clinic.objects.create(name="OPD", clinic_type="GENERAL_OPD", code="OPD-003")
        clinic.default_clinical_template = existing
        clinic.save(update_fields=["default_clinical_template"])

        out = StringIO()
        call_command("populate_clinic_default_templates", force=True, stdout=out)

        clinic.refresh_from_db()
        assert clinic.default_clinical_template == mapped

        output = out.getvalue()
        assert "Overwritten" in output

    def test_dry_run_force_reports_overwritten_but_does_not_persist(self):
        """dry_run + force should count overwrites without saving."""
        mapped = ClinicalTemplate.objects.create(
            name="General OPD Assessment",
            template_type="encounter",
            specialty="General Practice",
            description="",
            content={"title": "OPD", "version": "1.0", "sections": []},
            is_system=True,
            is_active=True,
        )
        existing = ClinicalTemplate.objects.create(
            name="Some Other Template",
            template_type="encounter",
            specialty="General",
            description="",
            content={"title": "Other", "version": "1.0", "sections": []},
            is_system=False,
            is_active=True,
        )
        clinic = Clinic.objects.create(name="OPD", clinic_type="GENERAL_OPD", code="OPD-DRYRUN")
        clinic.default_clinical_template = existing
        clinic.save(update_fields=["default_clinical_template"])

        out = StringIO()
        call_command(
            "populate_clinic_default_templates",
            dry_run=True,
            force=True,
            stdout=out,
        )

        clinic.refresh_from_db()
        assert clinic.default_clinical_template == existing
        assert clinic.default_clinical_template != mapped

        output = out.getvalue()
        assert "DRY RUN" in output
        assert "Overwritten: 1" in output

    def test_missing_template_increments_counter(self):
        """Clinics without a matching template should be counted as missing."""
        Clinic.objects.create(name="Unknown", clinic_type="OTHER", code="OTHER-001")

        out = StringIO()
        call_command("populate_clinic_default_templates", stdout=out)

        output = out.getvalue()
        assert "Missing template: 1" in output
