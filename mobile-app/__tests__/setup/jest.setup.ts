/**
 * Jest setup file for Vitora HMIS Mobile App.
 *
 * @module __tests__/setup/jest.setup
 */

// Mock __DEV__ global (already declared by react-native types)
(global as any).__DEV__ = true;

// Mock expo module
jest.mock('expo', () => ({}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    name: 'Vitora HMIS',
    version: '1.0.0',
    extra: {
      apiBaseUrl: 'http://localhost:8000',
    },
  },
  default: {
    expoConfig: {
      name: 'Vitora HMIS',
      version: '1.0.0',
      extra: {
        apiBaseUrl: 'http://localhost:8000',
      },
    },
  },
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  Link: 'Link',
  Redirect: 'Redirect',
  Stack: {
    Screen: 'Screen',
  },
  Slot: 'Slot',
}));

// Mock react-native
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: jest.fn((obj) => obj.android || obj.default),
  },
  StyleSheet: {
    create: jest.fn((styles) => styles),
    flatten: jest.fn((style) => style),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  TextInput: 'TextInput',
  FlatList: 'FlatList',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
}));

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
