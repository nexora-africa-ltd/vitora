/**
 * Drug Formulary Zod validation schemas.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────
// SmPC
// ──────────────────────────────────────────────────────────────────────

export const SmpcSummarySchema = z.object({
  id: z.string(),
  product_name: z.string(),
  title: z.string().optional(),
  filename: z.string().optional(),
  source_url: z.string().optional(),
  pharmaceutical_form: z.string().optional(),
  active_ingredients: z.array(z.string()),
  indications: z.string().optional(),
  posology: z.string().optional(),
  contraindications: z.string().optional(),
  warnings: z.string().optional(),
  interactions: z.string().optional(),
  pregnancy_lactation: z.string().optional(),
  adverse_effects: z.string().optional(),
  overdose: z.string().optional(),
  storage: z.string().optional(),
  shelf_life: z.string().optional(),
});

// ──────────────────────────────────────────────────────────────────────
// PPB Products
// ──────────────────────────────────────────────────────────────────────

export const PpbProductSchema = z.object({
  registration_no: z.string(),
  trade_name: z.string(),
  active_ingredient: z.string(),
  dosage_form: z.string(),
  manufacturer: z.string(),
  country_of_origin: z.string(),
  date_registered: z.string(),
  date_expiry: z.string(),
  is_valid: z.boolean(),
  category: z.string(),
  keml_reference: z
    .object({
      code: z.string(),
      name: z.string(),
      level_of_use: z.number(),
    })
    .nullable()
    .optional(),
});

// ──────────────────────────────────────────────────────────────────────
// KEML
// ──────────────────────────────────────────────────────────────────────

export const KemlDoseFormSchema = z.object({
  form: z.string(),
  strength: z.string().optional(),
  strengths: z.array(z.string()).optional(),
});

export const KemlEntrySchema = z.object({
  code: z.string(),
  name: z.string(),
  dose_forms: z.array(KemlDoseFormSchema),
  subcategory: z.string(),
  sub_subcategory: z.string(),
  level_of_use: z.number(),
  level_description: z.string(),
  footnotes: z.string(),
});

// ──────────────────────────────────────────────────────────────────────
// Search Response
// ──────────────────────────────────────────────────────────────────────

export const FormularySearchResponseSchema = z.object({
  query: z.string(),
  total_results: z.number(),
  smpc: z.array(SmpcSummarySchema),
  ppb_products: z.array(PpbProductSchema),
  keml: z.array(KemlEntrySchema),
  error: z.string().optional(),
});

// ──────────────────────────────────────────────────────────────────────
// Stats
// ──────────────────────────────────────────────────────────────────────

export const FormularyStatsSchema = z.object({
  loaded: z.boolean(),
  smpc_count: z.number(),
  ppb_products_count: z.number(),
  keml_count: z.number(),
});
