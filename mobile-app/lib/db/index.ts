/**
 * Database Initialization
 *
 * Initializes WatermelonDB with SQLite adapter for offline-first storage.
 * Singleton pattern ensures only one database instance exists.
 */

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import { Patient, SyncQueue, County, SubCounty, Ward } from './models';

let databaseInstance: Database | null = null;

/**
 * Initialize WatermelonDB database
 * Returns singleton instance for consistent access across app
 */
export async function initDatabase(): Promise<Database> {
  // Return existing instance if already initialized
  if (databaseInstance) {
    return databaseInstance;
  }

  // Create SQLite adapter
  const adapter = new SQLiteAdapter({
    schema,
    // Use JSI for better performance (requires Expo SDK 47+)
    jsi: true,
    // Database file name
    dbName: 'vitora_hmis',
  });

  // Create database instance
  databaseInstance = new Database({
    adapter,
    modelClasses: [
      Patient,
      SyncQueue,
      County,
      SubCounty,
      Ward,
    ],
  });

  return databaseInstance;
}

/**
 * Get existing database instance
 * Throws error if database not initialized
 */
export function getDatabase(): Database {
  if (!databaseInstance) {
    throw new Error(
      'Database not initialized. Call initDatabase() first.'
    );
  }
  return databaseInstance;
}

/**
 * Reset database (for testing or data cleanup)
 * WARNING: This will delete all local data
 */
export async function resetDatabase(): Promise<void> {
  const database = getDatabase();
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (databaseInstance) {
    // WatermelonDB doesn't have explicit close method
    // Set to null to allow garbage collection
    databaseInstance = null;
  }
}
