/**
 * Zod schemas for Core API response validation (Locations, Notifications, etc.)
 *
 * Implements validation for:
 * - Kenya location hierarchy (Counties, SubCounties, Wards)
 * - Notifications
 * - Clinical templates
 *
 * See lib/api/locations.ts and lib/api/notifications.ts for usage.
 */
import { z } from 'zod';

// =============================================================================
// LOCATION SCHEMAS (Kenya hierarchy)
// =============================================================================

export const CountySchema = z.object({
  id: z.number(),
  code: z.number(),
  name: z.string(),
});

export type CountySchemaType = z.infer<typeof CountySchema>;

export const SubCountySchema = z.object({
  id: z.number(),
  county: z.number(),
  name: z.string(),
});

export type SubCountySchemaType = z.infer<typeof SubCountySchema>;

// Named LocationWardSchema to avoid collision with inpatient WardSchema
export const LocationWardSchema = z.object({
  id: z.number(),
  sub_county: z.number(),
  name: z.string(),
});

export type LocationWardSchemaType = z.infer<typeof LocationWardSchema>;

// =============================================================================
// NOTIFICATION SCHEMAS
// =============================================================================

export const NotificationPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export const NotificationTypeSchema = z.union([
  z.enum([
    'lab_result',
    'appointment',
    'prescription',
    'low_stock',
    'critical_vital',
    'system',
  ]),
  z.string(), // Allow other string types
]);

export const NotificationSchema = z.object({
  id: z.number(),
  notification_type: NotificationTypeSchema,
  priority: NotificationPrioritySchema,
  title: z.string(),
  message: z.string(),
  related_model: z.string().optional(),
  related_id: z.number().optional(),
  action_url: z.string().optional(),
  is_read: z.boolean(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export type NotificationSchemaType = z.infer<typeof NotificationSchema>;

export const NotificationListResponseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(NotificationSchema),
  server_time: z.string(),
});

export type NotificationListResponseSchemaType = z.infer<typeof NotificationListResponseSchema>;

export const UnreadCountResponseSchema = z.object({
  unread_count: z.number(),
});

export type UnreadCountResponseSchemaType = z.infer<typeof UnreadCountResponseSchema>;

export const MarkReadResponseSchema = z.object({
  status: z.string(),
});

export type MarkReadResponseSchemaType = z.infer<typeof MarkReadResponseSchema>;

export const MarkAllReadResponseSchema = z.object({
  marked_count: z.number(),
});

export type MarkAllReadResponseSchemaType = z.infer<typeof MarkAllReadResponseSchema>;

// =============================================================================
// CLINICAL TEMPLATE SCHEMAS
// =============================================================================

export const TemplateTypeSchema = z.enum(['encounter', 'note', 'assessment', 'procedure']);

export const FieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
]);

export const AutoGenerateTypeSchema = z.enum(['prc', 'case', 'ob']);

export const TemplateFieldSchema = z.object({
  name: z.string(),
  type: FieldTypeSchema,
  label: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  placeholder: z.string().optional(),
  help_text: z.string().optional(),
  auto_generate: AutoGenerateTypeSchema.optional(),
});

export const TemplateSectionSchema = z.object({
  id: z.number(),
  name: z.string(),
  order: z.number(),
  is_required: z.boolean(),
  fields: z.array(TemplateFieldSchema),
});

export const TemplateContentSectionSchema = z.object({
  name: z.string(),
  order: z.number(),
  fields: z.array(TemplateFieldSchema),
});

export const TemplateContentSchema = z.object({
  title: z.string(),
  version: z.string(),
  sections: z.array(TemplateContentSectionSchema),
});

export const ClinicalTemplateSchema = z.object({
  id: z.number(),
  name: z.string(),
  template_type: TemplateTypeSchema,
  specialty: z.string(),
  description: z.string(),
  content: TemplateContentSchema,
  is_system: z.boolean(),
  is_active: z.boolean(),
  usage_count: z.number(),
  created_by: z.number().nullable(),
  created_by_username: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  sections: z.array(TemplateSectionSchema),
});

export type ClinicalTemplateSchemaType = z.infer<typeof ClinicalTemplateSchema>;

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedCountySchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CountySchema),
});

export const PaginatedNotificationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(NotificationSchema),
});

export const PaginatedClinicalTemplateSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ClinicalTemplateSchema),
});

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const CountyArraySchema = z.array(CountySchema);
export const SubCountyArraySchema = z.array(SubCountySchema);
export const LocationWardArraySchema = z.array(LocationWardSchema);

// Legacy aliases for backwards compatibility
export const SubCountyArrayResponseSchema = z.object({
  results: SubCountyArraySchema,
});

export const LocationWardArrayResponseSchema = z.object({
  results: LocationWardArraySchema,
});

// =============================================================================
// CASE NUMBER GENERATION SCHEMAS
// =============================================================================

export const PRCNumberResponseSchema = z.object({
  prc_number: z.string(),
});

export type PRCNumberResponseSchemaType = z.infer<typeof PRCNumberResponseSchema>;

export const CaseNumberResponseSchema = z.object({
  case_number: z.string(),
});

export type CaseNumberResponseSchemaType = z.infer<typeof CaseNumberResponseSchema>;
