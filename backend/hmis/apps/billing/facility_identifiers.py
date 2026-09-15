"""Facility identifier resolution helpers for DHA/SHA integrations.

This module centralizes FR code resolution so all DHA-facing call sites use
the same precedence chain and can report where the value came from.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FRCodeResolution:
    """Resolved Facility Registry (FR) code with provenance metadata."""

    value: str
    source: str
    identifier_type: str = "fr-code"

    @property
    def is_resolved(self) -> bool:
        return bool(self.value)


def resolve_fr_code(
    facility: Any = None,
    *,
    allow_settings_fallback: bool = True,
) -> FRCodeResolution:
    """Resolve a facility FR code using a single canonical precedence chain.

    Precedence:
      1. ``facility.billing_config.sha_facility_fr_code``
      2. ``facility.dha_fr_code``
      3. ``settings.SHA_FACILITY_FR_CODE`` (optional)
    """

    if facility is not None:
        try:
            billing_config = getattr(facility, "billing_config", None)
            billing_fr = str(
                getattr(billing_config, "sha_facility_fr_code", "") if billing_config else ""
            ).strip()
        except (AttributeError, TypeError, ValueError) as exc:
            logger.warning(
                "Unable to read billing-config FR code; continuing with fallback chain",
                extra={"error_type": type(exc).__name__},
            )
            billing_fr = ""
        if billing_fr:
            return FRCodeResolution(value=billing_fr, source="billing_config")

        facility_fr = str(getattr(facility, "dha_fr_code", "") or "").strip()
        if facility_fr:
            return FRCodeResolution(value=facility_fr, source="facility_dha_cache")

    if allow_settings_fallback:
        settings_fr = str(getattr(settings, "SHA_FACILITY_FR_CODE", "") or "").strip()
        if settings_fr:
            return FRCodeResolution(value=settings_fr, source="settings")

    return FRCodeResolution(value="", source="none")
