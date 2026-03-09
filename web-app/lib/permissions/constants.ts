/**
 * Module access permissions
 * Maps sidebar modules to required Django permission
 */
export const MODULE_PERMISSIONS = {
  dashboard: null, // Everyone
  checkin: 'checkin.view_checkin',
  patients: 'patients.view_patient',
  triage: 'triage.view_triageassessment',
  emergency: 'encounters.view_encounter',
  surveillance: 'surveillance.view_notifiablecase',
  clinics: 'clinics.view_clinic',
  encounters: 'encounters.view_encounter',
  inpatient: 'inpatient.view_admission',
  pharmacy: 'pharmacy.view_prescription',
  laboratory: 'laboratory.view_laborder',
  imaging: 'imaging.view_imagingorder',
  theatre: 'scheduling.view_surgerycase',
  billing: 'billing.view_invoice',
  admin: 'core.view_staffprofile',
} as const;

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;
