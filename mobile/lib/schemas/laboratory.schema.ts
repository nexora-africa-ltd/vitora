import { z } from 'zod';

const numberLike = z.union([z.number(), z.string()]).pipe(z.coerce.number());

const paginated = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

export const LabTestSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  short_name: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  specimen_type: z.string().optional().nullable(),
  cost: numberLike,
  sha_claimable: z.boolean(),
  available_in_house: z.boolean(),
  is_active: z.boolean(),
});

export const LabResultSchema = z.object({
  id: z.number(),
  order_item: z.number(),
  test_name: z.string().optional().nullable(),
  test_code: z.string().optional().nullable(),
  numeric_value: numberLike.optional().nullable(),
  text_value: z.string().optional().nullable(),
  option_value: z.string().optional().nullable(),
  formatted_value: z.string().optional().nullable(),
  result_unit: z.string().optional().nullable(),
  reference_low: numberLike.optional().nullable(),
  reference_high: numberLike.optional().nullable(),
  reference_range_text: z.string().optional().nullable(),
  result_flag: z.string().optional().nullable(),
  interpretation: z.string().optional().nullable(),
  is_critical_result: z.boolean(),
  method: z.string().optional().nullable(),
  equipment: z.string().optional().nullable(),
  verification_status: z.string().optional().nullable(),
  verified_by: z.number().optional().nullable(),
  verified_by_name: z.string().optional().nullable(),
  verified_at: z.string().optional().nullable(),
  entered_by: z.number().optional().nullable(),
  entered_by_name: z.string().optional().nullable(),
  entered_at: z.string().optional().nullable(),
  is_amended: z.boolean(),
  amendment_reason: z.string().optional().nullable(),
  original_value: z.string().optional().nullable(),
  is_external_result: z.boolean(),
  external_result_attachment: z.string().optional().nullable(),
  external_result_date: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  validation_summary: z.unknown().optional().nullable(),
});

export const LabOrderItemSchema = z.object({
  id: z.number(),
  lab_order: z.number(),
  test: z.number(),
  test_name: z.string().optional().nullable(),
  test_code: z.string().optional().nullable(),
  status: z.string(),
  unit_cost: numberLike,
  special_instructions: z.string().optional().nullable(),
  has_result: z.boolean(),
  result: LabResultSchema.optional().nullable(),
  created_at: z.string(),
});

export const LabOrderSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient: z.number(),
  patient_name: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  encounter: z.number().optional().nullable(),
  admission: z.number().optional().nullable(),
  ordered_by: z.number().optional().nullable(),
  ordered_by_name: z.string().optional().nullable(),
  order_type: z.string(),
  external_lab: z.string().optional().nullable(),
  priority: z.string(),
  clinical_notes: z.string().optional().nullable(),
  status: z.string(),
  specimen_collected: z.boolean(),
  specimen_collected_at: z.string().optional().nullable(),
  specimen_collected_by: z.number().optional().nullable(),
  total_cost: numberLike,
  items: z.array(LabOrderItemSchema),
  ordered_at: z.string(),
  completed_at: z.string().optional().nullable(),
  cancellation_reason: z.string().optional().nullable(),
  cancelled_by: z.number().optional().nullable(),
  cancelled_at: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const LabResultArraySchema = z.array(LabResultSchema);
export const PaginatedLabTestSchema = paginated(LabTestSchema);
export const PaginatedLabOrderSchema = paginated(LabOrderSchema);
export const PaginatedLabResultSchema = paginated(LabResultSchema);
