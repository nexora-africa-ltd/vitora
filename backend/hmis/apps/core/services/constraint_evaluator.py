"""
Dynamic Profile Constraint Evaluator for FHIR Resources.

This module provides a generic constraint evaluation engine that can
automatically validate FHIR resources against ProfileConstraint definitions.

This approach allows constraints to be defined declaratively in profile
definitions rather than hard-coded in validation methods.

Usage:
    >>> evaluator = ConstraintEvaluator()
    >>> violations = evaluator.evaluate(patient_dict, SHA_PATIENT_PROFILE)
    >>> for v in violations:
    ...     print(f"{v.constraint_id}: {v.message}")

Note: This is a more advanced implementation that could replace the
hard-coded validation methods in sha_profile_validator.py. It requires
the 'fhirpath' package for FHIRPath expression evaluation.

Reference: docs/fhir-validation-plan.md Phase 6
"""

import logging
import re
from typing import Any

from hmis.apps.core.fhir.profiles import (
    ProfileConstraint,
    ProfileSeverity,
    SHAProfile,
)
from hmis.apps.core.services.sha_profile_validator import ProfileViolation

logger = logging.getLogger(__name__)


# Try to import fhirpath for expression evaluation
try:
    from fhirpath import evaluate as fhirpath_evaluate
    FHIRPATH_AVAILABLE = True
except ImportError:
    FHIRPATH_AVAILABLE = False
    logger.warning("fhirpath package not available; FHIRPath expressions will be skipped")


