"""
Kenya SHA FHIR Profile Definitions.

This module defines Kenya-specific FHIR profile constraints for SHA
(Social Health Authority) compliance. These profiles extend the base
FHIR R4 specification with Kenya-specific requirements.

Reference: docs/sha-guides/
Kenya Digital Superhighway API Documentation
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ProfileSeverity(Enum):
    """Severity level for profile constraints."""

    ERROR = "error"  # Must be fixed for compliance
    WARNING = "warning"  # Should be fixed, but not blocking
    INFO = "info"  # Informational, best practice


@dataclass
class ProfileConstraint:
    """A single profile constraint definition."""

    id: str  # Unique constraint ID
    path: str  # FHIR path (e.g., "Patient.identifier")
    description: str  # Human-readable description
    severity: ProfileSeverity = ProfileSeverity.ERROR
    expression: str | None = None  # FHIRPath expression (optional)
    min_cardinality: int | None = None  # Minimum occurrences
    max_cardinality: int | str | None = None  # Maximum occurrences (* = unlimited)
    fixed_value: Any = None  # Fixed value requirement
    pattern: str | None = None  # Regex pattern for string values
    binding_strength: str | None = None  # required, preferred, extensible, example
    binding_valueset: str | None = None  # ValueSet URI


@dataclass
class SHAProfile:
    """
    Kenya SHA FHIR Profile definition.

    Defines the constraints and requirements for a specific FHIR resource
    type within the Kenya SHA ecosystem.
    """

    resource_type: str  # FHIR resource type (Patient, Claim, etc.)
    profile_url: str  # Canonical URL for this profile
    name: str  # Human-readable profile name
    description: str  # Profile description
    constraints: list[ProfileConstraint] = field(default_factory=list)

    def get_constraint(self, constraint_id: str) -> ProfileConstraint | None:
        """Get a specific constraint by ID."""
        for c in self.constraints:
            if c.id == constraint_id:
                return c
        return None


# =============================================================================
# Kenya SHA Coding Systems
# =============================================================================

class SHACodingSystems:
    """Standard coding system URIs for Kenya SHA."""

    # Patient Identifiers
    CLIENT_REGISTRY = "urn:sha:client-registry"
    NATIONAL_ID = "urn:kenya:national-id"
    NHIF_NUMBER = "urn:kenya:nhif"
    PASSPORT = "urn:kenya:passport"

    # Facility Identifiers
    MFL_CODE = "urn:kenya:mfl"  # Master Facility List

    # Diagnosis Coding
    ICD11 = "http://id.who.int/icd/release/11/mms"
    ICD10 = "http://hl7.org/fhir/sid/icd-10"  # Deprecated for SHA

    # Procedure/Intervention Coding
    ICHI = "http://id.who.int/ichi"
    SHA_INTERVENTIONS = "urn:sha:interventions"

    # Drug Coding
    SHA_DRUG_PRODUCTS = "urn:sha:drug-products"
    SHA_ACTIVE_COMPONENTS = "urn:sha:active-components"

    # Lab Coding
    LOINC = "http://loinc.org"

    # SHA Scheme Extensions
    SHA_SCHEME = "urn:sha:scheme"
    SHA_CATEGORY = "urn:sha:category"


class SHASchemes:
    """SHA insurance scheme codes."""

    CAT_SHA_001 = "CAT-SHA-001"  # Social Health Insurance Fund
    CAT_SHA_002 = "CAT-SHA-002"  # Primary Healthcare
    CAT_SHA_003 = "CAT-SHA-003"  # Emergency, Chronic & Critical Illness


# =============================================================================
# SHA Patient Profile
# =============================================================================

SHA_PATIENT_PROFILE = SHAProfile(
    resource_type="Patient",
    profile_url="urn:sha:fhir:profile:Patient",
    name="SHA Patient Profile",
    description="Kenya SHA Patient resource profile with Client Registry requirements",
    constraints=[
        ProfileConstraint(
            id="sha-patient-1",
            path="Patient.identifier",
            description="Patient MUST have at least one identifier",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-patient-2",
            path="Patient.identifier:cr",
            description="Patient MUST have SHA Client Registry (CR) identifier",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
            expression="identifier.where(system='urn:sha:client-registry').exists()",
        ),
        ProfileConstraint(
            id="sha-patient-3",
            path="Patient.identifier:cr.value",
            description="CR identifier must start with 'CR' and have minimum 10 characters",
            severity=ProfileSeverity.ERROR,
            pattern=r"^CR[A-Z0-9]{8,}.*$",
        ),
        ProfileConstraint(
            id="sha-patient-4",
            path="Patient.name",
            description="Patient MUST have at least one name",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-patient-5",
            path="Patient.name.family",
            description="Patient name MUST include family name",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-patient-6",
            path="Patient.name.given",
            description="Patient name SHOULD include at least one given name",
            severity=ProfileSeverity.WARNING,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-patient-7",
            path="Patient.gender",
            description="Patient gender MUST be provided",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
            binding_strength="required",
            binding_valueset="http://hl7.org/fhir/ValueSet/administrative-gender",
        ),
        ProfileConstraint(
            id="sha-patient-8",
            path="Patient.birthDate",
            description="Patient birth date SHOULD be provided for eligibility checks",
            severity=ProfileSeverity.WARNING,
        ),
        ProfileConstraint(
            id="sha-patient-9",
            path="Patient.telecom",
            description="Patient SHOULD have at least one contact number",
            severity=ProfileSeverity.WARNING,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-patient-10",
            path="Patient.address.country",
            description="Patient address country SHOULD be 'KE' for Kenya",
            severity=ProfileSeverity.INFO,
            pattern=r"^KE$",
        ),
    ],
)


# =============================================================================
# SHA Claim Profile
# =============================================================================

SHA_CLAIM_PROFILE = SHAProfile(
    resource_type="Claim",
    profile_url="urn:sha:fhir:profile:Claim",
    name="SHA Claim Profile",
    description="Kenya SHA insurance claim with ICD-11 diagnosis and SHA interventions",
    constraints=[
        ProfileConstraint(
            id="sha-claim-1",
            path="Claim.status",
            description="Claim status MUST be 'active' or 'draft'",
            severity=ProfileSeverity.ERROR,
            binding_strength="required",
        ),
        ProfileConstraint(
            id="sha-claim-2",
            path="Claim.type",
            description="Claim type MUST be specified",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-claim-3",
            path="Claim.use",
            description="Claim use MUST be 'claim' for SHA submissions",
            severity=ProfileSeverity.ERROR,
            fixed_value="claim",
        ),
        ProfileConstraint(
            id="sha-claim-4",
            path="Claim.patient",
            description="Claim MUST reference a Patient",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-claim-5",
            path="Claim.provider",
            description="Claim MUST reference the providing Organization with MFL code",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-claim-6",
            path="Claim.insurance",
            description="Claim MUST include SHA insurance/coverage reference",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-claim-7",
            path="Claim.diagnosis",
            description="Claim MUST include at least one diagnosis",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-claim-8",
            path="Claim.diagnosis.diagnosisCodeableConcept.coding.system",
            description="Diagnosis MUST use ICD-11 coding system (not ICD-10)",
            severity=ProfileSeverity.ERROR,
            fixed_value="http://id.who.int/icd/release/11/mms",
        ),
        ProfileConstraint(
            id="sha-claim-9",
            path="Claim.item",
            description="Claim MUST include at least one item",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-claim-10",
            path="Claim.item.productOrService.coding.system",
            description="Claim items SHOULD use SHA interventions or ICHI codes",
            severity=ProfileSeverity.WARNING,
        ),
        ProfileConstraint(
            id="sha-claim-11",
            path="Claim.total",
            description="Claim MUST include total amount",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-claim-12",
            path="Claim.total.currency",
            description="Claim total currency MUST be KES",
            severity=ProfileSeverity.ERROR,
            fixed_value="KES",
        ),
    ],
)


# =============================================================================
# SHA Coverage Profile
# =============================================================================

SHA_COVERAGE_PROFILE = SHAProfile(
    resource_type="Coverage",
    profile_url="urn:sha:fhir:profile:Coverage",
    name="SHA Coverage Profile",
    description="Kenya SHA insurance coverage with scheme extensions",
    constraints=[
        ProfileConstraint(
            id="sha-coverage-1",
            path="Coverage.status",
            description="Coverage status MUST be 'active'",
            severity=ProfileSeverity.ERROR,
            fixed_value="active",
        ),
        ProfileConstraint(
            id="sha-coverage-2",
            path="Coverage.beneficiary",
            description="Coverage MUST reference the Patient",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-coverage-3",
            path="Coverage.payor",
            description="Coverage MUST include SHA as payor",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-coverage-4",
            path="Coverage.class",
            description="Coverage MUST include SHA scheme class",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-coverage-5",
            path="Coverage.class.type.coding.system",
            description="Coverage class type MUST use SHA scheme system",
            severity=ProfileSeverity.ERROR,
            fixed_value="urn:sha:scheme",
        ),
        ProfileConstraint(
            id="sha-coverage-6",
            path="Coverage.class.value",
            description="Coverage class value MUST be valid SHA scheme (CAT-SHA-001, CAT-SHA-002, CAT-SHA-003)",
            severity=ProfileSeverity.ERROR,
            pattern=r"^CAT-SHA-00[123]$",
        ),
    ],
)


# =============================================================================
# SHA Organization Profile
# =============================================================================

SHA_ORGANIZATION_PROFILE = SHAProfile(
    resource_type="Organization",
    profile_url="urn:sha:fhir:profile:Organization",
    name="SHA Organization Profile",
    description="Kenya healthcare facility with MFL (Master Facility List) code",
    constraints=[
        ProfileConstraint(
            id="sha-org-1",
            path="Organization.identifier",
            description="Organization MUST have at least one identifier",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-org-2",
            path="Organization.identifier:mfl",
            description="Organization MUST have MFL (Master Facility List) code",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
            expression="identifier.where(system='urn:kenya:mfl').exists()",
        ),
        ProfileConstraint(
            id="sha-org-3",
            path="Organization.identifier:mfl.value",
            description="MFL code must be 5-digit number",
            severity=ProfileSeverity.ERROR,
            pattern=r"^\d{5}$",
        ),
        ProfileConstraint(
            id="sha-org-4",
            path="Organization.active",
            description="Organization active status MUST be specified",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-org-5",
            path="Organization.name",
            description="Organization name MUST be provided",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-org-6",
            path="Organization.type",
            description="Organization type SHOULD be specified",
            severity=ProfileSeverity.WARNING,
        ),
        ProfileConstraint(
            id="sha-org-7",
            path="Organization.address",
            description="Organization address SHOULD be provided",
            severity=ProfileSeverity.WARNING,
        ),
        ProfileConstraint(
            id="sha-org-8",
            path="Organization.address.country",
            description="Organization country SHOULD be 'KE'",
            severity=ProfileSeverity.INFO,
            pattern=r"^KE$",
        ),
    ],
)


# =============================================================================
# SHA Bundle Profile (for Claims)
# =============================================================================

SHA_CLAIM_BUNDLE_PROFILE = SHAProfile(
    resource_type="Bundle",
    profile_url="urn:sha:fhir:profile:ClaimBundle",
    name="SHA Claim Bundle Profile",
    description="Kenya SHA claim submission bundle with required resources",
    constraints=[
        ProfileConstraint(
            id="sha-bundle-1",
            path="Bundle.type",
            description="Claim bundle type MUST be 'message'",
            severity=ProfileSeverity.ERROR,
            fixed_value="message",
        ),
        ProfileConstraint(
            id="sha-bundle-2",
            path="Bundle.timestamp",
            description="Bundle MUST have timestamp",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-bundle-3",
            path="Bundle.entry",
            description="Bundle MUST contain entries",
            severity=ProfileSeverity.ERROR,
            min_cardinality=1,
        ),
        ProfileConstraint(
            id="sha-bundle-4",
            path="Bundle.entry:organization",
            description="Bundle MUST contain Organization resource",
            severity=ProfileSeverity.ERROR,
            expression="entry.resource.where(resourceType='Organization').exists()",
        ),
        ProfileConstraint(
            id="sha-bundle-5",
            path="Bundle.entry:patient",
            description="Bundle MUST contain Patient resource",
            severity=ProfileSeverity.ERROR,
            expression="entry.resource.where(resourceType='Patient').exists()",
        ),
        ProfileConstraint(
            id="sha-bundle-6",
            path="Bundle.entry:coverage",
            description="Bundle MUST contain Coverage resource",
            severity=ProfileSeverity.ERROR,
            expression="entry.resource.where(resourceType='Coverage').exists()",
        ),
        ProfileConstraint(
            id="sha-bundle-7",
            path="Bundle.entry:claim",
            description="Bundle MUST contain Claim resource",
            severity=ProfileSeverity.ERROR,
            expression="entry.resource.where(resourceType='Claim').exists()",
        ),
    ],
)


# Export all profiles
__all__ = [
    "ProfileSeverity",
    "ProfileConstraint",
    "SHAProfile",
    "SHACodingSystems",
    "SHASchemes",
    "SHA_PATIENT_PROFILE",
    "SHA_CLAIM_PROFILE",
    "SHA_COVERAGE_PROFILE",
    "SHA_ORGANIZATION_PROFILE",
    "SHA_CLAIM_BUNDLE_PROFILE",
]
