# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for organization defaults and facility overrides for vaccine billing.

Run with: poetry run pytest tests/immunizations/test_vaccine_billing_config.py -v
Inputs: global vaccine definitions, organization defaults, and facility overrides.
"""

from decimal import Decimal

import pytest

from hmis.apps.billing.models import Service, ServiceCategory
from hmis.apps.immunizations.models import (
    FacilityVaccineConfig,
    OrganizationVaccineConfig,
    VaccineDefinition,
)
from hmis.apps.immunizations.services.vaccine_billing import resolve_vaccine_billing


@pytest.mark.django_db
class TestVaccineBillingConfiguration:
    """Verify scoped vaccine billing configuration precedence and isolation."""

    def test_facility_override_precedes_organization_default(
        self, sample_facility, sample_organization, test_user
    ):
        """A facility's configured service and price override organization defaults."""
        category = ServiceCategory.objects.create(
            facility=sample_facility,
            name="Immunization",
            code="IMM",
        )
        service = Service.objects.create(
            facility=sample_facility,
            category=category,
            code="BCG",
            name="BCG Vaccination",
            unit_price=Decimal("350.00"),
            created_by=test_user,
        )
        vaccine = VaccineDefinition.objects.create(code="BCG", name="BCG")
        OrganizationVaccineConfig.objects.create(
            organization=sample_organization,
            vaccine=vaccine,
            is_enabled=True,
            base_fee=Decimal("200.00"),
            sha_tariff_code="ORG-BCG",
        )
        FacilityVaccineConfig.objects.create(
            facility=sample_facility,
            vaccine=vaccine,
            is_offered=True,
            billing_service=service,
            base_fee=Decimal("300.00"),
            sha_tariff_code="FAC-BCG",
        )

        resolved = resolve_vaccine_billing(sample_facility, vaccine)

        assert resolved.is_offered is True
        assert resolved.service == service
        assert resolved.unit_price == Decimal("350.00")
        assert resolved.sha_tariff_code == "FAC-BCG"

    def test_unconfigured_vaccine_is_not_offered(self, sample_facility):
        """Global clinical reference data does not make a vaccine billable by itself."""
        vaccine = VaccineDefinition.objects.create(code="MMR", name="MMR")

        resolved = resolve_vaccine_billing(sample_facility, vaccine)

        assert resolved.is_offered is False
        assert resolved.service is None
        assert resolved.unit_price is None
