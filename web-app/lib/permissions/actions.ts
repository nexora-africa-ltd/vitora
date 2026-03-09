/**
 * Action permissions by module
 * Maps specific actions to allowed roles
 */
export const ACTION_PERMISSIONS = {
  // === Inpatient Module ===
  'inpatient.view_ward': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'inpatient.record_vitals': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'inpatient.make_rounds': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.prescribe': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.administer_medication': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'inpatient.order_lab': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.order_imaging': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.discharge': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.transfer': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],

  // === Pharmacy Module ===
  'pharmacy.view_prescriptions': ['PHARMACIST', 'PHARMACY_TECH', 'NURSE', 'DOCTOR'],
  'pharmacy.dispense': ['PHARMACIST', 'PHARMACY_TECH'],
  'pharmacy.verify_prescription': ['PHARMACIST'],
  'pharmacy.manage_stock': ['PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'pharmacy.adjust_inventory': ['PHARMACIST', 'STORE_KEEPER'],

  // === Laboratory Module ===
  'laboratory.view_orders': ['LAB_TECH', 'LAB_SCIENTIST', 'DOCTOR', 'NURSE'],
  'laboratory.collect_sample': ['LAB_TECH', 'PHLEBOTOMIST', 'NURSE'],
  'laboratory.enter_results': ['LAB_TECH', 'LAB_SCIENTIST'],
  'laboratory.verify_results': ['LAB_SCIENTIST', 'PATHOLOGIST'],
  'laboratory.release_results': ['LAB_SCIENTIST', 'PATHOLOGIST'],

  // === Imaging Module ===
  'imaging.view_orders': ['RADIOGRAPHER', 'RADIOLOGIST', 'DOCTOR', 'NURSE'],
  'imaging.perform_scan': ['RADIOGRAPHER'],
  'imaging.upload_images': ['RADIOGRAPHER'],
  'imaging.write_report': ['RADIOLOGIST'],
  'imaging.verify_report': ['RADIOLOGIST'],

  // === Billing Module ===
  'billing.view_invoices': ['BILLING_CLERK', 'CASHIER', 'BILLING_SUPERVISOR'],
  'billing.create_invoice': ['BILLING_CLERK', 'CASHIER'],
  'billing.record_payment': ['CASHIER', 'BILLING_CLERK'],
  'billing.apply_discount': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.void_invoice': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.submit_sha_claim': ['BILLING_CLERK', 'BILLING_SUPERVISOR'],

  // === Encounters Module ===
  'encounters.create': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'encounters.prescribe': ['DOCTOR', 'CLINICAL_OFFICER'],
  'encounters.order_lab': ['DOCTOR', 'CLINICAL_OFFICER'],
  'encounters.order_imaging': ['DOCTOR', 'CLINICAL_OFFICER'],
  'encounters.diagnose': ['DOCTOR', 'CLINICAL_OFFICER'],
  'encounters.refer': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],

  // === Admin Module ===
  'admin.manage_staff': ['ADMIN', 'HR_OFFICER'],
  'admin.manage_roles': ['ADMIN'],
  'admin.view_audit_logs': ['ADMIN', 'COMPLIANCE_OFFICER'],
  'admin.manage_facilities': ['ADMIN'],
} as const;

export type ActionKey = keyof typeof ACTION_PERMISSIONS;
