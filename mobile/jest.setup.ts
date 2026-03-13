import '@testing-library/jest-native/extend-expect';

import { server } from '@/__tests__/msw/server';

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

jest.mock('expo-location', () => ({
  Accuracy: {
    Balanced: 3,
  },
  PermissionStatus: {
    GRANTED: 'granted',
  },
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: -1.2921,
      longitude: 36.8219,
      accuracy: 8,
    },
  })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  const CameraView = React.forwardRef((_: unknown, ref: React.Ref<{ takePictureAsync: () => Promise<{ uri: string; width: number; height: number }> }>) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn(async () => ({
        uri: 'file:///mock-photo.jpg',
        width: 800,
        height: 600,
      })),
    }));

    return React.createElement(View, { testID: 'camera-view' });
  });

  return {
    CameraView,
    useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn(async () => ({ granted: true }))]),
  };
});

jest.mock('react-native-ssl-public-key-pinning', () => ({
  addSslPinningErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  initializeSslPinning: jest.fn(async () => undefined),
  isSslPinningAvailable: jest.fn(() => false),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  init: jest.fn(),
}));

jest.mock('@/lib/config/api-config', () => ({
  getApiBaseUrl: jest.fn(async () => 'http://127.0.0.1:9088'),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());