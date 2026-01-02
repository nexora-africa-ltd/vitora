/**
 * TDD Tests for lib/utils/index.ts barrel exports
 */

describe('Utils barrel exports', () => {
  it('should export cn function', async () => {
    const utils = await import('@/lib/utils');
    expect(utils.cn).toBeDefined();
    expect(typeof utils.cn).toBe('function');
  });

  it('should export format functions', async () => {
    const utils = await import('@/lib/utils');
    expect(utils.formatDate).toBeDefined();
    expect(utils.formatRelativeTime).toBeDefined();
    expect(utils.calculateAge).toBeDefined();
    expect(utils.formatPhoneNumber).toBeDefined();
    expect(utils.formatCurrency).toBeDefined();
    expect(utils.formatMRN).toBeDefined();
  });

  it('should export constants', async () => {
    const utils = await import('@/lib/utils');
    expect(utils.API_BASE_URL).toBeDefined();
    expect(utils.APP_NAME).toBeDefined();
    expect(utils.GENDER_OPTIONS).toBeDefined();
    expect(utils.REFERRAL_SOURCE_OPTIONS).toBeDefined();
    expect(utils.ENCOUNTER_TYPES).toBeDefined();
    expect(utils.ENCOUNTER_STATUS).toBeDefined();
    expect(utils.VITAL_RANGES).toBeDefined();
    expect(utils.DEFAULT_PAGE_SIZE).toBeDefined();
    expect(utils.PAGE_SIZE_OPTIONS).toBeDefined();
  });
});
