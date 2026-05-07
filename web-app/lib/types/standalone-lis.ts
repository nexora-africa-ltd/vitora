/**
 * Types for standalone LIS operations (walk-in patients, external orders).
 */

export interface WalkInPatient {
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

export interface WalkInPatientCreateData {
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

export interface StandaloneOrderCreateData {
  walkin_patient_id?: number;
  patient_id?: number;
  walkin_name?: string;
  walkin_phone?: string;
  walkin_national_id?: string;
  walkin_dob?: string | null;
  walkin_gender?: '' | 'M' | 'F' | 'O';
  priority?: 'ROUTINE' | 'URGENT' | 'STAT';
  clinical_notes?: string;
  referring_clinician?: string;
  items: StandaloneOrderItem[];
}

export interface StandaloneOrderItem {
  test_code: string;
  special_instructions?: string;
}

export interface ExternalOrderRequest {
  id: number;
  message_control_id: string;
  sending_application: string;
  sending_facility: string;
  external_patient_id: string;
  patient_name: string;
  patient_dob: string | null;
  patient_gender: string;
  patient_id_number: string;
  placer_order_number: string;
  order_priority: string;
  clinical_info: string;
  requested_tests: ExternalOrderTest[];
  status: ExternalOrderStatus;
  rejection_reason: string;
  walkin_patient: number | null;
  lab_order: number | null;
  processed_by: number | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalOrderTest {
  code: string;
  name?: string;
}

export type ExternalOrderStatus = 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED';
