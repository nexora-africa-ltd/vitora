jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@/lib/config/api-config', () => ({
  getApiBaseUrl: jest.fn(async () => 'http://127.0.0.1:9088'),
}));