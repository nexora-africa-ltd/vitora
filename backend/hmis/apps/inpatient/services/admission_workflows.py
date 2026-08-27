"""
What this file is for: shared helper functions used by inpatient admission workflows.
How to use: import these helpers from admission-focused viewsets/services.
Supported inputs/args: admission model instances and ward/vitals values passed by callers.
"""

from django.db.models import Q

CARE_LEVEL_SCORE = {
    "MEDICAL": 1,
    "SURGICAL": 1,
    "PEDIATRIC": 1,
    "MATERNITY": 1,
    "ISOLATION": 1,
    "HDU": 2,
    "NBU": 2,
    "ICU": 3,
}


def admission_order_q(admission) -> Q:
    """Build a Q filter that captures all orders for an admission."""
    q = Q(admission=admission) | Q(encounter=admission.ipd_encounter)
    if admission.opd_encounter_id:
        q |= Q(encounter=admission.opd_encounter)
    return q


def parse_bp_value(raw_bp: str | None) -> tuple[int | None, int | None]:
    """Parse a ``systolic/diastolic`` blood pressure string into integers."""
    if not raw_bp:
        return None, None
    parts = [part.strip() for part in raw_bp.split("/")]
    if len(parts) != 2:
        return None, None
    try:
        return int(parts[0]), int(parts[1])
    except (TypeError, ValueError):
        return None, None


def transfer_direction(source_ward_type: str, destination_ward_type: str) -> str:
    """Classify transfer direction using configured care-level scores."""
    source_score = CARE_LEVEL_SCORE.get(str(source_ward_type), 1)
    destination_score = CARE_LEVEL_SCORE.get(str(destination_ward_type), 1)
    if destination_score > source_score:
        return "STEP_UP"
    if destination_score < source_score:
        return "STEP_DOWN"
    return "LATERAL"
