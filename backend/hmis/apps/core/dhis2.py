"""
DHIS2 credential resolution for multi-facility / multi-org deployments.

Provides ``resolve_dhis2_credentials(facility)`` which returns a
``DHIS2Credentials`` dataclass with base_url, username, password,
org_unit and environment — resolved from the ``DHIS2Config`` model
first, falling back to global Django settings for backward
compatibility with env-var-only setups.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DHIS2Credentials:
    """Resolved DHIS2 connection credentials for a specific facility."""

    base_url: str
    username: str
    password: str
    org_unit: str
    environment: str
    source: str  # "db" or "settings"

    @property
    def api_url(self) -> str:
        return self.base_url.rstrip("/")

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url and self.username and self.password)


def resolve_dhis2_credentials(facility) -> DHIS2Credentials:
    """
    Resolve DHIS2 credentials for a facility.

    Resolution order:
    1. ``DHIS2Config`` linked to the facility's organization (DB-stored, encrypted).
    2. Global Django settings (env vars — backward-compatible fallback).

    The ``org_unit`` is always taken from ``facility.dhis2_org_unit`` if set,
    falling back to ``settings.DHIS2_ORG_UNIT``.
    """
    import os

    from hmis.apps.core.models import DHIS2Config

    # Resolve org_unit: always per-facility first, then global fallback
    org_unit = ""
    if facility:
        org_unit = getattr(facility, "dhis2_org_unit", "") or ""
    if not org_unit:
        org_unit = getattr(settings, "DHIS2_ORG_UNIT", "")

    # Try DB config first
    config = DHIS2Config.get_for_facility(facility) if facility else None
    if config:
        return DHIS2Credentials(
            base_url=config.api_url,
            username=config.username,
            password=config.get_password(),
            org_unit=org_unit,
            environment=config.environment,
            source="db",
        )

    # Fallback to global settings
    return DHIS2Credentials(
        base_url=getattr(settings, "DHIS2_API_URL", ""),
        username=getattr(settings, "DHIS2_USERNAME", ""),
        password=getattr(settings, "DHIS2_PASSWORD", ""),
        org_unit=org_unit,
        environment=os.environ.get("DHIS2_ENVIRONMENT", "local"),
        source="settings",
    )
