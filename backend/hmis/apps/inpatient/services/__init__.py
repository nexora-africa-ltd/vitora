"""Service layer for inpatient domain logic."""
from hmis.apps.inpatient.services.bed_assignment import (
    BedAssignmentService,
    NoBedAvailableError,
    bed_assignment_service,
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
    # Ward compatibility
    "CompatibilityResult",
    "CompatibilityViolation",
    "WardCompatibilityService",
    "ward_compatibility_service",
]