/**
 * Pharmacy module type definitions.
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Based on backend models at hmis/apps/pharmacy/models.py
 */

// Drug form options
export type DrugForm =
  | 'TABLET'
  | 'CAPSULE'
  | 'SYRUP'
  | 'INJECTION'
  | 'CREAM'
  | 'OINTMENT'
  | 'DROPS'
  | 'INHALER'
  | 'SUPPOSITORY'
  | 'POWDER'
  | 'SUSPENSION'
  | 'SOLUTION'
  | 'GEL'
  | 'PATCH'
  | 'SPRAY';

// Drug category options
export type DrugCategory =
  | 'ANALGESIC'
  | 'ANTIBIOTIC'
  | 'ANTIMALARIAL'
  | 'ANTIRETROVIRAL'
  | 'ANTIHYPERTENSIVE'
  | 'ANTIDIABETIC'
  | 'ANTIHISTAMINE'
  | 'VITAMIN'
  | 'VACCINE'
  | 'CONTRACEPTIVE'
  | 'PSYCHOTROPIC'
  | 'CONTROLLED'
  | 'OTHER';

// Drug schedule options
export type DrugSchedule = 'OTC' | 'POM' | 'P' | 'CD';

// Stock status options
export type StockStatus =
  | 'AVAILABLE'
  | 'LOW'
  | 'OUT_OF_STOCK'
  | 'EXPIRED'
  | 'QUARANTINE'
  | 'RECALLED';

// Alert types
export type AlertType =
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'EXPIRING_SOON'
  | 'EXPIRING_CRITICAL'
  | 'EXPIRED'
  | 'RECALLED'
  | 'RX_EXPIRING';

// Alert severity
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Prescription status
export type PrescriptionStatus =
  | 'PENDING'
  | 'PARTIAL'
  | 'DISPENSED'
  | 'CANCELLED'
  | 'EXPIRED';

// Dispensing type: where the prescription is filled
export type DispensingType = 'INTERNAL' | 'EXTERNAL';

// Dispensing status
export type DispensingStatus = 'COMPLETED' | 'RETURNED' | 'CANCELLED';

// Stock adjustment types
export type AdjustmentType =
  | 'DAMAGED'
  | 'EXPIRED'
  | 'LOST'
  | 'THEFT'
  | 'CORRECTION'
  | 'RETURN_TO_SUPPLIER'
  | 'DONATION'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'DAMAGE'
  | 'LOSS'
  | 'RETURN_SUPPLIER'
  | 'COUNT_CORRECTION'
  | 'SAMPLE'
  | 'OTHER';

/**
 * Drug catalog entry
 */
export interface Drug {
  id: number;
  code: string;
  generic_name: string;
  brand_names: string[];
  /**
   * Primary category (backward compatible - returns first category)
   */
  category: DrugCategory | null;
  /**
   * All categories this drug belongs to.
   * A drug can belong to multiple categories (e.g., Aspirin = ['ANALGESIC', 'OTHER'])
   */
  categories: DrugCategory[];
  form: DrugForm;
  strength: string;
  unit: string;
  schedule: DrugSchedule;
  requires_prescription: boolean;
  is_controlled: boolean;
  is_narcotic: boolean;
  keml_code?: string | null;
  is_essential: boolean;
  nhif_code?: string | null;
  /** KNHTS concept ID from DHA HPT Registry, e.g. "10-03913-01" */
  hpt_code?: string | null;
  /** DHA HPT product ID for API lookups */
  hpt_product_id?: number | null;
  /** When HPT data was last synced from DHA */
  hpt_last_synced?: string | null;
  /** Kenya Pharmacy and Poisons Board registration code */
  ppb_code?: string | null;
  default_reorder_level: number;
  default_reorder_quantity: number;
  shelf_life_months?: number | null;
  storage_requirements?: string | null;
  reference_price?: number | null;
  is_active: boolean;
  /**
   * Total available stock across ALL batches for this drug.
   * Aggregated from batches.filter(status="AVAILABLE").sum(quantity_available)
   */
  current_stock: number;
  created_at: string;
  updated_at: string;
}

/**
 * Stock batch - represents a single shipment/receipt of a drug.
 *
 * IMPORTANT: Each batch belongs to ONE drug only.
 * A drug can have multiple batches (one-to-many relationship).
 *
 * Example:
 * - Drug: Paracetamol 500mg Tablets
 *   - Batch A (exp: Mar 2026): 50 available
 *   - Batch B (exp: Jun 2026): 500 available
 *   - Batch C (exp: Dec 2026): 200 available
 *   - Total (Drug.current_stock): 750
 *
 * Uses FEFO (First Expiry First Out) dispensing:
 * Batches are ordered by expiry_date, earliest first.
 */
