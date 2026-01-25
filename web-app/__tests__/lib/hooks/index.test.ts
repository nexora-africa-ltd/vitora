/**
 * TDD Tests for lib/hooks/index.ts barrel exports
 */

describe('Hooks barrel exports', () => {
  it('should export useDebounce', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.useDebounce).toBeDefined();
    expect(typeof hooks.useDebounce).toBe('function');
  });

  it('should export encounter hooks', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.useEncounters).toBeDefined();
    expect(hooks.useEncounter).toBeDefined();
    expect(hooks.useEncounterDiagnoses).toBeDefined();
    expect(hooks.useEncounterTreatmentPlan).toBeDefined();
    expect(hooks.useCreateEncounter).toBeDefined();
    expect(hooks.useUpdateEncounter).toBeDefined();
  });

  it('should export location hooks', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.useCounties).toBeDefined();
    expect(hooks.useSubCounties).toBeDefined();
    expect(hooks.useWards).toBeDefined();
    expect(hooks.useLocationSelector).toBeDefined();
  });

  it('should export useNetworkStatus', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.useNetworkStatus).toBeDefined();
    expect(typeof hooks.useNetworkStatus).toBe('function');
  });

  it('should export patient hooks', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.usePatients).toBeDefined();
    expect(hooks.usePatient).toBeDefined();
    expect(hooks.usePatientEmergencyContacts).toBeDefined();
    expect(hooks.usePatientEncounters).toBeDefined();
    expect(hooks.useCreatePatient).toBeDefined();
    expect(hooks.useUpdatePatient).toBeDefined();
    expect(hooks.useDeletePatient).toBeDefined();
  });

  it('should export toast hooks', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.useToast).toBeDefined();
    expect(hooks.toast).toBeDefined();
    expect(hooks.useToastNotification).toBeDefined();
  });
});
