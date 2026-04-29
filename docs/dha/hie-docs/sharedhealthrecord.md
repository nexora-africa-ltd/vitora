# SHR Service APIs

_Version: `1.0`_
Shared Health Record (SHR) Service APIs

**Servers:**
- `https://ilm-dev.dha.go.ke/uat-middleware`

## Table of Contents

- [Clinical](#clinical)
- [Clinical - Documents](#clinical---documents)

## Clinical

### GET /clinical/allergens/search

**Search Allergens**

Searches for allergen codes from the ICD-11 Allergens collection in OCL.
Returns codes suitable for use in FHIR AllergyIntolerance resources.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `search` | query | `string` |  | Search query (optional - returns all if empty) |
| `limit` | query | `integer` |  | Maximum results (default: 25, max: 100) |
| `offset` | query | `integer` |  | Pagination offset (default: 0) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
[
  {
    "code": "string",
    "display": "string",
    "system": "string"
  }
]
```

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_
```json
{
  "error": "string",
  "message": "string"
}
```

### GET /clinical/allergyintolerance

**Search AllergyIntolerance**

Searches for FHIR AllergyIntolerance resources using the HAPI FHIR SDK AllergyIntolerance model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `severity` | query | `string` |  | AllergyIntolerance severity |
| `clinical-status` | query | `string` |  | AllergyIntolerance clinical-status |
| `criticality` | query | `string` |  | AllergyIntolerance criticality |
| `date` | query | `string` |  | AllergyIntolerance date |
| `identifier` | query | `string` |  | AllergyIntolerance identifier |
| `limit` | query | `integer` |  | Number of results per page |
| `offset` | query | `integer` |  | Number of results to skip |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "allergyintolerance": [],
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/allergyintolerance

**Create Episode of Care**

Creates a new FHIR AllergyIntolerance resource using the HAPI FHIR SDK AllergyIntolerance model

_Tags: `Clinical`_

**Request Body:**
FHIR AllergyIntolerance resource
_Required._

_Content-Type: `application/json`_
```json
{
  "asserter": {
    "display": "string",
    "extension": [
      {
        "extension": [],
        "id": "string",
        "url": "string",
        "valueAddress": {
          "city": "string",
          "country": "string",
          "district": "string",
          "extension": [],
          "id": "string",
          "line": [
            "string"
          ],
          "period": {
            "end": "string",
            "extension": [],
            "id": "string",
            "start": "string"
          },
          "postalCode": "string",
          "state": "string",
          "text": "string",
          "type": 0,
          "use": 0
        },
        "valueAge": {
          "code": "string",
          "comparator": 0,
          "extension": [],
          "id": "string",
          "system": "string",
          "unit": "string",
          "value": "string"
        },
        "valueAnnotation": {
          "authorString": "string",
          "extension": [],
          "id": "string",
          "text": "string",
          "time": "string"
        },
        "valueAttachment": {
          "contentType": "string",
          "creation": "string",
          "data": "string",
          "extension": [],
          "hash": "string",
          "id": "string",
          "language": "string",
          "size": 0,
          "title": "string",
          "url": "string"
        },
        "valueBase64Binary": "string",
        "valueBoolean": false,
        "valueCanonical": "string",
        "valueCode": "string",
        "valueCodeableConcept": {
          "coding": [],
          "extension": [],
          "id": "string",
          "text": "string"
        },
        "valueContactDetail": {
          "extension": [],
          "id": "string",
          "name": "string",
          "telecom": []
        },
        "valueContributor": {
          "contact": [],
          "extension": [],
          "id": "string",
          "name": "string",
          "type": 0
        },
        "valueCount": {
          "code": "string",
          "extension": [],
          "id": "string",
          "system": "string",
          "unit": "string",
          "value": "string"
        },
        "valueDataRequirement": {
          "codeFilter": [],
          "dateFilter": [],
          "extension": [],
          "id": "string",
          "limit": 0,
          "mustSupport": [
            "string"
          ],
          "profile": [
            "string"
          ],
          "sort": [],
          "type": "string"
        },
        "valueDate": "string",
        "valueDateTime": "string",
        "valueDecimal": "string",
        "valueDistance": {
          "code": "string",
          "extension": [],
          "id": "string",
          "system": "string",
          "unit": "string",
          "value": "string"
        },
        "valueDosage": {
          "additionalInstruction": [],
          "asNeededBoolean": false,
          "doseAndRate": [],
          "extension": [],
          "id": "string",
          "modifierExtension": [],
          "patientInstruction": "string",
          "sequence": 0,
          "text": "string",
          "timing": {
            "event": [],
            "extension": [],
            "id": "string",
            "modifierExtension": []
          }
        },
        "valueExpression": {
          "description": "string",
          "expression": "string",
          "extension": [],
          "id": "string",
          "language": "string",
          "name": "string",
          "reference": "string"
        },
        "valueHumanName": {
          "extension": [],
          "family": "string",
          "given": [
            "string"
          ],
          "id": "string",
          "prefix": [
            "string"
          ],
          "suffix": [
            "string"
          ],
          "text": "string",
          "use": 0
        },
        "valueId": "string",
        "valueIdentifier": {
          "extension": [],
          "id": "string",
          "system": "string",
          "use": 0,
          "value": "string"
        },
        "valueInstant": "string",
        "valueInteger": 0,
        "valueMarkdown": "string",
        "valueMeta": {
          "extension": [],
          "id": "string",
          "lastUpdated": "string",
          "profile": [
            "string"
          ],
          "security": [],
          "source": "string",
          "tag": [],
          "versionId": "string"
        },
        "valueMoney": {
          "currency": "string",
          "extension": [],
          "id": "string",
          "value": "string"
        },
        "valueOid": "string",
        "valueParameterDefinition": {
          "documentation": "string",
          "extension": [],
          "id": "string",
          "max": "string",
          "min": 0,
          "name": "string",
          "profile": "string",
          "type": "string",
          "use": 0
        },
        "valuePositiveInt": 0,
        "valueRelatedArtifact": {
          "citation": "string",
          "display": "string",
          "extension": [],
          "id": "string",
          "label": "string",
          "resource": "string",
          "type": 0,
          "url": "string"
        },
        "valueSampledData": {
          "data": "string",
          "dimensions": 0,
          "extension": [],
          "factor": "string",
          "id": "string",
          "lowerLimit": "string",
          "period": "string",
          "upperLimit": "string"
        },
        "valueSignature": {
          "data": "string",
          "extension": [],
          "id": "string",
          "sigFormat": "string",
          "targetFormat": "string",
          "type": [],
          "when": "string"
        },
        "valueString": "string",
        "valueTime": "string",
        "valueTriggerDefinition": {
          "data": [],
          "extension": [],
          "id": "string",
          "name": "string",
          "timingDate": "string",
          "timingDateTime": "string",
          "type": 0
        },
        "valueUnsignedInt": 0,
        "valueUri": "string",
        "valueUrl": "string",
        "valueUsageContext": {
          "extension": [],
          "id": "string"
        },
        "valueUuid": "string"
      }
    ],
    "id": "string",
    "reference": "string",
    "type": "string"
  },
  "category": [
    0
  ],
  "contained": [
    [
      0
    ]
  ],
  "criticality": 0,
  "extension": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "language": "string",
  "lastOccurrence": "string",
  "modifierExtension": [],
  "note": [],
  "onsetDateTime": "string",
  "onsetString": "string",
  "reaction": [
    {
      "description": "string",
      "extension": [],
      "id": "string",
      "manifestation": [],
      "modifierExtension": [],
      "note": [],
      "onset": "string",
      "severity": 0
    }
  ],
  "recordedDate": "string",
  "text": {
    "div": "string",
    "extension": [],
    "id": "string",
    "status": 0
  },
  "type": 0
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/allergyintolerance/{id}

**Get AllergyIntolerance**

Retrieves a FHIR AllergyIntolerance resource by ID using the HAPI FHIR SDK AllergyIntolerance model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | AllergyIntolerance ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/allergyintolerance/{id}

**Update AllergyIntolerance**

Updates a FHIR AllergyIntolerance resource by ID using the HAPI FHIR SDK AllergyIntolerance model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | AllergyIntolerance ID |

**Request Body:**
FHIR Allergyintolerance resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PATCH /clinical/allergyintolerance/{id}

**Patch AllergyIntolerance**

Partially updates a FHIR AllergyIntolerance resource by ID using FHIR Parameters (JSON Patch semantics)

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | AllergyIntolerance ID |

**Request Body:**
FHIR Parameters resource containing patch operations
_Required._

_Content-Type: `application/json`_
```json
{
  "id": "string",
  "implicitRules": "string",
  "language": "string",
  "parameter": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "name": "string",
      "part": [],
      "resource": [
        0
      ],
      "valueBase64Binary": "string",
      "valueBoolean": false,
      "valueCanonical": "string",
      "valueCode": "string",
      "valueDate": "string",
      "valueDateTime": "string",
      "valueDecimal": "string",
      "valueId": "string",
      "valueInstant": "string",
      "valueInteger": 0,
      "valueMarkdown": "string",
      "valueOid": "string",
      "valuePositiveInt": 0,
      "valueString": "string",
      "valueTime": "string",
      "valueUnsignedInt": 0,
      "valueUri": "string",
      "valueUrl": "string",
      "valueUuid": "string"
    }
  ]
}
```

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/appointments

**Search Appointments**

Searches for FHIR Appointment resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `practitioner` | query | `string` |  | Practitioner reference |
| `status` | query | `string` |  | Appointment status (proposed, pending) |
| `date` | query | `string` |  | Appointment date/time |
| `service-type` | query | `string` |  | Service being performed |
| `appointment-type` | query | `string` |  | Type of appointment |
| `location` | query | `string` |  | Location reference |
| `identifier` | query | `string` |  | Appointment identifier |
| `_id` | query | `string` |  | Search by resource ID |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "appointments": [],
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/appointments

**Create Appointment**

Creates a new FHIR Appointment resource using the HAPI FHIR SDK Appointment model

_Tags: `Clinical`_

**Request Body:**
FHIR Appointment resource
_Required._

_Content-Type: `application/json`_
```json
{
  "basedOn": [],
  "comment": "string",
  "contained": [
    [
      0
    ]
  ],
  "created": "string",
  "description": "string",
  "end": "string",
  "extension": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "language": "string",
  "minutesDuration": 0,
  "modifierExtension": [],
  "participant": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "required": 0,
      "status": 0,
      "type": []
    }
  ],
  "patientInstruction": "string",
  "priority": 0,
  "reasonCode": [],
  "reasonReference": [],
  "requestedPeriod": [],
  "serviceCategory": [],
  "serviceType": [],
  "slot": [],
  "specialty": [],
  "start": "string",
  "status": 0,
  "supportingInformation": []
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/appointments/{id}

**Get Appointment**

Retrieves a FHIR Appointment resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Appointment ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/appointments/{id}

**Update Appointment**

Updates an existing FHIR Appointment resource in the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Appointment ID |

**Request Body:**
Updated FHIR Appointment resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/appointments/{id}

**Delete Appointment**

Deletes a FHIR Appointment resource from the HAPI FHIR server by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Appointment ID |

**Responses:**
**Response `204`** — Appointment deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PATCH /clinical/appointments/{id}

**Patch Appointment**

Partially updates a FHIR Appointment resource by ID using FHIR Parameters (JSON Patch semantics)

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Appointment ID |

**Request Body:**

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/condition

**Creates Condition**

Creates a FHIR Condition resource using the HAPI FHIR SDK Condition model

_Tags: `Clinical`_

**Responses:**
**Response `201`** — No Content

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/conditions

**Search Conditions**

Searches for FHIR SearchConditions resources using the HAPI FHIR SDK Condition model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `encounter` | query | `string` |  | Encounter reference |
| `stage` | query | `string` |  | Condition stage |
| `limit` | query | `integer` |  | Number of results per page |
| `offset` | query | `integer` |  | Number of results to skip |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "conditions": [],
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/conditions/{id}

**Get Condition**

Retrieves a FHIR Condition resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Condition ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/conditions/{id}

**Updates Condition**

Updates a FHIR Condition resource using the HAPI FHIR SDK Condition model

_Tags: `Clinical`_

**Responses:**
**Response `200`** — Ok

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PATCH /clinical/conditions/{id}

**Patch Condition**

Partially updates a FHIR Condition resource using FHIR Parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Condition ID |

**Request Body:**
FHIR Parameters for patch operation
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/diagnostic-reports

**Search DiagnosticReports**

Searches for FHIR DiagnosticReport resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `status` | query | `string` |  | DiagnosticReport status |
| `code` | query | `string` |  | DiagnosticReport code |
| `date` | query | `string` |  | DiagnosticReport date |
| `encounter` | query | `string` |  | Encounter reference |
| `identifier` | query | `string` |  | DiagnosticReport identifier |
| `_id` | query | `string` |  | Search by resource ID |
| `_source` | query | `string` |  | Search by source system |
| `_text` | query | `string` |  | Full text search across the resource |
| `_content` | query | `string` |  | Search in the narrative content |
| `_list` | query | `string` |  | Search by list membership |
| `_has` | query | `string` |  | Reverse chaining |
| `_type` | query | `string` |  | Resource type |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |
| `_include` | query | `string` |  | Include related resources |
| `_revinclude` | query | `string` |  | Reverse include |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "diagnostic_reports": [],
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/diagnostic-reports

**Create DiagnosticReport**

Creates a new FHIR DiagnosticReport resource using the HAPI FHIR SDK DiagnosticReport model

_Tags: `Clinical`_

**Request Body:**
FHIR DiagnosticReport resource
_Required._

_Content-Type: `application/json`_
```json
{
  "basedOn": [],
  "category": [],
  "conclusion": "string",
  "conclusionCode": [],
  "contained": [
    [
      0
    ]
  ],
  "effectiveDateTime": "string",
  "extension": [],
  "id": "string",
  "identifier": [],
  "imagingStudy": [],
  "implicitRules": "string",
  "issued": "string",
  "language": "string",
  "media": [
    {
      "comment": "string",
      "extension": [],
      "id": "string",
      "modifierExtension": []
    }
  ],
  "modifierExtension": [],
  "performer": [],
  "presentedForm": [],
  "result": [],
  "resultsInterpreter": [],
  "specimen": [],
  "status": 0
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/diagnostic-reports/{id}

**Get DiagnosticReport**

Retrieves a FHIR DiagnosticReport resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | DiagnosticReport ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/diagnostic-reports/{id}

**Update DiagnosticReport**

Updates an existing FHIR DiagnosticReport resource in the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | DiagnosticReport ID |

**Request Body:**
Updated FHIR DiagnosticReport resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/diagnostic-reports/{id}

**Delete DiagnosticReport**

Deletes a FHIR DiagnosticReport resource from the HAPI FHIR server by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | DiagnosticReport ID |

**Responses:**
**Response `204`** — DiagnosticReport deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/encounters

**Search Encounters**

Searches for FHIR Encounter resources using the HAPI FHIR SDK Encounter model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `status` | query | `string` |  | Encounter status |
| `class` | query | `string` |  | Encounter class |
| `type` | query | `string` |  | Encounter type |
| `date` | query | `string` |  | Encounter date |
| `identifier` | query | `string` |  | Encounter identifier |
| `limit` | query | `integer` |  | Number of results per page |
| `offset` | query | `integer` |  | Number of results to skip |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "encounters": [],
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/encounters

**Create Encounter**

Creates a new FHIR Encounter resource using the HAPI FHIR SDK Encounter model

_Tags: `Clinical`_

**Request Body:**
FHIR Encounter resource
_Required._

_Content-Type: `application/json`_
```json
{
  "account": [],
  "appointment": [],
  "basedOn": [],
  "classHistory": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": []
    }
  ],
  "contained": [
    [
      0
    ]
  ],
  "diagnosis": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "rank": 0
    }
  ],
  "episodeOfCare": [],
  "extension": [],
  "hospitalization": {
    "dietPreference": [],
    "extension": [],
    "id": "string",
    "modifierExtension": [],
    "specialArrangement": [],
    "specialCourtesy": []
  },
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "language": "string",
  "location": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "status": 0
    }
  ],
  "modifierExtension": [],
  "participant": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "type": []
    }
  ],
  "reasonCode": [],
  "reasonReference": [],
  "status": 0,
  "statusHistory": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": []
    }
  ],
  "type": []
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/encounters/{id}

**Get Encounter**

Retrieves a FHIR Encounter resource by ID using the HAPI FHIR SDK Encounter model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Encounter ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/encounters/{id}

**Update Encounter**

Updates a FHIR Encounter resource by ID using the HAPI FHIR SDK Encounter model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Encounter ID |

**Request Body:**
FHIR Encounter resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/encounters/{id}

**Delete Encounter**

Deletes a FHIR Encounter resource by ID using the HAPI FHIR SDK Encounter model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Encounter ID |

**Responses:**
**Response `204`** — No Content

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/episodes-of-care

**Search Episodes of Care**

Searches for FHIR EpisodeOfCare resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `status` | query | `string` |  | Episode of care status |
| `organization` | query | `string` |  | Managing organization reference |
| `date` | query | `string` |  | Episode of care date |
| `identifier` | query | `string` |  | Episode of care identifier |
| `_id` | query | `string` |  | Search by resource ID |
| `_source` | query | `string` |  | Search by source system |
| `_text` | query | `string` |  | Full text search across the resource |
| `_content` | query | `string` |  | Search in the narrative content |
| `_list` | query | `string` |  | Search by list membership |
| `_has` | query | `string` |  | Reverse chaining |
| `_type` | query | `string` |  | Resource type |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |
| `_include` | query | `string` |  | Include related resources |
| `_revinclude` | query | `string` |  | Reverse include |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "episodes_of_care": [],
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/episodes-of-care

**Create Episode of Care**

Creates a new FHIR EpisodeOfCare resource using the HAPI FHIR SDK EpisodeOfCare model

_Tags: `Clinical`_

**Request Body:**
FHIR EpisodeOfCare resource
_Required._

_Content-Type: `application/json`_
```json
{
  "account": [],
  "contained": [
    [
      0
    ]
  ],
  "diagnosis": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "rank": 0
    }
  ],
  "extension": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "language": "string",
  "modifierExtension": [],
  "referralRequest": [],
  "status": 0,
  "statusHistory": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": []
    }
  ],
  "team": [],
  "type": []
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/episodes-of-care/{id}

**Get Episode of Care**

Retrieves a FHIR EpisodeOfCare resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Episode of Care ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/episodes-of-care/{id}

**Update Episode of Care**

Updates an existing FHIR EpisodeOfCare resource in the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Episode of Care ID |

**Request Body:**
Updated FHIR EpisodeOfCare resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/episodes-of-care/{id}

**Delete Episode of Care**

Deletes a FHIR EpisodeOfCare resource from the HAPI FHIR server by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Episode of Care ID |

**Responses:**
**Response `204`** — Episode of Care deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/icd11/codes

**Search ICD-11 Codes**

Searches for ICD-11 codes using FHIR ValueSet expansion.
This is a convenience endpoint that uses the ICD11Codes ValueSet.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | `string` |  *(required)* | Search query |
| `limit` | query | `integer` |  | Maximum results (default: 10, max: 50) |
| `offset` | query | `integer` |  | Pagination offset (default: 0) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
[]
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/medications

**Search Medications**

Searches for FHIR Medication resources based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `code` | query | `string` |  | Medication code |
| `identifier` | query | `string` |  | Medication identifier |
| `status` | query | `string` |  | Medication status |
| `manufacturer` | query | `string` |  | Medication manufacturer |
| `form` | query | `string` |  | Medication form |
| `ingredient` | query | `string` |  | Medication ingredient |
| `limit` | query | `integer` |  | Maximum number of results |
| `offset` | query | `integer` |  | Number of results to skip |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "medications": [],
  "next_page_url": "string",
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/medications

**Create Medication**

Creates a new FHIR Medication resource using the HAPI FHIR SDK Medication model

_Tags: `Clinical`_

**Request Body:**
FHIR Medication resource
_Required._

_Content-Type: `application/json`_
```json
{
  "batch": {
    "expirationDate": "string",
    "extension": [],
    "id": "string",
    "lotNumber": "string",
    "modifierExtension": []
  },
  "contained": [
    [
      0
    ]
  ],
  "extension": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "ingredient": [
    {
      "extension": [],
      "id": "string",
      "isActive": false,
      "modifierExtension": []
    }
  ],
  "language": "string",
  "modifierExtension": [],
  "status": "string"
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/medications/{id}

**Get Medication**

Retrieves a FHIR Medication resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Medication ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/medications/{id}

**Update Medication**

Updates an existing FHIR Medication resource using the HAPI FHIR SDK Medication model

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Medication ID |

**Request Body:**
FHIR Medication resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/medications/{id}

**Delete Medication**

Deletes a FHIR Medication resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Medication ID |

**Responses:**
**Response `204`** — Medication deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/observations

**Search Observations**

Searches for FHIR Observation resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `category` | query | `string` |  | Observation category |
| `code` | query | `string` |  | Observation code |
| `date` | query | `string` |  | Observation date |
| `status` | query | `string` |  | Observation status |
| `value-quantity` | query | `string` |  | Observation value quantity |
| `_id` | query | `string` |  | Search by resource ID |
| `_source` | query | `string` |  | Search by source system |
| `_text` | query | `string` |  | Full text search across the resource |
| `_content` | query | `string` |  | Search in the narrative content |
| `_list` | query | `string` |  | Search by list membership |
| `_has` | query | `string` |  | Reverse chaining |
| `_type` | query | `string` |  | Resource type |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |
| `_include` | query | `string` |  | Include related resources |
| `_revinclude` | query | `string` |  | Reverse include |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "observations": [],
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/observations

**Create Observation**

Creates a new FHIR Observation resource using the HAPI FHIR SDK Observation model

_Tags: `Clinical`_

**Request Body:**
FHIR Observation resource
_Required._

_Content-Type: `application/json`_
```json
{
  "basedOn": [],
  "category": [],
  "component": [
    {
      "extension": [],
      "id": "string",
      "interpretation": [],
      "modifierExtension": [],
      "referenceRange": [
        {
          "appliesTo": [],
          "extension": [],
          "id": "string",
          "modifierExtension": [],
          "text": "string"
        }
      ],
      "valueBoolean": false,
      "valueDateTime": "string",
      "valueInteger": 0,
      "valueString": "string",
      "valueTime": "string"
    }
  ],
  "contained": [
    [
      0
    ]
  ],
  "derivedFrom": [],
  "effectiveDateTime": "string",
  "effectiveInstant": "string",
  "extension": [],
  "focus": [],
  "hasMember": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "interpretation": [],
  "issued": "string",
  "language": "string",
  "modifierExtension": [],
  "note": [],
  "partOf": [],
  "performer": [],
  "referenceRange": [],
  "status": 0,
  "valueBoolean": false,
  "valueDateTime": "string",
  "valueInteger": 0,
  "valueString": "string",
  "valueTime": "string"
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/observations/{id}

**Get Observation**

Retrieves a FHIR Observation resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Observation ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/observations/{id}

**Update Observation**

Updates an existing FHIR Observation resource in the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Observation ID |

**Request Body:**
Updated FHIR Observation resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/observations/{id}

**Delete Observation**

Deletes a FHIR Observation resource from the HAPI FHIR server by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Observation ID |

**Responses:**
**Response `204`** — Observation deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PATCH /clinical/observations/{id}

**Patch Observation**

Partially updates a FHIR Observation resource using FHIR Parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Observation ID |

**Request Body:**
FHIR Parameters for patch operation
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/organizations

**Search Organizations**

Searches for FHIR Organization resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `name` | query | `string` |  | Organization name |
| `active` | query | `boolean` |  | Organization active status |
| `identifier` | query | `string` |  | Organization identifier |
| `type` | query | `string` |  | Organization type |
| `partof` | query | `string` |  | Parent organization reference |
| `endpoint` | query | `string` |  | Technical endpoints |
| `address` | query | `string` |  | General address search |
| `address-city` | query | `string` |  | City in address |
| `address-country` | query | `string` |  | Country in address |
| `address-postalcode` | query | `string` |  | Postal code in address |
| `address-state` | query | `string` |  | State in address |
| `address-use` | query | `string` |  | Address use type |
| `_id` | query | `string` |  | Search by resource ID |
| `_source` | query | `string` |  | Search by source system |
| `_text` | query | `string` |  | Full text search across the resource |
| `_content` | query | `string` |  | Search in the narrative content |
| `_list` | query | `string` |  | Search by list membership |
| `_has` | query | `string` |  | Reverse chaining |
| `_type` | query | `string` |  | Resource type |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |
| `_include` | query | `string` |  | Include related resources |
| `_revinclude` | query | `string` |  | Reverse include |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "organizations": [],
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/organizations

**Create Organization**

Creates a new FHIR Organization resource using the HAPI FHIR SDK Organization model

_Tags: `Clinical`_

**Request Body:**
FHIR Organization resource
_Required._

_Content-Type: `application/json`_
```json
{
  "active": false,
  "address": [],
  "alias": [
    "string"
  ],
  "contact": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "telecom": []
    }
  ],
  "contained": [
    [
      0
    ]
  ],
  "endpoint": [],
  "extension": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "language": "string",
  "modifierExtension": [],
  "name": "string",
  "telecom": [],
  "type": []
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/organizations/{id}

**Get Organization**

Retrieves a FHIR Organization resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Organization ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/organizations/{id}

**Update Organization**

Updates an existing FHIR Organization resource in the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Organization ID |

**Request Body:**
Updated FHIR Organization resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/organizations/{id}

**Delete Organization**

Deletes a FHIR Organization resource from the HAPI FHIR server by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Organization ID |

**Responses:**
**Response `204`** — Organization deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/patients

**Search Patients**

Searches for FHIR Patient resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `name` | query | `string` |  | Patient name |
| `identifier` | query | `string` |  | Patient identifier |
| `birthdate` | query | `string` |  | Patient birth date |
| `gender` | query | `string` |  | Patient gender |
| `phone` | query | `string` |  | Patient phone number |
| `email` | query | `string` |  | Patient email |
| `address` | query | `string` |  | Patient address |
| `city` | query | `string` |  | Patient city |
| `state` | query | `string` |  | Patient state |
| `country` | query | `string` |  | Patient country |
| `postalcode` | query | `string` |  | Patient postal code |
| `_id` | query | `string` |  | Search by resource ID |
| `_source` | query | `string` |  | Search by source system |
| `_text` | query | `string` |  | Full text search across the resource |
| `_content` | query | `string` |  | Search in the narrative content |
| `_list` | query | `string` |  | Search by list membership |
| `_has` | query | `string` |  | Reverse chaining |
| `_type` | query | `string` |  | Resource type |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |
| `_include` | query | `string` |  | Include related resources |
| `_revinclude` | query | `string` |  | Reverse include |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "patients": [],
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/patients

**Create Patient**

Creates a new FHIR Patient resource using the HAPI FHIR SDK Patient model

_Tags: `Clinical`_

**Request Body:**
FHIR Patient resource
_Required._

_Content-Type: `application/json`_
```json
{
  "active": false,
  "address": [],
  "birthDate": "string",
  "communication": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "preferred": false
    }
  ],
  "contact": [
    {
      "extension": [],
      "gender": 0,
      "id": "string",
      "modifierExtension": [],
      "relationship": [],
      "telecom": []
    }
  ],
  "contained": [
    [
      0
    ]
  ],
  "deceasedBoolean": false,
  "deceasedDateTime": "string",
  "extension": [],
  "generalPractitioner": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "language": "string",
  "link": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": [],
      "type": 0
    }
  ],
  "modifierExtension": [],
  "multipleBirthBoolean": false,
  "multipleBirthInteger": 0,
  "name": [],
  "photo": [],
  "telecom": []
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/patients/{id}

