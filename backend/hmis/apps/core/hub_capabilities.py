# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Authoritative hub/cloud workflow routing policy.

The registry below is the sole source for hub guards and the versioned routing
manifest returned by ``GET /api/hub/health/``.  Frontends must consume that
manifest rather than maintaining their own module, route, or API-prefix maps.
"""

from dataclasses import dataclass
from enum import StrEnum


class HubCapability(StrEnum):
    """Execution modes available to a facility hub."""

    LOCAL_SYNCED = "LOCAL_SYNCED"
    CLOUD_ONLY = "CLOUD_ONLY"
    UNAVAILABLE = "UNAVAILABLE"


@dataclass(frozen=True)
class HubWorkflowPolicy:
    """Routing policy for one user-facing workflow and its transport prefixes."""

    key: str
    capability: HubCapability
    frontend_routes: tuple[str, ...] = ()
    api_prefixes: tuple[str, ...] = ()
    websocket_prefixes: tuple[str, ...] = ()

    @property
    def routing_policy(self) -> str:
        """Return the transport destination derived from the capability."""
        return {
            HubCapability.LOCAL_SYNCED: "HUB",
            HubCapability.CLOUD_ONLY: "CLOUD",
            HubCapability.UNAVAILABLE: "BLOCK",
        }[self.capability]

    def payload(self) -> dict[str, object]:
        """Return the stable manifest representation consumed by desktop clients."""
        return {
            "key": self.key,
            "capability": self.capability.value,
            "routing_policy": self.routing_policy,
            "frontend_routes": list(self.frontend_routes),
            "api_prefixes": list(self.api_prefixes),
            "websocket_prefixes": list(self.websocket_prefixes),
        }


def _policy(
    key: str,
    capability: HubCapability,
    routes: tuple[str, ...] = (),
    api: tuple[str, ...] = (),
    websockets: tuple[str, ...] = (),
) -> HubWorkflowPolicy:
    return HubWorkflowPolicy(key, capability, routes, api, websockets)


HUB_WORKFLOW_POLICIES: tuple[HubWorkflowPolicy, ...] = (
    _policy("dashboard", HubCapability.LOCAL_SYNCED, ("/dashboard",), api=("/api/dashboard/",)),
    _policy("checkin", HubCapability.LOCAL_SYNCED, ("/patients/checkin",)),
    _policy("patients", HubCapability.LOCAL_SYNCED, ("/patients",), ("/api/patients/",)),
    _policy("triage", HubCapability.LOCAL_SYNCED, ("/triage",), ("/api/triage/",)),
    _policy("clinics", HubCapability.LOCAL_SYNCED, ("/clinics",), ("/api/clinics/",)),
    _policy("encounters", HubCapability.LOCAL_SYNCED, ("/encounters",), ("/api/encounters/",)),
    _policy("procedures", HubCapability.LOCAL_SYNCED, ("/procedures",), ("/api/procedures/",)),
    _policy(
        "inpatient",
        HubCapability.LOCAL_SYNCED,
        ("/inpatient", "/admissions", "/wards"),
        ("/api/inpatient/",),
    ),
    _policy("pharmacy", HubCapability.LOCAL_SYNCED, ("/pharmacy",), ("/api/pharmacy/",)),
    _policy("laboratory", HubCapability.LOCAL_SYNCED, ("/laboratory",), ("/api/laboratory/",)),
    _policy(
        "billing",
        HubCapability.LOCAL_SYNCED,
        ("/billing", "/transactions", "/finance"),
        ("/api/billing/",),
        websockets=("/ws/billing/",),
    ),
    _policy("inventory", HubCapability.LOCAL_SYNCED, ("/inventory",), ("/api/inventory/",)),
    _policy("scheduling", HubCapability.LOCAL_SYNCED, ("/scheduling",), ("/api/scheduling/",)),
    _policy(
        "immunizations", HubCapability.LOCAL_SYNCED, ("/immunizations",), ("/api/immunizations/",)
    ),
    _policy("mch", HubCapability.LOCAL_SYNCED, ("/mch",), ("/api/mch/",)),
    _policy("blood_bank", HubCapability.LOCAL_SYNCED, ("/blood-bank",), ("/api/blood-bank/",)),
    _policy("imaging", HubCapability.LOCAL_SYNCED, ("/imaging",), ("/api/imaging/",)),
    _policy(
        "emergency", HubCapability.LOCAL_SYNCED, ("/emergency",), websockets=("/ws/emergency/",)
    ),
    _policy(
        "surveillance",
        HubCapability.CLOUD_ONLY,
        ("/surveillance",),
        ("/api/surveillance/",),
        ("/ws/surveillance/",),
    ),
    _policy("analytics", HubCapability.CLOUD_ONLY, ("/analytics",), ("/api/analytics/",)),
    _policy("moh_reporting", HubCapability.CLOUD_ONLY, ("/reports/moh",), ("/api/moh-reports/",)),
    _policy(
        "insurance",
        HubCapability.CLOUD_ONLY,
        ("/insurance",),
        ("/api/insurance/", "/api/sha/"),
        ("/ws/billing/*/sha-claims/",),
    ),
    _policy("cds", HubCapability.CLOUD_ONLY, ("/cds",), ("/api/cds/",)),
    _policy("ai", HubCapability.CLOUD_ONLY, ("/ai",), ("/api/ai/",)),
    _policy("quality", HubCapability.CLOUD_ONLY, ("/quality",), ("/api/quality/",)),
    _policy("theatre", HubCapability.CLOUD_ONLY, ("/theatre",), ("/api/theatre/",)),
    _policy(
        "allied_health",
        HubCapability.CLOUD_ONLY,
        ("/allied-health",),
        (
            "/api/allied-health/",
            "/api/physiotherapy/",
            "/api/nutrition/",
            "/api/occupational-therapy/",
            "/api/social-work/",
            "/api/counselling/",
        ),
    ),
    _policy("dialysis", HubCapability.CLOUD_ONLY, ("/dialysis",), ("/api/dialysis/",)),
    _policy("last_office", HubCapability.CLOUD_ONLY, ("/last-office",), ("/api/death-records/",)),
    _policy("admin", HubCapability.CLOUD_ONLY, ("/admin",)),
)


HUB_MODULE_CAPABILITIES = {policy.key: policy.capability for policy in HUB_WORKFLOW_POLICIES}
HUB_PATH_CAPABILITIES = tuple(
    (prefix, policy.capability)
    for policy in HUB_WORKFLOW_POLICIES
    for prefix in policy.api_prefixes
)


def get_hub_capability_for_path(path: str) -> HubCapability | None:
    """Return the restricted API capability for a request path, if configured."""
    for prefix, capability in HUB_PATH_CAPABILITIES:
        if path.startswith(prefix):
            return capability
    return None


def hub_capabilities_payload() -> dict[str, str]:
    """Return legacy module capability states for existing hub clients."""
    return {module: capability.value for module, capability in HUB_MODULE_CAPABILITIES.items()}


def hub_routing_manifest_payload() -> dict[str, object]:
    """Return versioned routing metadata for desktop API, route, and WS resolvers."""
    return {"version": 1, "workflows": [policy.payload() for policy in HUB_WORKFLOW_POLICIES]}
