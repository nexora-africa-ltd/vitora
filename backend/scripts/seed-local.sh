#!/usr/bin/env bash
# =============================================================================
# Local Data Seeding Script for Vitora HMIS (uses Poetry)
# =============================================================================
# Run from the backend/ directory:
#   bash scripts/seed-local.sh
# =============================================================================
set -e

echo "==> Seeding Vitora HMIS data (local/Poetry)..."

poetry run python manage.py import_kenya_locations data/kenya_locations.csv
poetry run python manage.py import_icd10 data/icd10_kenya_common.csv
poetry run python manage.py import_loinc
poetry run python manage.py import_drugs --file data/drug_catalog.csv
poetry run python manage.py load_clinical_templates
poetry run python manage.py load_lab_reference_ranges
poetry run python manage.py load_default_roles
poetry run python manage.py sync_role_permissions
poetry run python manage.py seed_kepi_schedule
echo "from hmis.apps.encounters.models import Encounter; Encounter.objects.filter(status__in=['DRAFT','COMPLETED']).update(status='CREATED')" | poetry run python manage.py shell
poetry run python manage.py seed_facilities
poetry run python manage.py seed_demo_data
poetry run python manage.py seed_imaging_catalog
poetry run python manage.py seed_pharmacy_stock
poetry run python manage.py seed_notifiable_diseases
poetry run python manage.py seed_surveillance_demo
poetry run python manage.py setup_allied_health_permissions
poetry run python manage.py seed_allied_health_data
poetry run python manage.py seed_quality_measures
poetry run python manage.py seed_cds_rules
poetry run python manage.py seed_er_beds
poetry run python manage.py seed_snomed_common
poetry run python manage.py seed_kenhdd_elements
poetry run python manage.py seed_bed_assignment_rules
poetry run python manage.py seed_allied_health_demo
poetry run python manage.py generate_ward_beds
poetry run python manage.py seed_inpatient_demo --clear
poetry run python manage.py backfill_death_records --apply
poetry run python manage.py init_pki_ca
poetry run python manage.py seed_procedure_catalog --link-billing
poetry run python manage.py seed_service_catalog
poetry run python manage.py seed_vaccines
poetry run python manage.py seed_demo_vaccine_stock
poetry run python manage.py seed_discharge_templates
poetry run python manage.py backfill_org_facility

echo "==> Seeding complete!"
