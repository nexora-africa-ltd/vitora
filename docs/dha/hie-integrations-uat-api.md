# HIE Integrations UAT API

Health Information Exchange Middleware API for healthcare data processing

## Table of Contents

- [Authentication](#authentication)
- [HIE Registries](#hie-registries)
- [Consent Services](#consent-services)
- [Emergency Services](#emergency-services)
- [Claims and Preauth](#claims-and-preauth)

## Authentication

### POST Get Access Token

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/tenants/token`

Obtains an access token used for subsequent API calls

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

**Body (urlencoded):**

| Key | Value | Description |
|---|---|---|
| client_id |  |  |
| client_secret |  |  |

#### Example Response: Created (201 Created)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "access_token": "string",
  "expires_in": 4632,
  "token_type": "string"
}
```

#### Example Response: Bad Request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### Example Response: Conflict (409 Conflict)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### Example Response: Internal Server Error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

## HIE Registries

### GET Healthcare Facility Search

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/facilities/search?identifier=&identifier-type=`

Retrieves a facility's record from facility registry

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

#### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

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
    "dialysisBeds": 7489,
    "hduBeds": 1057,
    "icuBeds": 8102,
    "normalBeds": 5820,
    "numberOfCots": 7598,
    "totalBeds": 7931
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
  "isHub": true,
  "kephLevel": "string",
  "licenseNumber": "string",
  "officialName": "string",
  "pcnCode": "string",
  "registrationNumber": "string",
  "regulatoryBody": "string",
  "regulatoryOperationalStatus": {
    "earliestReinstatementDate": "string",
    "operationalStatus": "string",
    "operationalStatusReason": "string",
    "reinstatementDate": "string",
    "reinstatementRecommendations": "string",
    "suspensionDate": "string",
    "suspensionReason": "string"
  },
  "shaConstractEndDate": "",
  "shaConstractStartDate": "",
  "shaContractStatus": "string",
  "shaContractedServices": [
    "string",
    "string"
  ],
  "uuid": "string"
}
```

#### Example Response: Bad Request - Missing required query parameters (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### Example Response: Internal Server Error - Failed to retrieve practitioner record (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### GET Patient Search

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients?identification_number=&identification_type=`

Retrieves patient record from the client registry using a patient's identification number and type

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

#### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

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
      "result": [
        {
          "value": "<Circular reference to #/components/schemas/internal_domain_patients.Member detected>"
        },
        {
          "value": "<Circular reference to #/components/schemas/internal_domain_patients.Member detected>"
        }
      ],
      "total": 6120
    },
    {
      "date_added": "string",
      "relationship": "string",
      "result": [
        {
          "value": "<Circular reference to #/components/schemas/internal_domain_patients.Member detected>"
        },
        {
          "value": "<Circular reference to #/components/schemas/internal_domain_patients.Member detected>"
        }
      ],
      "total": 8337
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
  "gross_income": 2121.0372405027165,
  "gross_income_currency": "string",
  "id": "string",
  "id_serial": "string",
  "identification_number": "string",
  "identification_residence": "string",
  "identification_type": "string",
  "is_agent": 5781,
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
      "identification_type": "Alien ID"
    },
    {
      "identification_number": "string",
      "identification_type": "Birth Certificate"
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
    },
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

#### Example Response: Bad Request - Missing query parameters or invalid request input (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### GET Healthcare Professionals Search

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/professionals?identification_number=&identification_type=&regulator=kmpdc`

Retrieves a practitioner's record from health worker registry

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

#### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

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
      },
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
      "is_active": 8841,
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

#### Example Response: Bad Request - Missing required query parameters (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### Example Response: Internal Server Error - Failed to retrieve practitioner record (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

## Consent Services

### OTP

#### OTP Whitelist Request

##### GET Get OTP Whitelist

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/otp-whitelists/callback?beneficiary_cr_id=&facility_fr_code=`

Get a list of OTP whitelist requests related a particular patient

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

###### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "count": 233,
  "currentPage": 1185,
  "endIndex": 2891,
  "next": "string",
  "pageSize": 4376,
  "previous": "string",
  "results": [
    {
      "beneficiaryCrId": "string",
      "beneficiaryName": "string",
      "biometricsAttempt": 2698,
      "created": "string",
      "facilityFrCode": "string",
      "facilityName": "string",
      "guid": "string",
      "reason": "string",
      "reasonType": "string",
      "reviewedByUser": "string",
      "reviewerResponseNotes": [
        {
          "responseNotes": "string"
        },
        {
          "responseNotes": "string"
        }
      ],
      "status": "string"
    },
    {
      "beneficiaryCrId": "string",
      "beneficiaryName": "string",
      "biometricsAttempt": 2910,
      "created": "string",
      "facilityFrCode": "string",
      "facilityName": "string",
      "guid": "string",
      "reason": "string",
      "reasonType": "string",
      "reviewedByUser": "string",
      "reviewerResponseNotes": [
        {
          "responseNotes": "string"
        },
        {
          "responseNotes": "string"
        }
      ],
      "status": "string"
    }
  ],
  "startIndex": 1804,
  "totalPages": 4762
}
```

###### Example Response: Bad Request - Missing query parameters or invalid request input (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### POST Create OTP Whitelist Request

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/otp-whitelists`

Create an OTP whitelist request for a patient

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| reason_type | BIOMETRIC_FAILURE | text |  |
| reason | Biometric checks failed | text |  |
| beneficiary_cr_id |  | text |  |
| attachments | [{"document_title": "Support doc", "document_type": "SUPPORT_DOCUMENT","file_field_name": "attachments_file_blob"}] | text |  |
| attachments_file_blob | /home/clifford-ouma/SIL-Tech-Work/SHA repos/Benefits-Coverage.jpg | file |  |
| biometric_attempts | 10 | text |  |
| facility_fr_code |  | text |  |

###### Example Response: OTP whitelist request created successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "attachments": [
    {
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "uploadedFile": "string"
    },
    {
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "uploadedFile": "string"
    }
  ],
  "beneficiaryCrId": "string",
  "beneficiaryName": "string",
  "facilityFrCode": "string",
  "facilityName": "string",
  "guid": "string",
  "reason": "string",
  "reasonType": "string",
  "reviewedByUser": "string",
  "reviewerResponseNotes": [
    "string",
    "string"
  ],
  "status": "string"
}
```

###### Example Response: Bad Request - Missing required fields or invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Send OTP

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/otp`

Send a one-time password to the patient's contact for visit verification.

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "intervention_codes": [
    "" // Intervention code for the service scheduled to be offered
  ],
  "patient_id": "", // Client registry identifier of the beneficiary associated with the patient
  "beneficiary_contact_id": "{{beneficiary_contact_id}}" // Optional
}
```

##### Example Response: OTP sent successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized - Invalid or missing authentication token (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Send OTP for Discharge

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/otp/discharge`

Send a one-time password to the patient's contact for visit verification during discharge.

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "", // Consent token for suthorization. This is the authorization_code received from the Create Virtual Claim endpoint.
  "patient_id": "" // Client registry identifier of the beneficiary associated with the patient
}
```

##### Example Response: OTP sent successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized - Invalid or missing authentication token (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### GET Get patients contacts

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/contacts?patient_id=`

Retrieves a list of contacts associated with a patient

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
[
  {
    "active": false,
    "contactType": "string",
    "contactValue": "string",
    "id": 6388,
    "isConfirmed": false
  },
  {
    "active": true,
    "contactType": "string",
    "contactValue": "string",
    "id": 7751,
    "isConfirmed": true
  }
]
```

##### Example Response: Bad Request - Missing query parameters or invalid request input (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### Biometrics

#### POST Create Authorization for Biometrics Visit

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/authorize`

Creates a new authorization using biometrics.

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
    // National ID of the biometrics agent registered on the hardware server
    "agent_id": "{{agent_national_id}}",

    // OS of the workstation performing the authorization
    "authorizing_device_os": "windows",

    // Facility name
    "ekyc_provider_id": "Nairobi West",

    // Biometric/auth factors
    // Enum: "SHA" (eKYC via SHA portal) | "fingerprint" (Under-18 patient flow)
    "factors": [
        "SHA"
    ],

    // SHA intervention code for the procedure you are seeking consent for
    "interventions": [
        "SHA-18-004"
    ],

    // Set true only when authorizing discharge for an inpatient claim; false for all other flows
    "is_biometrics_discharge_authorization": false,

    // Set true for emergency claims
    "is_emergency": false,

    // Set true when the request originates from an integrated HMS (vs. direct portal submission)
    "is_integration": true,

    // CR number of the patient/beneficiary, obtained from Patient Search or Eligibility Check
    "patient_id": "",

    // Facility code as registered in the Facility Registry (FR)
    "provider": "",

    // Type of visit — Enum: "OUTPATIENT" | "INPATIENT" | "EMERGENCY" | "CAPITATION"
    "service_type": "OUTPATIENT",

    // Unique workstation identifier from the hardware/biometrics server
    "work_station_id": "790bf760-08e6-4fbe-b892-7b877dd52f2b-F406692C85F3"
}
```

##### Example Response: Authorization created successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "authCode": "string",
  "authorizationReason": "string",
  "authorizationType": [
    "string",
    "string"
  ],
  "authorizingDeviceOs": "string",
  "beneficiary": 1456,
  "beneficiaryCode": "string",
  "beneficiaryJoinDate": "string",
  "beneficiaryName": "string",
  "beneficiaryNumber": "string",
  "beneficiaryScheme": "string",
  "benefitType": "string",
  "biometricMatchLogId": "string",
  "createdByName": "string",
  "created_by": "string",
  "dateAuthorized": "string",
  "ekycToken": "string",
  "endDate": "string",
  "endedVia": "string",
  "expiry": "string",
  "guardian": 7900,
  "guid": "string",
  "id": 1384,
  "isBiometricsDischargeAuthorization": true,
  "isComplete": false,
  "isElective": false,
  "isEmergency": true,
  "isOpen": true,
  "label": "string",
  "needsPreauth": true,
  "notes": "string",
  "overallPreauthFinalised": false,
  "parentAuthorization": 4747,
  "parentType": "string",
  "payerName": "string",
  "payerSladeCode": 211,
  "provider": 4612,
  "providerFid": "string",
  "providerName": "string",
  "requestedBy": "string",
  "sessionType": "string",
  "shaGuid": "string",
  "shaVerificationRequest": {
    "embedExpiry": 6637,
    "embededToken": "string",
    "requestId": "string",
    "requestUrl": "string"
  },
  "shaVerificationRequestId": "string",
  "status": "string",
  "token": "string",
  "updated_by": "string",
  "workStationId": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

## Emergency Services

### emergency

#### protocols

##### GET Get emergency case protocols

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/emergency/protocols?active=string&intervention_code=string`

Fetches emergency protocols based in the intervention code

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

###### Example Response: Emergency protocol retrieved successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "count": 2349,
  "currentPage": 7799,
  "endIndex": 1844,
  "next": "string",
  "pageSize": 6208,
  "previous": "string",
  "results": [
    {
      "applicableTariff": "string",
      "guid": "string",
      "id": 2030,
      "intervention": [
        {
          "accessPoint": "string",
          "active": true,
          "annualQuantityLimit": 1691,
          "annualQuantityLimitChoice": "string",
          "annualQuantityLimitType": "string",
          "applicableFacilityOwnership": "string",
          "applicableGender": "string",
          "benefit": 6092,
          "code": "string",
          "comment": "string",
          "complexity": "string",
          "coverageLevel": "string",
          "diagnosisBlock": [
            "string",
            "string"
          ],
          "diagnosisList": [
            "string",
            "string"
          ],
          "guid": "string",
          "id": 2612,
          "investigationTariffHasLimit": false,
          "isIntraMetro": true,
          "kephLevelTarrif": 2266.553127820048,
          "levelsApplicable": [
            "string",
            "string"
          ],
          "lowerAgeLimit": 3190,
          "managementTariffHasLimit": true,
          "name": "string",
          "needApprovalBeforeClaimSubmission": true,
          "needsDoctorAuthorization": true,
          "needsManualPreauthApproval": true,
          "needsMemberAuthorization": false,
          "needsPreauth": true,
          "overallTariff": 2118.4288188265964,
          "overallTariffHasLimit": false,
          "paymentMechanism": "string",
          "preauthFinalised": false,
          "protocolUsed": "string",
          "status": "string",
          "upperAgeLimit": 8378,
          "usageFrequencyLimit": 3355,
          "usageFrequencyType": "string"
        },
        {
          "accessPoint": "string",
          "active": false,
          "annualQuantityLimit": 9922,
          "annualQuantityLimitChoice": "string",
          "annualQuantityLimitType": "string",
          "applicableFacilityOwnership": "string",
          "applicableGender": "string",
          "benefit": 8245,
          "code": "string",
          "comment": "string",
          "complexity": "string",
          "coverageLevel": "string",
          "diagnosisBlock": [
            "string",
            "string"
          ],
          "diagnosisList": [
            "string",
            "string"
          ],
          "guid": "string",
          "id": 96,
          "investigationTariffHasLimit": true,
          "isIntraMetro": false,
          "kephLevelTarrif": 3677.5457972829863,
          "levelsApplicable": [
            "string",
            "string"
          ],
          "lowerAgeLimit": 2912,
          "managementTariffHasLimit": true,
          "name": "string",
          "needApprovalBeforeClaimSubmission": false,
          "needsDoctorAuthorization": true,
          "needsManualPreauthApproval": false,
          "needsMemberAuthorization": false,
          "needsPreauth": false,
          "overallTariff": 7183.9843765831365,
          "overallTariffHasLimit": true,
          "paymentMechanism": "string",
          "preauthFinalised": false,
          "protocolUsed": "string",
          "status": "string",
          "upperAgeLimit": 5079,
          "usageFrequencyLimit": 8815,
          "usageFrequencyType": "string"
        }
      ],
      "name": "string",
      "protocolClassificationType": "string",
      "protocolCode": "string",
      "protocolType": "string",
      "status": "string"
    },
    {
      "applicableTariff": "string",
      "guid": "string",
      "id": 269,
      "intervention": [
        {
          "accessPoint": "string",
          "active": false,
          "annualQuantityLimit": 2041,
          "annualQuantityLimitChoice": "string",
          "annualQuantityLimitType": "string",
          "applicableFacilityOwnership": "string",
          "applicableGender": "string",
          "benefit": 1944,
          "code": "string",
          "comment": "string",
          "complexity": "string",
          "coverageLevel": "string",
          "diagnosisBlock": [
            "string",
            "string"
          ],
          "diagnosisList": [
            "string",
            "string"
          ],
          "guid": "string",
          "id": 3395,
          "investigationTariffHasLimit": false,
          "isIntraMetro": false,
          "kephLevelTarrif": 3913.084599143377,
          "levelsApplicable": [
            "string",
            "string"
          ],
          "lowerAgeLimit": 2766,
          "managementTariffHasLimit": true,
          "name": "string",
          "needApprovalBeforeClaimSubmission": false,
          "needsDoctorAuthorization": false,
          "needsManualPreauthApproval": false,
          "needsMemberAuthorization": false,
          "needsPreauth": true,
          "overallTariff": 9756.257329164559,
          "overallTariffHasLimit": true,
          "paymentMechanism": "string",
          "preauthFinalised": false,
          "protocolUsed": "string",
          "status": "string",
          "upperAgeLimit": 7734,
          "usageFrequencyLimit": 1579,
          "usageFrequencyType": "string"
        },
        {
          "accessPoint": "string",
          "active": false,
          "annualQuantityLimit": 5017,
          "annualQuantityLimitChoice": "string",
          "annualQuantityLimitType": "string",
          "applicableFacilityOwnership": "string",
          "applicableGender": "string",
          "benefit": 2284,
          "code": "string",
          "comment": "string",
          "complexity": "string",
          "coverageLevel": "string",
          "diagnosisBlock": [
            "string",
            "string"
          ],
          "diagnosisList": [
            "string",
            "string"
          ],
          "guid": "string",
          "id": 1002,
          "investigationTariffHasLimit": true,
          "isIntraMetro": false,
          "kephLevelTarrif": 3010.607336129487,
          "levelsApplicable": [
            "string",
            "string"
          ],
          "lowerAgeLimit": 1343,
          "managementTariffHasLimit": false,
          "name": "string",
          "needApprovalBeforeClaimSubmission": true,
          "needsDoctorAuthorization": false,
          "needsManualPreauthApproval": true,
          "needsMemberAuthorization": false,
          "needsPreauth": false,
          "overallTariff": 8383.459543004963,
          "overallTariffHasLimit": true,
          "paymentMechanism": "string",
          "preauthFinalised": false,
          "protocolUsed": "string",
          "status": "string",
          "upperAgeLimit": 7399,
          "usageFrequencyLimit": 6495,
          "usageFrequencyType": "string"
        }
      ],
      "name": "string",
      "protocolClassificationType": "string",
      "protocolCode": "string",
      "protocolType": "string",
      "status": "string"
    }
  ],
  "startIndex": 2847,
  "totalPages": 2937
}
```

###### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### POST Add emergency case protocol

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/emergency/protocols`

Adds a protocol(line) to an emergency claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
    "consent_token": "",
    "protocol_code": "P-001",
    "intervention_code": "SHA-01-007",
    "unit_price": 50,
    "quantity": 1
}
```

###### Example Response: Emergency protocol added successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "attributes": "string",
  "bill_from": "string",
  "bill_to": "string",
  "charge_date": "string",
  "discount": 1091.540181069619,
  "discount_reason": "string",
  "doctor_code": "string",
  "doctor_name": "string",
  "id": "string",
  "intervention_code": "string",
  "invoice": "string",
  "is_active": true,
  "is_cancellation": false,
  "is_return": true,
  "item_code": "string",
  "item_name": "string",
  "line_copay": 7964.665016899744,
  "line_net_amount": 6432.459097533194,
  "line_number": "string",
  "line_total_amount": 7157.019290868811,
  "linked_invoice_line": "string",
  "map_request": "string",
  "map_request_description": "string",
  "mapped_slade_code": "string",
  "nhif_rebate_amount": 8200.322205134642,
  "patient_discount_amount": 9454.393032336238,
  "patient_net_price": 4228.661575449293,
  "pmf_line_status": "string",
  "quantity": 1777.3093901470304,
  "scheme_code": "string",
  "scheme_name": "string",
  "sponsor_net_price": 9786.987559247484,
  "uhc_exceeded": false,
  "unit": "string",
  "unit_price": 4013.3611116075963
}
```

###### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### POST Add Emergency Case Protocol Combined Details

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/emergency/protocols`

Adds a protocol(line) to an emergency claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text |  |
| protocol_code | P-001 | text |  |
| intervention_code | SHA-01-007 | text |  |
| unit_price | 200 | text |  |
| diagnoses | ["5B5K.0"] | text |  |
| quantity | 1 | text |  |
| attachments | [{"document_title": "INVOICE", "document_type": "INVOICE","file_field_name": "attachments_0_file_blob"}] | text |  |

###### Example Response: Emergency protocol added successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "attributes": "string",
  "bill_from": "string",
  "bill_to": "string",
  "charge_date": "string",
  "discount": 1091.540181069619,
  "discount_reason": "string",
  "doctor_code": "string",
  "doctor_name": "string",
  "id": "string",
  "intervention_code": "string",
  "invoice": "string",
  "is_active": true,
  "is_cancellation": false,
  "is_return": true,
  "item_code": "string",
  "item_name": "string",
  "line_copay": 7964.665016899744,
  "line_net_amount": 6432.459097533194,
  "line_number": "string",
  "line_total_amount": 7157.019290868811,
  "linked_invoice_line": "string",
  "map_request": "string",
  "map_request_description": "string",
  "mapped_slade_code": "string",
  "nhif_rebate_amount": 8200.322205134642,
  "patient_discount_amount": 9454.393032336238,
  "patient_net_price": 4228.661575449293,
  "pmf_line_status": "string",
  "quantity": 1777.3093901470304,
  "scheme_code": "string",
  "scheme_name": "string",
  "sponsor_net_price": 9786.987559247484,
  "uhc_exceeded": false,
  "unit": "string",
  "unit_price": 4013.3611116075963
}
```

###### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

###### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Emergency Case Claim - UnIdentified Patient

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/emergency`

Creates a claim for an emergency case patient

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
    "interventions": [
        ""
    ], // A list of intervention codes related to the emergency case.
    "mode_of_arrival": "OTHER", // Mode of arrival of the patient to the facility. Options: AMBULANCE, WALK-IN, OTHER
    "brought_by": "RELATIVE", // Indicates who brought the patient to the facility. Options: RELATIVE, UNKNOWN, SAMARITAN, PARAMEDICS
    "reference_number": "REF/12/20", // Unique reference number for the emergency case claim.
    "identification_number": "24131705", // Identification number corresponding to the identification type for the attending health professional.
    "identification_type": "National ID", // Type of identification provided for the attending health professional. Options: "registration_number","National ID","Alien ID","Refugee ID"
    "regulation_body": "KMPDC", // Regulatory body for the attending health professional. Options: KMPDC, COC, NCK
    "notes": "Sample notes" // Optional field to include additional notes about the case.
}
```

##### Example Response: Emergency claim created successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3891,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": [
    "string",
    "string"
  ],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 5870.691164482871,
      "accrued_per_diem_days": 7094,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6646.849248944011,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 7208.5162770261095,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 5534,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 2597.2789443964707,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8041,
          "intervention_code": "string",
          "invoice": 3508,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6763,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3508.985115994525,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8654.044320674217,
          "line_net_amount": 3518.1966209536886,
          "line_number": "string",
          "line_total_amount": 1977.233903046156,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 775.8046085455494,
          "patient_discount_amount": 3072.522598405525,
          "patient_net_price": 25.633286331574467,
          "pmf_line_status": "string",
          "quantity": 3029.1756844549145,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 5815.985356711657,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4505.789692230175
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1491.5331699708622,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 476.68569196248177,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1889,
          "intervention_code": "string",
          "invoice": 3381,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4909.020610542014,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4960,
          "intervention_code": "string",
          "invoice": 2985,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2638,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6043,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3955.124885846184,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6909.628167663948,
          "line_net_amount": 7847.898187380973,
          "line_number": "string",
          "line_total_amount": 2623.4639765046118,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7148.8316946703435,
          "patient_discount_amount": 70.4517479002864,
          "patient_net_price": 1332.9018546973925,
          "pmf_line_status": "string",
          "quantity": 1242.8538050914394,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7815.662888632533,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 1213.6361381984862
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 4030.9852444860894,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 569.2576717126219,
          "line_net_amount": 759.858789563066,
          "line_number": "string",
          "line_total_amount": 9024.992867365747,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4876.166211666566,
          "patient_discount_amount": 2384.925613821589,
          "patient_net_price": 4643.894125807135,
          "pmf_line_status": "string",
          "quantity": 2943.148009007277,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6729.2806149874,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4657.675634689366
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 1847.9259995067432,
      "total_inv_copay": 5739.132325681544,
      "total_inv_discount": 8199.199737739917,
      "total_inv_net_amount": 3279.474443236183,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Emergency Case Claim - Identified Patient

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/emergency`

Creates a claim for an emergency case patient

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
    "interventions": [
        ""
    ], // A list of intervention codes related to the emergency case.
    "mode_of_arrival": "OTHER", // Mode of arrival of the patient to the facility. Options: AMBULANCE, WALK-IN, OTHER
    "brought_by": "RELATIVE", // Indicates who brought the patient to the facility. Options: RELATIVE, UNKNOWN, SAMARITAN, PARAMEDICS
    "reference_number": "REF/12/20", // Unique reference number for the emergency case claim.
    "beneficiary_cr_id": "",
    "identification_number": "24131705", // Identification number corresponding to the identification type for the attending health professional.
    "identification_type": "National ID", // Type of identification provided for the attending health professional. Options: "registration_number","National ID","Alien ID","Refugee ID"
    "regulation_body": "KMPDC", // Regulatory body for the attending health professional. Options: KMPDC, COC, NCK
    "notes": "Sample notes" // Optional field to include additional notes about the case.
}
```

##### Example Response: Emergency claim created successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3891,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": [
    "string",
    "string"
  ],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 5870.691164482871,
      "accrued_per_diem_days": 7094,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6646.849248944011,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 7208.5162770261095,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 5534,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 2597.2789443964707,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8041,
          "intervention_code": "string",
          "invoice": 3508,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6763,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3508.985115994525,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8654.044320674217,
          "line_net_amount": 3518.1966209536886,
          "line_number": "string",
          "line_total_amount": 1977.233903046156,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 775.8046085455494,
          "patient_discount_amount": 3072.522598405525,
          "patient_net_price": 25.633286331574467,
          "pmf_line_status": "string",
          "quantity": 3029.1756844549145,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 5815.985356711657,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4505.789692230175
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1491.5331699708622,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 476.68569196248177,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1889,
          "intervention_code": "string",
          "invoice": 3381,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4909.020610542014,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4960,
          "intervention_code": "string",
          "invoice": 2985,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2638,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6043,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3955.124885846184,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6909.628167663948,
          "line_net_amount": 7847.898187380973,
          "line_number": "string",
          "line_total_amount": 2623.4639765046118,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7148.8316946703435,
          "patient_discount_amount": 70.4517479002864,
          "patient_net_price": 1332.9018546973925,
          "pmf_line_status": "string",
          "quantity": 1242.8538050914394,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7815.662888632533,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 1213.6361381984862
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 4030.9852444860894,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 569.2576717126219,
          "line_net_amount": 759.858789563066,
          "line_number": "string",
          "line_total_amount": 9024.992867365747,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4876.166211666566,
          "patient_discount_amount": 2384.925613821589,
          "patient_net_price": 4643.894125807135,
          "pmf_line_status": "string",
          "quantity": 2943.148009007277,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6729.2806149874,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4657.675634689366
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 1847.9259995067432,
      "total_inv_copay": 5739.132325681544,
      "total_inv_discount": 8199.199737739917,
      "total_inv_net_amount": 3279.474443236183,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### doctors

#### POST Add emergency claim doctor

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/doctors`

