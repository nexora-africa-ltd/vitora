/**
 * Encounter-related TypeScript types.
 */

export interface Encounter {
  id: number;
  patient: number;
  patient_name?: string;
  patient_mrn?: string;
  
  // Encounter details
  encounter_type: 'OPD' | 'IPD' | 'EMERGENCY';
  encounter_date: string;
  chief_complaint: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  
  // Vitals
  temperature: number | null;
  pulse: number | null;
  blood_pressure: string | null;
  respiratory_rate: number | null;
  spo2: number | null;
  weight: number | null;
  height: number | null;
  
  // Computed vitals
  bmi?: number | null;
  bmi_classification?: string | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  has_critical_vitals?: boolean;
  alerts?: string;
  vitals_summary?: string;
  
  // Medical history
  allergies: string;
  chronic_conditions: string;
  current_medications: string;
  past_surgeries: string;
  family_history: string;
  social_history: string;
  
  // Clinical notes
  notes: string;
  history_of_present_illness?: string;
  physical_examination?: string;
  assessment?: string;
  plan?: string;
  
  // Status workflow
  finalized_by?: number | null;
  finalized_by_username?: string | null;
  finalized_at?: string | null;
  cancellation_reason?: string;
  
  // Metadata
  created_by?: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Diagnosis {
  id: number;
  encounter: number;
  icd10_code: number | null;
  icd10_code_display?: string;
  icd10_description?: string;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL';
  free_text_diagnosis?: string;
  notes: string;
  is_confirmed: boolean;
  certainty: 'SUSPECTED' | 'PROBABLE' | 'CONFIRMED';
  diagnosed_by?: number | null;
  diagnosed_by_name?: string;
  diagnosed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPlan {
  id: number;
  encounter: number;
  template?: number | null;
  template_name?: string;
  clinical_notes: string;
  medications_json: any;
  procedures_json: any;
  follow_up_instructions: string;
  follow_up_date: string | null;
  diet_recommendations: string;
  activity_restrictions: string;
  referral_needed: boolean;
  referral_specialty: string;
  referral_notes: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED';
  has_follow_up?: boolean;
  has_referral?: boolean;
  medications: Medication[];
  created_by?: number | null;
  created_by_name?: string;
  approved_by?: number | null;
  approved_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Medication {
  id: number;
  treatment_plan: number;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  instructions: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface VitalSign {
  name: string;
  value: number | string | null;
  unit: string;
  normalRange: string;
  isAbnormal: boolean;
  isCritical: boolean;
}

export interface EncounterListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  status?: string;
  encounter_type?: string;
  ordering?: string;
}
