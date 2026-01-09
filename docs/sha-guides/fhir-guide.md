# FHIR Outpatient Guide

## Overview

Fast Healthcare Interoperability Resources (FHIR) is a standard for exchanging healthcare information electronically. This guide focuses on implementing FHIR bundles for outpatient visits, enabling your hospital to structure clinical data in a standardized, interoperable format.

An outpatient visit bundle is a collection of related FHIR resources that together represent a complete clinical encounter. Think of it as a digital folder containing all documents, orders, observations, and other information related to a single patient visit.

## Core Components of an Outpatient Visit Bundle

A typical outpatient visit bundle includes these essential FHIR resources:

- **Bundle Resource** - The container that holds all other resources
- **Encounter Resource** - Documents the patient's visit
- **Composition Resources** - Clinical documents (like SOAP notes)
- **Observation Resources** - Clinical findings and measurements
- **MedicationRequest Resources** - Prescriptions and medication orders

Additional resources may be included based on the specific clinical scenario and hospital needs.

## Sample FHIR Object
```json
{
    "id": "Patient-Appointment-HLC-APP-xxxxxxxx-xxxx0-7707",
    "type": "batch",
    "resourceType": "Bundle",
    "timestamp": "2025-03-07T12:31:23.501404",
    "entry": [
        {
            "resource": {
                "resourceType": "Encounter",
                "id": "Patient-Appointment-HLC-APP-xxxxxxxx-xxxx0-7707",
                "identifier": [
                    {
                        "system": "https://hmisv15-clone.tiberbu.health",
                        "value": "Patient-Appointment-HLC-APP-xxxxxxxx-xxxx0-7707",
                    }
                ],
                "status": "finished",
                "class": {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                    "code": "OP",
                    "display": "outpatient encounter",
                },
                "type": [
                    {
                        "coding": [
                            {
                                "system": "https://shr.kenya-hie.health/encounter-types",
                                "code": "367336001",
                                "display": "OPD - TDH",
                            }
                        ]
                    }
                ],
                "priority": {
                    "coding": [
                        {
                            "system": "https://hl7.org/fhir/R4/v3/ActPriority/vs.html",
                            "code": "routine",
                            "display": "routine",
                        }
                    ]
                },
                "period": {"start": "2025-03-07", "end": "2025-03-08T00:00:00"},
                "subject": {
                    "reference": "https://cr.kenya-hie.health/api/v4/Patient/CR7xxxxxxxxxxx-7",
                    "identifier": [
                        {
                            "system": "https://cr.kenya-hie.health/api/v4/Patient",
                            "value": "CR7xxxxxxxxxxx-7",
                        }
                    ],
                },
                "participant": [
                    {
                        "reference": "https://hwr.kenya-hie.health/api/v4/Practitioner/PUID-xxxxxxxx-x",
                        "individual": {
                            "identifier": [
                                {
                                    "system": "https://hwr.kenya-hie.health/api/v4/Practitioner",
                                    "value": "PUID-xxxxxxxx-x",
                                }
                            ]
                        },
                    }
                ],
                "serviceProvider": {
                    "reference": "https://fr.kenya-hie.health/api/v4/Organization/FID-22-xxxxxxxx-0",
                    "identifier": [
                        {
                            "system": "https://fr.kenya-hie.health/api/v4/Organization",
                            "value": "FID-22-xxxxxxxx-0",
                        }
                    ],
                },
            },
            "request": {"method": "POST", "url": "Patient"},
        },
        {
            "resourceType": "Composition",
            "id": "fc19480e-1e85-489f-aec5-3f1b9852bc48",
            "status": "final",
            "type": {
                "coding": [
                    {"system": "http://loinc.org", "code": "34109-9", "display": "Note"}
                ],
                "text": "SOAP Note",
            },
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "11488-4",
                            "display": "Consult note",
                        }
                    ]
                }
            ],
            "subject": {
                "reference": "https://cr.kenya-hie.health/api/v4/Patient/CR7xxxxxxxxxxx-7",
                "identifier": [
                    {
                        "system": "https://cr.kenya-hie.health/api/v4/Patient",
                        "value": "CR7xxxxxxxxxxx-7",
                    }
                ],
            },
            "encounter": {"reference": "Encounter/encounter456"},
            "date": "2025-03-07T12:11:00.626963",
            "author": [
                {
                    "provider": {
                        "individual": {
                            "reference": "https://hwr.kenya-hie.health/api/v4/Practitioner/PUID-2024-xxxxxxxx-5",
                            "identifier": [
                                {
                                    "system": "https://hwr.kenya-hie.health/api/v4/Practitioner",
                                    "value": "PUID-2024-xxxxxxxx-5",
                                }
                            ],
                        }
                    }
                }
            ],
            "title": "SOAP Note - DNTS-250307-660631-7707-WEKOE",
            "section": [
                {
                    "title": "Subjective",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "61150-9",
                                "display": "Subjective",
                            }
                        ]
                    },
                    "text": {"status": "generated", "display": ""},
                },
                {
                    "title": "Objective",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "61149-1",
                                "display": "Objective",
                            }
                        ]
                    },
                    "text": {"status": "generated", "display": ""},
                },
                {
                    "title": "Assessment",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "51847-2",
                                "display": "Assessment",
                            }
                        ]
                    },
                    "text": {"status": "generated", "display": ""},
                },
                {
                    "title": "Plan",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "61145-9",
                                "display": "Plan",
                            }
                        ]
                    },
                    "text": {"status": "generated", "display": ""},
                },
            ],
        },
        {
            "resourceType": "Composition",
            "id": "41ef80aa-0071-4651-8fea-e1df37b8e568",
            "status": "final",
            "type": {
                "coding": [
                    {"system": "http://loinc.org", "code": "34109-9", "display": "Note"}
                ],
                "text": "SOAP Note",
            },
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "11488-4",
                            "display": "Consult note",
                        }
                    ]
                }
            ],
            "subject": {
                "reference": "https://cr.kenya-hie.health/api/v4/Patient/CR7xxxxxxxxxxx-7",
                "identifier": [
                    {
                        "system": "https://cr.kenya-hie.health/api/v4/Patient",
                        "value": "CR7xxxxxxxxxxx-7",
                    }
                ],
            },
            "encounter": {"reference": "Encounter/encounter456"},
            "date": "2025-03-07T12:14:57.139742",
            "author": [
                {
                    "provider": {
                        "individual": {
                            "reference": "https://hwr.kenya-hie.health/api/v4/Practitioner/PUID-2024-xxxxxxxx-5",
                            "identifier": [
                                {
                                    "system": "https://hwr.kenya-hie.health/api/v4/Practitioner",
                                    "value": "PUID-2024-xxxxxxxx-5",
                                }
                            ],
                        }
                    }
                }
            ],
            "title": "SOAP Note - DNTS-250307-897142-7707-2VQPX",
            "section": [
                {
                    "title": "Subjective",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "61150-9",
                                "display": "Subjective",
                            }
                        ]
                    },
                    "text": {"status": "generated", "display": ""},
                },
                {
                    "title": "Objective",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "61149-1",
                                "display": "Objective",
                            }
                        ]
                    },
                    "text": {"status": "generated", "display": ""},
                },
                {
                    "title": "Assessment",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "51847-2",
                                "display": "Assessment",
                            }
                        ]
                    },
                    "text": {"status": "generated", "display": ""},
                },
                {
                    "title": "Plan",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "61145-9",
                                "display": "Plan",
                            }
                        ]
                    },
                    "text": {"status": "generated", "display": ""},
                },
            ],
        },
        {
            "resource": {
                "resourceType": "MedicationRequest",
                "id": "Drug-Prescription-5a7ff61a21ef60484d8e",
                "meta": {
                    "profile": [
                        "http://hl7.org/fhir/StructureDefinition/patient-diagnosis"
                    ]
                },
                "identifier": [
                    {
                        "use": "official",
                        "system": "https://hmisv15-clone.tiberbu.health",
                        "value": "Drug-Prescription-5a7ff61a21ef60484d8e",
                    }
                ],
                "status": "active",
                "intent": "order",
                "priority": "routine",
                "medicationCodeableConcept": [
                    {
                        "coding": [
                            {
                                "system": "https://openconceptlab.org/orgs/CIEL/sources/CIEL",
                                "code": "Item(Albendazole)",
                                "display": "Albendazole",
                            }
                        ],
                        "text": "Twice daily",
                    }
                ],
                "requester": {
                    "reference": "https://hwr.kenya-hie.health/api/v4/Practitioner/PUID-2024-xxxxxxxx-5",
                    "type": "Practitioner",
                    "identifier": [
                        {
                            "system": "https://hwr.kenya-hie.health/api/v4/Practitioner",
                            "value": "PUID-2024-xxxxxxxx-5",
                        }
                    ],
                },
                "subject": {
                    "reference": "https://cr.kenya-hie.health/api/v4/Patient/CR7xxxxxxxxxxx-7",
                    "type": "Patient",
                    "identifier": {
                        "use": "official",
                        "system": "https://sandbox.kenya-hie.health/api/v4/Patient",
                        "value": "CR7xxxxxxxxxxx-7",
                    },
                },
                "authoredOn": "2025-03-07T12:14:28.925276",
                "dosageInstruction": [
                    {
                        "text": "Albendazole 0",
                        "timing": {
                            "repeat": {"duration": "2", "durationUnit": "d"},
                            "code": {
                                "coding": [
                                    {
                                        "system": "https://openconceptlab.org/orgs/CIEL/sources/CIEL",
                                        "code": "160858",
                                        "display": 0,
                                    }
                                ],
                                "text": 0,
                            },
                        },
                        "asNeededBoolean": false,
                        "route": {
                            "coding": [
                                {
                                    "system": "https://openconceptlab.org/orgs/CIEL/sources/CIEL",
                                    "code": "160240",
                                    "display": "Oral",
                                }
                            ],
                            "text": "Oral",
                        },
                        "doseAndRate": [
                            {
                                "doseQuantity": {
                                    "value": 1.0,
                                    "unit": "Tablet",
                                    "code": "1513AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                                }
                            }
                        ],
                    }
                ],
                "dispenseRequest": {
                    "validityPeriod": {"start": "2025-03-07T12:14:28.925957"},
                    "numberOfRepeatsAllowed": 0,
                    "quantity": {
                        "value": 0,
                        "unit": "Tablet",
                        "code": "1513AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                    },
                },
                "note": [
                    {
                        "authorString": "HLC-PRAC-2024-00002",
                        "time": "2025-03-07T12:14:28.925276",
                        "text": "Oral Albendazole 32 for 2 Hour STAT Dose",
                    }
                ],
            },
            "request": {"method": "POST", "url": "Patient"},
        },
        {
            "patient": "CR7xxxxxxxxxxx-7",
            "resource": {
                "resourceType": "Observation",
                "id": "Form-Data-Repository-FDR-7707-5UHTYH",
                "status": "final",
                "category": [
                    {
                        "coding": [
                            {
                                "system": "https://ocl.kenya-hie.health/CodeSystem/observation-category",
                                "code": "exam",
                                "display": "Exam",
                            }
                        ]
                    }
                ],
                "code": {
                    "coding": [
                        {
                            "system": "https://hmisv15-clone.tiberbu.health",
                            "code": "4GS1C-Unintended Weight Loss",
                            "display": "4GS1C-Unintended Weight Loss",
                        }
                    ]
                },
                "identifier": {
                    "use": "official",
                    "system": "https://hmisv15-clone.tiberbu.health",
                    "value": "Form-Data-Repository-FDR-7707-5UHTYH",
                },
                "subject": {
                    "reference": "https://cr.kenya-hie.health/api/v4/Patient/CR7xxxxxxxxxxx-7",
                    "type": "Patient",
                    "identifier": {
                        "use": "official",
                        "system": "https://api.dha.go.ke/v1/fhir/Patient",
                        "value": "CR7xxxxxxxxxxx-7",
                    },
                },
                "performer": {
                    "reference": "https://hwr.kenya-hie.health/api/v4/Practitioner/PUID-2024-xxxxxxxx-5",
                    "identifier": [
                        {
                            "system": "https://hwr.kenya-hie.health/api/v4/Practitioner",
                            "value": "PUID-2024-xxxxxxxx-5",
                        }
                    ],
                },
                "effectiveDateTime": "2025-03-07T12:13:43.393931",
                "valueString": true,
            },
            "request": {"method": "POST", "url": "Patient"},
        },
        {
            "patient": "CR7xxxxxxxxxxx-7",
            "resource": {
                "resourceType": "Observation",
                "id": "Form-Data-Repository-FDR-7707-5UHTYH",
                "status": "final",
                "category": [
                    {
                        "coding": [
                            {
                                "system": "https://ocl.kenya-hie.health/CodeSystem/observation-category",
                                "code": "exam",
                                "display": "Exam",
                            }
                        ]
                    }
                ],
                "code": {
                    "coding": [
                        {
                            "system": "https://hmisv15-clone.tiberbu.health",
                            "code": "UHJKA-Tbscreening Date",
                            "display": "UHJKA-Tbscreening Date",
                        }
                    ]
                },
                "identifier": {
                    "use": "official",
                    "system": "https://hmisv15-clone.tiberbu.health",
                    "value": "Form-Data-Repository-FDR-7707-5UHTYH",
                },
                "subject": {
                    "reference": "https://cr.kenya-hie.health/api/v4/Patient/CR7xxxxxxxxxxx-7",
                    "type": "Patient",
                    "identifier": {
                        "use": "official",
                        "system": "https://api.dha.go.ke/v1/fhir/Patient",
                        "value": "CR7xxxxxxxxxxx-7",
                    },
                },
                "performer": {
                    "reference": "https://hwr.kenya-hie.health/api/v4/Practitioner/PUID-2024-xxxxxxxx-5",
                    "identifier": [
                        {
                            "system": "https://hwr.kenya-hie.health/api/v4/Practitioner",
                            "value": "PUID-2024-xxxxxxxx-5",
                        }
                    ],
                },
                "effectiveDateTime": "2025-03-07T12:13:43.393931",
                "valueString": "2025-03-07",
            },
            "request": {"method": "POST", "url": "Patient"},
        },
    ],
}
```
## Detailed Resource Implementation

