/**
 * TDD Tests for Auth Hooks
 * Tests useLogout, useHasPermission, useIsStaff hooks
 */
import React from 'react';
import { renderHook } from '@testing-library/react';

describe('Auth Hooks Module', () => {
  it('should export useLogout hook', async () => {
    const authHooks = await import('@/lib/auth/hooks');
    
    expect(authHooks.useLogout).toBeDefined();
    expect(typeof authHooks.useLogout).toBe('function');
  });

  it('should export useHasPermission hook', async () => {
    const authHooks = await import('@/lib/auth/hooks');
    
    expect(authHooks.useHasPermission).toBeDefined();
    expect(typeof authHooks.useHasPermission).toBe('function');
  });

  it('should export useIsStaff hook', async () => {
    const authHooks = await import('@/lib/auth/hooks');
    
    expect(authHooks.useIsStaff).toBeDefined();
    expect(typeof authHooks.useIsStaff).toBe('function');
  });
});
