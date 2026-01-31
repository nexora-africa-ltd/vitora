"""
Pytest fixtures for FHIR server integration tests.

These fixtures provide test data and client setup for testing against
a real HAPI FHIR R4 server.
"""

import os
import uuid
from datetime import date, datetime, timedelta

import pytest

# Check if httpx is available
try:
    import httpx

    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False


# ============================================================================
# Skip markers for integration tests
# ============================================================================


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "fhir_integration: Tests requiring HAPI FHIR server")


# ============================================================================
# FHIR Server Configuration
# ============================================================================


FHIR_SERVER_URL = os.environ.get("FHIR_SERVER_URL", "http://localhost:8090/fhir")
FHIR_SERVER_TIMEOUT = int(os.environ.get("FHIR_SERVER_TIMEOUT", "30"))


def is_fhir_server_available() -> bool:
    """Check if FHIR server is available."""
    if not HAS_HTTPX:
        return False
    try:
        response = httpx.get(f"{FHIR_SERVER_URL}/metadata", timeout=5.0)
        return response.status_code == 200
    except (httpx.RequestError, httpx.TimeoutException):
        return False


# Skip all tests in this module if FHIR server is not available
pytestmark = [
    pytest.mark.fhir_integration,
    pytest.mark.skipif(not HAS_HTTPX, reason="httpx not installed"),
    pytest.mark.skipif(
        not is_fhir_server_available(),
        reason=f"FHIR server not available at {FHIR_SERVER_URL}",
    ),
]


# ============================================================================
# FHIR Client Fixtures
# ============================================================================


@pytest.fixture(scope="module")
def fhir_client():
    """
    Create FHIR server client for integration tests.

    Scope is module to reuse connection across tests.
    """
    from hmis.apps.core.services.fhir_client import FHIRClient

    client = FHIRClient(base_url=FHIR_SERVER_URL, timeout=FHIR_SERVER_TIMEOUT)

    # Wait for server to be available
    if not client.wait_for_server(max_wait_seconds=60):
        pytest.skip("FHIR server did not become available")

    yield client

    client.close()


@pytest.fixture(scope="function")
def clean_fhir_client(fhir_client):
    """
    FHIR client that cleans up created resources after each test.

    Tracks resources created during test and deletes them afterwards.
    """
    created_resources: list[tuple[str, str]] = []

    class TrackingClient:
        def __init__(self, client):
            self._client = client
            self._created = created_resources

        def __getattr__(self, name):
            return getattr(self._client, name)

        def create_resource(self, resource_type, resource, **kwargs):
            response = self._client.create_resource(resource_type, resource, **kwargs)
            if response.success and response.resource_id:
                self._created.append((resource_type, response.resource_id))
            return response

        def track_resource(self, resource_type, resource_id):
            """Manually track a resource for cleanup."""
            self._created.append((resource_type, resource_id))

    tracking_client = TrackingClient(fhir_client)
    yield tracking_client

    # Cleanup: Delete all created resources in reverse order
    for resource_type, resource_id in reversed(created_resources):
        try:
            fhir_client.delete_resource(resource_type, resource_id)
        except Exception:
            pass  # Best effort cleanup


# ============================================================================
# FHIR Resource Fixtures - FHIR R4 Compliant
# ============================================================================


@pytest.fixture
def fhir_patient_resource():
    """
    Valid FHIR R4 Patient resource.

    Reference: https://hl7.org/fhir/R4/patient.html

    This fixture provides a comprehensive Patient resource that should
    pass FHIR R4 validation on any compliant server.
    """
    return {
        "resourceType": "Patient",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/Patient"],
        },
        "identifier": [
            {
                "use": "official",
                "system": "urn:sha:client-registry",
                "value": f"CR-TEST-{uuid.uuid4().hex[:8].upper()}",
            },
            {
                "use": "secondary",
                "system": "urn:kenya:national-id",
                "value": "12345678",
            },
        ],
        "active": True,
        "name": [
            {
                "use": "official",
                "family": "Kamau",
                "given": ["John", "Mwangi"],
                "text": "John Mwangi Kamau",
            }
        ],
        "telecom": [
            {"system": "phone", "value": "+254712345678", "use": "mobile"},
            {"system": "email", "value": "john.kamau@example.com", "use": "home"},
        ],
        "gender": "male",
        "birthDate": "1985-03-15",
        "address": [
            {
                "use": "home",
                "type": "physical",
                "line": ["123 Kenyatta Avenue"],
                "city": "Nairobi",
                "district": "Westlands",
                "state": "Nairobi",
                "postalCode": "00100",
                "country": "KE",
            }
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
        "contact": [
            {
                "relationship": [
                    {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/v2-0131",
                                "code": "C",
                                "display": "Emergency Contact",
                            }
                        ]
                    }
                ],
                "name": {"family": "Kamau", "given": ["Mary"]},
                "telecom": [{"system": "phone", "value": "+254723456789", "use": "mobile"}],
            }
        ],
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
            },
            {
                "language": {
                    "coding": [
                        {
                            "system": "urn:ietf:bcp:47",
                            "code": "en",
                            "display": "English",
                        }
                    ]
                },
            },
        ],
    }


