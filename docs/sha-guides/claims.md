# SHA CLAIMS GUIDE
---
## Bundle Overview

The SHA (Social Health Authority) Claim Bundle is a FHIR-based data structure used to submit healthcare claims to the Social Health Authority system. This document outlines the structure, purpose, and required components of a valid claim bundle.

The bundle follows the FHIR standard and contains several interconnected resources that together represent a complete healthcare claim transaction.

### Purpose

This bundle allows healthcare providers to:

- 📋 Submit patient claim information to the SHA system
- 🏥 Document provided healthcare services
- 💲 Request reimbursement for services rendered
- 🔗 Link patient identity with coverage information
- 📊 Record diagnostic and procedural details

### Building a Claim Bundle

To create a valid claim bundle:

1. Generate a unique GUID for the bundle
2. Create the Organization resource with facility details
3. Create the Patient resource with patient demographics
4. Create the Coverage resource linking to the Patient
5. Create the Claim resource with:
6. References to Patient, Coverage, and Organization
7. Diagnosis information using ICD-11 codes
8. Service items with appropriate codes and pricing
9. Accurate billing period and creation date
10. Set the bundle timestamp to the current time
11. Assemble all resources in the bundle's entry array

### Bundle Structure

The claim bundle is a FHIR Bundle resource of type "message" containing four key resources:

- Organization - Details about the healthcare provider/facility
- Coverage - Patient's insurance/coverage information
- Patient - Patient demographic and identification information
- Claim - The actual claim with diagnoses, services provided, and costs
- Practitioner - The medical / health practitioner providing or requesting the service. This can the ID number of any licensed Health Worker in your facility. Doctors, Nurses, Medical Officers etc. Sample ID (22334289).

```json
{
  "id": "{{$guid}}",
  "meta": {
    "profile": [
      "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/bundle|1.0.0"
    ]
  },
  "timestamp": "2025-01-27T12:19:00.073496",
  "type": "message",
  "entry": [
    {
      "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Organization/FID-22-101101-0",
      "resource": { ... }
    },
    {
      "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR0000000000001-1-sha-coverage",
      "resource": { ... }
    },
    {
      "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR0000000000001-1",
      "resource": { ... }
    },
    {
      "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Claim/a0016666-8137-47c1-b90c-c8e7c3094a28",
      "resource": { ... }
    }
  ],
  "resourceType": "Bundle"
}

```
---

### Bundle Root Properties

Property	Description	What to Pass	Requirement
id	Unique identifier for the bundle	Generate a unique GUID for each claim. This same GUID will be used in the Claim resource fullUrl,resource.id and resource.identifier.value	Required
meta.profile	Profile defining the bundle structure	https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/bundle|1.0.0	Required
timestamp	Timestamp for creation of this claim object	Current datetime in ISO format (YYYY-MM-DDThh:mm:ss.ssssss)	Required
type	Bundle type	Always "message" for claim bundles	Required
entry	Array containing all resources	Array of all resources (Organization, Coverage, Patient, Claim)	Required
resourceType	Resource type	Always "Bundle"	Required
Detailed Resource Breakdown
Environment URLs
Base URL for UAT submissions: https://qa-mis.apeiro-digital.com

Base URL for production submissions: https://mis.apeiro-digital.com

Note: When moving from UAT to production, ensure all URLs in the bundle are updated to use the production base URL.

1. Organization Resource
Represents the healthcare facility submitting the claim. The data in this fields are be obtained by querying the Health Facilities Registry (FHR).

Key fields:

id: The facility identifier (FID) as obtained from HFR. (must match the value in the identifier array)

name: Name of the healthcare facility

active: Whether the facility is active (should be "True")

extension: Contains facility-level information. Only update the code & display while maintaining default values on other properties.

identifier: Official facility identification. Only update the value field while maintaining default values on other properties.

type: Organization type (should be "prov" for provider)

resourceType: Remains as "Organization".

Organization Resource Object

