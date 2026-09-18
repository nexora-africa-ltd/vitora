# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: Defines Vitora's facility-aware transactional email architecture.
Use: Implement facility SMTP, Resend default delivery, and notification audit records.
Inputs: Facility email settings, encrypted SMTP credentials, notification payloads, and Resend environment settings.
-->

# Facility-Aware Email Notifications Implementation Guide

## Implementation Status

The backend foundation is implemented: `FacilityEmailConfig` provides
facility-scoped KMS-encrypted SMTP credentials, `send_transactional_email()`
selects facility SMTP when Custom Email is enabled, and
`/api/core/facility-email-config/` provides tenant-scoped configuration plus an
 SMTP connection-test action. Facility-scoped stock and critical-lab alert
 recipients are implemented. Delivery ledger records and migration of all email
 callers to pass facility context remain follow-up work.

## Alert Recipient Routing

`pharmacy.AlertSettings` is facility-scoped. The legacy
`/api/pharmacy/alert-settings/` URL resolves the authenticated user's active
facility and returns or creates only that facility's record. It stores separate
recipient sets for `stock_alert_roles` / `stock_alert_users`.

`laboratory.LaboratoryAlertSettings` owns critical result escalation routing.
`/api/lab/settings/alerts/` resolves the active facility and returns or creates
that facility's configuration, with `lab_critical_alert_roles` and
`lab_critical_alert_users`. This keeps pharmacy stock routing and clinical
laboratory escalation configuration independently deployable and auditable.

Configured roles resolve to active staff whose primary or secondary role
matches and whose primary or secondary facility is the active facility.
Explicit users are subject to the same facility assignment check. This prevents
cross-facility escalation even when a user or role is mistakenly selected.

### Pharmacy Stock Digest Batching

When `enable_email_notifications` is enabled, pharmacy stock events keep their
in-app notification and queue a single Celery task for the active facility.
`stock_alert_digest_minutes` defaults to 15 minutes and can be configured from
the Pharmacy Stock Alert Settings dialog. The Celery task receives only the
facility ID, loads only unresolved `LOW_STOCK` and `OUT_OF_STOCK` alerts for
that facility, and sends one digest to each unique configured recipient.

The digest groups the complete count by severity and type, lists at most 100
items, and reports the remaining count. It contains operational stock details
only, never patient data. `StockAlert.stock_digest_sent_at` is updated only
after every recipient accepts delivery, so duplicate/retried tasks skip
completed alerts. Every digest calls `send_transactional_email` with the
facility to preserve Custom Email transport selection.

Stock batch alerts and scheduled expiry alerts retain the batch or prescription
facility and organization; deduplication includes that facility. Critical lab
results always retain the ordering clinician's in-app notification and email.
They additionally send in-app and email escalations to the configured facility
recipients, deduplicated by user. Every critical-lab email calls
`send_transactional_email(..., facility=lab_order.facility)` so the facility
sender policy applies. Nexora lifecycle email routing is intentionally unchanged.

### Facility Admin Setup

1. Switch to the target facility in the application.
2. Open Pharmacy, then Stock Alerts, and select **Settings** to configure
   Pharmacy Stock Alert Recipients.
3. Open Laboratory, then Settings and the **Alerts** tab to configure Critical
   Result Escalation recipients.
4. Select roles and/or assigned staff and save. The server rejects staff not assigned to that
   facility.

## Decision

Vitora sends transactional email through one of two providers selected from the
notification's facility:

| Facility Custom Email toggle | Delivery provider | Sender | Fallback |
| --- | --- | --- | --- |
| Off | Resend | `noreply@vitora.digital` | Not applicable |
| On | Facility SMTP | Facility-configured address | Never use Resend |

The Custom Email toggle is authoritative. A facility with Custom Email enabled
must never have a message silently sent through Resend. This preserves the
facility's sender identity and avoids duplicate sends after ambiguous SMTP
timeouts.

## Scope

- Deliver transactional messages: invitations, password resets, appointment
  reminders, operational alerts, billing messages, and stock-alert digests.
- Resolve the provider, sender identity, recipients, and notification
  preferences from a facility-scoped configuration.
