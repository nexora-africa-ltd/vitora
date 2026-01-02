/**
 * Types for encounter form data.
 */

export interface EncounterFormData {
  // Core encounter info
  patient: number | null;
  encounter_type: 'OPD' | 'IPD' | 'EMERGENCY';
  encounter_date: string;
  chief_complaint: string;
  
  // Vital signs
  temperature: number | null;
  pulse: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  weight: number | null;
  height: number | null;
  
  // Medical history
  allergies: string;
  chronic_conditions: string;
  current_medications: string;
  past_surgeries: string;
  family_history: string;
  social_history: string;
  
  // Clinical notes
  notes: string;
  history_of_present_illness: string;
  physical_examination: string;
  assessment: string;
  plan: string;
  
  // Status
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';
}

export const defaultEncounterFormData: EncounterFormData = {
  patient: null,
  encounter_type: 'OPD',
  encounter_date: new Date().toISOString().split('T')[0] || '',
  chief_complaint: '',
  
  temperature: null,
  pulse: null,
  blood_pressure_systolic: null,
  blood_pressure_diastolic: null,
  respiratory_rate: null,
  spo2: null,
  weight: null,
  height: null,
  
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  
  notes: '',
  history_of_present_illness: '',
  physical_examination: '',
  assessment: '',
  plan: '',
  
  status: 'DRAFT',
};

export interface VitalAlert {
  field: string;
  message: string;
  severity: 'warning' | 'critical';
}

export interface ICD10SearchResult {
  id: number;
  code: string;
  description: string;
  short_description: string;
  category: string;
}

export interface DiagnosisFormData {
  icd10_code: number | null;
  icd10_display?: string;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL';
  free_text_diagnosis: string;
  notes: string;
  is_confirmed: boolean;
  certainty: 'SUSPECTED' | 'PROBABLE' | 'CONFIRMED';
}

export const defaultDiagnosisFormData: DiagnosisFormData = {
  icd10_code: null,
  diagnosis_type: 'PRIMARY',
  free_text_diagnosis: '',
  notes: '',
  is_confirmed: false,
  certainty: 'SUSPECTED',
};
