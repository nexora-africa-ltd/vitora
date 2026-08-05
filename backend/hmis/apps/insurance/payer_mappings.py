"""Known HealthCloud payer code mappings."""

from __future__ import annotations

from typing import Any

HEALTHCLOUD_PAYER_CODES_BY_PROVIDER_NAME = {
    "jubilee health insurance limited": 457,
    "apa insurance company": 2001,
    "madison general insurance kenya": 2011,
    "britam general insurance": 2002,
    "minet insurance brokers limited": 2020,
    "savannah informatics insurance scheme": 2023,
    "gnrsh insurance scheme": 2022,
}

HEALTHCLOUD_PAYER_CODES_BY_PROVIDER_CODE = {
    "JUBILEE": 457,
    "APA": 2001,
    "MADISON": 2011,
    "BRITAM": 2002,
    "MINET": 2020,
    "SAVANNAH": 2023,
    "GNRSH": 2022,
}


def infer_healthcloud_payer_slade_code(provider: Any) -> int | None:
    """Return mapped HealthCloud payer code for a provider, if known."""
    code = str(getattr(provider, "code", "") or "").strip().upper()
    if code and code in HEALTHCLOUD_PAYER_CODES_BY_PROVIDER_CODE:
        return HEALTHCLOUD_PAYER_CODES_BY_PROVIDER_CODE[code]

    name = str(getattr(provider, "name", "") or "").strip().lower()
    if not name:
        return None
    return HEALTHCLOUD_PAYER_CODES_BY_PROVIDER_NAME.get(name)
