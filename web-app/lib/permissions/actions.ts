/**
 * Action permissions by module
 * Maps specific actions to allowed roles.
 *
 * Used by `usePermissions().canPerformAction(action)` for Layer 2 RBAC:
 * - Layer 1 (MODULE_PERMISSIONS) gates sidebar visibility
 * - Layer 2 (ACTION_PERMISSIONS) gates buttons, pages, and features
 *
 * Nav children can reference these via the `actionKey` prop to filter
 * sub-items for users with partial module access (e.g. a receptionist
 * sees Finance > Invoices but not Finance > SHA Claims).
 *
 * Role codes MUST match backend Role.code values exactly:
 *   COUNSELLOR (not COUNSELOR), DIETITIAN (not NUTRITIONIST), etc.
 */
export const ACTION_PERMISSIONS = {
  // === Patients Module ===
  'patients.view': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'RECORDS_CLERK', 'ADMIN', 'ORG-ADMIN', 'LAB_TECH', 'LAB_SCIENTIST', 'PHARMACIST', 'RADIOGRAPHER', 'RADIOLOGIST', 'BILLING_CLERK', 'CASHIER', 'BILLING_SUPERVISOR', 'HR_OFFICER', 'NURSE_AIDE', 'CHW'],
  'patients.create': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'RECORDS_CLERK', 'ADMIN', 'CHW'],
  'patients.edit': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'RECORDS_CLERK', 'ADMIN', 'CHW'],
  'patients.edit_identity': ['ADMIN', 'RECEPTIONIST', 'RECORDS_CLERK'],
  'patients.view_sensitive': ['DOCTOR', 'CLINICAL_OFFICER', 'CONSULTANT', 'PATHOLOGIST', 'RADIOLOGIST', 'COUNSELLOR', 'SOCIAL_WORKER', 'ADMIN'],
  'patients.export': ['ADMIN', 'RECORDS_CLERK', 'COMPLIANCE_OFFICER'],

  // === Check-in Module ===
  'checkin.checkin': ['RECEPTIONIST', 'NURSE', 'NURSE_AIDE', 'RECORDS_CLERK', 'ADMIN'],
  'checkin.view_queue': ['RECEPTIONIST', 'NURSE', 'NURSE_AIDE', 'RECORDS_CLERK', 'ADMIN'],
  'checkin.checkout': ['RECEPTIONIST', 'NURSE', 'NURSE_AIDE', 'RECORDS_CLERK', 'ADMIN'],

  // === Triage Module ===
  'triage.assess': ['NURSE', 'CLINICAL_OFFICER', 'DOCTOR'],
  'triage.view_queue': ['NURSE', 'NURSE_AIDE', 'CLINICAL_OFFICER', 'DOCTOR', 'ADMIN'],
  'triage.reassess': ['NURSE', 'CLINICAL_OFFICER', 'DOCTOR'],
  'triage.override_category': ['ADMIN'],
  'triage.escalate': ['NURSE', 'CLINICAL_OFFICER', 'DOCTOR'],
  'triage.view_reports': ['NURSE', 'CLINICAL_OFFICER', 'DOCTOR', 'ADMIN'],
  'triage.manage_settings': ['ADMIN'],

  // === Encounters Module ===
  'encounters.create': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST'],
  'encounters.edit': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'ADMIN'],
  'encounters.view_sensitive': ['DOCTOR', 'CLINICAL_OFFICER', 'CONSULTANT', 'COUNSELLOR', 'ADMIN'],
  'encounters.prescribe': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'encounters.order_lab': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'encounters.order_imaging': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'encounters.diagnose': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'encounters.refer': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE'],

  // === Procedures Module ===
  'procedures.view_dashboard': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'procedures.view_orders': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'procedures.create_order': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'procedures.perform': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE'],
  'procedures.view_catalog': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'procedures.manage_catalog': ['ADMIN'],
  'procedures.manage_consent': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE'],

  // === Emergency Module ===
  'emergency.view_dashboard': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'emergency.view_bed_board': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],

  // === Inpatient Module ===
  'inpatient.view_ward': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN', 'ORG-ADMIN'],
  'inpatient.manage_ward': ['ADMIN', 'ORG-ADMIN'],
  'inpatient.create_admission': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'inpatient.view_admissions': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'NURSE_AIDE', 'ADMIN'],
  'inpatient.record_vitals': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'inpatient.make_rounds': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'inpatient.view_reviews': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'inpatient.view_kardex': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE'],
  'inpatient.edit_kardex': ['NURSE'],
  'inpatient.shift_handover': ['NURSE'],
  'inpatient.prescribe': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'inpatient.administer_medication': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'inpatient.order_lab': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'inpatient.order_imaging': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'inpatient.discharge': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'inpatient.transfer': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'inpatient.view_alerts': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],

  // === Last Office (Death Records) Module ===
  'last_office.view_records': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN', 'MORTUARY_ATTENDANT'],
  'last_office.record_death': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'ADMIN'],
  'last_office.certify': ['DOCTOR', 'CONSULTANT'],
  'last_office.release_body': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'ADMIN', 'MORTUARY_ATTENDANT'],
  'last_office.void_record': ['DOCTOR', 'CONSULTANT', 'ADMIN'],

  // === Pharmacy Module ===
  'pharmacy.view_dashboard': ['PHARMACIST', 'PHARMACY_TECH', 'ADMIN'],
  'pharmacy.view_prescriptions': ['PHARMACIST', 'PHARMACY_TECH', 'NURSE', 'DOCTOR'],
  'pharmacy.create_prescription': ['PHARMACIST', 'DOCTOR', 'CLINICAL_OFFICER'],
  'pharmacy.dispense': ['PHARMACIST', 'PHARMACY_TECH'],
  'pharmacy.verify_prescription': ['PHARMACIST'],
  'pharmacy.view_drugs': ['PHARMACIST', 'PHARMACY_TECH', 'DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'pharmacy.manage_stock': ['PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'pharmacy.adjust_inventory': ['PHARMACIST', 'STORE_KEEPER'],
  'pharmacy.view_reports': ['PHARMACIST', 'PHARMACY_TECH', 'ADMIN'],

  // === Laboratory Module ===
  'laboratory.view_dashboard': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN'],
  'laboratory.view_orders': ['LAB_TECH', 'LAB_SCIENTIST', 'DOCTOR', 'NURSE'],
  'laboratory.collect_sample': ['LAB_TECH', 'PHLEBOTOMIST', 'NURSE'],
  'laboratory.enter_results': ['LAB_TECH', 'LAB_SCIENTIST'],
  'laboratory.verify_results': ['LAB_SCIENTIST', 'PATHOLOGIST'],
  'laboratory.release_results': ['LAB_SCIENTIST', 'PATHOLOGIST'],
  'laboratory.view_reports': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN'],
  'laboratory.view_analytics': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN'],

  // === Imaging Module ===
  'imaging.view_dashboard': ['RADIOGRAPHER', 'SONOGRAPHER', 'RADIOLOGIST', 'ADMIN'],
  'imaging.view_orders': ['RADIOGRAPHER', 'SONOGRAPHER', 'RADIOLOGIST', 'DOCTOR', 'NURSE'],
  'imaging.perform_scan': ['RADIOGRAPHER', 'SONOGRAPHER', 'MRI_TECHNOLOGIST', 'CT_TECHNOLOGIST', 'NUCLEAR_MED_TECH'],
  'imaging.upload_images': ['RADIOGRAPHER', 'SONOGRAPHER', 'MRI_TECHNOLOGIST', 'CT_TECHNOLOGIST', 'NUCLEAR_MED_TECH'],
  'imaging.view_studies': ['RADIOGRAPHER', 'SONOGRAPHER', 'RADIOLOGIST', 'DOCTOR'],
  'imaging.write_report': ['RADIOLOGIST'],
  'imaging.verify_report': ['RADIOLOGIST'],

  // === Clinics Module ===
  'clinics.view': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN', 'ORG-ADMIN'],
  'clinics.manage_queue': ['RECEPTIONIST', 'NURSE', 'ADMIN'],
  'clinics.manage_appointments': ['RECEPTIONIST', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'ADMIN'],
  'clinics.manage_staff': ['ADMIN', 'ORG-ADMIN'],
  'clinics.manage_schedule': ['ADMIN', 'ORG-ADMIN'],
  'clinics.view_ccc': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'COUNSELLOR', 'ADMIN'],
  'clinics.view_mental_health': ['DOCTOR', 'CLINICAL_OFFICER', 'COUNSELLOR', 'ADMIN'],

  // === Immunizations Module ===
  'immunizations.view_records': ['NURSE', 'MIDWIFE', 'CLINICAL_OFFICER', 'DOCTOR', 'PHARMACIST', 'CHW'],
  'immunizations.administer': ['NURSE', 'MIDWIFE', 'CLINICAL_OFFICER', 'DOCTOR'],
  'immunizations.manage_campaigns': ['NURSE', 'ADMIN', 'SURVEILLANCE_OFFICER'],
  'immunizations.view_coverage': ['NURSE', 'MIDWIFE', 'CLINICAL_OFFICER', 'DOCTOR', 'ADMIN', 'SURVEILLANCE_OFFICER'],

  // === MCH Module ===
  'mch.register': ['NURSE', 'MIDWIFE', 'CLINICAL_OFFICER', 'DOCTOR'],
  'mch.record_delivery': ['NURSE', 'MIDWIFE', 'DOCTOR'],
  'mch.immunize': ['NURSE', 'MIDWIFE'],
  'mch.view_growth': ['NURSE', 'MIDWIFE', 'CLINICAL_OFFICER', 'DOCTOR', 'CHW'],
  'mch.hei_followup': ['NURSE', 'MIDWIFE', 'CLINICAL_OFFICER', 'DOCTOR'],
  'mch.view_sensitive': ['DOCTOR', 'CLINICAL_OFFICER', 'ADMIN'],

  // === Referrals Module ===
  'referrals.create': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'CHW'],
  'referrals.accept': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'referrals.decline': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'referrals.view_sensitive': ['DOCTOR', 'CLINICAL_OFFICER', 'ADMIN'],

  // === Surveillance Module ===
  'surveillance.view_dashboard': ['DOCTOR', 'NURSE', 'CLINICAL_OFFICER', 'SURVEILLANCE_OFFICER', 'ADMIN'],
  'surveillance.report_case': ['DOCTOR', 'NURSE', 'CLINICAL_OFFICER', 'SURVEILLANCE_OFFICER'],
  'surveillance.view_alerts': ['DOCTOR', 'NURSE', 'CLINICAL_OFFICER', 'SURVEILLANCE_OFFICER', 'ADMIN', 'COMPLIANCE_OFFICER'],
  'surveillance.submit_idsr': ['SURVEILLANCE_OFFICER', 'DOCTOR', 'ADMIN'],
  'surveillance.submit_ihr': ['SURVEILLANCE_OFFICER', 'ADMIN'],
  'surveillance.escalate_county': ['SURVEILLANCE_OFFICER', 'ADMIN'],
  'surveillance.escalate_national': ['SURVEILLANCE_OFFICER', 'ADMIN'],
  'surveillance.notify_who': ['ADMIN'],
  'surveillance.manage_thresholds': ['SURVEILLANCE_OFFICER', 'ADMIN'],

  // === Allied Health Module ===
  'allied_health.view_dashboard': ['PHYSIOTHERAPIST', 'DIETITIAN', 'OCCUPATIONAL_THERAPIST', 'COUNSELLOR', 'SOCIAL_WORKER', 'ADMIN'],
  'allied_health.assess_physio': ['PHYSIOTHERAPIST'],
  'allied_health.approve_physio': ['PHYSIOTHERAPIST'],
  'allied_health.assess_nutrition': ['DIETITIAN'],
  'allied_health.assess_occupational': ['OCCUPATIONAL_THERAPIST'],
  'allied_health.approve_ot': ['OCCUPATIONAL_THERAPIST'],
  'allied_health.counsel': ['COUNSELLOR', 'SOCIAL_WORKER'],
  'allied_health.view_sensitive_counselling': ['COUNSELLOR', 'ADMIN'],
  'allied_health.view_sensitive_sw': ['SOCIAL_WORKER', 'ADMIN'],
  'allied_health.accept_sw_referral': ['SOCIAL_WORKER'],
  'allied_health.assign_social_worker': ['SOCIAL_WORKER', 'ADMIN'],
  'allied_health.close_sw_case': ['SOCIAL_WORKER', 'ADMIN'],
  'allied_health.supervise_sw_case': ['SOCIAL_WORKER', 'ADMIN'],
  'allied_health.refer': ['PHYSIOTHERAPIST', 'DIETITIAN', 'OCCUPATIONAL_THERAPIST', 'COUNSELLOR', 'SOCIAL_WORKER', 'DOCTOR', 'CLINICAL_OFFICER'],

  // === Theatre Module ===
  'theatre.view_schedule': ['SURGEON', 'ANAESTHETIST', 'THEATRE_NURSE', 'DOCTOR', 'ADMIN'],
  'theatre.schedule_case': ['SURGEON', 'DOCTOR', 'ADMIN'],
  'theatre.view_checklists': ['SURGEON', 'ANAESTHETIST', 'THEATRE_NURSE'],
  'theatre.complete_checklist': ['SURGEON', 'ANAESTHETIST', 'THEATRE_NURSE'],
  'theatre.record_notes': ['SURGEON', 'ANAESTHETIST'],
  'theatre.view_reports': ['SURGEON', 'ANAESTHETIST', 'ADMIN'],

  // === Billing / Finance Module ===
  'billing.view_dashboard': ['BILLING_CLERK', 'CASHIER', 'BILLING_SUPERVISOR', 'ADMIN', 'ORG-ADMIN'],
  'billing.view_invoices': ['BILLING_CLERK', 'CASHIER', 'BILLING_SUPERVISOR'],
  'billing.create_invoice': ['BILLING_CLERK', 'CASHIER'],
  'billing.view_proformas': ['BILLING_CLERK', 'CASHIER', 'BILLING_SUPERVISOR', 'RECEPTIONIST'],
  'billing.record_payment': ['CASHIER', 'BILLING_CLERK'],
  'billing.view_receipts': ['BILLING_CLERK', 'CASHIER', 'BILLING_SUPERVISOR', 'RECEPTIONIST'],
  'billing.apply_discount': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.void_invoice': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.void_payment': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.view_credit_notes': ['BILLING_CLERK', 'BILLING_SUPERVISOR', 'CASHIER', 'ADMIN'],
  'billing.submit_sha_claim': ['BILLING_CLERK', 'BILLING_SUPERVISOR'],
  'billing.approve_sha_claim': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.appeal_sha_claim': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.view_insurance': ['BILLING_CLERK', 'BILLING_SUPERVISOR', 'ADMIN'],
  'billing.view_reports': ['BILLING_CLERK', 'BILLING_SUPERVISOR', 'ADMIN'],
  'billing.reconcile': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.manage_services': ['ADMIN', 'ORG-ADMIN', 'BILLING_SUPERVISOR'],
  'billing.manage_tariffs': ['ADMIN', 'ORG-ADMIN', 'BILLING_SUPERVISOR'],
  'billing.manage_config': ['ADMIN', 'ORG-ADMIN'],

  // === Quality Module ===
  'quality.view_dashboard': ['ADMIN', 'QUALITY_OFFICER', 'DOCTOR', 'CLINICAL_OFFICER'],
  'quality.view_measures': ['ADMIN', 'QUALITY_OFFICER', 'DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'quality.manage_measures': ['ADMIN', 'QUALITY_OFFICER'],
  'quality.view_reports': ['ADMIN', 'QUALITY_OFFICER', 'DOCTOR'],

  // === CDS Module ===
  'cds.view_dashboard': ['ADMIN', 'DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST'],
  'cds.manage_rules': ['ADMIN'],
  'cds.view_alerts': ['DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST', 'NURSE'],
  'cds.override_alert': ['DOCTOR', 'CLINICAL_OFFICER'],

  // === AI Module ===
  'ai.use_chat': ['DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST', 'LAB_TECH', 'LAB_SCIENTIST', 'ADMIN', 'NURSE'],
  // TODO: Wire ai.view_insights to /ai/insights page — proxies TibaBot stats
  // (/stats, /clinical/chat/stats, /feedback/stats, /icd10/stats) + aggregates
  // stored AI results & suggestion audit accept/reject rates. Backend proxy +
  // aggregation endpoint needed first. See ai-api-guide.md for available endpoints.
  'ai.view_insights': ['DOCTOR', 'CLINICAL_OFFICER', 'ADMIN'],

  // === Admin Module ===
  'admin.view_overview': ['ADMIN', 'ORG-ADMIN', 'HR_OFFICER'],
  'admin.manage_departments': ['ADMIN', 'ORG-ADMIN'],
  'admin.manage_staff': ['ADMIN', 'ORG-ADMIN', 'HR_OFFICER'],
  'admin.manage_roles': ['ADMIN'],
  'admin.view_audit_logs': ['ADMIN', 'ORG-ADMIN', 'COMPLIANCE_OFFICER'],
  'admin.view_hl7_messages': ['ADMIN'],
  'admin.manage_facilities': ['ADMIN', 'ORG-ADMIN'],
  'admin.manage_schedules': ['ADMIN', 'ORG-ADMIN'],
  'admin.view_reports': ['ADMIN', 'ORG-ADMIN', 'HR_OFFICER', 'COMPLIANCE_OFFICER'],
} as const;

export type ActionKey = keyof typeof ACTION_PERMISSIONS;