- Encrypt facility SMTP credentials with Vitora's existing KMS provider, as
  used by eTIMS and DHIS2 credentials.
- Dispatch sends asynchronously through Celery and retain minimal delivery
  metadata for audit and troubleshooting.
- Exclude message content and credentials from logs, Celery arguments, audit
  details, and delivery records.

## Non-Goals

- Do not use deployment-wide SMTP environment variables for facilities.
- Do not expose an SMTP password or its encrypted value in any API response.
- Do not support automatic cross-provider fallback from facility SMTP to
  Resend.
- Do not use email for unnecessary clinical information or sensitive patient
  data. Templates should link authenticated staff to Vitora for details.

## Configuration Model

### Shared Deployment Configuration

These values apply only to the Resend default path and remain deployment-wide:

```python
# hmis/settings/base.py
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@vitora.digital")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
```

```bash
# backend/.env
DEFAULT_FROM_EMAIL=noreply@vitora.digital
RESEND_API_KEY=...
```

Do not add `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, or
`EMAIL_HOST_PASSWORD` to `base.py` or `.env`. A deployment environment file is
global and cannot safely represent different SMTP accounts for different
facilities.

### Facility Module Setting

Add `has_custom_email` to the facility module/settings model. It is false by
default and appears in the facility module map, facility create/detail
serializers, and Django admin's Enabled Service Modules section. It controls
whether the facility may configure Custom Email.

`FacilityEmailConfig.custom_email_enabled` is the separate delivery toggle. It
can be enabled only when the facility has one active, healthy SMTP configuration
that has passed a controlled test send.

Only a facility administrator with the appropriate configuration permission may
change this toggle. Backend validation must enforce this rule even if a client
calls the API directly.

### Facility SMTP Configuration

Create one `FacilityEmailConfig` record per facility. It must inherit from
`FacilityScopedModel` and enforce a unique facility constraint.

| Field | Purpose |
| --- | --- |
| `facility` | Tenant scope and provider-resolution key |
| `smtp_host` | SMTP hostname |
| `smtp_port` | SMTP service port |
| `security_mode` | `STARTTLS` or `SSL_TLS`; no plaintext mode |
| `smtp_username` | Dedicated SMTP account username |
| `smtp_password_encrypted` | KMS ciphertext, never serialized |
| `from_address` | Address permitted by the SMTP account |
| `from_display_name` | Facility-facing sender name |
| `reply_to_address` | Monitored facility reply address |
| `status` | `UNCONFIGURED`, `TESTING`, `HEALTHY`, `UNHEALTHY`, or `DISABLED` |
| `last_tested_at` / `last_test_error` | Safe health information; redact secrets |
| `created_by` / `updated_by` | Configuration audit attribution |

Use an encrypted property pattern consistent with `ETIMSConfig.api_key` and
`DHIS2Config.set_password()` / `get_password()`:

```python
smtp_password_encrypted = models.TextField(blank=True, default="")

@property
def smtp_password(self) -> str:
    if not self.smtp_password_encrypted:
        return ""
    return get_kms_provider().decrypt_string(self.smtp_password_encrypted)

@smtp_password.setter
def smtp_password(self, value: str) -> None:
    self.smtp_password_encrypted = (
        get_kms_provider().encrypt_string(value) if value else ""
    )
