// Inpatient module types — wards, beds, admissions, discharges, transfers, nursing

export type WardType = 'MEDICAL' | 'SURGICAL' | 'PEDIATRIC' | 'MATERNITY' | 'ICU' | 'ISOLATION';

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

export type AdmissionStatus = 'ACTIVE' | 'DISCHARGED' | 'TRANSFERRED_OUT' | 'DECEASED' | 'ABSCONDED';

export type PayerType = 'CASH' | 'SHA' | 'CORPORATE';

export type DischargeType = 'NORMAL' | 'AGAINST_ADVICE' | 'TRANSFERRED' | 'DECEASED' | 'ABSCONDED';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export type CarePlanStatus = 'ACTIVE' | 'RESOLVED' | 'ONGOING';

export type FluidEntryType =
  | 'INTRAVENOUS'
  | 'ALIMENTARY'
  | 'OTHER_INTAKE'
  | 'VOMIT'
  | 'STOOL'
  | 'NASOGASTRIC'
  | 'OTHER_OUTPUT'
  | 'URINE';

export type ReviewUrgency = 'STAT' | 'URGENT' | 'ROUTINE';

export type ReviewStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

// ── Ward ──

export interface InpatientWard {
  id: number;
  name: string;
  code: string;
  ward_type: WardType;
  ward_type_display?: string;
  floor?: string | null;
  capacity: number;
  description?: string | null;
  is_active: boolean;
  daily_rate?: string | null;
  gender_restriction?: string | null;
  min_age_years?: number | null;
  max_age_years?: number | null;
  isolation_capable: boolean;
  oxygen_equipped?: boolean;
  ventilator_capable?: boolean;
  available_beds: number;
  total_beds: number;
  occupied_beds: number;
  occupancy_rate: number;
}

// ── Bed ──

export interface Bed {
  id: number;
  ward: number;
  ward_name?: string;
  bed_number: string;
  status: BedStatus;
  status_display?: string;
  bed_type?: string | null;
  notes?: string | null;
  status_changed_by?: number | null;
  status_changed_by_username?: string | null;
  status_changed_at?: string | null;
}

// ── Admission ──

