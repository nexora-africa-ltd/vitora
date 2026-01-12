---
title: Default module
language_tabs:
  - shell: Shell
  - http: HTTP
  - javascript: JavaScript
  - ruby: Ruby
  - python: Python
  - php: PHP
  - java: Java
  - go: Go
toc_footers: []
includes: []
search: true
code_clipboard: true
highlight_theme: darkula
headingLevel: 2
generator: "@tarslib/widdershins v4.0.30"

---

# Default module

Base URLs:

* <a href="https://uat.dha.go.ke">Testing Env: https://uat.dha.go.ke</a>

* <a href="https://uat.dha.go.ke">Prod Env: https://uat.dha.go.ke</a>

# Authentication

- HTTP Authentication, scheme: basic

- HTTP Authentication, scheme: bearer

# Kenya Digital Superhighway/Authorization

## GET Generate JWT Token

GET /v1/hie-auth

## Generate JWT Token

### Description
This endpoint is used to generate a JSON Web Token (JWT) for authentication and authorization. The generated token must be included in the `Authorization` header of subsequent API requests to access protected resources. The token expires after **20 seconds**, requiring frequent renewal for continuous access.

### Endpoint
`GET {{base_url}}/v1/hie-auth?key={{consumer_key}}`

### Endpoint Variables for `/v1/hie-auth`

| Variable         | Description                                       | Example                                |
|------------------|---------------------------------------------------|----------------------------------------|
| `{{base_url}}`   | The base URL of the API server.                  | `https://api.example.com`             |
| `{{consumer_key}}` | The unique API key provided in afyalinkto the consumer for authentication. | `abc123xyz`                           |

## Request
#### Query Parameters
This endpoint requires the `consumer_key` as a query parameter, which can be obtained from the credentials section on your  AfyaLink dashboard.

| Parameter        | Type   | Required | Description |
|-----------------|--------|----------|-------------|
| `{{consumer_key}}`   | string | ✅ Yes  | This is the Consumer key provided by afyalink  e.g 78IHL9593e |

### Authorization
#### Headers
The request must include an `Authorization` header with **Basic Authentication**. This header should contain a **Base64-encoded** string of the username and password in the format:

| Key           | Value          | Description                        |
|--------------|--------------|--------------------------------|
| `Authorization` | `Basic <base64-encoded-credentials>` | Required. Base64-encoded username and password. |
| `username` | `Basic <base64-encoded-username>` | Required. Base64-encoded username . |
| `password` | `Basic <base64-encoded-password>` | Required. Base64-encoded password . |

### Response

#### Success (200 OK)
A successful request returns a JSON response containing the generated JWT token .

```json
{
 "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
}

### Params

|Name|Location|Type|Required|Description|
|---|---|---|---|---|
|consumer_key|query|string| no |none|

> Response Examples

> 200 Response

```json
{}
```

### Responses

|HTTP Status Code |Meaning|Description|Data schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### Responses Data Schema

# Kenya Digital Superhighway/Registry

## PUT Update CR Client

PUT /v1/hie-auth

# Update CR Client

## Description
This endpoint allows updating patient details after the initial registration. It enables modifications to fields such as demographic information, contact details, or other patient-related data. Only authorized users with valid credentials can perform updates.

## Endpoint
**Method:** `PUT`
**URL:** `{{base_url}}/v1/hie-auth`

| Variable                | Description  | Example  |
|-------------------------|-------------------------------------------------------------|-----------------------------------|
| `{{base_url}}`         | The base URL of the API server.                            | `https://uat.dha.go.ke`        |

## Request

### Authorization
This request requires **Basic Authentication**. Ensure you provide the correct credentials from the **Kenya Digital Superhighway** and include a valid JWT token generated from the **Generate JWT Token** endpoint in the request headers.
### Headers
The request must include an authentication token obtained from the **Generate JWT Token** endpoint.

| Header Key       | Value Format      | Required | Description |
|-----------------|------------------|----------|-------------|
| `Authorization` | `Bearer <jwt-token>` | ✅ Yes | A valid JWT token for authentication. |
| `Content-Type`  | `application/json`   | ✅ Yes  | Specifies that the request body is in JSON format. |ent-Type: application/json

### Request Body
The request body must be in JSON format and should contain the updated patient details.