Adds a doctor to an emergency case claim

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "string",
  "identification_number": "string",
  "identification_type": "Refugee ID",
  "regulation_body": "NCK"
}
```

##### Example Response: Doctor successfully added to claim (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### DELETE Remove emergency claim doctor

`DELETE https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/doctors`

Removes a doctor from an authorized claim

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "string"
}
```

##### Example Response: No Content (204 No Content)

##### Example Response: Bad Request - Request failed validation (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

## Claims and Preauth

### Authorization

#### POST Create Authorization for OTP Visit

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/authorize`

Creates a new authorization using biometrics.

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
    "patient_id": "",
    "service_type": "OUTPATIENT", // OUTPATIENT, INPATIENT
    "otp": "",
    "interventions": [
        ""
    ]
}
```

##### Example Response: Authorization created successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "authCode": "string",
  "authorizationReason": "string",
  "authorizationType": [
    "string",
    "string"
  ],
  "authorizingDeviceOs": "string",
  "beneficiary": 1456,
  "beneficiaryCode": "string",
  "beneficiaryJoinDate": "string",
  "beneficiaryName": "string",
  "beneficiaryNumber": "string",
  "beneficiaryScheme": "string",
  "benefitType": "string",
  "biometricMatchLogId": "string",
  "createdByName": "string",
  "created_by": "string",
  "dateAuthorized": "string",
  "ekycToken": "string",
  "endDate": "string",
  "endedVia": "string",
  "expiry": "string",
  "guardian": 7900,
  "guid": "string",
  "id": 1384,
  "isBiometricsDischargeAuthorization": true,
  "isComplete": false,
  "isElective": false,
  "isEmergency": true,
  "isOpen": true,
  "label": "string",
  "needsPreauth": true,
  "notes": "string",
  "overallPreauthFinalised": false,
  "parentAuthorization": 4747,
  "parentType": "string",
  "payerName": "string",
  "payerSladeCode": 211,
  "provider": 4612,
  "providerFid": "string",
  "providerName": "string",
  "requestedBy": "string",
  "sessionType": "string",
  "shaGuid": "string",
  "shaVerificationRequest": {
    "embedExpiry": 6637,
    "embededToken": "string",
    "requestId": "string",
    "requestUrl": "string"
  },
  "shaVerificationRequestId": "string",
  "status": "string",
  "token": "string",
  "updated_by": "string",
  "workStationId": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Cancel pending authorization

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/authorizations/:consent_token/reject`

### Eligibility

#### GET SHA Eligibility Check

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/eligibility?identification_number=&identification_type=`

Determines if a patient can qualify for services based on their financial compliance

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "message": "string",
  "requestIdNumber": "string",
  "requestIdType": 9427,
  "contributionHistory": {
    "contributions": [
      {
        "amount": 1432.3286071084506,
        "channel": "string",
        "date": "string",
        "reference": "string"
      },
      {
        "amount": 8012.59715163837,
        "channel": "string",
        "date": "string",
        "reference": "string"
      }
    ],
    "currentPendingAmount": 4702.057799491552,
    "lastContributionAmount": 2662.956666532119,
    "lastContributionDate": "string",
    "penalties": 7315.979236751482,
    "totalContributions": 5649.680262268622,
    "totalMonths": 1104
  },
  "coverageEndDate": "string",
  "coverageStartDate": "string",
  "coverageType": "string",
  "dependants": [
    {
      "date_added": "string",
      "relationship": "string",
      "result": [
        {
          "value": "<Circular reference to #/components/schemas/internal_domain_patients.Member detected>"
        },
        {
          "value": "<Circular reference to #/components/schemas/internal_domain_patients.Member detected>"
        }
      ],
      "total": 7424
    },
    {
      "date_added": "string",
      "relationship": "string",
      "result": [
        {
          "value": "<Circular reference to #/components/schemas/internal_domain_patients.Member detected>"
        },
        {
          "value": "<Circular reference to #/components/schemas/internal_domain_patients.Member detected>"
        }
      ],
      "total": 2179
    }
  ],
  "employerDetails": {
    "employerName": "string",
    "jobGroup": "string",
    "scheme": {
      "joinDate": "string",
      "leaveDate": "string",
      "memberPolicyEndDate": "string",
      "memberPolicyStartDate": "string",
      "schemeCategoryCode": "string",
      "schemeCategoryName": "string",
      "schemeCode": "string",
      "schemeName": "string"
    }
  },
  "fullName": "string",
  "memberCrNumber": "string",
  "memberType": "string",
  "possibleSolution": "string",
  "primaryContributor": {
    "crNumber": "string",
    "idNumber": "string",
    "name": "string"
  },
  "reason": "string",
  "status": 9582
}
```

##### Example Response: Bad Request - Missing query parameters or invalid request input (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### GET Sub-benefits Coverage

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/sub-benefits?patient_id=`

