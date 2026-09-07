import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';

// MSW must see these platform APIs before its server modules are evaluated.
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.ReadableStream = ReadableStream;
global.TransformStream = TransformStream;
global.WritableStream = WritableStream;
class MockMessagePort {
  constructor() {
    this.onmessage = null;
  }
  postMessage(message) {
    queueMicrotask(() => this.onmessage?.({ data: message }));
  }
  start() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

class MockMessageChannel {
  constructor() {
    this.port1 = new MockMessagePort();
    this.port2 = new MockMessagePort();
    this.port2.postMessage = (message) =>
      queueMicrotask(() => this.port1.onmessage?.({ data: message }));
  }
}

global.MessagePort = MockMessagePort;
global.MessageChannel = MockMessageChannel;
// MSW initializes WebSocket support even when tests only use HTTP. A no-op
// channel avoids retaining Node worker handles after the MSW server closes.
global.BroadcastChannel = class MockBroadcastChannel {
  constructor() {
    this.onmessage = null;
  }
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  close() {}
};

// Prevent real socket creation during unit tests. Some components initialize
// websocket hooks on mount; using JSDOM/Node WebSocket implementations can
// leave libuv stream watchers active at process teardown.
class JestMockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = JestMockWebSocket.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
  }

  send() {}

  close() {
    this.readyState = JestMockWebSocket.CLOSED;
    if (typeof this.onclose === 'function') {
      this.onclose({ type: 'close' });
    }
  }
}

global.WebSocket = JestMockWebSocket;
if (typeof window !== 'undefined') {
  window.WebSocket = JestMockWebSocket;
}

if (typeof global.Response === 'undefined') {
  const { fetch, Headers, Request, Response } = require('undici');
  global.fetch = fetch;
  global.Headers = Headers;
  global.Request = Request;
  global.Response = Response;
}

// PowerSync uses browser SQLite/WASM and is ESM-only. Unit tests exercise the
// API fallback; browser sync behavior belongs to integration and E2E coverage.
jest.mock('@powersync/web', () => {
  const column = {
    integer: 'integer',
    real: 'real',
    text: 'text',
  };

  class Table {
    constructor(columns, options) {
      this.columns = columns;
      this.options = options;
    }
  }

  class Schema {
    constructor(tables) {
      this.tables = tables;
    }
  }

  class PowerSyncDatabase {
    async init() {}
    async connect() {}
    async disconnect() {}
    async getAll() {
      return [];
    }
    async execute() {}
    registerListener() {
      return () => {};
    }
    onChange() {
      return () => {};
    }
  }

  return {
    column,
    Table,
    Schema,
    PowerSyncDatabase,
    UpdateType: {
      PUT: 'PUT',
      PATCH: 'PATCH',
      DELETE: 'DELETE',
    },
  };
});

// Provide a safe default mock for Next.js App Router APIs.
// Individual tests can override this with their own `jest.mock('next/navigation', ...)`.
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: jest.fn(),
}));

// Markdown's unified ecosystem is ESM-only. Markdown parsing is covered outside
// component unit tests; this preserves content while avoiding a large ESM graph.
jest.mock('react-markdown', () => {
  const React = require('react');
  return ({ children }) => React.createElement(React.Fragment, null, children);
});
jest.mock('remark-gfm', () => () => undefined);

// Next/Jest prepends its own node_modules ignore rule, so MSW's ESM-only
// `until-async` cannot reliably be transformed through configuration alone.
jest.mock('until-async', () => ({
  until: async (callback) => {
    try {
      return [null, await callback()];
    } catch (error) {
      return [error, null];
    }
  },
}));

const testPath =
  (global.expect && global.expect.getState && global.expect.getState().testPath) || '';
const isContractTest = typeof testPath === 'string' && testPath.includes('__tests__/contracts/');
const { server } = isContractTest ? { server: null } : require('./__tests__/mocks/server');

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
  value: jest.fn().mockImplementation((query) => ({
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
const storage = new Map();
const localStorageMock = {
  getItem: jest.fn((key) => storage.get(key) ?? null),
  setItem: jest.fn((key, value) => storage.set(key, String(value))),
  removeItem: jest.fn((key) => storage.delete(key)),
  clear: jest.fn(() => storage.clear()),
};
global.localStorage = localStorageMock;

afterEach(() => {
  storage.clear();
  jest.clearAllMocks();
});

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

// Mock scrollIntoView (required by cmdk/Command component)
Element.prototype.scrollIntoView = jest.fn();

// Suppress console warnings in tests (optional - comment out for debugging)
// global.console.warn = jest.fn();
// global.console.error = jest.fn();
