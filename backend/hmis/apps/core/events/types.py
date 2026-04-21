"""
Domain Event Type Catalog.

Central registry of all event type constants used across the HMIS.
Organized by domain to prevent naming collisions and enable discovery.

Convention: <domain>.<aggregate>.<action>
"""


class BillingEvents:
    """Billing domain event types."""

    INVOICE_CREATED = "billing.invoice.created"
    INVOICE_UPDATED = "billing.invoice.updated"
    INVOICE_FINALIZED = "billing.invoice.finalized"
    INVOICE_ITEM_ADDED = "billing.invoice_item.added"
    PAYMENT_RECEIVED = "billing.payment.received"
    PAYMENT_REVERSED = "billing.payment.reversed"
    SHA_CLAIM_SUBMITTED = "billing.sha_claim.submitted"
    SHA_CLAIM_STATUS_CHANGED = "billing.sha_claim.status_changed"
    DISCHARGE_BILLING = "billing.discharge.processed"
    ADMISSION_BILLING = "billing.admission.processed"
    IMMUNIZATION_BILLING = "billing.immunization.processed"


class PharmacyEvents:
    """Pharmacy domain event types."""

    PRESCRIPTION_CREATED = "pharmacy.prescription.created"
    PRESCRIPTION_ITEM_CREATED = "pharmacy.prescription_item.created"
    DISPENSING_COMPLETED = "pharmacy.dispensing.completed"
    DISPENSING_BILLING_LINKED = "pharmacy.dispensing.billing_linked"
    STOCK_CRITICAL = "pharmacy.stock.critical"
    STOCK_LOW_WARNING = "pharmacy.stock.low_warning"
    PRESCRIPTION_EXPIRED = "pharmacy.prescription.expired"


class LaboratoryEvents:
    """Laboratory domain event types."""

    ORDER_CREATED = "laboratory.order.created"
    ORDER_STATUS_CHANGED = "laboratory.order.status_changed"
    ORDER_COMPLETED = "laboratory.order.completed"
    QUEUE_CREATED = "laboratory.queue.created"
    QUEUE_STATUS_CHANGED = "laboratory.queue.status_changed"
    SPECIMEN_CREATED = "laboratory.specimen.created"
    RESULT_ENTERED = "laboratory.result.entered"
    RESULT_VERIFIED = "laboratory.result.verified"
    CRITICAL_RESULT = "laboratory.result.critical"
    ORDER_BILLING = "laboratory.order.billed"


class ClinicalEvents:
    """Clinical / encounter domain event types."""

    ENCOUNTER_CREATED = "clinical.encounter.created"
    ENCOUNTER_UPDATED = "clinical.encounter.updated"
    TRIAGE_ASSESSED = "clinical.triage.assessed"
    CLINIC_VISIT_CREATED = "clinical.clinic_visit.created"
    CLINIC_VISIT_STATUS_CHANGED = "clinical.clinic_visit.status_changed"
    CLINIC_SESSION_OPENED = "clinical.clinic_session.opened"
    CLINIC_SESSION_CLOSED = "clinical.clinic_session.closed"


class InpatientEvents:
    """Inpatient domain event types."""

    ADMISSION_CREATED = "inpatient.admission.created"
    DISCHARGE_COMPLETED = "inpatient.discharge.completed"
    WARD_CAPACITY_CHANGED = "inpatient.ward.capacity_changed"
    WARD_CONSTRAINTS_UPDATED = "inpatient.ward.constraints_updated"
    COMPATIBILITY_VIOLATION = "inpatient.admission.compatibility_violation"


class MCHEvents:
    """Mother & Child Health domain event types."""

    REGISTRATION_CREATED = "mch.registration.created"
    DELIVERY_COMPLETED = "mch.delivery.completed"
    ANC_VISIT_CREATED = "mch.anc_visit.created"
    BABY_PATIENT_CREATED = "mch.baby_patient.created"


class ImmunizationEvents:
    """Immunization domain event types."""

    RECORD_ADMINISTERED = "immunization.record.administered"
    AEFI_REPORTED = "immunization.aefi.reported"
    SCHEDULE_GENERATED = "immunization.schedule.generated"


class SurveillanceEvents:
    """Surveillance domain event types."""

    NOTIFIABLE_DISEASE_DETECTED = "surveillance.disease.detected"
    ALERT_CREATED = "surveillance.alert.created"


class CoreEvents:
    """Core / audit domain event types."""

    USER_LOGGED_IN = "core.user.logged_in"
    USER_LOGGED_OUT = "core.user.logged_out"
    USER_LOGIN_FAILED = "core.user.login_failed"
    PATIENT_CREATED = "core.patient.created"
    PATIENT_UPDATED = "core.patient.updated"


class OrganizationEvents:
    """Organization lifecycle domain event types."""

    ORG_SIGNUP = "core.organization.signup"
    ORG_EMAIL_VERIFIED = "core.organization.email_verified"
    ORG_ACTIVATED = "core.organization.activated"
    ORG_DEACTIVATED = "core.organization.deactivated"


class AIEvents:
    """AI/TibaBot domain event types."""

    INVESTIGATION_SUGGEST_CREATED = "ai.investigation_suggest.created"


