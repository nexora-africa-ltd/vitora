# Authentication and Authorization

_Version: `1.0.0`_
API for user authentication and token management.

**Servers:**
- `https://ilm-dev.dha.go.ke/uat-middleware`

## Table of Contents

- [Authentication](#authentication)

## Authentication

Operations related to user authentication and token management.

### POST /api/v1/tenants/token

**Generate access token**

This endpoint allows a user to obtain an access token by providing their credentials. It leverages the OpenID Connect and OAuth2 protocols to ensure secure authentication and authorization. The access token can then be used to access protected resources within the system.

_Tags: `Authentication`_
_Operation ID: `authenticateUser`_

**Request Body:**
Tenant credentials
_Required._

_Content-Type: `application/x-www-form-urlencoded`_
```json
{
  "client_id": "string",
  "client_secret": "string"
}
```

**Responses:**
**Response `201`** — Created
_Content-Type: `application/json`_
```json
{
  "access_token": "string",
  "expires_in": 0,
  "token_type": "string"
}
```

**Response `400`** — Bad Request
_Content-Type: `application/json`_
```json
{
  "error": "string",
  "message": "string"
}
```

**Response `409`** — Conflict
_Content-Type: `application/json`_

**Response `500`** — Internal Server Error
_Content-Type: `application/json`_
