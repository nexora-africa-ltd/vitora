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
// PAGINATED RESPONSE ALIASES
// =============================================================================

export type PaginatedImmunizationRecords = PaginatedResponse<ImmunizationRecordListItem>;
export type PaginatedVaccineCampaigns = PaginatedResponse<VaccineCampaignListItem>;
export type PaginatedAEFIReports = PaginatedResponse<AEFIListItem>;
