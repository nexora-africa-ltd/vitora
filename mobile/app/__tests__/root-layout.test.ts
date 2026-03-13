import { shouldShowGlobalTibaBotFab } from '@/lib/ai/tibabot-navigation';

describe('shouldShowGlobalTibaBotFab', () => {
  it('hides the global FAB on auth and lock screens', () => {
    expect(shouldShowGlobalTibaBotFab('/sign-in')).toBe(false);
    expect(shouldShowGlobalTibaBotFab('/')).toBe(false);
  });

  it('hides the global FAB on encounter detail routes that already render a contextual FAB', () => {
    expect(shouldShowGlobalTibaBotFab('/encounters/42')).toBe(false);
    expect(shouldShowGlobalTibaBotFab('/encounters/42/')).toBe(false);
  });

  it('shows the global FAB on other authenticated routes', () => {
    expect(shouldShowGlobalTibaBotFab('/patients')).toBe(true);
    expect(shouldShowGlobalTibaBotFab('/patients/new')).toBe(true);
    expect(shouldShowGlobalTibaBotFab('/billing/12')).toBe(true);
    expect(shouldShowGlobalTibaBotFab('/encounters/new')).toBe(true);
  });
});