#### Example Request Body
```json
{
  "patient_id": "12345",
  "first_name": "John",
  "last_name": "Doe",
  "date_of_birth": "1985-06-15",
  "gender": "Male",
  "phone_number": "+254700123456",
  "email": "johndoe@example.com",
  "address": {
    "street": "123 Main Street",
    "city": "Nairobi",
    "country": "Kenya",
    "postal_code": "00100"
  },
  "emergency_contact": {
    "name": "Jane Doe",
    "relationship": "Spouse",
    "phone_number": "+254711223344"
  },
  "medical_history": {
    "chronic_conditions": ["Diabetes", "Hypertension"],
    "allergies": ["Peanuts"],
    "medications": ["Metformin", "Lisinopril"]
  }
}

```
## Example cURL
```sh 
curl -X PUT "{{base_url}}/v1/hie-auth" \
-H "Content-Type: application/json" \
-H "Authorization: Bearer {{jwt_token}}" \
-d '{
  "patient_id": "12345",
  "first_name": "John",
  "last_name": "Doe",
  "date_of_birth": "1985-06-15",
  "gender": "Male",
  "phone_number": "+254700123456",
  "email": "johndoe@example.com",
  "address": {
    "street": "123 Main Street",
    "city": "Nairobi",
    "country": "Kenya",
    "postal_code": "00100"
  },
  "emergency_contact": {
    "name": "Jane Doe",
    "relationship": "Spouse",
    "phone_number": "+254711223344"
  },
  "medical_history": {
    "chronic_conditions": ["Diabetes", "Hypertension"],
    "allergies": ["Peanuts"],
    "medications": ["Metformin", "Lisinopril"]
  }
}'
```

## Example Response
###Success (200)✅
 
```json
{
    message:"CR client is updated successfully"
}
```

### Params

|Name|Location|Type|Required|Description|
|---|---|---|---|---|
|key|query|string| no |none|

> Response Examples

> 200 Response

```json
{}
```

### Responses

|HTTP Status Code |Meaning|Description|Data schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### Responses Data Schema

## GET Fetch CR Client

GET /v3/client-registry/fetch-client

## Fetch Client Information
Endpoint to fetch  client details by providing identification details.
This endpoint makes a GET request to fetch client information from the client registry based on the provided identification type, identification number, and agent.

## Endpoint
**Method:** `GET`
**URL:** `{{base_url}}/v3/client-registry/fetch-client?identification_type={{identification_type}}&identification_number={{identification_number}}&agent={{agent}}`

### URL Variables for `/v3/client-registry/fetch-client`

| Variable                | Description                                                 | Example                           |
|-------------------------|-------------------------------------------------------------|-----------------------------------|
| `{{base_url}}`         | The base URL of the API server.                            | `https://uat.dha.go.ke`         |
| `identification_type`  | The type of identification used for the searching the client.            | `National ID`                    |
| `identification_number`| The client's identification number.                        | `12345678`                       |
| `agent`                | The agent through which the client information is being fetched.                  | `SAFARICOM-CONSORTIUM-SANDBOX`  |

## Request 
### Query parameters

| Parameter       | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `claim_id`        | string | ✅ Yes | Search by the claim_id e.g `86768e20-9148-4d9a-a5c2-346e67a69338` |
| `identification_type`  |  string | ✅ Yes | `National ID`                    |
| `identification_number`|  string | ✅ Yes | `12345678`                       |
| `agent`                |  string | ✅ Yes| `SAFARICOM-CONSORTIUM-SANDBOX`  |
## Authorization
This request requires **Basic Authentication**. Ensure you provide the correct credentials from the **Kenya Digital Superhighway** and include a valid JWT token generated from the **Generate JWT Token** endpoint in the request headers.

### Headers
The request must include an authentication token obtained from the **Generate JWT Token** endpoint.

| Header Key       | Value Format      | Required | Description |
|-----------------|------------------|----------|-------------|
| `Authorization` | `Bearer <jwt-token>` | ✅ Yes | A valid JWT token for authentication. |
| `Content-Type`  | `application/json`   | ✅ Yes  | Specifies that the request body is in JSON format. |ent-Type: application/json

### Example CURL

