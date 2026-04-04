/**
 * Zod schemas for MCH API response validation
 *
 * These schemas validate API responses at runtime to catch data shape mismatches
 * before they cause runtime errors in components.
 */
import { z } from 'zod';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates a paginated response schema
 */
function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });
}

// =============================================================================
// ENUMS
// =============================================================================

export const MCHRegistrationStatusSchema = z.enum([
  'ACTIVE', 'DELIVERED', 'POSTNATAL', 'COMPLETED',
  'TRANSFERRED_OUT', 'LOST_TO_FOLLOW_UP', 'DECEASED',
]);

export const FetalPresentationSchema = z.enum([
  'CEPHALIC', 'BREECH', 'TRANSVERSE', 'OBLIQUE', 'UNKNOWN', '',
]);

export const FetalLieSchema = z.enum([
  'LONGITUDINAL', 'TRANSVERSE', 'OBLIQUE', '',
]);

export const UrineResultSchema = z.enum([
  'NEGATIVE', 'TRACE', '1+', '2+', '3+', '4+', '',
]);

export const DeliveryTypeSchema = z.enum([
  'SVD', 'ASSISTED_VAGINAL', 'ELECTIVE_CS', 'EMERGENCY_CS', 'VACUUM', 'FORCEPS',
]);

export const DeliveryOutcomeSchema = z.enum([
  'LIVE_BIRTH', 'STILLBIRTH', 'NEONATAL_DEATH', 'MATERNAL_DEATH',
]);

export const DeliveryStatusSchema = z.enum(['PENDING', 'COMPLETED', 'REFERRED']);

export const PlaceOfDeliverySchema = z.enum(['FACILITY', 'HOME', 'EN_ROUTE']);

export const BabyGenderSchema = z.enum(['M', 'F', 'O', '']);

export const UterineInvolutionSchema = z.string();

export const LochiaStatusSchema = z.enum([
  'NORMAL', 'FOUL_SMELLING', 'HEAVY', 'ABSENT', '',
]);

export const BreastConditionSchema = z.enum([
  'NORMAL', 'ENGORGED', 'MASTITIS', 'CRACKED_NIPPLES', 'ABSCESS', '',
]);

export const MoodAssessmentSchema = z.enum([
  'NORMAL', 'MILDLY_LOW', 'DEPRESSED', 'SEVERELY_DEPRESSED', '',
]);

export const CordStatusSchema = z.enum(['CLEAN', 'INFECTED', 'SEPARATED', '']);

export const BreastfeedingStatusSchema = z.enum([
  'EXCLUSIVE', 'MIXED', 'FORMULA', 'NOT_FEEDING', '',
]);

export const ContraceptiveMethodSchema = z.string();

export const MUACClassificationSchema = z.enum(['SAM', 'MAM', 'NORMAL', '']).nullable();

export const NutritionalStatusSchema = z.enum([
  'NORMAL', 'MILD_UNDERWEIGHT', 'MODERATE_UNDERWEIGHT', 'SEVERE_UNDERWEIGHT', 'OVERWEIGHT', 'OBESE', '',
]).nullable();

export const GrowthChartTypeSchema = z.enum([
  'weight_for_age', 'height_for_age', 'weight_for_height',
  'head_circumference_for_age', 'bmi_for_age',
]);

export const VaccineRouteSchema = z.enum(['IM', 'SC', 'ORAL', 'ID', '']);

export const ImmunizationStatusSchema = z.enum([
  'SCHEDULED', 'ADMINISTERED', 'MISSED', 'CONTRAINDICATED', 'DEFERRED',
]);

export const InjectionSiteSchema = z.enum([
  'LEFT_THIGH', 'RIGHT_THIGH', 'LEFT_ARM', 'RIGHT_ARM', 'ORAL', '',
]);

export const AEFIEventTypeSchema = z.enum([
  'LOCAL_REACTION', 'SYSTEMIC_REACTION', 'SEVERE', 'DEATH',
]);

