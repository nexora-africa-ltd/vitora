# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.

<!--
Purpose: DHA-facing specification for immediate reportable disease notification in Vitora HMIS.
Use: Configure facility notification settings and train authorized users on immediate-case reporting.
Inputs: Active notifiable-disease catalogue, facility county notification settings, SMS/email configuration, and county contact records.
-->

# Disease Reporting Specification

**System:** Vitora HMIS Surveillance Module
**Reporting basis:** Kenya MOH notifiable-disease categories and facility-configured reporting timelines

## 1. Reporting Categories

Vitora maintains a reference catalogue of notifiable diseases with ICD-10 mappings and one of three reporting categories:

| Category  | System Meaning                                                                               | Reporting Handling                                                           |
| --------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Immediate | Individual notification required within the disease-configured deadline; default is 24 hours | Case alert, county notification workflow, delivery tracking, acknowledgement |
| Weekly    | Aggregate weekly IDSR reporting                                                              | Included in IDSR weekly report                                               |
| Monthly   | Aggregate monthly reporting                                                                  | Available for applicable aggregate reporting workflows                       |

The disease catalogue stores `reporting_hours`; facility governance must ensure the active catalogue and reporting timelines match the current applicable MOH guidance.

## 2. Immediate Notification Mechanism

1. A clinician records a diagnosis in an encounter.
2. When an active diagnosis ICD-10 code matches an active NotifiableDisease mapping, Vitora creates a facility-scoped `NotifiableCase` and prevents duplicate patient/encounter/disease cases.
3. For immediate diseases, Vitora creates a surveillance alert, calculates the notification deadline, and publishes real-time alert data to authorized surveillance consumers.
4. An authorized user reviews the case and sends the official county notification through:

```text
POST /api/surveillance/cases/{id}/notify_county/
```

5. The system sends configured SMS and/or email notification channels, persists delivery state, and records notification actions.
6. County recipients can acknowledge an email notification using a signed acknowledgement URL. A successful acknowledgement updates the case workflow and audit trail.

Routine weekly cases are not submitted through the individual county-notification endpoint; they are aggregated through the IDSR workflow.

## 3. Workflow And Accountability

```text
PENDING -> NOTIFIED -> ACKNOWLEDGED -> INVESTIGATED -> CLOSED
```

| Role                          | Responsibility                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Clinician / reporting officer | Record complete diagnosis/case information and escalate immediate cases promptly                      |
| Surveillance officer          | Review alerts, dispatch county notification, monitor delivery status, initiate investigation workflow |
| Facility administrator        | Maintain county notification channels and authorized recipients                                       |
| County recipient              | Acknowledge receipt and coordinate follow-up under applicable public-health procedure                 |
| System administrator          | Maintain secure SMS/email integration and webhook configuration                                       |

## 4. Notification Channels And Delivery Evidence

Facility settings control whether SMS and email are enabled, recipient lists, whether direct identifiers are included, retry configuration, and retry backoff. Delivery records use statuses including:

```text
PENDING, SENT, DELIVERED, BOUNCED, RETRY_SCHEDULED, FAILED
```

Email acceptance alone may return `202 Accepted`; the case remains pending until a configured provider delivery webhook confirms delivery. SMS `SENT` is treated as an accepted county transport. Failed/scheduled deliveries can be retried through the authorized case workflow.

## 5. Compliance And Configuration Preconditions

- At least one county notification channel and valid recipient must be configured, otherwise county notification is rejected.
- SMS notification requires an active configured SMS provider.
- Email delivery confirmation requires a configured signed provider webhook; production webhook validation requires `RESEND_WEBHOOK_SECRET`.
- Notification recipients, county routing, and disease catalogue content are operational configuration and must be reviewed by the facility and county public-health authority.
- The system supports and records notification activity; it does not replace clinical judgement, statutory reporting duties, county escalation procedures, or MOH direction.

## 6. Audit And Evidence

Vitora records case creation/notification workflow actions and county acknowledgements. Sensitive patient access to surveillance-linked patient records remains governed by sensitive-access controls and audit logging. Facilities should retain case, notification, delivery, acknowledgement, and investigation evidence according to applicable public-health and records-retention requirements.
