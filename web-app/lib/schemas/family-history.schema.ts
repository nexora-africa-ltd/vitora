import { z } from 'zod';

export const FamilyRelationshipSchema = z.enum([
  'FATHER',
  'MOTHER',
  'SIBLING',
  'GRANDPARENT',
  'CHILD',
  'UNCLE_AUNT',
  'COUSIN',
  'OTHER',
]);

export const FamilyHistorySchema = z.object({
  id: z.number(),
  patient: z.number(),
  encounter: z.number().nullable(),
  relationship: FamilyRelationshipSchema,
  relationship_display: z.string(),
  condition_name: z.string(),
  deceased: z.boolean(),
  age_at_onset: z.string().default(''),
  notes: z.string().default(''),
  recorded_by: z.number().nullable(),
  recorded_by_username: z.string().nullable(),
  patient_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
