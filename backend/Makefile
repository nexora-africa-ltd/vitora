.PHONY: help install test lint format type-check security clean

help:
	@echo "Vitora HMIS Backend - Make Commands"
	@echo "===================================="
	@echo "install       - Install dependencies with Poetry"
	@echo "test          - Run tests with coverage"
	@echo "test-fast     - Run tests without coverage"
	@echo "test-unit     - Run unit tests only"
	@echo "test-integration - Run integration tests only"
	@echo "lint          - Run all linters (ruff, black check, isort check)"
	@echo "format        - Format code with black and isort"
	@echo "ruff          - Run ruff linter"
	@echo "ruff-fix      - Run ruff linter with auto-fix"
	@echo "black         - Check code formatting with black"
	@echo "black-format  - Format code with black"
	@echo "isort         - Check import sorting"
	@echo "isort-format  - Sort imports"
	@echo "type-check    - Run mypy type checking"
	@echo "security      - Run bandit security scan"
	@echo "quality       - Run all quality checks (lint + type-check + security)"
	@echo "pre-commit    - Run all checks before committing"
	@echo "clean         - Remove generated files and caches"
	@echo "coverage-html - Generate HTML coverage report"
	@echo "coverage-report - Show coverage report"
	@echo "showmigrations - Show Django migrations"
	@echo "makemigrations - Create new database migrations"
	@echo "migrate       - Apply database migrations"
	@echo "createsuperuser - Create a Django superuser"
	@echo "runserver     - Run the Django development server"
	@echo "shell         - Open Django shell"
	@echo "docker-up     - Start Docker containers"
	@echo "docker-down   - Stop Docker containers"
	@echo "docker-build  - Build Docker images"
	@echo "docker-restart - Restart Docker containers"

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