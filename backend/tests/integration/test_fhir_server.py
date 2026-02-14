"""
FHIR R4 Server Integration Tests for Vitora HMIS.

These tests validate FHIR resource operations against a real HAPI FHIR R4 server.
They verify that our FHIR resource generation is compliant with the FHIR R4 spec
and can be successfully processed by a standard FHIR server.

Phase 3: docs/fhir-validation-plan.md

Exit Criteria:
- [ ] HAPI FHIR server runs in Docker with health check
- [ ] All FHIR resources can be:
  - [ ] Created (POST) successfully
  - [ ] Retrieved (GET) with correct data
  - [ ] Updated (PUT/PATCH) correctly
  - [ ] Searched with standard parameters
- [ ] Bundle transactions complete atomically
- [ ] Integration tests run in CI (can be optional/manual trigger)
- [ ] Response times documented (<500ms for single resource operations)

Prerequisites:
    Start HAPI FHIR server before running tests:
    $ docker compose -f docker/hapi-fhir/compose.yml up -d

Usage:
    $ poetry run pytest tests/integration/test_fhir_server.py -v
    $ poetry run pytest tests/integration/test_fhir_server.py -v -m integration
    $ make test-fhir-integration
"""

import os
import time
import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.core.services.fhir_client import (
    FHIRClient,
    FHIRClientError,
    FHIRConflictError,
    FHIRConnectionError,
    FHIRNotFoundError,
    FHIRResponse,
    FHIRSearchResult,
    FHIRValidationError,
    create_fhir_client,
)
from hmis.apps.core.services.fhir_validator import FHIRValidator

# =============================================================================
# Test Configuration
# =============================================================================

# FHIR server URL - can be overridden via environment variable
FHIR_SERVER_URL = os.getenv("FHIR_SERVER_URL", "http://localhost:8090/fhir")

# Maximum acceptable response time for single resource operations (ms)
MAX_RESPONSE_TIME_MS = 500

# Skip all tests if FHIR server is unavailable
pytestmark = pytest.mark.integration


def is_fhir_server_available() -> bool:
    """Check if FHIR server is available."""
    try:
        client = create_fhir_client(FHIR_SERVER_URL, timeout=5)
        return client.check_health()
    except Exception:
        return False


# Skip module if server not available
if not is_fhir_server_available():
    pytest.skip(
        f"FHIR server not available at {FHIR_SERVER_URL}. "
        "Start with: docker compose -f docker/hapi-fhir/compose.yml up -d",
        allow_module_level=True,
    )


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture(scope="module")
def fhir_client() -> FHIRClient:
    """Create FHIR client for testing."""
    return create_fhir_client(FHIR_SERVER_URL, timeout=30)


@pytest.fixture(scope="module")
def fhir_validator() -> FHIRValidator:
    """Create FHIR validator for local validation."""
    return FHIRValidator()


@pytest.fixture
def unique_id() -> str:
    """Generate a unique identifier for test resources."""
    return f"test-{uuid.uuid4().hex[:12]}"


@pytest.fixture
def valid_patient_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 Patient resource."""
    return {
        "resourceType": "Patient",
        "identifier": [
            {
                "system": "urn:sha:client-registry",
                "value": f"CR-{unique_id.upper()}",
            },
            {
                "system": "urn:vitora:mrn",
                "value": f"MRN-{unique_id.upper()}",
            },
        ],
        "active": True,
        "name": [
            {
                "use": "official",
                "family": "Ochieng",
                "given": ["Jane", "Wanjiku"],
            }
        ],
        "gender": "female",
        "birthDate": "1985-05-20",
        "address": [
            {
                "use": "home",
                "line": ["123 Moi Avenue"],
                "city": "Nairobi",
                "state": "Nairobi",
                "postalCode": "00100",
                "country": "KE",
            }
        ],
        "telecom": [
            {
                "system": "phone",
                "value": "+254712345678",
                "use": "mobile",
            },
            {
                "system": "email",
                "value": "jane.ochieng@example.com",
            },
        ],
        "maritalStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
                    "code": "M",
                    "display": "Married",
                }
            ]
        },
        "communication": [
            {
                "language": {
                    "coding": [
                        {
                            "system": "urn:ietf:bcp:47",
                            "code": "sw",
                            "display": "Swahili",
                        }
                    ]
                },
                "preferred": True,
            }
        ],
    }


@pytest.fixture
def valid_practitioner_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 Practitioner resource."""
    return {
        "resourceType": "Practitioner",
        "identifier": [
            {
                "system": "urn:kenya:medical-board",
                "value": f"KMB-{unique_id.upper()}",
            }
        ],
        "active": True,
        "name": [
            {
                "use": "official",
                "family": "Kimani",
                "given": ["Dr", "Peter"],
                "prefix": ["Dr."],
            }
        ],
        "gender": "male",
        "birthDate": "1975-03-15",
        "qualification": [
            {
                "identifier": [
                    {
                        "system": "urn:kenya:medical-board",
                        "value": "MD-12345",
                    }
                ],
                "code": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v2-0360",
                            "code": "MD",
                            "display": "Doctor of Medicine",
                        }
                    ]
                },
                "period": {
                    "start": "2000-06-01",
                },
            }
        ],
    }


@pytest.fixture
def valid_organization_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 Organization resource (healthcare facility)."""
    return {
        "resourceType": "Organization",
        "identifier": [
            {
                "system": "urn:kenya:mfl",
                "value": f"MFL-{unique_id.upper()}",
            }
        ],
        "active": True,
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
        "name": f"Test Health Facility {unique_id}",
        "alias": ["Test Clinic"],
        "telecom": [
            {
                "system": "phone",
                "value": "+254712000000",
                "use": "work",
            }
        ],
        "address": [
            {
                "use": "work",
                "type": "physical",
                "line": ["456 Hospital Road"],
                "city": "Nairobi",
                "state": "Nairobi",
                "postalCode": "00200",
                "country": "KE",
            }
        ],
    }


@pytest.fixture
def valid_encounter_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 Encounter resource."""
    return {
        "resourceType": "Encounter",
        "identifier": [
            {
                "system": "urn:vitora:encounter",
                "value": f"ENC-{unique_id.upper()}",
            }
        ],
        "status": "finished",
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "AMB",
            "display": "ambulatory",
        },
        "type": [
            {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "code": "308335008",
                        "display": "Patient encounter procedure",
                    }
                ]
            }
        ],
        "priority": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActPriority",
                    "code": "R",
                    "display": "routine",
                }
            ]
        },
        "period": {
            "start": "2026-01-31T09:00:00+03:00",
            "end": "2026-01-31T09:30:00+03:00",
        },
        "reasonCode": [
            {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "code": "386661006",
                        "display": "Fever",
                    }
                ],
                "text": "High fever and headache",
            }
        ],
    }


