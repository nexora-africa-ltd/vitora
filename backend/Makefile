.PHONY: help install test lint format type-check security clean

help:
	@echo "Vitora HMIS Backend - Make Commands"
	@echo "===================================="
	@echo ""
	@echo "Development:"
	@echo "  install       - Install dependencies with Poetry"
	@echo "  runserver     - Run the Django development server"
	@echo "  api           - Start ASGI server on port 9088 with WebSocket support (background)"
	@echo "  api-wsgi      - Start WSGI server on port 9088 without WebSocket (background)"
	@echo "  kill-api      - Kill process running on port 9088"
	@echo "  shell         - Open Django shell"
	@echo ""
	@echo "Testing:"
	@echo "  test          - Run tests with coverage"
	@echo "  test-fast     - Run tests without coverage"
	@echo "  test-unit     - Run unit tests only"
	@echo "  test-integration - Run integration tests only"
	@echo "  test-contracts - Run serializer contract tests"
	@echo "  test-fhir     - Run FHIR validation tests"
	@echo "  test-shr      - Run SHA SHR compliance tests"
	@echo "  test-fhir-integration - Run FHIR server integration tests"
	@echo "  test-fhir-all - Run all FHIR tests (schema + integration)"
	@echo "  test-fhir-full - Full cycle: start server, test, stop"
	@echo ""
	@echo "Per-app tests (fast, no coverage):"
	@echo "  test-encounters  test-patients    test-triage"
	@echo "  test-lab         test-pharmacy    test-imaging"
	@echo "  test-clinics     test-billing     test-inpatient"
	@echo "  test-ai          test-cds         test-rbac"
	@echo "  test-mch         test-scheduling  test-checkin"
	@echo "  test-surveillance test-dashboard  test-notifications"
	@echo ""
	@echo "Code Quality:"
	@echo "  lint          - Run all linters (ruff, black check, isort check)"
	@echo "  format        - Format code with black and isort"
	@echo "  type-check    - Run mypy type checking"
	@echo "  security      - Run bandit security scan"
	@echo "  quality       - Run all quality checks (lint + type-check + security)"
	@echo "  pre-commit    - Run all checks before committing"
	@echo ""
	@echo "Database:"
	@echo "  showmigrations - Show Django migrations"
	@echo "  makemigrations - Create new database migrations"
	@echo "  migrate       - Apply database migrations"
	@echo "  createsuperuser - Create a Django superuser"
	@echo ""
	@echo "Data Import:"
	@echo "  import-locations - Import Kenya locations (counties, sub-counties, wards)"
	@echo "  import-icd10    - Import ICD-10 diagnosis codes"
	@echo "  import-loinc    - Import LOINC laboratory codes"
	@echo "  import-drugs    - Import drug catalog"
	@echo "  load-roles      - Load default roles and permissions"
	@echo "  load-templates  - Load clinical templates"
	@echo "  load-lab-ranges - Load laboratory reference ranges"
	@echo "  create-lab-queues - Create missing laboratory queues"
	@echo "  create-test-user - Create test user (admin/voXOQkM4Tn6qCNQTy)"
	@echo "  seed-diseases   - Seed MOH 502 notifiable diseases"
	@echo "  seed-diseases-update - Update diseases from JSON"
	@echo "  seed-surveillance - Seed surveillance demo cases for DHIS2 testing"
	@echo "  seed-surveillance-clear - Clear and re-seed surveillance demo data"
	@echo "  init-pki        - Initialize PKI Certificate Authority (idempotent)"
	@echo "  import-all      - Run all data imports"
	@echo ""
	@echo "Setup:"
	@echo "  setup-db       - Setup database with all data + superuser prompt"
	@echo "  setup-db-quick - Setup database with test user (no prompts)"
	@echo ""
	@echo "Docker:"
	@echo "  docker-up     - Start Docker containers"
	@echo "  docker-down   - Stop Docker containers"
	@echo "  docker-build  - Build Docker images"
	@echo "  docker-restart - Restart Docker containers"
	@echo ""
	@echo "FHIR Integration (Phase 3):"
	@echo "  fhir-server-up      - Start HAPI FHIR R4 server"
	@echo "  fhir-server-down    - Stop HAPI FHIR server"
	@echo "  fhir-server-status  - Check FHIR server status"
	@echo "  fhir-server-logs    - View FHIR server logs"
	@echo ""
	@echo "Git Workflow:"
	@echo "  merge-to-main       - Merge current branch to main and push"
	@echo ""
	@echo "Cleanup:"
	@echo "  clean         - Remove generated files and caches"