Retrieves a patient's SHA benefits coverage

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "count": 1695,
  "currentPage": 5893,
  "endIndex": 3272,
  "next": "string",
  "pageSize": 6554,
  "previous": "string",
  "results": [
    {
      "accessPoint": "string",
      "active": true,
      "allowedInterventions": [
        "string",
        "string"
      ],
      "applicableLimit": "string",
      "code": "string",
      "cover": {
        "category": "string",
        "categoryCode": "string",
        "effectivePolicyNumber": "string",
        "group": "string",
        "groupCode": "string",
        "groupType": "string",
        "isEmployerGroup": true,
        "jobGroup": "string",
        "policyNumber": "string",
        "validFrom": "string",
        "validTo": "string"
      },
      "fund": "string",
      "guid": "string",
      "id": 7918,
      "interventionCombination": [
        "string",
        "string"
      ],
      "name": "string",
      "packageCombination": [
        "string",
        "string"
      ],
      "parentBenefit": "string",
      "parentBenefitCode": "string",
      "standaloneInterventions": [
        "string",
        "string"
      ],
      "status": "string"
    },
    {
      "accessPoint": "string",
      "active": true,
      "allowedInterventions": [
        "string",
        "string"
      ],
      "applicableLimit": "string",
      "code": "string",
      "cover": {
        "category": "string",
        "categoryCode": "string",
        "effectivePolicyNumber": "string",
        "group": "string",
        "groupCode": "string",
        "groupType": "string",
        "isEmployerGroup": true,
        "jobGroup": "string",
        "policyNumber": "string",
        "validFrom": "string",
        "validTo": "string"
      },
      "fund": "string",
      "guid": "string",
      "id": 9799,
      "interventionCombination": [
        "string",
        "string"
      ],
      "name": "string",
      "packageCombination": [
        "string",
        "string"
      ],
      "parentBenefit": "string",
      "parentBenefitCode": "string",
      "standaloneInterventions": [
        "string",
        "string"
      ],
      "status": "string"
    }
  ],
  "startIndex": 3804,
  "totalPages": 2759
}
```

##### Example Response: Bad Request - Missing query parameters or invalid request input (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### GET Intervention Coverage

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/benefits/interventions?patient_id=&sub_benefit_code=`

Retrieves a patient's SHA benefit interventions

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "count": 1167,
  "currentPage": 2705,
  "endIndex": 5876,
  "next": "string",
  "pageSize": 8505,
  "previous": "string",
  "results": [
    {
      "accessPoint": "string",
      "active": true,
      "annualLimitValue": 8345.210541181676,
      "annualQuantityLimit": 634,
      "annualQuantityLimitChoice": "string",
      "annualQuantityLimitType": "string",
      "applicableFacilityOwnership": "string",
      "applicableGender": "string",
      "applicableSchemes": [
        "string",
        "string"
      ],
      "benefit": 7711,
      "benefitCode": "string",
      "benefitName": "string",
      "code": "string",
      "comment": "string",
      "complexity": "string",
      "coverageLevel": "string",
      "diagnosisBlock": [
        "string",
        "string"
      ],
      "diagnosisList": [
        "string",
        "string"
      ],
      "fallBackLevel_2_tariff": 7218.017805659644,
      "fallBackLevel_3_tariff": 9597.786771834031,
      "fallBackLevel_4_tariff": 5220.2837497356395,
      "fallBackLevel_5_tariff": 7612.9257204427495,
      "fallBackLevel_6_tariff": 5905.322295760513,
      "fallBackOverallTariff": 7306.42547509133,
      "fund": "string",
      "guid": "string",
      "id": 6232,
      "investigationTariff": 3911.9419603924866,
      "investigationTariffHasLimit": true,
      "isIntraMetro": false,
      "kephLevelTarrif": 1822.760820430478,
      "level_2_tariff": 788.3485840883076,
      "level_3_tariff": 3815.6686723334765,
      "level_4_tariff": 7404.028230993207,
      "level_5_tariff": 1541.3032530778237,
      "level_6_tariff": 4696.416669266192,
      "levelsApplicable": [
        "string",
        "string"
      ],
      "lowerAgeLimit": 4471,
      "managementTariff": 5025.2721214432,
      "managementTariffHasLimit": false,
      "name": "string",
      "needApprovalBeforeClaimSubmission": true,
      "needsDoctorAuthorization": false,
      "needsManualPreauthApproval": false,
      "needsMemberAuthorization": false,
      "needsPreauth": true,
      "numberOfDaysToFallback": 9437,
      "numberOfDoctorsRequired": 9305,
      "overallTariff": 8955.69535525254,
      "overallTariffHasLimit": true,
      "parentBenefitCode": "string",
      "parentBenefitName": "string",
      "paymentMechanism": "string",
      "preauthFinalised": false,
      "protocolUsed": "string",
      "requiresOncologyPreauth": false,
      "requiresOpticalPreauth": true,
      "requiresRadiologyPreauth": false,
      "requiresRenalPreauth": false,
      "requiresSurgicalPreauth": false,
      "status": "string",
      "supportedScheme": "string",
      "tariffLimitPerIndividual": 9649.145313108893,
      "tariffPerAdditionalKilometer": 9261.344719548255,
      "upperAgeLimit": 8128,
      "usageFrequencyLimit": 4957,
      "usageFrequencyType": "string"
    },
    {
      "accessPoint": "string",
      "active": true,
      "annualLimitValue": 4088.7065585369055,
      "annualQuantityLimit": 3218,
      "annualQuantityLimitChoice": "string",
      "annualQuantityLimitType": "string",
      "applicableFacilityOwnership": "string",
      "applicableGender": "string",
      "applicableSchemes": [
        "string",
        "string"
      ],
      "benefit": 5275,
      "benefitCode": "string",
      "benefitName": "string",
      "code": "string",
      "comment": "string",
      "complexity": "string",
      "coverageLevel": "string",
      "diagnosisBlock": [
        "string",
        "string"
      ],
      "diagnosisList": [
        "string",
        "string"
      ],
      "fallBackLevel_2_tariff": 6689.078993602513,
      "fallBackLevel_3_tariff": 4753.112942032998,
      "fallBackLevel_4_tariff": 4128.080100584566,
      "fallBackLevel_5_tariff": 1521.7116836667044,
      "fallBackLevel_6_tariff": 8059.052223586127,
      "fallBackOverallTariff": 4003.8596921617973,
      "fund": "string",
      "guid": "string",
      "id": 1771,
      "investigationTariff": 6750.599003258819,
      "investigationTariffHasLimit": false,
      "isIntraMetro": false,
      "kephLevelTarrif": 4371.319225370223,
      "level_2_tariff": 8715.372103785216,
      "level_3_tariff": 4794.673102044398,
      "level_4_tariff": 6164.497177777756,
      "level_5_tariff": 1673.1548741700285,
      "level_6_tariff": 9808.194417445111,
      "levelsApplicable": [
        "string",
        "string"
      ],
      "lowerAgeLimit": 4809,
      "managementTariff": 6484.7368932096,
      "managementTariffHasLimit": true,
      "name": "string",
      "needApprovalBeforeClaimSubmission": true,
      "needsDoctorAuthorization": false,
      "needsManualPreauthApproval": true,
      "needsMemberAuthorization": true,
      "needsPreauth": false,
      "numberOfDaysToFallback": 4748,
      "numberOfDoctorsRequired": 5041,
      "overallTariff": 9169.391918867625,
      "overallTariffHasLimit": false,
      "parentBenefitCode": "string",
      "parentBenefitName": "string",
      "paymentMechanism": "string",
      "preauthFinalised": false,
      "protocolUsed": "string",
      "requiresOncologyPreauth": false,
      "requiresOpticalPreauth": false,
      "requiresRadiologyPreauth": true,
      "requiresRenalPreauth": false,
      "requiresSurgicalPreauth": false,
      "status": "string",
      "supportedScheme": "string",
      "tariffLimitPerIndividual": 1554.6140524817597,
      "tariffPerAdditionalKilometer": 4427.7521093135965,
      "upperAgeLimit": 830,
      "usageFrequencyLimit": 451,
      "usageFrequencyType": "string"
    }
  ],
  "startIndex": 2849,
  "totalPages": 884
}
```

##### Example Response: Bad Request - Missing query parameters or invalid request input (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### GET Check POMSF balance

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/pomsf-balances?patient_id=&policy_year=2026&principal_member_number={{principal_member_cr_id}}`

Retrieves Public Officers Medical Scheme Fund balances for a civil servant patient

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "dateOfBirth": "string",
  "email": "string",
  "familyMembers": [
    {
      "dateOfBirth": "string",
      "email": "string",
      "firstName": "string",
      "gender": "string",
      "householdId": "string",
      "isActive": true,
      "lastName": "string",
      "memberNumber": "string",
      "middleName": "string",
      "nationalId": "string",
      "parentNumber": "string",
      "phone": "string",
      "phoneCode": "string",
      "relationshipType": "string",
      "schemeCount": 6522,
      "shaNumber": "string",
      "title": "string"
    },
    {
      "dateOfBirth": "string",
      "email": "string",
      "firstName": "string",
      "gender": "string",
      "householdId": "string",
      "isActive": true,
      "lastName": "string",
      "memberNumber": "string",
      "middleName": "string",
      "nationalId": "string",
      "parentNumber": "string",
      "phone": "string",
      "phoneCode": "string",
      "relationshipType": "string",
      "schemeCount": 2625,
      "shaNumber": "string",
      "title": "string"
    }
  ],
  "firstName": "string",
  "gender": "string",
  "householdId": "string",
  "id": "string",
  "lastName": "string",
  "memberNumber": "string",
  "memberPolicies": [
    {
      "benefit": [
        {
          "balance": [
            {
              "balance": 2755.1254577005334,
              "member": "string"
            },
            {
              "balance": 1857.7930913197572,
              "member": "string"
            }
          ],
          "benefitCode": "string",
          "benefitGender": [
            "string",
            "string"
          ],
          "benefitId": 7044,
          "benefitRelation": [
            "string",
            "string"
          ],
          "benefitShared": "string",
          "description": "string",
          "limit": 4039,
          "name": "string",
          "subBenefit": [
            {
              "balance": [
                {
                  "balance": 604.4567329536976,
                  "member": "string"
                },
                {
                  "balance": 9692.088927618845,
                  "member": "string"
                }
              ],
              "description": "string",
              "limit": 6014,
              "name": "string",
              "subBenefitCode": "string",
              "subBenefitGender": [
                "string",
                "string"
              ],
              "subBenefitId": 2943,
              "subBenefitRelation": [
                "string",
                "string"
              ],
              "subBenefitShared": "string",
              "subBenefitWaitingPeriod": "",
              "type": "string"
            },
            {
              "balance": [
                {
                  "balance": 8991.248350555405,
                  "member": "string"
                },
                {
                  "balance": 321.111670921943,
                  "member": "string"
                }
              ],
              "description": "string",
              "limit": 8310,
              "name": "string",
              "subBenefitCode": "string",
              "subBenefitGender": [
                "string",
                "string"
              ],
              "subBenefitId": 8859,
              "subBenefitRelation": [
                "string",
                "string"
              ],
              "subBenefitShared": "string",
              "subBenefitWaitingPeriod": "",
              "type": "string"
            }
          ],
          "type": "string"
        },
        {
          "balance": [
            {
              "balance": 290.8689073964199,
              "member": "string"
            },
            {
              "balance": 5718.849588611179,
              "member": "string"
            }
          ],
          "benefitCode": "string",
          "benefitGender": [
            "string",
            "string"
          ],
          "benefitId": 9269,
          "benefitRelation": [
            "string",
            "string"
          ],
          "benefitShared": "string",
          "description": "string",
          "limit": 3711,
          "name": "string",
          "subBenefit": [
            {
              "balance": [
                {
                  "balance": 3627.914828552905,
                  "member": "string"
                },
                {
                  "balance": 881.9191730605592,
                  "member": "string"
                }
              ],
              "description": "string",
              "limit": 267,
              "name": "string",
              "subBenefitCode": "string",
              "subBenefitGender": [
                "string",
                "string"
              ],
              "subBenefitId": 8755,
              "subBenefitRelation": [
                "string",
                "string"
              ],
              "subBenefitShared": "string",
              "subBenefitWaitingPeriod": "",
              "type": "string"
            },
            {
              "balance": [
                {
                  "balance": 3063.0915224328724,
                  "member": "string"
                },
                {
                  "balance": 6023.568862984177,
                  "member": "string"
                }
              ],
              "description": "string",
              "limit": 6048,
              "name": "string",
              "subBenefitCode": "string",
              "subBenefitGender": [
                "string",
                "string"
              ],
              "subBenefitId": 3434,
              "subBenefitRelation": [
                "string",
                "string"
              ],
              "subBenefitShared": "string",
              "subBenefitWaitingPeriod": "",
              "type": "string"
            }
          ],
          "type": "string"
        }
      ],
      "dependentCount": [
        "string",
        "string"
      ],
      "joinDate": "string",
      "leaveDate": "string",
      "memberOriginalJoinDate": "string",
      "parentMemberNumber": "string",
      "policy": {
        "PolicyYear": "string",
        "activeDate": "string",
        "companyName": "string",
        "description": "string",
        "endDate": "string",
        "hasHospitalCodes": false,
        "hasICD10Code": false,
        "hasImagingServices": false,
        "hasIncludeandExclude": false,
        "hasLabtests": true,
        "hasMedicalprocedures": false,
        "hasMedicines": false,
        "hasOpticalServices": false,
        "iCD10Type": "string",
        "medicalproceduresType": "string",
        "name": "string",
        "policyCode": "string",
        "policyGroup": "string",
        "policyId": "string",
        "schemeCode": "string",
        "schemeName": "string",
        "status": "string",
        "terminationDate": "string",
        "totalBenefit": 1130,
        "type": "string"
      },
      "policyJoinDate": "string",
      "spouseCount": [
        "string",
        "string"
      ],
      "status": "string"
    },
    {
      "benefit": [
        {
          "balance": [
            {
              "balance": 1013.1047415832973,
              "member": "string"
            },
            {
              "balance": 7983.344113590522,
              "member": "string"
            }
          ],
          "benefitCode": "string",
          "benefitGender": [
            "string",
            "string"
          ],
          "benefitId": 2364,
          "benefitRelation": [
            "string",
            "string"
          ],
          "benefitShared": "string",
          "description": "string",
          "limit": 2099,
          "name": "string",
          "subBenefit": [
            {
              "balance": [
                {
                  "balance": 8226.762376072667,
                  "member": "string"
                },
                {
                  "balance": 3198.1569212184068,
                  "member": "string"
                }
              ],
              "description": "string",
              "limit": 8643,
              "name": "string",
              "subBenefitCode": "string",
              "subBenefitGender": [
                "string",
                "string"
              ],
              "subBenefitId": 4874,
              "subBenefitRelation": [
                "string",
                "string"
              ],
              "subBenefitShared": "string",
              "subBenefitWaitingPeriod": "",
              "type": "string"
            },
            {
              "balance": [
                {
                  "balance": 528.8230627725277,
                  "member": "string"
                },
                {
                  "balance": 5949.93972732268,
                  "member": "string"
                }
              ],
              "description": "string",
              "limit": 3991,
              "name": "string",
              "subBenefitCode": "string",
              "subBenefitGender": [
                "string",
                "string"
              ],
              "subBenefitId": 5570,
              "subBenefitRelation": [
                "string",
                "string"
              ],
              "subBenefitShared": "string",
              "subBenefitWaitingPeriod": "",
              "type": "string"
            }
          ],
          "type": "string"
        },
        {
          "balance": [
            {
              "balance": 2831.4374376893147,
              "member": "string"
            },
            {
              "balance": 7235.570437249974,
              "member": "string"
            }
          ],
          "benefitCode": "string",
          "benefitGender": [
            "string",
            "string"
          ],
          "benefitId": 1022,
          "benefitRelation": [
            "string",
            "string"
          ],
          "benefitShared": "string",
          "description": "string",
          "limit": 8432,
          "name": "string",
          "subBenefit": [
            {
              "balance": [
                {
                  "balance": 7873.281033972579,
                  "member": "string"
                },
                {
                  "balance": 9472.871912901235,
                  "member": "string"
                }
              ],
              "description": "string",
              "limit": 7707,
              "name": "string",
              "subBenefitCode": "string",
              "subBenefitGender": [
                "string",
                "string"
              ],
              "subBenefitId": 6986,
              "subBenefitRelation": [
                "string",
                "string"
              ],
              "subBenefitShared": "string",
              "subBenefitWaitingPeriod": "",
              "type": "string"
            },
            {
              "balance": [
                {
                  "balance": 8313.991006754715,
                  "member": "string"
                },
                {
                  "balance": 6812.149218634045,
                  "member": "string"
                }
              ],
              "description": "string",
              "limit": 8331,
              "name": "string",
              "subBenefitCode": "string",
              "subBenefitGender": [
                "string",
                "string"
              ],
              "subBenefitId": 317,
              "subBenefitRelation": [
                "string",
                "string"
              ],
              "subBenefitShared": "string",
              "subBenefitWaitingPeriod": "",
              "type": "string"
            }
          ],
          "type": "string"
        }
      ],
      "dependentCount": [
        "string",
        "string"
      ],
      "joinDate": "string",
      "leaveDate": "string",
      "memberOriginalJoinDate": "string",
      "parentMemberNumber": "string",
      "policy": {
        "PolicyYear": "string",
        "activeDate": "string",
        "companyName": "string",
        "description": "string",
        "endDate": "string",
        "hasHospitalCodes": false,
        "hasICD10Code": true,
        "hasImagingServices": false,
        "hasIncludeandExclude": true,
        "hasLabtests": true,
        "hasMedicalprocedures": false,
        "hasMedicines": false,
        "hasOpticalServices": true,
        "iCD10Type": "string",
        "medicalproceduresType": "string",
        "name": "string",
        "policyCode": "string",
        "policyGroup": "string",
        "policyId": "string",
        "schemeCode": "string",
        "schemeName": "string",
        "status": "string",
        "terminationDate": "string",
        "totalBenefit": 9229,
        "type": "string"
      },
      "policyJoinDate": "string",
      "spouseCount": [
        "string",
        "string"
      ],
      "status": "string"
    }
  ],
  "middleName": "string",
  "nationalId": "string",
  "parentNumber": "string",
  "phone": "string",
  "phoneCode": "string",
  "policyCount": 5223,
  "registeredOn": "string",
  "relationshipType": "string",
  "schemeCount": 7821,
  "shaNumber": "string",
  "title": "string"
}
```

##### Example Response: Bad Request - Missing query parameters or invalid request input (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### GET Benefit utilization API

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/benefits/utilization?patient_id=&intervention_code=`

