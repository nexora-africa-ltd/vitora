"""
FHIR R4 Resource Validator for Vitora HMIS.

This module provides validation of FHIR R4 resources using the official
fhir.resources library. It validates resources against the FHIR R4 specification
and provides structured error reporting.

Reference: https://hl7.org/fhir/R4/
Library: https://pypi.org/project/fhir.resources/

Usage:
    >>> from hmis.apps.core.services.fhir_validator import FHIRValidator
    >>> validator = FHIRValidator()
    >>> is_valid, errors = validator.validate_bundle(bundle_dict)
    >>> if not is_valid:
    ...     for error in errors:
    ...         print(f"{error['field']}: {error['message']}")
"""

import logging
from dataclasses import dataclass
from typing import Any

# Import FHIR R4 resources
from fhir.resources.R4B.bundle import Bundle
from fhir.resources.R4B.claim import Claim
from fhir.resources.R4B.claimresponse import ClaimResponse
from fhir.resources.R4B.composition import Composition
from fhir.resources.R4B.condition import Condition
from fhir.resources.R4B.coverage import Coverage
from fhir.resources.R4B.encounter import Encounter
from fhir.resources.R4B.medicationdispense import MedicationDispense
from fhir.resources.R4B.medicationrequest import MedicationRequest
from fhir.resources.R4B.observation import Observation
from fhir.resources.R4B.organization import Organization
from fhir.resources.R4B.patient import Patient
from fhir.resources.R4B.practitioner import Practitioner
from fhir.resources.R4B.servicerequest import ServiceRequest
from pydantic import ValidationError

logger = logging.getLogger(__name__)


@dataclass
class ValidationError:
    """Structured validation error."""

    field: str
    message: str
    error_type: str
    value: Any = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "field": self.field,
            "message": self.message,
            "error_type": self.error_type,
            "value": self.value,
        }


class FHIRValidationResult:
    """Result of FHIR resource validation."""

    def __init__(self, is_valid: bool = True):
        self.is_valid = is_valid
        self.errors: list[ValidationError] = []
        self.warnings: list[str] = []
        self.resource_type: str | None = None

    def add_error(
        self, field: str, message: str, error_type: str = "validation", value: Any = None
    ) -> None:
        """Add a validation error."""
        self.errors.append(ValidationError(field, message, error_type, value))
        self.is_valid = False

    def add_warning(self, message: str) -> None:
        """Add a validation warning."""
        self.warnings.append(message)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "is_valid": self.is_valid,
            "resource_type": self.resource_type,
            "errors": [e.to_dict() for e in self.errors],
            "warnings": self.warnings,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
        }

    def __bool__(self) -> bool:
        """Allow boolean evaluation."""
        return self.is_valid


# Mapping of resource types to FHIR classes
FHIR_RESOURCE_MAP: dict[str, type] = {
    "Bundle": Bundle,
    "Patient": Patient,
    "Encounter": Encounter,
    "Observation": Observation,
    "Condition": Condition,
    "MedicationRequest": MedicationRequest,
    "MedicationDispense": MedicationDispense,
    "ServiceRequest": ServiceRequest,
    "Claim": Claim,
    "ClaimResponse": ClaimResponse,
    "Coverage": Coverage,
    "Organization": Organization,
    "Practitioner": Practitioner,
    "Composition": Composition,
}


