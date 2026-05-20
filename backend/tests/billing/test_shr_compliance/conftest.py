"""
Pytest fixtures for SHR compliance tests.

These fixtures provide test data for validating SHA SHR integration compliance.
Covers MedicationRequest, MedicationDispense, and Patient Summary workflows.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model

User = get_user_model()


# Try to import models - may fail if not fully implemented
try:
    from hmis.apps.pharmacy.models import (
        Dispensing,
        Drug,
        Prescription,
        PrescriptionItem,
        StockBatch,
    )

    HAS_PHARMACY_MODELS = True
except ImportError:
    HAS_PHARMACY_MODELS = False

try:
    from hmis.apps.patients.models import Patient

    HAS_PATIENT_MODEL = True
except ImportError:
    HAS_PATIENT_MODEL = False

try:
    from hmis.apps.encounters.models import Encounter

    HAS_ENCOUNTER_MODEL = True
except ImportError:
    HAS_ENCOUNTER_MODEL = False

try:
    from hmis.apps.core.models import County, SubCounty, Ward

    HAS_LOCATION_MODELS = True
except ImportError:
    HAS_LOCATION_MODELS = False

try:
    from hmis.apps.staff.models import StaffProfile

    HAS_STAFF_MODEL = True
except ImportError:
    HAS_STAFF_MODEL = False


@pytest.fixture
def shr_test_user(db):
    """Create a test user for SHR tests."""
    return User.objects.create_user(
        username="shr_testuser",
        password="testpass123",
        email="shr_test@example.com",
        first_name="Dr. Jane",
        last_name="Smith",
    )


@pytest.fixture
def pharmacist_user(db):
    """Create a pharmacist test user."""
    return User.objects.create_user(
        username="shr_pharmacist",
        password="testpass123",
        email="pharmacist@example.com",
        first_name="Bob",
        last_name="Green",
    )


@pytest.fixture
def sample_county(db):
    """Create a sample Kenya county."""
    if not HAS_LOCATION_MODELS:
        pytest.skip("Location models not available")

    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Mombasa"})
    return county


@pytest.fixture
def sample_sub_county(db, sample_county):
    """Create a sample sub-county."""
    if not HAS_LOCATION_MODELS:
        pytest.skip("Location models not available")

    sub_county, _ = SubCounty.objects.get_or_create(county=sample_county, name="Mvita")
    return sub_county


@pytest.fixture
def sample_ward(db, sample_sub_county):
    """Create a sample ward."""
    if not HAS_LOCATION_MODELS:
        pytest.skip("Location models not available")

    ward, _ = Ward.objects.get_or_create(sub_county=sample_sub_county, name="Mji Wa Kale")
    return ward


@pytest.fixture
def sample_patient(db, shr_test_user, sample_county, sample_sub_county, sample_ward):
    """Create a sample patient for SHR tests."""
    if not HAS_PATIENT_MODEL:
        pytest.skip("Patient model not available")

    patient = Patient.objects.create(
        first_name="Stephen",
        last_name="Gitau",
        date_of_birth=date(1985, 5, 20),
        gender="male",
        county=sample_county,
        sub_county=sample_sub_county,
        ward=sample_ward,
        phone_number="+254712345678",
        national_id="12345678",
        registered_by=shr_test_user,
    )
    return patient


@pytest.fixture
def sample_patient_with_cr_id(sample_patient):
    """Patient with a Client Registry ID (CR ID) for SHR."""
    # In production, this would be set from SHA's client registry
    sample_patient.sha_cr_id = "CR06XX3268000-3-1"
    sample_patient.save()
    return sample_patient


@pytest.fixture
def sample_encounter(db, sample_patient, shr_test_user):
    """Create a sample encounter for prescription."""
    if not HAS_ENCOUNTER_MODEL:
        pytest.skip("Encounter model not available")

    encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="opd",
        encounter_date=date.today(),
        chief_complaint="Hypertension follow-up",
        created_by=shr_test_user,
    )
    return encounter


@pytest.fixture
def sample_drug(db):
    """Create a sample drug (Amlodipine) for prescription tests."""
    if not HAS_PHARMACY_MODELS:
        pytest.skip("Pharmacy models not available")

    drug, _ = Drug.objects.get_or_create(
        code="AMLO5",
        defaults={
            "generic_name": "Amlodipine",
            "category": "ANTIHYPERTENSIVE",
            "form": "TABLET",
            "strength": "5mg",
            "unit": "tablet",
            "schedule": "POM",
            "requires_prescription": True,
            "keml_code": "C08CA01",
            "is_essential": True,
            "reference_price": Decimal("50.00"),
        },
    )
    return drug


@pytest.fixture
def sample_stock_batch(db, sample_drug, shr_test_user):
    """Create a sample stock batch for dispensing tests."""
    if not HAS_PHARMACY_MODELS:
        pytest.skip("Pharmacy models not available")

    batch = StockBatch.objects.create(
        drug=sample_drug,
        batch_number="BATCH-2025-001",
        quantity_received=1000,
        quantity_available=950,
        expiry_date=date.today() + timedelta(days=365),
        received_date=date.today() - timedelta(days=30),
        cost_price=Decimal("30.00"),
        selling_price=Decimal("50.00"),
        received_by=shr_test_user,
    )
    return batch


@pytest.fixture
def sample_prescription(db, sample_encounter, sample_patient, shr_test_user):
    """Create a sample prescription."""
    if not HAS_PHARMACY_MODELS:
        pytest.skip("Pharmacy models not available")

    prescription = Prescription.objects.create(
        encounter=sample_encounter,
        patient=sample_patient,
        prescribed_by=shr_test_user,
        valid_until=date.today() + timedelta(days=180),  # 6 months validity
        clinical_notes="Monitor blood pressure weekly",
    )
    return prescription


@pytest.fixture
def sample_prescription_item(db, sample_prescription, sample_drug):
    """Create a sample prescription item."""
    if not HAS_PHARMACY_MODELS:
        pytest.skip("Pharmacy models not available")

    item = PrescriptionItem.objects.create(
        prescription=sample_prescription,
        drug=sample_drug,
        quantity=30,
        dosage="1 tablet",
        frequency="once daily",
        duration="30 days",
        route="Oral",
        instructions="Take in the morning",
        is_substitutable=True,
    )
    return item


@pytest.fixture
def sample_dispensing(
    db, sample_prescription_item, sample_patient, sample_drug, sample_stock_batch, pharmacist_user
):
    """Create a sample dispensing record."""
    if not HAS_PHARMACY_MODELS:
        pytest.skip("Pharmacy models not available")

    dispensing = Dispensing.objects.create(
        prescription_item=sample_prescription_item,
        patient=sample_patient,
        drug=sample_drug,
        batch=sample_stock_batch,
        quantity_dispensed=30,
        unit_price=Decimal("50.00"),
        total_price=Decimal("1500.00"),
        dispensed_by=pharmacist_user,
        instructions_given="Take one tablet by mouth once daily",
        patient_counseled=True,
    )
    return dispensing


# =============================================================================
# FHIR Resource Fixtures (Mock data matching SHR spec)
# =============================================================================


@pytest.fixture
def valid_medication_request_fhir():
    """
    Valid MedicationRequest FHIR resource per SHR spec.
    Reference: docs/sha-guides/shr-integration.md Section 2
    """
    return {
        "resourceType": "MedicationRequest",
        "id": str(uuid.uuid4()),
        "status": "active",
        "intent": "order",
        "medicationCodeableConcept": {
            "coding": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": "197319",
                    "display": "Amlodipine 5 MG Oral Tablet",
                }
            ],
            "text": "Amlodipine 5mg tablet",
        },
        "subject": {"reference": "Patient/CR06XX3268000-3-1", "display": "STEPHEN GITAU"},
        "authoredOn": date.today().isoformat(),
        "requester": {"reference": "Practitioner/123456", "display": "Dr. Jane Smith"},
        "recorder": {"reference": "Practitioner/123456", "display": "Dr. Jane Smith"},
        "reasonCode": [
            {
                "coding": [
                    {
                        "system": "http://hl7.org/fhir/sid/icd-10",
                        "code": "I10",
                        "display": "Essential (primary) hypertension",
                    }
                ]
            }
        ],
        "dosageInstruction": [
            {
                "text": "Take one tablet by mouth once daily",
                "timing": {"repeat": {"frequency": 1, "period": 1, "periodUnit": "d"}},
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
                "end": (date.today() + timedelta(days=180)).isoformat(),
            },
            "numberOfRepeatsAllowed": 5,
            "quantity": {
                "value": 30,
                "unit": "tablets",
                "system": "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm",
                "code": "TAB",
            },
            "expectedSupplyDuration": {
                "value": 30,
                "unit": "days",
                "system": "http://unitsofmeasure.org",
                "code": "d",
            },
        },
        "substitution": {
            "allowedBoolean": True,
            "reason": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ActReason",
                        "code": "FP",
                        "display": "formulary policy",
                    }
                ]
            },
        },
    }


@pytest.fixture
def valid_medication_dispense_fhir(valid_medication_request_fhir):
    """
    Valid MedicationDispense FHIR resource per SHR spec.
    Reference: docs/sha-guides/shr-integration.md Section 4
    """
    return {
        "resourceType": "MedicationDispense",
        "id": str(uuid.uuid4()),
        "status": "completed",
        "medicationCodeableConcept": {
            "coding": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": "197319",
                    "display": "Amlodipine 5 MG Oral Tablet",
                }
            ],
            "text": "Amlodipine 5mg tablet",
        },
        "subject": {"reference": "Patient/CR06XX3268000-3-1", "display": "STEPHEN GITAU"},
        "performer": [
            {"actor": {"reference": "Practitioner/pharm-789", "display": "Pharmacist Bob Green"}},
            {"actor": {"reference": "Organization/org-123", "display": "Community Pharmacy"}},
        ],
        "authorizingPrescription": [
            {"reference": f"MedicationRequest/{valid_medication_request_fhir['id']}"}
        ],
        "type": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                    "code": "RF",
                    "display": "Refill",
                }
            ]
        },
        "quantity": {
            "value": 30,
            "unit": "tablets",
            "system": "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm",
            "code": "TAB",
        },
        "daysSupply": {
            "value": 30,
            "unit": "days",
            "system": "http://unitsofmeasure.org",
            "code": "d",
        },
        "whenPrepared": f"{date.today().isoformat()}T09:15:00Z",
        "whenHandedOver": f"{date.today().isoformat()}T10:30:00Z",
        "dosageInstruction": [{"text": "Take one tablet by mouth once daily"}],
    }


@pytest.fixture
def valid_patient_resource_fhir():
    """
    Valid Patient FHIR resource for SHR registration.
    Reference: docs/sha-guides/shr-integration.md Section 1
    """
    return {
        "resourceType": "Patient",
        "id": "CR06XX3268000-3-1",
        "identifier": [
            {
                "use": "official",
                "system": "https://cr.tiberbu.app/app/client-registry/CR06XX3268000-3-1",
                "value": "CR06XX3268000-3-1",
            }
        ],
        "name": [{"text": "STEPHEN GITAU", "family": "GITAU", "given": ["STEPHEN"]}],
        "gender": "male",
        # Optional but recommended fields
        "birthDate": "1990-05-15",
        "telecom": [
            {"system": "phone", "value": "+254712345678", "use": "mobile"},
            {"system": "email", "value": "stephen.gitau@example.com", "use": "home"},
        ],
        "address": [
            {
                "use": "home",
                "type": "physical",
                "text": "123 Kenyatta Avenue, Nairobi",
                "line": ["123 Kenyatta Avenue"],
                "city": "Nairobi",
                "district": "Nairobi",
                "state": "Nairobi County",
                "postalCode": "00100",
                "country": "KE",
            }
        ],
    }


@pytest.fixture
def valid_ips_bundle():
    """
    Valid International Patient Summary (IPS) bundle.
    Reference: docs/sha-guides/shr-integration.md Section 3
    """
    medication_request_id = str(uuid.uuid4())

    return {
        "resourceType": "Bundle",
        "type": "document",
        "id": str(uuid.uuid4()),
        "timestamp": f"{date.today().isoformat()}T10:58:27.831+00:00",
        "entry": [
            {
                "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                "resource": {
                    "resourceType": "Composition",
                    "id": str(uuid.uuid4()),
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
                    "subject": {"reference": "Patient/CR06XX3268000-3-1"},
                    "date": f"{date.today().isoformat()}T10:58:27+00:00",
                    "author": [{"reference": "Practitioner/789012"}],
                    "title": "Patient Summary",
                    "section": [
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
                            "entry": [],
                        },
                        {
                            "title": "Medication List",
                            "code": {
                                "coding": [
                                    {
                                        "system": "http://loinc.org",
                                        "code": "10160-0",
                                        "display": "History of Medication use Narrative",
                                    }
                                ]
                            },
                            "entry": [{"reference": f"MedicationRequest/{medication_request_id}"}],
                        },
                    ],
                },
            },
            {
                "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                "resource": {
                    "resourceType": "Patient",
                    "id": "CR06XX3268000-3-1",
                    "identifier": [
                        {
                            "system": "https://cr.tiberbu.app/app/client-registry/CR06XX3268000-3-1",
                            "value": "CR06XX3268000-3-1",
                        }
                    ],
                    "name": [{"text": "STEPHEN GITAU", "family": "GITAU", "given": ["STEPHEN"]}],
                    "gender": "male",
                },
            },
        ],
    }


@pytest.fixture
def ips_bundle_with_dispense_history(
    valid_ips_bundle, valid_medication_request_fhir, valid_medication_dispense_fhir
):
    """
    IPS bundle containing prescription and dispense history for refill calculation.
    """
    bundle = valid_ips_bundle.copy()
    bundle["entry"] = list(bundle["entry"])

    # Update medication request ID to match
    medication_request_id = valid_medication_request_fhir["id"]

    # Add MedicationRequest
    bundle["entry"].append(
        {"fullUrl": f"urn:uuid:{medication_request_id}", "resource": valid_medication_request_fhir}
    )

    # Add MedicationDispense
    dispense = valid_medication_dispense_fhir.copy()
    dispense["authorizingPrescription"] = [
        {"reference": f"MedicationRequest/{medication_request_id}"}
    ]
    bundle["entry"].append(
        {"fullUrl": f"urn:uuid:{valid_medication_dispense_fhir['id']}", "resource": dispense}
    )

    return bundle


@pytest.fixture
def shr_api_endpoints():
    """Expected SHR API endpoints per documentation."""
    return {
        "patient_resource": "/v1/patient-resource",
        "shr_submission": "/v1/shr-submission",
        "shr_summary": "/v1/shr/summary",
    }
