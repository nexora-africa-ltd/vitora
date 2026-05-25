/**
 * Types for standalone Imaging operations (walk-in patients, external referrals).
 */

export interface WalkInImagingPatient {
  id: number;
  registration_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string | null;
  gender: '' | 'M' | 'F' | 'O';
  phone_number: string;
  email: string;
  national_id: string;
  id_type: string;
  referring_facility: string;
  referring_clinician: string;
  linked_patient: number | null;
  created_at: string;
  updated_at: string;
}

export interface WalkInImagingPatientCreateData {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  gender?: '' | 'M' | 'F' | 'O';
  phone_number?: string;
  email?: string;
  national_id?: string;
  id_type?: string;
  referring_facility?: string;
  referring_clinician?: string;
}

export interface StandaloneImagingOrderItem {
  procedure_code: string;
  laterality?: 'NA' | 'LEFT' | 'RIGHT' | 'BILATERAL';
  specific_instructions?: string;
}

export interface StandaloneImagingOrderCreateData {
  walkin_patient_id?: number;
  patient_id?: number;
  walkin_name?: string;
  walkin_phone?: string;
  walkin_national_id?: string;
  walkin_dob?: string | null;
  walkin_gender?: '' | 'M' | 'F' | 'O';
  priority?: 'ROUTINE' | 'URGENT' | 'STAT';
  clinical_indication: string;
  relevant_clinical_history?: string;
  external_referring_facility?: string;
  external_referring_clinician?: string;
  items: StandaloneImagingOrderItem[];
}

export interface ExternalImagingProcedure {
  code: string;
  name?: string;
  laterality?: string;
  modality?: string;
}

export interface ExternalImagingOrderRequest {
  id: number;
  message_control_id: string;
  sending_application: string;
  sending_facility: string;
  referring_clinician: string;
  referring_clinician_license: string;
  external_patient_id: string;
  patient_name: string;
  patient_dob: string | null;
  patient_gender: string;
  patient_phone: string;
  patient_id_number: string;
  placer_order_number: string;
  priority: string;
  clinical_indication: string;
  relevant_clinical_history: string;
  requested_procedures: ExternalImagingProcedure[];
  status: ExternalImagingOrderStatus;
  rejection_reason: string;
  walkin_patient: number | null;
  imaging_order: number | null;
  processed_by: number | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ExternalImagingOrderStatus =
  | 'RECEIVED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'COMPLETED';
