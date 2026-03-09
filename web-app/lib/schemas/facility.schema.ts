import { z } from 'zod';

export const FacilityModulesSchema = z.object({
  outpatient: z.boolean(),
  inpatient: z.boolean(),
  emergency: z.boolean(),
  pharmacy: z.boolean(),
  laboratory: z.boolean(),
  imaging: z.boolean(),
  theatre: z.boolean(),
  dialysis: z.boolean(),
  icu: z.boolean(),
  maternity: z.boolean(),
  mortuary: z.boolean(),
  blood_bank: z.boolean(),
});

export const FacilityListItemSchema = z.object({
  id: z.number(),
  mfl_code: z.string(),
  name: z.string(),
  level: z.string(),
  ownership: z.string(),
  county: z.number(),
  county_name: z.string(),
  sub_county: z.number(),
  sub_county_name: z.string(),
  sha_contracted: z.boolean(),
  is_active: z.boolean(),
});

export const FacilityDetailSchema = FacilityListItemSchema.extend({
  ward: z.number().nullable(),
  ward_name: z.string().nullable(),
  sha_contract_expiry: z.string().nullable(),
  sha_facility_code: z.string(),
  modules: FacilityModulesSchema,
  enabled_module_names: z.array(z.string()),
  has_outpatient: z.boolean(),
  has_inpatient: z.boolean(),
  has_emergency: z.boolean(),
  has_pharmacy: z.boolean(),
  has_laboratory: z.boolean(),
  has_imaging: z.boolean(),
  has_theatre: z.boolean(),
  has_dialysis: z.boolean(),
  has_icu: z.boolean(),
  has_maternity: z.boolean(),
  has_mortuary: z.boolean(),
  has_blood_bank: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedFacilityListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(FacilityListItemSchema),
});

export type FacilityModulesSchemaType = z.infer<typeof FacilityModulesSchema>;
export type FacilityListItemSchemaType = z.infer<typeof FacilityListItemSchema>;
export type FacilityDetailSchemaType = z.infer<typeof FacilityDetailSchema>;