class ConstraintEvaluator:
    """
    Dynamic constraint evaluator for FHIR resources.

    Evaluates ProfileConstraint definitions against FHIR resources
    using a generic approach rather than hard-coded validation methods.

    Supports:
    - min_cardinality: Minimum number of occurrences
    - max_cardinality: Maximum number of occurrences
    - fixed_value: Exact value requirement
    - pattern: Regex pattern for string values
    - expression: FHIRPath expression (requires fhirpath package)
    - binding_valueset: Value set binding (basic support)

    Example:
        >>> evaluator = ConstraintEvaluator()
        >>> violations = evaluator.evaluate(patient_dict, SHA_PATIENT_PROFILE)
        >>> if violations:
        ...     print(f"Found {len(violations)} violations")
    """

    def __init__(self, use_fhirpath: bool = True):
        """
        Initialize the constraint evaluator.

        Args:
            use_fhirpath: Whether to evaluate FHIRPath expressions
                         (requires fhirpath package)
        """
        self.use_fhirpath = use_fhirpath and FHIRPATH_AVAILABLE

    def evaluate(
        self, resource: dict, profile: SHAProfile
    ) -> list[ProfileViolation]:
        """
        Evaluate all constraints in a profile against a resource.

        Args:
            resource: FHIR resource as dictionary
            profile: SHAProfile with constraint definitions

        Returns:
            List of ProfileViolation for failed constraints
        """
        violations: list[ProfileViolation] = []

        for constraint in profile.constraints:
            constraint_violations = self._evaluate_constraint(resource, constraint)
            violations.extend(constraint_violations)

        return violations

    def _evaluate_constraint(
        self, resource: dict, constraint: ProfileConstraint
    ) -> list[ProfileViolation]:
        """
        Evaluate a single constraint against a resource.

        Args:
            resource: FHIR resource as dictionary
            constraint: ProfileConstraint to evaluate

        Returns:
            List of violations (empty if constraint passes)
        """
        violations: list[ProfileViolation] = []

        # Get the value at the constraint path
        path_value = self._get_path_value(resource, constraint.path)

        # Check min_cardinality
        if constraint.min_cardinality is not None:
            violation = self._check_min_cardinality(
                path_value, constraint
            )
            if violation:
                violations.append(violation)

        # Check max_cardinality
        if constraint.max_cardinality is not None:
            violation = self._check_max_cardinality(
                path_value, constraint
            )
            if violation:
                violations.append(violation)

        # Check fixed_value
        if constraint.fixed_value is not None:
            violation = self._check_fixed_value(
                path_value, constraint
            )
            if violation:
                violations.append(violation)

        # Check pattern
        if constraint.pattern is not None:
            violation = self._check_pattern(
                path_value, constraint
            )
            if violation:
                violations.append(violation)

        # Check FHIRPath expression
        if constraint.expression is not None and self.use_fhirpath:
            violation = self._check_fhirpath_expression(
                resource, constraint
            )
            if violation:
                violations.append(violation)

        # Check binding (basic ValueSet support)
        if constraint.binding_valueset is not None:
            violation = self._check_binding(
                path_value, constraint
            )
            if violation:
                violations.append(violation)

        return violations

    def _get_path_value(self, resource: dict, path: str) -> Any:
        """
        Get the value at a FHIR path in a resource.

        Supports simple dotted paths like:
        - "Patient.identifier" → resource["identifier"]
        - "Patient.name.family" → resource["name"][0]["family"]
        - "Claim.diagnosis.diagnosisCodeableConcept.coding.system"

        Also supports slicing notation:
        - "Patient.identifier:cr" → identifier where system matches

        Args:
            resource: FHIR resource as dictionary
            path: FHIR path (e.g., "Patient.name.family")

        Returns:
            Value at the path, or None if not found
        """
        if not path:
            return resource

        # Remove resource type prefix (e.g., "Patient." → "")
        parts = path.split(".")
        if parts[0] == resource.get("resourceType"):
            parts = parts[1:]

        # Handle slicing notation (e.g., "identifier:cr")
        slice_name = None
        if parts and ":" in parts[0]:
            element, slice_name = parts[0].split(":", 1)
            parts[0] = element

        current = resource

        for i, part in enumerate(parts):
            if current is None:
                return None

            # Handle slicing for this part
            part_slice = None
            if ":" in part:
                part, part_slice = part.split(":", 1)

            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list):
                # For lists, we might need to check each element
                # This is a simplified implementation
                if part.isdigit():
                    idx = int(part)
                    current = current[idx] if idx < len(current) else None
                else:
                    # Try to get the attribute from first element
                    if current:
                        # Return list of values from each element
                        values = [item.get(part) for item in current if isinstance(item, dict)]
                        current = [v for v in values if v is not None]
                        if len(current) == 1:
                            current = current[0]
                        elif not current:
                            current = None
                    else:
                        current = None
            else:
                return None

            # Apply slice filter if specified
            if part_slice and isinstance(current, list):
                current = self._apply_slice_filter(current, part_slice)

        # Apply top-level slice filter
        if slice_name and isinstance(current, list):
            current = self._apply_slice_filter(current, slice_name)

        return current

    def _apply_slice_filter(self, items: list, slice_name: str) -> Any:
        """
        Apply a slice filter to a list of items.

        Common slices:
        - "cr" → identifier where system contains "client-registry"
        - "mfl" → identifier where system contains "mfl"

        Args:
            items: List of items to filter
            slice_name: Slice name (e.g., "cr", "mfl")

        Returns:
            Filtered items or single item
        """
        # Map slice names to filter criteria
        slice_filters = {
            "cr": lambda x: "client-registry" in str(x.get("system", "")),
            "mfl": lambda x: "mfl" in str(x.get("system", "")),
            "phone": lambda x: x.get("system") == "phone",
            "email": lambda x: x.get("system") == "email",
        }

        filter_fn = slice_filters.get(slice_name)
        if filter_fn:
            filtered = [item for item in items if isinstance(item, dict) and filter_fn(item)]
            return filtered[0] if len(filtered) == 1 else (filtered if filtered else None)

        return items

    def _check_min_cardinality(
        self, value: Any, constraint: ProfileConstraint
    ) -> ProfileViolation | None:
        """Check minimum cardinality constraint."""
        min_card = constraint.min_cardinality
        if min_card is None or min_card == 0:
            return None

        count = self._count_values(value)

        if count < min_card:
            return ProfileViolation(
                constraint_id=constraint.id,
                path=constraint.path,
                message=f"{constraint.description} (found {count}, minimum {min_card})",
                severity=constraint.severity,
                actual_value=count,
                expected_value=f">= {min_card}",
            )

        return None

    def _check_max_cardinality(
        self, value: Any, constraint: ProfileConstraint
    ) -> ProfileViolation | None:
        """Check maximum cardinality constraint."""
        max_card = constraint.max_cardinality
        if max_card is None or max_card == "*":
            return None

        max_card = int(max_card)
        count = self._count_values(value)

        if count > max_card:
            return ProfileViolation(
                constraint_id=constraint.id,
                path=constraint.path,
                message=f"{constraint.description} (found {count}, maximum {max_card})",
                severity=constraint.severity,
                actual_value=count,
                expected_value=f"<= {max_card}",
            )

        return None

    def _check_fixed_value(
        self, value: Any, constraint: ProfileConstraint
    ) -> ProfileViolation | None:
        """Check fixed value constraint."""
        expected = constraint.fixed_value

        # Handle None/missing value
        if value is None:
            return ProfileViolation(
                constraint_id=constraint.id,
                path=constraint.path,
                message=f"{constraint.description} (value is missing)",
                severity=constraint.severity,
                actual_value=None,
                expected_value=expected,
            )

        # Direct comparison
        if value != expected:
            return ProfileViolation(
                constraint_id=constraint.id,
                path=constraint.path,
                message=f"{constraint.description} (expected '{expected}', got '{value}')",
                severity=constraint.severity,
                actual_value=value,
                expected_value=expected,
            )

        return None

    def _check_pattern(
        self, value: Any, constraint: ProfileConstraint
    ) -> ProfileViolation | None:
        """Check regex pattern constraint."""
        pattern = constraint.pattern
        if pattern is None:
            return None

        # Skip if value is missing (handled by cardinality)
        if value is None:
            return None

        # Convert to string for pattern matching
        str_value = str(value)

        if not re.match(pattern, str_value):
            return ProfileViolation(
                constraint_id=constraint.id,
                path=constraint.path,
                message=f"{constraint.description} (value '{str_value}' does not match pattern)",
                severity=constraint.severity,
                actual_value=str_value,
                expected_value=f"Pattern: {pattern}",
            )

        return None

    def _check_fhirpath_expression(
        self, resource: dict, constraint: ProfileConstraint
    ) -> ProfileViolation | None:
        """
        Check FHIRPath expression constraint.

        Requires the 'fhirpath' package to be installed.

        Args:
            resource: FHIR resource as dictionary
            constraint: Constraint with FHIRPath expression

        Returns:
            Violation if expression evaluates to false/empty
        """
        if not self.use_fhirpath:
            logger.debug(f"Skipping FHIRPath expression for {constraint.id}: fhirpath not available")
            return None

        expression = constraint.expression
        if not expression:
            return None

        try:
            # Evaluate FHIRPath expression
            result = fhirpath_evaluate(resource, expression)

            # FHIRPath returns empty list for false/no match
            if not result:
                return ProfileViolation(
                    constraint_id=constraint.id,
                    path=constraint.path,
                    message=f"{constraint.description}",
                    severity=constraint.severity,
                    actual_value=None,
                    expected_value=f"FHIRPath: {expression}",
                )

            # Check for boolean false
            if isinstance(result, list) and len(result) == 1:
                if result[0] is False:
                    return ProfileViolation(
                        constraint_id=constraint.id,
                        path=constraint.path,
                        message=f"{constraint.description}",
                        severity=constraint.severity,
                        actual_value=False,
                        expected_value=f"FHIRPath: {expression}",
                    )

        except Exception as e:
            logger.warning(f"FHIRPath evaluation failed for {constraint.id}: {e}")
            # Don't fail validation on FHIRPath errors
            return None

        return None

    def _check_binding(
        self, value: Any, constraint: ProfileConstraint
    ) -> ProfileViolation | None:
        """
        Check ValueSet binding constraint.

        This is a basic implementation that checks against known ValueSets.
        A full implementation would resolve ValueSet URIs and expand codes.

        Args:
            value: Value to check
            constraint: Constraint with binding information

        Returns:
            Violation if value not in bound ValueSet
        """
        valueset = constraint.binding_valueset
        strength = constraint.binding_strength

        # Skip if no binding or value is missing
        if not valueset or value is None:
            return None

        # Only enforce 'required' bindings
        if strength not in ("required", None):
            return None

        # Known ValueSet mappings
        known_valuesets = {
            "http://hl7.org/fhir/ValueSet/administrative-gender": [
                "male", "female", "other", "unknown"
            ],
            "http://hl7.org/fhir/ValueSet/encounter-status": [
                "planned", "arrived", "triaged", "in-progress",
                "onleave", "finished", "cancelled", "entered-in-error", "unknown"
            ],
            "http://hl7.org/fhir/ValueSet/claim-use": [
                "claim", "preauthorization", "predetermination"
            ],
        }

        valid_codes = known_valuesets.get(valueset)
        if valid_codes is None:
            # Unknown ValueSet, skip validation
            return None

        if value not in valid_codes:
            return ProfileViolation(
                constraint_id=constraint.id,
                path=constraint.path,
                message=f"{constraint.description} ('{value}' not in ValueSet)",
                severity=constraint.severity,
                actual_value=value,
                expected_value=f"One of: {', '.join(valid_codes)}",
            )

        return None

    def _count_values(self, value: Any) -> int:
        """Count the number of values (for cardinality checks)."""
        if value is None:
            return 0
        if isinstance(value, list):
            return len(value)
        return 1


