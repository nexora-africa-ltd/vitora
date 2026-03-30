import { z } from 'zod';

export const ProcedureCatalogListSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  body_system: z.string(),
  risk_level: z.string(),
  base_fee: z.union([z.number(), z.string()]).nullable(),
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

export const ProcedureOrderListSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  procedure: z.number(),
  procedure_name: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  status: z.string(),
  priority: z.string(),
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
