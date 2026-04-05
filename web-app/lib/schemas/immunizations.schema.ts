/**
 * Zod schemas for Immunizations API response validation
 *
 * Validates API responses at runtime to catch data shape mismatches
 * before they cause runtime errors in components.
 */
import { z } from 'zod';

// =============================================================================
// HELPERS
// =============================================================================

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

export const TargetPopulationSchema = z.enum([
  'INFANT', 'CHILD', 'ADOLESCENT', 'ADULT', 'ALL',
]);

export const VaccineProgramSchema = z.enum([
  'KEPI', 'ROUTINE', 'CAMPAIGN', 'OCCUPATIONAL', 'TRAVEL', 'CATCH_UP',
]);

export const VaccineRouteSchema = z.enum(['IM', 'SC', 'ORAL', 'ID', '']);

export const ImmunizationStatusSchema = z.enum([
  'SCHEDULED', 'ADMINISTERED', 'MISSED', 'CONTRAINDICATED', 'DEFERRED',
]);

export const AdministrationSiteSchema = z.enum([
  'LEFT_ARM', 'RIGHT_ARM', 'LEFT_THIGH', 'RIGHT_THIGH', 'ORAL', '',
]);

export const CampaignStatusSchema = z.enum([
  'PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED',
]);

export const AEFIEventTypeSchema = z.enum([
  'LOCAL_REACTION', 'SYSTEMIC_REACTION', 'SEVERE', 'DEATH',
]);

export const AEFISeveritySchema = z.enum(['MILD', 'MODERATE', 'SEVERE']);

export const AEFIOutcomeSchema = z.enum([
  'RECOVERED', 'RECOVERING', 'NOT_RECOVERED', 'SEQUELAE', 'DEATH', 'UNKNOWN',
]);

// =============================================================================
// VACCINE DEFINITION SCHEMAS
// =============================================================================

export const VaccineDefinitionSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  disease_target: z.string(),
  standard_age_days: z.number(),
  route: VaccineRouteSchema,
  dose_number: z.number(),
  total_doses: z.number(),
  series_name: z.string(),
  interval_days: z.number(),
  target_population: TargetPopulationSchema,
  program: VaccineProgramSchema,
  min_age_days: z.number(),
  max_age_days: z.number(),
  is_active: z.boolean(),
});

export const VaccineDefinitionArraySchema = z.array(VaccineDefinitionSchema);

// =============================================================================
// IMMUNIZATION RECORD SCHEMAS
// =============================================================================

export const ImmunizationRecordListItemSchema = z.object({
  id: z.number(),
  patient: z.number(),
  vaccine: z.number(),
  vaccine_code: z.string(),
  vaccine_name: z.string(),
  vaccine_program: z.string(),
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
  vaccine_program: z.string(),
  scheduled_date: z.string(),
  administered_date: z.string().nullable(),
  status: ImmunizationStatusSchema,
  dose_number: z.number(),
  batch_number: z.string(),
  lot_number: z.string(),
  expiry_date: z.string().nullable(),
  site: AdministrationSiteSchema,
  administered_by: z.number().nullable(),
  administered_by_name: z.string().nullable(),
  next_dose_date: z.string().nullable(),
  encounter: z.number().nullable(),
  campaign: z.number().nullable(),
  is_overdue: z.boolean(),
  days_overdue: z.number().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedImmunizationRecordListSchema = createPaginatedSchema(
  ImmunizationRecordListItemSchema,
);

export const ImmunizationRecordListItemArraySchema = z.array(ImmunizationRecordListItemSchema);

// =============================================================================
// VACCINE CAMPAIGN SCHEMAS
// =============================================================================

export const VaccineCampaignListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  target_population: TargetPopulationSchema,
  status: CampaignStatusSchema,
  target_count: z.number(),
  is_running: z.boolean(),
  created_at: z.string(),
});

export const VaccineCampaignSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  target_population: TargetPopulationSchema,
  vaccines: z.array(z.number()),
  status: CampaignStatusSchema,
  target_count: z.number(),
  is_running: z.boolean(),
  vaccine_names: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedVaccineCampaignListSchema = createPaginatedSchema(
  VaccineCampaignListItemSchema,
);

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

export const AEFIReportSchema = z.object({
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
// COVERAGE SCHEMA
// =============================================================================

export const CoverageStatsSchema = z.object({
  vaccine_code: z.string(),
  total: z.number(),
  administered: z.number(),
  missed: z.number(),
  scheduled: z.number(),
  coverage_pct: z.number(),
});