@pytest.fixture
def fhir_organization_resource():
    """
    Valid FHIR R4 Organization resource (healthcare facility).

    Reference: https://hl7.org/fhir/R4/organization.html
    """
    return {
        "resourceType": "Organization",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/Organization"],
        },
        "identifier": [
            {
                "use": "official",
                "system": "urn:kenya:mfl",
                "value": "12345",
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
        "name": "Kenyatta National Hospital",
        "alias": ["KNH"],
        "telecom": [
            {"system": "phone", "value": "+254202726300", "use": "work"},
            {"system": "email", "value": "info@knh.or.ke", "use": "work"},
        ],
        "address": [
            {
                "use": "work",
                "type": "physical",
                "line": ["Hospital Road, Upper Hill"],
                "city": "Nairobi",
                "state": "Nairobi",
                "postalCode": "00202",
                "country": "KE",
            }
        ],
    }


@pytest.fixture
def fhir_practitioner_resource():
    """
    Valid FHIR R4 Practitioner resource.

    Reference: https://hl7.org/fhir/R4/practitioner.html
    """
    return {
        "resourceType": "Practitioner",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/Practitioner"],
        },
        "identifier": [
            {
                "use": "official",
                "system": "urn:kenya:medical-board",
                "value": f"MED-{uuid.uuid4().hex[:6].upper()}",
            }
        ],
        "active": True,
        "name": [
            {
                "use": "official",
                "family": "Ochieng",
                "given": ["Dr.", "James"],
                "prefix": ["Dr."],
            }
        ],
        "telecom": [
            {"system": "phone", "value": "+254712345000", "use": "work"},
            {"system": "email", "value": "dr.ochieng@hospital.ke", "use": "work"},
        ],
        "gender": "male",
        "birthDate": "1975-06-20",
        "qualification": [
            {
                "identifier": [{"system": "urn:kenya:medical-board", "value": "QUAL-001"}],
                "code": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v2-0360",
                            "code": "MD",
                            "display": "Doctor of Medicine",
                        }
                    ]
                },
                "period": {"start": "2000-01-01"},
                "issuer": {"display": "University of Nairobi"},
            }
        ],
    }


@pytest.fixture
def fhir_encounter_resource(fhir_patient_resource):
    """
    Valid FHIR R4 Encounter resource.

    Reference: https://hl7.org/fhir/R4/encounter.html

    Note: This fixture creates a standalone encounter. In real usage,
    the subject reference should point to an actual Patient resource.
    """
    return {
        "resourceType": "Encounter",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/Encounter"],
        },
        "identifier": [
            {
                "use": "official",
                "system": "urn:vitora:encounters",
                "value": f"ENC-{uuid.uuid4().hex[:8].upper()}",
            }
        ],
        "status": "in-progress",
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
                        "code": "270427003",
                        "display": "Patient-initiated encounter",
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
        "subject": {
            "reference": "Patient/placeholder",
            "display": "John Mwangi Kamau",
        },
        "period": {
            "start": datetime.now().isoformat(),
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
                "text": "Patient presents with fever",
            }
        ],
    }


