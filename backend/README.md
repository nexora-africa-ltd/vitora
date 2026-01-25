# Vitora HMIS Backend

## Setup

### Prerequisites
- Python 3.12+
- Poetry (Python dependency management)

### Installation

1. Install Poetry (if not already installed):
```bash
curl -sSL https://install.python-poetry.org | python3 -
```

2. Install dependencies:
```bash
cd backend
poetry install
```

3. Activate virtual environment:
```bash
poetry shell
```

## Development

### Git Hooks (Mandatory)

This repo runs `pre-commit` on every commit via a versioned hook stored in `.githooks/`.

Enable once per clone:

```bash
cd ..
./scripts/setup-git-hooks.sh
```

### Running Tests

```bash
# Run all tests
poetry run pytest

# Run with coverage
poetry run pytest --cov=hmis --cov-report=html

# Run specific test file
poetry run pytest tests/test_example.py

# Run tests with markers
poetry run pytest -m unit
poetry run pytest -m integration
```

### Code Quality

```bash
# Run Ruff linter
poetry run ruff check .

# Auto-fix Ruff issues
poetry run ruff check . --fix

# Run Black formatter
poetry run black .

# Check Black formatting
poetry run black --check .

# Run isort
poetry run isort .

# Run mypy type checking
poetry run mypy hmis

# Run Bandit security checks
poetry run bandit -r hmis
```

### All Quality Checks (Pre-commit)

```bash
# Run all checks before committing
poetry run ruff check .
poetry run black --check .
poetry run isort --check .
poetry run mypy hmis
poetry run pytest --cov=hmis --cov-fail-under=80
poetry run bandit -r hmis
```

## Celery (Optional)

Celery is used for background tasks (offline sync, reminders/alerts, and monthly clinic reporting). It is optional in local development unless you’re testing async flows.

### Environment

Set a broker URL (Redis recommended):

```bash
CELERY_BROKER_URL=redis://localhost:6379/0
```

### Run Worker + Beat

In two terminals:

```bash
cd backend
poetry run celery -A hmis worker --loglevel=info
```

```bash
cd backend
poetry run celery -A hmis beat --loglevel=info
```

### Monthly Clinic Reports

The monthly clinic reports task is scheduled via Celery Beat (see `hmis/celery.py`) to run on the **1st of every month at 01:00** (Africa/Nairobi). It generates reports for the **previous month** by default.

## Project Structure

```
backend/
├── hmis/               # Main application package
│   ├── __init__.py
│   ├── settings/       # Settings modules
│   ├── apps/           # Django apps
│   ├── core/           # Core utilities
│   └── urls.py
├── tests/              # Test suite
│   ├── __init__.py
│   ├── conftest.py     # Pytest configuration
│   └── test_*.py       # Test files
├── pyproject.toml      # Poetry configuration
└── README.md           # This file
```

## Configuration

The project uses `pyproject.toml` for all tool configurations:
- Poetry dependencies
- Pytest settings
- Coverage settings
- Ruff linting rules
- Black formatting rules
- isort import sorting
- mypy type checking
- Bandit security scanning

## Testing Standards

- **Minimum Coverage**: 80%
- **Test Types**: Unit, Integration, E2E
- **Naming**: `test_*.py` or `*_test.py`
- **Markers**: Use `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.e2e`

## CI/CD

The CI/CD pipeline automatically runs:
1. Ruff linting
2. Black formatting check
3. isort import check
4. mypy type checking
5. Pytest with coverage (≥80%)
6. Bandit security scanning

All checks must pass before merging to main branch.