install:
	poetry install

test:
	poetry run pytest --cov=hmis --cov-report=term-missing --cov-report=html --cov-report=xml --cov-fail-under=80

test-fast:
	poetry run pytest --no-cov --tb=short -q

test-fast-fail:
	poetry run pytest tests/ --no-cov --tb=short -x 

test-unit:
	poetry run pytest -m unit

test-integration:
	poetry run pytest -m integration

test-contracts:
	poetry run pytest tests/contracts/ -v --no-cov

test-encounters:
	poetry run pytest tests/encounters/ --no-cov --tb=short -q

test-patients:
	poetry run pytest tests/patients/ --no-cov --tb=short -q

test-triage:
	poetry run pytest tests/triage/ --no-cov --tb=short -q

test-lab:
	poetry run pytest tests/laboratory/ --no-cov --tb=short -q

test-pharmacy:
	poetry run pytest tests/pharmacy/ --no-cov --tb=short -q

test-imaging:
	poetry run pytest tests/imaging/ --no-cov --tb=short -q

test-clinics:
	poetry run pytest tests/clinics/ --no-cov --tb=short -q

test-billing:
	poetry run pytest tests/billing/ --no-cov --tb=short -q

test-inpatient:
	poetry run pytest tests/inpatient/ --no-cov --tb=short -q

test-ai:
	poetry run pytest tests/ai/ --no-cov --tb=short -q

test-cds:
	poetry run pytest tests/cds/ --no-cov --tb=short -q

test-rbac:
	poetry run pytest tests/rbac/ --no-cov --tb=short -q

test-mch:
	poetry run pytest tests/mch/ --no-cov --tb=short -q

test-scheduling:
	poetry run pytest tests/scheduling/ --no-cov --tb=short -q

test-checkin:
	poetry run pytest tests/checkin/ --no-cov --tb=short -q

test-surveillance:
	poetry run pytest tests/surveillance/ --no-cov --tb=short -q

test-dashboard:
	poetry run pytest tests/dashboard/ --no-cov --tb=short -q

test-notifications:
	poetry run pytest tests/notifications/ --no-cov --tb=short -q

test-fhir:
	poetry run pytest tests/core/test_fhir_validator.py tests/billing/test_shr_compliance/ -v --cov=hmis.apps.core.services.fhir_validator --cov-report=term-missing

test-shr:
	poetry run pytest tests/billing/test_shr_compliance/ -v

test-watch:
	poetry run pytest-watch

lint:
	poetry run ruff check .
	poetry run black --check .
	poetry run isort --check .

format:
	poetry run black .
	poetry run isort .

ruff:
	poetry run ruff check .

ruff-fix:
	poetry run ruff check . --fix

black:
	poetry run black --check .

black-format:
	poetry run black .

isort:
	poetry run isort --check .

isort-format:
	poetry run isort .

type-check:
	poetry run mypy hmis --ignore-missing-imports

security:
	poetry run bandit -r hmis

quality: lint type-check security
	@echo "All quality checks passed!"

pre-commit: format quality test
	@echo "Pre-commit checks complete!"

cloc:
	cloc . --exclude-dir=tests,venv,.venv,node_modules,__tests__,.mypy_cache,.pytest_cache,.ruff_cache,dist,build,__pycache__

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*.coverage" -delete
	rm -rf htmlcov/
	rm -rf .coverage
	rm -rf coverage.xml
	rm -rf .pytest_cache/
	rm -rf .mypy_cache/
	rm -rf .ruff_cache/
	rm -rf dist/
	rm -rf build/
	rm -rf *.egg-info

coverage-html:
	poetry run pytest --cov=hmis --cov-report=html
	@echo "Coverage report generated in htmlcov/index.html"

coverage-report:
	poetry run coverage report

showmigrations:
	poetry run python manage.py showmigrations

makemigrations:
	poetry run python manage.py makemigrations

migrate:
	poetry run python manage.py migrate

createsuperuser:
	poetry run python manage.py createsuperuser