### 1. Bundle Resource

The Bundle is the container for all resources related to the outpatient visit.

**Key Properties:**

- `type`: Set as "batch" or "transaction" for outpatient visits
- `timestamp`: When the bundle was created
- `entry`: Array containing all resources

**Implementation Notes:**

- Each entry in the bundle should have a resource property containing the actual resource
- For batch processing, include a request object with method and URL
- Ensure each resource has a unique ID within your system

### 2. Encounter Resource
The Encounter represents the patient's visit to your facility.

**Key Properties:**

- `status`: The state of the encounter (e.g., "planned", "in-progress", "finished")
- `class`: The type of encounter (e.g., "outpatient")
- `type`: More specific classification of the encounter
- `subject`: Reference to the Patient resource
- `participant`: References to involved practitioners
- `period`: Start and end times of the encounter
- `serviceProvider`: Reference to the providing organization

**Implementation Notes:**

- Always link the encounter to a specific patient
- Include all relevant practitioners involved in the visit
- Use standard coding for encounter types and classes
- Link all other resources in the bundle to this encounter

### 3. Composition Resources
Compositions represent clinical documents like SOAP notes, consultation reports, etc.

**Key Properties:**

- `status`: The status of the composition (usually "preliminary" or "final")
- `type`: The kind of composition (e.g., "SOAP note")
- `subject`: Reference to the Patient resource
- `encounter`: Reference to the Encounter resource
- `date`: When the composition was created
- `author`: Who created the document
- `title`: Human-readable title for the document
- `section`: Array of document sections

