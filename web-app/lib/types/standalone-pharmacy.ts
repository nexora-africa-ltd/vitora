/**
 * Types for standalone Pharmacy operations (walk-in customers, external prescriptions).
 */

export interface WalkInCustomer {
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

export interface WalkInCustomerCreateData {
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

export interface StandalonePrescriptionItem {
  drug_id?: number;
  drug_code?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  route?: string;
  instructions?: string;
}

export interface StandalonePrescriptionCreateData {
  walkin_customer_id?: number;
  patient_id?: number;
  walkin_name?: string;
  walkin_phone?: string;
  walkin_national_id?: string;
  walkin_dob?: string | null;
  walkin_gender?: '' | 'M' | 'F' | 'O';
  prescriber_name?: string;
  prescriber_license?: string;
  external_prescription_number?: string;
  clinical_notes?: string;
  items: StandalonePrescriptionItem[];
}

export interface ExternalPrescriptionItem {
  drug_code?: string;
  drug_name?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
}

export interface ExternalPrescriptionRequest {
  id: number;
  message_control_id: string;
  sending_application: string;
  sending_facility: string;
  prescriber_name: string;
  prescriber_license: string;
  external_patient_id: string;
  patient_name: string;
  patient_dob: string | null;
  patient_gender: string;
  patient_phone: string;
  patient_id_number: string;
  external_prescription_number: string;
  priority: string;
  clinical_info: string;
  requested_items: ExternalPrescriptionItem[];
  status: ExternalPrescriptionStatus;
  rejection_reason: string;
  walkin_customer: number | null;
  prescription: number | null;
  processed_by: number | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ExternalPrescriptionStatus =
  | 'RECEIVED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'COMPLETED';
