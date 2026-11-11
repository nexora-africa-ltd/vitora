# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Controlled DHA terminology-source registry.

Use: call ``get_terminology_source("hpt")`` to resolve DHA provenance for
runtime lookups. Inputs are approved registry keys only, never client-supplied
owner/source values.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True)
class TerminologySource:
    """Immutable DHA terminology source configuration."""

    key: str
    display_name: str
    endpoint: str
    owner: str
    source: str | None
    collection: str | None

    def query_params(self) -> dict[str, str]:
        """Return the required DHA Clinical Concepts provenance parameters."""
        params = {"owner": self.owner}
        if self.source:
            params["source"] = self.source
        elif self.collection:
            params["collection"] = self.collection
        else:
            raise ValueError(f"Terminology source '{self.key}' has no source or collection.")
        return params


@lru_cache(maxsize=1)
def _sources() -> dict[str, TerminologySource]:
    registry_path = Path(__file__).resolve().parent.parent / "data" / "dha_terminology_sources.json"
    payload = json.loads(registry_path.read_text(encoding="utf-8"))
    return {key: TerminologySource(key=key, **config) for key, config in payload["sources"].items()}


def get_terminology_source(key: str) -> TerminologySource:
    """Return an approved source or raise a clear error for unsupported keys."""
    try:
        return _sources()[key]
    except KeyError as exc:
        raise ValueError(f"Unsupported DHA terminology source: {key}") from exc
