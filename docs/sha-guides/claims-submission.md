# API Sequence for Claims Processing

This document outlines the essential APIs and sequence for submitting and tracking claims through our system.

## 1. Pre-Submission Validation

Validate key components before submitting claims:

- **Patient**: `{{base_url}}/v3/client-registry/fetch-client?dynamic_id_search=1&agent=AGENT&id=CRxxxxxxxxxxx-x`
- **Facility**: `{{base_url}}/v2/facility-search?facility-fid=FID-21-xxxxxx-x`
- **Practitioner**: `{{base_url}}/v1/practitioner-search?id=PUID-xxxxxxx-x`

## Prerequisites

### Service Mapping

**Reference (SHIF, PCIF, ECCIF)**: [SHA Benefits and Tariffs Spreadsheet](https://docs.google.com/spreadsheets/d/1hV5oMbZ2R2HqQcSj5zcW5VQ8nQKYIj86/edit?gid=1382031762#gid=1382031762)

**Civil Servants Reference (POMF)**: [SHA Benefits and Tariffs Spreadsheet](https://docs.google.com/spreadsheets/d/14c3RNLgXN_OPmFRJZ5sPZ9b6Rv3E9VSJ/edit?gid=2141381481#gid=2141381481)

The spreadsheet represents a comprehensive catalog of healthcare services. When implementing this data in your facility's HMIS, prioritize mapping the following critical elements:

- **Service Identification**: Clearly identify which specific services your facility is contracted and authorized to provide
- **SHA Code Mapping**: Ensure each service is correctly associated with its corresponding SHA code (e.g., SHA-08-004)
- **Pre-authorization Requirements**: Flag services requiring pre-authorization to prevent claim rejections
- **Reimbursement Tariffs**: Configure the exact payment amount SHA will reimburse for each intervention
- **Additional Business Rules**: While you may implement additional validation rules internally, be aware that the payer system will independently verify all applicable rules during claims processing

Accurate mapping of these core elements will streamline your claims submission process and maximize reimbursement efficiency.

### ICD-11 Diagnostic Coding

**Requirement**: All claims must include valid ICD-11 diagnostic codes

SHA insurance requires ICD-11 diagnostic codes for all claim submissions. When implementing diagnostic coding in your HMIS, ensure the following:

- **ICD-11 Support**: Your HMIS must fully support ICD-11 as the primary diagnostic classification system for SHA
- **Clinician Search Interface**: Implement a searchable interface allowing clinicians to find and select appropriate ICD-11 codes during patient encounters for SHA visits
- **Code Validation**: Ensure only valid ICD-11 codes can be selected and included in claims
- **Dual Code Association**: Link ICD-11 diagnostic codes with corresponding SHA service codes in the claims data structure

**Implementation Options**:

- Maintain a local ICD-11 code repository within your HMIS database
- Integrate with the terminology service APIs available in the DHA collection
- Implement a hybrid approach with cached common codes and API lookup for less frequent diagnoses

ICD-11 codes can be obtained through:

- Consumption of our Terminology Service
- Downloading the ICD-11 data package from the WHO website

**Resources**:
- [ICD API Local Deployment](https://icd.who.int/icdapi/docs2/APIDoc-Version2/)
- [ICD API Docker Container](https://github.com/ICD-API/icd-api-docker)
- [ICD-11 GitHub Repository](https://github.com/ICD-API)

Proper implementation of ICD-11 coding alongside SHA service codes will minimize claim rejections and optimize the reimbursement process.

## 2. Claim Submission

Submit claims as FHIR bundles (JSON format):

**Submit Claim With FHIR bundle**: `{{base_url}}/v1/shr-med/bundle`

## 3. Claim Status Tracking

Track status of submitted claims using either:

- **For all claims in a bundle**: `{{base_url}}/v1/shr-med/claim-status?bundle_id=<bundle_id>`
- **For individual claims**: `{{base_url}}/v1/shr-med/claim-status?claim_id=<claim_id>`

### Important Notes

- **Authentication**: JWT authentication required
- **Response format**: Status updates follow FHIR standard formatting
- **Status notifications**: Available through callback URLs configured on AfyaLink
- **Complete status definitions**: Available at [https://kps.dha.go.ke/artifacts.html](https://kps.dha.go.ke/artifacts.html)

## 4. Integration Reference Guide

### Integration Checklist

| S. No. | Task |
|--------|------|
| 1 | Get Access key/Secret key to payer system APIs |
| 2 | Share response callback url with Payer technical team to configure. Callback url must have a POST method and should be secured with basic auth (additionally IP white-listing can be done). |
| 3 | Ensure that request JSON / FHIR is similar to provided sample JSON. |
| 4 | Each Request must be a valid Bundle Json. |
| 5 | Each claim Id must be unique. If you submit the same claim Id again then system will just treat it as duplicate and would give you the same response as earlier request (making it idempotent) |
| 6 | Ensure that Insurance and Coverage objects are included in JSON. |
| 7 | Use terminology server prefix as per environment in the request Json:<br>- Dev: https://qa-mis.apeiro-digital.com<br>- UAT: https://qa-mis.apeiro-digital.com<br>- Prod: https://fhir.sha.go.ke |
| 8 | Each resource entry in bundle must have a fullUrl field according to the above url and type. |
| 9 | Total amount must be Sum of Net Amount of all items in claim. |
| 10 | Ensure CareTeam has valid details including reference to Practioner. |
| 11 | All references mentioned in the bundle must point to a resource in bundle with matching fullUrl value. |
| 12 | ProductOrService mentioned in claim item, must be a valid SHA/PFMS intervention code. |
| 13 | If the patient is eligible for PFMS coverage then both SHA and PFMS coverage must be mentioned in insurance section. Also an extension to be added to show which claim item belongs to which coverage. Check attached example for reference. |
| 14 | Any PHC claim must have zero total amount. PHC claims are identified by eligible SHA intervention codes |
| 15 | Here are possible ClaimResponse state (check claim-state extension in claimResponse):<br>- `queued` (Request is received and in-queue for engine processing)<br>- `approved` (Request is approved)<br>- `rejected` (Request is rejected)<br>- `in-review` (when request is rejected by engine and assigned to SHA for review)<br>- `clinical-review` (when a preAuth is approved by engine and sent for further verification of SHA)<br>- `sent-for-payment-processing` (Claim is sent to ERP for payment)<br>- `sent-to-surveillance` (Claim/PreAuth Is sent to surveillance)<br>- `payment-completed` (Claim Payment is completed)<br>- `payment-declined` (Claim payment is declined at ERP Due to bank detail or other banking issue.) |

### Reference PreAuth JSON

```json
{
    "resourceType": "Bundle",
    "id": "a6232e92-e623-4837-b111-2b75e38f6aa3",
    "meta": {
        "profile": [
            "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/bundle|1.0.0"
        ]
    },
    "timestamp": "2025-01-04T07:58:58+03:00",
    "type": "message",
    "entry": [
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Practitioner/PUID-0002532-1",
            "resource": {
                "id": "PUID-0002532-1",
                "meta": {
                    "profile": [
                        "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/practitioner|1.0.0"
                    ]
                },
                "name": [{"text": "Dr JANE SMITH DOE"}],
                "qualification": [
                    {"code": {"text": "INTERNAL MEDICINE"}},
                    {"code": {"text": "Nephrology"}}
                ],
                "resourceType": "Practitioner",
                "identifier": [
                    {
                        "system": "https://qa-mis.apeiro-digital.com/fhir/Practitioner/PractitionerRegistrationNumber",
                        "value": "A7616",
                        "use": "official"
                    },
                    {
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/Practitioner/SladeCode",
                        "value": "809301"
                    },
                    {
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/Practitioner/PractitionerRegistryID",
                        "value": "PUID-0002532-1"
                    },
                    {
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/Practitioner/National_ID",
                        "value": "12345678"
                    }
                ],
                "active": true,
                "telecom": [
                    {"value": "+254700***123"},
                    {"system": "email", "value": "j***e@example.com"},
                    {"system": "email", "value": "j***e@example.com"}
                ],
                "address": [{"text": "P.O BOX 1234 00100 NAIROBI"}],
                "gender": "female"
            }
        },
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR9876543210987-6-sha-coverage",
            "resource": {
                "identifier": [
                    {"use": "official", "value": "CR9876543210987-6-sha-coverage"}
                ],
                "status": "active",
                "beneficiary": {
                    "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR9876543210987-6",
                    "type": "Patient"
                },
                "resourceType": "Coverage",
                "extension": [
                    {
                        "valueString": "CAT-SHA-001",
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/schemeCategoryCode"
                    },
                    {
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/schemeCategoryName",
                        "valueString": "SOCIAL HEALTH AUTHORITY"
                    }
                ]
            }
        },
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Organization/12110",
            "resource": {
                "id": "FID-12191-1",
                "meta": {
                    "profile": [
                        "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/provider-organization|1.0.0"
                    ]
                },
                "name": "SAMPLE MEDICAL CENTER",
                "extension": [
                    {
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/facility-level",
                        "valueCodeableConcept": {
                            "coding": [
                                {
                                    "display": "LEVEL 5",
                                    "system": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/facility-level",
                                    "code": "LEVEL 5"
                                }
                            ]
                        }
                    }
                ],
                "identifier": [
                    {
                        "value": "PR-FHIR",
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/license/provider-license"
                    },
                    {
                        "use": "official",
                        "type": {
                            "coding": [
                                {
                                    "code": "slade-code",
                                    "display": "Code",
                                    "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/facility-identifier-types"
                                }
                            ]
                        },
                        "value": "6097"
                    }
                ],
                "active": true,
                "type": [
                    {
                        "coding": [
                            {
                                "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/organization-type",
                                "code": "prov"
                            }
                        ]
                    }
                ],
                "resourceType": "Organization"
            }
        },
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR9876543210987-6",
            "resource": {
                "meta": {
                    "profile": [
                        "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/patient|1.0.0"
                    ]
                },
                "identifier": [
                    {
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/shanumber",
                        "value": "SHA1836543210987-4"
                    },
                    {
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/nationalid",
                        "value": "87654321"
                    },
                    {
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/phonenumber",
                        "value": "+254700123455"
                    },
                    {
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/householdnumber",
                        "value": "HH9876543210987-6"
                    }
                ],
                "name": [
                    {
                        "family": "SAMPLE",
                        "given": ["MICHAEL", "JAMES"],
                        "text": "MICHAEL JAMES SAMPLE"
                    }
                ],
                "gender": "male",
                "birthDate": "1952-12-31",
                "resourceType": "Patient",
                "id": "CR9876543210987-6"
            }
        },
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Claim/dc8f5051-b4e8-4f82-b87b-ba93bcbcb59d",
            "resource": {
                "supportingInfo": [
                    {
                        "sequence": 1,
                        "category": {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/claiminformationcategory",
                                    "code": "attachment",
                                    "display": "Attachment"
                                }
                            ]
                        },
                        "valueAttachment": {
                            "extension": [
                                {
                                    "url": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/attachment-type",
                                    "valueCodeableConcept": {
                                        "coding": [
                                            {
                                                "system": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/attachment-type",
                                                "code": "other",
                                                "display": "Other"
                                            }
                                        ]
                                    }
                                }
                            ],
                            "contentType": "application/pdf",
                            "language": "en",
                            "url": "https://api-edi.provider.sha.go.ke/media/edi/2025/01/04/242a6d37-668f-46f1-9a8a-f10de33ffb79_SAMPLE_DOC.pdf",
                            "size": 1297213,
                            "title": "SAMPLE_DOC.pdf"
                        }
                    }
                ],
                "diagnosis": [
                    {
                        "diagnosisCodeableConcept": {
                            "coding": [
                                {
                                    "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/icd-11",
                                    "code": "GB61",
                                    "display": "Chronic kidney disease"
                                }
                            ]
                        },
                        "sequence": 1
                    }
                ],
                "resourceType": "Claim",
                "extension": [
                    {
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/provider-auth-token",
                        "valueString": "VF2ZC7FSTG"
                    },
                    {
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/preauth-token",
                        "valueString": "6UN77NJV9X"
                    },
                    {
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/has-coinsurance",
                        "valueString": "false"
                    },
                    {
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/session-expected-date",
                        "valueString": "2025-01-04"
                    },
                    {
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/clinical-indications",
                        "valueString": "END_STAGE_RENAL_DISEASE"
                    }
                ],
                "provider": {
                    "reference": "https://qa-mis.apeiro-digital.com/fhir/Organization/12110"
                },
                "careTeam": [
                    {
                        "sequence": 1,
                        "provider": {
                            "reference": "https://qa-mis.apeiro-digital.com/fhir/Practitioner/PUID-0002532-1",
                            "type": "Practitioner",
                            "display": "Dr JANE SMITH DOE"
                        }
                    }
                ],
                "id": "dc8f5051-b4e8-4f82-b87b-ba93bcbcb59d",
                "created": "2025-01-04",
                "item": [
                    {
                        "quantity": {"value": "1"},
                        "unitPrice": {"value": "1", "currency": "KES"},
                        "factor": "1",
                        "net": {"value": "10650", "currency": "KES"},
                        "sequence": 1,
                        "category": {
                            "coding": [
                                {
                                    "system": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/category-codes",
                                    "code": "procedure",
                                    "display": "Procedure"
                                }
                            ]
                        },
                        "productOrService": {
                            "coding": [
                                {
                                    "system": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/intervention-codes",
                                    "code": "SHA-16-001",
                                    "display": "Hemo dialysis"
                                }
                            ]
                        },
                        "servicedPeriod": {
                            "start": "2025-06-01T08:00:00+03:00",
                            "end": "2025-06-03T17:00:00+03:00"
                        }
                    }
                ],
                "insurance": [
                    {
                        "sequence": 1,
                        "focal": true,
                        "coverage": {
                            "reference": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR9876543210987-6-sha-coverage"
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
                "patient": {
                    "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR9876543210987-6"
                },
                "priority": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/processpriority",
                            "code": "normal"
                        }
                    ]
                },
                "use": "preauthorization",
                "billablePeriod": {
                    "start": "2025-01-04T07:54:30+03:00",
                    "end": "2025-01-05T07:54:30+03:00"
                },
                "total": {"value": "10650", "currency": "KES"},
                "identifier": [
                    {
                        "system": "https://qa-mis.apeiro-digital.com/fhir/claim",
                        "value": "dc8f5051-b4e8-4f82-b87b-ba93bcbcb59d"
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
                }
            }
        }
    ]
}
```

### Reference Claim JSON

```json
{
    "id": "d24bde96-cdab-4557-be3c-0e284f911ab4",
    "meta": {
        "profile": ["https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/bundle|1.0.0"]
    },
    "timestamp": "2025-05-22T23:08:01.733818",
    "type": "message",
    "entry": [
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Organization/FID-01-116951-6",
            "resource": {
                "id": "FID-01-116951-6",
                "meta": {
                    "profile": [
                        "https://mis.apeiro-digital.com/fhir/StructureDefinition/provider-organization%7C1.0.0"
                    ]
                },
                "name": "SAMPLE COUNTY HOSPITAL",
                "active": true,
                "extension": [
                    {
                        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/facility-level",
                        "valueCodeableConcept": {
                            "coding": [
                                {
                                    "system": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/facility-level",
                                    "code": "LEVEL 4",
                                    "display": "LEVEL 4"
                                }
                            ]
                        }
                    }
                ],
                "identifier": [
                    {
                        "use": "official",
                        "type": {
                            "coding": [
                                {
                                    "display": "Code",
                                    "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/facility-identifier-types",
                                    "code": "fr-code"
                                }
                            ]
                        },
                        "value": "FID-01-116951-6"
                    }
                ],
                "type": [
                    {
                        "coding": [
                            {
                                "system": "https://ts.kenya-hie.health/fhir/terminology/CodeSystem/organization-type",
                                "code": "prov"
                            }
                        ]
                    }
                ],
                "resourceType": "Organization"
            }
        },
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR1234567890123-4-sha-coverage",
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
                    {"use": "official", "value": "CR1234567890123-4-sha-coverage"}
                ],
                "status": "active",
                "beneficiary": {
                    "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR1234567890123-4",
                    "type": "Patient"
                },
                "resourceType": "Coverage"
            }
        },
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR1234567890123-4",
            "resource": {
                "id": "CR1234567890123-4",
                "meta": {
                    "profile": [
                        "https://mis.apeiro-digital.com/fhir/StructureDefinition/patient%7C1.0.0"
                    ]
                },
                "identifier": [
                    {
                        "value": "CR1234567890123-4",
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/shanumber"
                    }
                ],
                "name": [
                    {
                        "text": "JOHN DOE SAMPLE",
                        "family": "SAMPLE",
                        "given": ["JOHN", "DOE"]
                    }
                ],
                "gender": "male",
                "birthDate": "2010-04-23",
                "resourceType": "Patient"
            }
        },
        {
            "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Claim/37856180-c44e-44dd-8359-6116914a54d0",
            "resource": {
                "id": "37856180-c44e-44dd-8359-6116914a54d0",
                "identifier": [
                    {
                        "system": "https://qa-mis.apeiro-digital.com/fhir/claim",
                        "value": "37856180-c44e-44dd-8359-6116914a54d0"
                    }
                ],
                "status": "active",
                "related": [],
                "type": {
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
                "patient": {
                    "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR1234567890123-4",
                    "identifier": {
                        "value": "CR1234567890123-4",
                        "use": "official",
                        "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/shanumber"
                    },
                    "type": "Patient"
                },
                "billablePeriod": {
                    "start": "2025-05-22T00:00:00",
                    "end": "2025-05-23T00:00:00"
                },
                "insurance": [
                    {
                        "sequence": 1,
                        "focal": true,
                        "coverage": {
                            "reference": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR1234567890123-4-sha-coverage"
                        }
                    }
                ],
                "created": "2025-05-22T23:08:01.733818",
                "provider": {
                    "reference": "https://fr.kenya-hie.health/api/v4/Organization/FID-01-116951-6",
                    "id": "FID-01-116951-6",
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
                        "value": "FID-01-116951-6"
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
                                    "code": "DA42.Z",
                                    "display": "Gastritis, unspecified"
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
                                    "code": "SHA-12-004",
                                    "display": "Prescription, drug administration and dispensing"
                                }
                            ]
                        },
                        "servicedPeriod": {
                            "start": "2025-06-01T08:00:00+03:00",
                            "end": "2025-06-03T17:00:00+03:00"
                        },
                        "quantity": {"value": 15.0},
                        "unitPrice": {"value": 5.0, "currency": "KES"},
                        "factor": 1,
                        "net": {"value": 0, "currency": "KES"},
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
                                    "reference": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR1234567890123-4-sha-coverage"
                                }
                            }
                        ]
                    }
                ],
                "total": {"value": 0, "currency": "KES"},
                "resourceType": "Claim"
            }
        }
    ],
    "resourceType": "Bundle"
}
```

### Reference Claim Response JSON

```json
{
    "message": {
        "mediator_id": "86768e20-9148-4d9a-a5c2-346e67a69338",
        "message": "Use this reference ID to use for Polling for the status of your Claim."
    }
}
```

## Validation Rules

### Start and End Dates Required
Each intervention must include both a start and an end date.

### Use of servicedPeriod Property
The start and end dates must be captured under the `servicedPeriod` property of the Claim resource:

```json
"servicedPeriod": {
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD"
}
```

### Dates Must Be Within Billable Period
The start and end dates must fall within the `billablePeriod` of the overall claim. **Note**: Only the date is validated - time is not considered.

### Length of Stay (LOS) for Per-Diem Interventions
LOS is calculated based on the start and end dates provided in the `servicedPeriod`.

### Sequence Alignment Required
Each intervention must include a sequence number. The sequence must align with the corresponding `servicedPeriod`.

**Misalignment will result in rejection of the claim.**

### Duplicate Intervention Codes Allowed (with Valid Sequences)
It is permissible to repeat intervention codes within a single claim message, provided that:

- Each has a unique sequence number
- Each sequence is correctly aligned with a valid start and end date

This supports scenarios where the same intervention is administered at different times during a single patient visit.
