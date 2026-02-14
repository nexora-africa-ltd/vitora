"""
Tests for SHA FHIR Profile Validator.

Tests the SHAProfileValidator service which validates FHIR resources
against Kenya SHA-specific profiles.

Reference: docs/fhir-validation-plan.md Phase 2
"""

import uuid
from datetime import datetime

import pytest  # type: ignore

from hmis.apps.core.fhir.profiles import (
    SHA_CLAIM_BUNDLE_PROFILE,
    SHA_CLAIM_PROFILE,
    SHA_COVERAGE_PROFILE,
    SHA_ORGANIZATION_PROFILE,
    SHA_PATIENT_PROFILE,
    ProfileSeverity,
    SHACodingSystems,
    SHASchemes,
)
from hmis.apps.core.services.sha_profile_validator import (
    ProfileViolation,
    SHAProfileValidationResult,
    SHAProfileValidator,
    validate_sha_resource,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def validator():
    """Create a SHAProfileValidator instance."""
    return SHAProfileValidator()


@pytest.fixture
def validator_no_fhir():
    """Create a SHAProfileValidator without base FHIR validation."""
    return SHAProfileValidator(validate_fhir_first=False)


@pytest.fixture
def valid_sha_patient():
    """Valid SHA-compliant Patient resource."""
    return {
        "resourceType": "Patient",
        "id": str(uuid.uuid4()),
        "identifier": [
            {
                "system": "urn:sha:client-registry",
                "value": "CR06XX3268000-3-1",
            },
            {
                "system": "urn:kenya:national-id",
                "value": "12345678",
            },
        ],
        "active": True,
        "name": [
            {
                "use": "official",
                "family": "Ochieng",
                "given": ["Jane", "Wanjiku"],
                "text": "Jane Wanjiku Ochieng",
            }
        ],
        "gender": "female",
        "birthDate": "1985-05-20",
        "telecom": [
            {
                "system": "phone",
                "value": "+254712345678",
                "use": "mobile",
            }
        ],
        "address": [
            {
                "use": "home",
                "line": ["123 Moi Avenue"],
                "city": "Nairobi",
                "country": "KE",
            }
        ],
    }


@pytest.fixture
def valid_sha_organization():
    """Valid SHA-compliant Organization resource."""
    return {
        "resourceType": "Organization",
        "id": str(uuid.uuid4()),
        "identifier": [
            {
                "system": "urn:kenya:mfl",
                "value": "12345",
            }
        ],
        "active": True,
        "name": "Demo Health Facility",
        "type": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/organization-type",
                        "code": "prov",
                        "display": "Healthcare Provider",
                    }
                ]
            }
        ],
        "address": [
            {
                "city": "Nairobi",
                "country": "KE",
            }
        ],
    }


@pytest.fixture
def valid_sha_coverage():
    """Valid SHA-compliant Coverage resource."""
    return {
        "resourceType": "Coverage",
        "id": str(uuid.uuid4()),
        "status": "active",
        "beneficiary": {"reference": "Patient/patient-123"},
        "payor": [{"reference": "Organization/sha-org"}],
        "class": [
            {
                "type": {
                    "coding": [
                        {
                            "system": "urn:sha:scheme",
                            "code": "scheme",
                        }
                    ]
                },
                "value": "CAT-SHA-001",
                "name": "Social Health Insurance Fund",
            }
        ],
    }