```bash
curl -X GET " https://uat.dha.go.ke/v3/client-registry/fetch-client?identification_type={{identification_type}}&identification_number={{identification_number}}&agent={{agent}}" \
-H "Authorization: Bearer {{jwt_token}}" \
-H "Content-Type: application/json"

### Response

The response for this request includes information about the client fetched from the client registry. The response is encrypted and can be decrypted using your private key. 

## Note
if your are using production access use the  private key that corresponds with your public key on your afyalink dashboard.

### Success (200)✅
```json
{
    "message": {
        "total": 1,
        "result": [
            {
                "_pii": "Lorem ipsum dolor sit amet, consectetur adipiscing elit...",
                "resourceType": "Patient",
                "id": "CR000000000000-2",
                "meta": {
                    "versionId": "1",
                    "creationTime": "2024-09-28 14:06:35.296678",
                    "lastUpdated": "2024-09-28 14:17:20.919576",
                    "source": "http://cr-nrb.tiberbu.health"
                },
                "originSystem": {
                    "system": "SPIN MOBILE API",
                    "record_id": ""
                },
                "title": "Miss",
                "middle_name": "Doe",
                "place_of_birth": "MACHAKOS",
                "person_with_disability": 1,
                "citizenship": "KENYAN",
                "kra_pin": "KRA001",
                "preferred_primary_care_network": "pumwani",
                "employment_type": "Employed",
                "identification_type": "National ID",
                "identification_number": "xxxxxxxx",
                "other_identifications": [
                    {
                        "identification_type": "House Hold Number",
                        "identification_number": "HHxxxxxxxxxx"
                    },
                    {
                        "identification_type": "SHA Number",
                        "identification_number": "SHAxxxxxxxxxxxxx-2"
                    }
                ],
                "is_alive": 0,
                "deceased_datetime": "2024-09-05 13:58:54",
                "country": "Kenya",
                "county": "Nairobi",
                "sub_county": "Kasarani",
                "ward": "kasarani",
                "village_estate": "test",
                "building_house_no": "test-house-number",
                "disability_category": "physical",
                "disability_subcategory": "handicapped",
                "disability_cause": "accident"
            }
        ]
    }
}
```

### Params

|Name|Location|Type|Required|Description|
|---|---|---|---|---|
|identification_type|query|string| no |none|
|identification_number|query|string| no |none|
|agent|query|string| no |none|

> Response Examples

> 200 Response

```json
{}
```

### Responses

|HTTP Status Code |Meaning|Description|Data schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### Responses Data Schema

## GET Search Facility

GET /v1/facility-search

# Search Organization

## Description
This endpoint allows users to search for healthcare organizations (facilities) based on various criteria. It returns a list of matching facilities along with relevant details such as name, location, and contact information.

## Endpoint
**Method:** `GET`
**URL:** `{{base_url}}/v1/facility-search?facility_code={{facility_code}}`

| Variable                | Description                                                 | Example                           |
|-------------------------|-------------------------------------------------------------|-----------------------------------|
| `{{base_url}}`         | The base URL of the API server.                            | `https://uat.dha.go.ke`        |
| `{{facility_code}}`         | The facility code of searched facility.                            | `24979`        |

## Request

### Query Parameters

| Parameter       | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `facility_code`        | string | ✅ Yes | Search by facility code e.g 24979 |

### Authorization
### Headers
The request must include an authentication token obtained from the **Generate JWT Token** endpoint.

| Header Key       | Value Format      | Required | Description |
|-----------------|------------------|----------|-------------|
| `Authorization` | `Bearer <jwt-token>` | ✅ Yes | A valid JWT token for authentication. |
| `Content-Type`  | `application/json`   | ✅ Yes  | Specifies that the request body is in JSON format. |

### Example Request
```sh
curl -X GET "https://uat.dha.go.ke/v1/facility-search?facility_code=24979" \
     -H "Authorization: Bearer <jwt-token>" \
     -H "Content-Type: application/json" 
    ```
     
## Example Response
### Success (200) ✅
```json
{
    "message": {
        "facility_code": "24749",
        "found": 1,
        "approved": null,
        "facility_level": null,
        "operational_status": null,
        "current_license_expiry_date": ""
    }
}

```

     
     
     

### Params

|Name|Location|Type|Required|Description|
|---|---|---|---|---|
|facility_code|query|string| no |The facility code of the Facility to be search|

> Response Examples

> 200 Response

