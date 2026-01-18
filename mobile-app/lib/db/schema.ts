/**
 * WatermelonDB Schema Definition
 *
 * Defines the local SQLite database schema for offline-first mobile app.
 * Mirrors backend Django models for seamless synchronization.
 *
 * Tables:
 * - patients: Patient master records
 * - sync_queue: Offline sync queue for CRUD operations
 * - counties: Kenya counties (47 total)
 * - sub_counties: Kenya sub-counties (289 total)
 * - wards: Kenya wards (1448 total) - optional
 */

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    // Patients Table
    tableSchema({
      name: 'patients',
      columns: [
        // Auto-generated MRN (format: MRN-YYYYMMDD-XXXX)
        { name: 'mrn', type: 'string', isIndexed: true },

        // Basic demographics
        { name: 'first_name', type: 'string' },
        { name: 'last_name', type: 'string' },
        { name: 'date_of_birth', type: 'string' }, // ISO date string
        { name: 'gender', type: 'string' }, // 'M', 'F', 'O'

        // Kenya location hierarchy (foreign keys)
        { name: 'county_id', type: 'string', isIndexed: true },
        { name: 'sub_county_id', type: 'string', isIndexed: true },
        { name: 'ward_id', type: 'string', isOptional: true, isIndexed: true },

        // Contact information (encrypted on backend)
        { name: 'phone_number', type: 'string', isOptional: true },
        { name: 'email', type: 'string', isOptional: true },
        { name: 'national_id', type: 'string', isOptional: true },
        { name: 'passport_number', type: 'string', isOptional: true },

        // Address
        { name: 'address_line1', type: 'string', isOptional: true },
        { name: 'address_line2', type: 'string', isOptional: true },
        { name: 'postal_code', type: 'string', isOptional: true },

        // Emergency contact (quick access)
        { name: 'emergency_contact_name', type: 'string', isOptional: true },
        { name: 'emergency_contact_phone', type: 'string', isOptional: true },
        { name: 'emergency_contact_relationship', type: 'string', isOptional: true },

        // Privacy & consent (Kenya DPA 2019)
        { name: 'is_sensitive', type: 'boolean' }, // HIV/GBV/Mental Health
        { name: 'consent_given', type: 'boolean' },
        { name: 'consent_date', type: 'number', isOptional: true }, // timestamp

        // Registration metadata
        { name: 'registered_by_id', type: 'string', isOptional: true },
        { name: 'referral_source', type: 'string', isOptional: true }, // 'self', 'clinic', 'other_facility'

        // Sync tracking
        { name: 'is_synced', type: 'boolean' },
        { name: 'last_synced_at', type: 'number', isOptional: true }, // timestamp
        { name: 'backend_id', type: 'string', isOptional: true }, // Django model ID after sync

        // Standard WatermelonDB timestamps
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Sync Queue Table
    tableSchema({
      name: 'sync_queue',
      columns: [
        // Operation type
        { name: 'operation', type: 'string' }, // 'CREATE', 'UPDATE', 'DELETE'

        // Target model
        { name: 'model_name', type: 'string', isIndexed: true }, // 'Patient', 'Encounter'
        { name: 'record_id', type: 'string', isIndexed: true }, // Local WatermelonDB ID

        // Operation data (JSON string)
        { name: 'data', type: 'string' }, // JSON payload to sync

        // Sync status
        { name: 'status', type: 'string', isIndexed: true }, // 'PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'CONFLICT'
        { name: 'retry_count', type: 'number' },
        { name: 'error_message', type: 'string', isOptional: true },

        // Timestamps
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),

    // Counties Table (Kenya - 47 counties)
    tableSchema({
      name: 'counties',
      columns: [
        { name: 'code', type: 'number', isIndexed: true }, // 1-47
        { name: 'name', type: 'string' },
        { name: 'backend_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Sub-Counties Table (Kenya - 289 sub-counties)
    tableSchema({
      name: 'sub_counties',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'county_id', type: 'string', isIndexed: true }, // Foreign key to counties
        { name: 'backend_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Wards Table (Kenya - 1448 wards) - Optional
    tableSchema({
      name: 'wards',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'sub_county_id', type: 'string', isIndexed: true }, // Foreign key to sub_counties
        { name: 'backend_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
