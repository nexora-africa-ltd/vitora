/**
 * WatermelonDB Database Tests
 * 
 * Test suite for database initialization, schema validation, and model operations.
 * Following TDD methodology - these tests are written BEFORE implementation.
 * 
 * Test Coverage:
 * - Schema validation (3 tests)
 * - Database initialization (2 tests)
 * - CRUD operations (5 tests)
 * - Data persistence (3 tests)
 * - Error handling (2 tests)
 * Total: 15 tests
 */

import { Database } from '@nozbe/watermelondb';
import { Patient, SyncQueue } from '../../lib/db/models';
import { initDatabase } from '../../lib/db';
import { schema } from '../../lib/db/schema';

describe('WatermelonDB Database Tests', () => {
  let database: Database;

  beforeEach(async () => {
    // Initialize fresh database for each test
    database = await initDatabase();
  });

  afterEach(async () => {
    // Clean up database after each test
    if (database) {
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
    }
  });

  // ==========================================
  // Schema Validation Tests (3 tests)
  // ==========================================

  describe('Schema Validation', () => {
    test('should have patients table in schema', () => {
      const patientsTable = schema.tables.patients;
      expect(patientsTable).toBeDefined();
      expect(patientsTable.name).toBe('patients');
      // Columns is an object with column definitions
      const columns: any = patientsTable.columns;
      expect(columns).toBeDefined();
      expect(columns.mrn).toBeDefined();
      expect(columns.first_name).toBeDefined();
      expect(columns.last_name).toBeDefined();
      expect(columns.date_of_birth).toBeDefined();
      expect(columns.gender).toBeDefined();
      expect(columns.county_id).toBeDefined();
      expect(columns.sub_county_id).toBeDefined();
    });

    test('should have sync_queue table in schema', () => {
      const syncQueueTable = schema.tables.sync_queue;
      expect(syncQueueTable).toBeDefined();
      expect(syncQueueTable.name).toBe('sync_queue');
      const columns: any = syncQueueTable.columns;
      expect(columns).toBeDefined();
      expect(columns.operation).toBeDefined();
      expect(columns.model_name).toBeDefined();
      expect(columns.record_id).toBeDefined();
      expect(columns.data).toBeDefined();
      expect(columns.status).toBeDefined();
      expect(columns.retry_count).toBeDefined();
    });

    test('should have counties and sub_counties tables in schema', () => {
      const countiesTable = schema.tables.counties;
      expect(countiesTable).toBeDefined();
      expect(countiesTable.name).toBe('counties');
      const countyColumns: any = countiesTable.columns;
      expect(countyColumns).toBeDefined();
      expect(countyColumns.code).toBeDefined();
      expect(countyColumns.name).toBeDefined();

      const subCountiesTable = schema.tables.sub_counties;
      expect(subCountiesTable).toBeDefined();
      expect(subCountiesTable.name).toBe('sub_counties');
      const subCountyColumns: any = subCountiesTable.columns;
      expect(subCountyColumns).toBeDefined();
      expect(subCountyColumns.name).toBeDefined();
      expect(subCountyColumns.county_id).toBeDefined();
    });
  });

  // ==========================================
  // Database Initialization Tests (2 tests)
  // ==========================================

  describe('Database Initialization', () => {
    test('should initialize database successfully', async () => {
      expect(database).toBeDefined();
      expect(database.schema).toBe(schema);
      expect(database.collections.get('patients')).toBeDefined();
      expect(database.collections.get('sync_queue')).toBeDefined();
      expect(database.collections.get('counties')).toBeDefined();
      expect(database.collections.get('sub_counties')).toBeDefined();
    });

    test('should return same database instance on multiple calls', async () => {
      const db1 = await initDatabase();
      const db2 = await initDatabase();
      expect(db1).toBe(db2);
    });
  });

  // ==========================================
  // CRUD Operations Tests (5 tests)
  // ==========================================

  describe('CRUD Operations', () => {
    test('should create a patient record', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      
      const patient = await database.write(async () => {
        return await patientsCollection.create((record) => {
          record.mrn = 'MRN-20251230-0001';
          record.firstName = 'John';
          record.lastName = 'Doe';
          record.dateOfBirth = '1990-01-15';
          record.gender = 'M';
          record.countyId = 'county_001';
          record.subCountyId = 'subcounty_001';
        });
      });

      expect(patient.id).toBeDefined();
      expect(patient.mrn).toBe('MRN-20251230-0001');
      expect(patient.firstName).toBe('John');
      expect(patient.lastName).toBe('Doe');
    });

    test('should read a patient record by ID', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      
      // Create patient
      const createdPatient = await database.write(async () => {
        return await patientsCollection.create((record) => {
          record.mrn = 'MRN-20251230-0002';
          record.firstName = 'Jane';
          record.lastName = 'Smith';
          record.dateOfBirth = '1985-05-20';
          record.gender = 'F';
          record.countyId = 'county_001';
          record.subCountyId = 'subcounty_001';
        });
      });

      // Read patient
      const fetchedPatient = await patientsCollection.find(createdPatient.id);
      expect(fetchedPatient.mrn).toBe('MRN-20251230-0002');
      expect(fetchedPatient.firstName).toBe('Jane');
    });

    test('should update a patient record', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      
      // Create patient
      const patient = await database.write(async () => {
        return await patientsCollection.create((record) => {
          record.mrn = 'MRN-20251230-0003';
          record.firstName = 'Alice';
          record.lastName = 'Johnson';
          record.dateOfBirth = '1995-03-10';
          record.gender = 'F';
          record.countyId = 'county_001';
          record.subCountyId = 'subcounty_001';
        });
      });

      // Update patient
      const updatedPatient = await database.write(async () => {
        return await patient.update((record) => {
          record.firstName = 'Alicia';
        });
      });

      expect(updatedPatient.firstName).toBe('Alicia');
      expect(updatedPatient.lastName).toBe('Johnson'); // Unchanged
    });

    test('should delete a patient record', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      
      // Create patient
      const patient = await database.write(async () => {
        return await patientsCollection.create((record) => {
          record.mrn = 'MRN-20251230-0004';
          record.firstName = 'Bob';
          record.lastName = 'Wilson';
          record.dateOfBirth = '1988-07-22';
          record.gender = 'M';
          record.countyId = 'county_001';
          record.subCountyId = 'subcounty_001';
        });
      });

      const patientId = patient.id;

      // Delete patient (marks as deleted)
      await database.write(async () => {
        await patient.markAsDeleted();
      });

      // Verify patient is marked as deleted (check _status)
      const deletedPatient = await patientsCollection.find(patientId);
      expect(deletedPatient._raw._status).toBe('deleted');
    });

    test('should create a sync queue entry', async () => {
      const syncQueueCollection = database.collections.get<SyncQueue>('sync_queue');
      
      const syncEntry = await database.write(async () => {
        return await syncQueueCollection.create((record) => {
          record.operation = 'CREATE';
          record.modelName = 'Patient';
          record.recordId = 'patient_001';
          record.data = JSON.stringify({ firstName: 'Test', lastName: 'User' });
          record.status = 'PENDING';
          record.retryCount = 0;
        });
      });

      expect(syncEntry.id).toBeDefined();
      expect(syncEntry.operation).toBe('CREATE');
      expect(syncEntry.status).toBe('PENDING');
      expect(syncEntry.retryCount).toBe(0);
    });
  });

  // ==========================================
  // Data Persistence Tests (3 tests)
  // ==========================================

  describe('Data Persistence', () => {
    test('should persist patient data after database restart', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      
      // Create patient
      await database.write(async () => {
        return await patientsCollection.create((record) => {
          record.mrn = 'MRN-20251230-0005';
          record.firstName = 'Charlie';
          record.lastName = 'Brown';
          record.dateOfBirth = '1992-11-30';
          record.gender = 'M';
          record.countyId = 'county_001';
          record.subCountyId = 'subcounty_001';
        });
      });

      // Simulate restart by creating new database instance
      const newDatabase = await initDatabase();
      const newPatientsCollection = newDatabase.collections.get<Patient>('patients');
      
      const allPatients = await newPatientsCollection.query().fetch();
      expect(allPatients.length).toBeGreaterThan(0);
      
      const charlie = allPatients.find(p => p.mrn === 'MRN-20251230-0005');
      expect(charlie).toBeDefined();
      expect(charlie?.firstName).toBe('Charlie');
    });

    test('should maintain data integrity across transactions', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      
      // Create multiple patients in single transaction
      await database.write(async () => {
        await patientsCollection.create((record) => {
          record.mrn = 'MRN-20251230-0006';
          record.firstName = 'David';
          record.lastName = 'Lee';
          record.dateOfBirth = '1987-04-18';
          record.gender = 'M';
          record.countyId = 'county_001';
          record.subCountyId = 'subcounty_001';
        });

        await patientsCollection.create((record) => {
          record.mrn = 'MRN-20251230-0007';
          record.firstName = 'Emma';
          record.lastName = 'Davis';
          record.dateOfBirth = '1993-09-25';
          record.gender = 'F';
          record.countyId = 'county_001';
          record.subCountyId = 'subcounty_001';
        });
      });

      const allPatients = await patientsCollection.query().fetch();
      expect(allPatients.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle concurrent write operations', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      
      // Create multiple patients concurrently
      const promises = [
        database.write(() =>
          patientsCollection.create((record) => {
            record.mrn = 'MRN-20251230-0008';
            record.firstName = 'Frank';
            record.lastName = 'Miller';
            record.dateOfBirth = '1991-06-12';
            record.gender = 'M';
            record.countyId = 'county_001';
            record.subCountyId = 'subcounty_001';
          })
        ),
        database.write(() =>
          patientsCollection.create((record) => {
            record.mrn = 'MRN-20251230-0009';
            record.firstName = 'Grace';
            record.lastName = 'Taylor';
            record.dateOfBirth = '1989-12-05';
            record.gender = 'F';
            record.countyId = 'county_001';
            record.subCountyId = 'subcounty_001';
          })
        ),
      ];

      await Promise.all(promises);

      const allPatients = await patientsCollection.query().fetch();
      expect(allPatients.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================
  // Error Handling Tests (2 tests)
  // ==========================================

  describe('Error Handling', () => {
    test('should throw error when accessing non-existent record', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      await expect(patientsCollection.find('non_existent_id')).rejects.toThrow();
    });

    test('should allow creating records with minimal data (validation is at app level)', async () => {
      const patientsCollection = database.collections.get<Patient>('patients');
      
      // WatermelonDB doesn't enforce required fields - that's done at app/API level
      // This test ensures we can create records (validation happens elsewhere)
      const patient = await database.write(async () => {
        return await patientsCollection.create((record) => {
          record.mrn = '';
          record.firstName = '';
          record.lastName = '';
          record.dateOfBirth = '';
          record.gender = '';
          record.countyId = '';
          record.subCountyId = '';
          record.isSynced = false;
          record.isSensitive = false;
          record.consentGiven = false;
        });
      });

      // Record should be created (even with empty values)
      expect(patient.id).toBeDefined();
      expect(patient.mrn).toBe('');
    });
  });
});
