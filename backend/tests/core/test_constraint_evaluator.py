"""
Tests for the Dynamic Constraint Evaluator.

These tests demonstrate how ProfileConstraint definitions can be
automatically evaluated against FHIR resources without hard-coded
validation logic.
"""

import pytest  # type: ignore

from hmis.apps.core.fhir.profiles import (
    SHA_CLAIM_PROFILE,
    SHA_PATIENT_PROFILE,
    ProfileConstraint,
    ProfileSeverity,
    SHAProfile,
)
from hmis.apps.core.services.constraint_evaluator import (
    ConstraintEvaluator,
    evaluate_profile_constraints,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def evaluator():
    """Create a ConstraintEvaluator instance."""
    return ConstraintEvaluator(use_fhirpath=False)  # Disable FHIRPath for basic tests


@pytest.fixture
def simple_profile():
    """Create a simple profile for testing."""
    return SHAProfile(
        resource_type="TestResource",
        profile_url="urn:test:profile",
        name="Test Profile",
        description="A test profile",
        constraints=[
            ProfileConstraint(
                id="test-1",
                path="TestResource.name",
                description="Name is required",
                severity=ProfileSeverity.ERROR,
                min_cardinality=1,
            ),
            ProfileConstraint(
                id="test-2",
                path="TestResource.code",
                description="Code must be 'ABC'",
                severity=ProfileSeverity.ERROR,
                fixed_value="ABC",
            ),
            ProfileConstraint(
                id="test-3",
                path="TestResource.id",
                description="ID must match pattern",
                severity=ProfileSeverity.ERROR,
                pattern=r"^[A-Z]{3}-\d{4}$",
            ),
            ProfileConstraint(
                id="test-4",
                path="TestResource.items",
                description="Maximum 3 items allowed",
                severity=ProfileSeverity.WARNING,
                max_cardinality=3,
            ),
        ],
    )


@pytest.fixture
def valid_sha_patient():
    """Valid SHA-compliant Patient resource."""
    return {
        "resourceType": "Patient",
        "id": "test-123",
        "identifier": [
            {
                "system": "urn:sha:client-registry",
                "value": "CR06XX3268000-3-1",
            },
        ],
        "name": [
            {
                "family": "Ochieng",
                "given": ["Jane"],
            }
        ],
        "gender": "female",
        "telecom": [
            {"system": "phone", "value": "+254712345678"},
        ],
    }


# =============================================================================
# Test Path Value Extraction
# =============================================================================


class TestPathValueExtraction:
    """Tests for FHIR path value extraction."""

    def test_simple_path(self, evaluator):
        """Should extract value from simple path."""
        resource = {"resourceType": "Patient", "gender": "female"}
        value = evaluator._get_path_value(resource, "Patient.gender")
        assert value == "female"

    def test_nested_path(self, evaluator):
        """Should extract value from nested path."""
        resource = {
            "resourceType": "Patient",
            "name": [{"family": "Ochieng"}],
        }
        value = evaluator._get_path_value(resource, "Patient.name.family")
        assert value == "Ochieng"

    def test_array_path(self, evaluator):
        """Should handle array values."""
        resource = {
            "resourceType": "Patient",
            "identifier": [
                {"system": "urn:a", "value": "123"},
                {"system": "urn:b", "value": "456"},
            ],
        }
        value = evaluator._get_path_value(resource, "Patient.identifier")
        assert isinstance(value, list)
        assert len(value) == 2

    def test_missing_path(self, evaluator):
        """Should return None for missing path."""
        resource = {"resourceType": "Patient"}
        value = evaluator._get_path_value(resource, "Patient.gender")
        assert value is None

    def test_slice_path(self, evaluator):
        """Should filter by slice notation."""
        resource = {
            "resourceType": "Patient",
            "identifier": [
                {"system": "urn:sha:client-registry", "value": "CR123456789"},
                {"system": "urn:kenya:national-id", "value": "12345678"},
            ],
        }
        value = evaluator._get_path_value(resource, "Patient.identifier:cr")
        assert value is not None
        assert value.get("system") == "urn:sha:client-registry"


# =============================================================================
# Test Cardinality Checks
# =============================================================================


class TestCardinalityChecks:
    """Tests for cardinality constraint checking."""

    def test_min_cardinality_pass(self, evaluator):
        """Should pass when minimum cardinality is met."""
        constraint = ProfileConstraint(
            id="test-min",
            path="Patient.name",
            description="Name required",
            min_cardinality=1,
        )
        violation = evaluator._check_min_cardinality([{"family": "Test"}], constraint)
        assert violation is None

    def test_min_cardinality_fail(self, evaluator):
        """Should fail when minimum cardinality not met."""
        constraint = ProfileConstraint(
            id="test-min",
            path="Patient.name",
            description="Name required",
            min_cardinality=1,
        )
        violation = evaluator._check_min_cardinality(None, constraint)
        assert violation is not None
        assert violation.constraint_id == "test-min"

    def test_max_cardinality_pass(self, evaluator):
        """Should pass when maximum cardinality not exceeded."""
        constraint = ProfileConstraint(
            id="test-max",
            path="Patient.identifier",
            description="Max 3 identifiers",
            max_cardinality=3,
        )
        violation = evaluator._check_max_cardinality([{"value": "1"}, {"value": "2"}], constraint)
        assert violation is None

    def test_max_cardinality_fail(self, evaluator):
        """Should fail when maximum cardinality exceeded."""
        constraint = ProfileConstraint(
            id="test-max",
            path="Patient.identifier",
            description="Max 2 identifiers",
            max_cardinality=2,
        )
        violation = evaluator._check_max_cardinality(
            [{"value": "1"}, {"value": "2"}, {"value": "3"}], constraint
        )
        assert violation is not None
        assert "maximum 2" in violation.message

    def test_max_cardinality_unlimited(self, evaluator):
        """Should pass when max cardinality is unlimited (*)."""
        constraint = ProfileConstraint(
            id="test-max",
            path="Patient.identifier",
            description="Unlimited",
            max_cardinality="*",
        )
        violation = evaluator._check_max_cardinality(
            [{"value": str(i)} for i in range(100)], constraint
        )
        assert violation is None


# =============================================================================
# Test Fixed Value Checks
# =============================================================================


class TestFixedValueChecks:
    """Tests for fixed value constraint checking."""

    def test_fixed_value_pass(self, evaluator):
        """Should pass when value matches fixed value."""
        constraint = ProfileConstraint(
            id="test-fixed",
            path="Claim.use",
            description="Use must be 'claim'",
            fixed_value="claim",
        )
        violation = evaluator._check_fixed_value("claim", constraint)
        assert violation is None

    def test_fixed_value_fail(self, evaluator):
        """Should fail when value doesn't match fixed value."""
        constraint = ProfileConstraint(
            id="test-fixed",
            path="Claim.use",
            description="Use must be 'claim'",
            fixed_value="claim",
        )
        violation = evaluator._check_fixed_value("preauthorization", constraint)
        assert violation is not None
        assert "preauthorization" in violation.message

    def test_fixed_value_missing(self, evaluator):
        """Should fail when value is missing."""
        constraint = ProfileConstraint(
            id="test-fixed",
            path="Claim.use",
            description="Use must be 'claim'",
            fixed_value="claim",
        )
        violation = evaluator._check_fixed_value(None, constraint)
        assert violation is not None
        assert "missing" in violation.message


# =============================================================================
# Test Pattern Checks
# =============================================================================


class TestPatternChecks:
    """Tests for regex pattern constraint checking."""

    def test_pattern_pass(self, evaluator):
        """Should pass when value matches pattern."""
        constraint = ProfileConstraint(
            id="test-pattern",
            path="Patient.identifier.value",
            description="CR identifier format",
            pattern=r"^CR[A-Z0-9]{8,}.*$",
        )
        violation = evaluator._check_pattern("CR06XX3268000-3-1", constraint)
        assert violation is None

    def test_pattern_fail(self, evaluator):
        """Should fail when value doesn't match pattern."""
        constraint = ProfileConstraint(
            id="test-pattern",
            path="Patient.identifier.value",
            description="CR identifier format",
            pattern=r"^CR[A-Z0-9]{8,}.*$",
        )
        violation = evaluator._check_pattern("INVALID123", constraint)
        assert violation is not None
        assert "does not match pattern" in violation.message

    def test_pattern_skip_none(self, evaluator):
        """Should skip pattern check for None values."""
        constraint = ProfileConstraint(
            id="test-pattern",
            path="Patient.identifier.value",
            description="CR identifier format",
            pattern=r"^CR[A-Z0-9]{8,}.*$",
        )
        violation = evaluator._check_pattern(None, constraint)
        assert violation is None  # Cardinality handles missing values


# =============================================================================
# Test Binding Checks
# =============================================================================


class TestBindingChecks:
    """Tests for ValueSet binding constraint checking."""

    def test_binding_pass(self, evaluator):
        """Should pass when value is in ValueSet."""
        constraint = ProfileConstraint(
            id="test-binding",
            path="Patient.gender",
            description="Valid gender",
            binding_strength="required",
            binding_valueset="http://hl7.org/fhir/ValueSet/administrative-gender",
        )
        violation = evaluator._check_binding("female", constraint)
        assert violation is None

    def test_binding_fail(self, evaluator):
        """Should fail when value not in ValueSet."""
        constraint = ProfileConstraint(
            id="test-binding",
            path="Patient.gender",
            description="Valid gender",
            binding_strength="required",
            binding_valueset="http://hl7.org/fhir/ValueSet/administrative-gender",
        )
        violation = evaluator._check_binding("invalid", constraint)
        assert violation is not None
        assert "not in ValueSet" in violation.message


# =============================================================================
# Test Full Profile Evaluation
# =============================================================================


class TestProfileEvaluation:
    """Tests for full profile evaluation."""

    def test_evaluate_valid_resource(self, evaluator, simple_profile):
        """Should return no violations for valid resource."""
        resource = {
            "resourceType": "TestResource",
            "name": "Test Name",
            "code": "ABC",
            "id": "XYZ-1234",
            "items": [1, 2],
        }
        violations = evaluator.evaluate(resource, simple_profile)
        errors = [v for v in violations if v.severity == ProfileSeverity.ERROR]
        assert len(errors) == 0

    def test_evaluate_invalid_resource(self, evaluator, simple_profile):
        """Should return violations for invalid resource."""
        resource = {
            "resourceType": "TestResource",
            # Missing name (min_cardinality=1)
            "code": "WRONG",  # Should be "ABC"
            "id": "invalid",  # Doesn't match pattern
            "items": [1, 2, 3, 4, 5],  # Exceeds max_cardinality=3
        }
        violations = evaluator.evaluate(resource, simple_profile)
        assert len(violations) >= 3  # At least 3 errors + 1 warning

    def test_evaluate_sha_patient_profile(self, evaluator, valid_sha_patient):
        """Should evaluate SHA Patient profile."""
        # Note: This uses the actual SHA_PATIENT_PROFILE
        violations = evaluator.evaluate(valid_sha_patient, SHA_PATIENT_PROFILE)
        errors = [v for v in violations if v.severity == ProfileSeverity.ERROR]
        # Valid patient should have no errors
        assert len(errors) == 0


# =============================================================================
# Test Convenience Function
# =============================================================================


class TestConvenienceFunction:
    """Tests for convenience functions."""

    def test_evaluate_profile_constraints_valid(self, valid_sha_patient):
        """Should return is_valid=True for valid resource."""
        is_valid, violations = evaluate_profile_constraints(valid_sha_patient, SHA_PATIENT_PROFILE)
        # Filter to only errors
        errors = [v for v in violations if v.severity == ProfileSeverity.ERROR]
        assert len(errors) == 0

    def test_evaluate_profile_constraints_invalid(self):
        """Should return is_valid=False for invalid resource."""
        invalid_patient = {
            "resourceType": "Patient",
            # Missing everything required
        }
        is_valid, violations = evaluate_profile_constraints(invalid_patient, SHA_PATIENT_PROFILE)
        assert is_valid is False
        assert len(violations) > 0


# =============================================================================
# Test Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_resource(self, evaluator, simple_profile):
        """Should handle empty resource."""
        violations = evaluator.evaluate({}, simple_profile)
        assert len(violations) > 0

    def test_null_values(self, evaluator):
        """Should handle null/None values gracefully."""
        constraint = ProfileConstraint(
            id="test",
            path="Test.value",
            description="Value check",
            min_cardinality=1,
        )
        violation = evaluator._check_min_cardinality(None, constraint)
        assert violation is not None

    def test_deeply_nested_path(self, evaluator):
        """Should handle deeply nested paths."""
        resource = {
            "resourceType": "Claim",
            "diagnosis": [
                {
                    "diagnosisCodeableConcept": {
                        "coding": [{"system": "http://icd11.org", "code": "ABC"}]
                    }
                }
            ],
        }
        value = evaluator._get_path_value(
            resource, "Claim.diagnosis.diagnosisCodeableConcept.coding.system"
        )
        # Should extract the system value(s)
        assert value is not None
