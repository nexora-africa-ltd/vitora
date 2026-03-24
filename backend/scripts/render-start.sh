#!/usr/bin/env bash
set -e

echo "==> Collecting static files..."
python manage.py collectstatic --noinput

echo "==> Running migrations..."
python manage.py migrate --noinput

if [ "${SKIP_FULL_SEED:-false}" = "true" ]; then
  echo "SKIP_FULL_SEED=true: Skipping full data seed, only ran migrations"
else
  echo "==> Seeding data..."
  python manage.py import_kenya_locations data/kenya_locations.csv
  python manage.py import_icd10 data/icd10_kenya_common.csv
  python manage.py import_drugs --file data/drug_catalog.csv
  python manage.py load_clinical_templates
  python manage.py load_lab_reference_ranges
  python manage.py load_default_roles
  python manage.py seed_kepi_schedule
  echo "from hmis.apps.encounters.models import Encounter; Encounter.objects.filter(status__in=['DRAFT','COMPLETED']).update(status='CREATED')" | python manage.py shell
  python manage.py seed_facilities
  python manage.py seed_demo_data
  python manage.py seed_imaging_catalog
  python manage.py seed_pharmacy_stock
  python manage.py seed_notifiable_diseases
  python manage.py seed_surveillance_demo
  python manage.py setup_allied_health_permissions
  python manage.py seed_allied_health_data
  python manage.py seed_quality_measures
  python manage.py seed_cds_rules
  python manage.py seed_er_beds
  python manage.py seed_snomed_common
  python manage.py seed_kenhdd_elements
  python manage.py seed_bed_assignment_rules
  python manage.py seed_allied_health_demo
  python manage.py seed_inpatient_demo
  python manage.py init_pki_ca
fi

echo "==> Starting Daphne..."
exec daphne -b 0.0.0.0 -p "$PORT" hmis.asgi:application