api:
	@echo "Starting ASGI server with WebSocket support on port 9088..."
	poetry run daphne -b 0.0.0.0 -p 9088 hmis.asgi:application &

api-wsgi:
	@echo "Starting WSGI server (no WebSocket support) on port 9088..."
	poetry run python manage.py runserver 0.0.0.0:9088 &

kill-api:
	@echo "Killing daphne/python server on port 9088..."
	@lsof -ti:9088 -sTCP:LISTEN | while read pid; do \
		cmd=$$(ps -p $$pid -o comm= 2>/dev/null); \
		if echo "$$cmd" | grep -qE "daphne|python"; then \
			kill $$pid 2>/dev/null && echo "Killed $$cmd (PID $$pid)"; \
		fi; \
	done || echo "No daphne/python server running on port 9088"

shell:
	poetry run python manage.py shell

schema:
	poetry run python manage.py spectacular --file schema.json
	@echo "OpenAPI schema generated at schema.json"

# ============================================================================
# Data Import Commands
# ============================================================================

import-locations:
	@echo "Importing Kenya locations (counties, sub-counties, wards)..."
	poetry run python manage.py import_kenya_locations data/kenya_locations.csv

import-icd10:
	@echo "Importing ICD-10 diagnosis codes..."
	poetry run python manage.py import_icd10 data/icd10_kenya_common.csv

import-loinc:
	@echo "Importing LOINC laboratory codes..."
	poetry run python manage.py import_loinc

import-drugs:
	@echo "Importing drug catalog..."
	poetry run python manage.py import_drugs

load-roles:
	@echo "Loading default roles and permissions..."
	poetry run python manage.py load_default_roles
	@echo "Syncing Role permissions_matrix to Django Groups..."
	poetry run python manage.py sync_role_permissions

load-templates:
	@echo "Loading clinical templates..."
	poetry run python manage.py load_clinical_templates

load-lab-ranges:
	@echo "Loading laboratory reference ranges..."
	poetry run python manage.py load_lab_reference_ranges

create-lab-queues:
	@echo "Creating missing laboratory queues..."
	poetry run python manage.py create_missing_lab_queues

create-test-user:
	@echo "Creating test user..."
	poetry run python manage.py create_test_user

seed-diseases:
	@echo "Seeding MOH 502 notifiable diseases..."
	poetry run python manage.py seed_notifiable_diseases

seed-diseases-update:
	@echo "Updating MOH 502 notifiable diseases from JSON..."
	poetry run python manage.py seed_notifiable_diseases --update

seed-surveillance:
	@echo "Seeding surveillance demo data for DHIS2 testing..."
	poetry run python manage.py seed_surveillance_demo

seed-surveillance-clear:
	@echo "Clearing and re-seeding surveillance demo data..."
	poetry run python manage.py seed_surveillance_demo --clear --regenerate

seed-kepi:
	@echo "Seeding KEPI immunization schedule..."
	poetry run python manage.py seed_kepi_schedule

# Initialize PKI Certificate Authority (idempotent - skips if already exists)
init-pki:
	@echo "Initializing PKI Certificate Authority..."
	poetry run python manage.py init_pki_ca

# Import all data - run after fresh database setup
import-all: migrate import-locations import-icd10 import-loinc import-drugs load-roles load-templates load-lab-ranges create-lab-queues seed-diseases seed-kepi init-pki
	@echo "All data imports complete!"

# Setup fresh database with all data
setup-db: migrate import-all createsuperuser
	@echo "Database setup complete with all reference data!"

# Quick setup (no superuser prompt)
setup-db-quick: migrate import-all create-test-user
	@echo "Database setup complete with test user (admin/voXOQkM4Tn6qCNQTy)!"

# Seed surveillance demo data with optional clearing and regeneration
seed-surveillance-demo:
	@echo "Seeding surveillance demo data for DHIS2 testing..."
	poetry run python manage.py seed_surveillance_demo $(if $(clear),--clear) $(if $(regenerate),--regenerate)

# Seed quality measures
seed-quality-measures:
	@echo "Seeding quality measures..."
	poetry run python manage.py seed_quality_measures

# Seed CDS rules
seed-cds-rules:
	@echo "Seeding CDS rules..."
	poetry run python manage.py seed_cds_rules