@pytest.fixture
def valid_sha_claim(valid_sha_patient, valid_sha_organization, valid_sha_coverage):
    """Valid SHA-compliant Claim resource."""
    return {
        "resourceType": "Claim",
        "id": str(uuid.uuid4()),
        "status": "active",
        "type": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/claim-type",
                    "code": "institutional",
                }
            ]
        },
        "use": "claim",
        "patient": {"reference": f"Patient/{valid_sha_patient['id']}"},
        "created": datetime.now().strftime("%Y-%m-%dT%H:%M:%S+03:00"),
        "provider": {"reference": f"Organization/{valid_sha_organization['id']}"},
        "priority": {"coding": [{"code": "normal"}]},
        "insurance": [
            {
                "sequence": 1,
                "focal": True,
                "coverage": {"reference": f"Coverage/{valid_sha_coverage['id']}"},
            }
        ],
        "diagnosis": [
            {
                "sequence": 1,
                "diagnosisCodeableConcept": {
                    "coding": [
                        {
                            "system": "http://id.who.int/icd/release/11/mms",
                            "code": "CA40.Z",
                            "display": "Malaria, unspecified",
                        }
                    ]
                },
            }
        ],
        "item": [
            {
                "sequence": 1,
                "productOrService": {
                    "coding": [
                        {
                            "system": "urn:sha:interventions",
                            "code": "INT-001",
                            "display": "Outpatient Consultation",
                        }
                    ]
                },
                "unitPrice": {"value": 500, "currency": "KES"},
            }
        ],
        "total": {"value": 500, "currency": "KES"},
    }


@pytest.fixture
def valid_sha_claim_bundle(
    valid_sha_patient, valid_sha_organization, valid_sha_coverage, valid_sha_claim
):
    """Valid SHA-compliant claim bundle."""
    return {
        "resourceType": "Bundle",
        "id": str(uuid.uuid4()),
        "type": "message",
        "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%S+03:00"),
        "entry": [
            {
                "fullUrl": f"urn:uuid:{valid_sha_organization['id']}",
                "resource": valid_sha_organization,
            },
            {
                "fullUrl": f"urn:uuid:{valid_sha_patient['id']}",
                "resource": valid_sha_patient,
            },
            {
                "fullUrl": f"urn:uuid:{valid_sha_coverage['id']}",
                "resource": valid_sha_coverage,
            },
            {
                "fullUrl": f"urn:uuid:{valid_sha_claim['id']}",
                "resource": valid_sha_claim,
            },
        ],
    }


# =============================================================================
# Test Profile Definitions
# =============================================================================


class TestSHAProfileDefinitions:
    """Tests for SHA profile definitions."""

    def test_patient_profile_has_constraints(self):
        """SHA Patient profile should have constraints defined."""
        assert len(SHA_PATIENT_PROFILE.constraints) > 0
        assert SHA_PATIENT_PROFILE.resource_type == "Patient"

    def test_claim_profile_has_constraints(self):
        """SHA Claim profile should have constraints defined."""
        assert len(SHA_CLAIM_PROFILE.constraints) > 0
        assert SHA_CLAIM_PROFILE.resource_type == "Claim"

    def test_coverage_profile_has_constraints(self):
        """SHA Coverage profile should have constraints defined."""
        assert len(SHA_COVERAGE_PROFILE.constraints) > 0
        assert SHA_COVERAGE_PROFILE.resource_type == "Coverage"

    def test_organization_profile_has_constraints(self):
        """SHA Organization profile should have constraints defined."""
        assert len(SHA_ORGANIZATION_PROFILE.constraints) > 0
        assert SHA_ORGANIZATION_PROFILE.resource_type == "Organization"

    def test_claim_bundle_profile_has_constraints(self):
        """SHA Claim Bundle profile should have constraints defined."""
        assert len(SHA_CLAIM_BUNDLE_PROFILE.constraints) > 0
        assert SHA_CLAIM_BUNDLE_PROFILE.resource_type == "Bundle"


# =============================================================================
# Test SHAProfileValidationResult
# =============================================================================


