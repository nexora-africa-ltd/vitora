# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Hub workflow capability registry used by API guards and hub health.

Use get_hub_capability_for_path() to enforce local, cloud-only, and unavailable
workflow boundaries in hub mode. Inputs are API request paths and module keys.
"""

from enum import StrEnum


class HubCapability(StrEnum):
    """Execution modes available to a facility hub."""

    LOCAL_SYNCED = "LOCAL_SYNCED"
    CLOUD_ONLY = "CLOUD_ONLY"
    UNAVAILABLE = "UNAVAILABLE"


HUB_MODULE_CAPABILITIES: dict[str, HubCapability] = {
    "dashboard": HubCapability.LOCAL_SYNCED,
    "checkin": HubCapability.LOCAL_SYNCED,
    "patients": HubCapability.LOCAL_SYNCED,
    "triage": HubCapability.LOCAL_SYNCED,
    "clinics": HubCapability.LOCAL_SYNCED,
    "encounters": HubCapability.LOCAL_SYNCED,
    "procedures": HubCapability.LOCAL_SYNCED,
    "inpatient": HubCapability.LOCAL_SYNCED,
    "pharmacy": HubCapability.LOCAL_SYNCED,
    "laboratory": HubCapability.LOCAL_SYNCED,
    "billing": HubCapability.LOCAL_SYNCED,
    "inventory": HubCapability.LOCAL_SYNCED,
    "scheduling": HubCapability.LOCAL_SYNCED,
    "immunizations": HubCapability.LOCAL_SYNCED,
    "mch": HubCapability.LOCAL_SYNCED,
    "blood_bank": HubCapability.LOCAL_SYNCED,
    "imaging": HubCapability.LOCAL_SYNCED,
    "surveillance": HubCapability.CLOUD_ONLY,
    "analytics": HubCapability.CLOUD_ONLY,
    "moh_reporting": HubCapability.CLOUD_ONLY,
    "insurance": HubCapability.CLOUD_ONLY,
    "cds": HubCapability.CLOUD_ONLY,
    "ai": HubCapability.CLOUD_ONLY,
    "quality": HubCapability.UNAVAILABLE,
    "theatre": HubCapability.UNAVAILABLE,
    "allied_health": HubCapability.UNAVAILABLE,
    "emergency": HubCapability.UNAVAILABLE,
    "dialysis": HubCapability.UNAVAILABLE,
    "last_office": HubCapability.UNAVAILABLE,
    "admin": HubCapability.CLOUD_ONLY,
}


HUB_PATH_CAPABILITIES: tuple[tuple[str, HubCapability], ...] = (
    ("/api/surveillance/", HubCapability.CLOUD_ONLY),
    ("/api/analytics/", HubCapability.CLOUD_ONLY),
    ("/api/moh-reports/", HubCapability.CLOUD_ONLY),
    ("/api/ai/", HubCapability.CLOUD_ONLY),
    ("/api/sha/", HubCapability.CLOUD_ONLY),
    ("/api/insurance/", HubCapability.CLOUD_ONLY),
    ("/api/quality/", HubCapability.UNAVAILABLE),
    ("/api/theatre/", HubCapability.UNAVAILABLE),
    ("/api/allied-health/", HubCapability.UNAVAILABLE),
    ("/api/emergency/", HubCapability.UNAVAILABLE),
    ("/api/dialysis/", HubCapability.UNAVAILABLE),
    ("/api/last-office/", HubCapability.UNAVAILABLE),
)


def get_hub_capability_for_path(path: str) -> HubCapability | None:
    """Return the explicit hub capability for an API path, if restricted."""
    for prefix, capability in HUB_PATH_CAPABILITIES:
        if path.startswith(prefix):
            return capability
    return None


def hub_capabilities_payload() -> dict[str, str]:
    """Return serializable module capability states for hub clients."""
    return {module: capability.value for module, capability in HUB_MODULE_CAPABILITIES.items()}
