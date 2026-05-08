# Domain Events — Single Source of Truth

> **SSOT** for the Vitora HMIS domain event infrastructure.
> Covers architecture, event catalog, signal wiring, projections, management commands, and testing.

**Last Updated**: April 11, 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Infrastructure](#core-infrastructure)
3. [Event Type Catalog](#event-type-catalog)
4. [Signal → Event Wiring](#signal--event-wiring)
5. [Read-Model Projections](#read-model-projections)
6. [Management Commands](#management-commands)
7. [Testing](#testing)
8. [How-To Guides](#how-to-guides)
9. [Design Decisions](#design-decisions)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Django Signal Handler                           │
│  (post_save, user_logged_in, etc.)                                      │
│                                                                         │
│  1. Perform primary action (billing, WebSocket broadcast, etc.)         │
│  2. Call publish_event() — best-effort, never raises                    │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  publish_event() │  ← hmis/apps/core/events/helpers.py
                    │  Constructs a    │
                    │  DomainEvent     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    EventBus     │  ← Singleton, thread-safe
                    │                 │
                    │  1. _persist()  │──► EventStore (DB row)
                    │  2. dispatch()  │──► Specific subscribers
                    │  3. dispatch(*) │──► Wildcard subscribers
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───┐  ┌──────▼──────┐  ┌───▼───────────┐
     │ Projection │  │  @handles   │  │  Future:      │
     │ (read model│  │  _event()   │  │  Celery tasks, │
     │  update)   │  │  handlers   │  │  webhooks,    │
     └────────────┘  └─────────────┘  │  FHIR Subs    │
                                      └───────────────┘
```

### Key Properties

| Property | Behavior |
|----------|----------|
| **Dispatch** | Synchronous, in-process. Handlers run in the same request/response cycle. |
| **Persistence** | Every event is persisted to `EventStore` before dispatch. |
| **Safety** | `publish_event()` catches all exceptions — signal handlers never break the database transaction. |
| **Thread Safety** | `EventBus` uses `threading.Lock` for subscriber registration and dispatch. |
| **Replay** | Full event history can be replayed through projections via `EventStore.replay()`. |

---

## Core Infrastructure

### File Map

| File | Purpose | Lines |
|------|---------|-------|
| `hmis/apps/core/events/base.py` | `DomainEvent` frozen dataclass | 59 |
| `hmis/apps/core/events/bus.py` | `EventBus` singleton (publish/subscribe/persist) | 157 |
| `hmis/apps/core/events/store.py` | `EventStore` Django model (immutable event log) | 116 |
| `hmis/apps/core/events/helpers.py` | `publish_event()` convenience function | 53 |
| `hmis/apps/core/events/decorators.py` | `@handles_event`, `@publishes_event` decorators | 105 |
| `hmis/apps/core/events/types.py` | All event type constant classes | ~120 |
| `hmis/apps/core/events/__init__.py` | Public exports | ~50 |

### DomainEvent

```python
@dataclass(frozen=True)
class DomainEvent:
    event_type: str                    # "billing.invoice.created"
    aggregate_type: str                # "Invoice"
    aggregate_id: int | str            # Primary key
    payload: dict                      # Arbitrary data
    timestamp: datetime                # auto: timezone.now()
    user_id: int | None                # Optional: who triggered it
    facility_id: int | None            # Tenant scope
    organization_id: int | None        # Org scope
    correlation_id: str                # auto: uuid4()
    event_id: str                      # auto: uuid4()
```

### EventBus

```python
class EventBus:
    def subscribe(event_type: str, handler: Callable) -> None: ...
    def unsubscribe(event_type: str, handler: Callable) -> None: ...
    def publish(event: DomainEvent) -> None: ...
    def clear() -> None: ...  # Testing only
```

- **Wildcard**: Subscribe to `"*"` to receive all events.
- Handlers subscribed to a specific `event_type` fire first, then wildcard handlers.

### EventStore

```python
class EventStore(models.Model):
    event_id          = CharField(36, unique=True)
    event_type        = CharField(200, db_index=True)
    aggregate_type    = CharField(100, db_index=True)
    aggregate_id      = CharField(100)
    payload           = JSONField()
    timestamp         = DateTimeField(db_index=True)
    user_id           = IntegerField(null=True)
    facility_id       = IntegerField(null=True, db_index=True)
    organization_id   = IntegerField(null=True, db_index=True)
    correlation_id    = CharField(36, db_index=True)

    @classmethod
    def replay(cls, *, event_type=None, aggregate_type=None,
               aggregate_id=None, facility_id=None,
               since=None, until=None) -> QuerySet: ...
```

### publish_event()

```python
def publish_event(
    event_type: str,
    aggregate_type: str,
    aggregate_id: int | str,
    payload: dict | None = None,
    *,
    user_id: int | None = None,
    facility_id: int | None = None,
    organization_id: int | None = None,
    correlation_id: str | None = None,
) -> None:
    """
    Construct and publish a domain event (best-effort).
    Failures are logged but never raised — callers (signal handlers)
    must not break the save path.
    """
```

### Decorators

```python
@handles_event("billing.invoice.created")
def on_invoice_created(event: DomainEvent) -> None:
    """Auto-subscribed to the EventBus at import time."""
    ...

@publishes_event("billing.invoice.created", aggregate_type="Invoice")
def create_invoice(...) -> dict:
    """Publishes event after return. Must return dict with 'aggregate_id'."""
    ...
    return {"aggregate_id": invoice.id, ...}
```

---

## Event Type Catalog

Convention: `<domain>.<aggregate>.<action>`

### BillingEvents (56 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `INVOICE_CREATED` | `billing.invoice.created` | `billing/signals.py` |
| `INVOICE_UPDATED` | `billing.invoice.updated` | `billing/signals.py` |
| `INVOICE_FINALIZED` | `billing.invoice.finalized` | — (defined, not yet wired) |
| `INVOICE_ITEM_ADDED` | `billing.invoice_item.added` | — (defined, not yet wired) |
| `PAYMENT_RECEIVED` | `billing.payment.received` | `billing/signals.py` |
| `PAYMENT_REVERSED` | `billing.payment.reversed` | — (defined, not yet wired) |
| `SHA_CLAIM_SUBMITTED` | `billing.sha_claim.submitted` | — (defined, not yet wired) |
| `SHA_CLAIM_STATUS_CHANGED` | `billing.sha_claim.status_changed` | — (defined, not yet wired) |
| `DISCHARGE_BILLING` | `billing.discharge.processed` | `billing/signals.py` |
| `ADMISSION_BILLING` | `billing.admission.processed` | `billing/signals.py` |
| `IMMUNIZATION_BILLING` | `billing.immunization.processed` | `billing/signals.py` |
| `DHA_CLAIM_VISIT_STARTED` | `billing.dha_claim.visit_started` | `billing/services/ilm_claim_service.py` |
| `DHA_CLAIM_INTERVENTION_CHANGED` | `billing.dha_claim.intervention_changed` | `billing/services/ilm_claim_service.py` |
| `DHA_CLAIM_DIAGNOSIS_CHANGED` | `billing.dha_claim.diagnosis_changed` | `billing/services/ilm_claim_service.py` |
| `DHA_CLAIM_LINE_CHANGED` | `billing.dha_claim.line_changed` | `billing/services/ilm_claim_service.py` |
| `DHA_CLAIM_ATTACHMENT_CHANGED` | `billing.dha_claim.attachment_changed` | `billing/services/ilm_claim_service.py` |
| `DHA_CLAIM_PREVIEWED` | `billing.dha_claim.previewed` | `billing/services/ilm_claim_service.py` |
| `DHA_CLAIM_SUBMITTED` | `billing.dha_claim.submitted` | `billing/services/ilm_claim_service.py` |
| `DHA_CLAIM_CLOSED` | `billing.dha_claim.closed` | `billing/services/ilm_claim_service.py` |
| `DHA_CLAIM_CALL_FAILED` | `billing.dha_claim.call_failed` | `billing/sha_views.py` (ILM action error path) |
| `DHA_REGISTRY_FACILITY_QUERIED` | `billing.dha_registry.facility_queried` | `billing/services/ilm_registries_service.py` |
| `DHA_REGISTRY_PATIENT_QUERIED` | `billing.dha_registry.patient_queried` | `billing/services/ilm_registries_service.py` |
| `DHA_REGISTRY_PROFESSIONAL_QUERIED` | `billing.dha_registry.professional_queried` | `billing/services/ilm_registries_service.py` |
| `DHA_ELIGIBILITY_CHECKED` | `billing.dha_eligibility.checked` | `billing/services/ilm_registries_service.py` |
| `DHA_COVERAGE_SNAPSHOT_REFRESHED` | `billing.dha_coverage.snapshot_refreshed` | `billing/services/ilm_registries_service.py` |
| `DHA_PATIENT_CONTACT_FETCHED` | `billing.dha_patient_contact.fetched` | — (defined, wired in Phase 3) |
| `DHA_PATIENT_CONTACT_CREATED` | `billing.dha_patient_contact.created` | `billing/sha_ilm_registry_views.py` |
| `DHA_REGISTRY_CALL_FAILED` | `billing.dha_registry.call_failed` | `billing/sha_ilm_registry_views.py` (error path) |
| `DHA_PREAUTH_CREATED` | `billing.dha_preauth.created` | `billing/services/ilm_preauth_service.py` |
| `DHA_PREAUTH_FETCHED` | `billing.dha_preauth.fetched` | `billing/services/ilm_preauth_service.py` |
| `DHA_PREAUTH_CANCELLED` | `billing.dha_preauth.cancelled` | `billing/services/ilm_preauth_service.py` |
| `DHA_PREAUTH_DIAGNOSIS_REMOVED` | `billing.dha_preauth.diagnosis_removed` | `billing/services/ilm_preauth_service.py` |
| `DHA_PREAUTH_DOCTOR_REMOVED` | `billing.dha_preauth.doctor_removed` | `billing/services/ilm_preauth_service.py` |
| `DHA_PREAUTH_DOCTOR_CONSENT_REQUESTED` | `billing.dha_preauth.doctor_consent_requested` | `billing/services/ilm_preauth_service.py` |
| `DHA_EMERGENCY_OPENED` | `billing.dha_emergency.opened` | `billing/services/ilm_preauth_service.py` |
| `DHA_EMERGENCY_PROTOCOL_LISTED` | `billing.dha_emergency.protocol_listed` | `billing/services/ilm_preauth_service.py` |
| `DHA_EMERGENCY_PROTOCOL_APPLIED` | `billing.dha_emergency.protocol_applied` | `billing/services/ilm_preauth_service.py` |
| `DHA_EMT_CLAIM_CREATED` | `billing.dha_emt.claim_created` | `billing/services/ilm_preauth_service.py` |
| `DHA_PREAUTH_CALL_FAILED` | `billing.dha_preauth.call_failed` | `billing/sha_ilm_preauth_views.py` (error path) |
| `DHA_VISIT_OTP_SENT` | `billing.dha_lifecycle.visit_otp_sent` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_DISCHARGE_OTP_SENT` | `billing.dha_lifecycle.discharge_otp_sent` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_DISCHARGE_COMPLETED` | `billing.dha_lifecycle.discharge_completed` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_OTP_WHITELIST_REQUESTED` | `billing.dha_lifecycle.otp_whitelist_requested` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_OTP_WHITELIST_FETCHED` | `billing.dha_lifecycle.otp_whitelist_fetched` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_NEXT_OF_KIN_ADDED` | `billing.dha_lifecycle.next_of_kin_added` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_EMERGENCY_DOCTOR_ADDED` | `billing.dha_lifecycle.emergency_doctor_added` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_EMERGENCY_DOCTOR_REMOVED` | `billing.dha_lifecycle.emergency_doctor_removed` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_POMSF_BALANCE_FETCHED` | `billing.dha_lifecycle.pomsf_balance_fetched` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_FILE_UPLOADED` | `billing.dha_lifecycle.file_uploaded` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_FILE_URL_GENERATED` | `billing.dha_lifecycle.file_url_generated` | `billing/services/ilm_lifecycle_service.py` |
| `DHA_LIFECYCLE_CALL_FAILED` | `billing.dha_lifecycle.call_failed` | `billing/sha_ilm_lifecycle_views.py` (error path) |
| `DHA_PRESCRIPTION_CREATED` | `billing.dha_prescription.created` | `billing/services/ilm_prescription_service.py` |
| `DHA_PRESCRIPTION_FETCHED` | `billing.dha_prescription.fetched` | `billing/services/ilm_prescription_service.py` |
| `DHA_PRESCRIPTION_DISPENSED` | `billing.dha_prescription.dispensed` | `billing/services/ilm_prescription_service.py` |
| `DHA_PRESCRIPTION_DOCTOR_REMOVED` | `billing.dha_prescription.doctor_removed` | `billing/services/ilm_prescription_service.py` |
| `DHA_PRESCRIPTION_CALL_FAILED` | `billing.dha_prescription.call_failed` | `billing/sha_ilm_prescription_views.py` (error path) |

### PharmacyEvents (7 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `PRESCRIPTION_CREATED` | `pharmacy.prescription.created` | `pharmacy/signals.py` |
| `PRESCRIPTION_ITEM_CREATED` | `pharmacy.prescription_item.created` | `pharmacy/signals.py` |
| `DISPENSING_COMPLETED` | `pharmacy.dispensing.completed` | `pharmacy/signals.py` |
| `DISPENSING_BILLING_LINKED` | `pharmacy.dispensing.billing_linked` | — (defined, not yet wired) |
| `STOCK_CRITICAL` | `pharmacy.stock.critical` | `pharmacy/signals.py` |
| `STOCK_LOW_WARNING` | `pharmacy.stock.low_warning` | `pharmacy/signals.py` |
| `PRESCRIPTION_EXPIRED` | `pharmacy.prescription.expired` | — (defined, not yet wired) |

### LaboratoryEvents (10 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `ORDER_CREATED` | `laboratory.order.created` | — (defined, not yet wired) |
| `ORDER_STATUS_CHANGED` | `laboratory.order.status_changed` | — (defined, not yet wired) |
| `ORDER_COMPLETED` | `laboratory.order.completed` | `laboratory/signals.py` |
| `QUEUE_CREATED` | `laboratory.queue.created` | `laboratory/signals.py` |
| `QUEUE_STATUS_CHANGED` | `laboratory.queue.status_changed` | — (defined, not yet wired) |
| `SPECIMEN_CREATED` | `laboratory.specimen.created` | — (defined, not yet wired) |
| `RESULT_ENTERED` | `laboratory.result.entered` | `laboratory/signals.py` |
| `RESULT_VERIFIED` | `laboratory.result.verified` | `laboratory/signals.py` |
| `CRITICAL_RESULT` | `laboratory.result.critical` | — (defined, not yet wired) |
| `ORDER_BILLING` | `laboratory.order.billed` | `laboratory/signals.py` |

### ClinicalEvents (5 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `ENCOUNTER_CREATED` | `clinical.encounter.created` | `encounters/signals.py`, `core/signals.py` |
| `ENCOUNTER_UPDATED` | `clinical.encounter.updated` | `encounters/signals.py` |
| `TRIAGE_ASSESSED` | `clinical.triage.assessed` | `triage/signals.py` |
| `CLINIC_VISIT_CREATED` | `clinical.clinic_visit.created` | `clinics/signals.py` |
| `CLINIC_VISIT_STATUS_CHANGED` | `clinical.clinic_visit.status_changed` | `clinics/signals.py` |
| `CLINIC_SESSION_OPENED` | `clinical.clinic_session.opened` | `clinics/signals.py` |
| `CLINIC_SESSION_CLOSED` | `clinical.clinic_session.closed` | `clinics/signals.py` |

### InpatientEvents (5 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `ADMISSION_CREATED` | `inpatient.admission.created` | `inpatient/signals.py` |
| `DISCHARGE_COMPLETED` | `inpatient.discharge.completed` | — (defined, not yet wired) |
| `WARD_CAPACITY_CHANGED` | `inpatient.ward.capacity_changed` | — (defined, not yet wired) |
| `WARD_CONSTRAINTS_UPDATED` | `inpatient.ward.constraints_updated` | `inpatient/signals.py` |
| `COMPATIBILITY_VIOLATION` | `inpatient.admission.compatibility_violation` | `inpatient/signals.py` |

### MCHEvents (4 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `REGISTRATION_CREATED` | `mch.registration.created` | `mch/signals.py` |
| `DELIVERY_COMPLETED` | `mch.delivery.completed` | `mch/signals.py` |
| `ANC_VISIT_CREATED` | `mch.anc_visit.created` | `mch/signals.py` |
| `BABY_PATIENT_CREATED` | `mch.baby_patient.created` | `mch/signals.py` |

### ImmunizationEvents (3 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `RECORD_ADMINISTERED` | `immunization.record.administered` | — (defined, not yet wired) |
| `AEFI_REPORTED` | `immunization.aefi.reported` | — (defined, not yet wired) |
| `SCHEDULE_GENERATED` | `immunization.schedule.generated` | `mch/signals.py` |

### SurveillanceEvents (2 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `NOTIFIABLE_DISEASE_DETECTED` | `surveillance.disease.detected` | `surveillance/signals.py` |
| `ALERT_CREATED` | `surveillance.alert.created` | — (defined, not yet wired) |

### CoreEvents (5 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `USER_LOGGED_IN` | `core.user.logged_in` | `core/signals.py` |
| `USER_LOGGED_OUT` | `core.user.logged_out` | `core/signals.py` |
| `USER_LOGIN_FAILED` | `core.user.login_failed` | — (defined, not yet wired) |
| `PATIENT_CREATED` | `core.patient.created` | `core/signals.py` |
| `PATIENT_UPDATED` | `core.patient.updated` | — (defined, not yet wired) |

### SchedulingEvents (19 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `APPOINTMENT_CREATED` | `scheduling.appointment.created` | `scheduling/signals.py` |
| `APPOINTMENT_CONFIRMED` | `scheduling.appointment.confirmed` | `scheduling/signals.py` |
| `APPOINTMENT_CHECKED_IN` | `scheduling.appointment.checked_in` | `scheduling/signals.py` |
| `APPOINTMENT_STARTED` | `scheduling.appointment.started` | `scheduling/signals.py` |
| `APPOINTMENT_COMPLETED` | `scheduling.appointment.completed` | `scheduling/signals.py` |
| `APPOINTMENT_CANCELLED` | `scheduling.appointment.cancelled` | `scheduling/signals.py` |
| `APPOINTMENT_NO_SHOW` | `scheduling.appointment.no_show` | `scheduling/signals.py` |
| `SCHEDULE_CREATED` | `scheduling.schedule.created` | `scheduling/signals.py` |
| `SCHEDULE_UPDATED` | `scheduling.schedule.updated` | `scheduling/signals.py` |
| `ASSIGNMENT_DECIDED` | `scheduling.assignment.decided` | `scheduling/signals.py` |
| `OVERRIDE_CREATED` | `scheduling.override.created` | `scheduling/signals.py` |
| `OVERRIDE_APPROVED` | `scheduling.override.approved` | `scheduling/signals.py` |
| `OVERRIDE_REJECTED` | `scheduling.override.rejected` | `scheduling/signals.py` |
| `RULE_ACTIVATED` | `scheduling.rule.activated` | `scheduling/signals.py` |
| `RULE_DEACTIVATED` | `scheduling.rule.deactivated` | `scheduling/signals.py` |
| `SHIFT_CREATED` | `scheduling.shift.created` | `scheduling/signals.py` |
| `SHIFT_STARTED` | `scheduling.shift.started` | `scheduling/signals.py` |
| `SHIFT_COMPLETED` | `scheduling.shift.completed` | `scheduling/signals.py` |
| `SHIFT_CANCELLED` | `scheduling.shift.cancelled` | `scheduling/signals.py` |

### ImagingEvents (3 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `ORDER_CREATED` | `imaging.order.created` | — (defined, not yet wired) |
| `ORDER_ITEM_CREATED` | `imaging.order_item.created` | `imaging/signals.py` |
| `RESULT_COMPLETED` | `imaging.result.completed` | — (defined, not yet wired) |

### TheatreEvents (13 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `CASE_CREATED` | `theatre.case.created` | `theatre/signals.py` |
| `CASE_SCHEDULED` | `theatre.case.scheduled` | `theatre/signals.py` |
| `CASE_STATUS_CHANGED` | `theatre.case.status_changed` | `theatre/signals.py` |
| `CASE_CANCELLED` | `theatre.case.cancelled` | `theatre/signals.py` |
| `CASE_POSTPONED` | `theatre.case.postponed` | `theatre/signals.py` |
| `TEAM_ASSIGNED` | `theatre.team.assigned` | `theatre/signals.py` |
| `CHECKLIST_SIGN_IN` | `theatre.checklist.sign_in` | `theatre/signals.py` |
| `CHECKLIST_TIME_OUT` | `theatre.checklist.time_out` | `theatre/signals.py` |
| `CHECKLIST_SIGN_OUT` | `theatre.checklist.sign_out` | `theatre/signals.py` |
| `SURGERY_STARTED` | `theatre.surgery.started` | `theatre/signals.py` |
| `SURGERY_COMPLETED` | `theatre.surgery.completed` | `theatre/signals.py` |
| `PACU_ARRIVED` | `theatre.pacu.arrived` | `theatre/signals.py` |
| `PACU_DISCHARGED` | `theatre.pacu.discharged` | `theatre/signals.py` |

### ReferralEvents (7 constants)

| Constant | Value | Published From |
|----------|-------|---------------|
| `CREATED` | `referrals.referral.created` | `referrals/signals.py` |
| `ACCEPTED` | `referrals.referral.accepted` | `referrals/signals.py` |
| `DECLINED` | `referrals.referral.declined` | `referrals/signals.py` |
| `CANCELLED` | `referrals.referral.cancelled` | `referrals/signals.py` |
| `EXPIRED` | `referrals.referral.expired` | `referrals/signals.py` |
| `IN_PROGRESS` | `referrals.referral.in_progress` | `referrals/signals.py` |
| `COMPLETED` | `referrals.referral.completed` | `referrals/signals.py` |

### Summary

| Class | Defined | Wired | Coverage |
|-------|---------|-------|----------|
| BillingEvents | 11 | 6 | 55% |
| PharmacyEvents | 7 | 5 | 71% |
| LaboratoryEvents | 10 | 5 | 50% |
| ClinicalEvents | 5 | 5 | 100% |
| InpatientEvents | 5 | 3 | 60% |
| MCHEvents | 4 | 4 | 100% |
| ImmunizationEvents | 3 | 1 | 33% |
| SurveillanceEvents | 2 | 1 | 50% |
| CoreEvents | 5 | 3 | 60% |
| SchedulingEvents | 19 | 19 | 100% |
| ImagingEvents | 3 | 1 | 33% |
| TheatreEvents | 13 | 13 | 100% |
| ReferralEvents | 7 | 7 | 100% |
| **Total** | **94** | **73** | **78%** |

---

## Signal → Event Wiring

### Billing (`hmis/apps/billing/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `create_invoice_for_encounter` | `post_save` | `Encounter` | `INVOICE_CREATED` | `encounter_id`, `patient_id`, `trigger` |
| `handle_discharge_billing` | manual | `Discharge` | `DISCHARGE_BILLING` | `admission_id` |
| `handle_admission_billing` | manual | `Admission` | `ADMISSION_BILLING` | `patient_id` |
| `handle_immunization_billing` | manual | `ImmunizationRecord` | `IMMUNIZATION_BILLING` | `patient_id` |
| `broadcast_invoice_change` | `post_save` | `Invoice` | `INVOICE_CREATED` / `INVOICE_UPDATED` | `invoice_number`, `status`, `total_amount`, `patient_id` |
| `broadcast_payment_change` | `post_save` | `Payment` | `PAYMENT_RECEIVED` | `amount`, `payment_method`, `invoice_id` |

### Pharmacy (`hmis/apps/pharmacy/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `create_invoice_item_for_prescription` | `post_save` | `PrescriptionItem` | `PRESCRIPTION_ITEM_CREATED` | `prescription_id`, `drug_id`, `drug_name`, `quantity`, `unit_price` |
| `broadcast_prescription_on_create` | `post_save` | `Prescription` | `PRESCRIPTION_CREATED` | `prescription_number`, `patient_id`, `encounter_id` |
| `broadcast_dispensing_on_create` | `post_save` | `Dispensing` | `DISPENSING_COMPLETED` | `drug_id`, `drug_name`, `quantity_dispensed`, `patient_id` |
| `broadcast_stock_level_change` | `post_save` | `StockBatch` | `STOCK_CRITICAL` / `STOCK_LOW_WARNING` | `drug_name`, `remaining_quantity`, `reorder_level` |

### Laboratory (`hmis/apps/laboratory/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `create_lab_queue_entry` | `post_save` | `LabOrder` | `QUEUE_CREATED` | `order_number`, `priority` |
| `update_order_status_on_result` | `post_save` | `LabResult` | `RESULT_ENTERED` | `order_number`, `items_with_results`, `total_items` |
| `notify_on_verification` | `post_save` | `LabResult` | `RESULT_VERIFIED`, `ORDER_COMPLETED` | `order_number`, `is_critical`, `total_items` |
| `handle_lab_billing` | `post_save` | `LabOrder` | `ORDER_BILLING` | `order_number` |

### Clinics (`hmis/apps/clinics/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `clinic_visit_post_save` | `post_save` | `ClinicVisit` | `CLINIC_VISIT_CREATED` | `patient_id`, `clinic_id`, `status` |
| `clinic_visit_status_change` | `post_save` | `ClinicVisit` | `CLINIC_VISIT_STATUS_CHANGED` | `old_status`, `new_status`, `patient_id`, `clinic_id` |
| `clinic_session_publish_event` | `post_save` | `ClinicSession` | `CLINIC_SESSION_OPENED` / `CLINIC_SESSION_CLOSED` | `clinic_id`, `clinic_name`, `session_date`, `status` |

### Core (`hmis/apps/core/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `log_user_login` | `user_logged_in` | `User` | `USER_LOGGED_IN` | `username` |
| `log_user_logout` | `user_logged_out` | `User` | `USER_LOGGED_OUT` | `username` |
| `patient_activity_signal` | `post_save` | `Patient` | `PATIENT_CREATED` | `mrn`, `first_name`, `last_name`, `gender` |
| `encounter_activity_signal` | `post_save` | `Encounter` | `ENCOUNTER_CREATED` | `encounter_type`, `patient_id` |

### Encounters (`hmis/apps/encounters/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `publish_encounter_event` | `post_save` | `Encounter` | `ENCOUNTER_CREATED` / `ENCOUNTER_UPDATED` | `patient_id`, `encounter_type`, `status` |

### Triage (`hmis/apps/triage/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `update_encounter_triage_status` | `post_save` | `TriageAssessment` | `TRIAGE_ASSESSED` | `encounter_id`, `patient_id`, `triage_category`, `triage_status`, `created` |

### Inpatient (`hmis/apps/inpatient/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `notify_ward_constraints_updated` | `post_save` | `Ward` | `WARD_CONSTRAINTS_UPDATED` | `ward_name`, `gender_restriction`, `isolation_capable` |
| `notify_compatibility_violation` | `post_save` | `Admission` | `ADMISSION_CREATED` | `admission_number`, `patient_id`, `ward_id`, `has_violations` |
| | | | `COMPATIBILITY_VIOLATION` | `admission_number`, `violation_count`, `has_critical` |

### Scheduling (`hmis/apps/scheduling/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `publish_appointment_event` | `post_save` | `Appointment` | 7 status-mapped events (see table below) | `appointment_number`, `status`, `patient_id`, `resource_id`, `appointment_type`, `scheduled_start` |
| `publish_schedule_event` | `post_save` | `Schedule` | `SCHEDULE_CREATED` / `SCHEDULE_UPDATED` | `resource_id`, `schedule_type`, `day_of_week`, `is_active` |
| `publish_assignment_decision_event` | `post_save` | `AssignmentDecision` | `ASSIGNMENT_DECIDED` | `assignment_type`, `target_type`, `target_id`, `outcome`, `resource_id`, `rule_id`, `evaluation_time_ms` |
| `publish_override_event` | `post_save` | `AssignmentOverride` | `OVERRIDE_CREATED` / `OVERRIDE_APPROVED` / `OVERRIDE_REJECTED` | `target_type`, `target_id`, `override_reason`, `approval_status`, `original_resource_id`, `new_resource_id` |
| `publish_rule_toggle_event` | `post_save` | `AssignmentRule` | `RULE_ACTIVATED` / `RULE_DEACTIVATED` | `rule_code`, `applies_to`, `priority` |
| `publish_shift_event` | `post_save` | `Shift` | `SHIFT_CREATED` / `SHIFT_STARTED` / `SHIFT_COMPLETED` / `SHIFT_CANCELLED` / `SHIFT_BREAK_STARTED` | `staff_resource_id`, `shift_date`, `status`, `shift_type`, `department`, `clock_in_method`, `auto_clocked_out`, `late_minutes` |

Appointment status → Event mapping:

| Appointment Status | Event Type |
|-------------------|------------|
| `CREATED` | `APPOINTMENT_CREATED` |
| `CONFIRMED` | `APPOINTMENT_CONFIRMED` |
| `CHECKED_IN` | `APPOINTMENT_CHECKED_IN` |
| `IN_PROGRESS` | `APPOINTMENT_STARTED` |
| `COMPLETED` | `APPOINTMENT_COMPLETED` |
| `CANCELLED` | `APPOINTMENT_CANCELLED` |
| `NO_SHOW` | `APPOINTMENT_NO_SHOW` |

### MCH (`hmis/apps/mch/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `auto_generate_immunization_schedule` | `post_save` | `Patient` | `SCHEDULE_GENERATED` | `patient_id`, `records_count`, `age_days` |
| `auto_create_anc_enrollment` | `post_save` | `MCHRegistration` | `REGISTRATION_CREATED` | `mch_number`, `mother_id`, `is_high_risk` |
| `auto_transition_mch_to_delivered` | `post_save` | `Delivery` | `DELIVERY_COMPLETED` | `registration_id`, `mch_number`, `delivery_date` |
| `auto_create_anc_appointment` | `post_save` | `ANCVisit` | `ANC_VISIT_CREATED` | `registration_id`, `visit_number`, `next_visit_date` |
| `create_baby_patient_on_delivery` | `post_save` | `Delivery` | `BABY_PATIENT_CREATED` | `baby_patient_id`, `mother_id`, `delivery_date` |

### Surveillance (`hmis/apps/surveillance/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `check_diagnosis_for_surveillance` | `post_save` | `Diagnosis` | `NOTIFIABLE_DISEASE_DETECTED` | `disease_name`, `diagnosis_id`, `icd10_code`, `patient_id` |

### Imaging (`hmis/apps/imaging/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `create_invoice_item_for_imaging` | `post_save` | `ImagingOrderItem` | `ORDER_ITEM_CREATED` | `order_number`, `procedure_name`, `unit_price` |

### Theatre (`hmis/apps/theatre/signals.py`)

| Handler | Signal | Model | Event(s) Published | Payload |
|---------|--------|-------|--------------------|---------|
| `publish_surgery_case_event` | `post_save` | `SurgeryCase` | `CASE_CREATED` / status-mapped | `case_number`, `status`, `patient_id`, `theatre_id`, `scheduled_date`, `priority` |
| `publish_team_assigned_event` | `post_save` | `SurgicalTeamMember` | `TEAM_ASSIGNED` | `staff_member_id`, `role` |
| `publish_checklist_event` | `post_save` | `WHOSafetyChecklist` | `CHECKLIST_SIGN_IN` / `CHECKLIST_TIME_OUT` / `CHECKLIST_SIGN_OUT` | `case_number` |
| `publish_pacu_event` | `post_save` | `PACURecord` | `PACU_ARRIVED` | `initial_aldrete_score` |

---

## Read-Model Projections

Projections are materialized read-models maintained by subscribing to domain events. They provide fast, pre-computed statistics for dashboards without aggregating from raw tables.

### Infrastructure

| File | Purpose |
|------|---------|
| `hmis/apps/core/projections/base.py` | `BaseProjection` ABC — `handle_event()`, `reset()`, `rebuild()` |
| `hmis/apps/core/projections/registry.py` | `ProjectionRegistry` singleton — discovery, `wire()` to EventBus |
| `hmis/apps/core/projections/models.py` | Django models for projected state |

### Projection Lifecycle

```
1. AppConfig.ready()
   └── ProjectionRegistry.wire()
       └── For each projection:
           EventBus.subscribe(event_type, projection.handle_event)

2. Runtime: Signal fires → publish_event() → EventBus
   └── Projection.handle_event(event)
       └── Update stat model (create_or_update)

3. Rebuild: manage.py rebuild_projection [name]
   └── projection.reset()
   └── EventStore.replay(event_types=...)
       └── For each stored event: projection.handle_event(event)
```

### Concrete Projections

#### ClinicQueueProjection

**Subscribed Events**: `CLINIC_VISIT_CREATED`, `CLINIC_VISIT_STATUS_CHANGED`

**Model**: `ClinicQueueStats`

| Field | Type | Description |
|-------|------|-------------|
| `facility_id` | IntegerField | Tenant scope |
| `clinic_id` | IntegerField | Which clinic |
| `waiting_count` | IntegerField | Patients in WAITING status |
| `in_consultation_count` | IntegerField | Patients being seen |
| `completed_today` | IntegerField | Visits completed today |
| `no_show_today` | IntegerField | No-shows today |
| `avg_wait_seconds` | IntegerField | Average wait time |
| `longest_wait_seconds` | IntegerField | Longest current wait |
| `last_updated` | DateTimeField | When projection last ran |

#### WardOccupancyProjection

**Subscribed Events**: `ADMISSION_CREATED`, `DISCHARGE_COMPLETED`, `WARD_CAPACITY_CHANGED`

**Model**: `WardOccupancyStats`

| Field | Type | Description |
|-------|------|-------------|
| `facility_id` | IntegerField | Tenant scope |
| `ward_id` | IntegerField | Which ward |
| `total_beds` | IntegerField | Ward capacity |
| `occupied_beds` | IntegerField | Currently occupied |
| `available_beds` | IntegerField | Vacant beds |
| `occupancy_rate` | DecimalField | Percentage occupied |
| `admissions_today` | IntegerField | New admissions today |
| `discharges_today` | IntegerField | Discharges today |
| `last_updated` | DateTimeField | When projection last ran |

#### PharmacyQueueProjection

**Subscribed Events**: `PRESCRIPTION_CREATED`, `DISPENSING_COMPLETED`, `PRESCRIPTION_EXPIRED`, `STOCK_CRITICAL`, `STOCK_LOW_WARNING`

**Model**: `PharmacyQueueStats`

| Field | Type | Description |
|-------|------|-------------|
| `facility_id` | IntegerField | Tenant scope |
| `pending_prescriptions` | IntegerField | Awaiting dispensing |
| `dispensed_today` | IntegerField | Completed today |
| `critical_stock_count` | IntegerField | Out-of-stock drugs |
| `low_stock_count` | IntegerField | Below reorder level |
| `last_updated` | DateTimeField | When projection last ran |

---

## Management Commands

### `replay_events`

Replay stored events through the EventBus for reprocessing or backfilling.

```bash
# Replay all events
python manage.py replay_events

# Replay billing events only
python manage.py replay_events --event-type "billing.*"

# Replay events for a specific facility since a date
python manage.py replay_events --facility-id 5 --since 2026-01-01

# Dry run (count only, no dispatch)
python manage.py replay_events --dry-run
```

**Options**:
- `--event-type`: Filter by event type (supports prefix matching)
- `--aggregate-type`: Filter by aggregate type (e.g., `Invoice`)
- `--facility-id`: Filter by facility
- `--since` / `--until`: Date range
- `--dry-run`: Count matching events without dispatching

### `rebuild_projection`

Reset and rebuild a projection from the EventStore.

```bash
# Rebuild a specific projection
python manage.py rebuild_projection clinic_queue

# Rebuild all projections
python manage.py rebuild_projection --all

# Rebuild with facility scope
python manage.py rebuild_projection ward_occupancy --facility-id 5
```

---

## Testing

### Test Files

| File | Tests | Scope |
|------|-------|-------|
| `tests/core/test_domain_events.py` | ~14 | EventBus, DomainEvent immutability, wildcard dispatch, handler isolation |
| `tests/core/test_signal_events.py` | ~22 | Signal → event wiring: billing, pharmacy, laboratory, clinics, core |
| `tests/core/test_signal_events_extended.py` | 44 | Signal → event wiring: scheduling (appointments + timetable + assignments), encounters, triage, inpatient, MCH, surveillance, imaging |
| `tests/core/test_projections.py` | ~12 | Projection registry, event → model update, rebuild |

**Total**: ~92 tests covering the domain events infrastructure.

### Test Pattern

All signal event tests follow the same pattern:

```python
@pytest.mark.django_db
def test_handler_publishes_event(self):
    # 1. Subscribe to the expected event type
    received = []
    bus = get_event_bus()
    bus.subscribe(SomeEvents.SOME_EVENT, lambda e: received.append(e))

    # 2. Import the signal handler directly
    from hmis.apps.module.signals import handler_function

    # 3. Build a MagicMock instance with required attributes
    instance = MagicMock()
    instance.id = 42
    instance.facility_id = 1
    # ...

    # 4. Call the handler, patching external dependencies
    with patch("hmis.apps.module.signals.external_call"):
        handler_function(sender=None, instance=instance, created=True)

    # 5. Assert event was received with correct type and payload
    assert len(received) == 1
    assert received[0].event_type == SomeEvents.SOME_EVENT
    assert received[0].aggregate_id == 42
    assert received[0].payload["key"] == "value"
```

### Running Tests

```bash
cd backend

# All event tests
poetry run pytest tests/core/test_domain_events.py tests/core/test_signal_events.py tests/core/test_signal_events_extended.py tests/core/test_projections.py -v --no-cov

# Only signal wiring tests
poetry run pytest tests/core/test_signal_events.py tests/core/test_signal_events_extended.py -v --no-cov

# Only projection tests
poetry run pytest tests/core/test_projections.py -v --no-cov
```

---

## How-To Guides

### Adding a New Event Type

1. **Add the constant** to the appropriate class in `hmis/apps/core/events/types.py`:

```python
class PharmacyEvents:
    ...
    NEW_EVENT = "pharmacy.aggregate.action"
```

2. **If it's a new class**, also update `hmis/apps/core/events/__init__.py` to export it.

3. **Add a naming convention test** in the appropriate test file.

### Wiring a Signal Handler to Publish Events

1. **Import** `publish_event` and the event type class:

```python
from hmis.apps.core.events import SomeEvents, publish_event
```

2. **Add the publish call** at the end of the handler's success path (inside the `try` block, after the primary operation):

```python
@receiver(post_save, sender=MyModel)
def my_handler(sender, instance, created, **kwargs):
    if not created:
        return

    # ... primary business logic ...

    # Publish domain event (best-effort, never raises)
    publish_event(
        event_type=SomeEvents.MY_EVENT,
        aggregate_type="MyModel",
        aggregate_id=instance.id,
        payload={
            "field1": instance.field1,
            "field2": instance.field2,
        },
        facility_id=getattr(instance, "facility_id", None),
        organization_id=getattr(instance, "organization_id", None),
    )
```

3. **Write a test** in `tests/core/test_signal_events_extended.py` following the pattern above.

### Adding a New Projection

1. **Create the stats model** in `hmis/apps/core/projections/models.py`:

```python
class NewStats(models.Model):
    facility_id = models.IntegerField(db_index=True)
    # ... stat fields ...
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("facility_id", ...)]
```

2. **Create the projection class** (e.g., `hmis/apps/core/projections/new_projection.py`):

```python
from hmis.apps.core.projections.base import BaseProjection

class NewProjection(BaseProjection):
    subscribed_events = [SomeEvents.EVENT_A, SomeEvents.EVENT_B]

    def handle_event(self, event):
        if event.event_type == SomeEvents.EVENT_A:
            # Update stats model
            ...

    def reset(self, **filters):
        NewStats.objects.filter(**filters).delete()
```

3. **Register** in `ProjectionRegistry` so it gets wired at startup.

4. **Run `makemigrations`** for the new model.

---

## Design Decisions

### Why synchronous dispatch?

The HMIS runs in environments with unreliable infrastructure. A synchronous, in-process event bus ensures:
- **No additional infrastructure** (no Redis/RabbitMQ required for events)
- **Transactional consistency** — projections update in the same request
- **Simpler debugging** — stack traces flow through the handler chain
- **Works offline** — the desktop app can run the same event system without a message broker

The trade-off is that slow handlers block the response. This is acceptable because:
- `publish_event` is best-effort; handler failures are caught
- Projections do simple counter updates (microseconds)
- Heavy work (email, external API calls) is delegated to Celery tasks

### Why persist before dispatch?

EventStore receives the event before any handler runs. This guarantees:
- Events are never lost, even if handlers crash
- Projections can be rebuilt from the store at any time
- Audit trail is complete regardless of subscriber state

### Why both `core/signals.py` and `encounters/signals.py` publish ENCOUNTER_CREATED?

- `core/signals.py` → `encounter_activity_signal` feeds the ActivityFeed (general activity stream)
- `encounters/signals.py` → `publish_encounter_event` is the canonical domain event for cross-module consumption

Both publish the same event type to the EventBus. Subscribers see one event (the first to fire). The duplication is intentional — the core signal is for the activity feed layer, the encounters signal is for domain event consumers. This will be consolidated in a future refactor.

### Tenant scoping

Every event carries `facility_id` and/or `organization_id` from the source model. This enables:
- Projections scoped to a facility (e.g., ward occupancy for facility X)
- Event replay filtered by tenant
- Future: per-tenant event streams for multi-region deployment

---

## Appendix: Module Wiring Status

Quick reference for which modules have signal handlers publishing domain events.

| Module | Has `signals.py` | `publish_event` Wired | Events Published |
|--------|:-:|:-:|:-:|
| **billing** | ✅ | ✅ | 6 |
| **pharmacy** | ✅ | ✅ | 5 |
| **laboratory** | ✅ | ✅ | 5 |
| **clinics** | ✅ | ✅ | 2 |
| **core** | ✅ | ✅ | 3 |
| **encounters** | ✅ | ✅ | 2 |
| **triage** | ✅ | ✅ | 1 |
| **inpatient** | ✅ | ✅ | 3 |
| **scheduling** | ✅ | ✅ | 15 |
| **mch** | ✅ | ✅ | 5 |
| **surveillance** | ✅ | ✅ | 1 |
| **imaging** | ✅ | ✅ | 1 |
| **checkin** | ❌ | ❌ | 0 |
| **Total** | — | — | **49** |
