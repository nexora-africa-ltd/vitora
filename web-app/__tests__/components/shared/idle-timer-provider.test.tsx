// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Tests the durable browser redirect URL used after idle-session logout. */

import { buildIdleLogoutUrl } from '@/components/shared/idle-timer-provider';

describe('buildIdleLogoutUrl', () => {
  it('preserves the protected page while displaying the idle logout notice', () => {
    expect(buildIdleLogoutUrl('/patients/42', '?tab=history')).toBe(
      '/login?reason=idle&callbackUrl=%2Fpatients%2F42%3Ftab%3Dhistory'
    );
  });

  it('does not add a callback URL for the login route', () => {
    expect(buildIdleLogoutUrl('/login', '')).toBe('/login?reason=idle');
  });
});