```json
{
  "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Organization/FID-22-101101-0",
  "resource": {
    "id": "FID-22-101101-0",
    "meta": {
      "profile": ["https://mis.apeiro-digital.com/fhir/StructureDefinition/provider-organization|1.0.0"]
    },
    "name": "IngosiOchodo Hospital",
    "active": "True",
    "extension": [
      {
        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/facility-level",
        "valueCodeableConcept": {
          "coding": [{
            "system": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/facility-level",
            "code": "LEVEL 4",
            "display": "LEVEL 4"
          }]
        }
      }
    ],
    "identifier": [{
      "use": "official",
      "type": {
        "coding": [{
          "display": "Code",
          "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/facility-identifier-types",
          "code": "fr-code"
        }]
      },
      "value": "FID-22-101101-0"
    }],
    "type": [{
      "coding": [{
        "system": "https://ts.kenya-hie.health/fhir/terminology/CodeSystem/organization-type",
        "code": "prov"
      }]
    }],
    "resourceType": "Organization"
  }
}
```
2. Coverage Resource
Represents the patient's insurance/coverage with SHA.

Key fields:

fullUrl: Include the CR Number of the patient. e.g.https://qa-mis.apeiro-digital.com/fhir/Coverage/CR0000000000001-1-sha-coverage

extension: Contains scheme category information for SHA. Set schemeCategoryCode as CAT-SHA-001 and schemeCategoryName as SOCIAL HEALTH AUTHORITY

identifier: Include the CR Number of the patient. e.g CR0000000000001-1-sha-coverage

status: Coverage status (should be "active")

beneficiary: Reference to the patient (must match Patient resource)

resourceType: Remains as "Coverage".

Coverage Resource Object

```json
{
  "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR0000000000001-1-sha-coverage",
  "resource": {
    "extension": [
      {
        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/schemeCategoryCode",
        "valueString": "CAT-SHA-001"
      },
      {
        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/schemeCategoryName",
        "valueString": "SOCIAL HEALTH AUTHORITY"
      }
    ],
    "identifier": [
      {
        "use": "official",
        "value": "CR0000000000001-1-sha-coverage"
      }
    ],
    "status": "active",
    "beneficiary": {
      "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR0000000000001-1",
      "type": "Patient"
    },
    "resourceType": "Coverage"
  }
}
```
3. Patient Resource
Contains demographic details and identification for the patient receiving care.

```json
{
  "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR0000000000001-1",
  "resource": {
    "id": "CR0000000000001-1",
    "meta": {
      "profile": ["https://mis.apeiro-digital.com/fhir/StructureDefinition/patient|1.0.0"]
    },
    "identifier": [
      {
        "value": "CR0000000000001-1",
        "use": "official",
        "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/shanumber"
      }
    ],
    "name": [
      {
        "text": "FATUMA MOHAMMED",
        "family": "MOHAMMED",
        "given": ["FATUMA", "MOHAMMED"]
      }
    ],
    "gender": "female",
    "birthDate": "1965-12-31",
    "resourceType": "Patient"
  }
}
```
Key fields:

id: Patient identifier (must match the value in the identifier array)
identifier: Contains SHA number for the patient
name: Patient's name (both full text and structured components)
gender: Patient's gender (female/male)
birthDate: Patient's date of birth (YYYY-MM-DD format)
4. Claim Resource
The core resource containing claim details, diagnosis, and service information.