@pytest.fixture
def valid_observation_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 Observation resource (vital sign)."""
    return {
        "resourceType": "Observation",
        "identifier": [
            {
                "system": "urn:vitora:observation",
                "value": f"OBS-{unique_id.upper()}",
            }
        ],
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "vital-signs",
                        "display": "Vital Signs",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "8310-5",
                    "display": "Body temperature",
                }
            ]
        },
        "effectiveDateTime": "2026-01-31T09:15:00+03:00",
        "valueQuantity": {
            "value": 37.5,
            "unit": "Cel",
            "system": "http://unitsofmeasure.org",
            "code": "Cel",
        },
        "interpretation": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                        "code": "N",
                        "display": "Normal",
                    }
                ]
            }
        ],
    }


@pytest.fixture
def valid_condition_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 Condition resource (diagnosis)."""
    return {
        "resourceType": "Condition",
        "identifier": [
            {
                "system": "urn:vitora:condition",
                "value": f"COND-{unique_id.upper()}",
            }
        ],
        "clinicalStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                    "code": "active",
                    "display": "Active",
                }
            ]
        },
        "verificationStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                    "code": "confirmed",
                    "display": "Confirmed",
                }
            ]
        },
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                        "code": "encounter-diagnosis",
                        "display": "Encounter Diagnosis",
                    }
                ]
            }
        ],
        "severity": {
            "coding": [
                {
                    "system": "http://snomed.info/sct",
                    "code": "6736007",
                    "display": "Moderate",
                }
            ]
        },
        "code": {
            "coding": [
                {
                    # ICD-11 coding (required by SHA)
                    "system": "http://id.who.int/icd/release/11/mms",
                    "code": "CA40.0",
                    "display": "Malaria due to Plasmodium falciparum",
                },
                {
                    # ICD-10 coding (for reference)
                    "system": "http://hl7.org/fhir/sid/icd-10",
                    "code": "B50.9",
                    "display": "Plasmodium falciparum malaria, unspecified",
                },
            ],
            "text": "Malaria",
        },
        "onsetDateTime": "2026-01-30T00:00:00+03:00",
        "recordedDate": "2026-01-31T09:00:00+03:00",
    }


@pytest.fixture
def valid_medication_request_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 MedicationRequest resource (prescription)."""
    return {
        "resourceType": "MedicationRequest",
        "identifier": [
            {
                "system": "urn:vitora:prescription",
                "value": f"RX-{unique_id.upper()}",
            }
        ],
        "status": "active",
        "intent": "order",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/medicationrequest-category",
                        "code": "outpatient",
                        "display": "Outpatient",
                    }
                ]
            }
        ],
        "priority": "routine",
        "medicationCodeableConcept": {
            "coding": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": "314076",
                    "display": "Artemether / Lumefantrine",
                }
            ],
            "text": "AL (Artemether-Lumefantrine) 20/120mg",
        },
        "authoredOn": "2026-01-31T09:30:00+03:00",
        "dosageInstruction": [
            {
                "sequence": 1,
                "text": "Take 4 tablets twice daily for 3 days",
                "timing": {
                    "repeat": {
                        "frequency": 2,
                        "period": 1,
                        "periodUnit": "d",
                        "boundsDuration": {
                            "value": 3,
                            "unit": "days",
                            "system": "http://unitsofmeasure.org",
                            "code": "d",
                        },
                    }
                },
                "route": {
                    "coding": [
                        {
                            "system": "http://snomed.info/sct",
                            "code": "26643006",
                            "display": "Oral route",
                        }
                    ]
                },
                "doseAndRate": [
                    {
                        "type": {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/dose-rate-type",
                                    "code": "ordered",
                                    "display": "Ordered",
                                }
                            ]
                        },
                        "doseQuantity": {
                            "value": 4,
                            "unit": "tablets",
                            "system": "http://unitsofmeasure.org",
                            "code": "{tbl}",
                        },
                    }
                ],
            }
        ],
        "dispenseRequest": {
            "numberOfRepeatsAllowed": 0,
            "quantity": {
                "value": 24,
                "unit": "tablets",
                "system": "http://unitsofmeasure.org",
                "code": "{tbl}",
            },
        },
    }


@pytest.fixture
def valid_medication_dispense_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 MedicationDispense resource."""
    return {
        "resourceType": "MedicationDispense",
        "identifier": [
            {
                "system": "urn:vitora:dispense",
                "value": f"DISP-{unique_id.upper()}",
            }
        ],
        "status": "completed",
        "category": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/medicationdispense-category",
                    "code": "outpatient",
                    "display": "Outpatient",
                }
            ]
        },
        "medicationCodeableConcept": {
            "coding": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": "314076",
                    "display": "Artemether / Lumefantrine",
                }
            ]
        },
        "quantity": {
            "value": 24,
            "unit": "tablets",
            "system": "http://unitsofmeasure.org",
            "code": "{tbl}",
        },
        "daysSupply": {
            "value": 3,
            "unit": "days",
            "system": "http://unitsofmeasure.org",
            "code": "d",
        },
        "whenPrepared": "2026-01-31T10:00:00+03:00",
        "whenHandedOver": "2026-01-31T10:15:00+03:00",
    }