class SchedulingEvents:
    """Scheduling domain event types."""

    APPOINTMENT_CREATED = "scheduling.appointment.created"
    APPOINTMENT_CONFIRMED = "scheduling.appointment.confirmed"
    APPOINTMENT_CHECKED_IN = "scheduling.appointment.checked_in"
    APPOINTMENT_STARTED = "scheduling.appointment.started"
    APPOINTMENT_COMPLETED = "scheduling.appointment.completed"
    APPOINTMENT_CANCELLED = "scheduling.appointment.cancelled"
    APPOINTMENT_NO_SHOW = "scheduling.appointment.no_show"

    # Timetable / resource availability
    SCHEDULE_CREATED = "scheduling.schedule.created"
    SCHEDULE_UPDATED = "scheduling.schedule.updated"

    # Assignment engine
    ASSIGNMENT_DECIDED = "scheduling.assignment.decided"
    OVERRIDE_CREATED = "scheduling.override.created"
    OVERRIDE_APPROVED = "scheduling.override.approved"
    OVERRIDE_REJECTED = "scheduling.override.rejected"
    RULE_ACTIVATED = "scheduling.rule.activated"
    RULE_DEACTIVATED = "scheduling.rule.deactivated"

    # Shift / duty roster
    SHIFT_CREATED = "scheduling.shift.created"
    SHIFT_STARTED = "scheduling.shift.started"
    SHIFT_COMPLETED = "scheduling.shift.completed"
    SHIFT_CANCELLED = "scheduling.shift.cancelled"
    SHIFT_ABSENT = "scheduling.shift.absent"
    SHIFT_AUTO_COMPLETED = "scheduling.shift.auto_completed"
    SHIFT_BREAK_STARTED = "scheduling.shift.break_started"
    SHIFT_BREAK_RESUMED = "scheduling.shift.break_resumed"
    SHIFT_EMERGENCY_CREATED = "scheduling.shift.emergency_created"

    # Shift notifications
    SHIFT_REMINDER_SENT = "scheduling.shift.reminder_sent"

    # Shift swap lifecycle
    SWAP_REQUESTED = "scheduling.swap.requested"
    SWAP_ACCEPTED = "scheduling.swap.accepted"
    SWAP_APPROVED = "scheduling.swap.approved"
    SWAP_COMPLETED = "scheduling.swap.completed"
    SWAP_REJECTED = "scheduling.swap.rejected"
    SWAP_CANCELLED = "scheduling.swap.cancelled"
    SWAP_EXPIRED = "scheduling.swap.expired"


class InventoryEvents:
    """Inventory / procurement domain event types."""

    SUPPLIER_CREATED = "inventory.supplier.created"
    PO_CREATED = "inventory.purchase_order.created"
    PO_SUBMITTED = "inventory.purchase_order.submitted"
    PO_APPROVED = "inventory.purchase_order.approved"
    PO_CANCELLED = "inventory.purchase_order.cancelled"
    GRN_CREATED = "inventory.grn.created"
    GRN_CONFIRMED = "inventory.grn.confirmed"
    GRN_CANCELLED = "inventory.grn.cancelled"

    # Phase 2: Multi-store transfers
    TRANSFER_CREATED = "inventory.transfer.created"
    TRANSFER_REQUESTED = "inventory.transfer.requested"
    TRANSFER_APPROVED = "inventory.transfer.approved"
    TRANSFER_DISPATCHED = "inventory.transfer.dispatched"
    TRANSFER_RECEIVED = "inventory.transfer.received"
    TRANSFER_CANCELLED = "inventory.transfer.cancelled"

    # Phase 3: Ward / Satellite stock
    WARD_STOCK_LOW = "inventory.ward_stock.low"
    WARD_STOCK_CONSUMED = "inventory.ward_stock.consumed"
    WARD_STOCK_REPLENISHED = "inventory.ward_stock.replenished"

    # Phase 4: Stock reconciliation
    STOCK_COUNT_COMPLETED = "inventory.stock_count.completed"
    STOCK_COUNT_APPROVED = "inventory.stock_count.approved"

    # Phase 5: KRA eTIMS
    ETIMS_SUBMITTED = "inventory.etims.submitted"
    ETIMS_CONFIRMED = "inventory.etims.confirmed"
    ETIMS_FAILED = "inventory.etims.failed"

    # Phase 6: Demand Forecasting
    REORDER_SUGGESTION_CREATED = "inventory.reorder_suggestion.created"
    REORDER_CONVERTED_TO_PO = "inventory.reorder_suggestion.converted_to_po"


class ImagingEvents:
    """Imaging domain event types."""

    ORDER_CREATED = "imaging.order.created"
    ORDER_ITEM_CREATED = "imaging.order_item.created"
    RESULT_COMPLETED = "imaging.result.completed"


class TheatreEvents:
    """Theatre / Operating Room domain event types."""

    CASE_CREATED = "theatre.case.created"
    CASE_SCHEDULED = "theatre.case.scheduled"
    CASE_STATUS_CHANGED = "theatre.case.status_changed"
    CASE_CANCELLED = "theatre.case.cancelled"
    CASE_POSTPONED = "theatre.case.postponed"
    TEAM_ASSIGNED = "theatre.team.assigned"
    CHECKLIST_SIGN_IN = "theatre.checklist.sign_in"
    CHECKLIST_TIME_OUT = "theatre.checklist.time_out"
    CHECKLIST_SIGN_OUT = "theatre.checklist.sign_out"
    SURGERY_STARTED = "theatre.surgery.started"
    SURGERY_COMPLETED = "theatre.surgery.completed"
    PACU_ARRIVED = "theatre.pacu.arrived"
    PACU_DISCHARGED = "theatre.pacu.discharged"
