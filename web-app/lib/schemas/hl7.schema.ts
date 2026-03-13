/**
 * HL7 v2 messaging Zod schemas.
 *
 * Validates responses from the HL7 message monitoring API.
 */

import { z } from 'zod';

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

export const HL7DirectionSchema = z.enum(['IN', 'OUT']);
export const HL7StatusSchema = z.enum(['PENDING', 'SENDING', 'SENT', 'ACK', 'FAILED', 'DEAD']);

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
