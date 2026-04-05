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
  clinics: [
    'clinics.view_clinic',
    'clinics.view_clinicvisit',
    'clinics.view_ccc_clinic',
    'clinics.view_mental_health_clinic',
    'clinics.manage_clinic_staff',
    'clinics.manage_clinic_schedule',
  ],
  mch: [
    'mch.view_mchregistration',
    'mch.view_sensitive_mch_registration',
  ],
  encounters: 'encounters.view_encounter',
  procedures: 'procedures.view_procedureorder',
  inpatient: [
    'inpatient.view_admission',
    'inpatient.view_ward',
    'inpatient.view_wardround',
    'inpatient.receive_critical_alerts',
  ],
  last_office: [
    'patients.view_deathrecord',
    'patients.certify_death',
    'patients.release_body',
    'patients.void_death_record',
  ],
  pharmacy: 'pharmacy.view_prescription',
  laboratory: 'laboratory.view_laborder',
  imaging: 'imaging.view_imagingorder',
  allied_health: [
    'physiotherapy.view_physiotherapyorder',
    'physiotherapy.approve_physiotherapy_order',
    'nutrition.view_nutritionconsultation',
    'occupational_therapy.view_occupationaltherapyorder',
    'occupational_therapy.approve_ot_order',
    'social_work.view_socialworkreferral',
    'social_work.accept_sw_referral',
    'counselling.view_counsellingreferral',
    'counselling.view_sensitive_counselling_referral',
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
  referrals: [
    'referrals.view_clinicalreferral',
    'referrals.accept_referral',
    'referrals.decline_referral',
    'referrals.view_sensitive_referral',
  ],
  immunizations: 'immunizations.view_immunizationrecord',
  quality: 'quality.view_qualitymeasure',
  cds: 'cds.view_cdsrule',
  ai: null, // Feature-flag gated, not permission gated
  admin: 'core.view_staffprofile',
} as const;

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;
