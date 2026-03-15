"""Service layer for inpatient domain logic."""
from hmis.apps.inpatient.services.bed_assignment import (
    BedAssignmentService,
    NoBedAvailableError,
    bed_assignment_service,
)
from hmis.apps.inpatient.services.bed_rules import (
    BedAssignmentRuleEvaluator,
    BedAssignmentRuleResult,
    BedCandidateEvaluation,
)
from hmis.apps.inpatient.services.bed_smart import (
    SmartBedAllocationService,
    smart_bed_allocation_service,
)
from hmis.apps.inpatient.services.compatibility import (
    CompatibilityResult,
    CompatibilityViolation,
    WardCompatibilityService,
    ward_compatibility_service,
)

__all__ = [
    # Bed assignment
    "BedAssignmentService",
    "NoBedAvailableError",
    "bed_assignment_service",
    # Bed rules (Phase B)
    "BedAssignmentRuleEvaluator",
    "BedAssignmentRuleResult",
    "BedCandidateEvaluation",
    # Smart allocation (Phase C)
    "SmartBedAllocationService",
    "smart_bed_allocation_service",
    # Ward compatibility
    "CompatibilityResult",
    "CompatibilityViolation",
    "WardCompatibilityService",
    "ward_compatibility_service",
]