```json
{}
```

### Responses

|HTTP Status Code |Meaning|Description|Data schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### Responses Data Schema

## GET Search Practitioner

GET /v1/practitioner-search

# Search Practitioner
## Description
This endpoint allows users to search for healthcare practitioners (doctors) by their **National ID** . It retrieves key details about the practitioner, including their name, registration details, and specialization.

## Endpoint
**Method:** `GET`
**URL:** `{{base_url}}/v1/practitioner-search?identification_type=passport&identification_number=xxxxxxxx`

| Variable                | Description                                                 | Example                           |
|-------------------------|-------------------------------------------------------------|-----------------------------------|
| `{{base_url}}`         | The base URL of the API server.                            | `https://uat.dha.go.ke`        |
| `{{identification_type}}`         | The identification type to be used in searching for the practitioner                            | `passport`,`ID`        |
| `{{identification_number}}}`         | This is the identification number for the practitioner                            | `409824979`        |

## Request

### Query Parameters

| Parameter        | Type   | Required | Description |
|-----------------|--------|----------|-------------|
| `{{identification_number}}`   | string | ✅ Yes  | Search by National ID of the practitioner. |
| `{{identification_type}}` | string | ✅ Yes  | Search by the type of identification used |

> **Note:** Both of the query parameters (`identification_number` or `identification_type`) must be provided.

### Authorization
### Headers
The request must include an authentication token obtained from the **Generate JWT Token** endpoint.

| Header Key       | Value Format         | Required | Description |
|-----------------|---------------------|----------|-------------|
| `Authorization` | `Bearer <jwt-token>` | ✅ Yes  | A valid JWT token for authentication. |
| `Content-Type`  | `application/json`   | ✅ Yes  | Specifies that the request body is in JSON format. |

## Example Request
```sh
curl -X GET "https://uat.dha.go.ke/v1/practitioner-search?national-id=123456789" \
     -H "Authorization: Bearer <jwt-token>" \
     -H "Content-Type: application/json"
  ```

##  Response
```json{
    "message": {
        "registration_number": 40675898,
        "found": 1,
        "is_active": yes
    }
}
```

### Params

|Name|Location|Type|Required|Description|
|---|---|---|---|---|
|national-id|query|string| no |none|

> Response Examples

> 200 Response

```json
{}
```

### Responses

|HTTP Status Code |Meaning|Description|Data schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### Responses Data Schema

# Kenya Digital Superhighway/Claims

## GET Fetch Claim Status

GET /v1/shr-med/claim-status

# Fetch Claim Status

## Description
This endpoint retrieves the status of a medical claim.

## Endpoint
**Method:** `GET`
**URL:** `https://uat.dha.go.ke/v1/shr-med/claim-status`
{{base_url}}/v1/shr-med/claim-status?claim_id={{claim_id}}?bundle_id={{bundle_id}}

| Variable                | Description                                                 | Example                           |
|-------------------------|-------------------------------------------------------------|-----------------------------------|
| `{{base_url}}`         | The base URL of the API server.                            | `https://uat.dha.go.ke`        |
| `{{claim_id}}`         | The ID of the medical claim                             | `86768e20-9148-4d9a-a5c2-346e67a693382`        |
| `{{bundle_id}}`         | The Bundle ID of the medical claim                             | `8657e59-148-4d9a-a5c2-346e67a693382`        |

## Request

### Query Parameters

| Parameter       | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `claim_id`        | string | ✅ Yes | Search by the claim_id e.g `86768e20-9148-4d9a-a5c2-346e67a69338` |
| `bundle_id`        | string | ✅ Yes | Search by the bundle_id e.g `86768e20-9148-4d9a-a5c2-346e67a69338` |

### Authorization
### Headers
The request must include an authentication token obtained from the **Generate JWT Token** endpoint.

| Header Key       | Value Format      | Required | Description |
|-----------------|------------------|----------|-------------|
| `Authorization` | `Bearer <jwt-token>` | ✅ Yes | A valid JWT token for authentication. |
| `Content-Type`  | `application/json`   | ✅ Yes  | Specifies that the request body is in JSON format. |ent-Type: application/json

## Example Request (cURL)
```bash
curl -X GET "https://uat.dha.go.ke/v1/shr-med/claim-status" \
  -H "Authorization: Basic <base64_encoded_username:password>" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json"
```

