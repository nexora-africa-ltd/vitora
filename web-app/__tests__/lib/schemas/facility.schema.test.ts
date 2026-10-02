// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Facility response-schema tests.
 *
 * Run with: npx jest __tests__/lib/schemas/facility.schema.test.ts --runInBand
 * Inputs: Facility detail payloads returned by the API.
 */
import { FacilityDetailSchema } from '@/lib/schemas/facility.schema';

describe('FacilityDetailSchema', () => {
  it('defaults subscription-gated module fields omitted by the hub to false', () => {
    const result = FacilityDetailSchema.parse({
      id: 12,
      organization: 3,
      organization_name: 'Demo Health Facility',
      mfl_code: '12345',
      name: 'Demo Health Facility',
      level: '3',
      ownership: 'PRIVATE',
      county: 1,
      county_name: 'Nairobi',
      sub_county: 2,
      sub_county_name: 'Westlands',
      sha_contracted: false,
      is_active: true,
      sha_contract_expiry: null,
      sha_facility_code: '',
      operating_mode: 'FULL_HMIS',
      deployment_profile: 'full_hmis',
      modules: {},
      enabled_module_names: [],
      created_at: '2026-09-30T00:00:00Z',
      updated_at: '2026-09-30T00:00:00Z',
    });

    expect(result.modules.outpatient).toBe(false);
    expect(result.modules.laboratory).toBe(false);
    expect(result.has_outpatient).toBe(false);
    expect(result.has_laboratory).toBe(false);
    expect(result.has_analytics).toBe(false);
  });
});