```

Serializers accept an optional write-only `smtp_password`. Read serializers
return `password_configured: bool` only. Django admin must not display the
encrypted field or decrypted password.

### SMTP Provider Presets

`GET /api/core/facility-email-config/providers/` returns safe metadata for
Gmail, Microsoft 365/Outlook, Yahoo Mail, Zoho Mail, and Custom SMTP. The
frontend can populate host, port, and TLS mode after selection, then asks the
administrator for the username, From address, and app password. Presets never
contain credentials and do not bypass the connection-test requirement.

### Notification Preferences and Recipients

Move stock-alert email recipients and enablement from global `AlertSettings` to
a facility-scoped preference/configuration record. Recipients belong to the
facility that owns the alert, not to the deployment.

At minimum, store:

- `facility`
- `stock_alerts_enabled`
- `stock_alert_recipients`
- `daily_digest_enabled`
- `daily_digest_recipients`
- `notification_timezone`

Validate and normalize recipients when saving. Recipients must be authorized
facility operational contacts; do not use patient email addresses for internal
stock alerts.

## Provider Resolution and Delivery

### Provider Selector

Create a single facility-aware notification service. Feature code creates a
notification request; it must not call Django `send_mail()` directly.

```python
def resolve_email_provider(facility):
    if not facility.modules.custom_email_enabled:
        return ResendEmailProvider(
            from_address=settings.DEFAULT_FROM_EMAIL,
            api_key=settings.RESEND_API_KEY,
        )

    config = FacilityEmailConfig.objects.get(
        facility=facility,
        status=FacilityEmailStatus.HEALTHY,
    )
    return SMTPEmailProvider(config=config)