export interface Admission {
  id: number;
  admission_number: string;
  patient: number;
  patient_name?: string;
  patient_age?: number | null;
  patient_gender?: string | null;
  opd_encounter?: number | null;
  mch_registration?: number | null;
  mch_registration_number?: string | null;
  ipd_encounter?: number | null;
  recommendation?: number | null;
  admission_date: string;
  admitting_diagnosis?: number | null;
  admitting_diagnosis_text?: string | null;
  admitting_officer?: number | null;
  admitting_officer_username?: string | null;
  attending_doctor?: number | null;
  attending_doctor_username?: string | null;
  ward: number;
  ward_name?: string;
  bed?: number | null;
  bed_number?: string | null;
  admission_status: AdmissionStatus;
  admission_status_display?: string;
  payer_type: PayerType;
  payer_type_display?: string;
  insurance_details?: string | null;
  constraint_override?: boolean;
  constraint_override_reason?: string | null;
  constraint_violations?: string[];
  length_of_stay?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdmissionCreateData {
  patient: number;
  opd_encounter?: number;
  ward: number;
  bed?: number;
  auto_assign_bed?: boolean;
  admitting_diagnosis?: number;
  payer_type?: PayerType;
  insurance_details?: string;
  constraint_override?: boolean;
  constraint_override_reason?: string;
}

// ── Discharge ──

export interface Discharge {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  discharge_type: DischargeType;
  discharge_type_display?: string;
  discharge_date: string;
  discharged_by?: number | null;
  discharged_by_username?: string | null;
  admission_diagnosis?: string | null;
  final_diagnosis?: number | null;
  final_diagnosis_text?: string | null;
  procedures_performed?: string | null;
  treatment_summary: string;
  discharge_medications?: string | null;
  follow_up_date?: string | null;
  follow_up_instructions?: string | null;
  referral_facility?: string | null;
  referral_reason?: string | null;
  patient_instructions?: string | null;
  pharmacy_cleared: boolean;
  billing_cleared: boolean;
  lab_results_acknowledged: boolean;
  length_of_stay?: number | null;
  created_at?: string;
}

export interface DischargeCreateData {
  admission: number;
  discharge_type: DischargeType;
  discharge_date: string;
  final_diagnosis?: number;
  treatment_summary: string;
  discharge_medications?: string;
  follow_up_date?: string;
  follow_up_instructions?: string;
  patient_instructions?: string;
  pharmacy_cleared?: boolean;
  billing_cleared?: boolean;
  lab_results_acknowledged?: boolean;
}

// ── Transfer ──

export interface Transfer {
  id: number;
  admission: number;
  source_ward?: number | null;
  source_ward_name?: string;
  source_bed?: number | null;
  source_bed_number?: string;
  destination_ward: number;
  destination_ward_name?: string;
  destination_bed?: number | null;
  destination_bed_number?: string;
  reason: string;
  clinical_handover_notes?: string | null;
  transferred_by?: number | null;
  transferred_by_username?: string | null;
  created_at?: string;
}

// ── Ward Round ──

export interface WardRound {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  round_date: string;
  round_time?: string | null;
  conducted_by?: number | null;
  conducted_by_username?: string | null;
  review_type?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  condition_status?: string | null;
  created_at?: string;
}

export interface WardRoundCreateData {
  admission: number;
  round_date: string;
  round_time?: string;
  review_type?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  condition_status?: string;
}

// ── Nursing Kardex ──

export interface NursingKardex {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  ward_name?: string;
  bed_number?: string;
  mobility_status?: string | null;
  dietary_requirements?: string | null;
  allergies?: string | null;
  iv_access?: string | null;
  fall_risk?: RiskLevel | null;
  fall_risk_display?: string | null;
  pressure_sore_risk?: RiskLevel | null;
  pressure_sore_risk_display?: string | null;
  isolation_required?: boolean;
  isolation_type?: string | null;
  shift_notes: KardexShiftNote[];
  handover_notes: KardexHandoverNote[];
  care_plan_entries: NursingCarePlanEntry[];
}

export interface KardexShiftNote {
  id: number;
  kardex: number;
  shift: 'DAY' | 'NIGHT';
  note: string;
  recorded_at: string;
  recorded_by?: number | null;
  recorded_by_username?: string | null;
}

export interface KardexHandoverNote {
  id: number;
  kardex: number;
  note: string;
  outgoing_nurse?: string | null;
  incoming_nurse?: string | null;
  recorded_at: string;
}

export interface NursingCarePlanEntry {
  id: number;
  kardex: number;
  recorded_at: string;
  recorded_by?: number | null;
  recorded_by_username?: string | null;
  assessment?: string | null;
  nursing_diagnosis?: string | null;
  goal_and_outcome_criteria?: string | null;
  plan_of_action?: string | null;
  scientific_rationale?: string | null;
  implementation?: string | null;
  evaluation?: string | null;
  status: CarePlanStatus;
  status_display?: string;
}

export interface ShiftNoteCreateData {
  shift: 'DAY' | 'NIGHT';
  note: string;
}

export interface CarePlanEntryCreateData {
  assessment?: string;
  nursing_diagnosis?: string;
  goal_and_outcome_criteria?: string;
  plan_of_action?: string;
  scientific_rationale?: string;
  implementation?: string;
  evaluation?: string;
  status?: CarePlanStatus;
}

// ── Vital Observations ──

export interface TemperatureReading {
  id: number;
  admission: number;
  temperature: number;
  pulse: number;
  respiratory_rate: number;
  recorded_at: string;
  recorded_by?: number | null;
  recorded_by_username?: string | null;
}

export interface TemperatureReadingCreateData {
  admission: number;
  temperature: number;
  pulse: number;
  respiratory_rate: number;
}

// ── Fluid Balance ──

export interface FluidBalanceSheet {
  id: number;
  admission: number;
  date: string;
  total_intake: number;
  total_output: number;
  balance: number;
  entries: FluidBalanceEntry[];
  created_at?: string;
}

export interface FluidBalanceEntry {
  id: number;
  sheet: number;
  entry_type: FluidEntryType;
  entry_type_display?: string;
  amount_ml: number;
  specific_gravity?: number | null;
  time_recorded: string;
  notes?: string | null;
  recorded_by?: number | null;
  recorded_by_username?: string | null;
}

export interface FluidBalanceEntryCreateData {
  sheet: number;
  entry_type: FluidEntryType;
  amount_ml: number;
  specific_gravity?: number;
  notes?: string;
}

// ── List params ──

export interface WardListParams {
  page?: number;
  page_size?: number;
  is_active?: boolean;
  ward_type?: WardType;
}

export interface AdmissionListParams {
  page?: number;
  page_size?: number;
  admission_status?: AdmissionStatus;
  ward?: number;
  patient?: number;
  search?: string;
}

export interface WardRoundListParams {
  page?: number;
  page_size?: number;
  admission?: number;
}
