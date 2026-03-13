import { getGlobalTibaBotConfig, shouldShowGlobalTibaBotFab } from '@/lib/ai/tibabot-navigation';

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

  it('returns patient-focused starter prompts on patient routes', () => {
    const config = getGlobalTibaBotConfig('/patients/new');

    expect(config?.sheetTitle).toBe('TibaBot Patient Assist');
    expect(config?.inputPlaceholder).toMatch(/registration, search, or patient intake/i);
    expect(config?.quickActions.map((action) => action.label)).toEqual([
      'Registration checklist',
      'Find a patient fast',
      'Avoid duplicates',
      'Explain consent',
    ]);
  });

  it('returns billing-focused starter prompts on billing routes', () => {
    const config = getGlobalTibaBotConfig('/billing/12');

    expect(config?.sheetTitle).toBe('TibaBot Billing Assist');
    expect(config?.inputPlaceholder).toMatch(/claims, invoices, balances, or payments/i);
    expect(config?.quickActions.map((action) => action.label)).toEqual([
      'SHA claim pre-check',
      'Fix rejected claim',
      'Explain invoice status',
      'Next billing step',
    ]);
  });
});