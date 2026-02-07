/**
 * Zod schemas for Frontend Events API response validation
 *
 * Validates responses from /api/core/events/ endpoints for:
 * - Event logging
 * - Batch event logging
 * - Event retrieval
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const FrontendEventTypeSchema = z.enum([
  'page_view',
  'modal_open',
  'tab_switch',
  'encounter_open',
  'encounter_save',
  'encounter_finalize',
  'diagnosis_add',
  'diagnosis_update',
  'diagnosis_remove',
  'lab_order_create',
  'lab_result_view',
  'prescription_create',
  'prescription_dispense',
  'patient_view',
  'patient_search',
  'form_start',
  'form_save',
  'form_submit',
  'form_error',
  'offline_queue',
  'offline_sync',
  'custom',
]);

export type FrontendEventTypeSchemaType = z.infer<typeof FrontendEventTypeSchema>;

export const DeviceTypeSchema = z.enum(['web', 'desktop', 'mobile']);

export type DeviceTypeSchemaType = z.infer<typeof DeviceTypeSchema>;

export const ResourceTypeSchema = z.enum([
  'Patient',
  'Encounter',
  'Diagnosis',
  'LabOrder',
  'LabResult',
  'Prescription',
  'Invoice',
  'Payment',
  '',
]);

export type ResourceTypeSchemaType = z.infer<typeof ResourceTypeSchema>;

// =============================================================================
// RESPONSE SCHEMAS
// =============================================================================

export const FrontendEventSchema = z.object({
  id: z.number().optional(),
  event_type: FrontendEventTypeSchema,
  resource_type: ResourceTypeSchema,
  resource_id: z.number().nullable().optional(),
  client_timestamp: z.string(),
  server_timestamp: z.string().optional(),
  session_id: z.string(),
  device_type: DeviceTypeSchema,
  details: z.record(z.unknown()),
  was_offline: z.boolean(),
});

export type FrontendEventSchemaType = z.infer<typeof FrontendEventSchema>;

export const LogEventResponseSchema = FrontendEventSchema.extend({
  id: z.number(),
  server_timestamp: z.string(),
  username: z.string(),
});

export type LogEventResponseSchemaType = z.infer<typeof LogEventResponseSchema>;

export const BatchLogResponseSchema = z.object({
  message: z.string(),
  count: z.number(),
});

export type BatchLogResponseSchemaType = z.infer<typeof BatchLogResponseSchema>;

export const PaginatedEventsResponseSchema = z.object({
  count: z.number(),
  next: z.string().nullable().optional(),
  previous: z.string().nullable().optional(),
  results: z.array(LogEventResponseSchema),
});

export type PaginatedEventsResponseSchemaType = z.infer<typeof PaginatedEventsResponseSchema>;
