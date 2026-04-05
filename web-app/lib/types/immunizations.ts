/**
 * Immunizations Module Type Definitions
 *
 * Types for the standalone immunizations app supporting KEPI (child),
 * adult routine, campaign, occupational, and travel vaccines.
 * Aligned with backend hmis.apps.immunizations models and serializers.
 */

import { PaginatedResponse } from '@/lib/types';

// =============================================================================
// ENUMS
// =============================================================================

export type TargetPopulation = 'INFANT' | 'CHILD' | 'ADOLESCENT' | 'ADULT' | 'ALL';

export type VaccineProgram = 'KEPI' | 'ROUTINE' | 'CAMPAIGN' | 'OCCUPATIONAL' | 'TRAVEL' | 'CATCH_UP';

export type VaccineRoute = 'IM' | 'SC' | 'ORAL' | 'ID' | '';

export type ImmunizationStatus = 'SCHEDULED' | 'ADMINISTERED' | 'MISSED' | 'CONTRAINDICATED' | 'DEFERRED';

export type AdministrationSite = 'LEFT_ARM' | 'RIGHT_ARM' | 'LEFT_THIGH' | 'RIGHT_THIGH' | 'ORAL' | '';

export type CampaignStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type AEFIEventType = 'LOCAL_REACTION' | 'SYSTEMIC_REACTION' | 'SEVERE' | 'DEATH';

export type AEFISeverity = 'MILD' | 'MODERATE' | 'SEVERE';

export type AEFIOutcome = 'RECOVERED' | 'RECOVERING' | 'NOT_RECOVERED' | 'SEQUELAE' | 'DEATH' | 'UNKNOWN';

// =============================================================================
// VACCINE DEFINITION
// =============================================================================

export interface VaccineDefinition {
  id: number;
  code: string;
  name: string;
  description: string;
  disease_target: string;
  standard_age_days: number;
  route: VaccineRoute;
  dose_number: number;
  total_doses: number;
  series_name: string;
  interval_days: number;
  target_population: TargetPopulation;
  program: VaccineProgram;
  min_age_days: number;
  max_age_days: number;
  is_active: boolean;
}

// =============================================================================
// IMMUNIZATION RECORD
// =============================================================================

export interface ImmunizationRecordListItem {
  id: number;
  patient: number;
  vaccine: number;
  vaccine_code: string;
  vaccine_name: string;
  vaccine_program: string;
  scheduled_date: string;
  administered_date: string | null;
  status: ImmunizationStatus;
  dose_number: number;
  is_overdue: boolean;
  created_at: string;
}

export interface ImmunizationRecord extends ImmunizationRecordListItem {
  patient_name: string;
  patient_mrn: string;
  batch_number: string;
  lot_number: string;
  expiry_date: string | null;
  site: AdministrationSite;
  administered_by: number | null;
  administered_by_name: string | null;
  next_dose_date: string | null;
  days_overdue: number | null;
  encounter: number | null;
  campaign: number | null;
  notes: string;
  updated_at: string;
}

export interface AdministerVaccineData {
  administered_date?: string;
  batch_number?: string;
  lot_number?: string;
  expiry_date?: string;
  site?: AdministrationSite;
  notes?: string;
}

export interface ImmunizationRecordListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  vaccine?: number;
  status?: ImmunizationStatus;
  program?: VaccineProgram;
  campaign?: number;
  ordering?: string;
}

export interface GenerateAdultScheduleData {
  patient: number;
  vaccine: number;
  start_date?: string;
}

// =============================================================================
// VACCINE CAMPAIGN
// =============================================================================

export interface VaccineCampaignListItem {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  target_population: TargetPopulation;
  status: CampaignStatus;
  target_count: number;
  is_running: boolean;
  created_at: string;
}

export interface VaccineCampaign extends VaccineCampaignListItem {
  description: string;
  vaccines: number[];
  vaccine_names: string[];
  updated_at: string;
}

export interface VaccineCampaignCreateData {
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  target_population: TargetPopulation;
  vaccines?: number[];
  status?: CampaignStatus;
  target_count?: number;
}

export interface VaccineCampaignListParams {
  page?: number;
  page_size?: number;
  status?: CampaignStatus;
  target_population?: TargetPopulation;
  ordering?: string;
}

// =============================================================================
// AEFI
// =============================================================================

export interface AEFIListItem {
  id: number;
  immunization_record: number;
  vaccine_code: string;
  event_date: string;
  event_type: AEFIEventType;
  severity: AEFISeverity;
  outcome: AEFIOutcome;
  reported_to_authorities: boolean;
  created_at: string;
}

export interface AEFIReport extends AEFIListItem {
  vaccine_name: string;
  patient_name: string;
  description: string;
  report_date: string | null;
  investigated_by: number | null;
  investigated_by_name: string | null;
  investigation_notes: string;
  updated_at: string;
}

export interface AEFICreateData {
  immunization_record: number;
  event_date: string;
  event_type: AEFIEventType;
  severity: AEFISeverity;
  description: string;
  outcome?: AEFIOutcome;
}

export interface AEFIListParams {
  page?: number;
  page_size?: number;
  event_type?: AEFIEventType;
  severity?: AEFISeverity;
  immunization_record?: number;
  ordering?: string;
}

// =============================================================================
// COVERAGE
// =============================================================================

export interface CoverageStats {
  vaccine_code: string;
  total: number;
  administered: number;
  missed: number;
  scheduled: number;
  coverage_pct: number;
}

// =============================================================================
// VACCINE STOCK
// =============================================================================