```json
{
  "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Claim/a0016666-8137-47c1-b90c-c8e7c3094a28",
  "resource": {
    "id": "a0016666-8137-47c1-b90c-c8e7c3094a28",
    "identifier": [
      {
        "system": "https://qa-mis.apeiro-digital.com/fhir/claim",
        "value": "a0016666-8137-47c1-b90c-c8e7c3094a28"
      }
    ],
    "status": "active",
    "type": {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/claim-type",
          "code": "institutional"
        }
      ]
    },
    "related":[ //for preauthorizations claims - Add this section to reference the pre-auth claim-id
               {
                  "claim":{
                     "identifier":{
                        "system":"https://uat-mis.apeiro-digital.com/fhir/claim",
                        "value":"f685ba1e-532c-4ad9-a86a-aa27ba9112e6" // claim-id used during pre-auth
                     }
                  },
                  "relationship":{
                     "coding":[
                        {
                           "system":"https://qa-mis.apeiro-digital.com/fhir/CodeSystem/claim-relation-type",
                           "code":"pre-auth"
                        }
                     ],
                     "text":"Preauthorization"
                  }
               }
            ],

    "subType": {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/ex-claimsubtype",
          "code": "op"
        }
      ]
    },
    "use": "claim",
    "patient": {
      "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR0000000000001-1",
      "identifier": {
        "value": "CR0000000000001-1",
        "use": "official",
        "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/shanumber"
      },
      "type": "Patient"
    },
    "billablePeriod": {
      "start": "2025-01-28T00:00:00",
      "end": "2025-01-29T00:00:00"
    },
    "insurance": [
      {
        "sequence": 1,
        "focal": "True",
        "coverage": {
          "reference": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR0000000000001-1-sha-coverage"
        }
      }
    ],
    "created": "2025-01-27T12:19:00.073496",
    "provider": {
      "reference": "https://fr.kenya-hie.health/api/v4/Organization/FID-22-101101-0",
      "id": "FID-22-101101-0",
      "type": "Organization",
      "identifier": {
        "use": "official",
        "type": {
          "coding": [
            {
              "system": "http://ts-kenyahie.health/facility-identifier-type",
              "code": "fr-code"
            }
          ]
        },
        "system": "https://fr.kenya-hie.health/api/v4/Organization",
        "value": "FID-22-101101-0"
      }
    },
    "priority": {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/processpriority",
          "code": "normal"
        }
      ]
    },
    "diagnosis": [
      {
        "sequence": 1,
        "diagnosisCodeableConcept": {
          "coding": [
            {
              "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/icd-11",
              "code": "1A00",
              "display": "Cholera"
            }
          ]
        }
      }
    ],
    "item": [
      {
        "sequence": 1,
        "productOrService": {
          "coding": [
            {
              "system": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/intervention-codes",
              "code": "SHA-02-005",
              "display": "SHA-02-005"
            }
          ]
        },
        "servicedPeriod": {
              "start": "2025-01-28",
              "end": "2025-01-28"
            },
        "quantity": {
          "value": 1.0
        },
        "unitPrice": {
          "value": 764.0,
          "currency": "KES"
        },
        "factor": 1,
        "net": {
          "value": 764.0,
          "currency": "KES"
        },
        "category": {
          "coding": [
            {
              "system": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/category-codes",
              "code": "procedure",
              "display": "Procedure"
            }
          ]
        },
        "extension": [
          {
            "url": "https://qa-mis.apeiro-digital.com/fhir/sha-coverage/StructureDefinition/Coverage",
            "valueReference": {
              "reference": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR0000000000001-1-sha-coverage"
            }
          }
        ]
      }
    ],
    "total": {
      "value": 764.0,
      "currency": "KES"
    },
    "resourceType": "Claim"
  }
}
```
Core Components of a FHIR Claim Resource

1. Identification & Metadata

```json
{
  "id": "a0016666-8137-47c1-b90c-c8e7c3094a28",
  "identifier": [
    {
      "system": "https://qa-mis.apeiro-digital.com/fhir/claim",
      "value": "a0016666-8137-47c1-b90c-c8e7c3094a28"
    }
  ],
  "created": "2025-01-27T12:19:00.073496",
  "status": "active",
  "resourceType": "Claim"
}
```
id: Unique identifier for the claim (e.g., "a0016666-8137-47c1-b90c-c8e7c3094a28")
identifier: Array containing system identifier (must match the id)
created: Timestamp when claim was created in ISO format
status: Current processing status (typically "active" for new claims)
resourceType: Always "Claim" for this resource type

1. Claim Type Information

```json
{ "type": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/claim-type",
        "code": "institutional"
      }
    ]
  },
  "subType": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/ex-claimsubtype",
        "code": "op"
      }
    ]
  },
  "use": "claim",
  "priority": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/processpriority",
        "code": "normal"
      }
    ]
  }
}
```
type: Categorizes the claim (e.g., "institutional" for facility claims)
subType: Further specifies the claim type (e.g., "op" for outpatient)
use: Purpose of the claim (typically "claim" for initial submissions)
priority: Processing priority (typically "normal")

1. Patient Information

```json
{ "patient": {
    "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR0000000000001-1",
    "identifier": {
      "value": "CR0000000000001-1",
      "use": "official",
      "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/shanumber"
    },
    "type": "Patient"
  }
}
```
patient: Reference to the patient resource including: - reference: Full URL to patient resource
identifier: Patient's unique identifier
type: Always "Patient" for this reference

