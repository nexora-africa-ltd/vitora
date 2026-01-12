.PHONY: help install test lint format type-check security clean

help:
	@echo "Vitora HMIS Backend - Make Commands"
	@echo "===================================="
	@echo ""
	@echo "Development:"
	@echo "  install       - Install dependencies with Poetry"
	@echo "  runserver     - Run the Django development server"
	@echo "  shell         - Open Django shell"
	@echo ""
	@echo "Testing:"
	@echo "  test          - Run tests with coverage"
	@echo "  test-fast     - Run tests without coverage"
	@echo "  test-unit     - Run unit tests only"
	@echo "  test-integration - Run integration tests only"
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
	@echo "  create-test-user - Create test user (admin/a8nD7gDlRxDTrQ/voXOQkM4Tn6qCNQTy)"
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
	@echo "Cleanup:"
	@echo "  clean         - Remove generated files and caches"

install:
	poetry install

test:
	poetry run pytest --cov=hmis --cov-report=term-missing --cov-report=html --cov-report=xml --cov-fail-under=80

test-fast:
	poetry run pytest -x

test-unit:
	poetry run pytest -m unit

test-integration:
	poetry run pytest -m integration

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

runserver:
	poetry run python manage.py runserver

shell:	
	poetry run python manage.py shell

# ============================================================================
# Data Import Commands
# ============================================================================

import-locations:
	@echo "Importing Kenya locations (counties, sub-counties, wards)..."
	poetry run python manage.py import_kenya_locations

import-icd10:
	@echo "Importing ICD-10 diagnosis codes..."
	poetry run python manage.py import_icd10

import-loinc:
	@echo "Importing LOINC laboratory codes..."
	poetry run python manage.py import_loinc

import-drugs:
	@echo "Importing drug catalog..."
	poetry run python manage.py import_drugs

load-roles:
	@echo "Loading default roles and permissions..."
	poetry run python manage.py load_default_roles

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

# Import all data - run after fresh database setup
import-all: migrate import-locations import-icd10 import-loinc import-drugs load-roles load-templates load-lab-ranges create-lab-queues
	@echo "All data imports complete!"

# Setup fresh database with all data
setup-db: migrate import-all createsuperuser
	@echo "Database setup complete with all reference data!"

# Quick setup (no superuser prompt)
setup-db-quick: migrate import-all create-test-user
	@echo "Database setup complete with test user (admin/a8nD7gDlRxDTrQ/voXOQkM4Tn6qCNQTy)!"

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