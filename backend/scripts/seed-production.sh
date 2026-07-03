#!/usr/bin/env bash
# =============================================================================
# Production Data Seeding Script for Vitora HMIS
# =============================================================================
# Seeds ONLY reference/catalog data needed for production.
# NO demo patients, NO fake encounters, NO test data.
#
# Run ONCE after first deploy:
#   az containerapp exec -n vitora-api-prod -g vitora-rg \
#     --command "bash scripts/seed-production.sh"
#
# Safe to re-run (all commands are idempotent).
# =============================================================================
set -e

echo "=============================================="
echo "  Vitora HMIS — Production Data Seed"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# 1. RBAC & Permissions (must run first — other seeds may reference roles)
# ---------------------------------------------------------------------------
echo "==> [1/12] Loading roles & permissions..."
python manage.py load_default_roles
python manage.py sync_role_permissions
python manage.py setup_allied_health_permissions

# ---------------------------------------------------------------------------
# 2. Kenya Reference Data (locations, diseases, codes)
# ---------------------------------------------------------------------------
echo "==> [2/12] Importing Kenya locations (47 counties, 289 sub-counties, 1448 wards)..."
python manage.py import_kenya_locations data/kenya_locations.csv

echo "==> [3/12] Importing ICD-10 codes..."
python manage.py import_icd10 data/icd10_kenya_common.csv

echo "==> [3b/12] Importing ICD-11 codes..."
python manage.py import_icd11 data/ICD-11.csv

echo "==> [4/12] Importing LOINC codes..."
python manage.py import_loinc

echo "==> [5/12] Importing SNOMED CT common terms..."
python manage.py seed_snomed_common

echo "==> [6/12] Importing KENHDD data elements..."
python manage.py seed_kenhdd_elements

# ---------------------------------------------------------------------------
# 3. Clinical Catalogs (drugs, procedures, services, templates)
# ---------------------------------------------------------------------------
echo "==> [7/12] Importing drug catalog..."
python manage.py import_drugs --file data/drug_catalog.csv

echo "==> [8/12] Seeding procedure catalog..."
python manage.py seed_procedure_catalog --link-billing

echo "==> [9/12] Seeding service catalog..."
python manage.py seed_service_catalog

echo "==> [10/12] Loading clinical & discharge templates..."
python manage.py load_clinical_templates
python manage.py seed_discharge_templates

echo "==> [11/12] Loading lab reference ranges..."
python manage.py load_lab_reference_ranges

# ---------------------------------------------------------------------------
# 4. Public Health & Surveillance
# ---------------------------------------------------------------------------
echo "==> [12/12] Seeding notifiable diseases & outbreak thresholds..."
python manage.py seed_notifiable_diseases
python manage.py seed_outbreak_thresholds

# ---------------------------------------------------------------------------
# 5. Platform Configuration
# ---------------------------------------------------------------------------
echo "==> Seeding feature flags..."
python manage.py seed_feature_flags

echo "==> Seeding subscription plans..."
python manage.py seed_subscription_plans

echo "==> Seeding KEPI immunization schedule..."
python manage.py seed_kepi_schedule

echo "==> Seeding CDS (Clinical Decision Support) rules..."
python manage.py seed_cds_rules

echo "==> Seeding quality measures (Kenya indicators)..."
python manage.py seed_quality_measures

echo "==> Seeding vaccine definitions..."
python manage.py seed_vaccines

echo "==> Seeding surgical procedure catalog & theatre roles..."
python manage.py seed_surgical_procedures
python manage.py seed_theatre_roles

echo "==> Seeding allied health reference data..."
python manage.py seed_allied_health_data

echo "==> Seeding imaging catalog..."
python manage.py seed_imaging_catalog

echo "==> Seeding lab analyzer templates..."
python manage.py seed_analyzer_templates

echo "==> Seeding lab auto-verify defaults..."
python manage.py seed_autoverify_defaults

# ---------------------------------------------------------------------------
# 6. PKI / Security Infrastructure
# ---------------------------------------------------------------------------
echo "==> Initializing PKI Certificate Authority..."
python manage.py init_pki_ca

# ---------------------------------------------------------------------------
# 7. Data Integrity Backfills (safe on empty DB, needed if migrating)
# ---------------------------------------------------------------------------
echo "==> Running backfills..."
python manage.py backfill_org_facility
python manage.py backfill_death_records --apply
python manage.py create_missing_lab_queues
python manage.py generate_ward_beds
python manage.py seed_bed_assignment_rules

echo ""
echo "=============================================="
echo "  ✅ Production seed complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Create superuser:  python manage.py create_superuser"
echo "  2. Verify health:     curl https://api.vitora.digital/api/health/"
echo "  3. Remove RUN_SEED=true if set"
echo ""