Retrieves a patient's payer utilization balances showing benefit usage and remaining limits

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: OK (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "code": "string",
  "computationalDetail": {
    "coverageEndDate": "string",
    "coverageStartDate": "string",
    "eligibility": true,
    "householdLimitAvailableCount": 5198,
    "individualLimitAvailableCount": 2911,
    "intermediatePeriodUsage": {
      "individualMaxDuringPeriod": 4876,
      "individualUtilisedDuringPeriod": 9009,
      "lastUsageDate": "string",
      "period": "string"
    },
    "limitAvailableAmount": 5147.577951999114,
    "nextAvailableDate": "string"
  },
  "crId": "string",
  "fundUtilizationLimit": [
    {
      "availableAmount": 5925.476225881718,
      "fundType": "string",
      "maxAmount": 3832.3488663182648,
      "utilisedAmount": 614.2773789867206
    },
    {
      "availableAmount": 6747.937216771674,
      "fundType": "string",
      "maxAmount": 1009.5512791793393,
      "utilisedAmount": 4655.816011213369
    }
  ],
  "householdMaxLimit": 6989,
  "householdUtilisedLimit": 7491,
  "individualMaxLimit": 2988,
  "individualUtilisedLimit": 724,
  "limitScope": "string",
  "nextAvailability": "string",
  "utilizationDays": 5200
}
```

##### Example Response: Bad Request - Missing query parameters or invalid request input (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### GET View Bed Occupancy

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/facilities/:facilityFrCode/beds/occupancy`

**Auth:** `bearer`

### Start Visit

#### POST Create Virtual Claim Outpatient

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/visit`

Initiate a new healthcare visit for a patient with OTP verification.

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
"intervention_codes": [
    "" // Intervention code(s) for the service scheduled to be offered
],
"otp": "", // One time Password sent to the beneficiary contact
"patient_id": "", // Client registry identifier of the beneficiary associated with the patient
"service_type": "OUTPATIENT" // Type of service Options: CAPITATION, OUTPATIENT, INPATIENT, EMERGENCY
}
```

##### Example Response: Visit started successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3891,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": [
    "string",
    "string"
  ],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 5870.691164482871,
      "accrued_per_diem_days": 7094,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6646.849248944011,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 7208.5162770261095,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 5534,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 2597.2789443964707,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8041,
          "intervention_code": "string",
          "invoice": 3508,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6763,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3508.985115994525,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8654.044320674217,
          "line_net_amount": 3518.1966209536886,
          "line_number": "string",
          "line_total_amount": 1977.233903046156,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 775.8046085455494,
          "patient_discount_amount": 3072.522598405525,
          "patient_net_price": 25.633286331574467,
          "pmf_line_status": "string",
          "quantity": 3029.1756844549145,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 5815.985356711657,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4505.789692230175
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1491.5331699708622,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 476.68569196248177,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1889,
          "intervention_code": "string",
          "invoice": 3381,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4909.020610542014,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4960,
          "intervention_code": "string",
          "invoice": 2985,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2638,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6043,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3955.124885846184,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6909.628167663948,
          "line_net_amount": 7847.898187380973,
          "line_number": "string",
          "line_total_amount": 2623.4639765046118,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7148.8316946703435,
          "patient_discount_amount": 70.4517479002864,
          "patient_net_price": 1332.9018546973925,
          "pmf_line_status": "string",
          "quantity": 1242.8538050914394,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7815.662888632533,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 1213.6361381984862
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 4030.9852444860894,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 569.2576717126219,
          "line_net_amount": 759.858789563066,
          "line_number": "string",
          "line_total_amount": 9024.992867365747,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4876.166211666566,
          "patient_discount_amount": 2384.925613821589,
          "patient_net_price": 4643.894125807135,
          "pmf_line_status": "string",
          "quantity": 2943.148009007277,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6729.2806149874,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4657.675634689366
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 1847.9259995067432,
      "total_inv_copay": 5739.132325681544,
      "total_inv_discount": 8199.199737739917,
      "total_inv_net_amount": 3279.474443236183,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Virtual Claim Inpatient

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/visit`

Initiate a new healthcare visit for a patient with OTP verification.

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
    "admission_date": "2026-02-10T15:30:00+03:00", // [Only for INPATIENT claims] Date of admission for the patient in ISO format
    "estimated_days_of_admission": 6, // [Only for INPATIENT claims] Estimated number of days for the patient's admission
    "intervention_codes": [
        "" // Intervention code(s) for the service scheduled to be offered
    ],
    "otp": "", // One time Password sent to the beneficiary contact
    "patient_id": "", // Client registry identifier of the beneficiary associated with the patient
    "service_type": "INPATIENT" // Type of service Options: CAPITATION, OUTPATIENT, INPATIENT, EMERGENCY
}
```

##### Example Response: Visit started successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3891,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": [
    "string",
    "string"
  ],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 5870.691164482871,
      "accrued_per_diem_days": 7094,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6646.849248944011,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 7208.5162770261095,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 5534,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 2597.2789443964707,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8041,
          "intervention_code": "string",
          "invoice": 3508,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6763,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3508.985115994525,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8654.044320674217,
          "line_net_amount": 3518.1966209536886,
          "line_number": "string",
          "line_total_amount": 1977.233903046156,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 775.8046085455494,
          "patient_discount_amount": 3072.522598405525,
          "patient_net_price": 25.633286331574467,
          "pmf_line_status": "string",
          "quantity": 3029.1756844549145,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 5815.985356711657,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4505.789692230175
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1491.5331699708622,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 476.68569196248177,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1889,
          "intervention_code": "string",
          "invoice": 3381,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4909.020610542014,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4960,
          "intervention_code": "string",
          "invoice": 2985,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2638,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6043,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3955.124885846184,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6909.628167663948,
          "line_net_amount": 7847.898187380973,
          "line_number": "string",
          "line_total_amount": 2623.4639765046118,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7148.8316946703435,
          "patient_discount_amount": 70.4517479002864,
          "patient_net_price": 1332.9018546973925,
          "pmf_line_status": "string",
          "quantity": 1242.8538050914394,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7815.662888632533,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 1213.6361381984862
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 4030.9852444860894,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 569.2576717126219,
          "line_net_amount": 759.858789563066,
          "line_number": "string",
          "line_total_amount": 9024.992867365747,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4876.166211666566,
          "patient_discount_amount": 2384.925613821589,
          "patient_net_price": 4643.894125807135,
          "pmf_line_status": "string",
          "quantity": 2943.148009007277,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6729.2806149874,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4657.675634689366
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 1847.9259995067432,
      "total_inv_copay": 5739.132325681544,
      "total_inv_discount": 8199.199737739917,
      "total_inv_net_amount": 3279.474443236183,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### Interventions

#### POST Add Intervention

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/interventions`

Adds a new intervention to an existing authorized claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "", // Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.
  "intervention_code": "SHA-12-001" // Intervention code(s) for the service scheduled to be offered
}
```

##### Example Response: Intervention added successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accrued_per_diem_amount": 6057.130522156648,
  "accrued_per_diem_days": 9256,
  "active_for_uhc": true,
  "bill_from": "string",
  "bill_to": "string",
  "id": "string",
  "intervention_code": "string",
  "intervention_fund": "string",
  "intervention_name": "string",
  "intervention_overall_tariff": 3216.7595786876714,
  "intervention_payment_mechanism": "string",
  "is_switched_intervention": true,
  "keph_level_tarrif": 8237.525427477138,
  "preauth_exist": true,
  "requires_surgical_preauth": true,
  "sub_benefit_code": "string",
  "supported_scheme": "string",
  "switched_intervention_id": 1452,
  "switched_lines_retained": false,
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Switch Intervetion

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/interventions/switch`

Switches an existing intervention to a new intervention using a valid consent token.

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "",
  "existing_intervention_code": "",
  "new_intervention_code": "SHA-18-004",
  "retain_bill_items": false,
  "bill_from": "string", // Optional depending on whether retain_bill_items is true
  "bill_to": "string"//Optional depending on whether retain_bill_items is true
}
```

##### Example Response: Intervention switched successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad request - invalid payload (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden - tenant context required (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Restore Intervention

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/interventions/restore`

Restores an already retired claim intervention

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "", // Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.
  "intervention_code": "" // Intervention code(s) for the service scheduled to be offered
}
```

##### Example Response: Intervention restored successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Retire Intervention

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/interventions/retire`

Retires an intervention from an existing authorized claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "",
  "intervention_code": "" // Intervention code(s) for the service scheduled to be offered
}
```

##### Example Response: Intervention retired successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### Preauths

#### GET Preview Preauth

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths?consent_token=`

Fetches an existing preauthorization linked to the consent token provided

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: Preauthorization retrieved successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Normal Preauth

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths`

Creates a new preauthorization using multipart form data with file uploads

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | multipart/form-data |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text | <p>Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.</p>
 |
| intervention_code |  | text | <p>Intervention code for the service offered</p>
 |
| service_start | 2026-03-05T15:30:00+03:00 | text | <p>ISO timestamp for when the service started</p>
 |
| service_end | 2026-03-05T16:00:00+03:00 | text | <p>ISO timestamp for when the service ended</p>
 |
| items | [{"unit_price": "500.00"}] | text | <p>List of billed items</p>
 |
| diagnoses | [{"consent_token": "","icd_code": "ca07.0"}] | text | <p>List of diagnoses</p>
 |
| doctors | [{"identification_number": "","identification_type":"", "regulation_body": "KMPDC", "intervention_code": "", "is_primary":true}] | text | <p>List of doctors</p>
 |
| attachments | [{"document_title": "Lab Results", "document_type": "LAB_TESTS","file_field_name": "attachments_0_file_blob"}] | text | <p>List of attachments. Options for document_type: "DISCHARGE_SUMMARY", "FINAL_BILL", "INTERIM_BILL", "LOU", "MEDICAL_REPORT", "PRESCRIPTION", "RADIOLOGY_REQUEST", "RADIOLOGICAL_EXAM", "LAB_ORDER", "LAB_TESTS", "CASE_SUMMARY", "PREAUTH_FORM", "PROFORMA_INVOICE", "THEATRE_LIST", "CLINICAL_DOCUMENTATION", and "OTHER".</p>
 |
| attachments_0_file_blob | /home/clifford-ouma/SIL-Tech-Work/SHA repos/Benefits-Coverage.jpg | file | <p>FIle upload field for the attachments. The key for this field should align with the specific "file_field_name" used when listing attachments</p>
 |
| provider_notification_email |  | text |  |

##### Example Response: Preauthorization created successfully (201 Created)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Surgical Preauth

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths`

Creates a new preauthorization using multipart form data with file uploads

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | multipart/form-data |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text |  |
| intervention_code | SHA-19-074 | text |  |
| service_start | 2025-09-09T15:30:00+03:00 | text |  |
| service_end | 2025-09-10T15:30:00+03:00 | text |  |
| items | [{"unit_price": "500000.00"}] | text |  |
| diagnoses | [{"consent_token": "","icd_code": "ca07.0"}] | text |  |
| doctors | [{"identification_number": "","identification_type":"", "regulation_body": "KMPDC", "intervention_code": "", "is_primary":true}] | text |  |
| attachments | [{"document_title": "Lab Results", "document_type": "LAB_TESTS","file_field_name": "attachments_0_file_blob"}] | text |  |
| provider_notification_email | clifford.ouma@savannahinformatics.com | text |  |
| chief_complaint | Clifford Ouma | text |  |
| vital_signs | 110 BP | text |  |
| history_of_present_illness | None | text |  |
| physical_examination | Looks pale and weak | text |  |
| investigation_report_details | None | text |  |
| type_of_anaesthesia | GENERAL | text |  |
| surgery_date | 2025-09-08T15:30:00+03:00 | text |  |

##### Example Response: Preauthorization created successfully (201 Created)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Renal Preauth

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths`

