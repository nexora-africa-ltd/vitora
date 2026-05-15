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
  // === Analytics Module ===
  'analytics.view_dashboard': ['ADMIN', 'ORG-ADMIN', 'OWNER', 'MANAGEMENT'],
  'analytics.view_explore': ['ADMIN', 'ORG-ADMIN', 'OWNER', 'MANAGEMENT'],

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

  // === Blood Bank Module ===
  'blood_bank.view_dashboard': ['DOCTOR', 'CONSULTANT', 'LAB_TECH', 'NURSE', 'ADMIN'],
  'blood_bank.view_donors': ['LAB_TECH', 'NURSE', 'DOCTOR', 'ADMIN'],
  'blood_bank.view_units': ['LAB_TECH', 'NURSE', 'DOCTOR', 'ADMIN'],
  'blood_bank.view_requests': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'LAB_TECH', 'ADMIN'],
  'blood_bank.view_crossmatch': ['LAB_TECH', 'DOCTOR', 'ADMIN'],
  'blood_bank.manage': ['LAB_TECH', 'LAB_SCIENTIST', 'PHLEBOTOMIST', 'ADMIN'],
  'blood_bank.create_request': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'blood_bank.issue_unit': ['LAB_TECH', 'LAB_SCIENTIST', 'ADMIN'],
  'blood_bank.perform_crossmatch': ['LAB_TECH', 'LAB_SCIENTIST', 'PHLEBOTOMIST', 'ADMIN'],

  // === Dialysis Module ===
  'dialysis.view_dashboard': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'dialysis.view_sessions': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'dialysis.view_orders': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'dialysis.view_accesses': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'dialysis.manage': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'ADMIN'],
  'dialysis.create_order': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'ADMIN'],
  'dialysis.perform_session': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],

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
  'laboratory.view_dashboard': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'PHLEBOTOMIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.view_orders': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'PHLEBOTOMIST', 'DOCTOR', 'NURSE', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.collect_sample': ['LAB_TECH', 'LAB_SCIENTIST', 'PHLEBOTOMIST', 'NURSE', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.enter_results': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.verify_results': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.release_results': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.reject_sample': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.interpret_results': ['PATHOLOGIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.manage_catalog': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.view_reports': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],
  'laboratory.view_analytics': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'ORG-ADMIN', 'LIS_ADMIN'],

  // === LIS Standalone Module ===
  'lis.register_walkin': ['LAB_TECH', 'LAB_SCIENTIST', 'PHLEBOTOMIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.create_standalone_order': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.view_external_orders': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.accept_external_order': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.reject_external_order': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.manage_qc': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.manage_analyzers': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.manage_reflex_rules': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.manage_critical_values': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.manage_worksheets': ['LAB_TECH', 'LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],
  'lis.manage_auto_verify': ['LAB_SCIENTIST', 'PATHOLOGIST', 'ADMIN', 'LIS_ADMIN'],

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
  'immunizations.manage_stock': ['NURSE', 'PHARMACIST', 'PHARMACY_TECH', 'ADMIN', 'STORE_KEEPER'],
  'immunizations.manage_cold_chain': ['NURSE', 'PHARMACIST', 'PHARMACY_TECH', 'ADMIN', 'STORE_KEEPER'],
  'immunizations.report_incident': ['NURSE', 'PHARMACIST', 'PHARMACY_TECH', 'ADMIN', 'STORE_KEEPER', 'SURVEILLANCE_OFFICER'],
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

  // === Sick Notes Module ===
  'sick_notes.view': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'RECORDS_CLERK', 'ADMIN'],
  'sick_notes.create': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE'],
  'sick_notes.issue': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'sick_notes.revoke': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER'],
  'sick_notes.print': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'RECORDS_CLERK', 'ADMIN'],

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

  // === Scheduling Module ===
  'scheduling.view_appointments': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'ADMIN'],
  'scheduling.create_appointment': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'ADMIN'],
  'scheduling.manage_appointment': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'ADMIN'],
  'scheduling.view_schedules': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTIONIST', 'ADMIN'],
  'scheduling.manage_schedules': ['ADMIN', 'ORG-ADMIN', 'HR_OFFICER', 'SUPERVISOR'],
  'scheduling.create_swap': ['DOCTOR', 'CONSULTANT', 'CLINICAL_OFFICER', 'NURSE', 'NURSE_AIDE', 'LAB_TECH', 'PHARMACIST', 'PHARMACY_TECH', 'RECEPTIONIST', 'RADIOGRAPHER', 'PHYSIOTHERAPIST', 'DIETITIAN', 'OCCUPATIONAL_THERAPIST', 'SOCIAL_WORKER', 'COUNSELLOR', 'LAB_SCIENTIST', 'PHLEBOTOMIST', 'HR_OFFICER', 'SUPERVISOR', 'ADMIN', 'ORG-ADMIN'],
  'scheduling.approve_swap': ['ADMIN', 'ORG-ADMIN', 'HR_OFFICER', 'SUPERVISOR'],

  // === Theatre Module ===
  'theatre.view_schedule': ['SURGEON', 'ANAESTHETIST', 'THEATRE_NURSE', 'DOCTOR', 'ADMIN'],
  'theatre.schedule_case': ['SURGEON', 'DOCTOR', 'ADMIN'],
  'theatre.view_checklists': ['SURGEON', 'ANAESTHETIST', 'THEATRE_NURSE'],
  'theatre.complete_checklist': ['SURGEON', 'ANAESTHETIST', 'THEATRE_NURSE'],
  'theatre.record_notes': ['SURGEON', 'ANAESTHETIST'],
  'theatre.view_reports': ['SURGEON', 'ANAESTHETIST', 'ADMIN'],
  'theatre.manage_settings': ['ADMIN', 'ORG-ADMIN', 'OWNER'],

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
  'billing.manage_insurance_providers': ['ADMIN', 'ORG-ADMIN'],
  'billing.manage_insurance_config': ['ADMIN', 'ORG-ADMIN'],
  'billing.adjudicate_claims': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.submit_insurance_claim': ['BILLING_CLERK', 'BILLING_SUPERVISOR', 'ADMIN'],
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

  // === Inventory Module ===
  'inventory.view_dashboard': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'inventory.view_suppliers': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'inventory.view_purchase_orders': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'inventory.view_goods_receipts': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'inventory.view_store_locations': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'inventory.view_transfers': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'inventory.view_ward_stock': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER', 'NURSE'],
  'inventory.view_stock_counts': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'inventory.view_etims': ['ADMIN', 'ORG-ADMIN', 'BILLING_CLERK', 'BILLING_SUPERVISOR'],
  'inventory.view_forecasts': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'inventory.manage_procurement': ['ADMIN', 'ORG-ADMIN', 'PHARMACIST', 'STORE_KEEPER'],
  'inventory.approve_po': ['ADMIN', 'ORG-ADMIN'],
  'inventory.approve_transfer': ['ADMIN', 'ORG-ADMIN'],
  'inventory.approve_stock_count': ['ADMIN', 'ORG-ADMIN'],
  'inventory.manage_etims': ['ADMIN', 'ORG-ADMIN', 'BILLING_SUPERVISOR'],

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
