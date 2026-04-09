-- =============================================================================
-- PowerSync Logical Replication Setup for Vitora HMIS
-- =============================================================================
-- Run this script against the production PostgreSQL database to enable
-- logical replication for the PowerSync service.
--
-- Prerequisites:
--   - PostgreSQL 10+ with wal_level = logical (Neon has this by default)
--   - Superuser or role with CREATEROLE privilege
--
-- Usage:
--   psql $DATABASE_URL -f scripts/setup_powersync_replication.sql
-- =============================================================================

-- 1. Create a dedicated replication user for PowerSync
-- The password should be set via environment variable POWERSYNC_DB_PASSWORD
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'powersync_replicator') THEN
        CREATE ROLE powersync_replicator WITH LOGIN REPLICATION PASSWORD 'CHANGE_ME';
        RAISE NOTICE 'Created role powersync_replicator';
    ELSE
        RAISE NOTICE 'Role powersync_replicator already exists';
    END IF;
END
$$;

-- 2. Grant SELECT on all tables in the public schema
-- PowerSync needs to read table data for initial snapshots and ongoing replication
GRANT USAGE ON SCHEMA public TO powersync_replicator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_replicator;

-- Ensure future tables are also readable
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO powersync_replicator;

-- 3. Create a publication for the tables PowerSync will replicate
-- Includes Phase 1 (core), Phase 2 (clinical), Phase 3 (pharmacy/lab/billing)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'powersync') THEN
        CREATE PUBLICATION powersync FOR TABLE
            -- Phase 1: Core tables
            patients_patient,
            patients_emergencycontact,
            encounters_encounter,
            core_county,
            core_subcounty,
            core_ward,
            -- Phase 2: Clinical workflow
            encounters_icd10code,
            clinical_templates_clinicaltemplate,
            triage_triageassessment,
            encounters_diagnosis,
            encounters_treatmentplan,
            encounters_medication,
            -- Phase 3: Pharmacy, Laboratory, Billing
            pharmacy_prescription,
            pharmacy_prescriptionitem,
            laboratory_laborder,
            laboratory_laborderitem,
            laboratory_labresult,
            billing_invoice;
        RAISE NOTICE 'Created publication powersync';
    ELSE
        RAISE NOTICE 'Publication powersync already exists';
    END IF;
END
$$;

-- If adding tables to an existing publication, run these ALTER statements instead:
-- (Uncomment and run manually as needed)
--
-- -- Phase 2
-- ALTER PUBLICATION powersync ADD TABLE encounters_icd10code;
-- ALTER PUBLICATION powersync ADD TABLE clinical_templates_clinicaltemplate;
-- ALTER PUBLICATION powersync ADD TABLE triage_triageassessment;
-- ALTER PUBLICATION powersync ADD TABLE encounters_diagnosis;
-- ALTER PUBLICATION powersync ADD TABLE encounters_treatmentplan;
-- ALTER PUBLICATION powersync ADD TABLE encounters_medication;
--
-- -- Phase 3
-- ALTER PUBLICATION powersync ADD TABLE pharmacy_prescription;
-- ALTER PUBLICATION powersync ADD TABLE pharmacy_prescriptionitem;
-- ALTER PUBLICATION powersync ADD TABLE laboratory_laborder;
-- ALTER PUBLICATION powersync ADD TABLE laboratory_laborderitem;
-- ALTER PUBLICATION powersync ADD TABLE laboratory_labresult;
-- ALTER PUBLICATION powersync ADD TABLE billing_invoice;

-- 4. Verify setup
SELECT 'wal_level' AS setting, current_setting('wal_level') AS value
UNION ALL
SELECT 'max_replication_slots', current_setting('max_replication_slots')
UNION ALL
SELECT 'max_wal_senders', current_setting('max_wal_senders');

-- Show publication tables
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'powersync';
