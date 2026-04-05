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
  'BCG_LYMPHADENITIS', 'INJECTION_SITE_ABSCESS', 'CONVULSION', 'HIGH_FEVER',
  'SEVERE_LOCAL_REACTION', 'GENERALIZED_URTICARIA', 'ANAPHYLAXIS',
  'ENCEPHALOPATHY', 'PARALYSIS', 'TOXIC_SHOCK', 'OTHER',
]);

export const AEFISeveritySchema = z.enum(['MILD', 'MODERATE', 'SEVERE']);

export const AEFIOutcomeSchema = z.enum([
  'RECOVERED', 'RECOVERING', 'NOT_RECOVERED', 'SEQUELAE', 'DEATH', 'UNKNOWN',
]);

export const AEFIReportTypeSchema = z.enum(['INITIAL', 'FOLLOW_UP']);

export const VaccinationServiceTypeSchema = z.enum(['STATIC', 'MASS', 'OUTREACH']);

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
  billing_service: z.number().nullable(),
  billing_service_name: z.string().nullable(),
  billing_price: z.string().nullable(),
  base_fee: z.string().nullable(),
  sha_tariff_code: z.string(),
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

export const AEFIVaccinationDetailsSchema = z.object({
  dose_number: z.number(),
  administered_date: z.string().nullable(),
  batch_number: z.string(),
  lot_number: z.string(),
  expiry_date: z.string().nullable(),
  vaccine_manufacturer: z.string(),
  route: z.string(),
  site: z.string(),
  diluent_batch_number: z.string(),
  diluent_manufacturer: z.string(),
  diluent_expiry_date: z.string().nullable(),
});

export const AEFIListItemSchema = z.object({
  id: z.number(),
  immunization_record: z.number(),
  vaccine_code: z.string(),
  patient_name: z.string(),
  report_type: AEFIReportTypeSchema,
  event_date: z.string(),
  event_types: z.array(AEFIEventTypeSchema),
  severity: AEFISeveritySchema,
  outcome: AEFIOutcomeSchema,
  reported_to_authorities: z.boolean(),
  created_at: z.string(),
});