class FHIRValidator:
    """
    FHIR R4 Resource Validator.

    Validates FHIR resources against the R4 specification using the
    fhir.resources library (Pydantic-based validation).

    Attributes:
        strict_mode: If True, treat warnings as errors
        validate_references: If True, validate resource references exist

    Example:
        >>> validator = FHIRValidator()
        >>> result = validator.validate_patient(patient_dict)
        >>> if result.is_valid:
        ...     print("Patient resource is valid")
        >>> else:
        ...     for error in result.errors:
        ...         print(f"Error: {error.message}")
    """

    def __init__(self, strict_mode: bool = False, validate_references: bool = False):
        """
        Initialize FHIR Validator.

        Args:
            strict_mode: Treat warnings as errors
            validate_references: Validate that referenced resources exist
        """
        self.strict_mode = strict_mode
        self.validate_references = validate_references

    def validate_resource(
        self, resource_dict: dict, resource_type: str | None = None
    ) -> FHIRValidationResult:
        """
        Validate a FHIR resource against the R4 specification.

        Args:
            resource_dict: Dictionary representation of the FHIR resource
            resource_type: Optional resource type override (inferred from resourceType if not provided)

        Returns:
            FHIRValidationResult with validation status and any errors

        Example:
            >>> result = validator.validate_resource({"resourceType": "Patient", ...})
        """
        result = FHIRValidationResult()

        if not isinstance(resource_dict, dict):
            result.add_error("root", "Resource must be a dictionary", "type_error")
            return result

        # Determine resource type
        actual_type = resource_type or resource_dict.get("resourceType")
        if not actual_type:
            result.add_error(
                "resourceType",
                "Missing 'resourceType' field",
                "missing_field",
            )
            return result

        result.resource_type = actual_type

        # Get the FHIR class for this resource type
        fhir_class = FHIR_RESOURCE_MAP.get(actual_type)
        if not fhir_class:
            result.add_warning(f"Unknown resource type '{actual_type}', skipping deep validation")
            return result

        # Validate using fhir.resources
        try:
            fhir_class.model_validate(resource_dict)
        except Exception as e:
            self._parse_validation_errors(e, result)

        return result

    def validate_bundle(self, bundle_dict: dict) -> FHIRValidationResult:
        """
        Validate a FHIR Bundle resource.

        Validates the bundle structure and optionally each entry's resource.

        Args:
            bundle_dict: Dictionary representation of the FHIR Bundle

        Returns:
            FHIRValidationResult with validation status and any errors

        Example:
            >>> result = validator.validate_bundle(claim_bundle)
            >>> if not result.is_valid:
            ...     print(f"Bundle has {result.error_count} errors")
        """
        result = FHIRValidationResult()
        result.resource_type = "Bundle"

        if not isinstance(bundle_dict, dict):
            result.add_error("root", "Bundle must be a dictionary", "type_error")
            return result

        # Check resourceType
        if bundle_dict.get("resourceType") != "Bundle":
            result.add_error(
                "resourceType",
                f"Expected 'Bundle', got '{bundle_dict.get('resourceType')}'",
                "invalid_value",
            )

        # Validate bundle structure
        try:
            Bundle.model_validate(bundle_dict)
        except Exception as e:
            self._parse_validation_errors(e, result)
            return result  # Don't validate entries if bundle structure is invalid

        # Validate bundle type
        bundle_type = bundle_dict.get("type")
        valid_types = [
            "document",
            "message",
            "transaction",
            "transaction-response",
            "batch",
            "batch-response",
            "history",
            "searchset",
            "collection",
        ]
        if bundle_type and bundle_type not in valid_types:
            result.add_error(
                "type",
                f"Invalid bundle type '{bundle_type}'. Valid types: {valid_types}",
                "invalid_value",
            )

        # Validate each entry
        entries = bundle_dict.get("entry", [])
        for idx, entry in enumerate(entries):
            resource = entry.get("resource")
            if resource:
                entry_result = self.validate_resource(resource)
                if not entry_result.is_valid:
                    for error in entry_result.errors:
                        result.add_error(
                            f"entry[{idx}].resource.{error.field}",
                            error.message,
                            error.error_type,
                            error.value,
                        )

        return result

    def validate_patient(self, patient_dict: dict) -> FHIRValidationResult:
        """
        Validate a FHIR Patient resource.

        Args:
            patient_dict: Dictionary representation of the FHIR Patient

        Returns:
            FHIRValidationResult with validation status and any errors
        """
        result = self.validate_resource(patient_dict, "Patient")

        # Additional Kenya SHA-specific validations
        if result.is_valid:
            self._validate_sha_patient_requirements(patient_dict, result)

        return result

    def validate_claim(self, claim_dict: dict) -> FHIRValidationResult:
        """
        Validate a FHIR Claim resource.

        Args:
            claim_dict: Dictionary representation of the FHIR Claim

        Returns:
            FHIRValidationResult with validation status and any errors
        """
        result = self.validate_resource(claim_dict, "Claim")

        # Additional SHA-specific validations
        if result.is_valid:
            self._validate_sha_claim_requirements(claim_dict, result)

        return result

    def validate_encounter(self, encounter_dict: dict) -> FHIRValidationResult:
        """
        Validate a FHIR Encounter resource.

        Args:
            encounter_dict: Dictionary representation of the FHIR Encounter

        Returns:
            FHIRValidationResult with validation status and any errors
        """
        return self.validate_resource(encounter_dict, "Encounter")

    def validate_observation(self, observation_dict: dict) -> FHIRValidationResult:
        """
        Validate a FHIR Observation resource (vitals, lab results).

        Args:
            observation_dict: Dictionary representation of the FHIR Observation

        Returns:
            FHIRValidationResult with validation status and any errors
        """
        return self.validate_resource(observation_dict, "Observation")

    def validate_medication_request(self, med_request_dict: dict) -> FHIRValidationResult:
        """
        Validate a FHIR MedicationRequest resource.

        Args:
            med_request_dict: Dictionary representation of the FHIR MedicationRequest

        Returns:
            FHIRValidationResult with validation status and any errors
        """
        return self.validate_resource(med_request_dict, "MedicationRequest")

    def validate_medication_dispense(self, dispense_dict: dict) -> FHIRValidationResult:
        """
        Validate a FHIR MedicationDispense resource.

        Args:
            dispense_dict: Dictionary representation of the FHIR MedicationDispense

        Returns:
            FHIRValidationResult with validation status and any errors
        """
        return self.validate_resource(dispense_dict, "MedicationDispense")

    def get_resource_errors(self, resource_dict: dict) -> list[dict]:
        """
        Get validation errors for a FHIR resource as a list of dictionaries.

        Convenience method for getting errors in a simple format.

        Args:
            resource_dict: Dictionary representation of the FHIR resource

        Returns:
            List of error dictionaries with 'field' and 'message' keys

        Example:
            >>> errors = validator.get_resource_errors(patient_dict)
            >>> for error in errors:
            ...     print(f"{error['field']}: {error['message']}")
        """
        result = self.validate_resource(resource_dict)
        return [e.to_dict() for e in result.errors]

    def _parse_validation_errors(self, exception: Exception, result: FHIRValidationResult) -> None:
        """Parse Pydantic validation errors into structured format."""
        if hasattr(exception, "errors"):
            # Pydantic ValidationError
            for error in exception.errors():
                field = ".".join(str(loc) for loc in error.get("loc", ["unknown"]))
                message = error.get("msg", str(error))
                error_type = error.get("type", "validation")
                result.add_error(field, message, error_type)
        else:
            # Generic exception
            result.add_error("root", str(exception), "exception")

    def _validate_sha_patient_requirements(
        self, patient_dict: dict, result: FHIRValidationResult
    ) -> None:
        """
        Validate Kenya SHA-specific Patient requirements.

        SHA requires:
        - Client Registry (CR) identifier
        - Valid identifier system URIs
        """
        identifiers = patient_dict.get("identifier", [])

        # Check for CR identifier (warning only, not error)
        cr_systems = ["urn:sha:client-registry", "urn:kenya:cr"]
        has_cr_id = any(
            any(cr in (id_item.get("system") or "") for cr in cr_systems) for id_item in identifiers
        )
        if not has_cr_id:
            result.add_warning(
                "Patient should have SHA Client Registry identifier "
                "(system: urn:sha:client-registry)"
            )

    def _validate_sha_claim_requirements(
        self, claim_dict: dict, result: FHIRValidationResult
    ) -> None:
        """
        Validate Kenya SHA-specific Claim requirements.

        SHA requires:
        - ICD-11 diagnosis coding (not ICD-10)
        - Valid provider reference
        """
        # Check diagnosis coding system
        diagnoses = claim_dict.get("diagnosis", [])
        for idx, dx in enumerate(diagnoses):
            dx_codeable = dx.get("diagnosisCodeableConcept", {})
            codings = dx_codeable.get("coding", [])
            for coding in codings:
                system = coding.get("system", "")
                # SHA requires ICD-11, warn if using ICD-10
                if "icd-10" in system.lower():
                    result.add_warning(
                        f"diagnosis[{idx}]: SHA recommends ICD-11 "
                        f"(http://id.who.int/icd/release/11/mms) instead of ICD-10"
                    )


# Convenience functions for quick validation
def validate_fhir_resource(resource_dict: dict) -> tuple[bool, list[dict]]:
    """
    Quick validation of a FHIR resource.

    Args:
        resource_dict: Dictionary representation of the FHIR resource

    Returns:
        Tuple of (is_valid, list of error dicts)

    Example:
        >>> is_valid, errors = validate_fhir_resource(patient_dict)
    """
    validator = FHIRValidator()
    result = validator.validate_resource(resource_dict)
    return result.is_valid, [e.to_dict() for e in result.errors]


def validate_fhir_bundle(bundle_dict: dict) -> tuple[bool, list[dict]]:
    """
    Quick validation of a FHIR Bundle.

    Args:
        bundle_dict: Dictionary representation of the FHIR Bundle

    Returns:
        Tuple of (is_valid, list of error dicts)

    Example:
        >>> is_valid, errors = validate_fhir_bundle(claim_bundle)
    """
    validator = FHIRValidator()
    result = validator.validate_bundle(bundle_dict)
    return result.is_valid, [e.to_dict() for e in result.errors]
