// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Zod schemas for SDMX platform contract and codelist mapping API responses. */

import { z } from 'zod';

export const SDMXPartnerSchema = z.enum(['DHA', 'KHIS', 'OTHER']);
export const SDMXEnvironmentSchema = z.enum(['SANDBOX', 'PRODUCTION']);

export const SDMXContractListItemSchema = z.object({
  id: z.number(),
  display_name: z.string(),
  partner: SDMXPartnerSchema,
  environment: SDMXEnvironmentSchema,
  agency_id: z.string(),
  dataflow_id: z.string(),
  dsd_id: z.string(),
  version: z.string(),
  receiver_id: z.string(),
  is_active: z.boolean(),
  mapping_count: z.number(),
  effective_from: z.string().nullable(),
  effective_until: z.string().nullable(),
  updated_at: z.string(),
});

export const SDMXContractDetailSchema = SDMXContractListItemSchema.extend({
  endpoint_url: z.string(),
  secret_reference: z.string(),
  created_by: z.number().nullable(),
  created_at: z.string(),
});

export const PaginatedSDMXContractListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SDMXContractListItemSchema),
});

export const SDMXCodeMappingSchema = z.object({
  id: z.number(),
  contract: z.number(),
  contract_name: z.string(),
  dimension: z.string(),
  source_code: z.string(),
  target_code: z.string(),
  target_name: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const FacilitySDMXConfigurationSchema = z.object({
  id: z.number(),
  organization: z.number().nullable(),
  facility: z.number(),
  facility_name: z.string(),
  contract: z.number(),
  contract_name: z.string(),
  is_enabled: z.boolean(),
  facility_code: z.string(),
  report_types: z.array(z.string()),
  is_ready: z.boolean(),
  last_validated_at: z.string().nullable(),
  last_successful_submission_at: z.string().nullable(),
  enabled_by: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedFacilitySDMXConfigurationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(FacilitySDMXConfigurationSchema),
});
