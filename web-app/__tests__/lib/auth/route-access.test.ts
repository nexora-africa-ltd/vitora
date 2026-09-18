// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Unit tests for shared route access rules.
 *
 * Run:
 * - npx jest "__tests__/lib/auth/route-access.test.ts" --runInBand
 */

import {
  getStandardRouteAccessRequirement,
  getLISStandaloneRouteAccessRequirement,
  isStandardRouteAllowed,
  isLISStandaloneRouteAllowed,
} from '@/lib/auth/route-access';

const allowAllStandard = {
  canAccessModule: () => true,
  hasModule: () => true,
  canPerformAction: () => true,
  hasPermission: () => true,
};

const allowAllLis = {
  canAccessModule: () => true,
  hasModule: () => true,
  canPerformAction: () => true,
};

describe('route-access', () => {
  it('resolves standard requirement for pharmacy routes', () => {
    expect(getStandardRouteAccessRequirement('/pharmacy/dispensing')).toEqual({
      moduleKey: 'pharmacy',
      facilityModule: 'pharmacy',
    });
  });

  it('resolves LIS requirement for admin staff route', () => {
    expect(getLISStandaloneRouteAccessRequirement('/admin/staff')).toEqual({
      moduleKey: 'admin',
      actionKey: 'admin.manage_staff',
    });
  });

  it('allows standard routes when all checks pass', () => {
    expect(isStandardRouteAllowed('/transactions/invoices', allowAllStandard)).toBe(true);
  });

  it('blocks standard routes when required permission is missing', () => {
    expect(
      isStandardRouteAllowed('/finance', {
        ...allowAllStandard,
        hasPermission: (permission) => permission !== 'billing.view_invoice',
      })
    ).toBe(false);
  });

  it('blocks standard routes when module capability is missing', () => {
    expect(
      isStandardRouteAllowed('/pharmacy', {
        ...allowAllStandard,
        canAccessModule: (moduleKey) => moduleKey !== 'pharmacy',
      })
    ).toBe(false);
  });

  it('allows LIS routes only when mapped and authorized', () => {
    expect(isLISStandaloneRouteAllowed('/admin/staff', allowAllLis)).toBe(true);
  });

  it('blocks LIS routes that are intentionally outside LIS scope', () => {
    expect(isLISStandaloneRouteAllowed('/dashboard', allowAllLis)).toBe(false);
    expect(isLISStandaloneRouteAllowed('/finance', allowAllLis)).toBe(false);
    expect(isLISStandaloneRouteAllowed('/transactions/invoices', allowAllLis)).toBe(false);
    expect(isLISStandaloneRouteAllowed('/transactions/invoices/new', allowAllLis)).toBe(false);
    expect(isLISStandaloneRouteAllowed('/patients/checkin', allowAllLis)).toBe(false);
  });

  it('blocks LIS admin routes not on the allowlist map', () => {
    expect(isLISStandaloneRouteAllowed('/admin/join-requests', allowAllLis)).toBe(false);
  });
});
