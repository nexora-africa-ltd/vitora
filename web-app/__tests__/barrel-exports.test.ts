/**
 * TDD Tests for index.ts barrel exports across various directories
 */

describe('Lib Hooks Index exports', () => {
  it('should export useDebounce', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.useDebounce).toBeDefined();
  });

  it('should export useNetworkStatus', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.useNetworkStatus).toBeDefined();
  });

  it('should export useToast', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.useToast).toBeDefined();
  });

  it('should export toast function', async () => {
    const hooks = await import('@/lib/hooks');
    expect(hooks.toast).toBeDefined();
  });
});

describe('Lib Utils Index exports', () => {
  it('should export cn function', async () => {
    const utils = await import('@/lib/utils');
    expect(utils.cn).toBeDefined();
  });

  it('should export format functions', async () => {
    const utils = await import('@/lib/utils');
    expect(utils.formatDate).toBeDefined();
    expect(utils.formatRelativeTime).toBeDefined();
    expect(utils.calculateAge).toBeDefined();
  });

  it('should export constants', async () => {
    const utils = await import('@/lib/utils');
    expect(utils.API_BASE_URL).toBeDefined();
    expect(utils.APP_NAME).toBeDefined();
    expect(utils.GENDER_OPTIONS).toBeDefined();
  });
});

describe('Lib Auth Index exports', () => {
  it('should export AuthProvider', async () => {
    const auth = await import('@/lib/auth');
    expect(auth.AuthProvider).toBeDefined();
  });

  it('should export useAuth', async () => {
    const auth = await import('@/lib/auth');
    expect(auth.useAuth).toBeDefined();
  });

  it('should export useUser', async () => {
    const auth = await import('@/lib/auth');
    expect(auth.useUser).toBeDefined();
  });
});

describe('Lib API Index exports', () => {
  it('should export apiClient', async () => {
    const api = await import('@/lib/api');
    expect(api.apiClient).toBeDefined();
  });

  it('should export patientsApi', async () => {
    const api = await import('@/lib/api');
    expect(api.patientsApi).toBeDefined();
  });

  it('should export encountersApi', async () => {
    const api = await import('@/lib/api');
    expect(api.encountersApi).toBeDefined();
  });

  it('should export locationsApi', async () => {
    const api = await import('@/lib/api');
    expect(api.locationsApi).toBeDefined();
  });
});
