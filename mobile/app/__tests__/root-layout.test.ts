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

  it('returns pharmacy-focused starter prompts on pharmacy routes', () => {
    const config = getGlobalTibaBotConfig('/pharmacy/new');

    expect(config?.sheetTitle).toBe('TibaBot Pharmacy Assist');
    expect(config?.inputPlaceholder).toMatch(/prescriptions, stock, substitutions, or dispensing/i);
    expect(config?.quickActions.map((action) => action.label)).toEqual([
      'Dispense safely',
      'Stock alternative',
      'Patient counselling',
      'Partial dispense next steps',
    ]);
  });

  it('returns laboratory-focused starter prompts on laboratory routes', () => {
    const config = getGlobalTibaBotConfig('/laboratory/ABC-123');

    expect(config?.sheetTitle).toBe('TibaBot Laboratory Assist');
    expect(config?.inputPlaceholder).toMatch(/orders, specimens, critical values, or result review/i);
    expect(config?.quickActions.map((action) => action.label)).toEqual([
      'Specimen checklist',
      'Critical result action',
      'Review abnormal result',
      'Verify result safely',
    ]);
  });

  it('returns inpatient-focused starter prompts on inpatient routes', () => {
    const config = getGlobalTibaBotConfig('/inpatient/admissions/new');

    expect(config?.sheetTitle).toBe('TibaBot Inpatient Assist');
    expect(config?.inputPlaceholder).toMatch(/admissions, bed flow, ward care, or nursing tasks/i);
    expect(config?.quickActions.map((action) => action.label)).toEqual([
      'Admission checklist',
      'Spot deterioration',
      'Ward handover',
      'Medication round checks',
    ]);
  });

  it('returns mch-focused starter prompts on mch routes', () => {
    const config = getGlobalTibaBotConfig('/mch/immunization');

    expect(config?.sheetTitle).toBe('TibaBot MCH Assist');
    expect(config?.inputPlaceholder).toMatch(/anc follow-up, maternal risk, immunization, or outreach/i);
    expect(config?.quickActions.map((action) => action.label)).toEqual([
      'ANC risk review',
      'Next ANC visit plan',
      'Immunization catch-up',
      'Mother counselling',
    ]);
  });
});