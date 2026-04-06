/**
 * Scheduling Zod Schemas
 */

import { z } from 'zod';

function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });
}

export const ResourceTypeSchema = z.enum(['PERSON', 'PLACE', 'ASSET']);

export const ResourceListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  resource_type: ResourceTypeSchema,
  code: z.string(),
  is_active: z.boolean(),
});

export const ResourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  resource_type: ResourceTypeSchema,
  code: z.string(),
  is_active: z.boolean(),
  capacity: z.number(),
  staff_profile: z.number().nullable(),
  staff_profile_name: z.string().nullable(),
  metadata: z.record(z.unknown()),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedResourceListSchema = createPaginatedSchema(ResourceListItemSchema);
