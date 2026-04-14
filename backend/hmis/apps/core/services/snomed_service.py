"""
SNOMED CT search service for Vitora HMIS.

Provides search against SNOMED CT International's Snowstorm API with
local SNOMEDConcept cache for offline fallback. Results from Snowstorm
are automatically cached in the local database.

Free for LMICs (Low and Middle Income Countries) including Kenya.
API docs: https://browser.ihtsdotools.org/snowstorm/snomed-ct/
"""

import logging
from dataclasses import dataclass

import requests  # type: ignore
from django.conf import settings
from django.db.models import Q

from hmis.apps.core.models import SNOMEDConcept

logger = logging.getLogger(__name__)

SNOWSTORM_BASE_URL = getattr(
    settings,
    "SNOMED_SNOWSTORM_URL",
    "https://browser.ihtsdotools.org/snowstorm/snomed-ct",
)
SNOMED_EDITION = getattr(settings, "SNOMED_EDITION", "MAIN")
SNOMED_VERSION = getattr(settings, "SNOMED_VERSION", "")


@dataclass
class SNOMEDSearchResult:
    """A single SNOMED CT search result."""

    concept_id: str
    display: str
    semantic_tag: str


class SNOMEDService:
    """Service for searching SNOMED CT concepts."""

    TIMEOUT = 10  # seconds

    def search(
        self,
        query: str,
        semantic_tag: str = "",
        limit: int = 20,
    ) -> list[SNOMEDSearchResult]:
        """
        Search SNOMED CT concepts by term.

        Tries Snowstorm API first, falls back to local cache on failure.
        Successful remote results are cached locally.

        Args:
            query: Search term (e.g., 'hypertension')
            semantic_tag: Optional filter (e.g., 'disorder', 'finding', 'procedure')
            limit: Maximum results to return

        Returns:
            List of SNOMEDSearchResult
        """
        if not query or len(query.strip()) < 2:
            return []

        query = query.strip()

        # Try remote Snowstorm API first
        try:
            results = self._search_snowstorm(query, semantic_tag, limit)
            if results:
                self._cache_results(results)
                return results
        except Exception:
            logger.warning("Snowstorm API unavailable, falling back to local cache")

        # Fallback to local cache
        return self._search_local(query, semantic_tag, limit)

    def lookup(self, concept_id: str) -> SNOMEDSearchResult | None:
        """
        Look up a single SNOMED CT concept by ID.

        Args:
            concept_id: SNOMED CT concept ID (e.g., '38341003')

        Returns:
            SNOMEDSearchResult or None if not found
        """
        # Check local cache first
        try:
            concept = SNOMEDConcept.objects.get(concept_id=concept_id, is_active=True)
            return SNOMEDSearchResult(
                concept_id=concept.concept_id,
                display=concept.display,
                semantic_tag=concept.semantic_tag,
            )
        except SNOMEDConcept.DoesNotExist:
            pass

        # Try remote
        try:
            return self._lookup_snowstorm(concept_id)
        except Exception:
            logger.warning("Snowstorm API unavailable for concept lookup %s", concept_id)
            return None

    def _search_snowstorm(
        self, query: str, semantic_tag: str, limit: int
    ) -> list[SNOMEDSearchResult]:
        """Search SNOMED CT via Snowstorm API."""
        branch = SNOMED_EDITION
        if SNOMED_VERSION:
            branch = f"{SNOMED_EDITION}/{SNOMED_VERSION}"

        url = f"{SNOWSTORM_BASE_URL}/browser/{branch}/descriptions"
        params: dict[str, str | int] = {
            "term": query,
            "active": "true",
            "conceptActive": "true",
            "limit": limit,
            "lang": "english",
            "groupByConcept": "true",
        }
        if semantic_tag:
            params["semanticTag"] = semantic_tag

        response = requests.get(url, params=params, timeout=self.TIMEOUT)
        response.raise_for_status()
        data = response.json()

        results: list[SNOMEDSearchResult] = []
        for item in data.get("items", []):
            concept = item.get("concept", {})
            fsn = concept.get("fsn", {})
            pt = concept.get("pt", {})

            # Extract semantic tag from FSN (e.g., "Hypertension (disorder)" -> "disorder")
            tag = ""
            fsn_term = fsn.get("term", "")
            if "(" in fsn_term and fsn_term.endswith(")"):
                tag = fsn_term[fsn_term.rfind("(") + 1 : -1]

            results.append(
                SNOMEDSearchResult(
                    concept_id=concept.get("conceptId", ""),
                    display=pt.get("term", fsn_term),
                    semantic_tag=tag,
                )
            )

        return results

    def _lookup_snowstorm(self, concept_id: str) -> SNOMEDSearchResult | None:
        """Look up a single concept via Snowstorm API."""
        branch = SNOMED_EDITION
        if SNOMED_VERSION:
            branch = f"{SNOMED_EDITION}/{SNOMED_VERSION}"

        url = f"{SNOWSTORM_BASE_URL}/{branch}/concepts/{concept_id}"
        response = requests.get(url, timeout=self.TIMEOUT)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data = response.json()

        fsn = data.get("fsn", {})
        pt = data.get("pt", {})
        fsn_term = fsn.get("term", "")
        tag = ""
        if "(" in fsn_term and fsn_term.endswith(")"):
            tag = fsn_term[fsn_term.rfind("(") + 1 : -1]

        result = SNOMEDSearchResult(
            concept_id=data.get("conceptId", concept_id),
            display=pt.get("term", fsn_term),
            semantic_tag=tag,
        )
        self._cache_results([result])
        return result

    def _search_local(self, query: str, semantic_tag: str, limit: int) -> list[SNOMEDSearchResult]:
        """Search local SNOMEDConcept cache."""
        qs = SNOMEDConcept.objects.filter(is_active=True)

        # Text search on display field
        qs = qs.filter(Q(display__icontains=query) | Q(concept_id__startswith=query))

        if semantic_tag:
            qs = qs.filter(semantic_tag__iexact=semantic_tag)

        return [
            SNOMEDSearchResult(
                concept_id=c.concept_id,
                display=c.display,
                semantic_tag=c.semantic_tag,
            )
            for c in qs[:limit]
        ]

    def _cache_results(self, results: list[SNOMEDSearchResult]) -> None:
        """Cache search results in local SNOMEDConcept table."""
        for result in results:
            if not result.concept_id:
                continue
            SNOMEDConcept.objects.update_or_create(
                concept_id=result.concept_id,
                defaults={
                    "display": result.display,
                    "semantic_tag": result.semantic_tag,
                    "is_active": True,
                },
            )
