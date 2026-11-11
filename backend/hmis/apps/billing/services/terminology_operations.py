# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Operations for selected DHA terminology concepts.

Use ``refresh_selected_concepts`` from Celery or a management command. It
refreshes only concepts already selected into Vitora workflows; it never copies
an entire upstream terminology catalogue into local storage.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.utils import timezone

from hmis.apps.billing.services.terminology_core import TerminologyService
from hmis.apps.billing.services.terminology_source_registry import get_terminology_source
from hmis.apps.core.models import TerminologyConceptCache

logger = logging.getLogger(__name__)


def terminology_health() -> dict:
    """Summarize selected-concept cache freshness by approved terminology source."""
    stale_before = timezone.now() - timedelta(days=7)
    sources = []
    for key in ("hpt", "icd11", "loinc", "ichi"):
        source = get_terminology_source(key)
        cached = TerminologyConceptCache.objects.filter(terminology_key=key)
        stale = cached.filter(retrieved_at__lt=stale_before)
        sources.append(
            {
                "key": key,
                "owner": source.owner,
                "source": source.source,
                "cached_count": cached.count(),
                "stale_count": stale.count(),
                "status": "healthy" if not stale.exists() else "stale",
            }
        )
    return {"checked_at": timezone.now().isoformat(), "sources": sources}


def refresh_selected_concepts(*, terminology_key: str | None = None) -> dict[str, int]:
    """Refresh selected cache entries and return refreshed/failed totals by source."""
    queryset = TerminologyConceptCache.objects.all()
    if terminology_key:
        queryset = queryset.filter(terminology_key=terminology_key)

    outcomes: dict[str, int] = {"refreshed": 0, "failed": 0, "not_found": 0}
    service = TerminologyService()
    for cached in queryset.iterator():
        try:
            matches = service.search_concepts(cached.terminology_key, cached.display, limit=20)
            match = next((item for item in matches if item.code == cached.code), None)
            if match is None:
                outcomes["not_found"] += 1
                continue
            TerminologyConceptCache.cache_selected(match, terminology_key=cached.terminology_key)
            outcomes["refreshed"] += 1
        except Exception:  # noqa: BLE001 - periodic refresh must continue for independent sources
            outcomes["failed"] += 1
            logger.exception(
                "Selected terminology concept refresh failed",
                extra={"terminology_key": cached.terminology_key, "code": cached.code},
            )
    return outcomes
