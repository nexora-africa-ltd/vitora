import { z } from 'zod';

const ProcedureOrderStatusSchema = z.enum([
  'ORDERED',
  'CONSENT_PENDING',
  'SCHEDULED',
  'READY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

const ProcedurePrioritySchema = z.enum([
  'EMERGENCY',
  'URGENT',
  'ROUTINE',
  'ELECTIVE',
]);

const NumericNullableSchema = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((value) => {
    if (value == null || value === '') {
      return null;
    }

    return typeof value === 'string' ? Number(value) : value;
  });

export const ProcedureCatalogListSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  tibabot_procedure_key: z.string().optional().default(''),
  category: z.string(),
  body_system: z.string(),
  risk_level: z.string(),
  base_fee: NumericNullableSchema,
  typical_duration_minutes: z.number(),
  consent_required: z.boolean(),
  is_active: z.boolean(),
  default_clinics: z.array(z.number()).optional().default([]),
  default_clinics_detail: z.array(z.object({
    id: z.number(),
    name: z.string(),
    clinic_type: z.string(),
  })).optional().default([]),
});

export const ProcedureCatalogDetailSchema = ProcedureCatalogListSchema.extend({
  description: z.string().default(''),
  ichi_code: z.string().default(''),
  cpt_code: z.string().default(''),
  icd10_pcs_code: z.string().default(''),
  consent_template: z.string().default(''),
  guardian_consent_required: z.boolean().default(false),
  witness_required: z.boolean().default(false),
  requires_anesthesia: z.boolean().default(false),
  anesthesia_type: z.string().default(''),
  requires_fasting: z.boolean().default(false),
  pre_procedure_instructions: z.string().default(''),
  post_procedure_instructions: z.string().default(''),
  required_qualifications: z.string().default(''),
  minimum_staff_count: z.number().default(0),
  sha_tariff_code: z.string().default(''),
  sha_package_code: z.string().default(''),
  requires_follow_up: z.boolean().default(false),
  default_follow_up_days: z.number().default(0),
  follow_up_clinic: z.number().nullable(),
  billing_service: z.number().nullable(),
  billing_price: NumericNullableSchema,
  billing_service_name: z.string().nullable(),
  organization: z.number().nullable(),
  facility: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ProcedureOrderListSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  procedure: z.number(),
  procedure_name: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  status: ProcedureOrderStatusSchema,
  priority: ProcedurePrioritySchema,
  scheduled_date: z.string().nullable(),
  scheduled_time: z.string().nullable(),
  scheduled_clinic: z.number().nullable(),
  scheduled_clinic_name: z.string().nullable(),
  is_overdue: z.boolean(),
  ordered_at: z.string(),
});

export const ProcedureDashboardSchema = z.object({
  scheduled_today: z.number(),
  pending_consent: z.number(),
  in_progress: z.number(),
  completed_today: z.number(),
});

export const PaginatedProcedureCatalogSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ProcedureCatalogListSchema),
});

export const PaginatedProcedureOrderSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ProcedureOrderListSchema),
});
