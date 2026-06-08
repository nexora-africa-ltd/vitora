/**
 * Local SQLite Database Service for Tauri Desktop Mode.
 *
 * This module provides a local SQLite database that mirrors the PowerSync schema,
 * enabling fully offline operation when running inside the Tauri desktop shell.
 *
 * Only loaded when VITORA_DESKTOP=1 (i.e., running as a Tauri sidecar).
 * In browser/web mode, PowerSync handles local storage instead.
 */

import path from 'path';
import fs from 'fs';

// better-sqlite3 is a native module — only available in Node.js (Tauri sidecar)
let Database: typeof import('better-sqlite3') | null = null;
let db: import('better-sqlite3').Database | null = null;

/**
 * Initialize the local SQLite database.
 * Creates the DB file and runs schema migrations if needed.
 */
export function initLocalDatabase(dbDir?: string): void {
  if (typeof process === 'undefined' || process.env.VITORA_DESKTOP !== '1') {
    return; // Not in desktop mode
  }

  try {
    // Dynamic require for better-sqlite3 (native module)
    Database = require('better-sqlite3');
  } catch {
    console.warn('[LocalDB] better-sqlite3 not available — skipping local DB init');
    return;
  }

  const dataDir = dbDir || path.join(
    process.env.APPDATA ||
    process.env.XDG_DATA_HOME ||
    path.join(process.env.HOME || '/tmp', '.local', 'share'),
    'digital.vitora.hmis',
    'db'
  );

  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'vitora.db');

  db = new Database!(dbPath);

  // Configure for performance and crash resilience
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run schema creation
  runMigrations(db);

  console.log(`[LocalDB] Initialized at ${dbPath}`);
}

/**
 * Get the database instance. Throws if not initialized.
 */
export function getLocalDb(): import('better-sqlite3').Database {
  if (!db) {
    throw new Error('[LocalDB] Database not initialized. Call initLocalDatabase() first.');
  }
  return db;
}

/**
 * Check if the local database is available and initialized.
 */
export function isLocalDbAvailable(): boolean {
  return db !== null;
}

/**
 * Close the database (call on app shutdown).
 */
export function closeLocalDatabase(): void {
  if (db) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    db = null;
    console.log('[LocalDB] Closed');
  }
}

/**
 * Run database integrity check.
 * Returns 'ok' if the database is healthy.
 */
export function checkIntegrity(): 'ok' | 'corrupted' {
  if (!db) return 'corrupted';
  const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  return result[0]?.integrity_check === 'ok' ? 'ok' : 'corrupted';
}

// ---------------------------------------------------------------------------
// Schema Migrations
// ---------------------------------------------------------------------------

