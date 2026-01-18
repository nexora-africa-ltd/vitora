# SHA Shared Health Record (SHR) Integration Guide

This document outlines the complete pharmacy workflow using the custom FHIR API implementation based on the provided Postman collection. The workflow covers patient registration, prescription submission, patient summary retrieval, refill balance calculation, and medication dispensing.

> **Note**: This documentation does not implement encryption workflows described at the beginning of this guide.

---

## Table of Contents

1. [Register/Update Patient Information](#1-registerupdate-patient-information)
2. [Post a Prescription (MedicationRequest)](#2-post-a-prescription-medicationrequest)
3. [Fetch International Patient Summary (IPS)](#3-fetch-international-patient-summary-ips)
4. [Post a Medication Dispense](#4-post-a-medication-dispense)
5. [Computing Medication Refill Balance](#5-computing-medication-refill-balance)
6. [Complete Workflow Example](#complete-workflow-example)
7. [Refill Calculation Explained](#refill-calculation-explained)

---

## 1. Register/Update Patient Information

Before processing prescriptions, ensure that the patient exists in the system.

### Endpoint

```http
PUT {{base_url}}/v1/patient-resource?cr_id=CR06XX3268000-3-1
```

### Authentication

Basic Authentication

### Request Body

```json
{
    "resourceType": "Patient",
    "id": "CR06XX3268000-3-1",
    "identifier": [
        {
            "use": "official",
            "system": "https://cr.tiberbu.app/app/client-registry/CR06XX3268000-3-1",
            "value": "CR06XX3268000-3-1"
        }
    ],
    "name": [
        {
            "text": "STEPHEN GITAU",
            "family": "GITAU",
            "given": ["STEPHEN"]
        }
    ],
    "gender": "male"
}
```

### Response

A successful response indicates the patient has been registered or updated in the system.

---

## 2. Post a Prescription (MedicationRequest)

Submit a new prescription for the patient.

### Endpoint

```http
POST {{base_url}}/v1/shr-submission?resource=MedicationRequest
```

### Authentication

Basic Authentication

### Request Body

```json
{
    "resourceType": "MedicationRequest",
    "id": "a87e7dc1-3a8c-4f44-b5e7-891d73b783f2",
    "status": "active",
    "intent": "order",
    "medicationCodeableConcept": {
        "coding": [
            {
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "code": "197319",
                "display": "Amlodipine 5 MG Oral Tablet"
            }
        ],
        "text": "Amlodipine 5mg tablet"
    },
    "subject": {
        "reference": "Patient/CR06XX3268000-3-1",
        "display": "STEPHEN GITAU"
    },
    "authoredOn": "2025-03-28",
    "requester": {
        "reference": "Practitioner/123456",
        "display": "Dr. Jane Smith"
    },
    "recorder": {
        "reference": "Practitioner/123456",
        "display": "Dr. Jane Smith"
    },
    "reasonCode": [
        {
            "coding": [
                {
                    "system": "http://hl7.org/fhir/sid/icd-10",
                    "code": "I10",
                    "display": "Essential (primary) hypertension"
                }
            ]
        }
    ],
    "dosageInstruction": [
        {
            "text": "Take one tablet by mouth once daily",
            "timing": {
                "repeat": {
                    "frequency": 1,
                    "period": 1,
                    "periodUnit": "d"
                }
            },
            "route": {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "code": "26643006",
                        "display": "Oral route"
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
                                "display": "Ordered"
                            }
                        ]
                    },
                    "doseQuantity": {
                        "value": 1,
                        "unit": "tablet",
                        "system": "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm",
                        "code": "TAB"
                    }
                }
            ]
        }
    ],
    "dispenseRequest": {
        "validityPeriod": {
            "start": "2025-03-28",
            "end": "2025-09-28"
        },
        "numberOfRepeatsAllowed": 5,
        "quantity": {
            "value": 30,
            "unit": "tablets",
            "system": "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm",
            "code": "TAB"
        },
        "expectedSupplyDuration": {
            "value": 30,
            "unit": "days",
            "system": "http://unitsofmeasure.org",
            "code": "d"
        }
    },
    "substitution": {
        "allowedBoolean": true,
        "reason": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActReason",
                    "code": "FP",
                    "display": "formulary policy"
                }
            ]
        }
    },
    "note": [
        {
            "text": "Patient has reported dizziness with higher doses in the past."
        }
    ]
}
```

### Response

A successful response confirms the prescription has been stored in the system.

---

## 3. Fetch International Patient Summary (IPS)

Retrieve the patient's complete health summary, including active medications and prescriptions.

### Endpoint

```http
GET {{base_url}}/v1/shr/summary?cr_id=CR06XX3268000-3-1
```

### Authentication

Basic Authentication

### Response

The response will be a FHIR Bundle containing the patient's health summary, including:

- Patient demographics
- Active medications
- Allergies
- Problem list
- Immunizations
- Recent lab results

#### Example Response

```json
{
    "resourceType": "Bundle",
    "type": "document",
    "id": "58a6f841-3a23-4a19-9f96-9852cb481763",
    "timestamp": "2025-03-28T10:58:27.831+00:00",
    "entry": [
        {
            "fullUrl": "urn:uuid:945dcd5f-3d9e-4bc1-8892-621f9a987a32",
            "resource": {
                "resourceType": "Composition",
                "id": "945dcd5f-3d9e-4bc1-8892-621f9a987a32",
                "status": "final",
                "type": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "60591-5",
                            "display": "Patient summary Document"
                        }
                    ]
                },
                "subject": {
                    "reference": "Patient/CR06XX3268000-3-1"
                },
                "date": "2025-03-28T10:58:27+00:00",
                "author": [
                    {
                        "reference": "Practitioner/789012"
                    }
                ],
                "title": "Patient Summary",
                "section": [
                    {
                        "title": "Allergies and Intolerances",
                        "code": {
                            "coding": [
                                {
                                    "system": "http://loinc.org",
                                    "code": "48765-2",
                                    "display": "Allergies and adverse reactions Document"
                                }
                            ]
                        },
                        "entry": [
                            {
                                "reference": "AllergyIntolerance/87654321"
                            }
                        ]
                    },
                    {
                        "title": "Medication List",
                        "code": {
                            "coding": [
                                {
                                    "system": "http://loinc.org",
                                    "code": "10160-0",
                                    "display": "History of Medication use Narrative"
                                }
                            ]
                        },
                        "entry": [
                            {
                                "reference": "MedicationRequest/a87e7dc1-3a8c-4f44-b5e7-891d73b783f2"
                            }
                        ]
                    }
                ]
            }
        },
        {
            "fullUrl": "urn:uuid:7f60d206-66c5-4998-a812-6d666c3f1111",
            "resource": {
                "resourceType": "Patient",
                "id": "CR06XX3268000-3-1",
                "identifier": [
                    {
                        "system": "https://cr.tiberbu.app/app/client-registry/CR06XX3268000-3-1",
                        "value": "CR06XX3268000-3-1"
                    }
                ],
                "name": [
                    {
                        "text": "STEPHEN GITAU",
                        "family": "GITAU",
                        "given": ["STEPHEN"]
                    }
                ],
                "gender": "male"
            }
        }
    ]
}
```

---

## 4. Post a Medication Dispense

To record a medication dispensation, create a MedicationDispense resource.

### Endpoint

```http
POST {{base_url}}/v1/shr-submission?resource=MedicationDispense
```

### Authentication

Basic Authentication

### Request Body

```json
{
    "resourceType": "MedicationDispense",
    "id": "c98765a4-321b-4cde-f567-8ab9c0123def",
    "status": "completed",
    "medicationCodeableConcept": {
        "coding": [
            {
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "code": "197319",
                "display": "Amlodipine 5 MG Oral Tablet"
            }
        ],
        "text": "Amlodipine 5mg tablet"
    },
    "subject": {
        "reference": "Patient/CR06XX3268000-3-1",
        "display": "STEPHEN GITAU"
    },
    "performer": [
        {
            "actor": {
                "reference": "Practitioner/pharm-789",
                "display": "Pharmacist Bob Green"
            }
        },
        {
            "actor": {
                "reference": "Organization/org-123",
                "display": "Community Pharmacy"
            }
        }
    ],
    "authorizingPrescription": [
        {
            "reference": "MedicationRequest/a87e7dc1-3a8c-4f44-b5e7-891d73b783f2"
        }
    ],
    "type": {
        "coding": [
            {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "RF",
                "display": "Refill"
            }
        ]
    },
    "quantity": {
        "value": 30,
        "unit": "tablets",
        "system": "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm",
        "code": "TAB"
    },
    "daysSupply": {
        "value": 30,
        "unit": "days",
        "system": "http://unitsofmeasure.org",
        "code": "d"
    },
    "whenPrepared": "2025-04-27T09:15:00Z",
    "whenHandedOver": "2025-04-27T10:30:00Z",
    "dosageInstruction": [
        {
            "text": "Take one tablet by mouth once daily"
        }
    ],
    "note": [
        {
            "text": "Patient reported no side effects with current dosage."
        }
    ]
}
```

### Response

A successful response confirms the dispense has been recorded in the system.

---

## 5. Computing Medication Refill Balance

Since the Postman collection doesn't include a direct endpoint for querying refill balances, we need to create a process for computing this. Here's a Python script to calculate the refill balance based on the IPS data:

```python
import requests
import json
from datetime import datetime, timedelta
import base64

def get_auth_header(username, password):
        """Generate the basic auth header for API requests"""
        credentials = f"{username}:{password}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return {"Authorization": f"Basic {encoded}"}

def get_patient_summary(base_url, cr_id, auth_header):
        """Fetch the patient's health summary"""
        url = f"{base_url}/v1/shr/summary?cr_id={cr_id}"
        response = requests.get(url, headers=auth_header)

        if response.status_code != 200:
                raise Exception(f"Failed to get patient summary: {response.status_code}")

        return response.json()

def calculate_refill_balance(ips_bundle, medication_request_id):
        """Calculate remaining refills based on the IPS data"""

        # Initialize variables
        medication_request = None
        medication_dispenses = []

        # Process IPS bundle to find the MedicationRequest and related MedicationDispense resources
        for entry in ips_bundle.get("entry", []):
                resource = entry.get("resource", {})

                if resource.get("resourceType") == "MedicationRequest" and resource.get("id") == medication_request_id:
                        medication_request = resource

                if resource.get("resourceType") == "MedicationDispense":
                        for prescription in resource.get("authorizingPrescription", []):
                                if prescription.get("reference") == f"MedicationRequest/{medication_request_id}":
                                        medication_dispenses.append(resource)

        if not medication_request:
                return {
                        "error": f"MedicationRequest {medication_request_id} not found in patient summary"
                }

        # Calculate refill information
        total_allowed_fills = medication_request.get("dispenseRequest", {}).get("numberOfRepeatsAllowed", 0) + 1
        total_dispenses = len(medication_dispenses)
        remaining_refills = total_allowed_fills - total_dispenses

        # Find next refill date based on most recent dispense
        next_refill_date = None
        if medication_dispenses:
                # Sort by dispense date
                sorted_dispenses = sorted(
                        medication_dispenses,
                        key=lambda x: x.get("whenHandedOver", ""),
                        reverse=True
                )

                latest_dispense = sorted_dispenses[0]
                latest_dispense_date = datetime.fromisoformat(latest_dispense["whenHandedOver"].replace("Z", "+00:00"))
                days_supply = latest_dispense.get("daysSupply", {}).get("value", 30)

                next_refill_date = (latest_dispense_date + timedelta(days=days_supply)).isoformat()

        # Check if prescription is still valid
        is_valid = True
        current_date = datetime.now()

        if "dispenseRequest" in medication_request and "validityPeriod" in medication_request["dispenseRequest"]:
                end_date_str = medication_request["dispenseRequest"]["validityPeriod"].get("end")
                if end_date_str:
                        end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                        if current_date > end_date:
                                is_valid = False

        return {
                "medicationRequestId": medication_request_id,
                "totalAllowedFills": total_allowed_fills,
                "fillsDispensed": total_dispenses,
                "remainingRefills": remaining_refills,
                "nextRefillDueDate": next_refill_date,
                "isPrescriptionValid": is_valid,
                "prescriptionExpiryDate": medication_request.get("dispenseRequest", {}).get("validityPeriod", {}).get("end")
        }

# Example usage
base_url = "https://api.example.org"
username = "your_username"
password = "your_password"
cr_id = "CR06XX3268000-3-1"
medication_request_id = "a87e7dc1-3a8c-4f44-b5e7-891d73b783f2"

auth_header = get_auth_header(username, password)
ips_bundle = get_patient_summary(base_url, cr_id, auth_header)
refill_info = calculate_refill_balance(ips_bundle, medication_request_id)

print(json.dumps(refill_info, indent=2))
```

### Example Output

```json
{
    "medicationRequestId": "a87e7dc1-3a8c-4f44-b5e7-891d73b783f2",
    "totalAllowedFills": 6,
    "fillsDispensed": 2,
    "remainingRefills": 4,
    "nextRefillDueDate": "2025-05-27T10:30:00+00:00",
    "isPrescriptionValid": true,
    "prescriptionExpiryDate": "2025-09-28"
}
```

---

## Complete Workflow Example

1. **Patient Registration/Update:**
     ```http
     PUT {{base_url}}/v1/patient-resource?cr_id=CR06XX3268000-3-1
     ```
     - Ensures the patient exists in the system

2. **Prescription Creation:**
     ```http
     POST {{base_url}}/v1/shr-submission?resource=MedicationRequest
     ```
     - Creates an initial prescription with 5 refills allowed

3. **Initial Dispensing:**
     ```http
     POST {{base_url}}/v1/shr-submission?resource=MedicationDispense
     ```
     - Records the initial fill of the medication

4. **Patient Summary Retrieval:**
     ```http
     GET {{base_url}}/v1/shr/summary?cr_id=CR06XX3268000-3-1
     ```
     - Gets current health information including prescription/dispensing history

5. **Refill Balance Calculation:**
     - Use the provided Python code with data from the IPS
     - Determines if patient is eligible for refill

6. **Subsequent Dispensing:**
     ```http
     POST {{base_url}}/v1/shr-submission?resource=MedicationDispense
     ```
     - Records additional refills as they occur

The workflow continues with repeated IPS retrievals and dispensing records until the prescription expires or all refills are used.

---

## Refill Calculation Explained

The refill computation process determines how many medication refills a patient has left and when they can get their next refill. Here's how it works:

### Step 1: Gather the Information

The system collects two key pieces of information:

- The original prescription details (from the `MedicationRequest`)
- A history of all times the medication was dispensed (from `MedicationDispense` records)

### Step 2: Calculate Basic Numbers

- **Total allowed fills**: This is the initial fill plus all refills
    - Example: If the doctor allows 5 refills, the total is 6 fills (1 initial + 5 refills)
- **Fills used so far**: Count how many times the pharmacy has given the medication to the patient
- **Remaining refills**: Subtract the fills used from the total allowed

### Step 3: Determine Next Refill Date

1. Look at when the patient last picked up their medication
2. Check how many days that supply was meant to last (usually 30 days)
3. Add those days to the last pickup date to find when they can get their next refill

### Step 4: Check If Prescription Is Still Valid

- Prescriptions typically expire after a certain period (often 6 months)
- The system compares today's date with the prescription's end date
- If today's date is past the end date, the prescription is no longer valid, regardless of remaining refills

### Example

For patient Stephen Gitau:

- His doctor wrote a prescription for Amlodipine with **5 refills** (6 total fills)
- He's picked up the medication **twice** already
- He has **4 refills remaining**
- His next refill is due on **May 27, 2025**
- His prescription remains valid until **September 28, 2025**

The Python code does all this automatically by processing the FHIR resources from the patient's health record, saving pharmacists from having to calculate these details manually.
