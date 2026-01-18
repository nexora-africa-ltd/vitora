import '@testing-library/jest-dom';

// Polyfill fetch API for Node.js (required for MSW)
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// MSW setup - Use dynamic import for ES modules
let server;

beforeAll(async () => {
  try {
    // Polyfill Response/Request if not available
    if (typeof Response === 'undefined') {
      const { Response, Request, Headers, fetch } = await import('undici');
      global.Response = Response;
      global.Request = Request;
      global.Headers = Headers;
      global.fetch = fetch;
    }

    const serverModule = await import('./__tests__/mocks/server');
    server = serverModule.server;
    server.listen({ onUnhandledRequest: 'warn' });
  } catch (e) {
    console.warn('MSW server setup failed:', e.message);
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