## Example Response (JSON)
```json
{
    "message": "draft"
}
```

> Response Examples

> 200 Response

```json
{}
```

### Responses

|HTTP Status Code |Meaning|Description|Data schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### Responses Data Schema

## POST Submit Claim-SHR Mediator

POST /v1/shr-med/bundle

# Submit Claim

## Description
This endpoint processes an SHR Mediator bundle containing patient, coverage, and claim information.

## Endpoint
**Method:** `POST`
**URL:** `{{base_url}}/v1/shr-med/post-bundle`

| Variable                | Description  | Example  |
|-------------------------|-------------------------------------------------------------|-----------------------------------|
| `{{base_url}}`         | The base URL of the API server.                            | `https://uat.dha.go.ke`        |

## Request

### Authorization
This request requires **Basic Authentication**. Ensure you provide the correct credentials from the **Kenya Digital Superhighway** and include a valid JWT token generated from the **Generate JWT Token** endpoint in the request headers.
### Headers
The request must include an authentication token obtained from the **Generate JWT Token** endpoint.

| Header Key       | Value Format      | Required | Description |
|-----------------|------------------|----------|-------------|
| `Authorization` | `Bearer <jwt-token>` | ✅ Yes | A valid JWT token for authentication. |
| `Content-Type`  | `application/json`   | ✅ Yes  | Specifies that the request body is in JSON format. |ent-Type: application/json

## Sample Body

``` json
{
  "id": "86768e20-9148-4d9a-a5c2-346e67a69338",
  "agent": "SAFARICOM-CONSORTIUM-SANDBOX",
  "timestamp": "2025-01-27T12:19:00.073496",
  "type": "message",
  "resourceType": "Bundle",
  "entry": [
    {
      "resourceType": "Organization",
      "id": "FID-22-101101-0",
      "name": "IngosiOchodo Hospital",
      "active": true,
      "facilityLevel": "LEVEL 4",
      "identifier": "FID-22-101101-0"
    },
    {
      "resourceType": "Coverage",
      "identifier": "CR6164711105276-6-sha-coverage",
      "status": "active",
      "schemeCategory": "SOCIAL HEALTH AUTHORITY",
      "beneficiary": "Patient/CR3257877068995-0"
    },
    {
      "resourceType": "Patient",
      "id": "CR3257877068995-0",
      "name": "FATUMA MOHAMMED",
      "gender": "female",
      "birthDate": "1965-12-31"
    },
    {
      "resourceType": "Claim",
      "id": "a0016666-8137-47c1-b90c-c8e7c3094a28",
      "status": "active",
      "type": "institutional",
      "subType": "op",
      "patient": "CR3257877068995-0",
      "billablePeriod": {
        "start": "2025-01-28T00:00:00",
        "end": "2025-01-29T00:00:00"
      },
      "insurance": "CR6164711105276-6-sha-coverage",
      "provider": "FID-22-101101-0",
      "diagnosis": {
        "code": "1A00",
        "display": "Cholera"
      },
      "item": {
        "productOrService": "SHA-02-005",
        "quantity": 1,
        "unitPrice": 764.0,
        "currency": "KES",
        "category": "Procedure"
      },
      "total": {
        "value": 764.0,
        "currency": "KES"
      }
    }
  ]
}

```

## Example Request (cURL)
```bash
curl -X POST "https://api-uat.tiberbu.health/v1/shr-med/post-bundle" \
  -H "Authorization: Basic <base64_encoded_username:password>" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patient": {
      "id": "12345",
      "name": "John Doe",
      "dob": "1990-05-15"
    },
    "coverage": {
      "policy_number": "ABC123",
      "provider": "HealthInsure Ltd"
    },
    "claim": {
      "claim_id": "67890",
      "amount": 50000,
      "currency": "KES",
      "status": "submitted"
    }
  }'
```

## Example Response (JSON)
```json
{
    "message": {
        "mediator_id": "86768e20-9148-4d9a-a5c2-346e67a69338",
        "message": "Use this reference ID to use for Polling for the status of your Claim."
    }
}
```

> Response Examples

> 200 Response

```json
{}
```

### Responses

|HTTP Status Code |Meaning|Description|Data schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### Responses Data Schema

# Data Schema

