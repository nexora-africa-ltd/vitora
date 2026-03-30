/**
 * Module access permissions
 * Maps sidebar modules to required Django permission
 */
export const MODULE_PERMISSIONS = {
  dashboard: null, // Everyone
  checkin: 'checkin.view_checkin',
  patients: 'patients.view_patient',
  triage: [
    'triage.view_triage_queue',
    'triage.perform_triage',
    'triage.view_triageassessment',
  ],
  emergency: 'encounters.view_encounter',
  surveillance: [
    'surveillance.view_notifiablecase',
    'surveillance.view_surveillancealert',
    'surveillance.view_outbreakthreshold',
    'surveillance.view_ihrnotification',
    'surveillance.escalate_ihr_to_county',
    'surveillance.escalate_ihr_to_national',
    'surveillance.notify_ihr_to_who',
  ],
  clinics: 'clinics.view_clinic',
  mch: 'mch.view_mchregistration',
  encounters: 'encounters.view_encounter',
  procedures: 'procedures.view_procedureorder',
  inpatient: [
    'inpatient.view_admission',
    'inpatient.view_ward',
    'inpatient.view_wardround',
    'inpatient.receive_critical_alerts',
  ],
  last_office: 'patients.view_deathrecord',
  pharmacy: 'pharmacy.view_prescription',
  laboratory: 'laboratory.view_laborder',
  imaging: 'imaging.view_imagingorder',
  allied_health: [
    'physiotherapy.view_physiotherapyorder',
    'nutrition.view_nutritionconsultation',
    'occupational_therapy.view_occupationaltherapyorder',
    'social_work.view_socialworkreferral',
    'counselling.view_counsellingreferral',
  ],
  theatre: [
    'scheduling.view_schedule',
    'scheduling.view_appointment',
    'scheduling.view_resource',
  ],
  billing: [
    'billing.view_invoice',
    'billing.view_payment',
    'billing.view_receipt',
    'billing.submit_sha_claim',
    'billing.approve_sha_claim',
    'billing.appeal_sha_claim',
  ],
  quality: 'quality.view_qualitymeasure',
  cds: 'cds.view_cdsrule',
  referrals: 'referrals.view_clinicalreferral',
  ai: null, // Feature-flag gated, not permission gated
  admin: 'core.view_staffprofile',
} as const;

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;
