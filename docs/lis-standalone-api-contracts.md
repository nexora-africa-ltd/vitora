# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
What this file is for:
- Formal API contract reference for LIS Standalone interoperability workflows (WS3).

How to use it:
- Use as the backend/frontend integration contract for inbound orders, mapping validation,
  dead-letter replay, and outbound result delivery.

Supported inputs/args:
- None (documentation artifact).
-->

# LIS Standalone API Contracts (WS3)

## Scope

- Base path: `/api/lab/standalone/`
- Deployment profile: `lis_standalone`
- Auth: authenticated user with standalone LIS permissions

## 1) Inbound Order Intake (Idempotent)

### Endpoint

- `POST /api/lab/standalone/interop/inbound-orders/`

### Headers

- Optional: `X-Idempotency-Key: <client-generated-uuid>`

### Request (HL7)

```json
{
  "source_system": "EXT_LIS",
  "channel": "HL7",
  "message_format": "HL7",
  "hl7_message": "MSH|^~\\&|ExternalLIS|Kenyatta Lab|VitoraLIS|Demo Clinic|20260507||ORM^O01|MSG001|P|2.5\rPID|1||PAT001||Wanjiku^Jane||19900615|F\rORC|NW|ORD12345|||ROUTINE|||R\rOBR|1|ORD12345||CBC^Complete Blood Count"
}
```

### Request (JSON)

```json
{
  "source_system": "EXT_LIS",
  "channel": "API",
  "message_format": "JSON",
  "payload": {
    "patient": {
      "external_patient_id": "PAT-9921",
      "name": "Jane Wanjiku",
      "dob": "1990-06-15",
      "gender": "F",
      "id_number": "12345678"
    },
    "order": {
      "message_control_id": "MSG-API-001",
      "placer_order_number": "ORD-API-001",
      "sending_application": "EXT_LIS",
      "sending_facility": "Nairobi Lab",
      "priority": "ROUTINE",
      "clinical_info": "Suspected anemia"
    },
    "tests": [
      { "code": "CBC", "name": "Complete Blood Count" }
    ]
  }
}
```

### Success (201)

```json
{
  "trace_id": "d6cc4764-4370-4cce-a6f8-1cc33b404582",
  "event_id": 42,
  "external_order": {
    "id": 101,
    "trace_id": "d6cc4764-4370-4cce-a6f8-1cc33b404582",
    "message_control_id": "MSG001",
    "placer_order_number": "ORD12345",
    "status": "RECEIVED"
  }
}
```

### Idempotent Replay (200)

```json
{
  "trace_id": "d6cc4764-4370-4cce-a6f8-1cc33b404582",
  "status": "idempotent_replay",
  "external_order": {
    "id": 101,
    "status": "RECEIVED"
  }
}
```

### Failure (400, dead-letter recorded)

```json
{
  "detail": "Inbound ingestion failed and was added to dead-letter queue.",
  "event_id": 43,
  "trace_id": "52ad3f95-21b4-4ec4-ac37-95ef44087f9c",
  "error": "<parse-or-validation-error>"
}
```

## 2) Dead-Letter Queue and Replay

### List ingestion events

- `GET /api/lab/standalone/interop/inbound-events/`

### Replay failed event

- `POST /api/lab/standalone/interop/inbound-events/{id}/replay/`

Success:

```json
{
  "status": "replayed",
  "trace_id": "d6cc4764-4370-4cce-a6f8-1cc33b404582",
  "external_order": {
    "id": 101,
    "status": "RECEIVED"
  }
}
```

## 3) External Patient Identifier Crosswalk

### List crosswalk entries

- `GET /api/lab/standalone/interop/crosswalk/`

Example row:

```json
{
  "id": 1,
  "source_system": "EXT_LIS",
  "external_patient_id": "PAT001",
  "external_member_id": "",
  "patient_name_snapshot": "Jane Wanjiku",
  "walkin_patient": 7,
  "patient": null,
  "created_at": "2026-09-04T17:00:00Z",
  "updated_at": "2026-09-04T17:00:00Z"
}
```

## 4) Message Mapping Configuration and Validation

### Create/Update mapping

- `POST /api/lab/standalone/interop/mappings/`

Request:

```json
{
  "code_system": "EXT_LIS",
  "external_code": "EXT-CBC-01",
  "external_display": "External CBC",
  "relationship": "EQUIVALENT",
  "is_active": true,
  "notes": "Partner v2 map",
  "test_code": "CBC"
}
```

### List mappings

- `GET /api/lab/standalone/interop/mappings/?code_system=EXT_LIS`

### Delete mapping

- `DELETE /api/lab/standalone/interop/mappings/{id}/`

### Validate message mapping preview

- `POST /api/lab/standalone/interop/mappings/validate/`

Request:

```json
{
  "source_system": "EXT_LIS",
  "message_format": "JSON",
  "payload": {
    "tests": [
      { "code": "EXT-CBC-01" },
      { "code": "UNKNOWN" }
    ]
  }
}
```

Response:

```json
{
  "source_system": "EXT_LIS",
  "total_codes": 2,
  "mapped_count": 1,
  "unmapped_count": 1,
  "mappings": [
    {
      "external_code": "EXT-CBC-01",
      "mapped": true,
      "mapping_source": "external_code_mapping",
      "test_code": "CBC",
      "test_name": "Complete Blood Count",
      "reason": "Mapped via ExternalCodeMapping"
    },
    {
      "external_code": "UNKNOWN",
      "mapped": false,
      "mapping_source": "none",
      "test_code": null,
      "test_name": null,
      "reason": "No mapping found"
    }
  ]
}
```

## 5) Outbound Result Delivery and Reconciliation

### Trigger delivery for an external order

- `POST /api/lab/standalone/external-orders/{id}/deliver-result/`

Request (webhook):

```json
{
  "channel": "WEBHOOK",
  "destination": "https://partner.example.org/his/lab-results"
}
```

Request (PDF package):

```json
{
  "channel": "PDF_PACKAGE"
}
```

Response:

```json
{
  "id": 55,
  "trace_id": "7a8d70a7-cfc7-4b66-bb2f-90f55fb5017d",
  "channel": "WEBHOOK",
  "status": "DELIVERED",
  "destination": "https://partner.example.org/his/lab-results",
  "response_status_code": 200,
  "response_body": "OK",
  "error_message": "",
  "attempt_count": 1,
  "delivered_at": "2026-09-04T17:05:01Z"
}
```

### List delivery logs

- `GET /api/lab/standalone/interop/delivery-logs/`

### Download generated PDF package

- `GET /api/lab/standalone/interop/delivery-logs/{id}/download-pdf/`

Returns `application/pdf`.

## Status and Channel Enums

- Inbound status: `RECEIVED | MAPPED | FAILED | REPLAYED`
- External order status: `RECEIVED | ACCEPTED | REJECTED | PROCESSING | COMPLETED`
- Delivery channel: `WEBHOOK | PDF_PACKAGE | HL7_FHIR`
- Delivery status: `PENDING | DELIVERED | FAILED`