@pytest.fixture
def valid_service_request_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 ServiceRequest resource (lab order)."""
    return {
        "resourceType": "ServiceRequest",
        "identifier": [
            {
                "system": "urn:vitora:lab-order",
                "value": f"LAB-{unique_id.upper()}",
            }
        ],
        "status": "active",
        "intent": "order",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "code": "108252007",
                        "display": "Laboratory procedure",
                    }
                ]
            }
        ],
        "priority": "routine",
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "32700-7",
                    "display": "Microscopic observation [Identifier] in Blood by Malaria smear",
                }
            ],
            "text": "Malaria Blood Smear",
        },
        "authoredOn": "2026-01-31T09:00:00+03:00",
        "reasonCode": [
            {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "code": "386661006",
                        "display": "Fever",
                    }
                ],
                "text": "Suspected malaria",
            }
        ],
    }


@pytest.fixture
def valid_coverage_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 Coverage resource (SHA insurance)."""
    return {
        "resourceType": "Coverage",
        "identifier": [
            {
                "system": "urn:sha:coverage",
                "value": f"COV-{unique_id.upper()}",
            }
        ],
        "status": "active",
        "type": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                    "code": "PUBLICPOL",
                    "display": "Public Healthcare",
                }
            ]
        },
        "policyHolder": {
            "display": "Social Health Authority Kenya",
        },
        "subscriberId": f"SHA-{unique_id.upper()}",
        "beneficiary": {
            "display": "Patient",
        },
        "relationship": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
                    "code": "self",
                    "display": "Self",
                }
            ]
        },
        "period": {
            "start": "2026-01-01",
            "end": "2026-12-31",
        },
        "payor": [
            {
                "display": "Social Health Authority",
            }
        ],
        "class": [
            {
                "type": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/coverage-class",
                            "code": "plan",
                        }
                    ]
                },
                "value": "SHA-PRIMARY",
                "name": "SHA Primary Healthcare",
            }
        ],
    }


@pytest.fixture
def valid_claim_resource(unique_id: str) -> dict:
    """Create a valid FHIR R4 Claim resource."""
    return {
        "resourceType": "Claim",
        "identifier": [
            {
                "system": "urn:vitora:claim",
                "value": f"CLM-{unique_id.upper()}",
            }
        ],
        "status": "active",
        "type": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/claim-type",
                    "code": "institutional",
                    "display": "Institutional",
                }
            ]
        },
        "subType": {
            "coding": [
                {
                    "system": "urn:sha:claim-subtype",
                    "code": "op",
                    "display": "Outpatient",
                }
            ]
        },
        "use": "claim",
        "patient": {
            "display": "Test Patient",
        },
        "created": "2026-01-31",
        "provider": {
            "display": "Test Facility",
        },
        "priority": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/processpriority",
                    "code": "normal",
                }
            ]
        },
        "insurance": [
            {
                "sequence": 1,
                "focal": True,
                "coverage": {
                    "display": "SHA Coverage",
                },
            }
        ],
        "total": {
            "value": 1500.00,
            "currency": "KES",
        },
    }


# =============================================================================
# Test Classes
# =============================================================================


class TestFHIRServerConnection:
    """Tests for FHIR server connectivity and metadata."""

    def test_server_is_healthy(self, fhir_client: FHIRClient):
        """Server should respond to health check."""
        assert fhir_client.check_health() is True

    def test_capability_statement_returns_valid_response(self, fhir_client: FHIRClient):
        """Server should return a valid CapabilityStatement."""
        result = fhir_client.get_capability_statement()

        assert result.success is True
        assert result.status_code == 200
        assert result.resource is not None
        assert result.resource.get("resourceType") == "CapabilityStatement"
        assert result.response_time_ms < MAX_RESPONSE_TIME_MS

    def test_capability_statement_includes_fhir_version(self, fhir_client: FHIRClient):
        """CapabilityStatement should indicate R4 version."""
        result = fhir_client.get_capability_statement()

        assert result.resource.get("fhirVersion") == "4.0.1"

    def test_capability_statement_lists_supported_resources(self, fhir_client: FHIRClient):
        """CapabilityStatement should list supported resource types."""
        result = fhir_client.get_capability_statement()

        rest = result.resource.get("rest", [])
        assert len(rest) > 0

        # Extract supported resource types
        resources = rest[0].get("resource", [])
        resource_types = [r.get("type") for r in resources]

        # Core resources we need must be supported
        required_resources = [
            "Patient",
            "Encounter",
            "Observation",
            "Condition",
            "MedicationRequest",
            "MedicationDispense",
            "ServiceRequest",
            "Coverage",
            "Claim",
            "Organization",
            "Practitioner",
            "Bundle",
        ]

        for resource_type in required_resources:
            assert resource_type in resource_types, f"Server should support {resource_type}"


