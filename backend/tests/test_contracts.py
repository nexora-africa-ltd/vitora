"""
Serializer Contract Snapshot Tests
===================================

These tests assert that each DRF serializer's field set matches a known contract.
If a backend developer adds, removes, or renames a field, the test will fail with
a clear message indicating that the frontend Zod schema needs updating too.

This is the cheapest, most effective way to prevent API shape mismatches between
the Django backend and the Next.js frontend.

How to update:
  1. Intentionally change a serializer field.
  2. Run: poetry run pytest tests/test_contracts.py -v
  3. The test will fail, showing which fields were added/removed.
  4. Update the CONTRACTS dict below to match the new expected fields.
  5. Update the corresponding frontend Zod schema in web-app/lib/schemas/.
"""

import pytest  # type: ignore

# ── Serializer imports ──────────────────────────────────────────────

from hmis.apps.billing.serializers import (
    CreditNoteSerializer,
    InvoiceItemSerializer,
    InvoiceSerializer,
    PaymentPointSerializer,
    PaymentSerializer,
    ReceiptSerializer,
    ServiceCategorySerializer,
    ServiceSerializer,
)
from hmis.apps.checkin.serializers import (
    CheckInResponseSerializer,
    TodayCheckinSerializer,
)
from hmis.apps.clinical_templates.serializers import (
    ClinicalTemplateListSerializer,
    ClinicalTemplateSerializer,
)
from hmis.apps.clinics.serializers import (
    ClinicEnrollmentSerializer,
    ClinicScheduleSerializer,
    ClinicSerializer,
    ClinicSessionSerializer,
    ClinicStaffSerializer,
    ClinicVisitSerializer,
)
from hmis.apps.core.serializers import (
    AuditLogSerializer,
    CountySerializer,
    DepartmentSerializer,
    NotificationSerializer,
    PermissionSerializer,
    RoleSerializer,
    StaffProfileSerializer,
    SubCountySerializer,
    WardSerializer as CoreWardSerializer,
)
from hmis.apps.encounters.serializers import (
    DiagnosisSerializer,
    EncounterListSerializer,
    EncounterSerializer,
    ICD10CodeSerializer,
    MedicationSerializer,
    TreatmentPlanSerializer,
    TreatmentPlanTemplateSerializer,
)
from hmis.apps.imaging.serializers import (
    ImagingOrderItemSerializer,
    ImagingOrderSerializer,
    ImagingProcedureDetailSerializer,
    ImagingProcedureSerializer,
)
from hmis.apps.inpatient.serializers import (
    AdmissionRecommendationSerializer,
    AdmissionSerializer,
    BedSerializer,
    DischargeSerializer,
    InpatientWardSerializer,
    NursingKardexSerializer,
    ShiftHandoverSerializer,
    TransferSerializer,
    WardRoundSerializer,
)
from hmis.apps.laboratory.serializers import (
    LabOrderSerializer,
    LabResultSerializer,
    TestCatalogSerializer,
)
from hmis.apps.patients.serializers import (
    EmergencyContactSerializer,
    PatientSerializer,
)
from hmis.apps.pharmacy.serializers import (
    AlertSettingsSerializer,
    DispensingSerializer,
    DrugCategorySerializer,
    DrugSerializer,
    PrescriptionItemSerializer,
    PrescriptionSerializer,
    StockAdjustmentSerializer,
    StockAlertSerializer,
    StockBatchSerializer,
)
from hmis.apps.scheduling.serializers import (
    AppointmentSerializer,
    ResourceSerializer,
    ScheduleSerializer,
)
from hmis.apps.triage.serializers import (
    TriageAssessmentSerializer,
    TriageQueueSerializer,
    WaitingQueueSerializer,
)

# ── Contracts ───────────────────────────────────────────────────────
# Each entry: (SerializerClass, frozenset of expected field names)
#
# To regenerate an entry, run in Django shell:
#   from hmis.apps.patients.serializers import PatientSerializer
#   print(sorted(PatientSerializer().fields.keys()))

