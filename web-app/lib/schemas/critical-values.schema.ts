/**
 * Zod schemas for Critical Value Notification API responses.
 * Phase L6.2
 */

import { z } from 'zod';

const coerceDecimal = z.preprocess(
  (val) => (val === null || val === undefined ? null : Number(val)),
  z.number().nullable()
);

// =============================================================================
// Enums
// =============================================================================

export const CriticalNotificationStatusSchema = z.enum([
  'PENDING', 'NOTIFIED', 'READ_BACK',
  'ACKNOWLEDGED', 'ESCALATED', 'FAILED',
]);

export const CriticalNotificationSeveritySchema = z.enum(['CRITICAL', 'PANIC']);

export const CriticalNotificationMethodSchema = z.enum([
  'PHONE_CALL', 'IN_PERSON', 'SECURE_MESSAGE', 'PAGER',
]);

// =============================================================================
// Critical Value Range
// =============================================================================

export const CriticalValueRangeSchema = z.object({
  id: z.number(),
  test: z.number(),
  test_name: z.string(),
  test_code: z.string(),
  critical_low: coerceDecimal,
  critical_high: coerceDecimal,
  panic_low: coerceDecimal,
  panic_high: coerceDecimal,
  unit: z.string().optional(),
  notification_deadline_minutes: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedCriticalValueRangeSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CriticalValueRangeSchema),
});

// =============================================================================
// Critical Value Notification
// =============================================================================

export const CriticalValueNotificationSchema = z.object({
  id: z.number(),
  result: z.number(),
  critical_range: z.number().nullable(),
  status: CriticalNotificationStatusSchema,
  severity: CriticalNotificationSeveritySchema,
  test_name: z.string(),
  critical_value: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  notification_method: CriticalNotificationMethodSchema.nullable(),
  notified_to: z.number().nullable(),
  notified_to_name: z.string(),
  notified_by: z.number().nullable(),
  notified_by_name: z.string(),
  detected_at: z.string(),
  notified_at: z.string().nullable(),
  read_back_at: z.string().nullable(),
  read_back_value: z.string(),
  read_back_verified: z.boolean(),
  acknowledged_at: z.string().nullable(),
  escalated_to: z.number().nullable(),
  escalation_notes: z.string(),
  is_overdue: z.boolean(),
  minutes_elapsed: coerceDecimal,
  notification_time_minutes: coerceDecimal,
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedCriticalValueNotificationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CriticalValueNotificationSchema),
});

// =============================================================================
// Compliance Stats
// =============================================================================

export const CriticalValueComplianceSchema = z.object({
  total_notifications: z.number(),
  notified_within_deadline: z.number(),
  compliance_rate: z.number(),
  average_notification_minutes: z.number(),
  overdue_count: z.number(),
  acknowledged_count: z.number(),
  pending_count: z.number(),
  read_back_verified_count: z.number(),
  read_back_rate: z.number(),
});