1. Service Period & Timing

```json
{
  "billablePeriod": {
    "start": "2025-01-28T00:00:00",
    "end": "2025-01-29T00:00:00"
  }
}
```
billablePeriod: The time period for which services were provided - start: When services began (ISO 8601 format)
end: When services ended (ISO 8601 format)
1. Provider Information

```json
{
  "provider": {
    "reference": "https://fr.kenya-hie.health/api/v4/Organization/FID-22-101101-0",
    "id": "FID-22-101101-0",
    "type": "Organization",
    "identifier": {
      "use": "official",
      "type": {
        "coding": [
          {
            "system": "http://ts-kenyahie.health/facility-identifier-type",
            "code": "fr-code"
          }
        ]
      },
      "system": "https://fr.kenya-hie.health/api/v4/Organization",
      "value": "FID-22-101101-0"
    }
  }
}
```
provider: Reference to the organization providing services - reference: Full URL to organization resource
id: Organization's unique identifier
type: Always "Organization" for this reference

identifier: Organization's system identifier with coding details

1. Insurance & Coverage
```json
{
  "insurance": [
    {
      "sequence": 1,
      "focal": "True",
      "coverage": {
        "reference": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR0000000000001-1-sha-coverage"
      }
    }
  ]
}
```
insurance: Array of coverage information - sequence: Order of consideration (usually 1 for primary)
focal: Whether this is the primary coverage ("True")
coverage: Reference to the coverage resource
1. Diagnosis Information

```json
{
  "diagnosis": [
    {
      "sequence": 1,
      "diagnosisCodeableConcept": {
        "coding": [
          {
            "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/icd-11",
            "code": "1A00",
            "display": "Cholera"
          }
        ]
      }
    }
  ]
}
```
diagnosis: Array of diagnoses relevant to the claim - sequence: Order of importance
diagnosisCodeableConcept: The diagnosis code
coding: System and code value (e.g., ICD-11 "1A00" for Cholera)
1. Service Items
```json
{
  "item": [
    {
      "sequence": 1,
      "productOrService": {
        "coding": [
          {
            "system": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/intervention-codes",
            "code": "SHA-02-005",
            "display": "SHA-02-005"
          }
        ]
      },
      "servicedDate": "2025-01-28",
      "quantity": {
        "value": 1.0
      },
      "unitPrice": {
        "value": 764.0,
        "currency": "KES"
      },
      "factor": 1,
      "net": {
        "value": 764.0,
        "currency": "KES"
      },
      "category": {
        "coding": [
          {
            "system": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/category-codes",
            "code": "procedure",
            "display": "Procedure"
          }
        ]
      },
      "extension": [
        {
          "url": "https://qa-mis.apeiro-digital.com/fhir/sha-coverage/StructureDefinition/Coverage",
          "valueReference": {
            "reference": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR0000000000001-1-sha-coverage"
          }
        }
      ]
    }
  ]
}
```
item: Array of services, procedures, or products provided - sequence: Order of line items
productOrService: Service code
servicedDate: When service was performed
quantity: Amount of service provided
unitPrice: Cost per unit of service
factor: Multiplier for pricing (typically 1)
net: Total cost for this line item
category: Classification of the service
extension: Additional data for this item (e.g., coverage links)
1. Financial Information
```json
{
  "total": {
    "value": 764.0,
    "currency": "KES"
  }
}
```
total: Total claim amount in specified currency (must match sum of items)
Resource References
The resources in the bundle are connected through references:

Claim → Patient: The claim's patient.reference points to the Patient resource
Claim → Coverage: The claim's insurance[].coverage.reference points to the Coverage resource
Claim → Organization: The claim's provider.reference points to the Organization resource
Coverage → Patient: The coverage's beneficiary.reference points to the Patient resource ## Validation Requirements
Claim Bundle Requirements ✅
A valid claim bundle must:

📋 Have all required fields completed
🔄 Contain all four resources (Organization, Patient, Coverage, Claim)
🔗 Have consistent identifiers across references
🏥 Use correct coding systems for diagnoses and services(ICD11)
💱 Have accurate currency and numerical values
📅 Use proper date formatting
📊 Have a valid bundle structure according to FHIR standards
