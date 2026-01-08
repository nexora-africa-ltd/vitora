# SHA Eligibility API Guide

## Introduction

The Eligibility API is a crucial component of the Universal Health Coverage (UHC) implementation across healthcare facilities in the country. This API enables healthcare providers to verify a patient's insurance coverage status in real-time before providing services.

It confirms whether the patient is covered under SHIF and ECCIF schemes.

## Use Cases

### Primary Use Cases

- **Patient Registration**: Verify eligibility when patients register at a facility
- **Service Authorization**: Check coverage before providing specialized services
- **Claims Submission**: Validate eligibility before submitting claims to SHA
- **Emergency Services**: Retroactive checking for emergency admissions

### Example Workflow

1. Patient arrives at facility and presents identification
2. Facility staff enters identification details into the system
3. System calls the Eligibility API and retrieves coverage status
4. Based on the `eligible` field value:
    - If `eligible=1`: Process patient through SHA coverage pathway
    - If `eligible=0`: Advise patient about cash payment or resolve eligibility issues using the `possible_solution` field

> **Note**: Additional information regarding benefits packages can be obtained from the Benefits Packages documentation.

## Implementation Steps

1. **Obtain API credentials**: Contact SHA to receive your facility's API credentials
2. **Integrate the API**: Implement the eligibility check at patient registration points
3. **Interpret results**: Use the eligibility status to determine the appropriate billing pathway
4. **Handle exceptions**: Implement processes for handling patients with eligibility issues

## API Specification

### Endpoint

```
GET {{base_url}}/v2/eligibility
```

### Authentication

The API uses Bearer token authentication.

**Authorization Header**: `Bearer {{token}}`

### Request Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `identification_type` | Yes | Type of identification document used. Supported types include: National ID, Alien ID, Mandate Number, Temporary ID, SHA Number, Refugee ID. |
| `identification_number` | Yes | The identification number corresponding to the specified identification type. |

### Example Request

```http
GET {{base_url}}/v2/eligibility?identification_type=National ID&identification_number=2897398
Authorization: Bearer {{token}}
```

## Response Format

The API returns data in JSON format.

### Success Response (200 OK)

```json
{
  "message": {
     "id": "CR1234725102491-9",
     "eligible": 1,
     "reason": "Employer by-product for this member not found.",
     "possible_solution": "Employer to submit by-product for Eligibility processing",
     "eligible_nhif": 0,
     "transition_status": "2897398 Not in NHIF transition records",
     "eligible_employee": true,
     "policy_end_employer": null,
     "ep_code": 200,
     "NhifPrepaidEnd": null,
     "request_id_type": 2,
     "request_id_number": "2897398",
     "isNHIFPrepaid": false,
     "message": "The individual is covered",
     "isEmployed": true,
     "coverageEndDate": "2025-02-09T21:00:00Z",
     "status": 0,
     "means_testing_details": {
        "means_testing_done": 0
     },
     "full_name": "MAXMILLA JASON",
     "client_portal_details": {
        "employment_type": "Unspecified",
        "employer_name": null
     }
  }
}
```

### Response Fields Explained

| Field | Type | Description | Importance |
|-------|------|-------------|------------|
| `id` | String | Unique identifier for the eligibility check request | Enables traceability and reconciliation of eligibility checks |
| `eligible` | Integer | Primary eligibility status (1 = eligible, 0 = not eligible) | Core determination of whether the patient's services should be covered by SHA |
| `reason` | String | Explanation for eligibility status | Provides context for the eligibility decision, particularly useful when eligibility is denied |
| `possible_solution` | String | Recommended action to resolve eligibility issues | Guides facilities and patients on steps to take when eligibility issues are encountered |
| `eligible_nhif` | Integer | Legacy NHIF coverage status (1 = covered, 0 = not covered) | Important during UHC transition period as some patients may still be under NHIF coverage |
| `transition_status` | String | Status of the member in NHIF transition records | Provides clarity on transition from NHIF to SHA coverage |
| `eligible_employee` | Boolean | Indicates if the person is eligible through employer contribution | Helps determine the coverage pathway (employer-based vs. other) |
| `policy_end_employer` | String/null | End date of employer-provided coverage | Critical for determining if employer-based coverage is still active |
| `ep_code` | Integer | Error/processing code | Technical field for system integration and troubleshooting |
| `NhifPrepaidEnd` | String/null | End date of NHIF prepaid coverage | Relevant for patients with legacy NHIF prepaid plans |
| `request_id_type` | Integer | Numeric code for the identification type used | Used for internal system reference |
| `request_id_number` | String | The identification number submitted in the request | Confirms the identity document used for verification |
| `isNHIFPrepaid` | Boolean | Indicates if the person has NHIF prepaid coverage | Used during transition period from NHIF to SHA |
| `message` | String | Human-readable eligibility status message | Clear explanation for healthcare providers about coverage status |
| `isEmployed` | Boolean | Employment status of the individual | Helps determine eligibility pathway (employed vs. means testing) |
| `coverageEndDate` | String (ISO date) | Date when current coverage expires | Critical for determining if coverage is still active |
| `status` | Integer | Processing status code | Used for system integration and troubleshooting |
| `means_testing_details.means_testing_done` | Integer | Indicates if means testing has been performed (1 = yes, 0 = no) | Relevant for vulnerable population coverage determination |
| `full_name` | String | Full name of the beneficiary | Helps verify correct patient identification |
| `client_portal_details.employment_type` | String | Type of employment | Provides context for the coverage pathway |
| `client_portal_details.employer_name` | String/null | Name of employer if employment-based coverage | Helps verify the coverage source |

## Integration Guidelines

### Error Handling

The API may return the following HTTP status codes:

| Status Code | Description |
|-------------|-------------|
| 200 | Successful eligibility check |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid token) |
| 404 | Individual not found in the system |
| 500 | Internal server error |

