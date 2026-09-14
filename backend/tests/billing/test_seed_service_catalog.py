# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for the facility-targeted billing service catalogue seeder.

Run with: poetry run pytest tests/billing/test_seed_service_catalog.py -v
Inputs: Django management command ``seed_service_catalog --facility <id|mfl_code>``.
"""

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from hmis.apps.billing.models import Service, ServiceCategory


@pytest.mark.django_db
class TestSeedServiceCatalog:
    """Verify catalogue seed data remains isolated to the selected facility."""

    def test_seeds_services_for_selected_facility_only(self, sample_facility, monkeypatch):
        """MFL code selects the facility that owns seeded categories and services."""
        from hmis.apps.billing.management.commands import seed_service_catalog

        monkeypatch.setattr(
            seed_service_catalog,
            "CATEGORIES",
            [{"code": "CONS", "name": "Consultation", "description": "Consultations"}],
        )
        monkeypatch.setattr(
            seed_service_catalog,
            "SERVICES",
            [
                {
                    "code": "CONS-GEN",
                    "name": "General Consultation",
                    "category_code": "CONS",
                    "price": 500,
                    "sha_code": "SHA-CONS-001",
                }
            ],
        )

        call_command("seed_service_catalog", facility=sample_facility.mfl_code)

        category = ServiceCategory.objects.get(facility=sample_facility, code="CONS")
        service = Service.objects.get(facility=sample_facility, code="CONS-GEN")
        assert service.category_id == category.id
        assert service.sha_code == "SHA-CONS-001"

    def test_requires_facility_identifier(self):
        """Global catalogue seeding is forbidden after facility scoping."""
        with pytest.raises(CommandError, match="--facility"):
            call_command("seed_service_catalog")

    def test_rejects_unknown_facility(self):
        """A typo must not create unowned categories or services."""
        with pytest.raises(CommandError, match="No facility found"):
            call_command("seed_service_catalog", facility="UNKNOWN")
