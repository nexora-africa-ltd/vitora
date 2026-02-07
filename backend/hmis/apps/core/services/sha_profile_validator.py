"""
SHA FHIR Profile Validator for Vitora HMIS.

This module validates FHIR resources against Kenya SHA-specific profiles
and extensions. It enforces requirements like:
- ICD-11 diagnosis coding (not ICD-10)
- SHA Client Registry (CR) identifiers
- MFL (Master Facility List) codes for facilities
- SHA scheme extensions for coverage

Reference: docs/fhir-validation-plan.md Phase 2
"""

import logging
import re
from dataclasses import dataclass
from typing import Any

from hmis.apps.core.fhir.profiles import (
    SHA_CLAIM_BUNDLE_PROFILE,
    SHA_CLAIM_PROFILE,
    SHA_COVERAGE_PROFILE,
    SHA_ORGANIZATION_PROFILE,
    SHA_PATIENT_PROFILE,
    ProfileConstraint,
    ProfileSeverity,
    SHACodingSystems,
    SHAProfile,
)
from hmis.apps.core.services.fhir_validator import FHIRValidationResult, FHIRValidator

logger = logging.getLogger(__name__)


@dataclass
class ProfileViolation:
    """A profile constraint violation."""

    constraint_id: str
    path: str
    message: str
    severity: ProfileSeverity
    actual_value: Any = None
    expected_value: Any = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "constraint_id": self.constraint_id,
            "path": self.path,
            "message": self.message,
            "severity": self.severity.value,
            "actual_value": self.actual_value,
            "expected_value": self.expected_value,
        }


class SHAProfileValidationResult:
    """Result of SHA profile validation."""

    def __init__(self, profile: SHAProfile):
        self.profile = profile
        self.is_valid = True
        self.violations: list[ProfileViolation] = []
        self.fhir_result: FHIRValidationResult | None = None

    def add_violation(self, violation: ProfileViolation) -> None:
        """Add a profile violation."""
        self.violations.append(violation)
        if violation.severity == ProfileSeverity.ERROR:
            self.is_valid = False

    @property
    def errors(self) -> list[ProfileViolation]:
        """Get error-level violations."""
        return [v for v in self.violations if v.severity == ProfileSeverity.ERROR]

    @property
    def warnings(self) -> list[ProfileViolation]:
        """Get warning-level violations."""
        return [v for v in self.violations if v.severity == ProfileSeverity.WARNING]

    @property
    def infos(self) -> list[ProfileViolation]:
        """Get info-level violations."""
        return [v for v in self.violations if v.severity == ProfileSeverity.INFO]

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "profile": self.profile.profile_url,
            "profile_name": self.profile.name,
            "is_valid": self.is_valid,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "info_count": len(self.infos),
            "violations": [v.to_dict() for v in self.violations],
            "fhir_validation": self.fhir_result.to_dict() if self.fhir_result else None,
        }

    def __bool__(self) -> bool:
        """Allow boolean evaluation."""
        return self.is_valid


