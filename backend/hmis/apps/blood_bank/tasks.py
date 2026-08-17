"""Blood bank background tasks.

Purpose: periodic automation for blood-unit lifecycle maintenance.
How to run: Celery worker/beat executes automatically; manual run via
`poetry run python manage.py shell -c "from hmis.apps.blood_bank.tasks import expire_eligible_blood_units; print(expire_eligible_blood_units())"`.
Inputs: optional `facility_id` argument to scope the expiry sweep to one facility.
"""

from __future__ import annotations

from celery import shared_task
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.blood_bank.models import BloodUnit, UnitStatus, UnitStatusChangeSource


@shared_task(name="hmis.apps.blood_bank.tasks.expire_eligible_blood_units")
def expire_eligible_blood_units(facility_id: int | None = None) -> dict[str, int]:
    """Mark eligible blood units as EXPIRED when expiry_date is in the past."""
    eligible_statuses = [
        UnitStatus.COLLECTED,
        UnitStatus.TESTING,
        UnitStatus.AVAILABLE,
        UnitStatus.RESERVED,
        UnitStatus.QUARANTINED,
    ]

    queryset = BloodUnit.objects.filter(
        status__in=eligible_statuses,
        expiry_date__lte=timezone.now(),
    )
    if facility_id is not None:
        queryset = queryset.filter(facility_id=facility_id)

    expired_count = 0
    skipped_count = 0

    for unit in queryset.iterator():
        try:
            unit.transition_to(
                UnitStatus.EXPIRED,
                reason="Daily expiry sweep: expiry date is in the past.",
                source=UnitStatusChangeSource.AUTOMATED,
            )
            expired_count += 1
        except ValidationError:
            skipped_count += 1

    return {
        "expired_count": expired_count,
        "skipped_count": skipped_count,
    }