@pytest.fixture
def fhir_observation_vitals():
    """
    Valid FHIR R4 Observation resource for vital signs.

    Reference: https://hl7.org/fhir/R4/observation-vitalsigns.html
    """
    return {
        "resourceType": "Observation",
        "meta": {
            "profile": [
                "http://hl7.org/fhir/StructureDefinition/vitalsigns",
            ],
        },
        "identifier": [
            {
                "system": "urn:vitora:observations",
                "value": f"OBS-{uuid.uuid4().hex[:8].upper()}",
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
            ],
            "text": "Body temperature",
        },
        "subject": {
            "reference": "Patient/placeholder",
        },
        "effectiveDateTime": datetime.now().isoformat(),
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
def fhir_condition_resource():
    """
    Valid FHIR R4 Condition resource (diagnosis).

    Reference: https://hl7.org/fhir/R4/condition.html

    Uses ICD-11 coding system as required by Kenya SHA.
    """
    return {
        "resourceType": "Condition",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/Condition"],
        },
        "identifier": [
            {
                "system": "urn:vitora:conditions",
                "value": f"COND-{uuid.uuid4().hex[:8].upper()}",
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
                    # ICD-11 coding (required for Kenya SHA)
                    "system": "http://id.who.int/icd/release/11/mms",
                    "code": "1A00",
                    "display": "Cholera",
                },
                {
                    # ICD-10 for backward compatibility
                    "system": "http://hl7.org/fhir/sid/icd-10",
                    "code": "A00",
                    "display": "Cholera",
                },
            ],
            "text": "Cholera",
        },
        "subject": {
            "reference": "Patient/placeholder",
        },
        "recordedDate": date.today().isoformat(),
    }


@pytest.fixture
def fhir_medication_request():
    """
    Valid FHIR R4 MedicationRequest resource.

    Reference: https://hl7.org/fhir/R4/medicationrequest.html
    """
    return {
        "resourceType": "MedicationRequest",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/MedicationRequest"],
        },
        "identifier": [
            {
                "system": "urn:vitora:prescriptions",
                "value": f"RX-{uuid.uuid4().hex[:8].upper()}",
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
                    "code": "313782",
                    "display": "Paracetamol 500mg tablet",
                }
            ],
            "text": "Paracetamol 500mg",
        },
        "subject": {
            "reference": "Patient/placeholder",
        },
        "authoredOn": datetime.now().isoformat(),
        "dosageInstruction": [
            {
                "sequence": 1,
                "text": "Take 1 tablet by mouth every 6 hours as needed for pain",
                "timing": {
                    "repeat": {
                        "frequency": 4,
                        "period": 1,
                        "periodUnit": "d",
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
                            "value": 1,
                            "unit": "tablet",
                            "system": "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm",
                            "code": "TAB",
                        },
                    }
                ],
            }
        ],
        "dispenseRequest": {
            "validityPeriod": {
                "start": date.today().isoformat(),
                "end": (date.today() + timedelta(days=30)).isoformat(),
            },
            "numberOfRepeatsAllowed": 0,
            "quantity": {
                "value": 28,
                "unit": "tablet",
                "system": "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm",
                "code": "TAB",
            },
            "expectedSupplyDuration": {
                "value": 7,
                "unit": "days",
                "system": "http://unitsofmeasure.org",
                "code": "d",
            },
        },
    }


@pytest.fixture
def fhir_medication_dispense():
    """
    Valid FHIR R4 MedicationDispense resource.

    Reference: https://hl7.org/fhir/R4/medicationdispense.html
    """
    return {
        "resourceType": "MedicationDispense",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/MedicationDispense"],
        },
        "identifier": [
            {
                "system": "urn:vitora:dispensing",
                "value": f"DISP-{uuid.uuid4().hex[:8].upper()}",
            }
        ],
        "status": "completed",
        "medicationCodeableConcept": {
            "coding": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": "313782",
                    "display": "Paracetamol 500mg tablet",
                }
            ],
            "text": "Paracetamol 500mg",
        },
        "subject": {
            "reference": "Patient/placeholder",
        },
        "performer": [
            {
                "actor": {
                    "reference": "Practitioner/placeholder",
                    "display": "Pharmacist",
                }
            }
        ],
        "quantity": {
            "value": 28,
            "unit": "tablet",
            "system": "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm",
            "code": "TAB",
        },
        "daysSupply": {
            "value": 7,
            "unit": "days",
            "system": "http://unitsofmeasure.org",
            "code": "d",
        },
        "whenHandedOver": datetime.now().isoformat(),
        "dosageInstruction": [
            {
                "text": "Take 1 tablet by mouth every 6 hours as needed for pain",
            }
        ],
    }


@pytest.fixture
def fhir_service_request():
    """
    Valid FHIR R4 ServiceRequest resource (lab order).

    Reference: https://hl7.org/fhir/R4/servicerequest.html
    """
    return {
        "resourceType": "ServiceRequest",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/ServiceRequest"],
        },
        "identifier": [
            {
                "system": "urn:vitora:lab-orders",
                "value": f"LAB-{uuid.uuid4().hex[:8].upper()}",
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
                    "code": "2951-2",
                    "display": "Sodium [Moles/volume] in Serum or Plasma",
                }
            ],
            "text": "Serum Sodium",
        },
        "subject": {
            "reference": "Patient/placeholder",
        },
        "authoredOn": datetime.now().isoformat(),
        "reasonCode": [
            {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "code": "386661006",
                        "display": "Fever",
                    }
                ],
                "text": "Fever workup",
            }
        ],
    }


