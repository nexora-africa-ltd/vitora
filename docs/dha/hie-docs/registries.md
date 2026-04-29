# HIE Registries

_Version: `1.0.0`_
API for accessing various registries in the Health Information Exchange (HIE) system.

**Servers:**
- `https://ilm-dev.dha.go.ke/uat-middleware`

## Table of Contents

- [Facility Registry](#facility-registry)
- [Client Registry](#client-registry)
- [Health Worker Registry](#health-worker-registry)

## Facility Registry

Endpoints for accessing facility registry

### GET /api/v1/facilities/search

**Get facility's record**

Retrieves a facility's record from facility registry

_Tags: `Facility Registry`_
_Operation ID: `FacilitySearch`_

_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `identifier` | query | `string` |  *(required)* | The unique identifier value for the facility |
| `identifier-type` | query | `string` |  *(required)* | The type of identifier being used to search for the facility |
| `name` | query | `string` |  | Facility's name |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "SHAOperationStatus": {
    "earliestReinstatementDate": "string",
    "operationalStatus": "string",
    "operationalStatusReason": "string",
    "reinstatementDate": "string",
    "reinstatementRecommendations": "string",
    "suspensionDate": "string",
    "suspensionReason": "string"
  },
  "address": {
    "constituency": "string",
    "country": "string",
    "county": "string",
    "countyCode": "string",
    "latitude": "string",
    "longitude": "string",
    "physicalLocation": "string",
    "postalAddress": "string",
    "subCounty": "string",
    "subCountyCode": "string",
    "town": "string",
    "ward": "string"
  },
  "bedOccupancy": {
    "dialysisBeds": 0,
    "hduBeds": 0,
    "icuBeds": 0,
    "normalBeds": 0,
    "numberOfCots": 0,
    "totalBeds": 0
  },
  "facilityAdministratorEmail": "string",
  "facilityAdministratorIdentifier": "string",
  "facilityAdministratorName": "string",
  "facilityAdministratorPhone": "string",
  "facilityEmail": "string",
  "facilityLicenseEndDate": "string",
  "facilityLicenseStartDate": "string",
  "facilityLicenseStatus": "string",
  "facilityOwnership": "string",
  "facilityPhoneNumber": "string",
  "facilityType": "string",
  "fidCode": "string",
  "frCode": "string",
  "isHub": false,
  "kephLevel": "string",
  "licenseNumber": "string",
  "officialName": "string",
  "pcnCode": "string",
  "registrationNumber": "string",
  "regulatoryBody": "string",
  "shaContractStatus": "string",
  "shaContractedServices": [
    "string"
  ],
  "uuid": "string"
}
```

**Response `400`** — Bad Request - Missing required query parameters
_Content-Type: `application/json`_
```json
{
  "error": "string",
  "message": "string"
}
```

**Response `401`** — Unauthorized - Invalid identity
_Content-Type: `application/json`_
```json
{
  "error": "string",
  "message": "string"
}
```

**Response `403`** — Forbidden - Not enough permissions
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Failed to retrieve practitioner record
_Content-Type: `application/json`_

## Client Registry

Endpoints for accessing client registry

### GET /api/v1/patients

**Get patient record**

Retrieves patient record from the client registry using a patient's identification number and type

_Tags: `Client Registry`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `identification_number` | query | `string` |  *(required)* | The unique number from the patient's identification document |
| `identification_type` | query | `string` |  *(required)* | The kind of identification document of the Patient |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "admission_number": "string",
  "admission_remand_number": "string",
  "agent_id": "string",
  "building_house_no": "string",
  "citizenship": "string",
  "city": "string",
  "civil_status": "string",
  "country": "string",
  "county": "string",
  "date_of_birth": "string",
  "deceased_datetime": "string",
  "dependants": [
    {
      "date_added": "string",
      "relationship": "string",
      "result": [],
      "total": 0
    }
  ],
  "disability_category": "string",
  "disability_cause": "string",
  "disability_subcategory": "string",
  "domestic_worker_type": "string",
  "employer_name": "string",
  "employer_pin": "string",
  "employment_type": "string",
  "first_name": "string",
  "gender": "string",
  "grade_level": "string",
  "gross_income": 0.0,
  "gross_income_currency": "string",
  "id": "string",
  "id_serial": "string",
  "identification_number": "string",
  "identification_residence": "string",
  "identification_type": "string",
  "is_agent": 0,
  "kra_pin": "string",
  "last_name": "string",
  "latitude": "string",
  "learning_institution_code": "string",
  "learning_institution_name": "string",
  "longitude": "string",
  "meta": {
    "creationTime": "string",
    "lastUpdated": "string",
    "source": "string",
    "versionId": "string"
  },
  "middle_name": "string",
  "originSystem": {
    "record_id": "string",
    "system": "string"
  },
  "other_identifications": [
    {
      "identification_number": "string",
      "identification_type": "National ID"
    }
  ],
  "phone": "string",
  "place_of_birth": "string",
  "postal_address": "string",
  "preferred_primary_care_network": "string",
  "province_state_country": "string",
  "resourceType": "string",
  "sub_county": "string",
  "title": "string",
  "unconfirmed_dependants": [
    {
      "agent": "string",
      "citizenship": "string",
      "county": "string",
      "date_of_birth": "string",
      "email": "string",
      "first_name": "string",
      "gender": "string",
      "id": "string",
      "identification_number": "string",
      "identification_type": "string",
      "last_name": "string",
      "learning_institution_code": "string",
      "learning_institution_name": "string",
      "middle_name": "string",
      "phone": "string",
      "related_to": "string",
      "relationship": "string",
      "sub_county": "string"
    }
  ],
  "village_estate": "string",
  "ward": "string",
  "zip_code": "string"
}
```

**Response `400`** — Bad Request - Missing query parameters or invalid request input
_Content-Type: `application/json`_

## Health Worker Registry

Endpoints for accessing health worker registry

### GET /api/v1/professionals

**Get practitioner's record**

Retrieves a practitioner's record from health worker registry

_Tags: `Health Worker Registry`_
_Operation ID: `ProfessionalSearch`_

_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `identification_number` | query | `string` |  *(required)* | The unique number from the professional's identification document |
| `identification_type` | query | `string` |  *(required)* | The kind of identification document of the healthcare professional |
| `regulator` | query | `string` |  *(required)* | Practitioner regulator. This is required to identify the correct practitioner registry to query. |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "message": {
    "contacts": {
      "email": "string",
      "phone": "string",
      "postal_address": "string"
    },
    "identifiers": {
      "client_registry_id": "string",
      "identification_number": "string",
      "identification_type": "string",
      "student_id": "string"
    },
    "licenses": [
      {
        "external_reference_id": "string",
        "id": "string",
        "license_end": "string",
        "license_start": "string",
        "license_type": "string"
      }
    ],
    "membership": {
      "external_reference_id": "string",
      "first_name": "string",
      "full_name": "string",
      "gender": "string",
      "id": "string",
      "is_active": 0,
      "last_name": "string",
      "licensing_body": "string",
      "middle_name": "string",
      "registration_id": "string",
      "specialty": "string"
    },
    "professional_details": {
      "discipline_name": "string",
      "educational_qualifications": "string",
      "practice_type": "string",
      "professional_cadre": "string",
      "specialty": "string",
      "subspecialty": "string"
    }
  }
}
```

**Response `400`** — Bad Request - Missing required query parameters
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Failed to retrieve practitioner record
_Content-Type: `application/json`_
