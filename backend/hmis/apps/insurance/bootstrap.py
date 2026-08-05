"""Bootstrap helpers for HealthCloud insurance defaults."""

from __future__ import annotations

from collections.abc import Iterable

from hmis.apps.core.models import Facility, Organization
from hmis.apps.insurance.models import InsuranceProvider, InsuranceProviderConfig
from hmis.apps.insurance.payer_mappings import infer_healthcloud_payer_slade_code

SLADE_DEFAULT_PROVIDERS = [
    {"name": "Jubilee Health Insurance Limited", "code": "JUBILEE"},
    {"name": "APA Insurance Company", "code": "APA"},
    {"name": "Madison General Insurance Kenya", "code": "MADISON"},
    {"name": "Britam General Insurance", "code": "BRITAM"},
    {"name": "Minet Insurance Brokers Limited", "code": "MINET"},
    {"name": "Savannah Informatics Insurance Scheme", "code": "SAVANNAH"},
    {"name": "GNRSH Insurance Scheme", "code": "GNRSH"},
]


def seed_slade_defaults(
    *,
    organization: Organization,
    facilities: Iterable[Facility] | None = None,
    create_provider_configs: bool = True,
) -> dict[str, int]:
    created_providers = 0
    updated_providers = 0
    created_configs = 0
    updated_configs = 0

    target_facilities = list(facilities or [])
    if create_provider_configs and not target_facilities:
        target_facilities = list(Facility.objects.filter(organization=organization, is_active=True))

    for row in SLADE_DEFAULT_PROVIDERS:
        provider, created = InsuranceProvider.objects.get_or_create(
            organization=organization,
            code=row["code"],
            defaults={
                "name": row["name"],
                "provider_type": InsuranceProvider.ProviderType.PRIVATE,
                "status": InsuranceProvider.Status.ACTIVE,
                "api_integration_enabled": True,
            },
        )
        if created:
            created_providers += 1
        else:
            changed = []
            if provider.name != row["name"]:
                provider.name = row["name"]
                changed.append("name")
            if not provider.api_integration_enabled:
                provider.api_integration_enabled = True
                changed.append("api_integration_enabled")
            if changed:
                provider.save(update_fields=[*changed, "updated_at"])
                updated_providers += 1

        if not create_provider_configs:
            continue

        payer_code = infer_healthcloud_payer_slade_code(provider)
        for facility in target_facilities:
            config, cfg_created = InsuranceProviderConfig.objects.get_or_create(
                organization=organization,
                facility=facility,
                provider=provider,
                defaults={
                    "api_enabled": True,
                    "healthcloud_enabled": True,
                    "api_auth_type": InsuranceProviderConfig.ApiAuthType.OAUTH2,
                    "submission_format": InsuranceProviderConfig.SubmissionFormat.API,
                    "auth_base_url": "https://accounts.multitenant.slade360.co.ke",
                    "provider_edi_base_url": "https://provider-edi-api.multitenant.slade360.co.ke/v1",
                    "provider_is_base_url": "https://is-api.multitenant.slade360.co.ke/v1",
                    "api_base_url": "https://provider-edi-api.multitenant.slade360.co.ke/v1",
                    "payer_slade_code": payer_code,
                    "require_visit_authorization": True,
                    "require_balance_reservation": True,
                },
            )
            if cfg_created:
                created_configs += 1
            else:
                changed = []
                if config.payer_slade_code is None and payer_code is not None:
                    config.payer_slade_code = payer_code
                    changed.append("payer_slade_code")
                if not config.api_enabled:
                    config.api_enabled = True
                    changed.append("api_enabled")
                if not config.healthcloud_enabled:
                    config.healthcloud_enabled = True
                    changed.append("healthcloud_enabled")
                if changed:
                    config.save(update_fields=[*changed, "updated_at"])
                    updated_configs += 1

    return {
        "created_providers": created_providers,
        "updated_providers": updated_providers,
        "created_configs": created_configs,
        "updated_configs": updated_configs,
    }