class TestSHAProfileValidationResult:
    """Tests for SHAProfileValidationResult class."""

    def test_new_result_is_valid(self):
        """New result should be valid by default."""
        result = SHAProfileValidationResult(SHA_PATIENT_PROFILE)
        assert result.is_valid is True
        assert len(result.violations) == 0

    def test_error_violation_makes_invalid(self):
        """Error-level violation should make result invalid."""
        result = SHAProfileValidationResult(SHA_PATIENT_PROFILE)
        result.add_violation(
            ProfileViolation(
                constraint_id="test",
                path="Patient.identifier",
                message="Test error",
                severity=ProfileSeverity.ERROR,
            )
        )
        assert result.is_valid is False
        assert len(result.errors) == 1

    def test_warning_keeps_valid(self):
        """Warning-level violation should not affect validity."""
        result = SHAProfileValidationResult(SHA_PATIENT_PROFILE)
        result.add_violation(
            ProfileViolation(
                constraint_id="test",
                path="Patient.telecom",
                message="Test warning",
                severity=ProfileSeverity.WARNING,
            )
        )
        assert result.is_valid is True
        assert len(result.warnings) == 1

    def test_to_dict(self):
        """Test conversion to dictionary."""
        result = SHAProfileValidationResult(SHA_PATIENT_PROFILE)
        result.add_violation(
            ProfileViolation(
                constraint_id="sha-patient-1",
                path="Patient.identifier",
                message="Missing identifier",
                severity=ProfileSeverity.ERROR,
            )
        )
        data = result.to_dict()
        assert data["profile"] == SHA_PATIENT_PROFILE.profile_url
        assert data["is_valid"] is False
        assert data["error_count"] == 1


# =============================================================================
# Test Patient Validation
# =============================================================================


class TestSHAPatientValidation:
    """Tests for Patient profile validation."""

    def test_valid_patient_passes(self, validator, valid_sha_patient):
        """Valid SHA patient should pass validation."""
        result = validator.validate_patient(valid_sha_patient)
        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_patient_missing_identifier_fails(self, validator_no_fhir, valid_sha_patient):
        """Patient without identifier should fail."""
        patient = valid_sha_patient.copy()
        patient["identifier"] = []
        result = validator_no_fhir.validate_patient(patient)
        assert result.is_valid is False
        assert any("sha-patient-1" in v.constraint_id for v in result.violations)

    def test_patient_missing_cr_identifier_fails(self, validator_no_fhir, valid_sha_patient):
        """Patient without CR identifier should fail."""
        patient = valid_sha_patient.copy()
        patient["identifier"] = [{"system": "urn:kenya:national-id", "value": "12345678"}]
        result = validator_no_fhir.validate_patient(patient)
        assert result.is_valid is False
        assert any("sha-patient-2" in v.constraint_id for v in result.violations)

    def test_patient_invalid_cr_format_fails(self, validator_no_fhir, valid_sha_patient):
        """Patient with invalid CR format should fail."""
        patient = valid_sha_patient.copy()
        patient["identifier"] = [{"system": "urn:sha:client-registry", "value": "INVALID123"}]
        result = validator_no_fhir.validate_patient(patient)
        assert result.is_valid is False
        assert any("sha-patient-3" in v.constraint_id for v in result.violations)

    def test_patient_missing_name_fails(self, validator_no_fhir, valid_sha_patient):
        """Patient without name should fail."""
        patient = valid_sha_patient.copy()
        patient["name"] = []
        result = validator_no_fhir.validate_patient(patient)
        assert result.is_valid is False
        assert any("sha-patient-4" in v.constraint_id for v in result.violations)

    def test_patient_missing_family_name_fails(self, validator_no_fhir, valid_sha_patient):
        """Patient without family name should fail."""
        patient = valid_sha_patient.copy()
        patient["name"] = [{"given": ["Jane"]}]
        result = validator_no_fhir.validate_patient(patient)
        assert result.is_valid is False
        assert any("sha-patient-5" in v.constraint_id for v in result.violations)

    def test_patient_missing_given_name_warns(self, validator_no_fhir, valid_sha_patient):
        """Patient without given name should warn."""
        patient = valid_sha_patient.copy()
        patient["name"] = [{"family": "Ochieng"}]
        result = validator_no_fhir.validate_patient(patient)
        # Should still be valid but with warning
        assert any("sha-patient-6" in v.constraint_id for v in result.warnings)

    def test_patient_missing_gender_fails(self, validator_no_fhir, valid_sha_patient):
        """Patient without gender should fail."""
        patient = valid_sha_patient.copy()
        del patient["gender"]
        result = validator_no_fhir.validate_patient(patient)
        assert result.is_valid is False
        assert any("sha-patient-7" in v.constraint_id for v in result.violations)

    def test_patient_missing_telecom_warns(self, validator_no_fhir, valid_sha_patient):
        """Patient without telecom should warn."""
        patient = valid_sha_patient.copy()
        patient["telecom"] = []
        result = validator_no_fhir.validate_patient(patient)
        assert any("sha-patient-9" in v.constraint_id for v in result.warnings)