export const AEFISeveritySchema = z.enum(['MILD', 'MODERATE', 'SEVERE']);

export const AEFIOutcomeSchema = z.enum([
  'RECOVERED', 'RECOVERING', 'NOT_RECOVERED', 'SEQUELAE', 'DEATH', 'UNKNOWN',
]);

export const HEIStatusSchema = z.enum([
  'ACTIVE', 'CONFIRMED_NEGATIVE', 'CONFIRMED_POSITIVE',
  'LOST_TO_FOLLOW_UP', 'TRANSFERRED', 'DECEASED',
]);

export const MotherARTStatusSchema = z.enum(['ON_ART', 'NOT_ON_ART', 'UNKNOWN']);

export const InfantARVProphylaxisSchema = z.enum(['NVP', 'AZT', 'NVP_AZT', 'NONE']);

export const HEIBreastfeedingStatusSchema = z.enum(['EXCLUSIVE', 'MIXED', 'FORMULA', 'STOPPED']);

export const PCRResultSchema = z.enum(['POSITIVE', 'NEGATIVE', 'INDETERMINATE', 'PENDING']);

// =============================================================================
// MCH REGISTRATION SCHEMAS
// =============================================================================

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

export const BabyInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  mrn: z.string(),
  gender: z.string(),
  date_of_birth: z.string().nullable(),
});

