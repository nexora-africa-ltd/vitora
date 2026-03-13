import AsyncStorage from '@react-native-async-storage/async-storage';

const ORIGINAL_ENV = process.env;

async function loadApiConfigModule() {
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  return jest.requireActual('./api-config') as typeof import('./api-config');
}

describe('api-config', () => {
  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    await AsyncStorage.clear();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('rejects non-approved custom URLs in production builds', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://vitora-prod.onrender.com';
    process.env.EXPO_PUBLIC_APPROVED_API_ENVIRONMENTS = JSON.stringify([
      { id: 'production', label: 'Production API', url: 'https://vitora-prod.onrender.com' },
      { id: 'preview', label: 'Preview API', url: 'https://vitora-api.onrender.com' },
    ]);

    const apiConfig = await loadApiConfigModule();

    await expect(apiConfig.setApiBaseUrl('https://unapproved.example.com')).rejects.toThrow(
      'Production builds only allow approved backend environments.'
    );
  });

  it('switches to an approved environment in production builds', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://vitora-prod.onrender.com';
    process.env.EXPO_PUBLIC_APPROVED_API_ENVIRONMENTS = JSON.stringify([
      { id: 'production', label: 'Production API', url: 'https://vitora-prod.onrender.com' },
      { id: 'preview', label: 'Preview API', url: 'https://vitora-api.onrender.com' },
    ]);

    const apiConfig = await loadApiConfigModule();

    await apiConfig.setApiEnvironment('preview');

    expect(await apiConfig.getApiBaseUrl()).toBe('https://vitora-api.onrender.com');
    expect(apiConfig.getSelectedApiEnvironmentIdSync()).toBe('preview');
  });

  it('allows custom URL overrides in preview builds', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
    process.env.EXPO_PUBLIC_API_URL = 'https://vitora-api.onrender.com';
    process.env.EXPO_PUBLIC_APPROVED_API_ENVIRONMENTS = JSON.stringify([
      { id: 'preview', label: 'Preview API', url: 'https://vitora-api.onrender.com' },
      { id: 'production', label: 'Production API', url: 'https://vitora-prod.onrender.com' },
    ]);

    const apiConfig = await loadApiConfigModule();

    await apiConfig.setApiBaseUrl('https://clinic-lan.example.com');

    expect(await apiConfig.getApiBaseUrl()).toBe('https://clinic-lan.example.com');
    expect(apiConfig.getSelectedApiEnvironmentIdSync()).toBeNull();
  });
});