# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Lookup helpers for resolving the active DHA consent token for a claim flow.

The Postman collection requires the consent token (returned from OTP validation)
to be passed back into preauth, claim build, and emergency endpoints. This
module centralises the lookup so each per-domain service uses the same logic.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)


class ConsentTokenNotFoundError(LookupError):
    """No active consent token exists for the given context."""


class ConsentTokenExpiredError(LookupError):
    """A consent token exists but has expired."""


@dataclass
class ResolvedConsent:
    token: str
    consent_id: int
    method: str
    expires_at: Any | None


def resolve_for_encounter(encounter: Any) -> ResolvedConsent:
    """Return the most recent VALIDATED consent token for an encounter.

    Falls back to the patient's most recent validated token if the encounter
    has none (some flows pre-collect consent before the encounter is created).
    """
    from hmis.apps.billing.models import ConsentToken

    qs = ConsentToken.objects.filter(
        encounter=encounter,
        status=ConsentToken.ConsentStatus.VALIDATED,
    ).order_by("-validated_at")
    consent = qs.first()
    logger.debug(
        "resolve_for_encounter encounter=%s linked_validated=%s",
        getattr(encounter, "pk", None),
        consent.pk if consent else None,
    )
    if consent is None and getattr(encounter, "patient_id", None):
        consent = (
            ConsentToken.objects.filter(
                patient_id=encounter.patient_id,
                status=ConsentToken.ConsentStatus.VALIDATED,
            )
            .order_by("-validated_at")
            .first()
        )
        logger.debug(
            "resolve_for_encounter fallback patient=%s consent=%s",
            encounter.patient_id,
            consent.pk if consent else None,
        )
    return _validate_or_raise(consent)


def resolve_for_claim(claim: Any) -> ResolvedConsent:
    """Return the active consent token attached to a claim's encounter.

    Claim ILM operations must stay pinned to the encounter-scoped visit token.
    Do not fall back to patient-level tokens here, otherwise requests can be
    sent with a token from a different visit and trigger DHA combination or
    "intervention not found for consent token" errors.
    """
    from hmis.apps.billing.models import ConsentToken

    encounter = getattr(claim, "encounter", None)
    if encounter is None:
        raise ConsentTokenNotFoundError(f"Claim {getattr(claim, 'pk', '?')} has no encounter")

    now = timezone.now()
    valid_qs = ConsentToken.objects.filter(
        encounter=encounter,
        status=ConsentToken.ConsentStatus.VALIDATED,
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    consent = valid_qs.order_by("-validated_at", "-created_at").first()
    if consent is None:
        consent = (
            ConsentToken.objects.filter(
                encounter=encounter,
                status=ConsentToken.ConsentStatus.VALIDATED,
            )
            .order_by("-validated_at", "-created_at")
            .first()
        )
    return _validate_or_raise(consent)


def resolve_for_patient(patient: Any) -> ResolvedConsent:
    from hmis.apps.billing.models import ConsentToken

    consent = (
        ConsentToken.objects.filter(
            patient=patient,
            status=ConsentToken.ConsentStatus.VALIDATED,
        )
        .order_by("-validated_at")
        .first()
    )
    return _validate_or_raise(consent)


def _validate_or_raise(consent: Any) -> ResolvedConsent:
    if consent is None or not consent.consent_token:
        raise ConsentTokenNotFoundError("No validated consent token available")
    if consent.expires_at and consent.expires_at <= timezone.now():
        raise ConsentTokenExpiredError(
            f"Consent token {consent.pk} expired at {consent.expires_at.isoformat()}"
        )
    return ResolvedConsent(
        token=consent.consent_token,
        consent_id=consent.pk,
        method=consent.consent_method,
        expires_at=consent.expires_at,
    )
