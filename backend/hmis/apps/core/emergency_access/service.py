# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Emergency access capability service helpers.

Use these helpers to evaluate whether a user has active break-glass access
for sensitive records and to derive scoped patient visibility.
"""

from __future__ import annotations

from django.db.models import Q
from django.utils import timezone

from .models import EmergencyAccess, EmergencyAccessScope, EmergencyAccessStatus


def get_active_emergency_access_qs(user):
    """Return active, unexpired emergency access queryset for a user."""
    return EmergencyAccess.objects.filter(
        user=user,
        status=EmergencyAccessStatus.ACTIVE,
        expires_at__gt=timezone.now(),
    )


def has_sensitive_access_override(user, patient=None) -> bool:
    """Check if user currently has break-glass override for sensitive access."""
    qs = get_active_emergency_access_qs(user)
    if patient is None:
        return qs.exists()
    return qs.filter(
        Q(scope_type=EmergencyAccessScope.SYSTEM)
        | Q(scope_type=EmergencyAccessScope.PATIENT, patient=patient)
    ).exists()


def get_sensitive_patient_scope_for_user(user) -> tuple[bool, set[int]]:
    """Return tuple `(allow_all_sensitive, patient_ids)` for active break-glass scope."""
    qs = get_active_emergency_access_qs(user)
    if qs.filter(scope_type=EmergencyAccessScope.SYSTEM).exists():
        return True, set()
    patient_ids = set(
        qs.filter(scope_type=EmergencyAccessScope.PATIENT, patient_id__isnull=False).values_list(
            "patient_id", flat=True
        )
    )
    return False, patient_ids