Creates a new preauthorization using multipart form data with file uploads

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | multipart/form-data |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text |  |
| intervention_code | SHA-16-011 | text |  |
| service_start | 2025-11-21T15:30:00+03:00 | text |  |
| service_end | 2025-11-21T15:30:00+03:00 | text |  |
| items | [{"unit_price": "20000.00"}] | text |  |
| diagnoses | [{"consent_token": "","icd_code": "ca07.0"}] | text |  |
| doctors | [{"identification_number": "","identification_type":"", "regulation_body": "KMPDC", "intervention_code": "", "is_primary":true}] | text |  |
| attachments | [{"document_title": "Lab Results", "document_type": "LAB_TESTS","file_field_name": "attachments_0_file_blob"}] | text |  |
| provider_notification_email | clifford.ouma@savannahinformatics.com | text |  |
| number_of_sessions_required | 7 | text |  |
| cost_per_session | 5000 | text |  |
| frequency_of_sessions | ONCE_A_MONTH | text |  |
| clinical_indications | Pain in lower abdomen | text |  |
| start_date | 2025-11-21T15:30:00+03:00 | text |  |
| is_co_insured | true | text |  |

##### Example Response: Preauthorization created successfully (201 Created)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Optical Preauth

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths`

Creates a new preauthorization using multipart form data with file uploads

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | multipart/form-data |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text |  |
| intervention_code | SHA-05-001 | text |  |
| service_start | 2025-09-08T15:30:00+03:00 | text |  |
| service_end | 2025-09-09T15:30:00+03:00 | text |  |
| items | [{"unit_price": "500000.00"}] | text |  |
| diagnoses | [{"consent_token": "","icd_code": "ca07.0"}] | text |  |
| doctors | [{"identification_number": "","identification_type":"", "regulation_body": "KMPDC", "intervention_code": "", "is_primary":true}] | text |  |
| attachments | [{"document_title": "Lab Results", "document_type": "LAB_TESTS","file_field_name": "attachments_0_file_blob"}] | text |  |
| provider_notification_email | clifford.ouma@savannahinformatics.com | text |  |
| necessity_of_service | To help patient see clearly | text |  |
| lens_prescription | FRAMES_LENSES | text |  |
| lens_amount | 10000 | text |  |
| eye_examination_amount | 2000 | text |  |
| frame_amount | 10000 | text |  |
| new_or_replacement | REPLACEMENT | text |  |

##### Example Response: Preauthorization created successfully (201 Created)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Oncology Preauth

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths`

Creates a new preauthorization using multipart form data with file uploads

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | multipart/form-data |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text |  |
| intervention_code | SHA-06-021 | text |  |
| service_start | 2026-03-04T15:30:00+03:00 | text |  |
| service_end | 2026-03-04T17:30:00+03:00 | text |  |
| items | [{"unit_price": "5000.00"}] | text |  |
| diagnoses | [{"consent_token": "","icd_code": "ca07.0"}] | text |  |
| doctors | [{"identification_number": "","identification_type":"", "regulation_body": "KMPDC", "intervention_code": "", "is_primary":true}] | text |  |
| attachments | [{"document_title": "Lab Results", "document_type": "LAB_TESTS","file_field_name": "attachments_0_file_blob"}] | text |  |
| attachments_0_file_blob | /home/clifford-ouma/SIL-Tech-Work/SHA repos/Benefits-Coverage.jpg | file |  |
| provider_notification_email | clifford.ouma@savannahinformatics.com | text |  |
| carcinoma_staging | STAGE_1 | text |  |
| comorbidity | The comorbidity | text |  |
| metastases | ["LUNG"] | text |  |
| treatment_setting | ["DAY_WARD"] | text |  |
| number_of_sessions_required | 20 | text |  |
| cost_per_session | 2500 | text |  |
| is_co_insured | true | text |  |

##### Example Response: Preauthorization created successfully (201 Created)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create Imaging Preauth

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths`

Creates a new preauthorization using multipart form data with file uploads

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | multipart/form-data |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text |  |
| intervention_code | SHA-09-001 | text |  |
| service_start | 2025-09-08T15:30:00+03:00 | text |  |
| service_end | 2025-09-09T15:30:00+03:00 | text |  |
| items | [{"unit_price": "500000.00"}] | text |  |
| diagnoses | [{"consent_token": "","icd_code": "ca07.0"}] | text |  |
| doctors | [{"identification_number": "","identification_type":"", "regulation_body": "KMPDC", "intervention_code": "", "is_primary":true}] | text |  |
| attachments | [{"document_title": "Lab Results", "document_type": "LAB_TESTS","file_field_name": "attachments_0_file_blob"}] | text |  |
| provider_notification_email | clifford.ouma@savannahinformatics.com | text |  |
| clinical_indications | Prescence of head pains | text |  |

##### Example Response: Preauthorization created successfully (201 Created)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Cancel Preauth

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths/cancel`

Cancels an existing preauthorization using consent token and intervention code

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "",
  "intervention_code": ""
}
```

##### Example Response: Preauthorization canceled successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### DELETE Remove Preauth Doctors

`DELETE https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths/doctors`

Removes a practitioner using the PractitionerRegistrationNumber from an existing preauthorization

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "string",
  "intervention_code": "string",
  "practitioner_registration_number": "string"
}
```

##### Example Response: Preauth Doctor removed successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
string
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### DELETE Remove Preauth Diagnosis

`DELETE https://ilm-dev.dha.go.ke/uat-middleware/api/v1/preauths/diagnoses/:icd_code`

Removes a diagnosis using the ICD code from an existing preauthorization

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "",
  "icd_code": "",
  "intervention_code": ""
}
```

##### Example Response: Preauthorization canceled successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authAttachments": [
      "",
      ""
    ],
    "authCode": "string",
    "authorizationNotes": [
      "",
      ""
    ],
    "authorizationReason": "string",
    "authorizationType": [
      "string",
      "string"
    ],
    "authorizingDeviceOs": "string",
    "beneficiary": 5576,
    "beneficiaryCode": "string",
    "beneficiaryJoinDate": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "beneficiaryScheme": "string",
    "benefitType": "string",
    "biometricMatchLogId": "string",
    "children": "string",
    "createdByName": "string",
    "dateAuthorized": "string",
    "ekycToken": "string",
    "electivePreauth": "string",
    "eligibility": "string",
    "eligibilityDetails": "string",
    "endDate": "string",
    "endedVia": "string",
    "expiry": "string",
    "guardian": "string",
    "guid": "string",
    "id": 864,
    "interventions": [
      {
        "activeForUhc": true,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2842,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 9478.530008366646,
        "fund": "string",
        "id": 6928,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 4570.2879408469,
        "name": "string",
        "needsPreauth": true,
        "numberOfDaysToFallback": 392,
        "overallTariff": 2996.3338685571907,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      },
      {
        "activeForUhc": false,
        "allowedInterventions": [
          "",
          ""
        ],
        "applicableSchemes": [
          "string",
          "string"
        ],
        "authInterventionId": 2248,
        "code": "string",
        "dispenseMedication": "string",
        "fallBackKephLevelTariff": 8490.026837467858,
        "fund": "string",
        "id": 7068,
        "interventionCombinations": [
          "",
          ""
        ],
        "kephLevelTarrif": 6649.644325054771,
        "name": "string",
        "needsPreauth": false,
        "numberOfDaysToFallback": 5294,
        "overallTariff": 2373.4566640876697,
        "packageCombinations": [
          "",
          ""
        ],
        "paymentMechanism": "string",
        "preauthFinalised": false,
        "prescriptionMedication": "string",
        "requiresSurgicalPreauth": false,
        "standaloneInterventions": [
          "",
          ""
        ],
        "subBenefitCode": "string",
        "supportedScheme": "string"
      }
    ],
    "isBiometricsDischargeAuthorization": false,
    "isComplete": false,
    "isElective": true,
    "isOpen": true,
    "label": "string",
    "lastSuccessfulPushToShr": "string",
    "lastSuccessfulResponseFromShr": "string",
    "lastUnsuccessfulPushToShr": "string",
    "lastUnsuccessfulResponseFromShr": "string",
    "needsPreauth": true,
    "notes": "string",
    "overallPreauthFinalised": false,
    "parentAuthorization": "string",
    "parentPreauth": "string",
    "parentType": "string",
    "payerAuthorization": [
      "",
      ""
    ],
    "payerName": "string",
    "payerSladeCode": 7333,
    "preauthIds": [
      7623,
      5550
    ],
    "preauthTypes": {
      "key_0": "string"
    },
    "provider": 2619,
    "providerFid": "string",
    "providerName": "string",
    "replicated": "string",
    "requestedBy": "string",
    "sentToShr": false,
    "sessionType": "string",
    "shaGuid": "string",
    "shaVerificationRequest": "string",
    "shaVerificationRequestId": "string",
    "shrPushRetryCount": 3032,
    "status": "string",
    "token": "string",
    "workStationId": "string"
  },
  "beneficiaryDetails": {
    "DoB": "string",
    "beneficiaryCode": "string",
    "beneficiaryId": 4912,
    "categoryCode": "string",
    "categoryName": "string",
    "firstName": "string",
    "gender": "string",
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "lastName": "string",
    "otherNames": "string",
    "schemeCode": "UHC",
    "schemeName": "string"
  },
  "carcinomaStaging": "string",
  "clinicalIndications": "string",
  "comorbidity": "string",
  "conditionCause": "string",
  "conditionEmploymentRelated": true,
  "conditionOtherRelated": false,
  "costPerSession": "string",
  "countdown": 5867,
  "createdByName": "string",
  "description": "string",
  "doctorApproved": true,
  "doctorReviewStatus": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "interventionCode": "string",
  "interventionData": {
    "code": "string",
    "fallBackKephLevelTariff": 5173.905321604757,
    "guid": "string",
    "id": 2318,
    "kephLevelTarrif": 770.9450121602334,
    "name": "string",
    "numberOfDaysToFallback": 7369,
    "overallTariff": 4248.689243522643,
    "paymentMechanism": "string",
    "status": "string"
  },
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "isOncology": false,
  "isOptical": true,
  "isRadiology": true,
  "isRenal": false,
  "isRequestPhase": true,
  "isResponsePhase": false,
  "isSurgical": false,
  "lengthOfStay": 9051,
  "memberIdentifier": "string",
  "memberIsVip": false,
  "memberIsVvip": false,
  "memberName": "string",
  "memberScheme": "string",
  "metastases": "string",
  "needsDoctorApproval": true,
  "numberOfPreauthDoctorsRequired": 9574,
  "otherMetastases": "string",
  "payerIdentifier": "string",
  "payerInvoiceNo": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachment": 5055,
      "attachmentType": "MEDICAL_REPORT",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 4905,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    },
    {
      "attachment": 1211,
      "attachmentType": "DISCHARGE_SUMMARY",
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "contentType": "string",
      "description": "string",
      "guid": "string",
      "id": 6297,
      "interventionCode": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 977,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    },
    {
      "authorizationIntervention": "string",
      "description": "string",
      "guid": "string",
      "id": 3484,
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "preauthDiagnosisType": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "siteCode": "string",
      "siteCodeType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 7134,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 4906,
        "bpHduBedCapacity": 7170,
        "bpIcuBedCapacity": 6781,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 7273,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 5188,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": false,
            "businessPartner": "",
            "canSendComm": false,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 6352,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 5031,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 2350.2547194832914,
        "longitude": 5062.879675259087,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8118,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 5648,
      "isHospitalDoctor": true,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 7970,
      "status": "string"
    },
    {
      "doctorProfile": {
        "active": false,
        "adminEmail": "string",
        "allowedDoctorApprovalMedium": "string",
        "applicationNumber": "string",
        "applicationStatus": "string",
        "authFactors": {
          "key_0": 5358,
          "key_1": "string"
        },
        "baseCurrencyCode": "string",
        "bpBabyCotCapacity": 7247,
        "bpHduBedCapacity": 6697,
        "bpIcuBedCapacity": 9366,
        "bpLicensingBody": "string",
        "bpNormalBedCapacity": 483,
        "bpRegistrationNumber": "string",
        "bpType": "string",
        "contacts": [
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 8413,
            "isConfirmed": true,
            "replicated": "string",
            "role": "string"
          },
          {
            "active": true,
            "businessPartner": "",
            "canSendComm": true,
            "contactName": "string",
            "contactType": "string",
            "contactValue": "string",
            "deactivationReason": "string",
            "guid": "string",
            "id": 2681,
            "isConfirmed": false,
            "replicated": "string",
            "role": "string"
          }
        ],
        "contractStatus": "string",
        "country": "string",
        "econtractingDone": true,
        "guid": "string",
        "id": 569,
        "identifiers": [
          "",
          ""
        ],
        "latitude": 6094.015561930364,
        "longitude": 8986.786270133978,
        "name": "string",
        "operationalStatus": "string",
        "practitionerCadre": "string",
        "practitionerDisciplineName": "string",
        "practitionerGender": "string",
        "practitionerIdNumber": "string",
        "practitionerIdType": "string",
        "practitionerInHealthWorkerRegistry": true,
        "practitionerLicenceNumber": "string",
        "practitionerLicenceStart": "string",
        "practitionerLicenceType": "string",
        "practitionerLicenceValidity": "string",
        "practitionerLicenseBody": "string",
        "practitionerLicenseStatus": "string",
        "practitionerPostalAddress": "string",
        "practitionerQualifications": "string",
        "practitionerRegistrationNumber": "string",
        "practitionerRegistryId": "string",
        "practitionerSpecialty": "string",
        "practitionerSubSpecialty": "string",
        "practitionerType": "string",
        "replicated": "string",
        "sladeCode": 8678,
        "specialty": "string",
        "suspendedByEmail": "string",
        "suspendedByName": "string",
        "suspendedDate": "string",
        "suspensionReasonType": "string",
        "suspensionReasonTypeText": "string",
        "taxIdentifier": "string",
        "updateBankDetails": true,
        "updateLicenseDetails": false
      },
      "doctorReviewStatus": "string",
      "doctorType": "string",
      "guid": "string",
      "hospitalDoctorName": "string",
      "id": 2877,
      "isHospitalDoctor": false,
      "name": "string",
      "notes": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "sladeCode": 843,
      "status": "string"
    }
  ],
  "preauthFlags": [
    "",
    ""
  ],
  "preauthItems": [
    {
      "approvedAmount": 3943.764477869045,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 4216.2646638380165,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 5165.1439790077,
      "guid": "string",
      "id": 644,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "UHC",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 6606.9827456073035
    },
    {
      "approvedAmount": 1816.5592024473676,
      "approvedBy": "string",
      "approvedByName": "string",
      "approvedQuantity": "string",
      "approvedUnitPrice": 6763.6148939774275,
      "category": "string",
      "chargeDate": "string",
      "cmCode": "string",
      "description": "string",
      "estimatedAmount": 4230.255506827833,
      "guid": "string",
      "id": 2417,
      "intervention": "string",
      "interventionCode": "string",
      "interventionName": "string",
      "name": "string",
      "payerInvoiceLineNo": "string",
      "providerCurrency": "string",
      "quantity": "string",
      "replicated": "string",
      "requestedBy": "string",
      "requestedByName": "string",
      "requestedOn": "string",
      "respondedBy": "string",
      "respondedByName": "string",
      "respondedOn": "string",
      "responseNote": "string",
      "schemeCode": "PMF",
      "schemeName": "string",
      "status": "string",
      "unitPrice": 8119.894554941027
    }
  ],
  "preauthNotes": [
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4106,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    },
    {
      "author": "string",
      "authorEmail": "string",
      "authorName": "string",
      "guid": "string",
      "id": 4116,
      "note": "string",
      "organisationName": "string",
      "replicated": "string",
      "source": "string"
    }
  ],
  "preauthType": "string",
  "providerConsent": true,
  "providerCurrency": "string",
  "providerDetails": {
    "active": false,
    "bpLevel": "string",
    "businessPartnerId": 4790,
    "guid": "string",
    "identifiers": [
      {
        "identifier": "string",
        "identifierType": "string"
      },
      {
        "identifier": "string",
        "identifierType": "string"
      }
    ],
    "name": "string",
    "nationalIdentifier": "string",
    "sladeCode": 5777
  },
  "providerName": "string",
  "providerNotificationEmail": "string",
  "reasonForAcuteDialysis": "string",
  "reasonForSelectingOther": "string",
  "replicated": "string",
  "requestExtraData": {
    "subType": "string"
  },
  "responseExtraData": "string",
  "serviceEnd": "string",
  "serviceStart": "string",
  "sessionExpectedDate": "string",
  "sessionType": "string",
  "sessionsFrequency": "string",
  "sessionsRequired": 184,
  "status": "string",
  "submissionDateIn_EAT": "string",
  "token": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541,
  "updatedByName": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### Request Doctor Consent

#### POST Send doctor request

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/doctor-consent`

