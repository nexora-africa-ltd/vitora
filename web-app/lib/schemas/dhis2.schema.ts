/**
 * Zod schemas for DHIS2 Configuration API responses.
 */

import { z } from 'zod';

export const DHIS2ConfigListItemSchema = z.object({
  id: z.number(),
  organization: z.number(),
  organization_name: z.string().nullable(),
  name: z.string(),
  base_url: z.string(),
  username: z.string(),
  environment: z.enum(['local', 'staging', 'production']),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const DHIS2ConfigDetailSchema = DHIS2ConfigListItemSchema;

export const PaginatedDHIS2ConfigListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DHIS2ConfigListItemSchema),
});

export const DHIS2ConnectionTestResultSchema = z.object({
  status: z.enum(['ok', 'error']),
  dhis2_user: z.string().optional(),
  server_version: z.string().optional(),
  detail: z.string().optional(),
});
