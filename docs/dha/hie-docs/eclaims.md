# eClaims and Preauth APIs

_Version: `1.0.0`_
APIs for eClaims and Preauthorization processes.

**Servers:**
- `https://ilm-dev.dha.go.ke/uat-middleware`

## Table of Contents

- [Billing](#billing)
- [Claim Dispatch](#claim-dispatch)
- [Preauth Doctor Consent](#preauth-doctor-consent)
- [Emergency](#emergency)
- [Interventions](#interventions)
- [Start Visit Consent](#start-visit-consent)
- [Eligibility](#eligibility)
- [Preauths](#preauths)
- [ePrescriptions](#eprescriptions)
- [Authorizations](#authorizations)

## Billing

Endpoints for billing and invoice management.

### POST /api/v1/claims/attachments

**Add virtual Claim Attachment**

This endpoint allows addition of an attachment associated with a claim

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Add claim attachment request input
_Required._

_Content-Type: `multipart/form-data`_
```json
{
  "consent_token": "string",
  "file_blob": "string",
  "document_type": "BIO_DETAILS",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Claim attachment added successfully
_Content-Type: `application/json`_
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
  "retry_count": 0,
  "title": "string"
}
```

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_
```json
{
  "error": "string",
  "message": "string"
}
```

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### PATCH /api/v1/claims/attachments

**Remove Virtual Claim Attachment**

Removes a specific attachment from a virtual claim.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Remove claim attachment request input
_Required._

_Content-Type: `application/json`_
```json
{
  "attachment_id": "string",
  "consent_token": "string",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Claim attachment removed successfully
_Content-Type: `application/json`_
```json
{
  "message": "string"
}
```

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/diagnoses

**Add a diagnosis to an existing virtual claim.**

Links a diagnosis to a specific intervention within a virtual claim. Uses ICD codes to capture the patient’s condition for billing and reporting purposes.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Add diagnosis request input
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "facilityID": "string",
  "facilityIDType": "string",
  "icd_code": "string",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — diagnosis added successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### PATCH /api/v1/claims/diagnoses

**Remove Virtual Claim Diagnosis**

Removes a diagnosis linked to a virtual claim for a specific beneficiary.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Remove claim diagnosis request input
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "icd_code": "string",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Claim diagnosis removed successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/lines

**Add billing line item to virtual claim.**

Adds a line item to an existing virtual claim’s invoice. Requires intervention details, pricing, and quantity to record the service or item billed.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Add claim line item request input
_Required._

_Content-Type: `multipart/form-data`_
```json
{
  "consent_token": "string",
  "intervention_code": "string",
  "unit_price": 0.0,
  "quantity": 0.0,
  "scheme_code": "string",
  "charge_date": "string",
  "diagnoses": "string",
  "attachments": "string"
}
```

**Responses:**
**Response `200`** — Claim line item added successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields or invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### PATCH /api/v1/claims/lines

**Remove Virtual Claim Line**

Removes a specific claim line from a virtual claim using its GUID.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Remove claim line request input
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "line_guid": "string"
}
```

**Responses:**
**Response `200`** — Claim line removed successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### PATCH /api/v1/claims/lines/edit

**Edit Virtual Claim Line**

Edit a virtual claim line item before resubmitting the invoice. This endpoint allows modification of  unit price and quantity of a specific line item in a virtual claim after payer review.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Edit claim line request input
_Required._

_Content-Type: `application/json`_
```json
{
  "line_id": "string",
  "quantity": 0,
  "scheme_code": "string",
  "unit_price": "string"
}
```

**Responses:**
**Response `200`** — Claim line edited successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/lines/resubmit

**Resubmit a claim line**

Resubmit a previously failed or rejected claim line for processing

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Resubmit claim line request input
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string"
}
```

**Responses:**
**Response `200`** — Claim line resubmitted successfully
_Content-Type: `application/json`_
```json
{
  "line_id": "string",
  "message": "string",
  "resubmitted_at": "string",
  "status": "string"
}
```

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/preview

**Preview Claim**

Previews a claim using the provided consent token before final submission. This allows the provider to verify claim details.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
Preview claim request input
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string"
}
```

**Responses:**
**Response `200`** — Claim preview retrieved successfully
_Content-Type: `application/json`_
```json
{
  "authorization_code": "string",
  "claim_attachments": [],
  "claim_attachments_count": 0,
  "claim_auth_status": "string",
  "claim_diagnoses": [],
  "created_by_name": "string",
  "diagnoses_count": 0,
  "id": "string",
  "interventions": [],
  "invoice_attachments_count": 0,
  "invoices": [],
  "is_negative": false,
  "is_zero": false,
  "member_number": "string",
  "number_of_invoices": 0,
  "patient_name": "string",
  "patient_number": "string",
  "provider_name": "string",
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 0.0,
  "total_claim_copay": 0.0,
  "total_claim_discount": 0.0,
  "total_claim_net_amount": 0.0,
  "total_claim_splits": 0.0,
  "visit_end": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### GET /api/v1/claims/preview/payer

**Preview Payer Claim**

This endpoint allows the user to preview the claim that has been sennt to the payer. It provides a way to check the claim status as seen from payer.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `guid` | query | `string` |  *(required)* | Claim GUID |
| `provider_claim_no` | query | `string` |  *(required)* | Provider claim number |

**Responses:**
**Response `200`** — Payer claim preview retrieved successfully
_Content-Type: `application/json`_
```json
{
  "pageSize": 0,
  "results": [
    {
      "actualDeductableCopay": 0.0,
      "authToken": "string",
      "authorization": {
        "authCode": "string",
        "authorizationReason": "string",
        "authorizationType": [
          "string"
        ],
        "beneficiaryCode": "string",
        "beneficiaryJoinDate": "string",
        "beneficiaryName": "string",
        "beneficiaryNumber": "string",
        "beneficiaryScheme": "string",
        "benefitType": "string",
        "created": "string",
        "createdByName": "string",
        "currentAvailableBalance": 0.0,
        "expiry": "string",
        "guid": "string",
        "id": 0,
        "interventions": [],
        "isComplete": false,
        "isElective": false,
        "isOpen": false,
        "label": "string",
        "needsPreauth": false,
        "notes": "string",
        "overallPreauthFinalised": false,
        "owner": 0,
        "parentAuthorization": 0,
        "parentPreauth": {
          "accessPoint": "string",
          "anaesthesiaType": "string",
          "authorization": 0,
          "authorizationDetails": {
            "authCode": "string",
            "authorizationReason": "string",
            "authorizationType": [],
            "authorizingDeviceOs": "string",
            "beneficiary": 0,
            "beneficiaryCode": "string",
            "beneficiaryName": "string",
            "beneficiaryNumber": "string",
            "beneficiaryScheme": "string",
            "benefitType": "string",
            "biometricMatchLogId": "string",
            "children": [],
            "createdByName": "string",
            "dateAuthorized": "string",
            "ekycToken": "string",
            "eligibility": "string",
            "endDate": "string",
            "endedVia": [],
            "expiry": "string",
            "guardian": "string",
            "guid": "string",
            "id": 0,
            "interventions": [],
            "isBiometricsDischargeAuthorization": false,
            "isComplete": false,
            "isElective": false,
            "isOpen": false,
            "label": "string",
            "needsPreauth": false,
            "notes": "string",
            "overallPreauthFinalised": false,
            "parentAuthorization": 0,
            "parentType": "string",
            "payerName": "string",
            "payerSladeCode": 0,
            "preauthIds": [],
            "provider": 0,
            "providerFid": "string",
            "providerName": "string",
            "requestedBy": "string",
            "sessionType": "string",
            "shaGuid": "string",
            "shaVerificationRequestId": "string",
            "status": "string",
            "token": "string",
            "workStationId": "string"
          },
          "beneficiaryDetails": {
            "DoB": "string",
            "beneficiaryCode": "string",
            "beneficiaryId": 0,
            "categoryCode": "string",
            "categoryName": "string",
            "firstName": "string",
            "gender": "string",
            "guid": "string",
            "identifiers": [],
            "lastName": "string",
            "otherNames": "string",
            "schemeCode": "UHC",
            "schemeName": "string"
          },
          "carcinomaStaging": "string",
          "clinicalIndications": "string",
          "comorbidity": "string",
          "conditionCause": "string",
          "conditionEmploymentRelated": false,
          "conditionOtherRelated": false,
          "costPerSession": "string",
          "countdown": 0,
          "createdByName": "string",
          "description": "string",
          "doctorApproved": false,
          "doctorReviewStatus": "string",
          "finalApprovedAmount": 0.0,
          "guid": "string",
          "id": 0,
          "interventionCode": "string",
          "interventionData": {
            "code": "string",
            "fallBackKephLevelTariff": 0.0,
            "guid": "string",
            "id": 0,
            "kephLevelTarrif": 0.0,
            "name": "string",
            "numberOfDaysToFallback": 0,
            "overallTariff": 0.0,
            "paymentMechanism": "string",
            "status": "string"
          },
          "isElective": false,
          "isEmergency": false,
          "isHmisPreauth": false,
          "isOncology": false,
          "isOptical": false,
          "isRadiology": false,
          "isRenal": false,
          "isRequestPhase": false,
          "isResponsePhase": false,
          "isSurgical": false,
          "lengthOfStay": 0,
          "memberIdentifier": "string",
          "memberIsVip": false,
          "memberIsVvip": false,
          "memberName": "string",
          "memberScheme": "string",
          "metastases": "string",
          "needsDoctorApproval": false,
          "numberOfPreauthDoctorsRequired": 0,
          "otherMetastases": "string",
          "payerIdentifier": "string",
          "payerInvoiceNo": "string",
          "payerName": "string",
          "preauthAttachments": [],
          "preauthDiagnoses": [],
          "preauthDoctors": [],
          "preauthFlags": [],
          "preauthItems": [],
          "preauthNotes": [],
          "preauthType": "string",
          "providerConsent": false,
          "providerCurrency": "string",
          "providerDetails": {
            "active": false,
            "bpLevel": "string",
            "businessPartnerId": 0,
            "guid": "string",
            "identifiers": [],
            "name": "string",
            "nationalIdentifier": "string",
            "sladeCode": 0
          },
          "providerName": "string",
          "providerNotificationEmail": "string",
          "reasonForAcuteDialysis": "string",
          "reasonForSelectingOther": "string",
          "requestExtraData": {
            "anaesthesiaType": "string",
            "carcinomaStaging": "STAGE_1",
            "chiefComplaint": "string",
            "clinicalIndications": "string",
            "coinsuranceDetails": "string",
            "comorbidity": "string",
            "conditionEmploymentRelated": false,
            "conditionOtherRelated": false,
            "consultationDescription": "string",
            "costPerSession": 0.0,
            "eyeExaminationAmount": 0.0,
            "eyeExaminationDescription": "string",
            "frameAmount": 0.0,
            "frameDescription": "string",
            "hasCoinsurance": false,
            "hpi": "string",
            "investigations": "string",
            "lensAmount": 0.0,
            "lensDescription": "string",
            "lensPrescription": "string",
            "metastases": [],
            "physicalExamination": "string",
            "progressReport": "string",
            "reasonForService": "string",
            "replacement": "string",
            "sessionExpectedDate": "string",
            "sessionsFrequency": "string",
            "sessionsRequired": 0,
            "subType": "string",
            "treatmentSetting": [],
            "vitalSigns": "string"
          },
          "responseExtraData": "string",
          "serviceEnd": "string",
          "serviceStart": "string",
          "sessionExpectedDate": "string",
          "sessionType": "string",
          "sessionsFrequency": "string",
          "sessionsRequired": 0,
          "status": "string",
          "submissionDateIn_EAT": "string",
          "token": "string",
          "totalEstimatedAmountForPreauth": 0.0,
          "totalInterimApprovedAmountForPreauth": 0.0,
          "updatedByName": "string"
        },
        "parentType": "string",
        "policyEffectiveDate": "string",
        "preauthIds": [
          0
        ],
        "providerName": "string",
        "requestedBy": "string",
        "sessionType": "string",
        "status": "string",
        "token": "string",
        "totalAuthorizedAmount": 0.0
      },
      "billFrom": "string",
      "billTo": "string",
      "claimAttachments": [],
      "claimFlags": [
        {
          "code": "string",
          "description": "string",
          "flagType": "string",
          "guid": "string",
          "id": 0,
          "isResolved": false,
          "message": "string",
          "workflowState": "string"
        }
      ],
      "claimLines": [
        {
          "approvedLineTotal": 0.0,
          "billFrom": "string",
          "billTo": "string",
          "billingCode": "string",
          "chargeDate": "string",
          "claimLineGrossTotal": 0.0,
          "claimLineTotal": 0.0,
          "guid": "string",
          "id": 0,
          "intervention": 0,
          "interventionCode": "string",
          "interventionName": "string",
          "name": "string",
          "providerClaimLineNo": "string",
          "quantity": 0.0,
          "rejectedLineTotal": 0.0,
          "schemeCode": "string",
          "schemeName": "string",
          "unit": "string",
          "unitPrice": 0.0,
          "workflowState": "string"
        }
      ],
      "claimNotes": [
        {
          "author": "string",
          "guid": "string",
          "id": 0,
          "note": "string",
          "source": "string",
          "workflowState": "string"
        }
      ],
      "claimTransitions": [
        {
          "guid": "string",
          "id": 0,
          "transitionDate": "string",
          "workflowStateFrom": "string",
          "workflowStateTo": "string"
        }
      ],
      "claimType": "string",
      "created": "string",
      "diagnoses": [
        {
          "encounter": 0,
          "encounterGuid": "string",
          "guid": "string",
          "intervention": 0,
          "name": "string",
          "siteCode": "string",
          "siteCodeType": "string"
        }
      ],
      "encounter": 0,
      "guid": "string",
      "id": 0,
      "isCreditNote": false,
      "isInpatient": false,
      "memberName": "string",
      "memberNumber": "string",
      "owner": 0,
      "proposedValue": 0.0,
      "proposedValueLessCopays": 0.0,
      "providerClaimNo": "string",
      "providerName": "string",
      "schemeName": "string",
      "totalCopayValue": 0.0,
      "trackingNumber": "string",
      "workflowDisplayName": "string",
      "workflowState": "string"
    }
  ]
}
```

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### GET /api/v1/patients/pomsf-balances

**Get POMSF balances for a patient**

Retrieves Public Officers Medical Scheme Fund balances for a civil servant patient

_Tags: `Billing`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient_id` | query | `string` |  *(required)* | Patient's POMSF member number (CR number) |
| `policy_year` | query | `string` |  *(required)* | The policy year for which you want to fetch the balances |
| `principal_member_number` | query | `string` |  | Patient principal POMSF member number (CR number) |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
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
      "isActive": false,
      "lastName": "string",
      "memberNumber": "string",
      "middleName": "string",
      "nationalId": "string",
      "parentNumber": "string",
      "phone": "string",
      "phoneCode": "string",
      "relationshipType": "string",
      "schemeCount": 0,
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
          "balance": [],
          "benefitCode": "string",
          "benefitGender": [
            "string"
          ],
          "benefitId": 0,
          "benefitRelation": [
            "string"
          ],
          "benefitShared": "string",
          "description": "string",
          "limit": 0,
          "name": "string",
          "subBenefit": [],
          "type": "string"
        }
      ],
      "dependentCount": [
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
        "hasLabtests": false,
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
        "totalBenefit": 0,
        "type": "string"
      },
      "policyJoinDate": "string",
      "spouseCount": [
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
  "policyCount": 0,
  "registeredOn": "string",
  "relationshipType": "string",
  "schemeCount": 0,
  "shaNumber": "string",
  "title": "string"
}
```

**Response `400`** — Bad Request - Missing query parameters or invalid request input
_Content-Type: `application/json`_

### POST /api/v1/uploads

**Upload a file**

Uploads a file and returns its storage path

_Tags: `Billing`_
_Security: `BearerAuth`_

**Request Body:**
_Required._

_Content-Type: `multipart/form-data`_
```json
{
  "file": "string"
}
```

**Responses:**
**Response `200`** — File stored successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Failed to parse or read file
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Tenant context required
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Failed to store file
_Content-Type: `application/json`_

### GET /api/v1/uploads/{file_id}

**Get file download URL**

Generates a pre-signed download URL for a previously uploaded file.

_Tags: `Billing`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `file_id` | path | `string` |  *(required)* | File ID returned when the file was uploaded |

**Responses:**
**Response `200`** — Pre-signed URL generated successfully
_Content-Type: `application/json`_

**Response `400`** — Bad request - file_id is required
_Content-Type: `application/json`_

**Response `403`** — Forbidden - tenant context required
_Content-Type: `application/json`_

**Response `500`** — Internal server error - failed to generate download URL
_Content-Type: `application/json`_

## Claim Dispatch

Endpoints for claim submission and dispatch.

### POST /api/v1/claims/close

**Close an existing claim**

Closes an existing claim that is not planned to be submitted. Typically used to terminate a claim.

_Tags: `Claim Dispatch`_
_Security: `BearerAuth`_

**Request Body:**
Close claim request input
_Required._

_Content-Type: `application/json`_
```json
{
  "cancel_reason_text": "string",
  "cancel_reason_type": "WRONG_PATIENT",
  "consent_token": "string"
}
```

**Responses:**
**Response `200`** — Claim closed successfully
_Content-Type: `application/json`_
```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 0,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 0,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 0,
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
  "claim_id": 0,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 0,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 0,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "interventions": [
    {
      "accrued_per_diem_amount": 0.0,
      "accrued_per_diem_days": 0,
      "active_for_uhc": false,
      "applicable_document_types": [
        "string"
      ],
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 0.0,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": false,
      "keph_level_tarrif": 0.0,
      "needs_preauth": false,
      "optional_document_type": [
        "string"
      ],
      "optional_preauth_document_types": [
        "string"
      ],
      "preauth_exist": false,
      "required_preauth_document_types": [
        "string"
      ],
      "requires_oncology_preauth": false,
      "requires_optical_preauth": false,
      "requires_radiology_preauth": false,
      "requires_renal_preauth": false,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 0,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 0,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 0.0,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "PENDING",
          "slade_code": "string"
        }
      ],
      "edi_invoice_guid": "string",
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 0,
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
          "discount": 0.0,
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
          "line_copay": 0.0,
          "line_net_amount": 0.0,
          "line_number": "string",
          "line_total_amount": 0.0,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 0.0,
          "patient_discount_amount": 0.0,
          "patient_net_price": 0.0,
          "pmf_line_status": "string",
          "quantity": 0.0,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 0.0,
          "uhc_exceeded": false,
          "unit": "string",
          "unit_price": 0.0
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
      "total_inv_amount": 0.0,
      "total_inv_copay": 0.0,
      "total_inv_discount": 0.0,
      "total_inv_net_amount": 0.0,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": false,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": false,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 0,
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
  "retry_count": 0,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 0.0,
  "total_claim_copay": 0.0,
  "total_claim_discount": 0.0,
  "total_claim_net_amount": 0.0,
  "total_claim_splits": 0.0,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```

**Response `400`** — Bad Request - Missing required fields or invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/discharge

**Discharge Inpatient**

This API sends a One-Time Password (OTP) to the beneficiary or their next of kin for discharge consent.

_Tags: `Claim Dispatch`_
_Security: `BearerAuth`_

**Request Body:**
Discharge patient request input
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "discharge_date": "string",
  "discharge_reason": "RECOVERED",
  "invoice_number": "string",
  "otp": "string"
}
```

**Responses:**
**Response `200`** — Patient discharged successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields or invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/otp/discharge

**Send OTP for Discharge**

This API sends a One-Time Password (OTP) to the beneficiary or their next of kin for discharge consent.

_Tags: `Claim Dispatch`_
_Security: `BearerAuth`_

**Request Body:**
OTP Request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
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

### POST /api/v1/claims/submit

**Submit a virtual claim**

Finalizes a virtual claim by submitting it for processing and reimbursement. No further changes can be made to the claim after submission.

_Tags: `Claim Dispatch`_
_Security: `BearerAuth`_

**Request Body:**
Submit claim request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "invoice_number": "string",
  "reason_for_unknown_patient": "string"
}
```

**Responses:**
**Response `200`** — Claim submitted successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `401`** — Unauthorized - Invalid identity
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Not enough permissions
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/patients/next-of-kin/contacts

**Add Next of Kin Contact**

Adds a next of kin contact for a beneficiary.

_Tags: `Claim Dispatch`_
_Security: `BearerAuth`_

**Request Body:**
Add contact request input
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "contact_value": "string",
  "next_of_kin_full_name": "string",
  "next_of_kin_id_number": "string",
  "next_of_kin_id_number_type": "National ID"
}
```

**Responses:**
**Response `200`** — Contact added successfully
_Content-Type: `application/json`_
```json
{
  "active": false,
  "beneficiary": 0,
  "beneficiaryCode": "string",
  "beneficiaryId": 0,
  "beneficiaryName": "string",
  "capturedAtName": "string",
  "capturedAtSladeCode": 0,
  "contactType": "string",
  "contactValue": "string",
  "deactivationReason": "string",
  "guid": "string",
  "id": 0,
  "isConfirmed": false,
  "isMainContact": false,
  "isVerified": false,
  "nextOfKinFullName": "string",
  "nextOfKinIdNumber": "string",
  "ownerType": "NEXT_OF_KIN",
  "pushedToCrm": false,
  "replicated": "string",
  "triggeredByUser": false
}
```

**Response `400`** — Bad Request - Missing required fields or invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

## Preauth Doctor Consent

Endpoints for doctor consent in preauthorization.

### POST /api/v1/claims/doctor-consent

**Request Doctor Consent**

Sends a request for a doctor's consent related to a preauthorization.

_Tags: `Preauth Doctor Consent`_
_Security: `BearerAuth`_

**Request Body:**
Doctor consent request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "created": "string",
  "emergency_claim_id": "string",
  "identification_number": "string",
  "identification_type": "registration_number",
  "intervention_code": "string",
  "practitioner_registration_number": "string",
  "regulation_body": "KMPDC",
  "request_type": "PREAUTH_DOCTOR_APPROVAL_REQUEST",
  "service_type": "string"
}
```

**Responses:**
**Response `200`** — Doctor consent request initiated successfully
_Content-Type: `application/json`_
```json
{
  "message": "string"
}
```

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `401`** — Unauthorized - Invalid identity
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Not enough permissions
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

## Emergency

 Endpoints for emergency case claims and protocols.

### POST /api/v1/claims/doctors

**Add Emergency Case Claim Doctor**

Adds a doctor to an existing emergency case claim using their registration or identification details.

_Tags: `Emergency`_
_Security: `BearerAuth`_

**Request Body:**
Emergency claim doctor request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "identification_number": "string"
}
```

**Responses:**
**Response `200`** — Doctor successfully added to claim
_Content-Type: `application/json`_
```json
{
  "message": "string"
}
```

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `401`** — Unauthorized - Invalid identity
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Not enough permissions
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### DELETE /api/v1/claims/doctors

**Remove doctor from claim**

Removes a doctor from an authorized claim

_Tags: `Emergency`_
_Security: `BearerAuth`_

**Request Body:**
Emergency claim doctor request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string"
}
```

**Responses:**
**Response `204`** — No Content

**Response `400`** — Bad Request - Request failed validation
_Content-Type: `application/json`_

**Response `401`** — Unauthorized - Invalid identity
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Not enough permissions
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/emergency

**Create Emergency Case Claim**

This endpoint allows facilities to create a new virtual emergency case claim. Depending on the patient type, the request can be for either an identified or unidentified patient.

_Tags: `Emergency`_
_Security: `BearerAuth`_

**Request Body:**
Emergency visit Request
_Required._

_Content-Type: `application/json`_
```json
{
  "beneficiary_cr_id": "string",
  "brought_by": "RELATIVE",
  "identification_number": "string",
  "interventions": [
    "string"
  ],
  "mode_of_arrival": "AMBULANCE",
  "notes": "string",
  "otp": "string",
  "reference_number": "string"
}
```

**Responses:**
**Response `200`** — Emergency claim created successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### GET /api/v1/claims/emergency/protocols

**Get Emergency Protocols**

Retrieve a list of emergency protocols from the ILM Adapter API. These define the applicable clinical or management procedures for emergency cases filtered by status, intervention code, and facility details.

_Tags: `Emergency`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `active` | query | `string` |  *(required)* | Filter intervention if it is still active |
| `intervention_code` | query | `string` |  *(required)* | Intervention applicable to a protocol |

**Responses:**
**Response `200`** — Emergency protocol retrieved successfully
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
      "applicableTariff": "string",
      "guid": "string",
      "id": 0,
      "intervention": [
        {
          "accessPoint": "string",
          "active": false,
          "annualQuantityLimit": 0,
          "annualQuantityLimitChoice": "string",
          "annualQuantityLimitType": "string",
          "applicableDocumentTypes": [
            "string"
          ],
          "applicableFacilityOwnership": "string",
          "applicableGender": "string",
          "benefit": 0,
          "code": "string",
          "comment": "string",
          "complexity": "string",
          "coverageLevel": "string",
          "diagnosisBlock": [
            "string"
          ],
          "diagnosisList": [
            "string"
          ],
          "guid": "string",
          "id": 0,
          "investigationTariffHasLimit": false,
          "isIntraMetro": false,
          "kephLevelTarrif": 0.0,
          "levelsApplicable": [
            "string"
          ],
          "lowerAgeLimit": 0,
          "managementTariffHasLimit": false,
          "name": "string",
          "needApprovalBeforeClaimSubmission": false,
          "needsDoctorAuthorization": false,
          "needsManualPreauthApproval": false,
          "needsMemberAuthorization": false,
          "needsPreauth": false,
          "optionalDocumentType": [
            "string"
          ],
          "optionalPreauthDocumentTypes": [
            "string"
          ],
          "overallTariff": 0.0,
          "overallTariffHasLimit": false,
          "paymentMechanism": "string",
          "preauthFinalised": false,
          "protocolUsed": "string",
          "requiredPreauthDocumentTypes": [
            "string"
          ],
          "requiresOncologyPreauth": false,
          "requiresOpticalPreauth": false,
          "requiresRadiologyPreauth": false,
          "requiresRenalPreauth": false,
          "requiresSurgicalPreauth": false,
          "status": "string",
          "upperAgeLimit": 0,
          "usageFrequencyLimit": 0,
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
  "startIndex": 0,
  "totalPages": 0
}
```

**Response `400`** — Bad Request - Invalid request
_Content-Type: `application/json`_

**Response `401`** — Unauthorized - Invalid identity
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Not enough permissions
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/emergency/protocols

**Add Emergency Case Protocol**

This endpoint allows adding a treatment protocol to an existing emergency case claim.

_Tags: `Emergency`_
_Security: `BearerAuth`_

**Request Body:**
Emergency protocol Request
_Required._

_Content-Type: `multipart/form-data`_
```json
{
  "consent_token": "string",
  "protocol_code": "string",
  "intervention_code": "string",
  "unit_price": 0.0,
  "quantity": 0,
  "diagnoses": "string",
  "attachments": "string"
}
```

**Responses:**
**Response `200`** — Emergency protocol added successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `401`** — Unauthorized - Invalid identity
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Not enough permissions
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/emt

**Creates an EMT claim**

Creates an EMT claim

_Tags: `Emergency`_
_Security: `BearerAuth`_

**Request Body:**
EMT visit Request
_Required._

_Content-Type: `application/json`_
```json
{
  "attachments": [
    {
      "document_title": "string",
      "document_type": "DISCHARGE_SUMMARY",
      "file_field_name": "string"
    }
  ],
  "beneficiary_cr_id": "string",
  "case_number": "string",
  "consent_token": "string",
  "diagnoses": [
    "string"
  ],
  "interventions": [
    "string"
  ],
  "otp": "string",
  "practitioner_reg_number": "string",
  "protocol_code": "string",
  "provider_registration_number": "string"
}
```

**Responses:**
**Response `200`** — EMT claim created successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `401`** — Unauthorized - Invalid identity
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Not enough permissions
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

## Interventions

Endpoints for managing interventions and their combinations.

### POST /api/v1/claims/interventions

**Add a new intervention to claim**

Adds a new intervention to an existing claim using the consent token from claim creation.

_Tags: `Interventions`_
_Security: `BearerAuth`_

**Request Body:**
Add intervention Request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "facilityID": "string",
  "facilityIDType": "string",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Intervention added successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/interventions/restore

**Restore Intervention**

Restore an intervention to a claim.

_Tags: `Interventions`_
_Security: `BearerAuth`_

**Request Body:**
Restore intervention request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Intervention restored successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/interventions/retire

**Retire Intervention**

Retire an intervention from a claim.

_Tags: `Interventions`_
_Security: `BearerAuth`_

**Request Body:**
Retire intervention Request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Intervention retired successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

### POST /api/v1/claims/interventions/switch

**Switch intervention**

Switches an existing intervention to a new intervention using a valid consent token.

_Tags: `Interventions`_
_Security: `BearerAuth`_

**Request Body:**
Switch intervention request
_Required._

_Content-Type: `application/json`_
```json
{
  "bill_from": "string",
  "bill_to": "string",
  "consent_token": "string",
  "existing_intervention_code": "string",
  "new_intervention_code": "string",
  "retain_bill_items": false
}
```

**Responses:**
**Response `200`** — Intervention switched successfully
_Content-Type: `application/json`_

**Response `400`** — Bad request - invalid payload
_Content-Type: `application/json`_

**Response `401`** — Unauthorized
_Content-Type: `application/json`_

**Response `403`** — Forbidden - tenant context required
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

## Start Visit Consent

Endpoints for managing visit consent and OTP verification.

### POST /api/v1/claims/visit

**Create new virtual claim**

Creates a new virtual claim for a beneficiary after verifying their consent. Use the OTP strategy when consent was captured via a one-time password, or the biometrics strategy when consent was captured via eKYC or fingerprint — in which case the authorization GUID from POST /api/v1/claims/authorize is passed instead of an OTP.

_Tags: `Start Visit Consent`_
_Security: `BearerAuth`_

**Request Body:**
Visit request payload. Choose one strategy: OTP (one-time password consent) or Biometrics (authorization GUID from a preceding biometric authorization).
_Required._

_Content-Type: `application/json`_

**Responses:**
**Response `200`** — Visit started successfully
_Content-Type: `application/json`_

**Response `400`** — Bad Request - Missing required fields
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_

## Eligibility

Endpoints for checking beneficiary eligibility.

### GET /api/v1/patients/benefits

**Benefits Coverage**

Retrieve the list of benefit packages available for a specific patient.

_Tags: `Eligibility`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient_id` | query | `string` |  *(required)* | Patient's client registry ID |
| `fields` | query | `string` |  | Fields to include in response (e.g parent_benefit,parent_benefit_code) |
| `is_unique_benefit` | query | `boolean` |  | Filter unique benefits only |

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
      "count": 0,
      "currentPage": 0,
      "endIndex": 0,
      "next": "string",
      "pageSize": 0,
      "previous": "string",
      "results": [
        {
          "parentBenefit": "string",
          "parentBenefitCode": "string"
        }
      ],
      "startIndex": 0,
      "totalPages": 0
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

### GET /api/v1/patients/benefits/interventions

**Interventions Coverage**

Retrieve the list of medical interventions available under benefit packages for a patient.

_Tags: `Eligibility`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient_id` | query | `string` |  *(required)* | Patient's client registry ID |
| `sub_benefit_code` | query | `string` |  *(required)* | Sub benefit whose interventions are to be returned |

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
      "accessPoint": "string",
      "active": false,
      "annualLimitValue": 0.0,
      "annualQuantityLimit": 0,
      "annualQuantityLimitChoice": "string",
      "annualQuantityLimitType": "string",
      "applicableDocumentTypes": [
        "string"
      ],
      "applicableFacilityOwnership": "string",
      "applicableGender": "string",
      "applicableSchemes": [
        "string"
      ],
      "benefit": 0,
      "benefitCode": "string",
      "benefitName": "string",
      "code": "string",
      "comment": "string",
      "complexity": "string",
      "coverageLevel": "string",
      "diagnosisBlock": [
        "string"
      ],
      "diagnosisList": [
        "string"
      ],
      "fallBackLevel2Tariff": 0.0,
      "fallBackLevel3Tariff": 0.0,
      "fallBackLevel4Tariff": 0.0,
      "fallBackLevel5Tariff": 0.0,
      "fallBackLevel6Tariff": 0.0,
      "fallBackOverallTariff": 0.0,
      "fund": "string",
      "guid": "string",
      "id": 0,
      "investigationTariff": 0.0,
      "investigationTariffHasLimit": false,
      "isIntraMetro": false,
      "kephLevelTarrif": 0.0,
      "level2Tariff": 0.0,
      "level3Tariff": 0.0,
      "level4Tariff": 0.0,
      "level5Tariff": 0.0,
      "level6Tariff": 0.0,
      "levelsApplicable": [
        "string"
      ],
      "lowerAgeLimit": 0,
      "managementTariff": 0.0,
      "managementTariffHasLimit": false,
      "name": "string",
      "needApprovalBeforeClaimSubmission": false,
      "needsDoctorAuthorization": false,
      "needsManualPreauthApproval": false,
      "needsMemberAuthorization": false,
      "needsPreauth": false,
      "numberOfDaysToFallback": 0,
      "numberOfDoctorsRequired": 0,
      "optionalDocumentTypes": [
        "string"
      ],
      "optionalPreauthDocumentTypes": [
        "string"
      ],
      "overallTariff": 0.0,
      "overallTariffHasLimit": false,
      "parentBenefitCode": "string",
      "parentBenefitName": "string",
      "paymentMechanism": "string",
      "preauthFinalised": false,
      "protocolUsed": "string",
      "requiredPreauthDocumentTypes": [
        "string"
      ],
      "requiresOncologyPreauth": false,
      "requiresOpticalPreauth": false,
      "requiresRadiologyPreauth": false,
      "requiresRenalPreauth": false,
      "requiresSurgicalPreauth": false,
      "status": "string",
      "supportedScheme": "string",
      "tariffLimitPerIndividual": 0.0,
      "tariffPerAdditionalKilometer": 0.0,
      "upperAgeLimit": 0,
      "usageFrequencyLimit": 0,
      "usageFrequencyType": "string"
    }
  ],
  "startIndex": 0,
  "totalPages": 0
}
```

**Response `400`** — Bad Request - Missing query parameters or invalid request input
_Content-Type: `application/json`_

### GET /api/v1/patients/eligibility

**SHA Eligibility Check**

This endpoint checks the eligibility of a beneficiary for certain healthcare services.

_Tags: `Eligibility`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `identification_number` | query | `string` |  *(required)* | Patient identification number |
| `identification_type` | query | `string` |  *(required)* | Patient identification type |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "age": 0,
  "dateOfBirth": "string",
  "fullName": "string",
  "gender": "string",
  "memberCrNumber": "string",
  "requestIdNumber": "string",
  "requestIdType": 0,
  "schemes": [
    {
      "coverage": {
        "endDate": "string",
        "message": "string",
        "possibleSolution": "string",
        "reason": "string",
        "startDate": "string",
        "status": "string"
      },
      "memberType": "string",
      "policy": {
        "endDate": "string",
        "number": "string",
        "startDate": "string"
      },
      "principalContributor": {
        "crNumber": "string",
        "employerDetails": {
          "jobGroup": "string",
          "name": "string"
        },
        "employmentType": "string",
        "idNumber": "string",
        "idType": "string",
        "name": "string",
        "relationship": "string"
      },
      "schemeId": 0,
      "schemeName": "string"
    }
  ],
  "statusCode": "string",
  "statusDesc": "string",
  "whitelistedForOTP": false
}
```

**Response `400`** — Bad Request - Missing query parameters or invalid request input
_Content-Type: `application/json`_

### GET /api/v1/patients/benefits/utilization

**Get patient payer utilization balances**

Retrieves a patient's payer utilization balances showing benefit usage and remaining limits

_Tags: `Eligibility`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient_id` | query | `string` |  *(required)* | Patient's CR number |
| `intervention_code` | query | `string` |  *(required)* | Intervention code |

**Responses:**
**Response `200`** — OK
_Content-Type: `application/json`_
```json
{
  "code": "string",
  "computationalDetail": {
    "coverageEndDate": "string",
    "coverageStartDate": "string",
    "eligibility": false,
    "householdLimitAvailableCount": 0,
    "individualLimitAvailableCount": 0,
    "intermediatePeriodUsage": {
      "individualMaxDuringPeriod": 0,
      "individualUtilisedDuringPeriod": 0,
      "lastUsageDate": "string",
      "period": "string"
    },
    "limitAvailableAmount": 0.0,
    "nextAvailableDate": "string"
  },
  "crId": "string",
  "fundUtilizationLimit": [
    {
      "availableAmount": 0.0,
      "fundType": "string",
      "maxAmount": 0.0,
      "utilisedAmount": 0.0
    }
  ],
  "householdMaxLimit": 0,
  "householdUtilisedLimit": 0,
  "individualMaxLimit": 0,
  "individualUtilisedLimit": 0,
  "limitScope": "string",
  "nextAvailability": "string",
  "utilizationDays": 0
}
```

**Response `400`** — Bad Request - Missing query parameters or invalid request input
_Content-Type: `application/json`_

### GET /api/v1/patients/sub-benefits

**Get patient benefits coverage**

Retrieves a patient's SHA benefits coverage

_Tags: `Eligibility`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `patient_id` | query | `string` |  *(required)* | Patient's client registry ID |

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
      "accessPoint": "string",
      "active": false,
      "allowedInterventions": [
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
        "isEmployerGroup": false,
        "jobGroup": "string",
        "policyNumber": "string",
        "validFrom": "string",
        "validTo": "string"
      },
      "fund": "string",
      "guid": "string",
      "id": 0,
      "interventionCombination": [
        "string"
      ],
      "name": "string",
      "packageCombination": [
        "string"
      ],
      "parentBenefit": "string",
      "parentBenefitCode": "string",
      "standaloneInterventions": [
        "string"
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

## Preauths

Endpoints for preauthorization processes.

### POST /api/v1/preauth/cancel

**Cancel Preauth**

Cancel an existing preauthorization using the consent token and intervention code.

_Tags: `Preauths`_
_Security: `BearerAuth`_

**Request Body:**
Cancel preauthorization request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Preauthorization canceled successfully
_Content-Type: `application/json`_

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

### GET /api/v1/preauths

**Fetches a preauthorization**

Fetches an existing preauthorization linked to the consent token provided

_Tags: `Preauths`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `consent_token` | query | `string` |  *(required)* | consent token linked to the preauth |

**Responses:**
**Response `200`** — Preauthorization retrieved successfully
_Content-Type: `application/json`_

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

### POST /api/v1/preauths

**Create a preauthorization**

Creates a new preauthorization using multipart form data with file uploads

_Tags: `Preauths`_
_Security: `BearerAuth`_

**Request Body:**

_Content-Type: `multipart/form-data`_

**Responses:**
**Response `201`** — Preauthorization created successfully
_Content-Type: `application/json`_

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

### DELETE /api/v1/preauths/diagnoses/{icd_code}

**Remove diagnosis from a preauth**

Remove a diagnosis from an existing preauthorization.

_Tags: `Preauths`_
_Security: `BearerAuth`_

**Request Body:**
Remove preauth diagnosis request
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "icd_code": "string",
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Preauthorization canceled successfully
_Content-Type: `application/json`_

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `401`** — Unauthorized
_Content-Type: `application/json`_

**Response `403`** — Forbidden
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

### DELETE /api/v1/preauths/doctors

**Remove Preauth Doctor**

Remove a doctor associated with an existing preauthorization. Can only be done before the preauthorization is submitted.

_Tags: `Preauths`_
_Security: `BearerAuth`_

**Request Body:**
Remove preauth doctor
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "intervention_code": "string",
  "practitioner_registration_number": "string"
}
```

**Responses:**
**Response `200`** — Preauth Doctor removed successfully
_Content-Type: `application/json`_
```json
"string"
```

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `401`** — Unauthorized
_Content-Type: `application/json`_

**Response `403`** — Forbidden
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

## ePrescriptions

Endpoints for managing prescriptions.

### GET /api/v1/prescriptions

**Preview prescription**

Fetches a preview of a prescription using a consent token

_Tags: `ePrescriptions`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `consent_token` | query | `string` |  *(required)* | Consent token |

**Responses:**
**Response `200`** — Prescription preview fetched successfully
_Content-Type: `application/json`_
```json
{
  "authorization": {
    "authCode": "string",
    "beneficiaryCode": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "expiry": "string",
    "guid": "string",
    "id": 0,
    "payerName": "string",
    "providerName": "string",
    "replicated": "string",
    "status": "string",
    "token": "string"
  },
  "beneficiary": {
    "age": 0,
    "beneficiaryCode": "string",
    "contacts": [
      {
        "active": false,
        "contactType": "string",
        "contactValue": "string",
        "id": 0,
        "isMainContact": false,
        "ownerType": "string"
      }
    ],
    "dob": "string",
    "gender": "string",
    "guid": "string",
    "id": 0,
    "identifiers": [
      {
        "id": 0,
        "identifier": "string",
        "identifierType": "string",
        "isMainIdentifier": false
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
      "frequency": 0,
      "guid": "string",
      "id": 0,
      "medication": "string",
      "medicationIdentifier": "string",
      "medicationPrice": 0.0,
      "patientInstruction": "string",
      "periodUnit": "string",
      "practitionerId": "string",
      "prescription": 0,
      "replicated": "string",
      "route": "string",
      "routeCode": "string",
      "startDate": "string"
    }
  ],
  "guid": "string",
  "id": 0,
  "intervention": {
    "accessPoint": "string",
    "active": false,
    "activeForUhc": false,
    "applicableFacilityOwnership": "string",
    "applicableGender": "string",
    "applicableSchemes": [
      "string"
    ],
    "benefit": 0,
    "benefitCode": "string",
    "benefitName": "string",
    "code": "string",
    "coverageLevel": "string",
    "fund": "string",
    "guid": "string",
    "id": 0,
    "levelsApplicable": [
      "string"
    ],
    "name": "string",
    "packageCombinations": [
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

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `401`** — Unauthorized
_Content-Type: `application/json`_

**Response `403`** — Forbidden
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

### POST /api/v1/prescriptions

**Create prescription**

Creates a new prescription for a patient

_Tags: `ePrescriptions`_
_Security: `BearerAuth`_

**Request Body:**
Create prescription payload
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "identification_number": "string",
  "identification_type": "string",
  "intervention_code": "string",
  "items": [
    {
      "additional_instruction": "string",
      "dose_quantity": 0,
      "dose_unit": "string",
      "duration": 0,
      "duration_unit": "string",
      "end_date": "string",
      "frequency": 0,
      "generic_concept_code": "string",
      "needs_refill": false,
      "patient_instruction": "string",
      "period_unit": "string",
      "refill_count": 0,
      "start_date": "string"
    }
  ],
  "regulation_body": "string"
}
```

**Responses:**
**Response `200`** — Prescription created successfully
_Content-Type: `application/json`_

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `401`** — Unauthorized
_Content-Type: `application/json`_

**Response `403`** — Forbidden
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

### POST /api/v1/prescriptions/dispenses

**Create dispense**

Creates a dispense for a prescription using the provided dispense details

_Tags: `ePrescriptions`_
_Security: `BearerAuth`_

**Request Body:**
Create dispense payload
_Required._

_Content-Type: `application/json`_
```json
{
  "actual_products": [
    {
      "actual_product_code": "string",
      "medication_price": 0.0,
      "total_quantity": 0
    }
  ],
  "consent_token": "string",
  "doctors": [
    {
      "identification_number": "string",
      "identification_type": "string"
    }
  ],
  "intervention_code": "string"
}
```

**Responses:**
**Response `200`** — Dispense created successfully
_Content-Type: `application/json`_
```json
{
  "dispenseDosages": [
    {
      "dispense": 0,
      "doseQuantity": 0,
      "doseUnit": "string",
      "duration": "string",
      "durationUnit": "string",
      "endDate": "string",
      "frequency": 0,
      "genericDosageInstruction": 0,
      "guid": "string",
      "id": 0,
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
      "dispense": 0,
      "id": 0
    }
  ],
  "id": 0,
  "status": "string"
}
```

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `401`** — Unauthorized
_Content-Type: `application/json`_

**Response `403`** — Forbidden
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

### DELETE /api/v1/prescriptions/doctors

**Remove prescription doctor**

Removes a doctor associated with a prescription using the provided details

_Tags: `ePrescriptions`_
_Security: `BearerAuth`_

**Request Body:**
Remove prescription doctor payload
_Required._

_Content-Type: `application/json`_
```json
{
  "consent_token": "string",
  "intervention_code": "string",
  "practitioner_registration_number": "string"
}
```

**Responses:**
**Response `200`** — Doctor prescription successfully removed
_Content-Type: `application/json`_

**Response `400`** — Invalid request
_Content-Type: `application/json`_

**Response `401`** — Unauthorized
_Content-Type: `application/json`_

**Response `403`** — Forbidden
_Content-Type: `application/json`_

**Response `500`** — Internal server error
_Content-Type: `application/json`_

## Authorizations

Endpoint for creating authorizations using biometrics or OTP.

### GET /api/v1/claims/authorizations

**Retrieve an existing authorization**

Retrieves an existing authorization for a patient using the provided token, beneficiary code, and GUID.

_Tags: `Authorizations`_
_Security: `BearerAuth`_

**Parameters:**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `token` | query | `string` |  | Authorization token linked to the patient's consent. |
| `beneficiary_code` | query | `string` |  | The beneficiary's identifier code. |
| `guid` | query | `string` |  | Unique identifier (GUID) of the authorization record. |

**Responses:**
**Response `200`** — Authorization retrieved successfully
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

**Response `400`** — Bad Request - Invalid request or authorization retrieval failed
_Content-Type: `application/json`_

**Response `403`** — Forbidden - Tenant context required
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_

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

**Response `400`** — Bad Request - Missing or invalid fields
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error - Service error occurred
_Content-Type: `application/json`_