export type StockTransactionType =
  | 'RECEIVE' | 'ISSUE' | 'WASTAGE' | 'ADJUSTMENT'
  | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'EXPIRED';

export interface VaccineStockListItem {
  id: number;
  vaccine: number;
  vaccine_code: string;
  vaccine_name: string;
  batch_number: string;
  quantity_on_hand: number;
  expiry_date: string;
  storage_location: string;
  is_expired: boolean;
  is_low_stock: boolean;
  is_near_expiry: boolean;
  created_at: string;
}

export interface VaccineStock extends VaccineStockListItem {
  quantity_received: number;
  manufacturer: string;
  supplier: string;
  received_date: string;
  received_by: number | null;
  received_by_name: string | null;
  vvm_status: string;
  min_stock_level: number;
  notes: string;
  updated_at: string;
}

export interface StockTransaction {
  id: number;
  stock: number;
  vaccine_code: string;
  batch_number: string;
  transaction_type: StockTransactionType;
  quantity: number;
  balance_after: number;
  reference: string;
  immunization_record: number | null;
  performed_by: number | null;
  performed_by_name: string | null;
  reason: string;
  notes: string;
  created_at: string;
}

export interface StockReceiveData {
  vaccine: number;
  batch_number: string;
  quantity_received: number;
  expiry_date: string;
  received_date: string;
  manufacturer?: string;
  supplier?: string;
  storage_location?: string;
  vvm_status?: string;
  min_stock_level?: number;
  notes?: string;
}

export interface StockIssueData {
  quantity: number;
  transaction_type: 'WASTAGE' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'EXPIRED';
  reason?: string;
  notes?: string;
}

export interface VaccineStockListParams {
  page?: number;
  page_size?: number;
  vaccine?: number;
  is_expired?: boolean;
  is_low_stock?: boolean;
  ordering?: string;
}

// =============================================================================
// COLD CHAIN EQUIPMENT
// =============================================================================

export type ColdChainEquipmentType =
  | 'FRIDGE' | 'FREEZER' | 'COLD_BOX' | 'VACCINE_CARRIER' | 'COLD_ROOM';

export type ColdChainEquipmentStatus =
  | 'OPERATIONAL' | 'FAULTY' | 'DECOMMISSIONED' | 'UNDER_REPAIR';

export interface ColdChainEquipmentListItem {
  id: number;
  name: string;
  equipment_type: ColdChainEquipmentType;
  serial_number: string;
  location: string;
  status: ColdChainEquipmentStatus;
  min_temp: number;
  max_temp: number;
  created_at: string;
}

export interface ColdChainEquipment extends ColdChainEquipmentListItem {
  model_number: string;
  manufacturer: string;
  capacity_litres: number | null;
  installation_date: string | null;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  power_source: string;
  has_backup_power: boolean;
  notes: string;
  updated_at: string;
}

export interface ColdChainEquipmentCreateData {
  name: string;
  equipment_type: ColdChainEquipmentType;
  model_number?: string;
  serial_number?: string;
  manufacturer?: string;
  location?: string;
  capacity_litres?: number;
  min_temp?: number;
  max_temp?: number;
  status?: ColdChainEquipmentStatus;
  power_source?: string;
  has_backup_power?: boolean;
  notes?: string;
}

export interface TemperatureLog {
  id: number;
  equipment: number;
  equipment_name: string;
  temperature: number;
  recorded_at: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  is_excursion: boolean;
  action_taken: string;
  created_at: string;
}

export interface TemperatureLogCreateData {
  equipment: number;
  temperature: number;
  recorded_at: string;
  action_taken?: string;
}

// =============================================================================
// VACCINE INCIDENTS
// =============================================================================

export type IncidentType =
  | 'POWER_OUTAGE' | 'COLD_CHAIN_BREAK' | 'EQUIPMENT_FAILURE'
  | 'STOCK_DAMAGE' | 'THEFT' | 'EXPIRED_STOCK' | 'OTHER';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';

export interface VaccineIncidentListItem {
  id: number;
  title: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurred_at: string;
  doses_affected: number;
  doses_lost: number;
  reported_to_county: boolean;
  created_at: string;
}

export interface VaccineIncident extends VaccineIncidentListItem {
  description: string;
  resolved_at: string | null;
  duration_minutes: number | null;
  affected_equipment: number[];
  affected_batches: number[];
  corrective_actions: string;
  preventive_actions: string;
  reported_by: number | null;
  reported_by_name: string | null;
  investigated_by: number | null;
  investigated_by_name: string | null;
  updated_at: string;
}

export interface VaccineIncidentCreateData {
  title: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  occurred_at: string;
  doses_affected?: number;
  doses_lost?: number;
  affected_equipment?: number[];
  affected_batches?: number[];
}

export interface VaccineIncidentListParams {
  page?: number;
  page_size?: number;
  incident_type?: IncidentType;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  ordering?: string;
}

// =============================================================================
// PAGINATED RESPONSE ALIASES
// =============================================================================

export type PaginatedImmunizationRecords = PaginatedResponse<ImmunizationRecordListItem>;
export type PaginatedVaccineCampaigns = PaginatedResponse<VaccineCampaignListItem>;
export type PaginatedAEFIReports = PaginatedResponse<AEFIListItem>;
export type PaginatedVaccineStock = PaginatedResponse<VaccineStockListItem>;
export type PaginatedColdChainEquipment = PaginatedResponse<ColdChainEquipmentListItem>;
export type PaginatedTemperatureLogs = PaginatedResponse<TemperatureLog>;
export type PaginatedVaccineIncidents = PaginatedResponse<VaccineIncidentListItem>;
