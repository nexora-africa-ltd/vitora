# Consent Services APIs

_Version: `1.0.0`_
APIs for managing beneficiary consent through OTP or Biomentrics verification.

**Servers:**
- `https://ilm-dev.dha.go.ke/uat-middleware`

## Table of Contents

- [Authorizations](#authorizations)
- [Send OTP](#send-otp)
- [OTP Whitelist](#otp-whitelist)
- [Patients](#patients)

## Authorizations

Endpoints for creating and retrieving patient consent authorizations via OTP or biometrics.

### POST /api/v1/claims/authorize

**Create a new authorization (OTP or biometrics)**

Creates a new authorization by capturing patient consent via OTP or biometrics. Use the OTP strategy for standard outpatient and inpatient consent; use the biometrics strategy (eKYC or fingerprint) when the facility has a registered hardware agent. The same endpoint is used across claims creation and consent workflows.

_Tags: `Authorizations`_
_Security: `BearerAuth`_

**Request Body:**
Authorization request payload. Choose one strategy: OTP (phone-based one-time password) or Biometrics (eKYC/fingerprint via hardware agent).
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — Authorization created successfully
_Content-Type: `application/json`_
```json
{
  "authCode": "string",
  "authorizationReason": "string",
  "authorizationType": [
    "string"
  ],
  "authorizingDeviceOs": "string",
  "beneficiary": 0,
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
  "guardian": 0,
  "guid": "string",
  "id": 0,
  "isBiometricsDischargeAuthorization": false,
  "isComplete": false,
  "isElective": false,
  "isEmergency": false,
  "isOpen": false,
  "label": "string",
  "needsPreauth": false,
  "notes": "string",
  "overallPreauthFinalised": false,
  "parentAuthorization": 0,
  "parentType": "string",
  "payerName": "string",
  "payerSladeCode": 0,
  "provider": 0,
  "providerFid": "string",
  "providerName": "string",
  "requestedBy": "string",
  "sessionType": "string",
  "shaGuid": "string",
  "shaVerificationRequest": {
    "embedExpiry": 0,
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

**Response `400`** — Bad Request - Missing or invalid fields
_Content-Type: `application/json`_
```json
{
  "error": "string",
  "message": "string"
}
```

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

## Send OTP

Endpoints for sending OTP to beneficiaries.

### POST /api/v1/claims/otp

**Send OTP to patient**

Sends a One-Time Password (OTP) to a beneficiary’s registered contact. Used for verifying patient identity and obtaining consent before proceeding with certain operations like claim creation.

_Tags: `Send OTP`_
_Security: `BearerAuth`_

**Request Body:**
OTP Request
_Required._

_Content-Type: `application/json`_
```json
{
  "contact_id": "string",
  "intervention_codes": [
    "string"
  ],
  "patient_id": "string"
}
```

**Responses:**
**Response `200`** — OTP sent successfully
_Content-Type: `application/json`_
```json
{
  "message": "string"
}
```

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `401`** — Unauthorized - Invalid or missing authentication token
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

## OTP Whitelist

Endpoints for managing OTP whitelist requests for beneficiaries.

### POST /api/v1/patients/otp-whitelists

**Request OTP Whitelist**

Creates an OTP whitelist request for a beneficiary to allow using OTP for consent request under special conditions (e.g., power outage, amputee). This includes supporting attachments as proof for the whitelist reason.

_Tags: `OTP Whitelist`_
_Operation ID: `CreateOTPWhitelistRequest`_

_Security: `BearerAuth`_

**Request Body:**
Add patient request input
_Required._

_Content-Type: `application/json`_
```json
{
  "attachments": [
    {
      "document_title": "string",
      "document_type": "SUPPORT_DOCUMENT",
      "file_field_name": "string",
      "file_name": "string"
    }
  ],
  "beneficiary_cr_id": "string",
  "biometric_attempts": "string",
  "facility_fr_code": "string",
  "facility_fr_type": "string",
  "reason": "string",
  "reason_type": "OLD"
}
```

**Responses:**
**Response `200`** — OTP whitelist request created successfully
_Content-Type: `application/json`_
```json
{
  "attachments": [
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
    "string"
  ],
  "status": "string"
}
```

**Response `400`** — Bad Request - Missing required fields or invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### GET /api/v1/patients/otp-whitelists/callback

**Get OTP Whitelist Requests**

Retrieve OTP whitelist requests using a GUID or by combining `beneficiary_cr_id`, `facility_id`, and `facility_id_type`.

_Tags: `OTP Whitelist`_
_Operation ID: `getOtpWhitelistRequests`_

_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `beneficiary_cr_id` | query | `string` |  *(required)* | Patient client registry number |
| `guid` | query | `string` |  *(required)* | Unique GUID of the OTP whitelist request. |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "count": 0,
  "currentPage": 0,
  "endIndex": 0,
  "next": "string",
  "pageSize": 0,
  "previous": "string",
  "results": [
    {
      "beneficiaryCrId": "string",
      "beneficiaryName": "string",
      "biometricsAttempt": 0,
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
        }
      ],
      "status": "string"
    }
  ],
  "startIndex": 0,
  "totalPages": 0
}
```

**Response `400`** — Bad Request - Missing query parameters or invalid request input
_Content-Type: `application/json`_
```json
{
  "error": "string",
  "message": "string"
}
```

## Patients

### GET /api/v1/patients/contacts

**Get patient contacts**

Retrieves a list of contacts associated with a patient

_Tags: `Patients`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient_id` | query | `string` |  *(required)* | Patient's client registry ID |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
[
  {
    "active": false,
    "contactType": "string",
    "contactValue": "string",
    "id": 0,
    "isConfirmed": false
  }
]
```

**Response `400`** — Bad Request - Missing query parameters or invalid request input
_Content-Type: `application/json`_
