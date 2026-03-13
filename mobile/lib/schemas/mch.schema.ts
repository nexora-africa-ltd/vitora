import { z } from 'zod';

function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });
}

const numberLike = z.coerce.number();

export const MCHRegistrationStatusSchema = z.enum([
  'ACTIVE',
  'DELIVERED',
  'POSTNATAL',
  'COMPLETED',
  'TRANSFERRED_OUT',
  'LOST_TO_FOLLOW_UP',
  'DECEASED',
]);

export const MCHRegistrationListItemSchema = z.object({
  id: z.number(),
  mch_number: z.string(),
  mother: z.number(),
  mother_name: z.string(),
  mother_mrn: z.string(),
  registration_date: z.string(),
  status: MCHRegistrationStatusSchema,
  is_high_risk: z.boolean(),
  linda_jamii_beneficiary: z.boolean(),
  edd: z.string().nullable(),
  gestation_display: z.string(),
  trimester: z.number().nullable(),
  gravida: z.number().nullable(),
  parity: z.number().nullable(),
  current_gestation_weeks: z.number().nullable(),
  anc_visit_count: z.number(),
  created_at: z.string(),
});

export const MCHRegistrationSchema = MCHRegistrationListItemSchema.extend({
  anc_enrollment: z.number().nullable(),
  baby: z.number().nullable(),
  baby_name: z.string().nullable(),
  baby_mrn: z.string().nullable(),
  baby_count: z.number(),
  is_multiple_pregnancy: z.boolean(),
  all_babies_info: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      mrn: z.string(),
      gender: z.string(),
      date_of_birth: z.string().nullable(),
    })
  ),
  inter_pregnancy_interval_days: z.number().nullable(),
  risk_factors: z.string(),
  sha_claimable: z.boolean(),
  gbv_related: z.boolean(),
  is_sensitive: z.boolean(),
  registered_by: z.number().nullable(),
  registered_by_name: z.string().nullable(),
  notes: z.string(),
  completed_at: z.string().nullable(),
  pnc_visit_count: z.number(),
  updated_at: z.string(),
});

export const PaginatedMCHRegistrationSchema = createPaginatedSchema(MCHRegistrationListItemSchema);

export const FetalPresentationSchema = z.enum(['CEPHALIC', 'BREECH', 'TRANSVERSE', 'OBLIQUE', 'UNKNOWN', '']);
export const FetalLieSchema = z.enum(['LONGITUDINAL', 'TRANSVERSE', 'OBLIQUE', '']);
export const UrineResultSchema = z.enum(['NEGATIVE', 'TRACE', '1+', '2+', '3+', '4+', '']);

export const ANCVisitListItemSchema = z.object({
  id: z.number(),
  registration: z.number(),
  clinic_visit: z.number().nullable().optional(),
  visit_number: z.number(),
  visit_date: z.string(),
  gestation_weeks: z.number().nullable(),
  weight: numberLike.nullable(),
  blood_pressure: z.string(),
  fetal_heart_rate: z.number().nullable(),
  next_visit_date: z.string().nullable(),
  alerts: z.array(z.string()),
  created_at: z.string(),
});

export const ANCVisitSchema = ANCVisitListItemSchema.extend({
  registration_mch_number: z.string(),
  encounter: z.number().nullable(),
  clinic_visit: z.number().nullable(),
  fundal_height: numberLike.nullable(),
  presentation: FetalPresentationSchema,
  lie: FetalLieSchema,
  fetal_movements: z.boolean().nullable(),
  urine_protein: UrineResultSchema,
  urine_glucose: UrineResultSchema,
  hb_level: numberLike.nullable(),
  blood_sugar: numberLike.nullable(),
  hiv_test_done: z.boolean(),
  syphilis_test_done: z.boolean(),
  iron_folate_given: z.boolean(),
  calcium_given: z.boolean(),
  deworming_given: z.boolean(),
  tetanus_toxoid_dose: z.number().nullable(),
  notes: z.string(),
  conducted_by: z.number().nullable(),
  conducted_by_name: z.string().nullable(),
  is_fetal_heart_rate_normal: z.boolean(),
  updated_at: z.string(),
});

export const PaginatedANCVisitSchema = createPaginatedSchema(ANCVisitListItemSchema);

export const VaccineSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  disease_target: z.string(),
  standard_age_days: z.number(),
  route: z.enum(['IM', 'SC', 'ORAL', 'ID', '']),
  dose_number: z.number(),
  series_name: z.string(),
  is_active: z.boolean(),
});

export const VaccineArraySchema = z.array(VaccineSchema);

export const ImmunizationStatusSchema = z.enum(['SCHEDULED', 'ADMINISTERED', 'MISSED', 'CONTRAINDICATED', 'DEFERRED']);
export const InjectionSiteSchema = z.enum(['LEFT_THIGH', 'RIGHT_THIGH', 'LEFT_ARM', 'RIGHT_ARM', 'ORAL', '']);

export const ImmunizationRecordListItemSchema = z.object({
  id: z.number(),
  patient: z.number(),
  vaccine: z.number(),
  vaccine_code: z.string(),
  vaccine_name: z.string(),
  scheduled_date: z.string(),
  administered_date: z.string().nullable(),
  status: ImmunizationStatusSchema,
  dose_number: z.number(),
  is_overdue: z.boolean(),
  created_at: z.string(),
});

export const ImmunizationRecordSchema = ImmunizationRecordListItemSchema.extend({
  patient_name: z.string(),
  patient_mrn: z.string(),
  batch_number: z.string(),
  lot_number: z.string(),
  expiry_date: z.string().nullable(),
  site: InjectionSiteSchema,
  administered_by: z.number().nullable(),
  administered_by_name: z.string().nullable(),
  next_dose_date: z.string().nullable(),
  days_overdue: z.number().nullable(),
  notes: z.string(),
  updated_at: z.string(),
});

export const PaginatedImmunizationRecordSchema = createPaginatedSchema(ImmunizationRecordListItemSchema);