**Implementation Notes:**

- Structure sections using standard headings (e.g., Subjective, Objective, Assessment, Plan)
- Include proper narrative text in each section's `text.display` field
- Ensure all narrative content is human-readable
- Multiple Compositions may be included for different aspects of care or from different providers

### 4. Observation Resources
Observations record clinical findings, measurements, and test results.

**Key Properties:**

- `status`: The status of the observation (usually "preliminary" or "final")
- `category`: Classification of the observation (e.g., "vital-signs", "exam")
- `code`: What was observed/measured
- `subject`: Reference to the Patient resource
- `encounter`: Reference to the Encounter resource
- `effectiveDateTime`: When the observation was made
- `performer`: Who made the observation
- `value[x]`: The result of the observation (could be valueQuantity, valueString, etc.)

**Implementation Notes:**

- Use standard coding systems for observation codes (LOINC preferred)
- Include appropriate units for quantitative observations
- Group related observations when appropriate
- Include normal ranges when relevant

### 5. MedicationRequest Resources
MedicationRequests represent prescriptions and medication orders.

**Key Properties:**

- `status`: Status of the request (e.g., "active", "completed")
- `intent`: Intent of the request (usually "order" for prescriptions)
- `medicationCodeableConcept`: The medication being prescribed
- `subject`: Reference to the Patient resource
- `requester`: Who prescribed the medication
- `authoredOn`: When the prescription was written
- `dosageInstruction`: How the medication should be taken
- `dispenseRequest`: Details for pharmacy dispensing

