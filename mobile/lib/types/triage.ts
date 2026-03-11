export type TriageLevel = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';

export type TriageMentalStatus = 'A' | 'V' | 'P' | 'U';

export type TriageAssignedArea =
  | 'ER_RESUS'
  | 'ER_ACUTE'
  | 'ER_FAST_TRACK'
  | 'OBSERVATION'
  | 'OPD'
  | 'TRAUMA'
  | 'PEDIATRIC_ER'
  | 'MATERNITY'
  | 'SPECIALTY';

export interface TriageAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING';
  vital_type: string;
  message: string;
  value: number;
  threshold: number;
}

export interface TriageVitals {
  spo2?: string | number;
  heart_rate?: number;
  blood_pressure?: string;
  temperature?: string | number;
  respiratory_rate?: number;
  weight?: string | number;
  height?: string | number;
}

export interface TriageAssessment {
  id: number;
  encounter: number;
  encounter_mrn?: string | null;
  patient_name?: string | null;
  patient_mrn?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  chief_complaint: string;
  chief_complaint_category: string;
  pain_score?: number | null;
  mental_status: TriageMentalStatus;
  gcs_eye?: number | null;
  gcs_verbal?: number | null;
  gcs_motor?: number | null;
  gcs_total?: number | null;
  gcs_severity?: string | null;
  mobility: string;
  arrival_mode: string;
  referring_facility_name?: string;
  allergies_noted?: string;
  spo2?: number | null;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  temperature?: number | null;
  respiratory_rate?: number | null;
  weight?: number | null;
  height?: number | null;
  triage_category: TriageLevel;
  auto_calculated_category?: TriageLevel | null;
  category_override_reason?: string;
  assigned_area?: TriageAssignedArea | '' | null;
  assigned_clinic?: number | null;
  assigned_clinic_name?: string | null;
  routing_destination?: string | null;
  assigned_clinician?: number | null;
  assigned_clinician_name?: string | null;
  arrival_time: string;
  triage_start_time?: string | null;
  triage_end_time?: string | null;
  seen_by_clinician_time?: string | null;
  alerts: TriageAlert[];
  vitals: TriageVitals;
  wait_time_minutes?: number;
  is_wait_time_exceeded?: boolean;
  triaged_by?: number | null;
  triaged_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TriageAssessmentCreateData {
  encounter: number;
  chief_complaint: string;
  chief_complaint_category: string;
  pain_score?: number | null;
  mental_status: TriageMentalStatus;
  gcs_eye?: number | null;
  gcs_verbal?: number | null;
  gcs_motor?: number | null;
  mobility: string;
  arrival_mode?: string;
  referring_facility_name?: string;
  allergies_noted?: string;
  spo2?: number | null;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  temperature?: number | null;
  respiratory_rate?: number | null;
  weight?: number | null;
  height?: number | null;
  triage_category?: TriageLevel | null;
  auto_calculated_category?: TriageLevel | null;
  category_override_reason?: string;
  assigned_area?: TriageAssignedArea | '' | null;
  assigned_clinic?: number | null;
  assigned_clinician?: number | null;
  arrival_time: string;
}