@pytest.fixture
def fhir_claim_resource():
    """
    Valid FHIR R4 Claim resource (insurance claim).

    Reference: https://hl7.org/fhir/R4/claim.html

    Includes Kenya SHA-specific extensions.
    """
    return {
        "resourceType": "Claim",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/Claim"],
        },
        "identifier": [
            {
                "system": "urn:vitora:claims",
                "value": f"CLM-{uuid.uuid4().hex[:8].upper()}",
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
        "use": "claim",
        "patient": {
            "reference": "Patient/placeholder",
        },
        "created": datetime.now().isoformat(),
        "provider": {
            "reference": "Organization/placeholder",
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
                    "reference": "Coverage/placeholder",
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
                            "code": "CONS-001",
                            "display": "General Consultation",
                        }
                    ]
                },
                "servicedDate": date.today().isoformat(),
                "unitPrice": {
                    "value": 500.00,
                    "currency": "KES",
                },
                "net": {
                    "value": 500.00,
                    "currency": "KES",
                },
            }
        ],
        "total": {
            "value": 500.00,
            "currency": "KES",
        },
    }


@pytest.fixture
def fhir_coverage_resource():
    """
    Valid FHIR R4 Coverage resource (insurance coverage).

    Reference: https://hl7.org/fhir/R4/coverage.html

    Includes Kenya SHA scheme information.
    """
    return {
        "resourceType": "Coverage",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/Coverage"],
        },
        "identifier": [
            {
                "system": "urn:sha:member-number",
                "value": f"SHA-{uuid.uuid4().hex[:10].upper()}",
            }
        ],
        "status": "active",
        "type": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                    "code": "PUBLICPOL",
                    "display": "public healthcare",
                }
            ]
        },
        "subscriber": {
            "reference": "Patient/placeholder",
        },
        "beneficiary": {
            "reference": "Patient/placeholder",
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
            "start": date.today().isoformat(),
            "end": (date.today() + timedelta(days=365)).isoformat(),
        },
        "payor": [
            {
                "reference": "Organization/SHA",
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
                "value": "CAT-SHA-001",
                "name": "SHA Primary Healthcare",
            }
        ],
    }


@pytest.fixture
def fhir_allergy_intolerance():
    """
    Valid FHIR R4 AllergyIntolerance resource.

    Reference: https://hl7.org/fhir/R4/allergyintolerance.html
    """
    return {
        "resourceType": "AllergyIntolerance",
        "meta": {
            "profile": ["http://hl7.org/fhir/StructureDefinition/AllergyIntolerance"],
        },
        "identifier": [
            {
                "system": "urn:vitora:allergies",
                "value": f"ALG-{uuid.uuid4().hex[:8].upper()}",
            }
        ],
        "clinicalStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                    "code": "active",
                    "display": "Active",
                }
            ]
        },
        "verificationStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                    "code": "confirmed",
                    "display": "Confirmed",
                }
            ]
        },
        "type": "allergy",
        "category": ["medication"],
        "criticality": "high",
        "code": {
            "coding": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": "7984",
                    "display": "Penicillin",
                }
            ],
            "text": "Penicillin",
        },
        "patient": {
            "reference": "Patient/placeholder",
        },
        "recordedDate": date.today().isoformat(),
        "reaction": [
            {
                "manifestation": [
                    {
                        "coding": [
                            {
                                "system": "http://snomed.info/sct",
                                "code": "39579001",
                                "display": "Anaphylaxis",
                            }
                        ]
                    }
                ],
                "severity": "severe",
            }
        ],
    }


# ============================================================================
# Bundle Fixtures
# ============================================================================


@pytest.fixture
def fhir_transaction_bundle(fhir_patient_resource, fhir_organization_resource):
    """
    Valid FHIR R4 transaction Bundle.

    Reference: https://hl7.org/fhir/R4/bundle.html#transaction
    """
    patient = fhir_patient_resource.copy()
    patient["id"] = f"patient-{uuid.uuid4().hex[:8]}"

    org = fhir_organization_resource.copy()
    org["id"] = f"org-{uuid.uuid4().hex[:8]}"

    return {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": [
            {
                "fullUrl": f"urn:uuid:{patient['id']}",
                "resource": patient,
                "request": {
                    "method": "POST",
                    "url": "Patient",
                },
            },
            {
                "fullUrl": f"urn:uuid:{org['id']}",
                "resource": org,
                "request": {
                    "method": "POST",
                    "url": "Organization",
                },
            },
        ],
    }


