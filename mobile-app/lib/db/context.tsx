/**
 * Database Context Provider
 * 
 * React Context for providing WatermelonDB database instance throughout the app.
 * Handles initialization and provides database access via hooks.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Database } from '@nozbe/watermelondb';
import { initDatabase } from './index';

interface DatabaseContextValue {
  database: Database | null;
  isInitialized: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  database: null,
  isInitialized: false,
  error: null,
});

interface DatabaseProviderProps {
  children: ReactNode;
}

/**
 * DatabaseProvider Component
 * 
 * Wraps app to provide database access.
 * Initializes database on mount and provides loading/error states.
 */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [database, setDatabase] = useState<Database | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const db = await initDatabase();
        
        if (isMounted) {
          setDatabase(db);
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to initialize database:', err);
        
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Database initialization failed'));
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  // Show loading state while initializing
  if (!isInitialized && !error) {
    return null; // Or show loading spinner
  }

  // Show error state if initialization failed
  if (error) {
    console.error('Database initialization error:', error);
    return null; // Or show error UI
  }

  return (
    <DatabaseContext.Provider value={{ database, isInitialized, error }}>
      {children}
    </DatabaseContext.Provider>
  );
}

/**
 * useDatabase Hook
 * 
 * Access database instance from any component.
 * Throws error if used outside DatabaseProvider.
 */
export function useDatabase(): Database {
  const context = useContext(DatabaseContext);

  if (!context.database) {
    throw new Error(
      'useDatabase must be used within DatabaseProvider and database must be initialized'
    );
  }

  return context.database;
}

/**
 * useDatabaseContext Hook
 * 
 * Access full database context including loading/error states.
 */
export function useDatabaseContext(): DatabaseContextValue {
  const context = useContext(DatabaseContext);

  if (context === undefined) {
    throw new Error('useDatabaseContext must be used within DatabaseProvider');
  }

  return context;
}
