import '@testing-library/jest-dom';

// MSW setup - conditionally import to handle module resolution
let server;
try {
  // Dynamic import for MSW node server
  const mswModule = require('./__tests__/mocks/server');
  server = mswModule.server;
} catch (e) {
  // MSW not available - tests will work without API mocking
  console.warn('MSW server not available, API mocking disabled');
}

// Establish API mocking before all tests
beforeAll(() => {
  if (server) {
    server.listen({ onUnhandledRequest: 'warn' });
  }
});

// Reset handlers after each test (important for test isolation)
afterEach(() => {
  if (server) {
    server.resetHandlers();
  }
});

// Clean up after all tests
afterAll(() => {
  if (server) {
    server.close();
  }
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock navigator.onLine
Object.defineProperty(window.navigator, 'onLine', {
  writable: true,
  value: true,
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor() {
    this.observe = jest.fn();
    this.unobserve = jest.fn();
    this.disconnect = jest.fn();
  }
}
global.IntersectionObserver = MockIntersectionObserver;

// Mock ResizeObserver
class MockResizeObserver {
  constructor() {
    this.observe = jest.fn();
    this.unobserve = jest.fn();
    this.disconnect = jest.fn();
  }
}
global.ResizeObserver = MockResizeObserver;

// Suppress console warnings in tests (optional - comment out for debugging)
// global.console.warn = jest.fn();
// global.console.error = jest.fn();

