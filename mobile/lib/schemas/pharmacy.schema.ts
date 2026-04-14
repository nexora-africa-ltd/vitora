import { z } from 'zod';

const numberLike = z.union([z.number(), z.string()]).pipe(z.coerce.number());

const paginated = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

export const DrugProductSchema = z.object({
  id: z.number(),
  code: z.string(),
  generic_name: z.string(),
  brand_names: z.string().optional().nullable(),
  strength: z.string().optional().nullable(),
  form: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  categories: z.array(z.string()).default([]),
  unit: z.string().optional().nullable(),
  schedule: z.string().optional().nullable(),
  is_essential: z.boolean(),
  keml_code: z.string().optional().nullable(),
  nhif_code: z.string().optional().nullable(),
  hpt_code: z.string().optional().nullable(),
  hpt_product_id: z.number().optional().nullable(),
  hpt_last_synced: z.string().optional().nullable(),
  ppb_code: z.string().optional().nullable(),
  requires_prescription: z.boolean(),
  is_controlled: z.boolean(),
  is_narcotic: z.boolean(),
  default_reorder_level: z.number().optional().nullable(),
  default_reorder_quantity: z.number().optional().nullable(),
  shelf_life_months: z.number().optional().nullable(),
  storage_requirements: z.string().optional().nullable(),
  reference_price: numberLike.optional().nullable(),
  is_active: z.boolean(),
  display_name: z.string(),
  current_stock: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const StockBatchSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string().optional().nullable(),
  batch_number: z.string(),
  quantity_received: z.number(),
  quantity_available: z.number(),
  quantity_dispensed: z.number(),
  quantity_damaged: z.number(),
  quantity_expired: z.number(),
  expiry_date: z.string(),
  days_until_expiry: z.number().optional().nullable(),
  days_to_expiry: z.number().optional().nullable(),
  is_expired_status: z.boolean().optional(),
  is_expired: z.boolean().optional(),
  is_low_stock_status: z.boolean().optional(),
  is_low_stock: z.boolean().optional(),
  status: z.string(),
  cost_price: numberLike.optional().nullable(),
  selling_price: numberLike.optional().nullable(),
  supplier: z.string().optional().nullable(),
  purchase_order: z.string().optional().nullable(),
  received_date: z.string().optional().nullable(),
  received_by: z.number().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PrescriptionItemSchema = z.object({
  id: z.number(),
  prescription: z.number(),
  drug: z.number(),
  drug_name: z.string().optional().nullable(),
  drug_code: z.string().optional().nullable(),
  quantity: z.number(),
  quantity_prescribed: z.number(),
  dosage: z.string(),
  frequency: z.string(),
  duration: z.string(),
  route: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  is_substitutable: z.boolean(),
  quantity_dispensed: z.number(),
  remaining_qty: z.number(),
  remaining_quantity: z.number(),
  is_cancelled: z.boolean(),
  cancellation_reason: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PrescriptionSchema = z.object({
  id: z.number(),
  prescription_number: z.string(),
  encounter: z.number().optional().nullable(),
  admission: z.number().optional().nullable(),
  patient: z.number(),
  patient_name: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  prescribed_by: z.number().optional().nullable(),
  prescriber: z.number().optional().nullable(),
  prescriber_name: z.string().optional().nullable(),
  prescribed_at: z.string().optional().nullable(),
  prescribed_date: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  status: z.string(),
  clinical_notes: z.string().optional().nullable(),
  is_valid: z.boolean(),
  is_valid_prescription: z.boolean(),
  is_fully_dispensed: z.boolean(),
  is_fully_dispensed_status: z.boolean(),
  items: z.array(PrescriptionItemSchema),
  verification_url: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const DispensationSchema = z.object({
  id: z.number(),
  prescription_item: z.number().optional().nullable(),
  patient: z.number(),
  patient_name: z.string().optional().nullable(),
  drug: z.number(),
  drug_name: z.string().optional().nullable(),
  batch: z.number().optional().nullable(),
  batch_number: z.string().optional().nullable(),
  quantity_dispensed: z.number(),
  quantity_returned: z.number(),
  unit_price: numberLike.optional().nullable(),
  total_price: numberLike.optional().nullable(),
  discount: numberLike.optional().nullable(),
  instructions_given: z.string().optional().nullable(),
  patient_counseled: z.boolean(),
  dispensed_by: z.number().optional().nullable(),
  dispensed_by_name: z.string().optional().nullable(),
  dispensed_at: z.string(),
  verified_by: z.number().optional().nullable(),
  verified_by_name: z.string().optional().nullable(),
  verified_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_at: z.string(),
});

export const HptSearchResultSchema = z.object({
  product_id: z.number(),
  brand_name: z.string(),
  generic_name: z.string(),
  brand_display_name: z.string(),
  generic_display_name: z.string(),
  generic_concept_id: z.number(),
  strength_amount: z.string(),
  strength_unit: z.string(),
  route_description: z.string(),
  form_description: z.string(),
  ppb_registration_code: z.string(),
  knhts_concept_id: z.string(),
});

export const HptSearchResponseSchema = z.object({
  count: z.number(),
  results: z.array(HptSearchResultSchema),
});

export const StockBatchArraySchema = z.array(StockBatchSchema);
export const DispensationArraySchema = z.array(DispensationSchema);
export const PaginatedDrugProductSchema = paginated(DrugProductSchema);
export const PaginatedPrescriptionSchema = paginated(PrescriptionSchema);
export const PaginatedDispensationSchema = paginated(DispensationSchema);