**Implementation Notes:**

- Use standard medication codes (RxNorm, NDC, or similar)
- Include complete dosage instructions
- Specify route, frequency, duration, and quantity
- Include patient instructions in plain language

## Additional Resources for Outpatient Bundles
While the core resources described above form the foundation of an outpatient visit bundle, additional resources may be necessary depending on the specific clinical scenario:

### Sample Bundle Structure
├── Encounter (outpatient visit)
├── Composition (SOAP note)
├── Observation (vital signs)
├── Observation (physical exam findings)
├── Observation (screening results)
├── Condition (diagnoses)
├── MedicationRequest (prescriptions)
├── ServiceRequest (lab orders)
├── ServiceRequest (referrals)
├── Procedure (minor procedures done)
└── CarePlan (follow-up plan)
Implementing FHIR outpatient visit bundles represents a significant step toward standardized, interoperable healthcare data. While the implementation process requires careful planning and execution, the benefits in terms of data exchange, clinical workflow, and patient care are substantial.

By following this guide, your hospital can create a solid foundation for FHIR implementation that supports current interoperability needs while positioning you for future advancements in health information exchange.

## Resources

- [HL7 FHIR Documentation](https://hl7.org/fhir/)
- [FHIR Bundle Resource](https://hl7.org/fhir/bundle.html)
- [US Core Implementation Guide](https://hl7.org/fhir/us/core/)
- [SMART on FHIR](https://docs.smarthealthit.org/)
- [FHIR Testing Servers](https://wiki.hl7.org/Publicly_Available_FHIR_Servers_for_testing)
