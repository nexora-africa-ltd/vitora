import type { PaginatedResponse } from './common';

export type PrescriptionStatus = 'PENDING' | 'PARTIAL' | 'DISPENSED' | 'CANCELLED' | 'EXPIRED';

export interface DrugProduct {
  id: number;
  code: string;
  generic_name: string;
  brand_names?: string | null;
  strength?: string | null;
  form?: string | null;
  category?: string | null;
  categories: string[];
  unit?: string | null;
  schedule?: string | null;
  is_essential: boolean;
  keml_code?: string | null;
  nhif_code?: string | null;
  requires_prescription: boolean;
  is_controlled: boolean;
  is_narcotic: boolean;
  default_reorder_level?: number | null;
  default_reorder_quantity?: number | null;
  shelf_life_months?: number | null;
  storage_requirements?: string | null;
  reference_price?: number | null;
  is_active: boolean;
  display_name: string;
  current_stock: number;
  created_at: string;
  updated_at: string;
}

export interface StockBatch {
  id: number;
  drug: number;
  drug_name?: string | null;
  batch_number: string;
  quantity_received: number;
  quantity_available: number;
  quantity_dispensed: number;
  quantity_damaged: number;
  quantity_expired: number;
  expiry_date: string;
  days_until_expiry?: number | null;
  days_to_expiry?: number | null;
  is_expired_status?: boolean;
  is_expired?: boolean;
  is_low_stock_status?: boolean;
  is_low_stock?: boolean;
  status: string;
  cost_price?: number | null;
  selling_price?: number | null;
  supplier?: string | null;
  purchase_order?: string | null;
  received_date?: string | null;
  received_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StockLevel {
  drugId: number;
  availableQuantity: number;
  outOfStock: boolean;
  lowStock: boolean;
  batches: StockBatch[];
}

export interface PrescriptionItem {
  id: number;
  prescription: number;
  drug: number;
  drug_name?: string | null;
  drug_code?: string | null;
  quantity: number;
  quantity_prescribed: number;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string | null;
  instructions?: string | null;
  is_substitutable: boolean;
  quantity_dispensed: number;
  remaining_qty: number;
  remaining_quantity: number;
  is_cancelled: boolean;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Prescription {
  id: number;
  prescription_number: string;
  encounter?: number | null;
  admission?: number | null;
  patient: number;
  patient_name?: string | null;
  patient_mrn?: string | null;
  prescribed_by?: number | null;
  prescriber?: number | null;
  prescriber_name?: string | null;
  prescribed_at?: string | null;
  prescribed_date?: string | null;
  valid_until?: string | null;
  status: PrescriptionStatus | string;
  clinical_notes?: string | null;
  is_valid: boolean;
  is_valid_prescription: boolean;
  is_fully_dispensed: boolean;
  is_fully_dispensed_status: boolean;
  items: PrescriptionItem[];
  verification_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Dispensation {
  id: number;
  prescription_item?: number | null;
  patient: number;
  patient_name?: string | null;
  drug: number;
  drug_name?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  quantity_dispensed: number;
  quantity_returned: number;
  unit_price?: number | null;
  total_price?: number | null;
  discount?: number | null;
  instructions_given?: string | null;
  patient_counseled: boolean;
  dispensed_by?: number | null;
  dispensed_by_name?: string | null;
  dispensed_at: string;
  verified_by?: number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface PrescriptionItemInput {
  drug: number;
  quantity: number;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string;
  instructions?: string;
  is_substitutable?: boolean;
}

export interface PrescriptionCreateData {
  encounter?: number;
  admission?: number;
  patient: number;
  valid_until?: string;
  clinical_notes?: string;
  items: PrescriptionItemInput[];
  acknowledge_allergy_warnings?: boolean;
}

export interface DispensePayload {
  drug_id: number;
  patient_id: number;
  quantity: number;
  prescription_item_id?: number;
}

export interface PrescriptionListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  encounter?: number;
  status?: string;
  ordering?: string;
}

export type PaginatedDrugResponse = PaginatedResponse<DrugProduct>;
export type PaginatedPrescriptionResponse = PaginatedResponse<Prescription>;
export type PaginatedDispensationResponse = PaginatedResponse<Dispensation>;