Initiates a doctor consent request to request approval from a doctor

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "identification_number": "",
  "request_type": "PREAUTH_DOCTOR_APPROVAL_REQUEST", //PREAUTH_DOCTOR_APPROVAL_REQUEST
  "consent_token": "",
  "intervention_code": ""
}
```

##### Example Response: Doctor consent request initiated successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Send doctor request Copy

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/doctor-consent`

Initiates a doctor consent request to request approval from a doctor

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "created": "string",
  "emergency_claim_id": "string",
  "identification_number": "string",
  "identification_type": "National ID",
  "request_type": "PRESCRIPTION_REQUEST",
  "consent_token": "string",
  "intervention_code": "string",
  "regulation_body": "KMPDC",
  "service_type": "string"
}
```

##### Example Response: Doctor consent request initiated successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### Billing

#### POST Add Virtual Claim Line

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/lines`

Adds a new billing line item to an existing virtual claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```
{
    "consent_token": "",
    "intervention_code": "",
    "service_name":"Basic consultation",
    "service_identifier":"C/123",
    "unit_price": "200",
    "quantity": "1",
    "scheme_code": "UHC"
}
```

##### Example Response: Claim line item added successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "attributes": "string",
  "bill_from": "string",
  "bill_to": "string",
  "charge_date": "string",
  "discount": 1091.540181069619,
  "discount_reason": "string",
  "doctor_code": "string",
  "doctor_name": "string",
  "id": "string",
  "intervention_code": "string",
  "invoice": "string",
  "is_active": true,
  "is_cancellation": false,
  "is_return": true,
  "item_code": "string",
  "item_name": "string",
  "line_copay": 7964.665016899744,
  "line_net_amount": 6432.459097533194,
  "line_number": "string",
  "line_total_amount": 7157.019290868811,
  "linked_invoice_line": "string",
  "map_request": "string",
  "map_request_description": "string",
  "mapped_slade_code": "string",
  "nhif_rebate_amount": 8200.322205134642,
  "patient_discount_amount": 9454.393032336238,
  "patient_net_price": 4228.661575449293,
  "pmf_line_status": "string",
  "quantity": 1777.3093901470304,
  "scheme_code": "string",
  "scheme_name": "string",
  "sponsor_net_price": 9786.987559247484,
  "uhc_exceeded": false,
  "unit": "string",
  "unit_price": 4013.3611116075963
}
```

##### Example Response: Bad Request - Missing required fields or invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Add Combined Billing details

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/lines`

Adds a new billing line item to an existing virtual claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text | <p>Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.</p>
 |
| intervention_code |  | text | <p>Intervention code(s) for the service scheduled to be offered</p>
 |
| charge_date | 2026-02-27T15:30:00+03:00 | text | <p>[Optional] ISO timestamp of the charge date</p>
 |
| service_name | Basic consultation | text | <p>Unit price of the service</p>
 |
| service_identifier | CON/234 | text | <p>Quantity of the service</p>
 |
| unit_price | 100 | text | <p>Optional. Options: PMF, UHC</p>
 |
| quantity | 1 | text | <p>List of ICD-11 diagnosis codes related to the service</p>
 |
| scheme_name | UHC | text | <p>List of attachments for the claim. With each attachment as an object containing document title, type, and file field name for upload.</p>
 |
| diagnoses | [" 5B5K.0"] | text | <p>The actual file to be uploaded for the attachment. The field name corresponds to the <code>file_field_name</code> specified in the <code>attachments</code> array.</p>
 |
| attachments | [{"document_title": "Claim form", "document_type": "INVOICE","file_field_name": "attachments_0_file_blob"}] | text |  |
| attachments_0_file_blob | /home/clifford-ouma/SIL-Tech-Work/SHA repos/Benefits-Coverage.jpg | file | <p>The actual file to be uploaded for the attachment. The field name corresponds to the <code>file_field_name</code> specified in the <code>attachments</code> array.</p>
 |

##### Example Response: Claim line item added successfully Copy (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Content-Length | 500 |
| Connection | keep-alive |
| Traceparent | 00-ef01a4e9ad1c674e8dc99097cb61e20b-c14227f7d5adc2d9-01 |
| X-Request-Id | req-1772194036750850645 |
| Date | Fri, 27 Feb 2026 12:07:20 GMT |
| Server | APISIX/3.13.0 |

```json
{
  "id": "f3e5ab98-3352-4df0-8880-4754ce6bc68d",
  "item_code": "CON/234",
  "item_name": "Basic consultation",
  "invoice": "9784f7a9-9277-4c43-96f5-71970b9cba2f",
  "intervention_code": "SHA-18-002",
  "line_total_amount": "100",
  "line_net_amount": "100",
  "quantity": 1,
  "unit": "UNIT",
  "unit_price": "100",
  "is_active": true,
  "is_cancellation": false,
  "is_return": false,
  "uhc_exceeded": false,
  "charge_date": "2026-02-27T15:07:18.260175+03:00",
  "line_number": "",
  "scheme_code": "UHC",
  "scheme_name": "Social Health Authority",
  "discount": "0"
}
```

##### Example Response: Bad Request - Missing required fields or invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Add Virtual Claim Attachment

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/attachments`

Adds an attachment to an existing virtual claim

**Auth:** `bearer`

**Request Body:**

**Body (form-data):**

| Key | Value | Type | Description |
|---|---|---|---|
| consent_token |  | text | <p>Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.</p>
 |
| document_type | DISCHARGE_SUMMARY | text | <p>Type of document being uploaded  Options: ['CLAIM_FORM', 'PREAUTH_FORM','DISCHARGE_SUMMARY', 'PRESCRIPTION', 'LAB_ORDER', 'INVOICE', 'BIO_DETAILS', 'IMAGING_ORDER', 'OTHER', 'FINAL_BILL', 'LAB_RESULTS', 'DEATH_NOTICE', 'THEATRE_NOTES']</p>
 |
| intervention_code |  | text | <p>Intervention code associated with the attachment</p>
 |
| file_blob | /home/clifford-ouma/SIL-Tech-Work/SHA repos/Benefits-Coverage.jpg | file | <p>FIle upload field for the attachment</p>
 |

##### Example Response: Claim attachment added successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "attachment": "string",
  "attachment_type": "string",
  "claim": "string",
  "data": "string",
  "debug_data": "string",
  "description": "string",
  "id": "string",
  "intervention_code": "string",
  "last_retry": "string",
  "retry_count": 5618,
  "title": "string"
}
```

##### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Add Claim Diagnosis

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/diagnoses`

Adds a diagnosis to an existing virtual claim for a specific intervention

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "", // Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.
  "icd_code": "1F44", //ICD-11 diagnosis code
  "intervention_code": "" //Intervention code for the service scheduled to be offered
}
```

##### Example Response: diagnosis added successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "claim": "string",
  "claim_diagnosis_id": 99,
  "diagnosis": "string",
  "diagnosis_code": "string",
  "diagnosis_name": "string",
  "edi_claim_diagnosis_guid": "string",
  "edi_claim_diagnosis_replicated": "string",
  "intervention_code": "string",
  "is_flagged_diagnosis": true,
  "is_inpatient": false,
  "original_visit_date": "string",
  "patient_number": "string",
  "recorded_on": "string",
  "site_code": "string",
  "site_code_type": "string",
  "visit_number": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### PATCH Remove Virtual Claim Line

`PATCH https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/lines`

Remove a line item from an existing virtual claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "", // Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.
  "line_guid": "a5b0d653-1619-43ce-8f65-f97e7cfff88a" // ID of the line to be removed
}
```

##### Example Response: Claim line removed successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### PATCH Edit Virtual Claim Line

`PATCH https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/lines/edit`

Edit an existing line item in a virtual claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "claim_line_id": "string",
  "quantity": 5392,
  "scheme_code": "string",
  "unit_price": "string"
}
```

##### Example Response: Claim line edited successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "attributes": "string",
  "bill_from": "string",
  "bill_to": "string",
  "charge_date": "string",
  "discount": 1091.540181069619,
  "discount_reason": "string",
  "doctor_code": "string",
  "doctor_name": "string",
  "id": "string",
  "intervention_code": "string",
  "invoice": "string",
  "is_active": true,
  "is_cancellation": false,
  "is_return": true,
  "item_code": "string",
  "item_name": "string",
  "line_copay": 7964.665016899744,
  "line_net_amount": 6432.459097533194,
  "line_number": "string",
  "line_total_amount": 7157.019290868811,
  "linked_invoice_line": "string",
  "map_request": "string",
  "map_request_description": "string",
  "mapped_slade_code": "string",
  "nhif_rebate_amount": 8200.322205134642,
  "patient_discount_amount": 9454.393032336238,
  "patient_net_price": 4228.661575449293,
  "pmf_line_status": "string",
  "quantity": 1777.3093901470304,
  "scheme_code": "string",
  "scheme_name": "string",
  "sponsor_net_price": 9786.987559247484,
  "uhc_exceeded": false,
  "unit": "string",
  "unit_price": 4013.3611116075963
}
```

##### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Resubmit Claim

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/resubmit`

Resubmit a previously failed or rejected claim line for processing

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": ""
}
```

##### Example Response: Claim line resubmitted successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "claim_line_id": "string",
  "message": "string",
  "resubmitted_at": "string",
  "status": "string"
}
```

##### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### PATCH Remove Virtual Claim Attachment

`PATCH https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/attachments`

Remove an attachment from an existing virtual claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "attachment_id": "679f0551-5e9c-4ee7-965c-4e57570c2b24", // Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.
  "consent_token": "",
  "intervention_code": "" // Code of the intervention related to the diagnosis
}
```

##### Example Response: Claim attachment removed successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Preview Provider Claim

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/preview`

Preview the details of a virtual claim before submission

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "" // Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.
}
```

##### Example Response: Claim preview retrieved successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "claim_attachments": [
    {
      "attachment": "string",
      "attachment_type": "string",
      "claim": "string",
      "data": "string",
      "debug_data": "string",
      "description": "string",
      "id": "string",
      "intervention_code": "string",
      "last_retry": "string",
      "retry_count": 7056,
      "title": "string"
    },
    {
      "attachment": "string",
      "attachment_type": "string",
      "claim": "string",
      "data": "string",
      "debug_data": "string",
      "description": "string",
      "id": "string",
      "intervention_code": "string",
      "last_retry": "string",
      "retry_count": 892,
      "title": "string"
    }
  ],
  "claim_attachments_count": 4035,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 9900,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": true,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3917,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "created_by_name": "string",
  "diagnoses_count": 6756,
  "id": "string",
  "interventions": [
    {
      "accrued_per_diem_amount": 66.07267494979752,
      "accrued_per_diem_days": 6003,
      "active_for_uhc": true,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 4573.744894754599,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": false,
      "keph_level_tarrif": 3508.4588073982827,
      "preauth_exist": true,
      "requires_surgical_preauth": true,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 7504,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 2265.607541515542,
      "accrued_per_diem_days": 1395,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 5382.00456174125,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": false,
      "keph_level_tarrif": 5609.65571334904,
      "preauth_exist": false,
      "requires_surgical_preauth": true,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 2316,
      "switched_lines_retained": true,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 5338,
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 4064.431414977112,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "REJECTED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 4561.7689539544635,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 6665,
          "intervention_code": "string",
          "invoice": 4499,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 92.85798475865859,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 6014,
          "intervention_code": "string",
          "invoice": 6853,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6643,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 117,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9487.990599882303,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8663.23486543206,
          "line_net_amount": 4844.368148545553,
          "line_number": "string",
          "line_total_amount": 90.11107512319371,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 5631.327031309652,
          "patient_discount_amount": 5758.448630055,
          "patient_net_price": 9398.127421076511,
          "pmf_line_status": "string",
          "quantity": 570.5179566620644,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 8326.155421231653,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7309.105174317851
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 1321.589350409389,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 1021.2933119784284,
          "line_net_amount": 5986.865299066823,
          "line_number": "string",
          "line_total_amount": 6796.85788746758,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4155.254070103556,
          "patient_discount_amount": 3878.3936461226176,
          "patient_net_price": 611.497806494361,
          "pmf_line_status": "string",
          "quantity": 4006.9132579442644,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6264.540256316708,
          "uhc_exceeded": false,
          "unit": "string",
          "unit_price": 7707.47442549854
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 432.66443862179483,
      "total_inv_copay": 2169.2523743341117,
      "total_inv_discount": 5032.748841983703,
      "total_inv_net_amount": 3274.940774047368,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 3816.8188333101693,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 811.3838607551882,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 2111,
          "intervention_code": "string",
          "invoice": 9822,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 9684.10147135562,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8229,
          "intervention_code": "string",
          "invoice": 6466,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 8669,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3465,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 7143.138830296414,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 4991.166342712155,
          "line_net_amount": 9779.56168255966,
          "line_number": "string",
          "line_total_amount": 3102.739395850862,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 2205.9424212865774,
          "patient_discount_amount": 8359.547791014422,
          "patient_net_price": 3775.466226465658,
          "pmf_line_status": "string",
          "quantity": 7267.361363114564,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7668.179336595426,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 6955.902047057183
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 6253.970181981081,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8242.464830157212,
          "line_net_amount": 3901.6632200640024,
          "line_number": "string",
          "line_total_amount": 4854.881114727678,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 2295.0564052824298,
          "patient_discount_amount": 5428.590140394225,
          "patient_net_price": 7798.48999751013,
          "pmf_line_status": "string",
          "quantity": 8585.578483397736,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 4822.359465747759,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 3354.519335559554
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 338.46865370267267,
      "total_inv_copay": 353.2626521648341,
      "total_inv_discount": 2656.297781208885,
      "total_inv_net_amount": 1728.2476235598199,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_negative": false,
  "is_zero": true,
  "member_number": "string",
  "number_of_invoices": 4615,
  "patient_name": "string",
  "patient_number": "string",
  "provider_name": "string",
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 2381.4636940422915,
  "total_claim_copay": 6652.41494549091,
  "total_claim_discount": 7826.083304451472,
  "total_claim_net_amount": 9710.89433385431,
  "total_claim_splits": 9071.416088903452,
  "visit_end": "string",
  "visit_start": "string"
}
```

##### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### GET Preview Payer Claim

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/preview/payer?provider_claim_no=INV/13545/70440`

Preview how a claim will appear to the payer before submission

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: Payer claim preview retrieved successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "attachments_count": 8159,
  "claim_attachments": [
    {
      "attachment": "string",
      "attachment_type": "string",
      "claim": "string",
      "data": "string",
      "debug_data": "string",
      "description": "string",
      "id": "string",
      "intervention_code": "string",
      "last_retry": "string",
      "retry_count": 6599,
      "title": "string"
    },
    {
      "attachment": "string",
      "attachment_type": "string",
      "claim": "string",
      "data": "string",
      "debug_data": "string",
      "description": "string",
      "id": "string",
      "intervention_code": "string",
      "last_retry": "string",
      "retry_count": 1980,
      "title": "string"
    }
  ],
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 1737,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": true,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 186,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": true,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_number": "string",
  "copay_amount": 537.101349514999,
  "diagnoses_count": 2580,
  "discount_amount": 3214.5500929632285,
  "estimated_processing_time": "string",
  "id": "string",
  "interventions": [
    {
      "accrued_per_diem_amount": 7339.765853242024,
      "accrued_per_diem_days": 2046,
      "active_for_uhc": true,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6702.36724029738,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": false,
      "keph_level_tarrif": 5927.742541068468,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 3081,
      "switched_lines_retained": false,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 1658.3620139541865,
      "accrued_per_diem_days": 8869,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 5948.157767716007,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 54.162603774488005,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 7702,
      "switched_lines_retained": true,
      "workflow_state": "string"
    }
  ],
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 4956.066249831641,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 6210.702181039925,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 5380,
          "intervention_code": "string",
          "invoice": 6036,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4747.607868306994,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 333,
          "intervention_code": "string",
          "invoice": 7769,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2896,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 4528,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 7969.099805558973,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6286.828709544115,
          "line_net_amount": 5415.312992009897,
          "line_number": "string",
          "line_total_amount": 95.08355621054676,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 9768.505450343619,
          "patient_discount_amount": 5052.602332524425,
          "patient_net_price": 1295.9196543846008,
          "pmf_line_status": "string",
          "quantity": 9055.222778253114,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 8166.429674629485,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 2598.675619029447
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 7334.0388423269305,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 5631.174611369676,
          "line_net_amount": 1820.5787200217128,
          "line_number": "string",
          "line_total_amount": 5653.4765889895525,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7121.018980154152,
          "patient_discount_amount": 3124.789912716708,
          "patient_net_price": 9590.267092889411,
          "pmf_line_status": "string",
          "quantity": 2744.0595219730058,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 2351.320344273171,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 8247.424714673001
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 6278.949082592125,
      "total_inv_copay": 5508.40995614728,
      "total_inv_discount": 1889.5562200735694,
      "total_inv_net_amount": 1602.2825305865563,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 2807.823231316786,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8022.198375042069,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1656,
          "intervention_code": "string",
          "invoice": 1113,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 419.42963294984816,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 3451,
          "intervention_code": "string",
          "invoice": 3382,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 7662,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 9620,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 1313.1169245966023,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 3794.6033800334258,
          "line_net_amount": 8606.755442625796,
          "line_number": "string",
          "line_total_amount": 3149.991616432688,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 2748.061448833001,
          "patient_discount_amount": 4201.995073119891,
          "patient_net_price": 7559.840013709165,
          "pmf_line_status": "string",
          "quantity": 424.99281912937727,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 1926.6480330631318,
          "uhc_exceeded": false,
          "unit": "string",
          "unit_price": 4829.426348805892
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 2858.262939091967,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 5807.250015324316,
          "line_net_amount": 1173.3295957183864,
          "line_number": "string",
          "line_total_amount": 2690.671169623664,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 808.0907655247227,
          "patient_discount_amount": 5868.442343995255,
          "patient_net_price": 6906.021898237283,
          "pmf_line_status": "string",
          "quantity": 9968.006865929914,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 3392.700489995748,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4814.854293968358
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 9143.223320840385,
      "total_inv_copay": 8367.420593281147,
      "total_inv_discount": 865.9962027585766,
      "total_inv_net_amount": 8624.270598989204,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "member_number": "string",
  "net_amount": 3171.675575686503,
  "number_of_invoices": 6813,
  "patient_name": "string",
  "patient_number": "string",
  "payer_claim_status": "string",
  "payer_processing_notes": "string",
  "provider_name": "string",
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_amount": 9481.243191838284,
  "visit_end": "string",
  "visit_start": "string"
}
```

##### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### PATCH Remove Claim Diagnosis

`PATCH https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/diagnoses`

Remove a diagnosis from an existing virtual claim

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "", // Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint.
  "icd_code": "1F44", // ICD-10 or ICD-11 diagnosis code to be removed
  "intervention_code": "" // Code of the intervention related to the diagnosis
}
```

##### Example Response: Claim diagnosis removed successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "data": {
    "key_0": "string",
    "key_1": "string"
  },
  "message": "string"
}
```

##### Example Response: Bad Request - Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### ePrescriptions

#### POST Create prescription

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/prescriptions`

Creates a new prescription for a patient

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "",
  "intervention_code": "",
  "items": [
    {
      "additional_instruction": "string",
      "dose_quantity": 888,
      "dose_unit": "string",
      "duration": 8007,
      "duration_unit": "string",
      "end_date": "string",
      "frequency": 8327,
      "generic_concept_code": "string",
      "needs_refill": false,
      "patient_instruction": "string",
      "period_unit": "string",
      "refill_count": 9724,
      "start_date": "string"
    }
  ],
  "identification_number": "",
  "identification_type": "",
  "regulation_body": "KMPDC"
}
```

##### Example Response: Prescription created successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "authorization": {
    "authCode": "string",
    "beneficiaryCode": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "expiry": "string",
    "guid": "string",
    "id": 9507,
    "payerName": "string",
    "providerName": "string",
    "replicated": "string",
    "status": "string",
    "token": "string"
  },
  "beneficiary": {
    "age": 2956,
    "beneficiaryCode": "string",
    "contacts": [
      {
        "active": false,
        "contactType": "string",
        "contactValue": "string",
        "id": 3583,
        "isMainContact": true,
        "ownerType": "string"
      },
      {
        "active": true,
        "contactType": "string",
        "contactValue": "string",
        "id": 8507,
        "isMainContact": true,
        "ownerType": "string"
      }
    ],
    "dob": "string",
    "gender": "string",
    "guid": "string",
    "id": 4949,
    "identifiers": [
      {
        "id": 1744,
        "identifier": "string",
        "identifierType": "string",
        "isMainIdentifier": true
      },
      {
        "id": 5944,
        "identifier": "string",
        "identifierType": "string",
        "isMainIdentifier": true
      }
    ],
    "isPrincipal": false,
    "mainIdentifier": "string",
    "names": "string"
  },
  "code": "string",
  "doctorReviewStatus": "string",
  "dosage": [
    {
      "doseQuantity": "string",
      "doseUnit": "string",
      "duration": "string",
      "durationUnit": "string",
      "endDate": "string",
      "frequency": 2375,
      "guid": "string",
      "id": 5246,
      "medication": "string",
      "medicationIdentifier": "string",
      "medicationPrice": 9611.845419325911,
      "patientInstruction": "string",
      "periodUnit": "string",
      "practitionerId": "string",
      "prescription": 2766,
      "replicated": "string",
      "route": "string",
      "routeCode": "string",
      "startDate": "string"
    },
    {
      "doseQuantity": "string",
      "doseUnit": "string",
      "duration": "string",
      "durationUnit": "string",
      "endDate": "string",
      "frequency": 2255,
      "guid": "string",
      "id": 7973,
      "medication": "string",
      "medicationIdentifier": "string",
      "medicationPrice": 302.97208102873395,
      "patientInstruction": "string",
      "periodUnit": "string",
      "practitionerId": "string",
      "prescription": 4188,
      "replicated": "string",
      "route": "string",
      "routeCode": "string",
      "startDate": "string"
    }
  ],
  "guid": "string",
  "id": 5564,
  "intervention": {
    "accessPoint": "string",
    "active": true,
    "activeForUhc": false,
    "applicableFacilityOwnership": "string",
    "applicableGender": "string",
    "applicableSchemes": [
      "string",
      "string"
    ],
    "benefit": 4923,
    "benefitCode": "string",
    "benefitName": "string",
    "code": "string",
    "coverageLevel": "string",
    "fund": "string",
    "guid": "string",
    "id": 1897,
    "levelsApplicable": [
      "string",
      "string"
    ],
    "name": "string",
    "packageCombinations": [
      "string",
      "string"
    ],
    "parentBenefitCode": "string",
    "parentBenefitName": "string",
    "paymentMechanism": "string",
    "replicated": "string",
    "status": "string",
    "supportedScheme": "string"
  },
  "replicated": "string",
  "status": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### GET View prescriptions

`GET https://ilm-dev.dha.go.ke/uat-middleware/api/v1/prescriptions?consent_token=string`

Fetches a preview of a prescription using a consent token

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Accept | application/json |

##### Example Response: Prescription preview fetched successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "authorization": {
    "authCode": "string",
    "beneficiaryCode": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "expiry": "string",
    "guid": "string",
    "id": 9507,
    "payerName": "string",
    "providerName": "string",
    "replicated": "string",
    "status": "string",
    "token": "string"
  },
  "beneficiary": {
    "age": 2956,
    "beneficiaryCode": "string",
    "contacts": [
      {
        "active": false,
        "contactType": "string",
        "contactValue": "string",
        "id": 3583,
        "isMainContact": true,
        "ownerType": "string"
      },
      {
        "active": true,
        "contactType": "string",
        "contactValue": "string",
        "id": 8507,
        "isMainContact": true,
        "ownerType": "string"
      }
    ],
    "dob": "string",
    "gender": "string",
    "guid": "string",
    "id": 4949,
    "identifiers": [
      {
        "id": 1744,
        "identifier": "string",
        "identifierType": "string",
        "isMainIdentifier": true
      },
      {
        "id": 5944,
        "identifier": "string",
        "identifierType": "string",
        "isMainIdentifier": true
      }
    ],
    "isPrincipal": false,
    "mainIdentifier": "string",
    "names": "string"
  },
  "code": "string",
  "doctorReviewStatus": "string",
  "dosage": [
    {
      "doseQuantity": "string",
      "doseUnit": "string",
      "duration": "string",
      "durationUnit": "string",
      "endDate": "string",
      "frequency": 2375,
      "guid": "string",
      "id": 5246,
      "medication": "string",
      "medicationIdentifier": "string",
      "medicationPrice": 9611.845419325911,
      "patientInstruction": "string",
      "periodUnit": "string",
      "practitionerId": "string",
      "prescription": 2766,
      "replicated": "string",
      "route": "string",
      "routeCode": "string",
      "startDate": "string"
    },
    {
      "doseQuantity": "string",
      "doseUnit": "string",
      "duration": "string",
      "durationUnit": "string",
      "endDate": "string",
      "frequency": 2255,
      "guid": "string",
      "id": 7973,
      "medication": "string",
      "medicationIdentifier": "string",
      "medicationPrice": 302.97208102873395,
      "patientInstruction": "string",
      "periodUnit": "string",
      "practitionerId": "string",
      "prescription": 4188,
      "replicated": "string",
      "route": "string",
      "routeCode": "string",
      "startDate": "string"
    }
  ],
  "guid": "string",
  "id": 5564,
  "intervention": {
    "accessPoint": "string",
    "active": true,
    "activeForUhc": false,
    "applicableFacilityOwnership": "string",
    "applicableGender": "string",
    "applicableSchemes": [
      "string",
      "string"
    ],
    "benefit": 4923,
    "benefitCode": "string",
    "benefitName": "string",
    "code": "string",
    "coverageLevel": "string",
    "fund": "string",
    "guid": "string",
    "id": 1897,
    "levelsApplicable": [
      "string",
      "string"
    ],
    "name": "string",
    "packageCombinations": [
      "string",
      "string"
    ],
    "parentBenefitCode": "string",
    "parentBenefitName": "string",
    "paymentMechanism": "string",
    "replicated": "string",
    "status": "string",
    "supportedScheme": "string"
  },
  "replicated": "string",
  "status": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### DELETE Remove Prescription doctor

`DELETE https://ilm-dev.dha.go.ke/uat-middleware/api/v1/prescriptions/doctors`

Removes a doctor associated with a prescription using the provided details

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "string",
  "intervention_code": "string",
  "practitioner_registration_number": "string"
}
```

##### Example Response: Doctor prescription successfully removed (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "key_0": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Create dispense

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/prescriptions/dispenses`

