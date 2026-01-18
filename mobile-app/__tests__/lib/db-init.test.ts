/**
 * Database Index Tests
 *
 * Additional tests for database initialization to improve coverage.
 */

// Mock WatermelonDB before importing
const mockAdapter = {
  schema: {},
  dbName: 'test',
};

const mockDatabase = {
  schema: {},
  get: jest.fn(),
  write: jest.fn(),
  unsafeResetDatabase: jest.fn(),
};

jest.mock('@nozbe/watermelondb', () => ({
  Database: jest.fn(() => mockDatabase),
}));

jest.mock('@nozbe/watermelondb/adapters/sqlite', () => {
  return jest.fn(() => mockAdapter);
});

jest.mock('../../lib/db/schema', () => ({
  schema: { version: 1, tables: [] },
}));

jest.mock('../../lib/db/models', () => ({
  Patient: class {},
  SyncQueue: class {},
  County: class {},
  SubCounty: class {},
  Ward: class {},
}));

describe('Database Initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('should initialize database with correct configuration', async () => {
    const { initDatabase } = require('../../lib/db/index');

    const db = await initDatabase();

    expect(db).toBeDefined();
  });

  test('should return singleton database instance', async () => {
    const { initDatabase, getDatabase } = require('../../lib/db/index');

    await initDatabase();
    const db = getDatabase();

    expect(db).toBeDefined();
  });

  test('should throw error when getting database before init', () => {
    jest.resetModules();

    // Re-mock everything fresh
    jest.mock('@nozbe/watermelondb', () => ({
      Database: jest.fn(() => mockDatabase),
    }));

    jest.mock('@nozbe/watermelondb/adapters/sqlite', () => {
      return jest.fn(() => mockAdapter);
    });

    const { getDatabase } = require('../../lib/db/index');

    expect(() => getDatabase()).toThrow();
  });
});