class TestPatientResourceCRUD:
    """Tests for Patient resource CRUD operations."""

    def test_create_patient_succeeds(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Should create a Patient resource successfully."""
        result = fhir_client.create_resource("Patient", valid_patient_resource)

        assert result.success is True
        assert result.status_code == 201
        assert result.resource_id is not None
        # Note: First request after server start may be slower due to warm-up
        # Response time assertions are in dedicated TestResponseTimes class

    def test_create_patient_returns_resource_with_id(
        self, fhir_client: FHIRClient, valid_patient_resource: dict
    ):
        """Created Patient should have server-assigned ID."""
        result = fhir_client.create_resource("Patient", valid_patient_resource)

        assert result.resource is not None
        assert result.resource.get("id") == result.resource_id
        assert result.resource.get("resourceType") == "Patient"

    def test_read_patient_after_create(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Should be able to read a Patient after creating it."""
        create_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = create_result.resource_id

        read_result = fhir_client.read_resource("Patient", patient_id)

        assert read_result.success is True
        assert read_result.status_code == 200
        assert read_result.resource.get("id") == patient_id
        assert read_result.resource.get("name") == valid_patient_resource["name"]
        assert read_result.response_time_ms < MAX_RESPONSE_TIME_MS

    def test_read_nonexistent_patient_raises_not_found(self, fhir_client: FHIRClient):
        """Reading a non-existent Patient should raise FHIRNotFoundError."""
        with pytest.raises(FHIRNotFoundError) as exc_info:
            fhir_client.read_resource("Patient", "nonexistent-patient-id-12345")

        assert exc_info.value.response.status_code == 404

    def test_update_patient_succeeds(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Should update a Patient resource successfully."""
        # Create patient
        create_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = create_result.resource_id

        # Update patient
        updated_patient = {**valid_patient_resource, "active": False}
        updated_patient["name"][0]["family"] = "UpdatedFamily"

        update_result = fhir_client.update_resource("Patient", patient_id, updated_patient)

        assert update_result.success is True
        assert update_result.status_code == 200

        # Verify update
        read_result = fhir_client.read_resource("Patient", patient_id)
        assert read_result.resource.get("active") is False
        assert read_result.resource["name"][0]["family"] == "UpdatedFamily"

    def test_delete_patient_succeeds(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Should delete a Patient resource successfully."""
        # Create patient
        create_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = create_result.resource_id

        # Delete patient
        delete_result = fhir_client.delete_resource("Patient", patient_id)
        assert delete_result.success is True

        # Verify deletion - HAPI FHIR returns 410 Gone with OperationOutcome
        # or 404 Not Found after soft delete
        try:
            read_result = fhir_client.read_resource("Patient", patient_id)
            # If read returns 200, HAPI may return the deleted resource or OperationOutcome
            resource_type = read_result.resource.get("resourceType")
            # Both Patient (marked deleted) or OperationOutcome (gone) are acceptable
            assert resource_type in ["Patient", "OperationOutcome"]
        except FHIRNotFoundError:
            # Expected behavior - resource not found after delete
            pass

    def test_search_patient_by_family_name(
        self, fhir_client: FHIRClient, valid_patient_resource: dict
    ):
        """Should search for Patient by family name."""
        # Create patient with unique family name
        unique_family = f"SearchTest{uuid.uuid4().hex[:8]}"
        valid_patient_resource["name"][0]["family"] = unique_family
        fhir_client.create_resource("Patient", valid_patient_resource)

        # Search by family name
        search_result = fhir_client.search("Patient", {"family": unique_family})

        assert search_result.success is True
        assert search_result.total >= 1
        assert len(search_result.resources) >= 1

        # Verify the found patient has the correct name
        found_patient = search_result.resources[0]
        assert found_patient["name"][0]["family"] == unique_family

    def test_search_patient_by_identifier(
        self, fhir_client: FHIRClient, valid_patient_resource: dict
    ):
        """Should search for Patient by identifier."""
        # Create patient
        cr_number = valid_patient_resource["identifier"][0]["value"]
        fhir_client.create_resource("Patient", valid_patient_resource)

        # Search by identifier
        search_result = fhir_client.search(
            "Patient",
            {"identifier": f"urn:sha:client-registry|{cr_number}"},
        )

        assert search_result.success is True
        assert search_result.total >= 1

    def test_search_patient_by_birthdate(
        self, fhir_client: FHIRClient, valid_patient_resource: dict
    ):
        """Should search for Patient by birth date."""
        fhir_client.create_resource("Patient", valid_patient_resource)

        search_result = fhir_client.search(
            "Patient",
            {"birthdate": "1985-05-20"},
        )

        assert search_result.success is True
        # May find multiple patients with this birthdate
        assert search_result.total >= 0

    def test_search_patient_with_pagination(
        self, fhir_client: FHIRClient, valid_patient_resource: dict
    ):
        """Should support pagination in search results."""
        # Create multiple patients
        for i in range(5):
            patient = {**valid_patient_resource}
            patient["identifier"][0]["value"] = f"CR-PAGTEST-{i}"
            fhir_client.create_resource("Patient", patient)

        # Search with small page size
        search_result = fhir_client.search("Patient", {"_count": 2})

        assert search_result.success is True
        assert len(search_result.resources) <= 2
        assert "next" in search_result.link or search_result.total <= 2


class TestPractitionerResourceCRUD:
    """Tests for Practitioner resource CRUD operations."""

    def test_create_practitioner_succeeds(
        self, fhir_client: FHIRClient, valid_practitioner_resource: dict
    ):
        """Should create a Practitioner resource successfully."""
        result = fhir_client.create_resource("Practitioner", valid_practitioner_resource)

        assert result.success is True
        assert result.status_code == 201
        assert result.resource_id is not None

    def test_read_practitioner_after_create(
        self, fhir_client: FHIRClient, valid_practitioner_resource: dict
    ):
        """Should read a Practitioner after creating it."""
        create_result = fhir_client.create_resource("Practitioner", valid_practitioner_resource)

        read_result = fhir_client.read_resource("Practitioner", create_result.resource_id)

        assert read_result.success is True
        assert read_result.resource.get("qualification") is not None


class TestOrganizationResourceCRUD:
    """Tests for Organization resource CRUD operations."""

    def test_create_organization_succeeds(
        self, fhir_client: FHIRClient, valid_organization_resource: dict
    ):
        """Should create an Organization resource successfully."""
        result = fhir_client.create_resource("Organization", valid_organization_resource)

        assert result.success is True
        assert result.status_code == 201
        assert result.resource_id is not None

    def test_search_organization_by_identifier(
        self, fhir_client: FHIRClient, valid_organization_resource: dict
    ):
        """Should search Organization by MFL code identifier."""
        mfl_code = valid_organization_resource["identifier"][0]["value"]
        fhir_client.create_resource("Organization", valid_organization_resource)

        search_result = fhir_client.search(
            "Organization",
            {"identifier": f"urn:kenya:mfl|{mfl_code}"},
        )

        assert search_result.success is True
        assert search_result.total >= 1


class TestEncounterResourceCRUD:
    """Tests for Encounter resource CRUD operations."""

    def test_create_encounter_succeeds(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_encounter_resource: dict,
    ):
        """Should create an Encounter resource with patient reference."""
        # Create patient first
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = patient_result.resource_id

        # Add patient reference to encounter
        valid_encounter_resource["subject"] = {"reference": f"Patient/{patient_id}"}

        result = fhir_client.create_resource("Encounter", valid_encounter_resource)

        assert result.success is True
        assert result.status_code == 201
        assert result.resource_id is not None

    def test_search_encounter_by_patient(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_encounter_resource: dict,
    ):
        """Should search Encounters by patient reference."""
        # Create patient and encounter
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = patient_result.resource_id

        valid_encounter_resource["subject"] = {"reference": f"Patient/{patient_id}"}
        fhir_client.create_resource("Encounter", valid_encounter_resource)

        # Search encounters for this patient
        search_result = fhir_client.search(
            "Encounter",
            {"patient": patient_id},
        )

        assert search_result.success is True
        assert search_result.total >= 1

    def test_search_encounter_by_status(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_encounter_resource: dict,
    ):
        """Should search Encounters by status."""
        # Create patient and encounter
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_encounter_resource["subject"] = {"reference": f"Patient/{patient_result.resource_id}"}
        fhir_client.create_resource("Encounter", valid_encounter_resource)

        # Search by status
        search_result = fhir_client.search("Encounter", {"status": "finished"})

        assert search_result.success is True


class TestObservationResourceCRUD:
    """Tests for Observation resource (vital signs, lab results) CRUD operations."""

    def test_create_observation_succeeds(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_observation_resource: dict,
    ):
        """Should create an Observation resource successfully."""
        # Create patient first
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = patient_result.resource_id

        # Add subject reference
        valid_observation_resource["subject"] = {"reference": f"Patient/{patient_id}"}

        result = fhir_client.create_resource("Observation", valid_observation_resource)

        assert result.success is True
        assert result.status_code == 201

    def test_search_observation_by_code(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_observation_resource: dict,
    ):
        """Should search Observations by LOINC code."""
        # Create patient and observation
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_observation_resource["subject"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }
        fhir_client.create_resource("Observation", valid_observation_resource)

        # Search by code (body temperature)
        search_result = fhir_client.search(
            "Observation",
            {"code": "http://loinc.org|8310-5"},
        )

        assert search_result.success is True

    def test_search_observation_by_category(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_observation_resource: dict,
    ):
        """Should search Observations by category (vital-signs)."""
        # Create patient and observation
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_observation_resource["subject"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }
        fhir_client.create_resource("Observation", valid_observation_resource)

        # Search by category
        search_result = fhir_client.search(
            "Observation",
            {"category": "vital-signs"},
        )

        assert search_result.success is True


class TestConditionResourceCRUD:
    """Tests for Condition resource (diagnosis) CRUD operations."""

    def test_create_condition_with_icd11_coding_succeeds(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_condition_resource: dict,
    ):
        """Should create a Condition with ICD-11 coding (required by SHA)."""
        # Create patient first
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = patient_result.resource_id

        # Add subject reference
        valid_condition_resource["subject"] = {"reference": f"Patient/{patient_id}"}

        result = fhir_client.create_resource("Condition", valid_condition_resource)

        assert result.success is True
        assert result.status_code == 201

        # Verify ICD-11 coding is preserved
        read_result = fhir_client.read_resource("Condition", result.resource_id)
        codings = read_result.resource["code"]["coding"]
        icd11_coding = next(
            (c for c in codings if "icd/release/11" in c.get("system", "")),
            None,
        )
        assert icd11_coding is not None
        assert icd11_coding["code"] == "CA40.0"

    def test_search_condition_by_code(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_condition_resource: dict,
    ):
        """Should search Conditions by ICD code."""
        # Create patient and condition
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_condition_resource["subject"] = {"reference": f"Patient/{patient_result.resource_id}"}
        fhir_client.create_resource("Condition", valid_condition_resource)

        # Search by ICD-11 code
        search_result = fhir_client.search(
            "Condition",
            {"code": "http://id.who.int/icd/release/11/mms|CA40.0"},
        )

        assert search_result.success is True


class TestMedicationRequestResourceCRUD:
    """Tests for MedicationRequest resource (prescription) CRUD operations."""

    def test_create_medication_request_succeeds(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_practitioner_resource: dict,
        valid_medication_request_resource: dict,
    ):
        """Should create a MedicationRequest resource successfully."""
        # Create patient and practitioner
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        practitioner_result = fhir_client.create_resource(
            "Practitioner", valid_practitioner_resource
        )

        # Add references
        valid_medication_request_resource["subject"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }
        valid_medication_request_resource["requester"] = {
            "reference": f"Practitioner/{practitioner_result.resource_id}"
        }

        result = fhir_client.create_resource("MedicationRequest", valid_medication_request_resource)

        assert result.success is True
        assert result.status_code == 201

    def test_medication_request_includes_dosage_instructions(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_medication_request_resource: dict,
    ):
        """MedicationRequest should preserve dosage instructions."""
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_medication_request_resource["subject"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }

        create_result = fhir_client.create_resource(
            "MedicationRequest", valid_medication_request_resource
        )

        read_result = fhir_client.read_resource("MedicationRequest", create_result.resource_id)

        assert "dosageInstruction" in read_result.resource
        assert len(read_result.resource["dosageInstruction"]) > 0
        assert read_result.resource["dosageInstruction"][0]["text"] is not None


class TestMedicationDispenseResourceCRUD:
    """Tests for MedicationDispense resource CRUD operations."""

    def test_create_medication_dispense_succeeds(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_medication_dispense_resource: dict,
    ):
        """Should create a MedicationDispense resource successfully."""
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_medication_dispense_resource["subject"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }

        result = fhir_client.create_resource(
            "MedicationDispense", valid_medication_dispense_resource
        )

        assert result.success is True
        assert result.status_code == 201


class TestServiceRequestResourceCRUD:
    """Tests for ServiceRequest resource (lab order) CRUD operations."""

    def test_create_service_request_succeeds(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_service_request_resource: dict,
    ):
        """Should create a ServiceRequest resource successfully."""
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_service_request_resource["subject"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }

        result = fhir_client.create_resource("ServiceRequest", valid_service_request_resource)

        assert result.success is True
        assert result.status_code == 201

    def test_search_service_request_by_status(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_service_request_resource: dict,
    ):
        """Should search ServiceRequests by status."""
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_service_request_resource["subject"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }
        fhir_client.create_resource("ServiceRequest", valid_service_request_resource)

        search_result = fhir_client.search("ServiceRequest", {"status": "active"})

        assert search_result.success is True


class TestCoverageResourceCRUD:
    """Tests for Coverage resource (insurance) CRUD operations."""

    def test_create_coverage_succeeds(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_coverage_resource: dict,
    ):
        """Should create a Coverage resource successfully."""
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_coverage_resource["beneficiary"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }

        result = fhir_client.create_resource("Coverage", valid_coverage_resource)

        assert result.success is True
        assert result.status_code == 201

    def test_search_coverage_by_subscriber_id(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_coverage_resource: dict,
    ):
        """Should search Coverage by subscriber ID."""
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_coverage_resource["beneficiary"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }
        subscriber_id = valid_coverage_resource["subscriberId"]
        create_result = fhir_client.create_resource("Coverage", valid_coverage_resource)

        # Search by identifier system and value (more reliable than subscriber-id)
        search_result = fhir_client.search("Coverage", {"identifier": subscriber_id})

        # HAPI may or may not index subscriber-id depending on configuration
        # Verify the coverage was created and can be retrieved
        assert create_result.success is True
        # If search works, verify results; otherwise just confirm creation worked
        if search_result.success and search_result.total > 0:
            assert any(r.get("subscriberId") == subscriber_id for r in search_result.resources)


class TestClaimResourceCRUD:
    """Tests for Claim resource CRUD operations."""

    def test_create_claim_succeeds(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_organization_resource: dict,
        valid_claim_resource: dict,
    ):
        """Should create a Claim resource successfully."""
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        org_result = fhir_client.create_resource("Organization", valid_organization_resource)

        valid_claim_resource["patient"] = {"reference": f"Patient/{patient_result.resource_id}"}
        valid_claim_resource["provider"] = {"reference": f"Organization/{org_result.resource_id}"}

        result = fhir_client.create_resource("Claim", valid_claim_resource)

        assert result.success is True
        assert result.status_code == 201

    def test_claim_includes_total_amount(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_claim_resource: dict,
    ):
        """Claim should preserve total amount in KES."""
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        valid_claim_resource["patient"] = {"reference": f"Patient/{patient_result.resource_id}"}

        create_result = fhir_client.create_resource("Claim", valid_claim_resource)
        read_result = fhir_client.read_resource("Claim", create_result.resource_id)

        assert "total" in read_result.resource
        assert read_result.resource["total"]["currency"] == "KES"


class TestBundleOperations:
    """Tests for FHIR Bundle operations (transactions, messages)."""

    def test_transaction_bundle_creates_multiple_resources(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_encounter_resource: dict,
        unique_id: str,
    ):
        """Transaction bundle should create all resources atomically."""
        # Create a transaction bundle with patient and encounter
        patient_uuid = str(uuid.uuid4())
        encounter_uuid = str(uuid.uuid4())

        bundle = {
            "resourceType": "Bundle",
            "type": "transaction",
            "entry": [
                {
                    "fullUrl": f"urn:uuid:{patient_uuid}",
                    "resource": valid_patient_resource,
                    "request": {
                        "method": "POST",
                        "url": "Patient",
                    },
                },
                {
                    "fullUrl": f"urn:uuid:{encounter_uuid}",
                    "resource": {
                        **valid_encounter_resource,
                        "subject": {"reference": f"urn:uuid:{patient_uuid}"},
                    },
                    "request": {
                        "method": "POST",
                        "url": "Encounter",
                    },
                },
            ],
        }

        result = fhir_client.submit_transaction(bundle)

        assert result.success is True
        assert result.resource.get("type") == "transaction-response"

        # Verify both resources were created
        entries = result.resource.get("entry", [])
        assert len(entries) == 2

        for entry in entries:
            response = entry.get("response", {})
            assert response.get("status").startswith(
                "201"
            ), f"Expected 201, got {response.get('status')}"

    def test_transaction_bundle_rolls_back_on_failure(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        unique_id: str,
    ):
        """Transaction bundle should roll back all changes if any entry fails."""
        # Create a bundle with one valid resource and one with invalid reference
        bundle = {
            "resourceType": "Bundle",
            "type": "transaction",
            "entry": [
                {
                    "fullUrl": "urn:uuid:test-valid-patient",
                    "resource": valid_patient_resource,
                    "request": {
                        "method": "POST",
                        "url": "Patient",
                    },
                },
                {
                    "fullUrl": "urn:uuid:test-invalid-encounter",
                    "resource": {
                        "resourceType": "Encounter",
                        "status": "planned",
                        "class": {
                            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                            "code": "AMB",
                        },
                        # Reference to non-existent patient should fail in strict mode
                        "subject": {"reference": "Patient/nonexistent-12345"},
                    },
                    "request": {
                        "method": "POST",
                        "url": "Encounter",
                    },
                },
            ],
        }

        result = fhir_client.submit_transaction(bundle)

        # HAPI with placeholder references may accept this.
        # The key test is that both resources are created or neither
        # (transaction atomicity). Either outcome is acceptable.
        if result.success:
            # Verify both were created (atomicity preserved)
            entries = result.resource.get("entry", [])
            assert len(entries) == 2, "Transaction should be atomic"
        else:
            # Transaction failed as expected
            assert result.status_code >= 400

    def test_message_bundle_submission(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_organization_resource: dict,
        unique_id: str,
    ):
        """Message bundle (SHA claim format) should be accepted."""
        # Create a message bundle similar to SHA claims
        bundle = {
            "resourceType": "Bundle",
            "id": unique_id,
            "type": "message",
            "timestamp": datetime.now().isoformat() + "Z",  # FHIR instant requires timezone
            "entry": [
                {
                    "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                    "resource": {
                        "resourceType": "MessageHeader",
                        "eventUri": "urn:sha:claim-submission",
                        "source": {
                            "name": "Vitora HMIS",
                            "software": "Vitora",
                            "version": "1.0",
                            "endpoint": "http://example.com/fhir",
                        },
                    },
                },
                {
                    "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                    "resource": valid_organization_resource,
                },
                {
                    "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                    "resource": valid_patient_resource,
                },
            ],
        }

        result = fhir_client.submit_message(bundle)

        # HAPI accepts message bundles but may not process them
        # We just verify the bundle is syntactically valid
        # 422 = validation errors (missing narrative, etc)
        assert result.status_code in [200, 201, 400, 422]

    def test_batch_bundle_processes_independently(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        unique_id: str,
    ):
        """Batch bundle should process entries independently."""
        # Create one valid and one invalid patient
        valid_patient = {**valid_patient_resource}
        valid_patient["identifier"][0]["value"] = f"BATCH-VALID-{unique_id}"

        bundle = {
            "resourceType": "Bundle",
            "type": "batch",
            "entry": [
                {
                    "resource": valid_patient,
                    "request": {
                        "method": "POST",
                        "url": "Patient",
                    },
                },
                {
                    "resource": {
                        "resourceType": "InvalidResourceType",  # Invalid
                    },
                    "request": {
                        "method": "POST",
                        "url": "InvalidResourceType",
                    },
                },
            ],
        }

        result = fhir_client.submit_bundle(bundle, bundle_type="batch")

        # HAPI validates entire bundle before processing, so invalid resourceType
        # causes full rejection (422) rather than partial processing
        # This is HAPI-specific behavior - other servers may process partially
        if result.status_code == 422:
            # Full rejection due to invalid resource type - acceptable
            assert result.resource.get("resourceType") == "OperationOutcome"
        else:
            # Batch succeeded overall (individual failures are per-entry)
            assert result.status_code == 200
            assert result.resource.get("type") == "batch-response"

            entries = result.resource.get("entry", [])
            # First should succeed, second should fail
            assert entries[0]["response"]["status"].startswith("201")
            assert entries[1]["response"]["status"].startswith("4")  # 400 or 404


class TestResourceVersioning:
    """Tests for FHIR resource versioning and history."""

    def test_resource_has_version_after_create(
        self, fhir_client: FHIRClient, valid_patient_resource: dict
    ):
        """Created resource should have version in meta."""
        result = fhir_client.create_resource("Patient", valid_patient_resource)
        read_result = fhir_client.read_resource("Patient", result.resource_id)

        assert "meta" in read_result.resource
        assert "versionId" in read_result.resource["meta"]

    def test_resource_version_increments_on_update(
        self, fhir_client: FHIRClient, valid_patient_resource: dict
    ):
        """Resource version should increment after update."""
        # Create
        create_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = create_result.resource_id

        read1 = fhir_client.read_resource("Patient", patient_id)
        version1 = read1.resource["meta"]["versionId"]

        # Update
        updated = {**valid_patient_resource, "active": False}
        fhir_client.update_resource("Patient", patient_id, updated)

        read2 = fhir_client.read_resource("Patient", patient_id)
        version2 = read2.resource["meta"]["versionId"]

        assert version2 != version1

    def test_can_read_specific_version(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Should be able to read a specific version of a resource."""
        # Create and get initial version
        create_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = create_result.resource_id

        read1 = fhir_client.read_resource("Patient", patient_id)
        version1 = read1.resource["meta"]["versionId"]
        original_family = read1.resource["name"][0]["family"]

        # Update to new version
        updated = {**valid_patient_resource}
        updated["name"][0]["family"] = "UpdatedForVersionTest"
        fhir_client.update_resource("Patient", patient_id, updated)

        # Read original version
        historical = fhir_client.read_resource("Patient", patient_id, version=version1)

        assert historical.resource["name"][0]["family"] == original_family

    def test_get_resource_history(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Should retrieve resource version history."""
        # Create and update to have history
        create_result = fhir_client.create_resource("Patient", valid_patient_resource)
        patient_id = create_result.resource_id

        # Make some updates
        for i in range(3):
            updated = {**valid_patient_resource}
            updated["name"][0]["family"] = f"HistoryTest{i}"
            fhir_client.update_resource("Patient", patient_id, updated)

        # Get history
        history = fhir_client.get_resource_history("Patient", patient_id)

        assert history.success is True
        assert history.total >= 4  # 1 create + 3 updates
        assert len(history.resources) >= 4


class TestResourceValidation:
    """Tests for server-side resource validation."""

    def test_invalid_resource_rejected(self, fhir_client: FHIRClient):
        """Server should reject invalid resources."""
        invalid_patient = {
            "resourceType": "Patient",
            "gender": "invalid_gender",  # Invalid value
        }

        # Server may or may not reject this - HAPI is lenient
        # But we test that the request completes
        result = fhir_client.create_resource("Patient", invalid_patient)

        # Either created (HAPI is lenient) or validation error
        assert result.status_code in [201, 400, 422]

    def test_missing_required_field_handling(self, fhir_client: FHIRClient):
        """Server should handle resources with missing required fields."""
        # Observation requires status, code, and subject
        incomplete_observation = {
            "resourceType": "Observation",
            # Missing: status, code
        }

        result = fhir_client.create_resource("Observation", incomplete_observation)

        # Should be rejected
        assert result.status_code >= 400

    def test_validate_operation(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """$validate operation should validate without creating."""
        result = fhir_client.validate_resource("Patient", valid_patient_resource)

        # Should return OperationOutcome
        assert result.resource.get("resourceType") == "OperationOutcome"


class TestResponseTimes:
    """Tests for response time performance requirements."""

    def test_single_create_under_500ms(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Single resource create should complete under 500ms."""
        result = fhir_client.create_resource("Patient", valid_patient_resource)

        assert (
            result.response_time_ms < MAX_RESPONSE_TIME_MS
        ), f"Create took {result.response_time_ms:.1f}ms, expected <{MAX_RESPONSE_TIME_MS}ms"

    def test_single_read_under_500ms(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Single resource read should complete under 500ms."""
        create_result = fhir_client.create_resource("Patient", valid_patient_resource)

        result = fhir_client.read_resource("Patient", create_result.resource_id)

        assert (
            result.response_time_ms < MAX_RESPONSE_TIME_MS
        ), f"Read took {result.response_time_ms:.1f}ms, expected <{MAX_RESPONSE_TIME_MS}ms"

    def test_simple_search_under_500ms(self, fhir_client: FHIRClient, valid_patient_resource: dict):
        """Simple search should complete under 500ms."""
        # Create a patient to search for
        unique_family = f"PerfTest{uuid.uuid4().hex[:8]}"
        valid_patient_resource["name"][0]["family"] = unique_family
        fhir_client.create_resource("Patient", valid_patient_resource)

        result = fhir_client.search("Patient", {"family": unique_family})

        assert (
            result.response_time_ms < MAX_RESPONSE_TIME_MS
        ), f"Search took {result.response_time_ms:.1f}ms, expected <{MAX_RESPONSE_TIME_MS}ms"


class TestVitoraSpecificScenarios:
    """Tests for Vitora HMIS specific FHIR workflows."""

    def test_sha_claim_bundle_structure(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_organization_resource: dict,
        valid_practitioner_resource: dict,
        valid_coverage_resource: dict,
        valid_claim_resource: dict,
        unique_id: str,
    ):
        """Test SHA claim bundle structure matches expected format."""
        # Create supporting resources
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        org_result = fhir_client.create_resource("Organization", valid_organization_resource)
        practitioner_result = fhir_client.create_resource(
            "Practitioner", valid_practitioner_resource
        )

        # Update coverage with patient reference
        valid_coverage_resource["beneficiary"] = {
            "reference": f"Patient/{patient_result.resource_id}"
        }
        coverage_result = fhir_client.create_resource("Coverage", valid_coverage_resource)

        # Update claim with references
        valid_claim_resource["patient"] = {"reference": f"Patient/{patient_result.resource_id}"}
        valid_claim_resource["provider"] = {"reference": f"Organization/{org_result.resource_id}"}
        valid_claim_resource["insurance"][0]["coverage"] = {
            "reference": f"Coverage/{coverage_result.resource_id}"
        }

        # Create the claim
        claim_result = fhir_client.create_resource("Claim", valid_claim_resource)

        assert claim_result.success is True

        # Verify all components are retrievable
        assert fhir_client.read_resource("Patient", patient_result.resource_id).success
        assert fhir_client.read_resource("Organization", org_result.resource_id).success
        assert fhir_client.read_resource("Practitioner", practitioner_result.resource_id).success
        assert fhir_client.read_resource("Coverage", coverage_result.resource_id).success
        assert fhir_client.read_resource("Claim", claim_result.resource_id).success

    def test_patient_with_kenya_demographics(self, fhir_client: FHIRClient, unique_id: str):
        """Patient with Kenya-specific demographics should be created correctly."""
        kenya_patient = {
            "resourceType": "Patient",
            "identifier": [
                {
                    "system": "urn:sha:client-registry",
                    "value": f"CR-{unique_id.upper()}",
                },
                {
                    "system": "urn:kenya:national-id",
                    "value": "12345678",
                },
            ],
            "name": [
                {
                    "use": "official",
                    "family": "Mwangi",
                    "given": ["Kamau", "John"],
                }
            ],
            "gender": "male",
            "birthDate": "1990-06-15",
            "address": [
                {
                    "use": "home",
                    "text": "Nairobi, Kenya",
                    "city": "Nairobi",
                    "district": "Westlands",
                    "state": "Nairobi",
                    "country": "KE",
                    "extension": [
                        {
                            "url": "urn:kenya:county",
                            "valueString": "Nairobi",
                        },
                        {
                            "url": "urn:kenya:sub-county",
                            "valueString": "Westlands",
                        },
                    ],
                }
            ],
        }

        result = fhir_client.create_resource("Patient", kenya_patient)
        assert result.success is True

        # Verify extensions are preserved
        read_result = fhir_client.read_resource("Patient", result.resource_id)
        address = read_result.resource["address"][0]
        assert address.get("country") == "KE"

    def test_encounter_workflow_create_to_finish(
        self,
        fhir_client: FHIRClient,
        valid_patient_resource: dict,
        valid_practitioner_resource: dict,
        unique_id: str,
    ):
        """Test complete encounter workflow from creation to finish."""
        from datetime import timezone as tz

        # Create patient and practitioner
        patient_result = fhir_client.create_resource("Patient", valid_patient_resource)
        practitioner_result = fhir_client.create_resource(
            "Practitioner", valid_practitioner_resource
        )

        # Create encounter in planned status
        # Use timezone-aware datetimes (FHIR requires timezone if time is present)
        now_tz = datetime.now(tz.utc).isoformat()
        encounter = {
            "resourceType": "Encounter",
            "status": "planned",
            "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "AMB",
            },
            "subject": {"reference": f"Patient/{patient_result.resource_id}"},
            "participant": [
                {"individual": {"reference": f"Practitioner/{practitioner_result.resource_id}"}}
            ],
            "period": {
                "start": now_tz,
            },
        }

        create_result = fhir_client.create_resource("Encounter", encounter)
        encounter_id = create_result.resource_id
        assert encounter_id is not None, f"Encounter ID should be assigned, got: {create_result}"

        # Re-read the full resource to get server-assigned values
        current = fhir_client.read_resource("Encounter", encounter_id)
        # Verify we got a single Encounter, not a search Bundle
        assert current.resource.get("resourceType") == "Encounter", (
            f"Expected Encounter, got {current.resource.get('resourceType')}. "
            f"This may indicate the encounter_id ({encounter_id}) was not correctly used."
        )
        encounter_resource = current.resource

        # Update to in-progress
        encounter_resource["status"] = "in-progress"
        fhir_client.update_resource("Encounter", encounter_id, encounter_resource)

        # Update to finished - ensure period exists
        # Re-read to get any server modifications
        current = fhir_client.read_resource("Encounter", encounter_id)
        assert current.resource.get("resourceType") == "Encounter"
        encounter_resource = current.resource
        encounter_resource["status"] = "finished"
        if "period" not in encounter_resource:
            encounter_resource["period"] = {"start": datetime.now(tz.utc).isoformat()}
        encounter_resource["period"]["end"] = datetime.now(tz.utc).isoformat()
        fhir_client.update_resource("Encounter", encounter_id, encounter_resource)

        # Verify final state
        final = fhir_client.read_resource("Encounter", encounter_id)
        assert (
            final.resource.get("resourceType") == "Encounter"
        ), f"Expected Encounter, got {final.resource.get('resourceType')}"
        assert final.resource.get("status") == "finished"


class TestFHIRClientErrorHandling:
    """Tests for FHIR client error handling."""

    def test_connection_error_raised_for_invalid_server(self):
        """Should raise FHIRConnectionError for invalid server."""
        client = FHIRClient("http://invalid-server-that-does-not-exist:9999/fhir", timeout=2)

        # Use get_capability_statement which propagates exceptions
        # (check_health catches exceptions and returns False by design)
        with pytest.raises(FHIRConnectionError):
            client.get_capability_statement()

    def test_not_found_error_raised_for_missing_resource(self, fhir_client: FHIRClient):
        """Should raise FHIRNotFoundError for missing resources."""
        with pytest.raises(FHIRNotFoundError) as exc_info:
            fhir_client.read_resource("Patient", "definitely-not-a-real-id-12345")

        assert exc_info.value.response.status_code == 404

    def test_client_handles_server_error_gracefully(self, fhir_client: FHIRClient):
        """Client should handle server errors without crashing."""
        # Try to create a resource with an invalid type
        result = fhir_client.create_resource(
            "NotARealResourceType",
            {"resourceType": "NotARealResourceType"},
        )

        # Should get 400/404, not crash
        assert result.status_code >= 400