**Get Patient**

Retrieves a FHIR Patient resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Patient ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/patients/{id}

**Update Patient**

Updates an existing FHIR Patient resource in the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Patient ID |

**Request Body:**
Updated FHIR Patient resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/patients/{id}

**Delete Patient**

Deletes a FHIR Patient resource from the HAPI FHIR server by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Patient ID |

**Responses:**
**Response `204`** — Patient deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/patients/{patientId}/flowsheet

**Get Patient Vital Signs Flowsheet**

Retrieves vital signs observations for a patient and transforms them into a grid-ready
format optimized for flowsheet UI rendering. Supports both Acute/ICU view (encounter-scoped)
and Longitudinal view (all vital signs regardless of encounter).

_Tags: `Clinical`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patientId` | path | `string` |  *(required)* | FHIR Patient ID |
| `cursor` | query | `string` |  | ISO timestamp for cursor-based pagination |
| `encounterId` | query | `string` |  | Filter to specific encounter (Acute/ICU view) |
| `grouping` | query | `string` |  | Time bucket interval |
| `sortOrder` | query | `string` |  | Column ordering |
| `limit` | query | `integer` |  | Maximum observations to fetch (max 500) |

**Responses:**
**Response `200`** — Flowsheet data retrieved successfully
_Content-Type: `application/json`_
```json
{
  "columns": [
    {
      "headerLabel": "string",
      "id": "string",
      "timestamp": "string"
    }
  ],
  "nextCursor": "string",
  "prevCursor": "string",
  "rows": [
    {
      "rowCode": "string",
      "rowLabel": "string",
      "unit": "string"
    }
  ]
}
```

**Response `400`** — Bad Request - Invalid parameters
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/practitioners

**Search Practitioners**

Searches for FHIR Practitioner resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `name` | query | `string` |  | Practitioner name |
| `identifier` | query | `string` |  | Practitioner identifier |
| `family` | query | `string` |  | Practitioner family name |
| `given` | query | `string` |  | Practitioner given name |
| `phone` | query | `string` |  | Practitioner phone number |
| `email` | query | `string` |  | Practitioner email |
| `address` | query | `string` |  | Practitioner address |
| `city` | query | `string` |  | Practitioner city |
| `state` | query | `string` |  | Practitioner state |
| `country` | query | `string` |  | Practitioner country |
| `postalcode` | query | `string` |  | Practitioner postal code |
| `active` | query | `boolean` |  | Practitioner active status |
| `_id` | query | `string` |  | Search by resource ID |
| `_source` | query | `string` |  | Search by source system |
| `_text` | query | `string` |  | Full text search across the resource |
| `_content` | query | `string` |  | Search in the narrative content |
| `_list` | query | `string` |  | Search by list membership |
| `_has` | query | `string` |  | Reverse chaining |
| `_type` | query | `string` |  | Resource type |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |
| `_include` | query | `string` |  | Include related resources |
| `_revinclude` | query | `string` |  | Reverse include |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "practitioners": [],
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/practitioners

**Create Practitioner**

Creates a new FHIR Practitioner resource using the HAPI FHIR SDK Practitioner model

_Tags: `Clinical`_

**Request Body:**
FHIR Practitioner resource
_Required._

_Content-Type: `application/json`_
```json
{
  "active": false,
  "address": [],
  "birthDate": "string",
  "communication": [],
  "contained": [
    [
      0
    ]
  ],
  "extension": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "language": "string",
  "modifierExtension": [],
  "name": [],
  "photo": [],
  "qualification": [
    {
      "extension": [],
      "id": "string",
      "identifier": [],
      "modifierExtension": []
    }
  ],
  "telecom": []
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/practitioners/{id}

**Get Practitioner**

Retrieves a FHIR Practitioner resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Practitioner ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/practitioners/{id}

**Update Practitioner**

Updates an existing FHIR Practitioner resource in the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Practitioner ID |

**Request Body:**
Updated FHIR Practitioner resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/practitioners/{id}

**Delete Practitioner**

Deletes a FHIR Practitioner resource from the HAPI FHIR server by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Practitioner ID |

**Responses:**
**Response `204`** — Practitioner deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/procedures

**Search Procedures**

Searches for FHIR Procedure resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `status` | query | `string` |  | Procedure status |
| `code` | query | `string` |  | Procedure code |
| `date` | query | `string` |  | Procedure date |
| `encounter` | query | `string` |  | Encounter reference |
| `identifier` | query | `string` |  | Procedure identifier |
| `_id` | query | `string` |  | Search by resource ID |
| `_source` | query | `string` |  | Search by source system |
| `_text` | query | `string` |  | Full text search across the resource |
| `_content` | query | `string` |  | Search in the narrative content |
| `_list` | query | `string` |  | Search by list membership |
| `_has` | query | `string` |  | Reverse chaining |
| `_type` | query | `string` |  | Resource type |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |
| `_include` | query | `string` |  | Include related resources |
| `_revinclude` | query | `string` |  | Reverse include |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "procedures": [],
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/procedures

**Create Procedure**

Creates a new FHIR Procedure resource using the HAPI FHIR SDK Procedure model

_Tags: `Clinical`_

**Request Body:**
FHIR Procedure resource
_Required._

_Content-Type: `application/json`_
```json
{
  "basedOn": [],
  "bodySite": [],
  "complication": [],
  "complicationDetail": [],
  "contained": [
    [
      0
    ]
  ],
  "extension": [],
  "focalDevice": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": []
    }
  ],
  "followUp": [],
  "id": "string",
  "identifier": [],
  "implicitRules": "string",
  "instantiatesCanonical": [
    "string"
  ],
  "instantiatesUri": [
    "string"
  ],
  "language": "string",
  "modifierExtension": [],
  "note": [],
  "partOf": [],
  "performedDateTime": "string",
  "performedString": "string",
  "performer": [
    {
      "extension": [],
      "id": "string",
      "modifierExtension": []
    }
  ],
  "reasonCode": [],
  "reasonReference": [],
  "report": [],
  "status": 0,
  "usedCode": [],
  "usedReference": []
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/procedures/{id}

**Get Procedure**

Retrieves a FHIR Procedure resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Procedure ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/procedures/{id}

**Update Procedure**

Updates an existing FHIR Procedure resource in the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Procedure ID |

**Request Body:**
Updated FHIR Procedure resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/procedures/{id}

**Delete Procedure**

Deletes a FHIR Procedure resource from the HAPI FHIR server by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Procedure ID |

**Responses:**
**Response `204`** — Procedure deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/questionnaire

**Search Questionnaire**

Searches for FHIR Questionnaire resources in the HAPI FHIR server based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `name` | query | `string` |  | Questionnaire name |
| `title` | query | `string` |  | Questionnaire title |
| `_id` | query | `string` |  | Search by resource ID |
| `_source` | query | `string` |  | Search by source system |
| `_text` | query | `string` |  | Full text search across the resource |
| `_content` | query | `string` |  | Search in the narrative content |
| `_list` | query | `string` |  | Search by list membership |
| `_has` | query | `string` |  | Reverse chaining |
| `_type` | query | `string` |  | Resource type |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |
| `_include` | query | `string` |  | Include related resources |
| `_revinclude` | query | `string` |  | Reverse include |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "questionnaire": [],
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/questionnaire-response

**Create QuestionnaireResponse**

Creates a new FHIR QuestionnaireResponse resource using the HAPI FHIR SDK QuestionnaireResponse model

_Tags: `Clinical`_

**Request Body:**
FHIRQuestionnaireResponsePayload resource
_Required._

_Content-Type: `application/json`_
```json
{
  "questionnaire_id": "string"
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/valueset/codes

**Search ValueSet Codes**

Searches for codes within a ValueSet by expanding it with a filter.
Returns a simplified list of codes, not the full ValueSet resource.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | query | `string` |  *(required)* | ValueSet ID to expand (e.g., ICD11Codes) |
| `filter` | query | `string` |  | Filter/search term within the ValueSet |
| `count` | query | `integer` |  | Maximum results (default: 100) |
| `offset` | query | `integer` |  | Pagination offset (default: 0) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
[]
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/valueset/expand

**Expand ValueSet**

Expands a FHIR ValueSet by ID or URL, returning all concepts in the ValueSet.
This wraps the FHIR $expand operation. Provide either 'id' or 'url' query parameter.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | query | `string` |  | ValueSet ID (if expanding by ID, e.g., kenya-patient-identifiers) |
| `url` | query | `string` |  | ValueSet URL (HL7 or internal API endpoint) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/valueset/search

**Search ValueSets**

Searches for FHIR ValueSets by name or ID using autocomplete-style search.
Searches both local FHIR server and public HL7 terminology.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | `string` |  *(required)* | Search query (name or ID, min 2 characters) |
| `limit` | query | `integer` |  | Maximum results (default: 10, max: 50) |
| `offset` | query | `integer` |  | Pagination offset (default: 0) |
| `source` | query | `string` |  | Filter by source: local, hl7, all (default: all) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "has_more": false,
  "limit": 0,
  "offset": 0,
  "results": [
    {
      "description": "string",
      "id": "string",
      "name": "string",
      "source": "string",
      "status": "string",
      "title": "string",
      "url": "string"
    }
  ],
  "total": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/valueset/{id}

**Get ValueSet**

Retrieves a FHIR ValueSet resource by its ID from the HAPI FHIR server

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | ValueSet ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/encounters/{id}/$everything

**Get Encounter Everything**

Retrieves an Encounter and all its associated resources (Conditions, Observations, Procedures, etc.)

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Encounter ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "allergies": [],
  "compositions": [],
  "conditions": [],
  "diagnostics": [],
  "medications": [],
  "observations": [],
  "procedures": [],
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/fhir/bundle

**Submit FHIR Bundle**

Submits a caller-constructed FHIR transaction bundle to the FHIR server atomically.
The caller is responsible for building the complete bundle including urn:uuid:
reference linkage. The server guarantees atomicity (all-or-nothing) and resolves
all urn:uuid: cross-references before persisting. Returns the raw transaction-response
bundle. Resource IDs are extracted from entry[i].response.location by position.

_Tags: `Clinical`_

**Request Body:**
Pre-built FHIR transaction Bundle
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — Raw FHIR transaction-response Bundle
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/icd11/search

**Search ICD-11 Codes**

Searches for ICD-11 codes using FHIR ValueSet expansion.
This is a convenience endpoint that uses the ICD11Codes ValueSet.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | `string` |  *(required)* | Search query |
| `limit` | query | `integer` |  | Maximum results (default: 10, max: 50) |
| `offset` | query | `integer` |  | Pagination offset (default: 0) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
[]
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/lab/expand-panel

**Expand a lab order code into result entry stubs**

Resolves a lab order code (LOINC panel, single test, or custom) into an array of
parameter definitions with reference ranges for a specific patient. Uses a fallback
chain: FHIR Questionnaire → OCL panel mappings → OCL single concept → passthrough.

_Tags: `Clinical`_

**Request Body:**
Order code and patient context
_Required._

_Content-Type: `application/json`_
```json
{
  "order_code": {
    "coding": [
      {
        "code": "string",
        "display": "string",
        "system": "string"
      }
    ],
    "text": "string"
  },
  "patient": {
    "date_of_birth": "string",
    "gender": "string",
    "id": "string"
  }
}
```

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "parameters": [
    {
      "answer_list": [],
      "critical_range_high": 0.0,
      "critical_range_low": 0.0,
      "help_text": "string",
      "ref_range_high": 0.0,
      "ref_range_low": 0.0,
      "ref_range_text": "string",
      "ref_range_unit": "string",
      "scale_type": "QN",
      "section": "string",
      "sort_order": 0,
      "unit": "string"
    }
  ],
  "source_code": "string",
  "strategy": "fhir_questionnaire"
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/loinc/search

**Search LOINC Codes**

Searches for LOINC codes from the LOINC source in OCL.
Returns codes suitable for use in FHIR Observation resources.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | `string` |  | Search query (optional - returns all if empty) |
| `limit` | query | `integer` |  | Maximum results (default: 25, max: 100) |
| `offset` | query | `integer` |  | Pagination offset (default: 0) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
[]
```

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/medication-dispenses

**Create MedicationDispense**

Creates a new FHIR MedicationDispense resource

_Tags: `Clinical`_

**Request Body:**
FHIR MedicationDispense resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/medication-request

**Search MedicationRequest**

Searches for FHIR MedicationRequest resources based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `code` | query | `string` |  | MedicationRequest code |
| `identifier` | query | `string` |  | MedicationRequest identifier |
| `status` | query | `string` |  | MedicationRequest status |
| `manufacturer` | query | `string` |  | MedicationRequest manufacturer |
| `form` | query | `string` |  | MedicationRequest form |
| `ingredient` | query | `string` |  | MedicationRequest ingredient |
| `limit` | query | `integer` |  | Maximum number of results |
| `offset` | query | `integer` |  | Number of results to skip |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PATCH /clinical/medication-request/{id}

**Patch MedicationRequest**

Patches a FHIR MedicationRequest resource using FHIR Parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | MedicationRequest ID |

**Request Body:**
FHIR Parameters
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/ocl/orgs/{org}/collections/{collection}/concepts/search

**Search Collection Concepts**

Searches for concepts within any OCL collection. Use this to fetch codes from any org/collection.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `org` | path | `string` |  *(required)* | OCL organization ID |
| `collection` | path | `string` |  *(required)* | OCL collection ID |
| `q` | query | `string` |  | Search query (optional - returns all if empty). Maps to OCL 'q' param. |
| `limit` | query | `integer` |  | Maximum results (default: 25, max: 100). Maps to OCL 'limit'. |
| `offset` | query | `integer` |  | Pagination offset (default: 0). Maps to OCL 'offset'. |
| `system` | query | `string` |  | Canonical URL for the code system (optional, for FHIR CodeableConcept). |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
[]
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/ocl/orgs/{org}/sources/{source}/concepts

**Search Source Concepts**

Searches for concepts within any OCL source.

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `org` | path | `string` |  *(required)* | OCL organization ID |
| `source` | path | `string` |  *(required)* | OCL source ID |
| `q` | query | `string` |  | Search query (optional - returns all if empty). |
| `page` | query | `integer` |  | Page number (default: 1). |
| `limit` | query | `integer` |  | Maximum results (default: 25, max: 100). |
| `system` | query | `string` |  | Canonical URL for the code system (optional). |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
[]
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/questionnaire-response/bulk

**Bulk Create QuestionnaireResponse**

Creates a many FHIR QuestionnaireResponse resource at a go using the HAPI FHIR SDK QuestionnaireResponse model

_Tags: `Clinical`_

**Request Body:**
BulkFHIRQuestionnaireResponsePayload resource
_Required._

_Content-Type: `application/json`_
```json
{
  "questionnaire_responses": []
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/service-requests

**Search ServiceRequests**

Searches for FHIR ServiceRequest resources based on query parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `encounter` | query | `string` |  | Encounter reference |
| `status` | query | `string` |  | Request status |
| `category` | query | `string` |  | Category of request |
| `code` | query | `string` |  | Order code |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "service_requests": [],
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/service-requests

**Create ServiceRequest**

Creates a new FHIR ServiceRequest resource

_Tags: `Clinical`_

**Request Body:**
FHIR ServiceRequest resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/service-requests/{id}

**Get ServiceRequest**

Retrieves a FHIR ServiceRequest resource by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | ServiceRequest ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/service-requests/{id}

**Update ServiceRequest**

Updates an existing FHIR ServiceRequest resource

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | ServiceRequest ID |

**Request Body:**
Updated FHIR ServiceRequest resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### DELETE /clinical/service-requests/{id}

**Delete ServiceRequest**

Deletes a FHIR ServiceRequest resource by its ID

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | ServiceRequest ID |

**Responses:**
**Response `204`** — ServiceRequest deleted successfully

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PATCH /clinical/service-requests/{id}

**Patch ServiceRequest**

Patches a FHIR ServiceRequest resource using FHIR Parameters

_Tags: `Clinical`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | ServiceRequest ID |

**Request Body:**

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

## Clinical - Documents

### GET /clinical/document-bundles/{id}

**Get Document Bundle**

Retrieves a sealed FHIR Document Bundle by its ID

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Bundle ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/document-bundles/{id}/pdf

**Generate Document Bundle PDF**

Generates a PDF from the clinical document. Always returns PDF bytes directly.
If object storage is configured, the PDF is also persisted and the file ID
is returned in the X-File-ID response header.

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Bundle ID |

**Responses:**
**Response `200`** — PDF document
_Content-Type: `application/pdf`_
```json
"string"
```

**Response `400`** — Bad Request
_Content-Type: `application/pdf`_

**Response `500`** — Internal Server Error
_Content-Type: `application/pdf`_

### GET /clinical/document-bundles/{id}/render

**Get Document Bundle Data**

Returns a structured JSON representation of the clinical document.
Contains no HTML — section content is decomposed into label/value items
so the frontend can render using its own design system.

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Bundle ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "author": {
    "designation": "string",
    "name": "string"
  },
  "date": "string",
  "encounter": {
    "class": "string",
    "id": "string",
    "period": "string",
    "status": "string"
  },
  "facility": {
    "branch": "string",
    "organisation": "string"
  },
  "patient": {
    "dob": "string",
    "gender": "string",
    "id": "string",
    "name": "string",
    "phone": "string"
  },
  "sections": [
    {
      "items": [
        {
          "items": [],
          "label": "string",
          "value": [
            "string"
          ]
        }
      ],
      "title": "string"
    }
  ],
  "status": "string",
  "title": "string"
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/document-references

**Search DocumentReferences**

Searches for FHIR DocumentReference resources based on query parameters

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient` | query | `string` |  | Patient reference |
| `type` | query | `string` |  | Document type (LOINC code) |
| `encounter` | query | `string` |  | Encounter reference |
| `status` | query | `string` |  | Document status |
| `date` | query | `string` |  | Document date |
| `_count` | query | `integer` |  | Number of results to return |
| `_sort` | query | `string` |  | Sort order |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "bundle_id": "string",
  "document_references": [],
  "has_next_page": false,
  "has_previous_page": false,
  "next_page_url": "string",
  "previous_page_url": "string",
  "total_count": 0
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/document-references/{id}

**Get DocumentReference**

Retrieves a FHIR DocumentReference resource by its ID

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | DocumentReference ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/html-to-pdf

**Convert HTML to PDF**

Accepts an HTML document body, converts it to PDF via Gotenberg,
stores it in object storage, and returns presigned URLs for preview and download.

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Filename` | header | `string` |  | Desired PDF filename (default: document.pdf) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "download_url": "string",
  "expires_in_seconds": 0,
  "file_id": "string",
  "preview_url": "string"
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### GET /clinical/questionnaire/{id}

**Get Questionnaire**

Retrieves a FHIR Questionnaire resource by its ID from the HAPI FHIR server

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | Questionnaire ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/questionnaire-response/submit

**Submit QuestionnaireResponse (Document Workflow)**

Creates a QuestionnaireResponse without running SDC $extract. Used by the document workflow
where the QR will later be finalized into a Document Bundle.

_Tags: `Clinical - Documents`_

**Request Body:**
FHIRQuestionnaireResponsePayload resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### PUT /clinical/questionnaire-response/{id}

**Update QuestionnaireResponse**

Updates an existing FHIR QuestionnaireResponse resource (auto-save drafts)

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | QuestionnaireResponse ID |

**Request Body:**
Updated FHIR QuestionnaireResponse resource
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/questionnaire-response/{id}/finalize

**Finalize QuestionnaireResponse**

Signs and seals a QuestionnaireResponse, transforming it into an immutable Document Bundle

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | QuestionnaireResponse ID |

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `409`** — Conflict
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

### POST /clinical/questionnaire-response/{id}/preview

**Preview QuestionnaireResponse**

Generates a preview of the Composition that would be created from the QuestionnaireResponse

_Tags: `Clinical - Documents`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `string` |  *(required)* | QuestionnaireResponse ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_

**Response `400`** — Bad Request
_Content-Type: `application/json`_

**Response `404`** — Not Found
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_
