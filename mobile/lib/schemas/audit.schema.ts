import { z } from 'zod';

export const AuditLogEntrySchema = z.object({
  action: z.string(),
  details: z.record(z.string(), z.unknown()),
  id: z.number(),
  ip_address: z.string().nullable(),
  patient_id: z.number().nullable(),
  resource_id: z.number().nullable(),
  resource_type: z.string(),
  timestamp: z.string(),
  user: z.number().nullable(),
  user_agent: z.string().nullable(),
  user_name: z.string(),
  username: z.string(),
});

export const PaginatedAuditLogSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(AuditLogEntrySchema),
});