export interface StockBatch {
  id: number;
  drug: number;
  drug_name?: string | null;
  drug_code?: string | null;
  batch_number: string;
  barcode?: string | null;
  quantity_received: number;
  quantity_available: number;
  quantity_dispensed: number;
  quantity_damaged: number;
  quantity_expired: number;
  manufacture_date?: string | null;
  expiry_date: string;
  received_date: string;
  cost_price: number;
  selling_price: number;
  supplier?: string | null;
  purchase_order?: string | null;
  received_by: number;
  received_by_name?: string | null;
  status: StockStatus;
  location?: string | null;
  days_to_expiry: number;
  is_expired: boolean;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Stock alert
 */
export interface StockAlert {
  id: number;
  drug: number;
  drug_name?: string | null;
  drug_code?: string | null;
  stock_batch?: number | null;
  batch_number?: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  acknowledged: boolean;
  acknowledged_by?: number | null;
  acknowledged_by_name?: string | null;
  acknowledged_at?: string | null;
  resolved: boolean;
  resolved_by?: number | null;
  resolved_by_name?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Prescription
 */
export interface Prescription {
  id: number;
  prescription_number: string;
  patient: number;
  patient_name?: string | null;
  patient_mrn?: string | null;
  encounter?: number | null;
  admission?: number | null;
  prescriber: number;
  prescriber_name?: string | null;
  status: PrescriptionStatus;
  effective_status: PrescriptionStatus;
  prescribed_date: string;
  valid_until: string;
  days_until_expiry?: number | null;
  clinical_notes?: string | null;
  cancelled_reason?: string | null;
  cancelled_by?: number | null;
  cancelled_at?: string | null;
  items: PrescriptionItem[];
  dispensing_type: DispensingType;
  is_discharge_medication: boolean;
  is_valid: boolean;
  is_fully_dispensed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Prescription item
 */
export interface PrescriptionItem {
  id: number;
  prescription: number;
  drug: number;
  drug_name?: string | null;
  drug_code?: string | null;
  quantity_prescribed: number;
  quantity_dispensed: number;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string | null;
  instructions?: string | null;
  is_substitutable: boolean;
  is_cancelled: boolean;
  cancelled_reason?: string | null;
  remaining_quantity: number;
  created_at: string;
  updated_at: string;
}

/**
 * Dispensing record
 */
export interface Dispensing {
  id: number;
  prescription_item?: number | null;
  drug: number;
  drug_name?: string | null;
  drug_code?: string | null;
  stock_batch?: number | null;
  batch?: number | null;
  batch_number?: string | null;
  quantity?: number | null;
  quantity_dispensed?: number | null;
  quantity_returned?: number | null;
  discount?: number | string | null;
  instructions_given?: string | null;
  patient_counseled?: boolean | null;
  patient?: number | null;
  patient_name?: string | null;
  patient_mrn?: string | null;
  dispensed_by: number;
  dispensed_by_name?: string | null;
  dispensed_at: string;
  verified_by?: number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  status?: DispensingStatus | null;
  unit_price: number | string;
  total_price: number | string;
  payment_status?: string | null;
  notes?: string | null;
  is_direct_sale?: boolean | null;
  returned_quantity?: number | null;
  return_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
}

/**
 * Stock adjustment
 */
export interface StockAdjustment {
  id: number;
  stock_batch: number;
  batch_number?: string | null;
  drug_name?: string | null;
  adjustment_type: AdjustmentType;
  quantity: number;
  reason: string;
  adjusted_by: number;
  adjusted_by_name?: string | null;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  reference_number?: string | null;
  created_at: string;
  updated_at: string;
}

// ============ API Request/Response Types ============

/**
 * Drug list params
 */
export interface DrugListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: DrugCategory;
  form?: DrugForm;
  schedule?: DrugSchedule;
  is_essential?: boolean;
  is_active?: boolean;
  ordering?: string;
}

/**
 * Stock batch list params
 */
export interface StockBatchListParams {
  page?: number;
  page_size?: number;
  drug?: number;
  status?: StockStatus;
  expiring_within_days?: number;
  ordering?: string;
}

/**
 * Stock alert list params
 */
export interface StockAlertListParams {
  page?: number;
  page_size?: number;
  alert_type?: AlertType;
  severity?: AlertSeverity;
  acknowledged?: boolean;
  resolved?: boolean;
  ordering?: string;
}

/**
 * Prescription list params
 */
export interface PrescriptionListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  encounter?: number;
  admission?: number;
  status?: PrescriptionStatus;
  dispensing_type?: DispensingType;
  is_discharge_medication?: boolean;
  search?: string;
  prescriber?: number;
  date_from?: string;
  date_to?: string;
  ordering?: string;
}

/**
 * Dispensing list params
 */
export interface DispensingListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  drug?: number;
  dispensed_by?: number;
  status?: DispensingStatus;
  date_from?: string;
  date_to?: string;
  ordering?: string;
}

