/**
 * Patient Repository
 *
 * CRUD operations for patient records with offline sync queue integration.
 * All operations automatically queue changes for backend synchronization.
 */

import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '../index';
import { Patient, SyncQueue } from '../models';

export interface PatientData {
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  countyId: string;
  subCountyId: string;
  wardId?: string;
  phoneNumber?: string;
  email?: string;
  nationalId?: string;
  passportNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  isSensitive?: boolean;
  consentGiven?: boolean;
  consentDate?: Date;
  registeredById?: string;
  referralSource?: string;
}

/**
 * Patient Repository
 * Provides CRUD operations with automatic sync queue integration
 */
export const patientRepository = {
  /**
   * Get all patients with pagination
   * @param limit - Number of records to return (default: 50)
   * @param offset - Number of records to skip (default: 0)
   * @returns Array of Patient records
   */
  async getAll(limit = 50, offset = 0): Promise<Patient[]> {
    const database = getDatabase();
    return database
      .get<Patient>('patients')
      .query(
        Q.sortBy('created_at', Q.desc),
        Q.skip(offset),
        Q.take(limit)
      )
      .fetch();
  },

  /**
   * Search patients by name, MRN, or phone number
   * Case-insensitive search across multiple fields
   * @param query - Search query string
   * @returns Array of matching Patient records
   */
  async search(query: string): Promise<Patient[]> {
    const database = getDatabase();

    // For case-insensitive search, we need to search both uppercase and lowercase
    // since WatermelonDB/SQLite LIKE is case-sensitive for non-ASCII characters
    const allPatients = await database.get<Patient>('patients').query().fetch();

    const lowerQuery = query.toLowerCase();

    return allPatients.filter(patient => {
      const firstNameMatch = patient.firstName?.toLowerCase().includes(lowerQuery);
      const lastNameMatch = patient.lastName?.toLowerCase().includes(lowerQuery);
      const mrnMatch = patient.mrn?.includes(query);
      const phoneMatch = patient.phoneNumber?.includes(query);

      return firstNameMatch || lastNameMatch || mrnMatch || phoneMatch;
    });
  },

  /**
   * Get patient by ID
   * @param id - Patient record ID
   * @returns Patient record or null if not found
   */
  async getById(id: string): Promise<Patient | null> {
    const database = getDatabase();
    try {
      return await database.get<Patient>('patients').find(id);
    } catch {
      return null;
    }
  },

  /**
   * Get patient by MRN
   * @param mrn - Medical Record Number
   * @returns Patient record or null if not found
   */
  async getByMrn(mrn: string): Promise<Patient | null> {
    const database = getDatabase();
    const allPatients = await database.get<Patient>('patients').query().fetch();
    return allPatients.find(p => p.mrn === mrn) || null;
  },

  /**
   * Create new patient record
   * Automatically adds CREATE entry to sync queue
   * @param data - Patient data
   * @returns Created Patient record
   */
  async create(data: PatientData): Promise<Patient> {
    const database = getDatabase();

    return database.write(async () => {
      // Create patient record
      const patient = await database.get<Patient>('patients').create((p) => {
        p.mrn = data.mrn;
        p.firstName = data.firstName;
        p.lastName = data.lastName;
        p.dateOfBirth = data.dateOfBirth;
        p.gender = data.gender;
        p.countyId = data.countyId;
        p.subCountyId = data.subCountyId;

        // Optional fields
        if (data.wardId) p.wardId = data.wardId;
        if (data.phoneNumber) p.phoneNumber = data.phoneNumber;
        if (data.email) p.email = data.email;
        if (data.nationalId) p.nationalId = data.nationalId;
        if (data.passportNumber) p.passportNumber = data.passportNumber;
        if (data.addressLine1) p.addressLine1 = data.addressLine1;
        if (data.addressLine2) p.addressLine2 = data.addressLine2;
        if (data.postalCode) p.postalCode = data.postalCode;
        if (data.emergencyContactName) p.emergencyContactName = data.emergencyContactName;
        if (data.emergencyContactPhone) p.emergencyContactPhone = data.emergencyContactPhone;
        if (data.emergencyContactRelationship) p.emergencyContactRelationship = data.emergencyContactRelationship;

        // Privacy & consent
        p.isSensitive = data.isSensitive || false;
        p.consentGiven = data.consentGiven || false;
        if (data.consentDate) p.consentDate = data.consentDate;

        // Registration metadata
        if (data.registeredById) p.registeredById = data.registeredById;
        if (data.referralSource) p.referralSource = data.referralSource;

        // Sync tracking
        p.isSynced = false;
      });

      // Add to sync queue
      await database.get<SyncQueue>('sync_queue').create((sq) => {
        sq.operation = 'CREATE';
        sq.modelName = 'Patient';
        sq.recordId = patient.id;
        sq.data = JSON.stringify({
          mrn: patient.mrn,
          first_name: patient.firstName,
          last_name: patient.lastName,
          date_of_birth: patient.dateOfBirth,
          gender: patient.gender,
          county_id: patient.countyId,
          sub_county_id: patient.subCountyId,
          ward_id: patient.wardId,
          phone_number: patient.phoneNumber,
          email: patient.email,
          national_id: patient.nationalId,
          passport_number: patient.passportNumber,
          address_line1: patient.addressLine1,
          address_line2: patient.addressLine2,
          postal_code: patient.postalCode,
          emergency_contact_name: patient.emergencyContactName,
          emergency_contact_phone: patient.emergencyContactPhone,
          emergency_contact_relationship: patient.emergencyContactRelationship,
          is_sensitive: patient.isSensitive,
          consent_given: patient.consentGiven,
          consent_date: patient.consentDate?.toISOString(),
          registered_by_id: patient.registeredById,
          referral_source: patient.referralSource,
        });
        sq.status = 'PENDING';
        sq.retryCount = 0;
      });

      return patient;
    });
  },

  /**
   * Update existing patient record
   * Automatically adds UPDATE entry to sync queue
   * @param id - Patient record ID
   * @param data - Partial patient data to update
   * @returns Updated Patient record
   */
  async update(id: string, data: Partial<PatientData>): Promise<Patient> {
    const database = getDatabase();

    return database.write(async () => {
      const patient = await database.get<Patient>('patients').find(id);

      await patient.update((p) => {
        // Update fields if provided
        if (data.mrn !== undefined) p.mrn = data.mrn;
        if (data.firstName !== undefined) p.firstName = data.firstName;
        if (data.lastName !== undefined) p.lastName = data.lastName;
        if (data.dateOfBirth !== undefined) p.dateOfBirth = data.dateOfBirth;
        if (data.gender !== undefined) p.gender = data.gender;
        if (data.countyId !== undefined) p.countyId = data.countyId;
        if (data.subCountyId !== undefined) p.subCountyId = data.subCountyId;
        if (data.wardId !== undefined) p.wardId = data.wardId;
        if (data.phoneNumber !== undefined) p.phoneNumber = data.phoneNumber;
        if (data.email !== undefined) p.email = data.email;
        if (data.nationalId !== undefined) p.nationalId = data.nationalId;
        if (data.passportNumber !== undefined) p.passportNumber = data.passportNumber;
        if (data.addressLine1 !== undefined) p.addressLine1 = data.addressLine1;
        if (data.addressLine2 !== undefined) p.addressLine2 = data.addressLine2;
        if (data.postalCode !== undefined) p.postalCode = data.postalCode;
        if (data.emergencyContactName !== undefined) p.emergencyContactName = data.emergencyContactName;
        if (data.emergencyContactPhone !== undefined) p.emergencyContactPhone = data.emergencyContactPhone;
        if (data.emergencyContactRelationship !== undefined) p.emergencyContactRelationship = data.emergencyContactRelationship;
        if (data.isSensitive !== undefined) p.isSensitive = data.isSensitive;
        if (data.consentGiven !== undefined) p.consentGiven = data.consentGiven;
        if (data.consentDate !== undefined) p.consentDate = data.consentDate;
        if (data.registeredById !== undefined) p.registeredById = data.registeredById;
        if (data.referralSource !== undefined) p.referralSource = data.referralSource;

        // Mark as unsynced
        p.isSynced = false;
      });

      // Add to sync queue
      await database.get<SyncQueue>('sync_queue').create((sq) => {
        sq.operation = 'UPDATE';
        sq.modelName = 'Patient';
        sq.recordId = patient.id;
        sq.data = JSON.stringify({
          id: patient.backendId,
          mrn: patient.mrn,
          first_name: patient.firstName,
          last_name: patient.lastName,
          date_of_birth: patient.dateOfBirth,
          gender: patient.gender,
          county_id: patient.countyId,
          sub_county_id: patient.subCountyId,
          ward_id: patient.wardId,
          phone_number: patient.phoneNumber,
          email: patient.email,
          national_id: patient.nationalId,
          passport_number: patient.passportNumber,
          address_line1: patient.addressLine1,
          address_line2: patient.addressLine2,
          postal_code: patient.postalCode,
          emergency_contact_name: patient.emergencyContactName,
          emergency_contact_phone: patient.emergencyContactPhone,
          emergency_contact_relationship: patient.emergencyContactRelationship,
          is_sensitive: patient.isSensitive,
          consent_given: patient.consentGiven,
          consent_date: patient.consentDate?.toISOString(),
          registered_by_id: patient.registeredById,
          referral_source: patient.referralSource,
        });
        sq.status = 'PENDING';
        sq.retryCount = 0;
      });

      return patient;
    });
  },

  /**
   * Delete patient record (soft delete)
   * Automatically adds DELETE entry to sync queue
   * @param id - Patient record ID
   */
  async delete(id: string): Promise<void> {
    const database = getDatabase();

    return database.write(async () => {
      const patient = await database.get<Patient>('patients').find(id);

      // Add to sync queue before deleting
      await database.get<SyncQueue>('sync_queue').create((sq) => {
        sq.operation = 'DELETE';
        sq.modelName = 'Patient';
        sq.recordId = patient.id;
        sq.data = JSON.stringify({
          id: patient.backendId,
        });
        sq.status = 'PENDING';
        sq.retryCount = 0;
      });

      // Soft delete (marks as deleted, doesn't remove from DB)
      await patient.markAsDeleted();
    });
  },

  /**
   * Get count of unsynced patients
   * @returns Number of patients with is_synced = false
   */
  async getUnsyncedCount(): Promise<number> {
    const database = getDatabase();

    // Use filter approach for reliable boolean querying
    // markAsDeleted() records are automatically excluded by WatermelonDB
    const allPatients = await database
      .get<Patient>('patients')
      .query()
      .fetch();

    return allPatients.filter((p) => !p.isSynced).length;
  },
};
