/**
 * PowerSync Client-Side Schema
 *
 * Defines the local SQLite schema used by PowerSync in the browser.
 * Must mirror the columns listed in backend/powersync/sync-rules.yaml.
 *
 * SECURITY: Encrypted fields (national_id, phone_number, identification_number)
 * are deliberately EXCLUDED. They remain API-only (Kenya DPA 2019 compliance).
 */

import { column, Schema, Table } from '@powersync/web';

// ---------------------------------------------------------------------------
// Reference data (global — synced to all users)
// ---------------------------------------------------------------------------

const counties = new Table(
  {
    code: column.integer,
    name: column.text,
  },
  { indexes: { by_name: ['name'] } }
);

const sub_counties = new Table(
  {
    county_id: column.text,
    name: column.text,
  },
  { indexes: { by_county: ['county_id'] } }
);

const wards = new Table(
  {
    sub_county_id: column.text,
    name: column.text,
  },
  { indexes: { by_sub_county: ['sub_county_id'] } }
);

// ---------------------------------------------------------------------------
// Organization-scoped data
// ---------------------------------------------------------------------------

const patients = new Table(
  {
    organization_id: column.text,
    registered_at_facility_id: column.text,
    mrn: column.text,
    first_name: column.text,
    middle_name: column.text,
    last_name: column.text,
    title: column.text,
    date_of_birth: column.text,
    gender: column.text,
    cr_number: column.text,
    sha_number: column.text,
    email: column.text,
    address: column.text,
    citizenship: column.text,
    identification_type: column.text,
    is_person_with_disability: column.integer,
    is_sensitive: column.integer,
    consent_given: column.integer,
    consent_date: column.text,
    consent_deferred: column.integer,
    registered_by_id: column.text,
    referral_source: column.text,
    referred_from_facility: column.text,
    county_id: column.text,
    sub_county_id: column.text,
    ward_id: column.text,
    is_deceased: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_mrn: ['mrn'], by_name: ['last_name', 'first_name'] } }
);

const emergency_contacts = new Table(
  {
    patient_id: column.text,
    full_name: column.text,
    relationship: column.text,
    phone_number: column.text,
    alternative_phone: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_patient: ['patient_id'] } }
);

// ---------------------------------------------------------------------------
// Facility-scoped data
// ---------------------------------------------------------------------------

const encounters = new Table(
  {
    organization_id: column.text,
    facility_id: column.text,
    patient_id: column.text,
    clinic_visit_id: column.text,
    encounter_type: column.text,
    encounter_date: column.text,
    chief_complaint: column.text,
    temperature: column.real,
    pulse: column.integer,
    blood_pressure: column.text,
    respiratory_rate: column.integer,
    spo2: column.real,
    weight: column.real,
    height: column.real,
    notes: column.text,
    triage_requirement: column.text,
    triage_status: column.text,
    consultation_status: column.text,
    created_by_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {
    indexes: {
      by_patient: ['patient_id'],
      by_date: ['encounter_date'],
      by_facility: ['facility_id'],
    },
  }
);

// ---------------------------------------------------------------------------
// Assembled schema — table keys must match PowerSync bucket data table names
// ---------------------------------------------------------------------------

export const powersyncSchema = new Schema({
  // Global reference data (from global_* buckets)
  core_county: counties,
  core_subcounty: sub_counties,
  core_ward: wards,

  // Organization-scoped (from org_patients bucket)
  patients_patient: patients,
  patients_emergencycontact: emergency_contacts,

  // Facility-scoped (from facility_* buckets)
  encounters_encounter: encounters,
});

/** Convenience type for a row from the patients_patient table. */
export type PatientRow = (typeof powersyncSchema.tables)['patients_patient']['__rowType'];

/** Convenience type for a row from the encounters_encounter table. */
export type EncounterRow = (typeof powersyncSchema.tables)['encounters_encounter']['__rowType'];

/** Convenience type for a county row. */
export type CountyRow = (typeof powersyncSchema.tables)['core_county']['__rowType'];

/** Convenience type for a sub-county row. */
export type SubCountyRow = (typeof powersyncSchema.tables)['core_subcounty']['__rowType'];

/** Convenience type for a ward row. */
export type WardRow = (typeof powersyncSchema.tables)['core_ward']['__rowType'];
