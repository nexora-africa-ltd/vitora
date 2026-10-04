# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for consolidating legacy MCH immunizations into the standalone module.

Run with: poetry run pytest tests/immunizations/test_mch_immunization_consolidation.py --no-cov
Inputs: MCH legacy models, standalone immunization models, and management commands.
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.core.management import call_command

from hmis.apps.immunizations.models import AEFI, ImmunizationRecord, VaccineDefinition
from hmis.apps.mch.models import AEFI as LegacyAEFI
from hmis.apps.mch.models import ImmunizationRecord as LegacyImmunizationRecord
from hmis.apps.mch.models import Vaccine as LegacyVaccine
from hmis.apps.mch.signals import auto_generate_immunization_schedule

pytestmark = pytest.mark.django_db


class TestMCHImmunizationConsolidation:
    """MCH compatibility paths must not create a second immunization dataset."""

    def test_patient_schedule_generation_uses_standalone_records_only(self, sample_patient):
        """MCH patient scheduling must create tenant-scoped standalone KEPI records."""
        sample_patient.date_of_birth = date.today()
        sample_patient.save(update_fields=["date_of_birth"])
        VaccineDefinition.objects.create(
            code="CONSOLIDATION-BCG",
            name="Consolidation BCG",
            program="KEPI",
            standard_age_days=0,
            dose_number=1,
        )
        LegacyVaccine.objects.create(
            code="CONSOLIDATION-LEGACY",
            name="Legacy BCG",
            standard_age_days=0,
        )

        auto_generate_immunization_schedule(type(sample_patient), sample_patient, created=True)

        assert ImmunizationRecord.objects.filter(
            patient=sample_patient,
            vaccine__code="CONSOLIDATION-BCG",
        ).exists()
        assert not LegacyImmunizationRecord.objects.filter(patient=sample_patient).exists()

    def test_hub_initialization_does_not_seed_legacy_kepi_catalogue(self):
        """Fresh hubs must seed only the standalone vaccine catalogue."""
        from hmis.apps.core.management.commands.initialize_hub import SEED_STEPS

        assert "seed_vaccines" in {step.command for step in SEED_STEPS}
        assert "seed_kepi_schedule" not in {step.command for step in SEED_STEPS}


class TestMCHLegacyImmunizationMigration:
    """The explicit migration command preserves legacy records without duplication."""

    def test_command_migrates_legacy_records_and_aefi_idempotently(self, sample_patient, test_user):
        """Legacy KEPI data should map to the standalone models exactly once."""
        vaccine = LegacyVaccine.objects.create(
            code="LEGACY-PENTA-1",
            name="Legacy Pentavalent 1",
            description="Legacy catalogue entry",
            disease_target="Diphtheria",
            standard_age_days=42,
            route="IM",
            dose_number=1,
            series_name="Pentavalent",
        )
        legacy_record = LegacyImmunizationRecord.objects.create(
            patient=sample_patient,
            vaccine=vaccine,
            scheduled_date=date.today() + timedelta(days=42),
            administered_date=date.today(),
            status="ADMINISTERED",
            dose_number=1,
            batch_number="BATCH-1",
            lot_number="LOT-1",
            administered_by=test_user,
            notes="Migrated record",
        )
        LegacyAEFI.objects.create(
            immunization_record=legacy_record,
            event_type="SYSTEMIC_REACTION",
            severity="MODERATE",
            description="Fever after vaccination",
            event_date=date.today(),
            outcome="RECOVERED",
            investigated_by=test_user,
        )

        call_command("migrate_mch_immunizations")
        call_command("migrate_mch_immunizations")

        vaccine_definition = VaccineDefinition.objects.get(code="LEGACY-PENTA-1")
        record = ImmunizationRecord.objects.get(
            patient=sample_patient,
            vaccine=vaccine_definition,
            dose_number=1,
        )
        assert record.status == "ADMINISTERED"
        assert record.batch_number == "BATCH-1"
        assert record.administered_by == test_user
        assert record.facility == sample_patient.registered_at_facility
        assert (
            AEFI.objects.filter(
                immunization_record=record,
                event_date=date.today(),
                description="Fever after vaccination",
            ).count()
            == 1
        )
