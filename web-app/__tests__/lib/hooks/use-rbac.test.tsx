// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * RBAC query-key regression tests.
 *
 * Use: run `npx jest __tests__/lib/hooks/use-rbac.test.tsx` from web-app.
 * Inputs: audit-log list query parameters and the active facility ID.
 */

import { getAuditLogsQueryKey } from '@/lib/hooks/use-rbac';

describe('audit log query keys', () => {
  it('scopes cached audit-log results to the active facility', () => {
    const params = { page: 1, page_size: 20 };

    expect(getAuditLogsQueryKey(params, 13)).not.toEqual(getAuditLogsQueryKey(params, 14));
    expect(getAuditLogsQueryKey(params, 13)).toEqual(['audit-logs', 13, params]);
  });
});
