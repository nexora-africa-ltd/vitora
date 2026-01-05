/**
 * Clinical Template Types
 * Types for clinical assessment templates
 */

export type TemplateType = 'encounter' | 'note' | 'assessment' | 'procedure';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multiselect';

export type AutoGenerateType = 'prc' | 'case' | 'ob';

export interface TemplateField {
  name: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  placeholder?: string;
  help_text?: string;
  auto_generate?: AutoGenerateType;
}

export interface TemplateSection {
  id: number;
  name: string;
  order: number;
  is_required: boolean;
  fields: TemplateField[];
}

export interface TemplateContent {
  title: string;
  version: string;
  sections: {
    name: string;
    order: number;
    fields: TemplateField[];
  }[];
}

export interface ClinicalTemplate {
  id: number;
  name: string;
  template_type: TemplateType;
  specialty: string;
  description: string;
  content: TemplateContent;
  is_system: boolean;
  is_active: boolean;
  usage_count: number;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
  sections: TemplateSection[];
}

export interface ClinicalTemplateListParams {
  page?: number;
  page_size?: number;
  template_type?: TemplateType;
  specialty?: string;
  is_system?: boolean;
  is_active?: boolean;
  search?: string;
}

export interface ClinicalTemplateCreateData {
  name: string;
  template_type: TemplateType;
  specialty?: string;
  description?: string;
  content: TemplateContent;
  is_active?: boolean;
}

/**
 * Template data collected during an encounter.
 * Maps section names to field values.
 */
export interface TemplateData {
  template_id: number;
  template_name: string;
  collected_at: string;
  sections: Record<string, Record<string, unknown>>;
}

/**
 * Suggested templates based on encounter context
 */
export interface TemplateSuggestion {
  template: ClinicalTemplate;
  relevance_score: number;
  reason: string;
}
