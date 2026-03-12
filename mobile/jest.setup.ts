jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  isAvailableAsync: jest.fn(async () => true),
  setItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
  authenticateAsync: jest.fn(async () => ({ success: false, error: 'not_available' })),
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  supportedAuthenticationTypesAsync: jest.fn(async () => []),
}));

jest.mock('react-native-ssl-public-key-pinning', () => ({
  addSslPinningErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  initializeSslPinning: jest.fn(async () => undefined),
  isSslPinningAvailable: jest.fn(() => false),
}));

jest.mock('@/lib/config/api-config', () => ({
  getApiBaseUrl: jest.fn(async () => 'http://127.0.0.1:9088'),
}));