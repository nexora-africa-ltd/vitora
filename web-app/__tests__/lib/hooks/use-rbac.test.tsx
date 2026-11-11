// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * RBAC query-key regression tests.
 *
 * Use: run `npx jest __tests__/lib/hooks/use-rbac.test.tsx` from web-app.
 * Inputs: audit-log list query parameters and the active facility ID.
 */

import { getAuditLogsQueryKey } from '@/lib/hooks/use-rbac';
import { AuditLogEntrySchema } from '@/lib/schemas/rbac.schema';

describe('audit log query keys', () => {
  it('scopes cached audit-log results to the active facility', () => {
    const params = { page: 1, page_size: 20 };

    expect(getAuditLogsQueryKey(params, 13)).not.toEqual(getAuditLogsQueryKey(params, 14));
    expect(getAuditLogsQueryKey(params, 13)).toEqual(['audit-logs', 13, params]);
  });

  it('accepts API audit records without a resolved resource name', () => {
    const parsed = AuditLogEntrySchema.safeParse({
      id: 2013,
      user: 48,
      username: 'dha_lab_auditor',
      user_name: 'DHA Auditor',
      action: 'patient_view',
      resource_type: 'Patient',
      resource_id: 402,
      resource_name: null,
      details: {},
      ip_address: null,
      user_agent: '',
      patient_id: 402,
      facility: 13,
      facility_name: 'DHA Certification Test Facility',
      organization: 8,
      organization_name: 'DHA Certification Test Organization',
      timestamp: '2026-11-11T19:26:22.931154+03:00',
    });

    expect(parsed.success).toBe(true);
  });
});