export const AEFIReportSchema = z.object({
  id: z.number(),
  immunization_record: z.number(),
  // Report metadata
  report_type: AEFIReportTypeSchema,
  parent_report: z.number().nullable(),
  // Vaccine context
  vaccine_code: z.string(),
  vaccine_name: z.string(),
  // Patient context
  patient_id: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  patient_gender: z.string(),
  patient_date_of_birth: z.string(),
  guardian_name: z.string(),
  // Vaccination centre
  vaccination_centre_name: z.string(),
  vaccination_centre_county: z.number().nullable(),
  institution_mfl_code: z.string(),
  vaccination_service_type: VaccinationServiceTypeSchema.or(z.literal('')),
  // Event details
  event_date: z.string(),
  onset_time: z.string().nullable(),
  event_types: z.array(AEFIEventTypeSchema),
  other_event_type_detail: z.string(),
  severity: AEFISeveritySchema,
  description: z.string(),
  // Vaccination details
  vaccination_details: AEFIVaccinationDetailsSchema,
  // Outcome
  outcome: AEFIOutcomeSchema,
  // Past medical history
  past_medical_history_notes: z.string(),
  // Action taken
  treatment_given: z.boolean(),
  treatment_details: z.string(),
  specimen_collected: z.boolean(),
  specimen_type: z.string(),
  // Reporter
  reported_by: z.number().nullable(),
  reported_by_name: z.string().nullable(),
  reported_by_designation: z.string(),
  // Reporting to authorities
  reported_to_authorities: z.boolean(),
  report_date: z.string().nullable(),
  // Investigation
  investigated_by: z.number().nullable(),
  investigated_by_name: z.string().nullable(),
  investigation_notes: z.string(),
  // National classification
  national_classification: z.string(),
  // DHIS2
  dhis2_submitted_at: z.string().nullable(),
  dhis2_response: z.record(z.unknown()).nullable(),
  // Follow-ups
  follow_up_count: z.number(),
  // Timestamps
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

// =============================================================================
// VACCINE STOCK SCHEMAS
// =============================================================================

export const StockTransactionTypeSchema = z.enum([
  'RECEIVE', 'ISSUE', 'WASTAGE', 'ADJUSTMENT',
  'TRANSFER_IN', 'TRANSFER_OUT', 'EXPIRED',
]);

export const VaccineStockListItemSchema = z.object({
  id: z.number(),
  vaccine: z.number(),
  vaccine_code: z.string(),
  vaccine_name: z.string(),
  batch_number: z.string(),
  quantity_on_hand: z.number(),
  expiry_date: z.string(),
  storage_location: z.string(),
  is_expired: z.boolean(),
  is_low_stock: z.boolean(),
  is_near_expiry: z.boolean(),
  created_at: z.string(),
});

export const VaccineStockSchema = z.object({
  id: z.number(),
  vaccine: z.number(),
  vaccine_code: z.string(),
  vaccine_name: z.string(),
  batch_number: z.string(),
  quantity_received: z.number(),
  quantity_on_hand: z.number(),
  expiry_date: z.string(),
  manufacturer: z.string(),
  supplier: z.string(),
  received_date: z.string(),
  received_by: z.number().nullable(),
  received_by_name: z.string().nullable(),
  storage_location: z.string(),
  vvm_status: z.string(),
  min_stock_level: z.number(),
  is_expired: z.boolean(),
  is_low_stock: z.boolean(),
  is_near_expiry: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedVaccineStockListSchema = createPaginatedSchema(VaccineStockListItemSchema);

export const StockTransactionSchema = z.object({
  id: z.number(),
  stock: z.number(),
  vaccine_code: z.string(),
  batch_number: z.string(),
  transaction_type: StockTransactionTypeSchema,
  quantity: z.number(),
  balance_after: z.number(),
  reference: z.string(),
  immunization_record: z.number().nullable(),
  performed_by: z.number().nullable(),
  performed_by_name: z.string().nullable(),
  reason: z.string(),
  notes: z.string(),
  created_at: z.string(),
});

export const StockTransactionArraySchema = z.array(StockTransactionSchema);

// =============================================================================
// COLD CHAIN EQUIPMENT SCHEMAS
// =============================================================================

export const ColdChainEquipmentTypeSchema = z.enum([
  'FRIDGE', 'FREEZER', 'COLD_BOX', 'VACCINE_CARRIER', 'COLD_ROOM',
]);

export const ColdChainEquipmentStatusSchema = z.enum([
  'OPERATIONAL', 'FAULTY', 'DECOMMISSIONED', 'UNDER_REPAIR',
]);

export const ColdChainEquipmentListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  equipment_type: ColdChainEquipmentTypeSchema,
  serial_number: z.string(),
  location: z.string(),
  status: ColdChainEquipmentStatusSchema,
  min_temp: z.coerce.number(),
  max_temp: z.coerce.number(),
  created_at: z.string(),
});

export const ColdChainEquipmentSchema = z.object({
  id: z.number(),
  name: z.string(),
  equipment_type: ColdChainEquipmentTypeSchema,
  model_number: z.string(),
  serial_number: z.string(),
  manufacturer: z.string(),
  location: z.string(),
  capacity_litres: z.coerce.number().nullable(),
  min_temp: z.coerce.number(),
  max_temp: z.coerce.number(),
  status: ColdChainEquipmentStatusSchema,
  installation_date: z.string().nullable(),
  last_maintenance_date: z.string().nullable(),
  next_maintenance_date: z.string().nullable(),
  power_source: z.string(),
  has_backup_power: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedColdChainEquipmentListSchema = createPaginatedSchema(
  ColdChainEquipmentListItemSchema,
);

export const TemperatureLogSchema = z.object({
  id: z.number(),
  equipment: z.number(),
  equipment_name: z.string(),
  temperature: z.coerce.number(),
  recorded_at: z.string(),
  recorded_by: z.number().nullable(),
  recorded_by_name: z.string().nullable(),
  is_excursion: z.boolean(),
  action_taken: z.string(),
  created_at: z.string(),
});

export const PaginatedTemperatureLogListSchema = createPaginatedSchema(TemperatureLogSchema);

// =============================================================================
// VACCINE INCIDENT SCHEMAS
// =============================================================================

export const IncidentTypeSchema = z.enum([
  'POWER_OUTAGE', 'COLD_CHAIN_BREAK', 'EQUIPMENT_FAILURE',
  'STOCK_DAMAGE', 'THEFT', 'EXPIRED_STOCK', 'OTHER',
]);

export const IncidentSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const IncidentStatusSchema = z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']);

export const VaccineIncidentListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  incident_type: IncidentTypeSchema,
  severity: IncidentSeveritySchema,
  status: IncidentStatusSchema,
  occurred_at: z.string(),
  doses_affected: z.number(),
  doses_lost: z.number(),
  reported_to_county: z.boolean(),
  created_at: z.string(),
});

export const VaccineIncidentSchema = z.object({
  id: z.number(),
  title: z.string(),
  incident_type: IncidentTypeSchema,
  severity: IncidentSeveritySchema,
  status: IncidentStatusSchema,
  description: z.string(),
  occurred_at: z.string(),
  resolved_at: z.string().nullable(),
  duration_minutes: z.number().nullable(),
  affected_equipment: z.array(z.number()),
  affected_batches: z.array(z.number()),
  doses_affected: z.number(),
  doses_lost: z.number(),
  corrective_actions: z.string(),
  preventive_actions: z.string(),
  reported_by: z.number().nullable(),
  reported_by_name: z.string().nullable(),
  investigated_by: z.number().nullable(),
  investigated_by_name: z.string().nullable(),
  reported_to_county: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedVaccineIncidentListSchema = createPaginatedSchema(
  VaccineIncidentListItemSchema,
);