class SHAProfileValidator:
    """
    Kenya SHA FHIR Profile Validator.

    Validates FHIR resources against Kenya-specific SHA profiles.
    This includes validation for:
    - Patient: CR identifier, name requirements
    - Claim: ICD-11 diagnosis, SHA interventions
    - Coverage: SHA scheme extensions
    - Organization: MFL code
    - Bundle: Required resources for claims

    Example:
        >>> validator = SHAProfileValidator()
        >>> result = validator.validate_patient(patient_dict)
        >>> if result.is_valid:
        ...     print("Patient complies with SHA profile")
        >>> else:
        ...     for v in result.errors:
        ...         print(f"Error: {v.message}")
    """

    def __init__(self, validate_fhir_first: bool = True):
        """
        Initialize SHA Profile Validator.

        Args:
            validate_fhir_first: If True, validate against base FHIR R4 spec
                                before profile validation
        """
        self.validate_fhir_first = validate_fhir_first
        self.fhir_validator = FHIRValidator() if validate_fhir_first else None

    def validate_patient(self, patient_dict: dict) -> SHAProfileValidationResult:
        """
        Validate a Patient resource against SHA Patient Profile.

        Args:
            patient_dict: FHIR Patient resource as dictionary

        Returns:
            SHAProfileValidationResult with validation status and violations
        """
        result = SHAProfileValidationResult(SHA_PATIENT_PROFILE)

        # First validate against base FHIR R4
        if self.validate_fhir_first and self.fhir_validator:
            fhir_result = self.fhir_validator.validate_patient(patient_dict)
            result.fhir_result = fhir_result
            if not fhir_result.is_valid:
                # Add FHIR errors as profile violations
                for error in fhir_result.errors:
                    result.add_violation(
                        ProfileViolation(
                            constraint_id="fhir-base",
                            path=error.field,
                            message=f"FHIR R4 validation failed: {error.message}",
                            severity=ProfileSeverity.ERROR,
                        )
                    )

        # Validate SHA-specific constraints
        self._validate_patient_identifiers(patient_dict, result)
        self._validate_patient_name(patient_dict, result)
        self._validate_patient_gender(patient_dict, result)
        self._validate_patient_contact(patient_dict, result)

        return result

    def validate_claim(self, claim_dict: dict) -> SHAProfileValidationResult:
        """
        Validate a Claim resource against SHA Claim Profile.

        Args:
            claim_dict: FHIR Claim resource as dictionary

        Returns:
            SHAProfileValidationResult with validation status and violations
        """
        result = SHAProfileValidationResult(SHA_CLAIM_PROFILE)

        # First validate against base FHIR R4
        if self.validate_fhir_first and self.fhir_validator:
            fhir_result = self.fhir_validator.validate_claim(claim_dict)
            result.fhir_result = fhir_result

        # Validate SHA-specific constraints
        self._validate_claim_use(claim_dict, result)
        self._validate_claim_patient(claim_dict, result)
        self._validate_claim_provider(claim_dict, result)
        self._validate_claim_insurance(claim_dict, result)
        self._validate_claim_diagnosis(claim_dict, result)
        self._validate_claim_items(claim_dict, result)
        self._validate_claim_total(claim_dict, result)

        return result

    def validate_coverage(self, coverage_dict: dict) -> SHAProfileValidationResult:
        """
        Validate a Coverage resource against SHA Coverage Profile.

        Args:
            coverage_dict: FHIR Coverage resource as dictionary

        Returns:
            SHAProfileValidationResult with validation status and violations
        """
        result = SHAProfileValidationResult(SHA_COVERAGE_PROFILE)

        # First validate against base FHIR R4
        if self.validate_fhir_first and self.fhir_validator:
            fhir_result = self.fhir_validator.validate_resource(coverage_dict, "Coverage")
            result.fhir_result = fhir_result

        # Validate SHA-specific constraints
        self._validate_coverage_status(coverage_dict, result)
        self._validate_coverage_beneficiary(coverage_dict, result)
        self._validate_coverage_scheme(coverage_dict, result)

        return result

    def validate_organization(self, org_dict: dict) -> SHAProfileValidationResult:
        """
        Validate an Organization resource against SHA Organization Profile.

        Args:
            org_dict: FHIR Organization resource as dictionary

        Returns:
            SHAProfileValidationResult with validation status and violations
        """
        result = SHAProfileValidationResult(SHA_ORGANIZATION_PROFILE)

        # First validate against base FHIR R4
        if self.validate_fhir_first and self.fhir_validator:
            fhir_result = self.fhir_validator.validate_resource(org_dict, "Organization")
            result.fhir_result = fhir_result

        # Validate SHA-specific constraints
        self._validate_organization_mfl(org_dict, result)
        self._validate_organization_name(org_dict, result)

        return result

    def validate_claim_bundle(self, bundle_dict: dict) -> SHAProfileValidationResult:
        """
        Validate a Bundle resource against SHA Claim Bundle Profile.

        Args:
            bundle_dict: FHIR Bundle resource as dictionary

        Returns:
            SHAProfileValidationResult with validation status and violations
        """
        result = SHAProfileValidationResult(SHA_CLAIM_BUNDLE_PROFILE)

        # First validate against base FHIR R4
        if self.validate_fhir_first and self.fhir_validator:
            fhir_result = self.fhir_validator.validate_bundle(bundle_dict)
            result.fhir_result = fhir_result

        # Validate SHA-specific constraints
        self._validate_bundle_type(bundle_dict, result)
        self._validate_bundle_timestamp(bundle_dict, result)
        self._validate_bundle_required_resources(bundle_dict, result)

        # Validate each resource in the bundle
        self._validate_bundle_resources(bundle_dict, result)

        return result

    # =========================================================================
    # Patient Validation Helpers
    # =========================================================================

    def _validate_patient_identifiers(
        self, patient: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate patient identifiers including CR number."""
        identifiers = patient.get("identifier", [])

        if not identifiers:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-1",
                    path="Patient.identifier",
                    message="Patient MUST have at least one identifier",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        # Check for CR identifier
        cr_identifiers = [
            i for i in identifiers
            if i.get("system") == SHACodingSystems.CLIENT_REGISTRY
        ]

        if not cr_identifiers:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-2",
                    path="Patient.identifier:cr",
                    message="Patient MUST have SHA Client Registry (CR) identifier with system 'urn:sha:client-registry'",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        # Validate CR identifier format
        cr_value = cr_identifiers[0].get("value", "")
        cr_pattern = r"^CR[A-Z0-9]{8,}.*$"
        if not re.match(cr_pattern, cr_value):
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-3",
                    path="Patient.identifier:cr.value",
                    message="CR identifier must start with 'CR' followed by at least 8 alphanumeric characters",
                    severity=ProfileSeverity.ERROR,
                    actual_value=cr_value,
                    expected_value="CR followed by 8+ alphanumeric characters (e.g., CR06XX3268000-3-1)",
                )
            )

    def _validate_patient_name(
        self, patient: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate patient name requirements."""
        names = patient.get("name", [])

        if not names:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-4",
                    path="Patient.name",
                    message="Patient MUST have at least one name",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        # Check first name for family name
        first_name = names[0]
        if not first_name.get("family"):
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-5",
                    path="Patient.name.family",
                    message="Patient name MUST include family name",
                    severity=ProfileSeverity.ERROR,
                )
            )

        if not first_name.get("given"):
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-6",
                    path="Patient.name.given",
                    message="Patient name SHOULD include at least one given name",
                    severity=ProfileSeverity.WARNING,
                )
            )

    def _validate_patient_gender(
        self, patient: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate patient gender."""
        gender = patient.get("gender")
        if not gender:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-7",
                    path="Patient.gender",
                    message="Patient gender MUST be provided",
                    severity=ProfileSeverity.ERROR,
                )
            )
        elif gender not in ["male", "female", "other", "unknown"]:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-7",
                    path="Patient.gender",
                    message="Patient gender must be one of: male, female, other, unknown",
                    severity=ProfileSeverity.ERROR,
                    actual_value=gender,
                )
            )

    def _validate_patient_contact(
        self, patient: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate patient contact information."""
        telecom = patient.get("telecom", [])
        if not telecom:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-patient-9",
                    path="Patient.telecom",
                    message="Patient SHOULD have at least one contact number",
                    severity=ProfileSeverity.WARNING,
                )
            )

    # =========================================================================
    # Claim Validation Helpers
    # =========================================================================

    def _validate_claim_use(
        self, claim: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate claim use field."""
        use = claim.get("use")
        if use != "claim":
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-claim-3",
                    path="Claim.use",
                    message="Claim use MUST be 'claim' for SHA submissions",
                    severity=ProfileSeverity.ERROR,
                    actual_value=use,
                    expected_value="claim",
                )
            )

    def _validate_claim_patient(
        self, claim: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate claim patient reference."""
        patient = claim.get("patient")
        if not patient or not patient.get("reference"):
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-claim-4",
                    path="Claim.patient",
                    message="Claim MUST reference a Patient",
                    severity=ProfileSeverity.ERROR,
                )
            )

    def _validate_claim_provider(
        self, claim: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate claim provider reference."""
        provider = claim.get("provider")
        if not provider or not provider.get("reference"):
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-claim-5",
                    path="Claim.provider",
                    message="Claim MUST reference the providing Organization with MFL code",
                    severity=ProfileSeverity.ERROR,
                )
            )

    def _validate_claim_insurance(
        self, claim: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate claim insurance reference."""
        insurance = claim.get("insurance", [])
        if not insurance:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-claim-6",
                    path="Claim.insurance",
                    message="Claim MUST include SHA insurance/coverage reference",
                    severity=ProfileSeverity.ERROR,
                )
            )

    def _validate_claim_diagnosis(
        self, claim: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate claim diagnosis with ICD-11 requirement."""
        diagnoses = claim.get("diagnosis", [])

        if not diagnoses:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-claim-7",
                    path="Claim.diagnosis",
                    message="Claim MUST include at least one diagnosis",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        # Check each diagnosis for ICD-11 coding
        for idx, dx in enumerate(diagnoses):
            dx_codeable = dx.get("diagnosisCodeableConcept", {})
            codings = dx_codeable.get("coding", [])

            if not codings:
                result.add_violation(
                    ProfileViolation(
                        constraint_id="sha-claim-8",
                        path=f"Claim.diagnosis[{idx}].diagnosisCodeableConcept.coding",
                        message="Diagnosis MUST have coding",
                        severity=ProfileSeverity.ERROR,
                    )
                )
                continue

            # Check if using ICD-11
            has_icd11 = any(
                c.get("system") == SHACodingSystems.ICD11 for c in codings
            )
            has_icd10 = any(
                SHACodingSystems.ICD10 in (c.get("system") or "") for c in codings
            )

            if has_icd10 and not has_icd11:
                result.add_violation(
                    ProfileViolation(
                        constraint_id="sha-claim-8",
                        path=f"Claim.diagnosis[{idx}].diagnosisCodeableConcept.coding.system",
                        message="Diagnosis MUST use ICD-11 coding system (not ICD-10). SHA requires ICD-11.",
                        severity=ProfileSeverity.ERROR,
                        actual_value=SHACodingSystems.ICD10,
                        expected_value=SHACodingSystems.ICD11,
                    )
                )
            elif not has_icd11:
                actual_systems = [c.get("system") for c in codings]
                result.add_violation(
                    ProfileViolation(
                        constraint_id="sha-claim-8",
                        path=f"Claim.diagnosis[{idx}].diagnosisCodeableConcept.coding.system",
                        message="Diagnosis MUST use ICD-11 coding system",
                        severity=ProfileSeverity.ERROR,
                        actual_value=actual_systems,
                        expected_value=SHACodingSystems.ICD11,
                    )
                )

    def _validate_claim_items(
        self, claim: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate claim items."""
        items = claim.get("item", [])
        if not items:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-claim-9",
                    path="Claim.item",
                    message="Claim MUST include at least one item",
                    severity=ProfileSeverity.ERROR,
                )
            )

    def _validate_claim_total(
        self, claim: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate claim total amount."""
        total = claim.get("total")
        if not total:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-claim-11",
                    path="Claim.total",
                    message="Claim MUST include total amount",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        currency = total.get("currency")
        if currency != "KES":
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-claim-12",
                    path="Claim.total.currency",
                    message="Claim total currency MUST be KES (Kenya Shillings)",
                    severity=ProfileSeverity.ERROR,
                    actual_value=currency,
                    expected_value="KES",
                )
            )

    # =========================================================================
    # Coverage Validation Helpers
    # =========================================================================

    def _validate_coverage_status(
        self, coverage: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate coverage status."""
        status = coverage.get("status")
        if status != "active":
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-coverage-1",
                    path="Coverage.status",
                    message="Coverage status MUST be 'active'",
                    severity=ProfileSeverity.ERROR,
                    actual_value=status,
                    expected_value="active",
                )
            )

    def _validate_coverage_beneficiary(
        self, coverage: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate coverage beneficiary."""
        beneficiary = coverage.get("beneficiary")
        if not beneficiary or not beneficiary.get("reference"):
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-coverage-2",
                    path="Coverage.beneficiary",
                    message="Coverage MUST reference the Patient",
                    severity=ProfileSeverity.ERROR,
                )
            )

    def _validate_coverage_scheme(
        self, coverage: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate SHA scheme in coverage class."""
        classes = coverage.get("class", [])

        if not classes:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-coverage-4",
                    path="Coverage.class",
                    message="Coverage MUST include SHA scheme class",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        # Check for SHA scheme
        sha_scheme_pattern = r"^CAT-SHA-00[123]$"
        has_valid_scheme = False

        for cls in classes:
            value = cls.get("value", "")
            if re.match(sha_scheme_pattern, value):
                has_valid_scheme = True
                break

        if not has_valid_scheme:
            actual_values = [c.get("value") for c in classes]
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-coverage-6",
                    path="Coverage.class.value",
                    message="Coverage class value MUST be valid SHA scheme (CAT-SHA-001, CAT-SHA-002, or CAT-SHA-003)",
                    severity=ProfileSeverity.ERROR,
                    actual_value=actual_values,
                    expected_value="CAT-SHA-001, CAT-SHA-002, or CAT-SHA-003",
                )
            )

    # =========================================================================
    # Organization Validation Helpers
    # =========================================================================

    def _validate_organization_mfl(
        self, org: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate organization MFL code."""
        identifiers = org.get("identifier", [])

        if not identifiers:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-org-1",
                    path="Organization.identifier",
                    message="Organization MUST have at least one identifier",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        # Check for MFL identifier
        mfl_identifiers = [
            i for i in identifiers
            if i.get("system") == SHACodingSystems.MFL_CODE
        ]

        if not mfl_identifiers:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-org-2",
                    path="Organization.identifier:mfl",
                    message="Organization MUST have MFL (Master Facility List) code with system 'urn:kenya:mfl'",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        # Validate MFL code format (5 digits)
        mfl_value = mfl_identifiers[0].get("value", "")
        mfl_pattern = r"^\d{5}$"
        if not re.match(mfl_pattern, mfl_value):
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-org-3",
                    path="Organization.identifier:mfl.value",
                    message="MFL code must be a 5-digit number",
                    severity=ProfileSeverity.ERROR,
                    actual_value=mfl_value,
                    expected_value="5-digit number (e.g., 12345)",
                )
            )

    def _validate_organization_name(
        self, org: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate organization name."""
        name = org.get("name")
        if not name:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-org-5",
                    path="Organization.name",
                    message="Organization name MUST be provided",
                    severity=ProfileSeverity.ERROR,
                )
            )

    # =========================================================================
    # Bundle Validation Helpers
    # =========================================================================

    def _validate_bundle_type(
        self, bundle: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate bundle type for claims."""
        bundle_type = bundle.get("type")
        if bundle_type != "message":
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-bundle-1",
                    path="Bundle.type",
                    message="Claim bundle type MUST be 'message'",
                    severity=ProfileSeverity.ERROR,
                    actual_value=bundle_type,
                    expected_value="message",
                )
            )

    def _validate_bundle_timestamp(
        self, bundle: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate bundle timestamp."""
        timestamp = bundle.get("timestamp")
        if not timestamp:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-bundle-2",
                    path="Bundle.timestamp",
                    message="Bundle MUST have timestamp",
                    severity=ProfileSeverity.ERROR,
                )
            )

    def _validate_bundle_required_resources(
        self, bundle: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate that bundle contains required resources."""
        entries = bundle.get("entry", [])

        if not entries:
            result.add_violation(
                ProfileViolation(
                    constraint_id="sha-bundle-3",
                    path="Bundle.entry",
                    message="Bundle MUST contain entries",
                    severity=ProfileSeverity.ERROR,
                )
            )
            return

        # Extract resource types
        resource_types = set()
        for entry in entries:
            resource = entry.get("resource", {})
            rt = resource.get("resourceType")
            if rt:
                resource_types.add(rt)

        # Check required resources
        required_resources = {
            "Organization": ("sha-bundle-4", "Bundle MUST contain Organization resource"),
            "Patient": ("sha-bundle-5", "Bundle MUST contain Patient resource"),
            "Coverage": ("sha-bundle-6", "Bundle MUST contain Coverage resource"),
            "Claim": ("sha-bundle-7", "Bundle MUST contain Claim resource"),
        }

        for resource_type, (constraint_id, message) in required_resources.items():
            if resource_type not in resource_types:
                result.add_violation(
                    ProfileViolation(
                        constraint_id=constraint_id,
                        path=f"Bundle.entry:{resource_type.lower()}",
                        message=message,
                        severity=ProfileSeverity.ERROR,
                    )
                )

    def _validate_bundle_resources(
        self, bundle: dict, result: SHAProfileValidationResult
    ) -> None:
        """Validate each resource in the bundle against its profile."""
        entries = bundle.get("entry", [])

        for idx, entry in enumerate(entries):
            resource = entry.get("resource", {})
            resource_type = resource.get("resourceType")

            if resource_type == "Patient":
                patient_result = self.validate_patient(resource)
                for v in patient_result.violations:
                    v.path = f"Bundle.entry[{idx}].resource.{v.path.replace('Patient.', '')}"
                    result.add_violation(v)

            elif resource_type == "Organization":
                org_result = self.validate_organization(resource)
                for v in org_result.violations:
                    v.path = f"Bundle.entry[{idx}].resource.{v.path.replace('Organization.', '')}"
                    result.add_violation(v)

            elif resource_type == "Coverage":
                coverage_result = self.validate_coverage(resource)
                for v in coverage_result.violations:
                    v.path = f"Bundle.entry[{idx}].resource.{v.path.replace('Coverage.', '')}"
                    result.add_violation(v)

            elif resource_type == "Claim":
                claim_result = self.validate_claim(resource)
                for v in claim_result.violations:
                    v.path = f"Bundle.entry[{idx}].resource.{v.path.replace('Claim.', '')}"
                    result.add_violation(v)


# Convenience function
def validate_sha_resource(resource_dict: dict) -> SHAProfileValidationResult:
    """
    Validate a FHIR resource against the appropriate SHA profile.

    Args:
        resource_dict: FHIR resource as dictionary

    Returns:
        SHAProfileValidationResult

    Example:
        >>> result = validate_sha_resource(patient_dict)
        >>> if result.is_valid:
        ...     print("Resource complies with SHA profile")
    """
    validator = SHAProfileValidator()
    resource_type = resource_dict.get("resourceType")

    if resource_type == "Patient":
        return validator.validate_patient(resource_dict)
    elif resource_type == "Claim":
        return validator.validate_claim(resource_dict)
    elif resource_type == "Coverage":
        return validator.validate_coverage(resource_dict)
    elif resource_type == "Organization":
        return validator.validate_organization(resource_dict)
    elif resource_type == "Bundle":
        return validator.validate_claim_bundle(resource_dict)
    else:
        # Return empty result for unsupported types
        result = SHAProfileValidationResult(
            SHAProfile(
                resource_type=resource_type or "Unknown",
                profile_url="",
                name="Unsupported",
                description="No SHA profile defined for this resource type",
            )
        )
        result.add_violation(
            ProfileViolation(
                constraint_id="unsupported",
                path="resourceType",
                message=f"No SHA profile defined for resource type: {resource_type}",
                severity=ProfileSeverity.WARNING,
            )
        )
        return result
