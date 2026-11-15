<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for REP-IMM-001 Immediate Disease Reporting.
Use: Retest the GET endpoints and attach contemporaneous screenshots before portal submission.
Inputs: Staging Facility 13, Patient 402, Cholera case 418, and CountyNotificationDelivery 6.
-->

# REP-IMM-001 — Immediate Disease Reporting

**Status:** County transport evidence captured in staging.
**Synthetic scenario:** Lab-confirmed Cholera case `418` for Patient `402`.

| Portal field | Value |
| --- | --- |
| HTTP method | `GET` |
| Primary URL | `https://staging-api.vitora.digital/api/surveillance/cases/418/` |
| Delivery evidence | `https://staging-api.vitora.digital/api/surveillance/cases/418/notification_deliveries/` |
| Required header | `X-Facility-ID: 13` |
| Expected result | Case `NOTIFIED`; email delivery `6` with provider `smtp` and status `DELIVERED`. |

The evidence marker is `DHA-CERT-D2-2026-F13-P402`. The delivery recipient is intentionally redacted from stored portal artefacts.

Before submission, capture the case-detail UI, county-delivery ledger, and audit-log record. A county acknowledgement is additional evidence when available; SMTP acceptance/delivery must not be represented as a county acknowledgement.
