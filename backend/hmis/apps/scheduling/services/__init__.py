"""
Scheduling services for Vitora HMIS.

Phase 1: Availability services
Phase 2: Assignment engine services
"""

# Export Phase 2 assignment engine services
from hmis.apps.scheduling.services.assignment import (
    AssignmentResult,
    AssignmentService,
    CandidateEvaluation,
    EvaluationResult,
    OverrideResult,
    RuleEvaluator,
)

# Re-export Phase 1 availability services (for backward compatibility)
from hmis.apps.scheduling.services.availability import (
    check_slot_available,
    get_available_slots,
    get_weekly_availability,
)

__all__ = [
    # Phase 1
    "get_available_slots",
    "get_weekly_availability",
    "check_slot_available",
    # Phase 2
    "RuleEvaluator",
    "AssignmentService",
    "EvaluationResult",
    "AssignmentResult",
    "OverrideResult",
    "CandidateEvaluation",
]
