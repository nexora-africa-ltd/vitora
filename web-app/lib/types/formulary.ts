/**
 * Drug Formulary types.
 *
 * Types for TibaBot's Drug Formulary API responses:
 * - SmPC (Summary of Product Characteristics)
 * - PPB Products (Pharmacy & Poisons Board register)
 * - KEML (Kenya Essential Medicines List)
 */

// ──────────────────────────────────────────────────────────────────────
// SmPC (Summary of Product Characteristics)
// ──────────────────────────────────────────────────────────────────────

export interface SmpcSummary {
  id: string;
  product_name: string;
  title?: string;
  filename?: string;
  source_url?: string;
  pharmaceutical_form?: string;
  active_ingredients: string[];
  indications?: string;
  posology?: string;
  contraindications?: string;
  warnings?: string;
  interactions?: string;
  pregnancy_lactation?: string;
  adverse_effects?: string;
  overdose?: string;
  storage?: string;
  shelf_life?: string;
}

// ──────────────────────────────────────────────────────────────────────
// PPB Products (Pharmacy & Poisons Board)
// ──────────────────────────────────────────────────────────────────────

export interface PpbProduct {
  registration_no: string;
  trade_name: string;
  active_ingredient: string;
  dosage_form: string;
  manufacturer: string;
  country_of_origin: string;
  date_registered: string;
  date_expiry: string;
  is_valid: boolean;
  category: string;
  keml_reference?: {
    code: string;
    name: string;
    level_of_use: number;
  } | null;
}

// ──────────────────────────────────────────────────────────────────────
// KEML (Kenya Essential Medicines List)
// ──────────────────────────────────────────────────────────────────────

export interface KemlDoseForm {
  form: string;
  strength?: string;
  strengths?: string[];
}

export interface KemlEntry {
  code: string;
  name: string;
  dose_forms: KemlDoseForm[];
  subcategory: string;
  sub_subcategory: string;
  level_of_use: number;
  level_description: string;
  footnotes: string;
}

// ──────────────────────────────────────────────────────────────────────
// Search Response
// ──────────────────────────────────────────────────────────────────────

export interface FormularySearchResponse {
  query: string;
  total_results: number;
  smpc: SmpcSummary[];
  ppb_products: PpbProduct[];
  keml: KemlEntry[];
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────
// Stats
// ──────────────────────────────────────────────────────────────────────

export interface FormularyStats {
  loaded: boolean;
  smpc_count: number;
  ppb_products_count: number;
  keml_count: number;
}
