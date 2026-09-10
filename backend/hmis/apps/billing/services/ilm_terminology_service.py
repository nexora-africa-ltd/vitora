# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""ILM clinical terminology lookups for concept and mapping validation.

Use :class:`IlmTerminologyService` from authenticated SHA ILM views. Configuration
comes from ``ILM_TERMINOLOGY_OWNER``, ``ILM_TERMINOLOGY_SOURCES``, and
``ILM_TERMINOLOGY_COLLECTION``; an owner and exactly one scope are required.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from django.conf import settings

from .dha_errors import DHAValidationError
from .ilm_client import IlmClient

CONCEPTS_PATH = "/api/v1/clinical/concepts"
MAPPINGS_PATH = "/api/v1/clinical/concepts/mappings"


class IlmTerminologyConfigurationError(ValueError):
    """Raised when required terminology provenance is absent or ambiguous."""


class IlmTerminologyService:
    """Proxy and validation service for DHA ILM clinical terminology endpoints."""

    def __init__(self, client: IlmClient | None = None) -> None:
        self.client = client or IlmClient()

    def list_concepts(
        self,
        *,
        query: Mapping[str, Any] | None = None,
        provenance: Mapping[str, Any] | None = None,
    ) -> Any:
        params = self._params(query=query, provenance=provenance)
        return self.client.get(CONCEPTS_PATH, params=params).json

    def configured_provenance(self) -> dict[str, str]:
        """Return the configured non-secret terminology scope after validation."""
        return self._params(query=None, provenance=None)

    def list_mappings(
        self,
        *,
        query: Mapping[str, Any] | None = None,
        provenance: Mapping[str, Any] | None = None,
    ) -> Any:
        params = self._params(query=query, provenance=provenance, require_sources=True)
        return self.client.get(MAPPINGS_PATH, params=params).json

    def validate_concept_code(
        self, code: str, *, provenance: Mapping[str, Any] | None = None
    ) -> None:
        payload = self.list_concepts(query={"code": code}, provenance=provenance)
        if not self._contains_code(payload, code):
            raise DHAValidationError(
                f"Generic concept code '{code}' was not found in the supplied terminology scope."
            )

    @staticmethod
    def _contains_code(payload: Any, code: str) -> bool:
        records = payload.get("results", payload) if isinstance(payload, Mapping) else payload
        if not isinstance(records, list):
            records = [records]
        return any(
            isinstance(record, Mapping) and str(record.get("code", "")) == code
            for record in records
        )

    @staticmethod
    def _params(
        *,
        query: Mapping[str, Any] | None,
        provenance: Mapping[str, Any] | None,
        require_sources: bool = False,
    ) -> dict[str, Any]:
        supplied = provenance or {}
        owner = str(supplied.get("owner") or getattr(settings, "ILM_TERMINOLOGY_OWNER", "")).strip()
        sources = str(
            supplied.get("sources") or getattr(settings, "ILM_TERMINOLOGY_SOURCES", "")
        ).strip()
        collection = str(
            supplied.get("collection") or getattr(settings, "ILM_TERMINOLOGY_COLLECTION", "")
        ).strip()
        if not owner:
            raise IlmTerminologyConfigurationError("ILM terminology owner is required.")
        if require_sources and not sources:
            raise IlmTerminologyConfigurationError("ILM terminology mappings require sources.")
        if bool(sources) == bool(collection):
            raise IlmTerminologyConfigurationError(
                "ILM terminology requires exactly one of sources or collection."
            )
        params = (
            {"owner": owner, "sources": sources}
            if sources
            else {"owner": owner, "collection": collection}
        )
        # Terminology scope is deployment-controlled and cannot be replaced by
        # arbitrary proxy query parameters.
        params.update(
            {
                key: value
                for key, value in (query or {}).items()
                if key not in {"owner", "sources", "collection"} and value not in (None, "")
            }
        )
        return params