# =============================================================================
# Convenience functions
# =============================================================================

def evaluate_profile_constraints(
    resource: dict,
    profile: SHAProfile,
) -> tuple[bool, list[ProfileViolation]]:
    """
    Convenience function to evaluate a resource against a profile.

    Args:
        resource: FHIR resource as dictionary
        profile: SHAProfile to validate against

    Returns:
        Tuple of (is_valid, violations)

    Example:
        >>> is_valid, violations = evaluate_profile_constraints(patient, SHA_PATIENT_PROFILE)
        >>> if not is_valid:
        ...     print(f"Found {len(violations)} issues")
    """
    evaluator = ConstraintEvaluator()
    violations = evaluator.evaluate(resource, profile)

    # Check if any violations are errors
    is_valid = not any(v.severity == ProfileSeverity.ERROR for v in violations)

    return is_valid, violations


# =============================================================================
# Example usage
# =============================================================================

if __name__ == "__main__":
    # Example: Validate a patient resource
    from hmis.apps.core.fhir.profiles import SHA_PATIENT_PROFILE

    test_patient = {
        "resourceType": "Patient",
        "id": "test-123",
        "identifier": [
            {
                "system": "urn:sha:client-registry",
                "value": "CR06XX3268000-3-1",
            }
        ],
        "name": [
            {
                "family": "Ochieng",
                "given": ["Jane"],
            }
        ],
        "gender": "female",
    }

    is_valid, violations = evaluate_profile_constraints(
        test_patient, SHA_PATIENT_PROFILE
    )

    print(f"Valid: {is_valid}")
    print(f"Violations: {len(violations)}")
    for v in violations:
        print(f"  [{v.severity.value}] {v.constraint_id}: {v.message}")