export const MCHRegistrationSchema = MCHRegistrationListItemSchema.extend({
  anc_enrollment: z.number().nullable(),
  baby: z.number().nullable(),
  baby_name: z.string().nullable(),
  baby_mrn: z.string().nullable(),
  baby_count: z.number(),
  is_multiple_pregnancy: z.boolean(),
  all_babies_info: z.array(BabyInfoSchema),
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

export const PregnancyHistoryItemSchema = z.object({
  id: z.number(),
  mch_number: z.string(),
  registration_date: z.string(),
  status: MCHRegistrationStatusSchema,
  edd: z.string().nullable(),
  delivery_date: z.string().nullable(),
  delivery_outcome: z.string().nullable(),
  baby_count: z.number(),
  inter_pregnancy_interval_days: z.number().nullable(),
  completed_at: z.string().nullable(),
});

export const PregnancyHistoryArraySchema = z.array(PregnancyHistoryItemSchema);

export const SuggestedObstetricHistorySchema = z.object({
  gravida: z.number(),
  parity: z.number(),
  previous_pregnancies: z.number(),
  previous_deliveries: z.number(),
  previous_live_births: z.number(),
  previous_stillbirths: z.number(),
});

export const PaginatedMCHRegistrationListSchema = createPaginatedSchema(MCHRegistrationListItemSchema);

// =============================================================================
// ANC VISIT SCHEMAS
// =============================================================================

export const ANCVisitListItemSchema = z.object({
  id: z.number(),
  registration: z.number(),
  clinic_visit: z.number().nullable().optional(),
  visit_number: z.number(),
  visit_date: z.string(),
  gestation_weeks: z.number().nullable(),
  weight: z.coerce.number().nullable(),
  blood_pressure: z.string(),
  fetal_heart_rate: z.number().nullable(),
  next_visit_date: z.string().nullable(),
  alerts: z.array(z.string()),
  created_at: z.string(),
});

export const ANCVisitSchema = z.object({
  id: z.number(),
  registration: z.number(),
  registration_mch_number: z.string(),
  encounter: z.number().nullable(),
  clinic_visit: z.number().nullable(),
  visit_number: z.number(),
  visit_date: z.string(),
  gestation_weeks: z.number().nullable(),
  weight: z.coerce.number().nullable(),
  blood_pressure: z.string(),
  fundal_height: z.coerce.number().nullable(),
  fetal_heart_rate: z.number().nullable(),
  presentation: FetalPresentationSchema,
  lie: FetalLieSchema,
  fetal_movements: z.boolean().nullable(),
  urine_protein: UrineResultSchema,
  urine_glucose: UrineResultSchema,
  hb_level: z.coerce.number().nullable(),
  blood_sugar: z.coerce.number().nullable(),
  hiv_test_done: z.boolean(),
  syphilis_test_done: z.boolean(),
  iron_folate_given: z.boolean(),
  calcium_given: z.boolean(),
  deworming_given: z.boolean(),
  tetanus_toxoid_dose: z.number().nullable(),
  next_visit_date: z.string().nullable(),
  notes: z.string(),
  conducted_by: z.number().nullable(),
  conducted_by_name: z.string().nullable(),
  alerts: z.array(z.string()),
  is_fetal_heart_rate_normal: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedANCVisitListSchema = createPaginatedSchema(ANCVisitListItemSchema);

// =============================================================================
// DELIVERY SCHEMAS
// =============================================================================

export const DeliveryListItemSchema = z.object({
  id: z.number(),
  registration: z.number(),
  registration_mch_number: z.string(),
  mother_name: z.string(),
  mother_mrn: z.string(),
  delivery_date: z.string(),
  delivery_type: DeliveryTypeSchema,
  delivery_outcome: DeliveryOutcomeSchema,
  place_of_delivery: PlaceOfDeliverySchema,
  status: DeliveryStatusSchema,
  baby_gender: BabyGenderSchema,
  birth_weight: z.coerce.number().nullable(),
  delivered_by_name: z.string().nullable(),
  alerts: z.array(z.string()),
  created_at: z.string(),
});

export const DeliverySchema = z.object({
  id: z.number(),
  registration: z.number(),
  registration_mch_number: z.string(),
  partograph: z.number().nullable().optional(),
  admission: z.number().nullable().optional(),
  delivery_date: z.string(),
  delivery_time: z.string().nullable(),
  delivery_type: DeliveryTypeSchema,
  delivery_outcome: DeliveryOutcomeSchema,
  place_of_delivery: PlaceOfDeliverySchema,
  status: DeliveryStatusSchema,
  delivered_by: z.number().nullable(),
  delivered_by_name: z.string().nullable(),
  baby_gender: BabyGenderSchema,
  birth_weight: z.coerce.number().nullable(),
  apgar_score_1min: z.number().nullable(),
  apgar_score_5min: z.number().nullable(),
  apgar_score_10min: z.number().nullable(),
  resuscitation_done: z.boolean(),
  baby_patient: z.number().nullable(),
  baby_patient_mrn: z.string().nullable(),
  maternal_complications: z.string(),
  neonatal_complications: z.string(),
  blood_loss_ml: z.number().nullable(),
  placenta_complete: z.boolean(),
  is_low_birth_weight: z.boolean().nullable(),
  is_macrosomia: z.boolean().nullable(),
  alerts: z.array(z.string()),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedDeliveryListSchema = createPaginatedSchema(DeliveryListItemSchema);

// =============================================================================
// DELIVERY DASHBOARD SCHEMAS
// =============================================================================

export const UpcomingDeliverySchema = z.object({
  id: z.number(),
  mch_number: z.string(),
  mother_name: z.string(),
  mother_mrn: z.string(),
  edd: z.string(),
  days_until_edd: z.number(),
  gestation_display: z.string(),
  trimester: z.number().nullable(),
  is_high_risk: z.boolean(),
  risk_factors: z.string(),
  status: MCHRegistrationStatusSchema,
});

export const DeliveryMonthlyTrendSchema = z.object({
  month: z.string().nullable(),
  total: z.number(),
  live_births: z.number(),
  stillbirths: z.number(),
  cs_deliveries: z.number(),
});

export const DeliveryDashboardSchema = z.object({
  stats: z.object({
    total_deliveries: z.number(),
    this_month: z.number(),
    today: z.number(),
    live_birth_rate: z.number(),
    cs_rate: z.number(),
    with_complications: z.number(),
    overdue: z.number(),
    due_7_days: z.number(),
    due_14_days: z.number(),
    due_30_days: z.number(),
    high_risk_due_soon: z.number(),
    active_pregnancies: z.number(),
  }),
  outcomes_breakdown: z.object({
    LIVE_BIRTH: z.number(),
    STILLBIRTH: z.number(),
    NEONATAL_DEATH: z.number(),
    MATERNAL_DEATH: z.number(),
  }),
  types_breakdown: z.object({
    SVD: z.number(),
    ASSISTED_VAGINAL: z.number(),
    ELECTIVE_CS: z.number(),
    EMERGENCY_CS: z.number(),
    VACUUM: z.number(),
    FORCEPS: z.number(),
  }),
  places_breakdown: z.object({
    FACILITY: z.number(),
    HOME: z.number(),
    EN_ROUTE: z.number(),
  }),
  upcoming_deliveries: z.array(UpcomingDeliverySchema),
  high_risk_due_soon: z.array(UpcomingDeliverySchema),
  monthly_trend: z.array(DeliveryMonthlyTrendSchema),
});

// =============================================================================
// LABOUR PARTOGRAPH SCHEMAS
// =============================================================================

export const LabourPartographStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'REFERRED']);

export const MembraneStatusSchema = z.enum(['INTACT', 'RUPTURED', 'UNKNOWN', '']);

export const LiquorStatusSchema = z.enum(['CLEAR', 'MECONIUM', 'BLOOD_STAINED', 'OFFENSIVE', 'UNKNOWN', '']);

export const MouldingGradeSchema = z.enum(['0', '+', '++', '+++', '']);

export const ContractionIntensitySchema = z.enum(['MILD', 'MODERATE', 'STRONG', '']);

export const LabourPartographObservationSchema = z.object({
  id: z.number(),
  partograph: z.number(),
  observation_time: z.string(),
  recorded_by: z.number(),
  recorded_by_name: z.string(),
  fetal_heart_rate: z.number().nullable(),
  cervical_dilation_cm: z.string().nullable(),
  descent_fifths: z.number().nullable(),
  contractions_per_10_min: z.number().nullable(),
  contraction_duration_seconds: z.number().nullable(),
  contraction_intensity: ContractionIntensitySchema,
  moulding: MouldingGradeSchema,
  maternal_pulse: z.number().nullable(),
  maternal_blood_pressure: z.string(),
  maternal_temperature: z.coerce.number().nullable(),
  urine_volume_ml: z.number().nullable(),
  urine_protein: UrineResultSchema,
  urine_acetone: UrineResultSchema,
  oxytocin_drops_per_min: z.number().nullable(),
  medications: z.string(),
  notes: z.string(),
  alerts: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const LabourPartographSchema = z.object({
  id: z.number(),
  registration: z.number(),
  registration_mch_number: z.string(),
  mother_name: z.string(),
  encounter: z.number().nullable(),
  admission: z.number().nullable(),
  started_at: z.string(),
  status: LabourPartographStatusSchema,
  parity: z.number().nullable(),
  gestation_weeks: z.number().nullable(),
  membrane_status: MembraneStatusSchema,
  liquor: LiquorStatusSchema,
  notes: z.string(),
  created_by: z.number().nullable(),
  created_by_name: z.string().nullable(),
  completed_at: z.string().nullable(),
  observation_count: z.number(),
  latest_observation: LabourPartographObservationSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedLabourPartographListSchema = createPaginatedSchema(LabourPartographSchema);

export const PaginatedLabourPartographObservationListSchema = createPaginatedSchema(LabourPartographObservationSchema);

// =============================================================================
// PNC VISIT SCHEMAS
// =============================================================================

export const PNCVisitListItemSchema = z.object({
  id: z.number(),
  registration: z.number(),
  visit_number: z.number(),
  visit_date: z.string(),
  days_postpartum: z.number(),
  breastfeeding_status: BreastfeedingStatusSchema,
  alerts: z.array(z.string()),
  created_at: z.string(),
});

export const PNCVisitSchema = z.object({
  id: z.number(),
  registration: z.number(),
  registration_mch_number: z.string(),
  encounter: z.number().nullable(),
  admission: z.number().nullable(),
  discharge: z.number().nullable(),
  clinic_visit: z.number().nullable(),
  visit_number: z.number(),
  visit_date: z.string(),
  days_postpartum: z.number(),
  blood_pressure: z.string(),
  temperature: z.coerce.number().nullable(),
  uterine_involution: UterineInvolutionSchema,
  lochia: LochiaStatusSchema,
  breast_condition: BreastConditionSchema,
  mood_assessment: MoodAssessmentSchema,
  baby_weight: z.coerce.number().nullable(),
  baby_temperature: z.coerce.number().nullable(),
  cord_status: CordStatusSchema,
  breastfeeding_status: BreastfeedingStatusSchema,
  family_planning_counselling: z.boolean(),
  contraceptive_given: ContraceptiveMethodSchema,
  conducted_by: z.number().nullable(),
  conducted_by_name: z.string().nullable(),
  alerts: z.array(z.string()),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedPNCVisitListSchema = createPaginatedSchema(PNCVisitListItemSchema);

// =============================================================================
// GROWTH MEASUREMENT SCHEMAS
// =============================================================================

export const GrowthMeasurementListItemSchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  measurement_date: z.string(),
  age_in_days: z.number(),
  weight: z.coerce.number().nullable(),
  height: z.coerce.number().nullable(),
  muac: z.coerce.number().nullable(),
  muac_classification: MUACClassificationSchema,
  nutritional_status: NutritionalStatusSchema,
  has_critical_flag: z.boolean(),
  created_at: z.string(),
});

export const GrowthMeasurementSchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  patient_gender: z.enum(['M', 'F', 'O']),
  patient_dob: z.string(),
  encounter: z.number().nullable(),
  measured_by: z.number().nullable(),
  measured_by_name: z.string().nullable(),
  measurement_date: z.string(),
  age_in_days: z.number(),
  weight: z.coerce.number().nullable(),
  height: z.coerce.number().nullable(),
  head_circumference: z.coerce.number().nullable(),
  muac: z.coerce.number().nullable(),
  weight_for_age_z: z.coerce.number().nullable(),
  height_for_age_z: z.coerce.number().nullable(),
  weight_for_height_z: z.coerce.number().nullable(),
  bmi_for_age_z: z.coerce.number().nullable(),
  head_circumference_for_age_z: z.coerce.number().nullable(),
  muac_classification: MUACClassificationSchema,
  nutritional_status: NutritionalStatusSchema,
  has_critical_flag: z.boolean(),
  alerts: z.array(z.string()),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedGrowthMeasurementListSchema = createPaginatedSchema(GrowthMeasurementListItemSchema);

export const GrowthChartDataSchema = z.object({
  measurements: z.array(GrowthMeasurementListItemSchema),
  percentile_lines: z.record(z.unknown()),
  chart_type: GrowthChartTypeSchema,
  sex: z.string(),
});

// =============================================================================
// VACCINE SCHEMAS
// =============================================================================

export const VaccineSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  disease_target: z.string(),
  standard_age_days: z.number(),
  route: VaccineRouteSchema,
  dose_number: z.number(),
  series_name: z.string(),
  is_active: z.boolean(),
});

export const VaccineArraySchema = z.array(VaccineSchema);

// =============================================================================
// IMMUNIZATION RECORD SCHEMAS
// =============================================================================

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

export const ImmunizationRecordSchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  vaccine: z.number(),
  vaccine_code: z.string(),
  vaccine_name: z.string(),
  scheduled_date: z.string(),
  administered_date: z.string().nullable(),
  status: ImmunizationStatusSchema,
  dose_number: z.number(),
  batch_number: z.string(),
  lot_number: z.string(),
  expiry_date: z.string().nullable(),
  site: InjectionSiteSchema,
  administered_by: z.number().nullable(),
  administered_by_name: z.string().nullable(),
  next_dose_date: z.string().nullable(),
  is_overdue: z.boolean(),
  days_overdue: z.number().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedImmunizationRecordListSchema = createPaginatedSchema(ImmunizationRecordListItemSchema);

// =============================================================================
// VITAMIN A SCHEMAS
// =============================================================================

export const VitaminASupplementSchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  administered_date: z.string(),
  dose: z.string(),
  administered_by: z.number().nullable(),
  administered_by_name: z.string().nullable(),
  notes: z.string(),
  created_at: z.string(),
});

export const PaginatedVitaminASupplementListSchema = createPaginatedSchema(VitaminASupplementSchema);

// =============================================================================
// AEFI SCHEMAS
// =============================================================================

export const AEFIListItemSchema = z.object({
  id: z.number(),
  immunization_record: z.number(),
  vaccine_code: z.string(),
  event_date: z.string(),
  event_type: AEFIEventTypeSchema,
  severity: AEFISeveritySchema,
  outcome: AEFIOutcomeSchema,
  reported_to_authorities: z.boolean(),
  created_at: z.string(),
});

export const AEFISchema = z.object({
  id: z.number(),
  immunization_record: z.number(),
  vaccine_code: z.string(),
  vaccine_name: z.string(),
  patient_name: z.string(),
  event_date: z.string(),
  event_type: AEFIEventTypeSchema,
  severity: AEFISeveritySchema,
  description: z.string(),
  outcome: AEFIOutcomeSchema,
  reported_to_authorities: z.boolean(),
  report_date: z.string().nullable(),
  investigated_by: z.number().nullable(),
  investigated_by_name: z.string().nullable(),
  investigation_notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedAEFIListSchema = createPaginatedSchema(AEFIListItemSchema);

// =============================================================================
// HEI FOLLOW-UP SCHEMAS
// =============================================================================

export const HEIPCRTestSchema = z.object({
  id: z.number(),
  hei_followup: z.number(),
  test_number: z.number(),
  scheduled_date: z.string(),
  actual_date: z.string().nullable(),
  result: PCRResultSchema,
  lab_reference: z.string(),
  notes: z.string(),
  created_at: z.string(),
});

export const HEIFollowUpListItemSchema = z.object({
  id: z.number(),
  hei_number: z.string(),
  infant: z.number(),
  infant_name: z.string(),
  infant_mrn: z.string(),
  enrollment_date: z.string(),
  status: HEIStatusSchema,
  mother_art_status: MotherARTStatusSchema,
  infant_arv_prophylaxis: InfantARVProphylaxisSchema,
  breastfeeding_status: HEIBreastfeedingStatusSchema,
  created_at: z.string(),
});

export const HEIFollowUpSchema = z.object({
  id: z.number(),
  hei_number: z.string(),
  infant: z.number(),
  infant_name: z.string(),
  infant_mrn: z.string(),
  mch_registration: z.number().nullable(),
  mother_name: z.string().nullable(),
  enrollment_date: z.string(),
  status: HEIStatusSchema,
  mother_art_status: MotherARTStatusSchema,
  infant_arv_prophylaxis: InfantARVProphylaxisSchema,
  arv_start_date: z.string().nullable(),
  arv_end_date: z.string().nullable(),
  breastfeeding_status: HEIBreastfeedingStatusSchema,
  cotrimoxazole_prophylaxis: z.boolean(),
  cotrimoxazole_start_date: z.string().nullable(),
  enrolled_by: z.number().nullable(),
  enrolled_by_name: z.string().nullable(),
  pcr_tests: z.array(HEIPCRTestSchema),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedHEIFollowUpListSchema = createPaginatedSchema(HEIFollowUpListItemSchema);

export const DetermineStatusResponseSchema = z.object({
  status: HEIStatusSchema,
  message: z.string(),
  positive_test_number: z.number().optional(),
  negative_test_count: z.number().optional(),
  negative_tests: z.number().optional(),
  pending_tests: z.number().optional(),
  required_negative_tests: z.number().optional(),
});

export const UpdateFeedingResponseSchema = z.object({
  hei_number: z.string(),
  breastfeeding_status: HEIBreastfeedingStatusSchema,
  message: z.string(),
});