/**
 * Drug create/update data
 *
 * Supports both single category (backward compatible) and multiple categories:
 * - `category`: Single category (will be converted to array)
 * - `categories`: Array of categories (preferred)
 */
export interface DrugCreateData {
  code: string;
  generic_name: string;
  brand_names?: string[];
  /**
   * Single category (backward compatible) - converted to categories array
   */
  category?: DrugCategory;
  /**
   * Multiple categories (preferred)
   */
  categories?: DrugCategory[];
  form: DrugForm;
  strength: string;
  unit: string;
  schedule?: DrugSchedule;
  requires_prescription?: boolean;
  is_controlled?: boolean;
  is_narcotic?: boolean;
  keml_code?: string;
  is_essential?: boolean;
  nhif_code?: string;
  default_reorder_level?: number;
  default_reorder_quantity?: number;
  shelf_life_months?: number;
  storage_requirements?: string;
  reference_price?: number;
}

/**
 * Stock batch create data (receiving stock)
 *
 * Creates a NEW batch for a drug. Does NOT modify existing batches.
 * The backend auto-sets: quantity_available = quantity_received
 *
 * @example
 * // Receiving 500 units of Paracetamol (drug id: 123)
 * {
 *   drug: 123,
 *   batch_number: "BATCH-2026-001",
 *   quantity_received: 500,  // quantity_available auto-set to 500
 *   expiry_date: "2027-01-29",
 *   received_date: "2026-01-29",
 *   cost_price: 3.00,
 *   selling_price: 5.00,
 * }
 */
export interface StockBatchCreateData {
  drug: number;
  batch_number: string;
  barcode?: string;
  quantity_received: number;
  manufacture_date?: string;
  expiry_date: string;
  received_date: string;
  cost_price: number;
  selling_price: number;
  supplier?: string;
  purchase_order?: string;
  location?: string;
}

/**
 * Prescription create data
 */
export interface PrescriptionCreateData {
  patient: number;
  encounter?: number;
  admission?: number;
  valid_until?: string;  // ISO date string, defaults to 30 days from now
  dispensing_type?: DispensingType;
  is_discharge_medication?: boolean;
  clinical_notes?: string;
  items: PrescriptionItemCreateData[];
}

/**
 * Prescription item create data
 */
export interface PrescriptionItemCreateData {
  drug: number;
  quantity_prescribed: number;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string;
  instructions?: string;
  is_substitutable?: boolean;
}

/**
 * Dispensing create data
 */
export interface DispensingCreateData {
  prescription_item?: number;
  drug: number;
  stock_batch: number;
  quantity: number;
  patient?: number;
  notes?: string;
  is_direct_sale?: boolean;
}

/**
 * Stock adjustment create data
 */
export interface StockAdjustmentCreateData {
  stock_batch: number;
  adjustment_type: AdjustmentType;
  quantity: number;
  reason: string;
  reference_number?: string;
}

// ============ Report Types ============

/**
 * Stock batch details for stock summary
 */
export interface StockSummaryBatch {
  batch_number: string;
  quantity_available: number;
  expiry_date: string;
  days_to_expiry: number;
}

/**
 * Stock summary report item
 */
export interface StockSummaryItem {
  drug_id: number;
  drug_name: string;
  total_quantity: number;
  reorder_level: number;
  is_below_reorder: boolean;
  batches: StockSummaryBatch[];
}

/**
 * Expiry report item
 */
export interface ExpiryReportItem {
  batch_id: number;
  drug_name: string;
  drug_code: string;
  batch_number: string;
  quantity_available: number;
  expiry_date: string;
  days_to_expiry: number;
  status: 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'OK';
  value: number;
}

/**
 * Dispensing report record
 */
export interface DispensingReportRecord {
  dispensing_id: number;
  drug_name: string;
  quantity_dispensed: number;
  dispensed_date: string;
  patient_name: string;
  dispensed_by: string;
  batch_number: string;
  total_cost: string;
}

/**
 * Dispensing report summary
 */
export interface DispensingReportSummary {
  results: DispensingReportRecord[];
}

// ============ HPT Registry Types ============

/**
 * HPT search result from DHA Health Products and Technologies Registry.
 * Returned by GET /api/pharmacy/drugs/hpt-search/?q={query}
 */
export interface HptSearchResult {
  product_id: number;
  brand_name: string;
  generic_name: string;
  brand_display_name: string;
  generic_display_name: string;
  generic_concept_id: number;
  strength_amount: string;
  strength_unit: string;
  route_description: string;
  form_description: string;
  ppb_registration_code: string;
  knhts_concept_id: string;
}

/**
 * Data to map a local drug to an HPT registry entry.
 * Sent to POST /api/pharmacy/drugs/{id}/map-hpt/
 */
export interface HptMapData {
  hpt_code: string;
  hpt_product_id: number;
  ppb_code?: string;
}
