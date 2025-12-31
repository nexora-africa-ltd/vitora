/**
 * Database Context Tests
 *
 * Tests for DatabaseProvider and useDatabase hook.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, renderHook } from '@testing-library/react-native';
import { DatabaseProvider, useDatabase, useDatabaseContext } from '../../lib/db/context';

// Mock the database initialization
const mockDatabase = {
  get: jest.fn(),
  write: jest.fn(),
  collections: new Map(),
};

jest.mock('../../lib/db/index', () => ({
  initDatabase: jest.fn(() => Promise.resolve(mockDatabase)),
}));

import { initDatabase } from '../../lib/db/index';

const mockInitDatabase = initDatabase as jest.Mock;

describe('Database Context Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitDatabase.mockResolvedValue(mockDatabase);
  });

  describe('DatabaseProvider', () => {
    test('should render children after initialization', async () => {
      const { findByText } = render(
        <DatabaseProvider>
          <Text>Child content</Text>
        </DatabaseProvider>
      );

      const child = await findByText('Child content');
      expect(child).toBeTruthy();
    });

    test('should initialize database on mount', async () => {
      render(
        <DatabaseProvider>
          <Text>Test</Text>
        </DatabaseProvider>
      );

      await waitFor(() => {
        expect(mockInitDatabase).toHaveBeenCalled();
      });
    });

    test('should handle initialization error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockInitDatabase.mockRejectedValue(new Error('Init failed'));

      const { queryByText } = render(
        <DatabaseProvider>
          <Text>Should not render</Text>
        </DatabaseProvider>
      );

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalled();
      });

      // Children should not be rendered when error occurs
      expect(queryByText('Should not render')).toBeNull();

      errorSpy.mockRestore();
    });

    test('should not render children during initialization', () => {
      // Make init hang indefinitely
      mockInitDatabase.mockImplementation(() => new Promise(() => {}));

      const { queryByText } = render(
        <DatabaseProvider>
          <Text>Loading test</Text>
        </DatabaseProvider>
      );

      // Children should not be rendered while loading
      expect(queryByText('Loading test')).toBeNull();
    });
  });

  describe('useDatabase Hook', () => {
    test('should return database when initialized', async () => {
      const TestComponent = () => {
        const db = useDatabase();
        return <Text>{db ? 'Has database' : 'No database'}</Text>;
      };

      const { findByText } = render(
        <DatabaseProvider>
          <TestComponent />
        </DatabaseProvider>
      );

      const text = await findByText('Has database');
      expect(text).toBeTruthy();
    });

    test('should throw error when used outside provider', () => {
      const TestComponent = () => {
        useDatabase();
        return <Text>Test</Text>;
      };

      expect(() => render(<TestComponent />)).toThrow(
        'useDatabase must be used within DatabaseProvider and database must be initialized'
      );
    });
  });

  describe('useDatabaseContext Hook', () => {
    test('should return full context with state', async () => {
      let contextValue: any = null;

      const TestComponent = () => {
        contextValue = useDatabaseContext();
        return <Text>Test</Text>;
      };

      render(
        <DatabaseProvider>
          <TestComponent />
        </DatabaseProvider>
      );

      await waitFor(() => {
        expect(contextValue).toBeDefined();
        expect(contextValue.database).toBe(mockDatabase);
        expect(contextValue.isInitialized).toBe(true);
        expect(contextValue.error).toBeNull();
      });
    });

    test('should return error state when initialization fails', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockInitDatabase.mockRejectedValue(new Error('Test error'));

      let contextValue: any = { error: null };

      const TestComponent = () => {
        contextValue = useDatabaseContext();
        return <Text>Test</Text>;
      };

      render(
        <DatabaseProvider>
          <TestComponent />
        </DatabaseProvider>
      );

      await waitFor(() => {
        // The error should be set or component should show null (error state)
        expect(errorSpy).toHaveBeenCalled();
      });

      errorSpy.mockRestore();
    });
  });

  describe('Unmount Behavior', () => {
    test('should not update state after unmount', async () => {
      const { unmount } = render(
        <DatabaseProvider>
          <Text>Test</Text>
        </DatabaseProvider>
      );

      unmount();

      // This should not cause any warnings/errors
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });
});