CONTRACTS: list[tuple[type, frozenset[str]]] = [
    # ── patients ────────────────────────────────────────────────────
    (
        PatientSerializer,
        frozenset({
            "id", "mrn", "cr_number", "sha_number", "title",
            "first_name", "middle_name", "last_name", "full_name",
            "date_of_birth", "place_of_birth", "age", "gender",
            "citizenship", "is_person_with_disability",
            "identification_type", "identification_number",
            "national_id", "phone_number", "email", "address",
            "county", "county_name", "sub_county", "sub_county_name",
            "ward", "ward_name", "village",
            "consent_given", "consent_date", "consent_deferred",
            "is_sensitive",
            "emergency_contacts",
            "emergency_contact_name", "emergency_contact_phone",
            "emergency_contact_relationship",
            "referral_source", "referred_from_facility",
            "registered_by", "registered_by_username",
            "created_at", "updated_at",
        }),
    ),
    (
        EmergencyContactSerializer,
        frozenset({
            "id", "full_name", "relationship", "phone_number",
            "alternative_phone", "created_at", "updated_at",
        }),
    ),
    # ── encounters ──────────────────────────────────────────────────
    (
        EncounterSerializer,
        frozenset({
            "id", "patient", "patient_id", "patient_mrn", "patient_name",
            "patient_gender", "patient_date_of_birth", "patient_age",
            "encounter_type", "encounter_type_display",
            "encounter_date", "arrival_time", "chief_complaint",
            "temperature", "pulse", "blood_pressure",
            "systolic_bp", "diastolic_bp",
            "respiratory_rate", "spo2", "weight", "height",
            "vitals_source", "vitals_recorded_by", "vitals_recorded_at",
            "bmi", "bmi_classification", "vitals_summary",
            "allergies", "chronic_conditions", "current_medications",
            "past_surgeries", "family_history", "social_history",
            "notes", "history_of_present_illness",
            "physical_examination", "assessment",
            "clinical_template", "clinical_template_data",
            "has_critical_vitals", "alerts",
            "status", "finalized_by", "finalized_by_username", "finalized_at",
            "cancellation_reason",
            "triage_requirement", "triage_status",
            "triage_category", "triage_completed_at",
            "triage_bypass_reason", "triage_bypassed_by",
            "triage_bypassed_by_username", "triage_bypassed_at",
            "consultation_status", "called_at", "consultation_started_at",
            "can_enter_consultation", "wait_time_minutes",
            "chief_complaint_original", "chief_complaint_edited",
            "chief_complaint_edit_reason", "chief_complaint_edit_reason_other",
            "chief_complaint_edited_by", "chief_complaint_edited_by_username",
            "chief_complaint_edited_at",
            "assigned_clinician", "assigned_clinician_username",
            "assigned_clinician_name", "claimed_at",
            "clinic_visit_id", "clinic_name", "clinic_type",
            "linked_encounter", "visit_reason",
            "created_by", "created_by_name",
            "created_at", "updated_at", "disposition", "disposition_notes",
        }),
    ),
    (
        EncounterListSerializer,
        frozenset({
            "id", "patient", "patient_mrn", "patient_name",
            "encounter_type", "encounter_date", "chief_complaint",
            "has_critical_vitals", "status", "finalized_at",
            "clinic_visit_id", "clinic_name", "clinic_type",
            "visit_reason", "created_at", "disposition",
        }),
    ),
    (
        ICD10CodeSerializer,
        frozenset({
            "id", "code", "short_description", "description",
            "long_description", "category", "chapter",
            "is_billable", "is_active",
        }),
    ),
    (
        DiagnosisSerializer,
        frozenset({
            "id", "encounter", "icd10_code", "icd10_code_display",
            "icd10_description", "icd11_code", "icd11_display",
            "diagnosis_type", "free_text_diagnosis", "notes",
            "is_confirmed", "certainty",
            "diagnosed_by", "diagnosed_by_name", "diagnosed_at",
            "created_at", "updated_at",
        }),
    ),
    (
        TreatmentPlanSerializer,
        frozenset({
            "id", "encounter", "template", "template_name",
            "clinical_notes", "medications_json", "procedures_json",
            "follow_up_instructions", "follow_up_date",
            "diet_recommendations", "activity_restrictions",
            "referral_needed", "referral_specialty", "referral_notes",
            "status", "has_follow_up", "has_referral", "medications",
            "created_by", "created_by_name",
            "approved_by", "approved_by_name",
            "created_at", "updated_at",
        }),
    ),
    (
        TreatmentPlanTemplateSerializer,
        frozenset({
            "id", "name", "description", "diagnosis_codes",
            "diagnosis_codes_display", "default_medications",
            "default_procedures", "default_instructions",
            "follow_up_days", "department", "is_active",
            "created_by", "created_by_name",
            "created_at", "updated_at",
        }),
    ),
    (
        MedicationSerializer,
        frozenset({
            "id", "treatment_plan", "name", "dosage", "frequency",
            "duration", "route", "quantity", "instructions",
            "start_date", "end_date", "is_active",
            "created_at", "updated_at",
        }),
    ),
    # ── core ────────────────────────────────────────────────────────
    (
        AuditLogSerializer,
        frozenset({
            "id", "user", "username", "action", "resource_type",
            "resource_id", "timestamp", "ip_address", "user_agent",
            "details", "patient_id",
        }),
    ),
    (
        CountySerializer,
        frozenset({"id", "code", "name"}),
    ),
    (
        SubCountySerializer,
        frozenset({"id", "county", "county_name", "name"}),
    ),
    (
        CoreWardSerializer,
        frozenset({"id", "sub_county", "sub_county_name", "name"}),
    ),
    (
        DepartmentSerializer,
        frozenset({
            "id", "code", "name", "department_type", "parent",
            "parent_name", "head", "head_name", "staff_count",
            "is_active", "created_at", "updated_at",
        }),
    ),
    (
        RoleSerializer,
        frozenset({
            "id", "code", "name", "category", "description",
            "permissions_matrix", "hierarchy_level",
            "parent_role", "parent_role_name",
            "django_group", "django_group_name",
            "requires_license", "license_body", "is_active",
            "created_at", "updated_at",
        }),
    ),
    (
        StaffProfileSerializer,
        frozenset({
            "id", "user", "user_username", "user_email",
            "user_first_name", "user_last_name", "full_name",
            "employee_id", "title", "middle_name",
            "primary_role", "primary_role_name",
            "secondary_roles",
            "primary_department", "primary_department_name",
            "secondary_departments",
            "hwr_id", "license_number", "license_expiry",
            "license_verified", "licensing_body", "is_license_valid",
            "specialization", "phone_number",
            "emergency_contact_name", "emergency_contact_phone",
            "employment_status", "employment_type",
            "date_joined", "date_left", "supervisor",
            "created_at", "updated_at",
        }),
    ),
    (
        NotificationSerializer,
        frozenset({
            "id", "notification_type", "priority", "title",
            "message", "related_model", "related_id", "action_url",
            "is_read", "read_at", "created_at",
        }),
    ),
    (
        PermissionSerializer,
        frozenset({"id", "codename", "name", "app_label", "model"}),
    ),
    # ── clinics ─────────────────────────────────────────────────────
    (
        ClinicSerializer,
        frozenset({
            "id", "name", "clinic_type", "clinic_type_display",
            "code", "description", "location", "floor", "capacity",
            "status", "status_display",
            "requires_appointment", "requires_referral", "accepts_walk_ins",
            "triage_required", "eligibility_rules",
            "default_service_fee", "sha_service_code",
            "dhis2_org_unit_id", "moh_code",
            "default_clinical_template", "is_sensitive", "required_permission",
            "is_open_today", "created_at", "updated_at",
        }),
    ),
    (
        ClinicSessionSerializer,
        frozenset({
            "id", "clinic", "clinic_name", "session_date",
            "status", "status_display",
            "opened_at", "closed_at",
            "opened_by", "opened_by_name",
            "closed_by", "closed_by_name", "notes",
            "patients_registered", "patients_seen", "patients_waiting",
            "created_at", "updated_at",
        }),
    ),
    (
        ClinicVisitSerializer,
        frozenset({
            "id", "session", "patient", "patient_name", "patient_mrn",
            "clinic_name", "queue_number",
            "status", "status_display",
            "priority", "priority_display",
            "visit_type", "visit_type_display",
            "source", "source_display",
            "registered_at", "called_at",
            "consultation_started_at", "completed_at",
            "encounter", "triage_assessment",
            "referred_from", "referred_to_clinic", "referral_reason",
            "assigned_clinician", "assigned_clinician_name",
            "registered_by", "registered_by_name",
            "chief_complaint", "notes",
            "consultation_fee_charged", "billing_line_item",
            "wait_time_minutes",
            "created_at", "updated_at",
        }),
    ),
    (
        ClinicStaffSerializer,
        frozenset({
            "id", "clinic", "clinic_name", "user", "user_name",
            "user_email", "role", "role_display", "is_primary",
            "start_date", "end_date", "is_active",
            "created_at", "updated_at",
        }),
    ),
    (
        ClinicScheduleSerializer,
        frozenset({
            "id", "clinic", "clinic_name", "day_of_week", "day_display",
            "start_time", "end_time", "max_patients", "is_active",
            "notes", "created_at", "updated_at",
        }),
    ),
    (
        ClinicEnrollmentSerializer,
        frozenset({
            "id", "clinic", "clinic_name", "clinic_type",
            "patient", "patient_name", "patient_mrn",
            "enrollment_number", "enrollment_date",
            "status", "status_display", "enrollment_data",
            "next_appointment", "appointment_interval_days",
            "enrolled_by", "enrolled_by_name",
            "last_visit_date", "total_visits",
            "outcome_date", "outcome_reason", "transfer_facility",
            "is_overdue", "is_defaulter",
            "days_since_last_visit", "days_overdue",
            "enrollment_type", "clinic_specific_summary",
            # HIV/ART fields
            "art_start_date", "current_art_regimen", "art_regimen_line",
            "who_clinical_stage", "baseline_cd4_count",
            "latest_cd4_count", "latest_cd4_date",
            "latest_viral_load", "latest_viral_load_date",
            "viral_load_suppressed", "days_on_art",
            "viral_load_due", "cd4_due", "is_virally_suppressed",
            # ANC fields
            "gravida", "para", "lmp", "edd", "height_cm",
            "blood_group", "rhesus_factor",
            "hiv_status", "partner_hiv_status",
            "previous_cesarean", "high_risk_pregnancy", "high_risk_factors",
            "gestation_weeks", "gestation_display", "trimester", "days_to_edd",
            # Diabetes fields
            "diabetes_type", "diabetes_diagnosis_date",
            "latest_hba1c", "latest_hba1c_date",
            "latest_fbs", "latest_fbs_date",
            "on_insulin", "diabetes_complications",
            "hba1c_controlled", "hba1c_due",
            # Tracking
            "last_reminder_sent", "missed_appointment_alerts",
            "created_at", "updated_at",
        }),
    ),
    # ── billing ─────────────────────────────────────────────────────
    (
        ServiceCategorySerializer,
        frozenset({
            "id", "code", "name", "description",
            "display_order", "is_active",
            "created_at", "updated_at",
        }),
    ),
    (
        ServiceSerializer,
        frozenset({
            "id", "code", "name", "description",
            "category", "category_name", "unit_price",
            "currency",
            "sha_code", "icd10_code",
            "is_taxable", "requires_quantity",
            "is_active", "is_available",
            "created_by", "created_by_username",
            "created_at", "updated_at",
        }),
    ),
    (
        InvoiceSerializer,
        frozenset({
            "id", "invoice_number", "patient", "patient_name", "patient_mrn",
            "encounter", "invoice_date", "due_date",
            "status", "payment_type",
            "subtotal", "discount_amount", "discount_reason",
            "discount_type", "discount_value",
            "tax_amount", "total_amount", "amount_paid",
            "balance", "balance_due",
            "insurance_provider", "insurance_member_no",
            "insurance_coverage",
            "sha_claim_number", "insurance_amount",
            "notes", "cancellation_reason",
            "cancelled_by", "cancelled_at",
            "valid_until", "is_converted", "converted_at",
            "converted_from_proforma",
            "is_valid", "days_until_expiry", "can_convert",
            "created_by", "created_by_username",
            "items", "qr_code",
            "created_at", "updated_at",
        }),
    ),
    (
        InvoiceItemSerializer,
        frozenset({
            "id", "invoice", "service", "service_name",
            "description", "quantity", "unit_price",
            "discount_percentage",
            "discount_amount", "line_total",
            "is_covered_by_insurance", "insurance_approved_amount",
            "drug", "drug_name",
            "lab_order", "lab_order_name",
            "is_converted", "converted_at", "converted_from_item",
            "sha_code", "created_at",
            "updated_at",
        }),
    ),
    (
        PaymentSerializer,
        frozenset({
            "id", "payment_reference", "invoice", "invoice_number",
            "method", "payment_point", "payment_details", "amount",
            "status", "mpesa_receipt_number", "mpesa_transaction_id",
            "mpesa_phone", "notes",
            "received_by", "received_by_username",
            "payment_date", "created_at", "updated_at",
        }),
    ),
    (
        PaymentPointSerializer,
        frozenset({
            "id", "name", "code", "method",
            "till_number", "paybill_number", "paybill_account_number",
            "bank_name", "bank_account_name",
            "bank_account_number", "bank_branch",
            "is_active", "notes",
            "created_by", "created_by_username",
            "created_at", "updated_at",
        }),
    ),
    (
        ReceiptSerializer,
        frozenset({
            "id", "receipt_number", "receipt_date",
            "payment", "invoice", "patient",
            "patient_name", "patient_mrn",
            "amount", "amount_in_words", "payment_method",
            "facility_name", "facility_address",
            "facility_phone", "facility_kra_pin",
            "is_voided", "voided_at", "void_reason",
            "issued_by", "issued_by_username",
            "received_by_username",
            "payment_point_name", "payment_point_code",
            "line_items", "qr_code", "created_at",
        }),
    ),
    (
        CreditNoteSerializer,
        frozenset({
            "id", "credit_note_number", "invoice", "invoice_number",
            "patient", "patient_name",
            "amount", "reason", "reason_detail",
            "status", "refund_method", "refund_reference",
            "requested_by", "requested_by_username",
            "approved_by", "approved_by_username", "approved_at",
            "refunded_at", "created_at", "updated_at",
        }),
    ),
    # ── pharmacy ────────────────────────────────────────────────────
    (
        DrugSerializer,
        frozenset({
            "id", "code", "generic_name", "brand_names", "strength",
            "form", "category", "categories", "unit", "schedule",
            "is_essential", "keml_code", "nhif_code",
            "requires_prescription", "is_controlled", "is_narcotic",
            "default_reorder_level", "default_reorder_quantity",
            "shelf_life_months", "storage_requirements",
            "reference_price", "is_active",
            "display_name", "current_stock",
            "created_at", "updated_at",
        }),
    ),
    (
        DrugCategorySerializer,
        frozenset({
            "id", "code", "name", "value", "label",
            "is_active", "created_at", "updated_at",
        }),
    ),
    (
        StockBatchSerializer,
        frozenset({
            "id", "drug", "drug_name", "batch_number",
            "quantity_received", "quantity_available",
            "quantity_dispensed", "quantity_damaged", "quantity_expired",
            "expiry_date", "days_until_expiry",
            "is_expired_status", "is_low_stock_status",
            "status", "cost_price", "selling_price",
            "supplier", "purchase_order",
            "received_date", "received_by",
            "created_at", "updated_at",
        }),
    ),
    (
        StockAlertSerializer,
        frozenset({
            "id", "drug", "drug_name", "batch_number",
            "alert_type", "severity", "message",
            "acknowledged", "is_acknowledged",
            "acknowledged_by", "acknowledged_at",
            "resolved", "is_resolved",
            "resolved_by", "resolved_at", "resolution_notes",
            "created_at",
        }),
    ),
    (
        PrescriptionSerializer,
        frozenset({
            "id", "prescription_number", "encounter",
            "patient", "patient_name", "patient_mrn",
            "prescribed_by", "prescriber_name",
            "prescribed_at", "prescribed_date", "valid_until",
            "status", "clinical_notes",
            "is_valid", "is_valid_prescription",
            "is_fully_dispensed", "is_fully_dispensed_status",
            "items", "verification_url",
            "created_at", "updated_at",
        }),
    ),
    (
        PrescriptionItemSerializer,
        frozenset({
            "id", "prescription", "drug", "drug_name", "drug_code",
            "quantity", "quantity_prescribed",
            "dosage", "frequency", "duration", "route",
            "instructions", "is_substitutable",
            "quantity_dispensed", "remaining_qty", "remaining_quantity",
            "is_cancelled", "cancellation_reason",
        }),
    ),
    (
        DispensingSerializer,
        frozenset({
            "id", "prescription_item", "patient", "patient_name",
            "drug", "drug_name", "batch", "batch_number",
            "quantity_dispensed", "quantity_returned",
            "unit_price", "total_price", "discount",
            "instructions_given", "patient_counseled",
            "dispensed_by", "dispensed_by_name", "dispensed_at",
            "verified_by", "verified_by_name", "verified_at",
            "notes", "created_at",
        }),
    ),
    (
        StockAdjustmentSerializer,
        frozenset({
            "id", "batch", "batch_number", "drug_name",
            "adjustment_type", "quantity", "reason",
            "reference_number",
            "adjusted_by", "adjusted_by_name", "adjusted_at",
            "requires_approval",
            "approved_by", "approved_by_name", "approved_at",
        }),
    ),
    (
        AlertSettingsSerializer,
        frozenset({
            "id", "low_stock_threshold",
            "expiry_warning_days", "expiry_critical_days",
            "enable_email_notifications",
            "notification_email_recipients",
            "updated_by", "updated_by_name",
            "updated_at", "created_at",
        }),
    ),
    # ── laboratory ──────────────────────────────────────────────────
    (
        TestCatalogSerializer,
        frozenset({
            "id", "code", "name", "short_name", "category",
            "specimen_type", "cost", "sha_claimable",
            "available_in_house", "is_active",
        }),
    ),
    (
        LabOrderSerializer,
        frozenset({
            "id", "order_number", "patient", "patient_name",
            "encounter", "ordered_by", "ordered_by_name",
            "order_type", "external_lab", "priority",
            "clinical_notes", "status",
            "specimen_collected", "total_cost",
            "items", "ordered_at", "completed_at",
            "created_at", "updated_at",
        }),
    ),
    (
        LabResultSerializer,
        frozenset({
            "id", "order_item", "test_name", "test_code",
            "numeric_value", "text_value", "option_value",
            "result_flag", "formatted_value", "interpretation",
            "verification_status", "verified_by", "verified_at",
            "entered_by", "entered_at", "is_external_result",
        }),
    ),
    # ── triage ──────────────────────────────────────────────────────
    (
        TriageAssessmentSerializer,
        frozenset({
            "id", "encounter", "patient_name", "patient_mrn",
            "patient_age", "chief_complaint",
            "chief_complaint_category", "pain_score",
            "mental_status", "mobility", "arrival_mode",
            "allergies_noted", "spo2", "heart_rate",
            "systolic_bp", "diastolic_bp",
            "temperature", "respiratory_rate",
            "triage_category", "auto_calculated_category",
            "category_override_reason",
            "assigned_area", "assigned_clinician",
            "arrival_time", "triage_start_time",
            "triage_end_time", "seen_by_clinician_time",
            "alerts", "vitals",
            "wait_time_minutes", "is_wait_time_exceeded",
            "triaged_by", "triaged_by_name",
            "created_at", "updated_at",
        }),
    ),
    (
        TriageQueueSerializer,
        frozenset({
            "id", "patient_id", "patient_name", "patient_mrn",
            "patient_age", "patient_gender",
            "triage_category", "chief_complaint_category",
            "chief_complaint", "assigned_area", "assigned_area_display",
            "arrival_time", "triage_time",
            "wait_time_minutes", "alerts_count",
            "status", "position",
            "called_at", "called_by_name", "notes",
            "created_at", "updated_at",
        }),
    ),
    (
        WaitingQueueSerializer,
        frozenset({
            "id", "patient", "patient_name", "patient_mrn",
            "patient_age", "patient_gender",
            "encounter", "check_in_time", "reason_for_visit",
            "status", "priority_hint", "notes",
            "wait_time_minutes", "created_at",
        }),
    ),
    # ── inpatient ───────────────────────────────────────────────────
    (
        InpatientWardSerializer,
        frozenset({
            "id", "name", "code", "ward_type", "ward_type_display",
            "floor", "capacity", "description", "is_active",
            "daily_rate", "available_beds", "total_beds",
            "occupied_beds", "occupancy_rate",
            "created_at", "updated_at",
        }),
    ),
    (
        BedSerializer,
        frozenset({
            "id", "ward", "ward_name", "bed_number",
            "status", "status_display", "notes",
            "status_changed_by", "status_changed_by_username",
            "status_changed_at", "created_at", "updated_at",
        }),
    ),
    (
        AdmissionSerializer,
        frozenset({
            "id", "admission_number", "patient", "patient_name",
            "opd_encounter", "ipd_encounter",
            "recommendation", "admission_date",
            "admitting_diagnosis", "admitting_diagnosis_text",
            "admitting_officer", "admitting_officer_username",
            "attending_doctor", "attending_doctor_username",
            "ward", "ward_name", "bed", "bed_number",
            "admission_status", "admission_status_display",
            "payer_type", "payer_type_display", "insurance_details",
            "length_of_stay", "created_at", "updated_at",
        }),
    ),
    (
        AdmissionRecommendationSerializer,
        frozenset({
            "id", "encounter",
            "recommended_by", "recommended_by_username",
            "reason", "provisional_diagnosis",
            "provisional_diagnosis_text",
            "urgency", "urgency_display",
            "preferred_ward_type",
            "status", "status_display",
            "expires_at", "resolved_at",
            "resolved_by", "resolved_by_username",
            "decline_reason", "is_expired",
            "created_at", "updated_at",
        }),
    ),
    (
        DischargeSerializer,
        frozenset({
            "id", "admission", "admission_number", "patient_name",
            "discharge_type", "discharge_type_display",
            "discharge_date", "discharged_by", "discharged_by_username",
            "admission_diagnosis", "final_diagnosis", "final_diagnosis_text",
            "procedures_performed", "treatment_summary",
            "discharge_medications",
            "follow_up_date", "follow_up_instructions",
            "referral_facility", "referral_reason",
            "patient_instructions",
            "pharmacy_cleared", "billing_cleared",
            "lab_results_acknowledged",
            "length_of_stay", "created_at", "updated_at",
        }),
    ),
    (
        TransferSerializer,
        frozenset({
            "id", "admission", "admission_number", "patient_name",
            "source_ward", "source_ward_name",
            "source_bed", "source_bed_number",
            "destination_ward", "destination_ward_name",
            "destination_bed", "destination_bed_number",
            "reason", "reason_display", "reason_details",
            "transferred_by", "transferred_by_username",
            "transfer_date", "clinical_handover_notes",
            "created_at", "updated_at",
        }),
    ),
    (
        WardRoundSerializer,
        frozenset({
            "id", "admission", "admission_number", "patient_name",
            "round_date", "round_time",
            "conducted_by", "conducted_by_username",
            "subjective", "objective", "assessment", "plan",
            "condition_status", "condition_status_display",
            "requires_consultant_review", "consultant_specialty",
            "created_at", "updated_at",
        }),
    ),
    (
        NursingKardexSerializer,
        frozenset({
            "id", "admission", "admission_number",
            "patient_name", "ward_name", "bed_number",
            "mobility_status", "dietary_requirements", "allergies",
            "iv_access", "nursing_problems", "interventions",
            "monitoring_requirements", "care_task_frequency",
            "fall_risk", "fall_risk_display",
            "pressure_sore_risk", "pressure_sore_risk_display",
            "isolation_required", "isolation_type",
            "shift_notes", "handover_notes",
            "created_at", "updated_at",
        }),
    ),
    (
        ShiftHandoverSerializer,
        frozenset({
            "id", "ward", "ward_name",
            "shift_date", "shift_ending", "shift_ending_display",
            "outgoing_nurse", "outgoing_nurse_username",
            "incoming_nurse", "incoming_nurse_username",
            "total_patients", "critical_patients",
            "new_admissions", "discharges_pending",
            "general_notes", "acknowledged_at", "is_acknowledged",
            "created_at", "updated_at",
        }),
    ),
    # ── imaging ─────────────────────────────────────────────────────
    (
        ImagingProcedureSerializer,
        frozenset({
            "id", "code", "name", "modality", "body_region",
            "cost", "sha_claimable", "available_in_house", "is_active",
        }),
    ),
    (
        ImagingProcedureDetailSerializer,
        frozenset({
            "id", "code", "name", "modality", "body_region",
            "radlex_code", "loinc_code",
            "requires_contrast", "requires_sedation",
            "special_preparation", "turnaround_hours",
            "cost", "sha_claimable", "sha_intervention_code",
            "is_active", "available_in_house",
            "created_at", "updated_at",
        }),
    ),
    (
        ImagingOrderSerializer,
        frozenset({
            "id", "order_number", "patient", "patient_name",
            "encounter", "ordered_by", "ordered_by_name",
            "priority", "clinical_indication",
            "relevant_clinical_history", "status",
            "scheduled_datetime", "scheduled_room",
            "accession_number", "study_instance_uid",
            "total_cost", "is_paid",
            "items", "ordered_at", "completed_at",
        }),
    ),
    (
        ImagingOrderItemSerializer,
        frozenset({
            "id", "procedure", "procedure_name", "procedure_code",
            "modality", "laterality", "specific_instructions",
            "is_completed", "completed_at", "unit_cost",
        }),
    ),
    # ── checkin ─────────────────────────────────────────────────────
    (
        CheckInResponseSerializer,
        frozenset({
            "checkin_id", "patient_name", "patient_mrn",
            "destination", "destination_clinic_id", "destination_clinic_name",
            "visit_type", "visit_reason", "skip_triage",
            "status", "queue_position", "estimated_wait_minutes",
            "checked_in_at", "encounter_id", "linked_encounter_id",
            "clinic_visit_id", "warning",
        }),
    ),
    (
        TodayCheckinSerializer,
        frozenset({
            "id", "patient_name", "patient_mrn",
            "destination", "destination_clinic_id",
            "visit_type", "visit_reason", "status",
            "checked_in_at", "checked_in_by_name", "skip_triage",
        }),
    ),
    # ── clinical_templates ──────────────────────────────────────────
    (
        ClinicalTemplateSerializer,
        frozenset({
            "id", "name", "template_type", "specialty",
            "description", "content", "is_system", "is_active",
            "usage_count", "created_by", "created_by_username",
            "created_at", "updated_at", "sections",
        }),
    ),
    (
        ClinicalTemplateListSerializer,
        frozenset({
            "id", "name", "template_type", "specialty",
            "description", "is_system", "is_active",
            "usage_count", "created_by", "created_by_username",
            "created_at", "updated_at",
        }),
    ),
    # ── scheduling ──────────────────────────────────────────────────
    (
        ResourceSerializer,
        frozenset({
            "id", "name", "resource_type", "code", "is_active",
            "capacity", "staff_profile", "staff_profile_name",
            "metadata", "description",
            "created_at", "updated_at",
        }),
    ),
    (
        ScheduleSerializer,
        frozenset({
            "id", "resource", "resource_name",
            "schedule_type", "day_of_week", "day_of_week_display",
            "specific_date", "start_time", "end_time",
            "slot_duration_minutes", "buffer_minutes",
            "max_appointments", "effective_from", "effective_until",
            "is_active", "notes", "breaks",
            "created_at", "updated_at",
        }),
    ),
    (
        AppointmentSerializer,
        frozenset({
            "id", "appointment_number",
            "patient", "patient_name", "patient_mrn",
            "resource", "resource_name", "resource_code",
            "appointment_type", "appointment_type_display",
            "scheduled_start", "scheduled_end",
            "actual_start", "actual_end",
            "status", "status_display",
            "confirmed_at", "confirmed_by", "confirmed_by_name",
            "checked_in_at", "checked_in_by",
            "cancelled_at", "cancelled_by", "cancelled_by_name",
            "cancellation_reason",
            "reason", "notes", "completion_notes",
            "priority", "duration_minutes", "is_upcoming",
            "created_by", "created_by_name",
            "created_at", "updated_at",
        }),
    ),
]