Creates a dispense for a prescription using the provided dispense details

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "actual_products": [
    {
      "actual_product_code": "string",
      "medication_price": 5599.208237013804,
      "total_quantity": 4958
    },
    {
      "actual_product_code": "string",
      "medication_price": 6766.45882770526,
      "total_quantity": 5652
    }
  ],
  "consent_token": "string",
  "doctors": [
    {
      "identification_number": "string",
      "identification_type": "string"
    },
    {
      "identification_number": "string",
      "identification_type": "string"
    }
  ],
  "intervention_code": "string"
}
```

##### Example Response: Dispense created successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "dispenseDosages": [
    {
      "dispense": 2006,
      "doseQuantity": 5568,
      "doseUnit": "string",
      "duration": "string",
      "durationUnit": "string",
      "endDate": "string",
      "frequency": 6287,
      "genericDosageInstruction": 6570,
      "guid": "string",
      "id": 6809,
      "medication": "string",
      "medicationIdentifier": "string",
      "medicationPrice": "string",
      "medicationRequestId": "string",
      "periodUnit": "string",
      "practitionerId": "string",
      "route": "string",
      "routeCode": "string",
      "startDate": "string",
      "status": "string",
      "totalQuantity": "string"
    },
    {
      "dispense": 5677,
      "doseQuantity": 4507,
      "doseUnit": "string",
      "duration": "string",
      "durationUnit": "string",
      "endDate": "string",
      "frequency": 8305,
      "genericDosageInstruction": 2269,
      "guid": "string",
      "id": 2367,
      "medication": "string",
      "medicationIdentifier": "string",
      "medicationPrice": "string",
      "medicationRequestId": "string",
      "periodUnit": "string",
      "practitionerId": "string",
      "route": "string",
      "routeCode": "string",
      "startDate": "string",
      "status": "string",
      "totalQuantity": "string"
    }
  ],
  "dispensingDoctors": [
    {
      "dispense": 9501,
      "id": 1040
    },
    {
      "dispense": 4034,
      "id": 1580
    }
  ],
  "id": 4197,
  "prescription": {
    "authorization": {
      "authCode": "string",
      "beneficiaryCode": "string",
      "beneficiaryName": "string",
      "beneficiaryNumber": "string",
      "expiry": "string",
      "guid": "string",
      "id": 6989,
      "payerName": "string",
      "providerName": "string",
      "replicated": "string",
      "status": "string",
      "token": "string"
    },
    "beneficiary": {
      "age": 2483,
      "beneficiaryCode": "string",
      "contacts": [
        {
          "active": true,
          "contactType": "string",
          "contactValue": "string",
          "id": 6199,
          "isMainContact": true,
          "ownerType": "string"
        },
        {
          "active": false,
          "contactType": "string",
          "contactValue": "string",
          "id": 2213,
          "isMainContact": true,
          "ownerType": "string"
        }
      ],
      "dob": "string",
      "gender": "string",
      "guid": "string",
      "id": 518,
      "identifiers": [
        {
          "id": 5472,
          "identifier": "string",
          "identifierType": "string",
          "isMainIdentifier": true
        },
        {
          "id": 1013,
          "identifier": "string",
          "identifierType": "string",
          "isMainIdentifier": false
        }
      ],
      "isPrincipal": true,
      "mainIdentifier": "string",
      "names": "string"
    },
    "code": "string",
    "doctorReviewStatus": "string",
    "dosage": [
      {
        "doseQuantity": "string",
        "doseUnit": "string",
        "duration": "string",
        "durationUnit": "string",
        "endDate": "string",
        "frequency": 9743,
        "guid": "string",
        "id": 1350,
        "medication": "string",
        "medicationIdentifier": "string",
        "medicationPrice": 2717.144317493978,
        "patientInstruction": "string",
        "periodUnit": "string",
        "practitionerId": "string",
        "prescription": 4179,
        "replicated": "string",
        "route": "string",
        "routeCode": "string",
        "startDate": "string"
      },
      {
        "doseQuantity": "string",
        "doseUnit": "string",
        "duration": "string",
        "durationUnit": "string",
        "endDate": "string",
        "frequency": 7429,
        "guid": "string",
        "id": 5609,
        "medication": "string",
        "medicationIdentifier": "string",
        "medicationPrice": 2917.6756386919988,
        "patientInstruction": "string",
        "periodUnit": "string",
        "practitionerId": "string",
        "prescription": 126,
        "replicated": "string",
        "route": "string",
        "routeCode": "string",
        "startDate": "string"
      }
    ],
    "guid": "string",
    "id": 8604,
    "intervention": {
      "accessPoint": "string",
      "active": false,
      "activeForUhc": true,
      "applicableFacilityOwnership": "string",
      "applicableGender": "string",
      "applicableSchemes": [
        "string",
        "string"
      ],
      "benefit": 2650,
      "benefitCode": "string",
      "benefitName": "string",
      "code": "string",
      "coverageLevel": "string",
      "fund": "string",
      "guid": "string",
      "id": 6346,
      "levelsApplicable": [
        "string",
        "string"
      ],
      "name": "string",
      "packageCombinations": [
        "string",
        "string"
      ],
      "parentBenefitCode": "string",
      "parentBenefitName": "string",
      "paymentMechanism": "string",
      "replicated": "string",
      "status": "string",
      "supportedScheme": "string"
    },
    "replicated": "string",
    "status": "string"
  },
  "status": "string"
}
```

##### Example Response: Invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal server error (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

### Claim Dispatch

#### POST Add Next of Kin

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/patients/next-of-kin/contacts`

Adds a patient's next of kin contact

**Auth:** `apikey`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "",
  "contact_value": "string",
  "next_of_kin_full_name": "string",
  "next_of_kin_id_number": "string",
  "next_of_kin_id_number_type": "National ID"
}
```

##### Example Response: Contact added successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "active": true,
  "beneficiary": 4043,
  "beneficiaryCode": "string",
  "beneficiaryId": 1048,
  "beneficiaryName": "string",
  "capturedAtName": "string",
  "capturedAtSladeCode": 9074,
  "contactType": "string",
  "contactValue": "string",
  "deactivationReason": "string",
  "guid": "string",
  "id": 8171,
  "isConfirmed": false,
  "isMainContact": false,
  "isVerified": false,
  "nextOfKinFullName": "string",
  "nextOfKinIdNumber": "string",
  "ownerType": "NEXT_OF_KIN",
  "pushedToCrm": true,
  "replicated": "string",
  "triggeredByUser": true
}
```

##### Example Response: Bad Request - Missing required fields or invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Close Claim

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/close`

Closes an existing claim, marking it as complete and preventing further modifications

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "cancel_reason_text": "string", // Detailed explanation of the cancellation reason
  "cancel_reason_type": "OTHER_REASONS", // Type of cancellation reason. Options: WRONG_PATIENT, NO_SERVICE_GIVEN, WRONG_BENEFIT,EXPIRED_VISIT, EXHAUSTED_BENEFIT, TIME_BARRED, OTHER_REASONS
  "consent_token": "" // Consent token for authorization. This is the authorization_code received from the Create Virtual Claim endpoint
}
```

##### Example Response: Claim closed successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3891,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": [
    "string",
    "string"
  ],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 5870.691164482871,
      "accrued_per_diem_days": 7094,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6646.849248944011,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 7208.5162770261095,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 5534,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 2597.2789443964707,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8041,
          "intervention_code": "string",
          "invoice": 3508,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6763,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3508.985115994525,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8654.044320674217,
          "line_net_amount": 3518.1966209536886,
          "line_number": "string",
          "line_total_amount": 1977.233903046156,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 775.8046085455494,
          "patient_discount_amount": 3072.522598405525,
          "patient_net_price": 25.633286331574467,
          "pmf_line_status": "string",
          "quantity": 3029.1756844549145,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 5815.985356711657,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4505.789692230175
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1491.5331699708622,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 476.68569196248177,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1889,
          "intervention_code": "string",
          "invoice": 3381,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4909.020610542014,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4960,
          "intervention_code": "string",
          "invoice": 2985,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2638,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6043,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3955.124885846184,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6909.628167663948,
          "line_net_amount": 7847.898187380973,
          "line_number": "string",
          "line_total_amount": 2623.4639765046118,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7148.8316946703435,
          "patient_discount_amount": 70.4517479002864,
          "patient_net_price": 1332.9018546973925,
          "pmf_line_status": "string",
          "quantity": 1242.8538050914394,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7815.662888632533,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 1213.6361381984862
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 4030.9852444860894,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 569.2576717126219,
          "line_net_amount": 759.858789563066,
          "line_number": "string",
          "line_total_amount": 9024.992867365747,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4876.166211666566,
          "patient_discount_amount": 2384.925613821589,
          "patient_net_price": 4643.894125807135,
          "pmf_line_status": "string",
          "quantity": 2943.148009007277,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6729.2806149874,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4657.675634689366
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 1847.9259995067432,
      "total_inv_copay": 5739.132325681544,
      "total_inv_discount": 8199.199737739917,
      "total_inv_net_amount": 3279.474443236183,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields or invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Discharge Inpatient

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/discharge`

Discharges a patient, signifying end of treatment

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
  "consent_token": "",
  "discharge_date": "string",
  "discharge_reason": "ABSCONDED",
  "invoice_number": "INV/12/345",
  "otp": ""
}
```

##### Example Response: Patient discharged successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3891,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": [
    "string",
    "string"
  ],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 5870.691164482871,
      "accrued_per_diem_days": 7094,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6646.849248944011,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 7208.5162770261095,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 5534,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 2597.2789443964707,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8041,
          "intervention_code": "string",
          "invoice": 3508,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6763,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3508.985115994525,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8654.044320674217,
          "line_net_amount": 3518.1966209536886,
          "line_number": "string",
          "line_total_amount": 1977.233903046156,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 775.8046085455494,
          "patient_discount_amount": 3072.522598405525,
          "patient_net_price": 25.633286331574467,
          "pmf_line_status": "string",
          "quantity": 3029.1756844549145,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 5815.985356711657,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4505.789692230175
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1491.5331699708622,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 476.68569196248177,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1889,
          "intervention_code": "string",
          "invoice": 3381,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4909.020610542014,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4960,
          "intervention_code": "string",
          "invoice": 2985,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2638,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6043,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3955.124885846184,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6909.628167663948,
          "line_net_amount": 7847.898187380973,
          "line_number": "string",
          "line_total_amount": 2623.4639765046118,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7148.8316946703435,
          "patient_discount_amount": 70.4517479002864,
          "patient_net_price": 1332.9018546973925,
          "pmf_line_status": "string",
          "quantity": 1242.8538050914394,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7815.662888632533,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 1213.6361381984862
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 4030.9852444860894,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 569.2576717126219,
          "line_net_amount": 759.858789563066,
          "line_number": "string",
          "line_total_amount": 9024.992867365747,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4876.166211666566,
          "patient_discount_amount": 2384.925613821589,
          "patient_net_price": 4643.894125807135,
          "pmf_line_status": "string",
          "quantity": 2943.148009007277,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6729.2806149874,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4657.675634689366
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 1847.9259995067432,
      "total_inv_copay": 5739.132325681544,
      "total_inv_discount": 8199.199737739917,
      "total_inv_net_amount": 3279.474443236183,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields or invalid request (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Submit Outpatient Claim

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/submit`

Submits a claim for both normal and emergency cases.

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
    "consent_token": "", // Consent token for authorization. This is the `authorization_code` received from the `Create Virtual Claim` endpoint.
    "invoice_number": "EV/23/12" // Unique invoice number (as used by the provider internally) for the claim being submitted
}
```

##### Example Response: Claim submitted successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3891,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": [
    "string",
    "string"
  ],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 5870.691164482871,
      "accrued_per_diem_days": 7094,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6646.849248944011,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 7208.5162770261095,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 5534,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 2597.2789443964707,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8041,
          "intervention_code": "string",
          "invoice": 3508,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6763,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3508.985115994525,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8654.044320674217,
          "line_net_amount": 3518.1966209536886,
          "line_number": "string",
          "line_total_amount": 1977.233903046156,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 775.8046085455494,
          "patient_discount_amount": 3072.522598405525,
          "patient_net_price": 25.633286331574467,
          "pmf_line_status": "string",
          "quantity": 3029.1756844549145,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 5815.985356711657,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4505.789692230175
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1491.5331699708622,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 476.68569196248177,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1889,
          "intervention_code": "string",
          "invoice": 3381,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4909.020610542014,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4960,
          "intervention_code": "string",
          "invoice": 2985,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2638,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6043,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3955.124885846184,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6909.628167663948,
          "line_net_amount": 7847.898187380973,
          "line_number": "string",
          "line_total_amount": 2623.4639765046118,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7148.8316946703435,
          "patient_discount_amount": 70.4517479002864,
          "patient_net_price": 1332.9018546973925,
          "pmf_line_status": "string",
          "quantity": 1242.8538050914394,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7815.662888632533,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 1213.6361381984862
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 4030.9852444860894,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 569.2576717126219,
          "line_net_amount": 759.858789563066,
          "line_number": "string",
          "line_total_amount": 9024.992867365747,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4876.166211666566,
          "patient_discount_amount": 2384.925613821589,
          "patient_net_price": 4643.894125807135,
          "pmf_line_status": "string",
          "quantity": 2943.148009007277,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6729.2806149874,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4657.675634689366
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 1847.9259995067432,
      "total_inv_copay": 5739.132325681544,
      "total_inv_discount": 8199.199737739917,
      "total_inv_net_amount": 3279.474443236183,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

#### POST Submit Unidentified Emergency Claim

`POST https://ilm-dev.dha.go.ke/uat-middleware/api/v1/claims/submit`

Submits a claim for both normal and emergency cases.

**Auth:** `bearer`

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |
| Accept | application/json |

**Request Body:**

```json
{
    "consent_token": "", // Consent token for authorization. This is the `authorization_code` received from the `Create Virtual Claim` endpoint.
    "invoice_number": "INV/01/01", // Unique invoice number (as used by the provider internally) for the claim being submitted
    "reason_for_unknown_patient": "string" //Optional. Used only wwwwwhen submitting emergency claims for unidentified patient
}
```

##### Example Response: Claim submitted successfully (200 OK)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    },
    {
      "claim": "string",
      "claim_diagnosis_id": 3891,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": false,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": [
    "string",
    "string"
  ],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    },
    {
      "accrued_per_diem_amount": 5870.691164482871,
      "accrued_per_diem_days": 7094,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6646.849248944011,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 7208.5162770261095,
      "preauth_exist": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 5534,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 2597.2789443964707,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 8041,
          "intervention_code": "string",
          "invoice": 3508,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6763,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3508.985115994525,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 8654.044320674217,
          "line_net_amount": 3518.1966209536886,
          "line_number": "string",
          "line_total_amount": 1977.233903046156,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 775.8046085455494,
          "patient_discount_amount": 3072.522598405525,
          "patient_net_price": 25.633286331574467,
          "pmf_line_status": "string",
          "quantity": 3029.1756844549145,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 5815.985356711657,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4505.789692230175
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    },
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1491.5331699708622,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        },
        {
          "doctor_request_status": "PENDING_DOCTOR_REVIEW",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 476.68569196248177,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 1889,
          "intervention_code": "string",
          "invoice": 3381,
          "provider_copay_no": "string"
        },
        {
          "charge_date": "string",
          "copay_amount": 4909.020610542014,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4960,
          "intervention_code": "string",
          "invoice": 2985,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2638,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        },
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 6043,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": false,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 3955.124885846184,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": true,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6909.628167663948,
          "line_net_amount": 7847.898187380973,
          "line_number": "string",
          "line_total_amount": 2623.4639765046118,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 7148.8316946703435,
          "patient_discount_amount": 70.4517479002864,
          "patient_net_price": 1332.9018546973925,
          "pmf_line_status": "string",
          "quantity": 1242.8538050914394,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 7815.662888632533,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 1213.6361381984862
        },
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 4030.9852444860894,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": true,
          "is_cancellation": false,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 569.2576717126219,
          "line_net_amount": 759.858789563066,
          "line_number": "string",
          "line_total_amount": 9024.992867365747,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 4876.166211666566,
          "patient_discount_amount": 2384.925613821589,
          "patient_net_price": 4643.894125807135,
          "pmf_line_status": "string",
          "quantity": 2943.148009007277,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 6729.2806149874,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 4657.675634689366
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 1847.9259995067432,
      "total_inv_copay": 5739.132325681544,
      "total_inv_discount": 8199.199737739917,
      "total_inv_net_amount": 3279.474443236183,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

##### Example Response: Bad Request - Missing required fields (400 Bad Request)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Unauthorized - Invalid identity (401 Unauthorized)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Forbidden - Not enough permissions (403 Forbidden)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```

##### Example Response: Internal Server Error - Service error occurred (500 Internal Server Error)

**Headers:**

| Header | Value |
|---|---|
| Content-Type | application/json |

```json
{
  "error": "string",
  "message": "string"
}
```
