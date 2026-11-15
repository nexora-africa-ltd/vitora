# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Test facility-primary-key selection for procedure catalogue seeding.

Run: ``poetry run pytest tests/procedures/test_seed_procedure_catalog_command.py -q``.
Inputs: a facility fixture and management-command ``--facility-id`` argument.
"""

import pytest  # type: ignore
from django.core.management import call_command


@pytest.mark.django_db
def test_seed_command_accepts_facility_primary_key(sample_facility, capsys):
    """The seed command targets an explicit internal facility ID."""
    call_command(
        "seed_procedure_catalog",
        "--facility-id",
        str(sample_facility.id),
        "--dry-run",
    )

    assert f"facility={sample_facility.id}" in capsys.readouterr().out


@pytest.mark.django_db
def test_seed_command_creates_a_facility_specific_catalogue_with_ichi_mappings(
    sample_facility, sample_organization, sample_county, sample_sub_county
):
    """The DHA-derived ICHI catalogue can be seeded independently per facility."""
    from hmis.apps.core.models import Facility
    from hmis.apps.procedures.models import ProcedureCatalog

    other_facility = Facility.objects.create(
        organization=sample_organization,
        name="Second Test Health Centre",
        mfl_code="99998",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )
    call_command("seed_procedure_catalog", "--facility-id", str(other_facility.id))

    seeded = ProcedureCatalog.objects.get(facility=other_facility, code="KAE.ML.AC")
    assert seeded.name == "Root canal therapy with irrigation"
    assert seeded.ichi_code == "KAE.ML.AC"
    assert seeded.ichi_owner == "WHO"
    assert seeded.ichi_source == "ICHI"
    assert seeded.consent_required is False
    assert ProcedureCatalog.objects.filter(facility=other_facility).count() == 183


@pytest.mark.django_db
def test_procedure_code_is_unique_per_facility(
    sample_facility, sample_organization, sample_county, sample_sub_county
):
    """The same procedure code may be reused by distinct facilities only."""
    from django.core.exceptions import ValidationError

    from hmis.apps.core.models import Facility
    from hmis.apps.procedures.models import ProcedureCatalog

    other_facility = Facility.objects.create(
        organization=sample_organization,
        name="Second Test Health Centre",
        mfl_code="99998",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )
    ProcedureCatalog.objects.create(
        code="PROC-SHARED-001",
        name="Procedure A",
        facility=sample_facility,
        organization=sample_organization,
    )
    other = ProcedureCatalog(
        code="PROC-SHARED-001",
        name="Procedure B",
        facility=other_facility,
        organization=sample_organization,
    )
    other.full_clean()
    other.save()

    duplicate = ProcedureCatalog(
        code="PROC-SHARED-001",
        name="Procedure C",
        facility=sample_facility,
        organization=sample_organization,
    )
    with pytest.raises(ValidationError):
        duplicate.full_clean()


@pytest.mark.django_db
def test_seed_command_reconciles_existing_canonical_procedures(sample_facility):
    """A repeat seed updates changed canonical fields without creating duplicates."""
    from hmis.apps.procedures.models import ProcedureCatalog
    from hmis.apps.procedures.services import seed_ichi_catalog_for_facility

    ProcedureCatalog.objects.create(
        code="KAE.ML.AC",
        name="Outdated title",
        category=ProcedureCatalog.Category.OTHER,
        body_system=ProcedureCatalog.BodySystem.GENERAL,
        consent_required=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )

    first_result = seed_ichi_catalog_for_facility(sample_facility)
    seeded = ProcedureCatalog.objects.get(facility=sample_facility, code="KAE.ML.AC")
    second_result = seed_ichi_catalog_for_facility(sample_facility)

    assert first_result["created"] == 182
    assert first_result["updated"] == 1
    assert seeded.name == "Root canal therapy with irrigation"
    assert seeded.category == ProcedureCatalog.Category.DENTAL
    assert seeded.body_system == ProcedureCatalog.BodySystem.DENTAL
    assert seeded.consent_required is False
    assert second_result["created"] == 0
    assert second_result["updated"] == 0
    assert second_result["skipped"] == 183