def _serializer_id(val):
    """Generate readable test IDs from serializer class names."""
    if isinstance(val, type):
        return val.__name__
    return None


@pytest.mark.django_db
class TestSerializerContracts:
    """
    Snapshot tests for API response shapes.

    If these fail, the frontend Zod schemas likely need updating too.
    When updating, also update the corresponding schema file in:
      web-app/lib/schemas/<module>.schema.ts
    """

    @pytest.mark.parametrize(
        "serializer_class, expected_fields",
        CONTRACTS,
        ids=lambda val: _serializer_id(val),
    )
    def test_serializer_fields_match_contract(
        self, serializer_class, expected_fields
    ):
        """Serializer field set must match the contract exactly."""
        actual_fields = frozenset(serializer_class().fields.keys())

        added = actual_fields - expected_fields
        removed = expected_fields - actual_fields

        assert not added, (
            f"\n{serializer_class.__name__}: new fields added to serializer.\n"
            f"  Added: {sorted(added)}\n"
            f"  → Update the CONTRACTS dict in tests/test_contracts.py\n"
            f"  → Update the frontend Zod schema to include these fields"
        )
        assert not removed, (
            f"\n{serializer_class.__name__}: fields removed from serializer.\n"
            f"  Removed: {sorted(removed)}\n"
            f"  → Update the CONTRACTS dict in tests/test_contracts.py\n"
            f"  → Update the frontend Zod schema to remove these fields"
        )

    def test_contract_list_is_not_empty(self):
        """Ensure contracts are actually defined (guards against import errors)."""
        assert len(CONTRACTS) > 50, (
            f"Expected 50+ serializer contracts, found {len(CONTRACTS)}. "
            f"Did an import fail silently?"
        )