# =============================================================================
# Test Claim Validation
# =============================================================================


class TestSHAClaimValidation:
    """Tests for Claim profile validation."""

    def test_valid_claim_passes(self, validator, valid_sha_claim):
        """Valid SHA claim should pass validation."""
        result = validator.validate_claim(valid_sha_claim)
        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_claim_wrong_use_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim with wrong use value should fail."""
        claim = valid_sha_claim.copy()
        claim["use"] = "preauthorization"
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-3" in v.constraint_id for v in result.violations)

    def test_claim_missing_patient_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim without patient should fail."""
        claim = valid_sha_claim.copy()
        del claim["patient"]
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-4" in v.constraint_id for v in result.violations)

    def test_claim_missing_provider_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim without provider should fail."""
        claim = valid_sha_claim.copy()
        del claim["provider"]
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-5" in v.constraint_id for v in result.violations)

    def test_claim_missing_insurance_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim without insurance should fail."""
        claim = valid_sha_claim.copy()
        claim["insurance"] = []
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-6" in v.constraint_id for v in result.violations)

    def test_claim_missing_diagnosis_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim without diagnosis should fail."""
        claim = valid_sha_claim.copy()
        claim["diagnosis"] = []
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-7" in v.constraint_id for v in result.violations)

    def test_claim_icd10_diagnosis_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim with ICD-10 diagnosis (not ICD-11) should fail."""
        claim = valid_sha_claim.copy()
        claim["diagnosis"] = [
            {
                "sequence": 1,
                "diagnosisCodeableConcept": {
                    "coding": [
                        {
                            "system": "http://hl7.org/fhir/sid/icd-10",
                            "code": "B54",
                            "display": "Unspecified malaria",
                        }
                    ]
                },
            }
        ]
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-8" in v.constraint_id for v in result.violations)
        # Check error message mentions ICD-11
        icd_errors = [v for v in result.violations if "sha-claim-8" in v.constraint_id]
        assert any("ICD-11" in v.message for v in icd_errors)

    def test_claim_missing_items_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim without items should fail."""
        claim = valid_sha_claim.copy()
        claim["item"] = []
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-9" in v.constraint_id for v in result.violations)

    def test_claim_missing_total_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim without total should fail."""
        claim = valid_sha_claim.copy()
        del claim["total"]
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-11" in v.constraint_id for v in result.violations)

    def test_claim_wrong_currency_fails(self, validator_no_fhir, valid_sha_claim):
        """Claim with wrong currency should fail."""
        claim = valid_sha_claim.copy()
        claim["total"] = {"value": 500, "currency": "USD"}
        result = validator_no_fhir.validate_claim(claim)
        assert result.is_valid is False
        assert any("sha-claim-12" in v.constraint_id for v in result.violations)


# =============================================================================
# Test Coverage Validation
# =============================================================================