# ============================================================================
# Docker Commands
# ============================================================================

docker-up:
	docker compose up -d
	@echo "Docker containers started."
docker-down:
	docker compose down
	@echo "Docker containers stopped."
docker-build:
	docker compose build
	@echo "Docker images built."
docker-restart:
	docker compose down
	docker compose up -d
	@echo "Docker containers restarted."

# ============================================================================
# FHIR Integration Testing (Phase 3)
# ============================================================================

# Start HAPI FHIR server for integration testing
fhir-server-up:
	@echo "Starting HAPI FHIR R4 server..."
	docker compose -f ../docker/hapi-fhir/compose.yml up -d
	@echo "Waiting for server to be ready (may take 60-90 seconds)..."
	@timeout 120 bash -c 'until curl -sf http://localhost:8090/fhir/metadata > /dev/null 2>&1; do sleep 5; echo "Waiting..."; done' || (echo "Server failed to start" && exit 1)
	@echo "HAPI FHIR server is ready at http://localhost:8090/fhir"

# Stop HAPI FHIR server
fhir-server-down:
	@echo "Stopping HAPI FHIR server..."
	docker compose -f ../docker/hapi-fhir/compose.yml down
	@echo "HAPI FHIR server stopped."

# Check FHIR server status
fhir-server-status:
	@curl -sf http://localhost:8090/fhir/metadata > /dev/null 2>&1 && echo "✅ FHIR server is running" || echo "❌ FHIR server is not running"

# View FHIR server logs
fhir-server-logs:
	docker compose -f ../docker/hapi-fhir/compose.yml logs -f

# Run FHIR integration tests against HAPI FHIR server
# Requires: make fhir-server-up
test-fhir-integration:
	@echo "Running FHIR integration tests..."
	@curl -sf http://localhost:8090/fhir/metadata > /dev/null 2>&1 || (echo "Error: FHIR server not running. Run 'make fhir-server-up' first." && exit 1)
	FHIR_SERVER_URL=http://localhost:8090/fhir poetry run pytest tests/integration/test_fhir_server.py -v -m integration --tb=short

# Run FHIR integration tests with coverage
test-fhir-integration-cov:
	@curl -sf http://localhost:8090/fhir/metadata > /dev/null 2>&1 || (echo "Error: FHIR server not running. Run 'make fhir-server-up' first." && exit 1)
	FHIR_SERVER_URL=http://localhost:8090/fhir poetry run pytest tests/integration/test_fhir_server.py -v -m integration --cov=hmis.apps.core.services.fhir_client --cov-report=term-missing

# Run all FHIR tests (schema + integration)
test-fhir-all: test-fhir
	@echo ""
	@echo "Running integration tests (requires HAPI FHIR server)..."
	@curl -sf http://localhost:8090/fhir/metadata > /dev/null 2>&1 && \
		(FHIR_SERVER_URL=http://localhost:8090/fhir poetry run pytest tests/integration/test_fhir_server.py -v -m integration --tb=short) || \
		echo "⚠️  Skipping integration tests: FHIR server not running"

# Full FHIR test cycle: start server, run tests, stop server
test-fhir-full:
	@echo "=== Full FHIR Test Cycle ==="
	$(MAKE) fhir-server-up
	$(MAKE) test-fhir
	$(MAKE) test-fhir-integration
	$(MAKE) fhir-server-down
	@echo "=== FHIR Test Cycle Complete ==="

# ============================================================================
# Git Workflow Commands
# ============================================================================

# Merge current branch to main and push
# Usage: make merge-to-main
# - Saves current branch name
# - Switches to main, pulls latest
# - Merges current branch (fast-forward or merge commit)
# - Pushes to origin
# - Returns to original branch
merge-to-main:
	@CURRENT_BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$CURRENT_BRANCH" = "main" ]; then \
		echo "Error: Already on main branch. Switch to a feature branch first."; \
		exit 1; \
	fi; \
	echo "Merging $$CURRENT_BRANCH → main..."; \
	git checkout main && \
	git pull origin main && \
	git merge $$CURRENT_BRANCH --no-edit && \
	git push origin main && \
	git checkout $$CURRENT_BRANCH && \
	echo "✅ Successfully merged $$CURRENT_BRANCH to main and pushed"
