/**
 * HL7 v2 messaging Zod schemas.
 *
 * Validates responses from the HL7 endpoint and message APIs.
 */

import { z } from 'zod';

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

export const HL7EndpointTypeSchema = z.enum(['LIS', 'RIS', 'PAS', 'PHARMACY', 'OTHER']);
export const HL7DirectionSchema = z.enum(['IN', 'OUT']);
export const HL7StatusSchema = z.enum(['PENDING', 'SENDING', 'SENT', 'ACK', 'FAILED', 'DEAD']);

// =============================================================================
// ENDPOINT SCHEMAS
// =============================================================================

export const HL7EndpointSchema = z.object({
  id: z.number(),
  name: z.string(),
  endpoint_type: HL7EndpointTypeSchema,
  mllp_host: z.string(),
  mllp_port: z.number(),
  receiving_application: z.string(),
  receiving_facility: z.string(),
  sending_application: z.string(),
  sending_facility: z.string(),
  lis_code_system: z.string(),
  is_active: z.boolean(),
  use_ssl: z.boolean(),
  timeout: z.number(),
  max_retries: z.number(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
});

export const HL7EndpointListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  endpoint_type: HL7EndpointTypeSchema,
  mllp_host: z.string(),
  mllp_port: z.number(),
  receiving_facility: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  message_count: z.number(),
});

export const PaginatedHL7EndpointSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(HL7EndpointListItemSchema),
});

export const HL7EndpointTestResultSchema = z.object({
  success: z.boolean(),
  latency_ms: z.number(),
  error: z.string(),
});

// =============================================================================
// MESSAGE SCHEMAS
// =============================================================================

export const HL7MessageSchema = z.object({
  id: z.number(),
  message_type: z.string(),
  direction: HL7DirectionSchema,
  raw_message: z.string(),
  message_control_id: z.string(),
  status: HL7StatusSchema,
  retry_count: z.number(),
  max_retries: z.number(),
  last_error: z.string(),
  ack_code: z.string(),
  resource_type: z.string(),
  resource_id: z.number().nullable(),
  destination_host: z.string(),
  destination_port: z.number().nullable(),
  next_retry_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  is_retryable: z.boolean(),
});

export const HL7MessageListItemSchema = z.object({
  id: z.number(),
  message_type: z.string(),
  direction: HL7DirectionSchema,
  message_control_id: z.string(),
  status: HL7StatusSchema,
  retry_count: z.number(),
  last_error: z.string(),
  ack_code: z.string(),
  resource_type: z.string(),
  resource_id: z.number().nullable(),
  sent_at: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
  created_at: z.string(),
  is_retryable: z.boolean(),
});

// =============================================================================
// PAGINATED & STATS SCHEMAS
// =============================================================================

export const PaginatedHL7MessageSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(HL7MessageListItemSchema),
});

export const HL7MessageStatsSchema = z.object({
  total: z.number(),
  pending: z.number(),
  sent: z.number(),
  acknowledged: z.number(),
  failed: z.number(),
  dead_letter: z.number(),
});