class TestSHACoverageValidation:
    """Tests for Coverage profile validation."""

    def test_valid_coverage_passes(self, validator, valid_sha_coverage):
        """Valid SHA coverage should pass validation."""
        result = validator.validate_coverage(valid_sha_coverage)
        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_coverage_inactive_fails(self, validator_no_fhir, valid_sha_coverage):
        """Coverage with inactive status should fail."""
        coverage = valid_sha_coverage.copy()
        coverage["status"] = "cancelled"
        result = validator_no_fhir.validate_coverage(coverage)
        assert result.is_valid is False
        assert any("sha-coverage-1" in v.constraint_id for v in result.violations)

    def test_coverage_missing_beneficiary_fails(self, validator_no_fhir, valid_sha_coverage):
        """Coverage without beneficiary should fail."""
        coverage = valid_sha_coverage.copy()
        del coverage["beneficiary"]
        result = validator_no_fhir.validate_coverage(coverage)
        assert result.is_valid is False
        assert any("sha-coverage-2" in v.constraint_id for v in result.violations)

    def test_coverage_invalid_scheme_fails(self, validator_no_fhir, valid_sha_coverage):
        """Coverage with invalid scheme should fail."""
        coverage = valid_sha_coverage.copy()
        coverage["class"] = [{"value": "INVALID-SCHEME"}]
        result = validator_no_fhir.validate_coverage(coverage)
        assert result.is_valid is False
        assert any("sha-coverage-6" in v.constraint_id for v in result.violations)

    def test_coverage_valid_schemes(self, validator_no_fhir, valid_sha_coverage):
        """All valid SHA schemes should pass."""
        for scheme in ["CAT-SHA-001", "CAT-SHA-002", "CAT-SHA-003"]:
            coverage = valid_sha_coverage.copy()
            coverage["class"] = [{"value": scheme}]
            result = validator_no_fhir.validate_coverage(coverage)
            # Should not have sha-coverage-6 error
            scheme_errors = [v for v in result.errors if "sha-coverage-6" in v.constraint_id]
            assert len(scheme_errors) == 0


# =============================================================================
# Test Organization Validation
# =============================================================================


class TestSHAOrganizationValidation:
    """Tests for Organization profile validation."""

    def test_valid_organization_passes(self, validator, valid_sha_organization):
        """Valid SHA organization should pass validation."""
        result = validator.validate_organization(valid_sha_organization)
        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_organization_missing_identifier_fails(self, validator_no_fhir, valid_sha_organization):
        """Organization without identifier should fail."""
        org = valid_sha_organization.copy()
        org["identifier"] = []
        result = validator_no_fhir.validate_organization(org)
        assert result.is_valid is False
        assert any("sha-org-1" in v.constraint_id for v in result.violations)

    def test_organization_missing_mfl_fails(self, validator_no_fhir, valid_sha_organization):
        """Organization without MFL code should fail."""
        org = valid_sha_organization.copy()
        org["identifier"] = [{"system": "other", "value": "12345"}]
        result = validator_no_fhir.validate_organization(org)
        assert result.is_valid is False
        assert any("sha-org-2" in v.constraint_id for v in result.violations)

    def test_organization_invalid_mfl_format_fails(self, validator_no_fhir, valid_sha_organization):
        """Organization with invalid MFL format should fail."""
        org = valid_sha_organization.copy()
        org["identifier"] = [{"system": "urn:kenya:mfl", "value": "123"}]  # Too short
        result = validator_no_fhir.validate_organization(org)
        assert result.is_valid is False
        assert any("sha-org-3" in v.constraint_id for v in result.violations)

    def test_organization_missing_name_fails(self, validator_no_fhir, valid_sha_organization):
        """Organization without name should fail."""
        org = valid_sha_organization.copy()
        del org["name"]
        result = validator_no_fhir.validate_organization(org)
        assert result.is_valid is False
        assert any("sha-org-5" in v.constraint_id for v in result.violations)


# =============================================================================
# Test Bundle Validation
# =============================================================================