function runMigrations(database: import('better-sqlite3').Database): void {
  database.exec(`
    -- Schema version tracking
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Sync metadata
    CREATE TABLE IF NOT EXISTS _sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Local change queue (outbound — to be pushed to server)
    CREATE TABLE IF NOT EXISTS _sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('CREATE', 'UPDATE', 'DELETE')),
      record_id TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PUSHING', 'PUSHED', 'FAILED')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON _sync_outbox(status);

    -- =========================================================================
    -- Reference data (global)
    -- =========================================================================

    CREATE TABLE IF NOT EXISTS core_county (
      id TEXT PRIMARY KEY,
      code INTEGER,
      name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_county_name ON core_county(name);

    CREATE TABLE IF NOT EXISTS core_subcounty (
      id TEXT PRIMARY KEY,
      county_id TEXT,
      name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subcounty_county ON core_subcounty(county_id);

    CREATE TABLE IF NOT EXISTS core_ward (
      id TEXT PRIMARY KEY,
      sub_county_id TEXT,
      name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ward_subcounty ON core_ward(sub_county_id);

    CREATE TABLE IF NOT EXISTS encounters_icd10code (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      short_description TEXT,
      description TEXT,
      long_description TEXT,
      category TEXT,
      chapter INTEGER,
      is_billable INTEGER,
      is_active INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_icd10_code ON encounters_icd10code(code);
    CREATE INDEX IF NOT EXISTS idx_icd10_category ON encounters_icd10code(category);

    CREATE TABLE IF NOT EXISTS clinical_templates_clinicaltemplate (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      template_type TEXT,
      specialty TEXT,
      description TEXT,
      content TEXT,
      is_system INTEGER,
      is_active INTEGER,
      usage_count INTEGER,
      created_by_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_template_type ON clinical_templates_clinicaltemplate(template_type);

    -- =========================================================================
    -- Organization-scoped data
    -- =========================================================================

    CREATE TABLE IF NOT EXISTS patients_patient (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      registered_at_facility_id TEXT,
      mrn TEXT,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      last_name TEXT NOT NULL,
      title TEXT,
      date_of_birth TEXT,
      gender TEXT,
      cr_number TEXT,
      sha_number TEXT,
      email TEXT,
      address TEXT,
      citizenship TEXT,
      identification_type TEXT,
      is_person_with_disability INTEGER DEFAULT 0,
      is_sensitive INTEGER DEFAULT 0,
      consent_given INTEGER DEFAULT 0,
      consent_date TEXT,
      consent_deferred INTEGER DEFAULT 0,
      registered_by_id TEXT,
      referral_source TEXT,
      referred_from_facility TEXT,
      county_id TEXT,
      sub_county_id TEXT,
      ward_id TEXT,
      is_deceased INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_patient_mrn ON patients_patient(mrn);
    CREATE INDEX IF NOT EXISTS idx_patient_name ON patients_patient(last_name, first_name);
    CREATE INDEX IF NOT EXISTS idx_patient_org ON patients_patient(organization_id);

    CREATE TABLE IF NOT EXISTS patients_emergencycontact (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      full_name TEXT,
      relationship TEXT,
      phone_number TEXT,
      alternative_phone TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ec_patient ON patients_emergencycontact(patient_id);

    -- =========================================================================
    -- Facility-scoped data
    -- =========================================================================

    CREATE TABLE IF NOT EXISTS encounters_encounter (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      facility_id TEXT,
      patient_id TEXT NOT NULL,
      clinic_visit_id TEXT,
      encounter_type TEXT,
      encounter_date TEXT,
      chief_complaint TEXT,
      temperature REAL,
      pulse INTEGER,
      blood_pressure TEXT,
      respiratory_rate INTEGER,
      spo2 REAL,
      weight REAL,
      height REAL,
      notes TEXT,
      status TEXT,
      triage_requirement TEXT,
      triage_status TEXT,
      consultation_status TEXT,
      created_by_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_encounter_patient ON encounters_encounter(patient_id);
    CREATE INDEX IF NOT EXISTS idx_encounter_date ON encounters_encounter(encounter_date);
    CREATE INDEX IF NOT EXISTS idx_encounter_facility ON encounters_encounter(facility_id);

    CREATE TABLE IF NOT EXISTS triage_triageassessment (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      facility_id TEXT,
      encounter_id TEXT,
      chief_complaint TEXT,
      chief_complaint_category TEXT,
      pain_score INTEGER,
      mental_status TEXT,
      gcs_eye INTEGER,
      gcs_verbal INTEGER,
      gcs_motor INTEGER,
      mobility TEXT,
      arrival_mode TEXT,
      referring_facility_name TEXT,
      allergies_noted TEXT,
      spo2 REAL,
      heart_rate INTEGER,
      systolic_bp INTEGER,
      diastolic_bp INTEGER,
      temperature REAL,
      respiratory_rate INTEGER,
      weight REAL,
      height REAL,
      triage_category TEXT,
      auto_calculated_category TEXT,
      category_override_reason TEXT,
      assigned_area TEXT,
      assigned_clinic_id TEXT,
      assigned_clinician_id TEXT,
      arrival_time TEXT,
      triage_start_time TEXT,
      triage_end_time TEXT,
      seen_by_clinician_time TEXT,
      alerts TEXT,
      triaged_by_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_triage_encounter ON triage_triageassessment(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_triage_facility ON triage_triageassessment(facility_id);

    CREATE TABLE IF NOT EXISTS encounters_diagnosis (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      icd10_code_id TEXT,
      icd11_code TEXT,
      icd11_display TEXT,
      snomed_code TEXT,
      snomed_display TEXT,
      diagnosis_type TEXT,
      free_text_diagnosis TEXT,
      notes TEXT,
      is_confirmed INTEGER DEFAULT 0,
      certainty TEXT,
      diagnosed_by_id TEXT,
      diagnosed_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_diagnosis_encounter ON encounters_diagnosis(encounter_id);

    CREATE TABLE IF NOT EXISTS encounters_treatmentplan (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      template_id TEXT,
      medications_json TEXT,
      procedures_json TEXT,
      clinical_notes TEXT,
      follow_up_instructions TEXT,
      follow_up_date TEXT,
      diet_recommendations TEXT,
      activity_restrictions TEXT,
      referral_needed INTEGER DEFAULT 0,
      referral_specialty TEXT,
      referral_notes TEXT,
      status TEXT,
      created_by_id TEXT,
      approved_by_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tp_encounter ON encounters_treatmentplan(encounter_id);

    CREATE TABLE IF NOT EXISTS encounters_medication (
      id TEXT PRIMARY KEY,
      treatment_plan_id TEXT NOT NULL,
      name TEXT,
      dosage TEXT,
      frequency TEXT,
      duration TEXT,
      route TEXT,
      quantity INTEGER,
      instructions TEXT,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_med_tp ON encounters_medication(treatment_plan_id);

    CREATE TABLE IF NOT EXISTS pharmacy_prescription (
      id TEXT PRIMARY KEY,
      prescription_number TEXT,
      organization_id TEXT,
      facility_id TEXT,
      encounter_id TEXT,
      admission_id TEXT,
      patient_id TEXT,
      prescribed_by_id TEXT,
      prescribed_at TEXT,
      valid_until TEXT,
      status TEXT,
      dispensing_type TEXT,
      is_discharge_medication INTEGER DEFAULT 0,
      clinical_notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_rx_patient ON pharmacy_prescription(patient_id);
    CREATE INDEX IF NOT EXISTS idx_rx_encounter ON pharmacy_prescription(encounter_id);

    CREATE TABLE IF NOT EXISTS pharmacy_prescriptionitem (
      id TEXT PRIMARY KEY,
      prescription_id TEXT NOT NULL,
      drug_id TEXT,
      quantity INTEGER,
      dosage TEXT,
      frequency TEXT,
      duration TEXT,
      route TEXT,
      instructions TEXT,
      quantity_dispensed INTEGER,
      is_substitutable INTEGER DEFAULT 0,
      is_cancelled INTEGER DEFAULT 0,
      cancellation_reason TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_rxi_rx ON pharmacy_prescriptionitem(prescription_id);

    CREATE TABLE IF NOT EXISTS laboratory_laborder (
      id TEXT PRIMARY KEY,
      order_number TEXT,
      organization_id TEXT,
      facility_id TEXT,
      patient_id TEXT,
      encounter_id TEXT,
      admission_id TEXT,
      ordered_by_id TEXT,
      order_type TEXT,
      priority TEXT,
      clinical_notes TEXT,
      status TEXT,
      status_changed_at TEXT,
      status_changed_by_id TEXT,
      specimen_collected INTEGER DEFAULT 0,
      specimen_collected_at TEXT,
      specimen_collected_by_id TEXT,
      sample_type TEXT,
      total_cost REAL,
      is_paid INTEGER DEFAULT 0,
      ordered_at TEXT,
      completed_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lab_patient ON laboratory_laborder(patient_id);
    CREATE INDEX IF NOT EXISTS idx_lab_encounter ON laboratory_laborder(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_lab_status ON laboratory_laborder(status);

    CREATE TABLE IF NOT EXISTS laboratory_laborderitem (
      id TEXT PRIMARY KEY,
      lab_order_id TEXT NOT NULL,
      test_id TEXT,
      status TEXT,
      unit_cost REAL,
      special_instructions TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_loi_order ON laboratory_laborderitem(lab_order_id);

    CREATE TABLE IF NOT EXISTS laboratory_labresult (
      id TEXT PRIMARY KEY,
      order_item_id TEXT,
      specimen_id TEXT,
      numeric_value REAL,
      text_value TEXT,
      option_value TEXT,
      result_unit TEXT,
      reference_low REAL,
      reference_high REAL,
      reference_range_text TEXT,
      result_flag TEXT,
      interpretation TEXT,
      is_critical_result INTEGER DEFAULT 0,
      method TEXT,
      equipment TEXT,
      verification_status TEXT,
      verified_by_id TEXT,
      verified_at TEXT,
      entered_by_id TEXT,
      entered_at TEXT,
      is_amended INTEGER DEFAULT 0,
      amendment_reason TEXT,
      original_value TEXT,
      amended_by_id TEXT,
      amended_at TEXT,
      is_external_result INTEGER DEFAULT 0,
      external_result_date TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lr_item ON laboratory_labresult(order_item_id);

    CREATE TABLE IF NOT EXISTS billing_invoice (
      id TEXT PRIMARY KEY,
      invoice_number TEXT,
      organization_id TEXT,
      facility_id TEXT,
      patient_id TEXT,
      encounter_id TEXT,
      clinic_visit_id TEXT,
      status TEXT,
      payment_type TEXT,
      invoice_date TEXT,
      due_date TEXT,
      discount_type TEXT,
      discount_value REAL,
      subtotal REAL,
      tax_amount REAL,
      discount_amount REAL,
      discount_reason TEXT,
      total_amount REAL,
      amount_paid REAL,
      balance_due REAL,
      insurance_provider TEXT,
      insurance_member_no TEXT,
      sha_claim_number TEXT,
      insurance_amount REAL,
      insurance_coverage REAL,
      notes TEXT,
      created_by_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_inv_patient ON billing_invoice(patient_id);
    CREATE INDEX IF NOT EXISTS idx_inv_encounter ON billing_invoice(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_inv_status ON billing_invoice(status);

    -- =========================================================================
    -- Scheduling (for shift enforcement in desktop mode)
    -- =========================================================================

    CREATE TABLE IF NOT EXISTS scheduling_shift (
      id TEXT PRIMARY KEY,
      facility_id TEXT,
      staff_id TEXT,
      room_id TEXT,
      clinic_id TEXT,
      shift_type TEXT,
      shift_date TEXT,
      start_time TEXT,
      end_time TEXT,
      status TEXT,
      clock_in_time TEXT,
      clock_out_time TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_shift_staff ON scheduling_shift(staff_id);
    CREATE INDEX IF NOT EXISTS idx_shift_date ON scheduling_shift(shift_date);
    CREATE INDEX IF NOT EXISTS idx_shift_facility ON scheduling_shift(facility_id);

    -- Record initial schema version
    INSERT OR IGNORE INTO _schema_version (version) VALUES (1);
  `);
}