@pytest.fixture
def fhir_message_bundle(fhir_patient_resource):
    """
    Valid FHIR R4 message Bundle (used for SHA claims).

    Reference: https://hl7.org/fhir/R4/bundle.html#message
    """
    message_header = {
        "resourceType": "MessageHeader",
        "id": f"msg-{uuid.uuid4().hex[:8]}",
        "eventCoding": {
            "system": "urn:sha:message-events",
            "code": "patient-registration",
            "display": "Patient Registration",
        },
        "source": {
            "name": "Vitora HMIS",
            "software": "Vitora",
            "version": "1.0.0",
            "endpoint": "http://vitora.example.com/fhir",
        },
        "focus": [
            {
                "reference": "Patient/placeholder",
            }
        ],
    }

    return {
        "resourceType": "Bundle",
        "type": "message",
        "timestamp": datetime.now().isoformat(),
        "entry": [
            {
                "fullUrl": f"urn:uuid:{message_header['id']}",
                "resource": message_header,
            },
            {
                "fullUrl": "urn:uuid:patient-1",
                "resource": fhir_patient_resource,
            },
        ],
    }


@pytest.fixture
def fhir_batch_bundle(fhir_patient_resource):
    """
    Valid FHIR R4 batch Bundle.

    Reference: https://hl7.org/fhir/R4/bundle.html#batch
    """
    patients = []
    for i in range(3):
        patient = fhir_patient_resource.copy()
        patient["identifier"] = [
            {
                "use": "official",
                "system": "urn:sha:client-registry",
                "value": f"CR-BATCH-{i}-{uuid.uuid4().hex[:4].upper()}",
            }
        ]
        patients.append(patient)

    return {
        "resourceType": "Bundle",
        "type": "batch",
        "entry": [
            {
                "resource": patient,
                "request": {
                    "method": "POST",
                    "url": "Patient",
                },
            }
            for patient in patients
        ],
    }


# ============================================================================
# IPS Bundle Fixture
# ============================================================================


@pytest.fixture
def fhir_ips_bundle(
    fhir_patient_resource,
    fhir_medication_request,
    fhir_condition_resource,
    fhir_allergy_intolerance,
):
    """
    Valid FHIR R4 IPS (International Patient Summary) Bundle.

    Reference: https://hl7.org/fhir/uv/ips/
    """
    patient_id = f"patient-ips-{uuid.uuid4().hex[:8]}"
    composition_id = f"composition-{uuid.uuid4().hex[:8]}"

    composition = {
        "resourceType": "Composition",
        "id": composition_id,
        "meta": {
            "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips"],
        },
        "status": "final",
        "type": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "60591-5",
                    "display": "Patient summary Document",
                }
            ]
        },
        "subject": {
            "reference": f"Patient/{patient_id}",
        },
        "date": datetime.now().isoformat(),
        "author": [
            {
                "display": "Vitora HMIS",
            }
        ],
        "title": "International Patient Summary",
        "section": [
            {
                "title": "Medication Summary",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "10160-0",
                            "display": "History of Medication use Narrative",
                        }
                    ]
                },
                "entry": [{"reference": "MedicationRequest/placeholder"}],
            },
            {
                "title": "Allergies and Intolerances",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "48765-2",
                            "display": "Allergies and adverse reactions Document",
                        }
                    ]
                },
                "entry": [{"reference": "AllergyIntolerance/placeholder"}],
            },
            {
                "title": "Problem List",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "11450-4",
                            "display": "Problem list - Reported",
                        }
                    ]
                },
                "entry": [{"reference": "Condition/placeholder"}],
            },
        ],
    }

    patient = fhir_patient_resource.copy()
    patient["id"] = patient_id

    return {
        "resourceType": "Bundle",
        "meta": {
            "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"],
        },
        "type": "document",
        "timestamp": datetime.now().isoformat(),
        "entry": [
            {
                "fullUrl": f"urn:uuid:{composition_id}",
                "resource": composition,
            },
            {
                "fullUrl": f"urn:uuid:{patient_id}",
                "resource": patient,
            },
            {
                "fullUrl": "urn:uuid:medication-1",
                "resource": fhir_medication_request,
            },
            {
                "fullUrl": "urn:uuid:condition-1",
                "resource": fhir_condition_resource,
            },
            {
                "fullUrl": "urn:uuid:allergy-1",
                "resource": fhir_allergy_intolerance,
            },
        ],
    }