class TestSHAClaimBundleValidation:
    """Tests for Claim Bundle profile validation."""

    def test_valid_bundle_passes(self, validator, valid_sha_claim_bundle):
        """Valid SHA claim bundle should pass validation."""
        result = validator.validate_claim_bundle(valid_sha_claim_bundle)
        # May have warnings but no errors
        assert len(result.errors) == 0

    def test_bundle_wrong_type_fails(self, validator_no_fhir, valid_sha_claim_bundle):
        """Bundle with wrong type should fail."""
        bundle = valid_sha_claim_bundle.copy()
        bundle["type"] = "document"
        result = validator_no_fhir.validate_claim_bundle(bundle)
        assert any("sha-bundle-1" in v.constraint_id for v in result.violations)

    def test_bundle_missing_timestamp_fails(self, validator_no_fhir, valid_sha_claim_bundle):
        """Bundle without timestamp should fail."""
        bundle = valid_sha_claim_bundle.copy()
        del bundle["timestamp"]
        result = validator_no_fhir.validate_claim_bundle(bundle)
        assert any("sha-bundle-2" in v.constraint_id for v in result.violations)

    def test_bundle_missing_organization_fails(self, validator_no_fhir, valid_sha_claim_bundle):
        """Bundle without Organization should fail."""
        bundle = valid_sha_claim_bundle.copy()
        bundle["entry"] = [
            e for e in bundle["entry"] if e["resource"]["resourceType"] != "Organization"
        ]
        result = validator_no_fhir.validate_claim_bundle(bundle)
        assert any("sha-bundle-4" in v.constraint_id for v in result.violations)

    def test_bundle_missing_patient_fails(self, validator_no_fhir, valid_sha_claim_bundle):
        """Bundle without Patient should fail."""
        bundle = valid_sha_claim_bundle.copy()
        bundle["entry"] = [e for e in bundle["entry"] if e["resource"]["resourceType"] != "Patient"]
        result = validator_no_fhir.validate_claim_bundle(bundle)
        assert any("sha-bundle-5" in v.constraint_id for v in result.violations)

    def test_bundle_missing_claim_fails(self, validator_no_fhir, valid_sha_claim_bundle):
        """Bundle without Claim should fail."""
        bundle = valid_sha_claim_bundle.copy()
        bundle["entry"] = [e for e in bundle["entry"] if e["resource"]["resourceType"] != "Claim"]
        result = validator_no_fhir.validate_claim_bundle(bundle)
        assert any("sha-bundle-7" in v.constraint_id for v in result.violations)


# =============================================================================
# Test Convenience Functions
# =============================================================================


class TestConvenienceFunctions:
    """Tests for convenience functions."""

    def test_validate_sha_resource_patient(self, valid_sha_patient):
        """validate_sha_resource should work for Patient."""
        result = validate_sha_resource(valid_sha_patient)
        assert result.profile.resource_type == "Patient"

    def test_validate_sha_resource_claim(self, valid_sha_claim):
        """validate_sha_resource should work for Claim."""
        result = validate_sha_resource(valid_sha_claim)
        assert result.profile.resource_type == "Claim"

    def test_validate_sha_resource_coverage(self, valid_sha_coverage):
        """validate_sha_resource should work for Coverage."""
        result = validate_sha_resource(valid_sha_coverage)
        assert result.profile.resource_type == "Coverage"

    def test_validate_sha_resource_organization(self, valid_sha_organization):
        """validate_sha_resource should work for Organization."""
        result = validate_sha_resource(valid_sha_organization)
        assert result.profile.resource_type == "Organization"

    def test_validate_sha_resource_bundle(self, valid_sha_claim_bundle):
        """validate_sha_resource should work for Bundle."""
        result = validate_sha_resource(valid_sha_claim_bundle)
        assert result.profile.resource_type == "Bundle"

    def test_validate_sha_resource_unsupported(self):
        """validate_sha_resource should warn for unsupported types."""
        result = validate_sha_resource({"resourceType": "Procedure"})
        assert any("unsupported" in v.constraint_id for v in result.violations)


# =============================================================================
# Test Coding Systems
# =============================================================================


class TestSHACodingSystems:
    """Tests for SHA coding system constants."""

    def test_icd11_system_url(self):
        """ICD-11 system URL should be correct."""
        assert SHACodingSystems.ICD11 == "http://id.who.int/icd/release/11/mms"

    def test_mfl_system_url(self):
        """MFL system URL should be correct."""
        assert SHACodingSystems.MFL_CODE == "urn:kenya:mfl"

    def test_client_registry_system_url(self):
        """Client Registry system URL should be correct."""
        assert SHACodingSystems.CLIENT_REGISTRY == "urn:sha:client-registry"


# =============================================================================
# Test SHA Schemes
# =============================================================================


class TestSHASchemes:
    """Tests for SHA scheme constants."""

    def test_sha_scheme_codes(self):
        """SHA scheme codes should be defined."""
        assert SHASchemes.CAT_SHA_001 == "CAT-SHA-001"
        assert SHASchemes.CAT_SHA_002 == "CAT-SHA-002"
        assert SHASchemes.CAT_SHA_003 == "CAT-SHA-003"
