/**
 * MSW Server Setup for Tests
 * Mock Service Worker server for intercepting API requests in tests
 */
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Create the mock server with the default handlers
export const server = setupServer(...handlers);

// Export type for extending handlers in tests
export type { SetupServer } from 'msw/node';

