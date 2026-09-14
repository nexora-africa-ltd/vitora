# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Resolve effective vaccine availability and billing for a facility.

Import ``resolve_vaccine_billing(facility, vaccine)`` from billing workflows.
Inputs: a Facility and global VaccineDefinition instance.
"""

from dataclasses import dataclass
from decimal import Decimal

from hmis.apps.immunizations.models import FacilityVaccineConfig, OrganizationVaccineConfig


@dataclass(frozen=True)
class ResolvedVaccineBilling:
    """Effective facility billing configuration for one vaccine."""

    is_offered: bool
    service: object | None
    unit_price: Decimal | None
    sha_tariff_code: str


def resolve_vaccine_billing(facility, vaccine) -> ResolvedVaccineBilling:
    """Resolve facility override, then organization default, with no implicit offering."""
    facility_config = (
        FacilityVaccineConfig.objects.select_related("billing_service")
        .filter(
            facility=facility,
            vaccine=vaccine,
        )
        .first()
    )
    organization_config = OrganizationVaccineConfig.objects.filter(
        organization=facility.organization,
        vaccine=vaccine,
    ).first()

    is_offered = (
        facility_config.is_offered
        if facility_config and facility_config.is_offered is not None
        else bool(organization_config and organization_config.is_enabled)
    )
    if not is_offered:
        return ResolvedVaccineBilling(False, None, None, "")

    service = facility_config.billing_service if facility_config else None
    unit_price = service.unit_price if service and service.is_active else None
    if unit_price is None:
        unit_price = facility_config.base_fee if facility_config else None
    if unit_price is None and organization_config:
        unit_price = organization_config.base_fee

    sha_tariff_code = (facility_config.sha_tariff_code if facility_config else "") or (
        organization_config.sha_tariff_code if organization_config else ""
    )
    return ResolvedVaccineBilling(
        True, service if service and service.is_active else None, unit_price, sha_tariff_code
    )