```

If Custom Email is enabled and no healthy SMTP configuration exists, fail the
request with a configuration error and create an operational alert. Do not
return the Resend provider.

### SMTP Delivery

The SMTP provider creates a connection for the selected facility at send time.
It does not use Django's process-wide email settings.

```python
connection = get_connection(
    backend="django.core.mail.backends.smtp.EmailBackend",
    host=config.smtp_host,
    port=config.smtp_port,
    username=config.smtp_username,
    password=config.smtp_password,
    use_tls=config.security_mode == "STARTTLS",
    use_ssl=config.security_mode == "SSL_TLS",
    fail_silently=False,
)
```

Decrypt the password only immediately before opening the connection. Never pass
the password, config object, or complete SMTP settings to a Celery task; pass
only the notification delivery ID.

### Delivery Record

Create a facility-scoped `EmailDelivery` record before enqueuing a send.

| Field | Purpose |
| --- | --- |
| `facility` | Tenant scope |
| `category` | `PASSWORD_RESET`, `INVITATION`, `STOCK_ALERT`, and similar |
| `provider` | `RESEND` or `SMTP` |
| `from_address` | Actual sender used |
| `from_display_name` / `reply_to_address` | Sender identity resolved at enqueue time |
| `recipient_count` | Delivery volume without persisting email body |
| `status` | `PENDING`, `SENDING`, `SENT`, `FAILED`, or `UNKNOWN` |
| `provider_message_id` | Provider correlation ID where available |
| `error_code` / `error_message` | Sanitized failure diagnosis |
| `attempt_count` / timestamps | Retry and operational history |

Do not persist the full email body. Store recipient addresses only when there
is a documented operational/audit requirement and protect them as personal data.

### Retry and Failure Rules

| Condition | Required action |
| --- | --- |
| Resend default path fails before acceptance | Retry Resend with bounded exponential backoff |
| Facility SMTP explicitly rejects the message | Retry facility SMTP with bounded exponential backoff |
| SMTP timeout or network loss after submission | Mark `UNKNOWN`; do not resend through any provider automatically |
| SMTP credentials invalid | Mark the facility config `UNHEALTHY`, notify facility admins, stop retries |
| Custom Email disabled | Use Resend for new delivery records only |

Retries use the original selected provider. A later toggle change must not alter
the provider for an already-created delivery record.

## Celery Workflow

Feature code enqueues a facility-aware delivery rather than a raw email:

```python
provider = resolve_email_provider(alert.facility)
delivery = EmailDelivery.objects.create(
    facility=alert.facility,
    category=EmailCategory.STOCK_ALERT,
    provider=provider.kind,
    from_address=provider.from_address,
    from_display_name=provider.from_display_name,
    reply_to_address=provider.reply_to_address,
    recipient_count=len(recipients),
    status=EmailDeliveryStatus.PENDING,
)
send_email_delivery.delay(delivery.pk)
```

The worker reloads the delivery and its facility, renders the template, resolves
or verifies the provider recorded on the delivery, sends the message, and
updates delivery state. It must use structured logging with delivery ID,
facility ID, provider, category, and failure class only.

For daily stock digests, the scheduled task iterates facilities with
`daily_digest_enabled=True`. Each facility query and recipient list must be
filtered by that facility before creating a delivery.

## Stock Alert Integration

Do not override `StockAlert.save()` to create email side effects. Publish a
domain event or invoke a service after the transaction commits when a critical
alert is created. The handler must:

1. Resolve the alert's facility.
2. Load that facility's stock-alert preference.
3. Exit if stock-alert email is disabled or no facility recipients exist.
4. Create an `EmailDelivery` record using the selected provider.
5. Queue the delivery by ID with `transaction.on_commit()`.

This prevents worker tasks from observing uncommitted alerts and makes sending
auditable and idempotent.

## Templates

Keep templates provider-neutral. They receive facility branding and safe
operational context, not provider configuration or credentials.

Required template context:

```python
{
    "facility_name": facility.name,
    "from_display_name": delivery.from_display_name,
    "dashboard_url": f"{settings.FRONTEND_URL}/pharmacy?tab=alerts",
    "alert_type": alert.get_alert_type_display(),
    "severity": alert.get_severity_display(),
    "drug_name": alert.drug.get_display_name(),
    "created_at": alert.created_at,
}
```

Use separate HTML and plain-text templates. Keep the body limited to the
minimum operational information required to prompt a staff member to sign in.

## API, Permissions, and Audit Requirements

- Use `TenantScopedViewMixin` with `tenant_scope = "facility"` for SMTP
  configuration, preferences, and delivery history.
- Allow facility administrators to create, update, test, disable, and rotate
  their facility configuration.
- Do not permit normal clinical users to retrieve SMTP settings or delivery
  history unless their role explicitly grants access.
- Enforce delete permissions in every `destroy()` method.
- Audit configuration creation, update, test, toggle change, disablement, and
  password rotation. Audit metadata must state that a password changed, never
  its value or ciphertext.
- Validate the From address and reply-to address; require the SMTP account to
  be authorized to send as the configured From address.

## Tests

Write tests before implementation. Place them under `backend/tests/core/` or a
focused notifications subdirectory, never at the root of `backend/tests/`.

Required coverage:

- Facility A's SMTP configuration is not visible or usable by Facility B.
- Custom Email off selects Resend and `noreply@vitora.digital`.
- Custom Email on selects only healthy SMTP for the alert's facility.
- Enabling Custom Email without a successful SMTP test returns validation error.
- An SMTP password is encrypted at rest, never serialized, and can be rotated.
- SMTP connections use the selected facility settings, not global Django SMTP
  settings.
- A facility SMTP failure never invokes Resend.
- SMTP timeout becomes `UNKNOWN` and does not create a duplicate attempt.
- Delivery records retain provider/sender/status but omit message-body and
  credential data.
- Stock alert and daily digest queries use facility-specific recipients only.
- Unauthorized users receive `403` for configuration, testing, and deletion.

## Deployment Checklist

- [ ] Keep `RESEND_API_KEY` and `DEFAULT_FROM_EMAIL=noreply@vitora.digital` in
  the shared deployment environment.
- [ ] Do not deploy global SMTP host, username, or password variables.
- [ ] Apply migrations for facility SMTP configuration, preferences, and
  delivery records.
- [ ] Grant facility-admin permissions for email configuration and testing.
- [ ] Configure Celery workers and beat for asynchronous delivery and digests.
- [ ] Add monitoring for failed/unknown delivery states and unhealthy SMTP
  configurations.
- [ ] Verify KMS availability before enabling Custom Email.
- [ ] Test Resend default delivery and a facility SMTP delivery in staging.
- [ ] Verify no cross-facility recipient, sender, or configuration leakage.
- [ ] Verify logs, audit records, and error tracking contain no credentials or
  email body content.

## Estimated Effort

| Workstream | Estimate |
| --- | --- |
| Facility models, migrations, serializers, and RBAC | 1-1.5 days |
| Provider selector, SMTP delivery, Resend integration, and Celery workflow | 1-1.5 days |
| Stock-alert/digest migration and delivery audit records | 1 day |
| Admin UI/API, health checks, and monitoring | 0.5-1 day |
| Tests and deployment verification | 1-1.5 days |

**Total: 4.5-6.5 engineering days.**
