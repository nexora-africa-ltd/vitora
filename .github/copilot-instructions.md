# Copilot Instructions for Vitora HMIS

## Project Overview
Vitora HMIS is an **offline-first Hospital Management Information System** for Kenya, built with Django backend and Electron desktop app. The system operates standalone without internet (using SQLite) while supporting optional cloud sync for multi-facility deployments.

**Core Architecture**: Modular monolith with offline-first design, FHIR R4 compliance, KHIS/DHIS2 reporting, and Social Health Authority (SHA) claims integration.

## Critical Context

### Test-Driven Development (TDD)
**MANDATORY**: Write tests BEFORE implementation for all features.

1. **Write failing test first** (Red) - See [docs/tdd-guidelines.md](../docs/tdd-guidelines.md)
2. **Implement minimal code** to pass (Green)
3. **Refactor** while keeping tests green

**Coverage requirement**: Minimum 80% enforced by CI/CD
- Pytest markers: `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.slow`
- Run: `make test` (with coverage) or `make test-fast` (quick)

### Development Workflow
```bash
# Backend (Django + DRF)
cd backend
poetry install          # Install dependencies
poetry shell           # Activate virtualenv
make test              # Run tests with 80% coverage enforcement
make lint              # Ruff + Black + isort checks
make format            # Auto-format code
make quality           # All checks (lint + type-check + security)

# Desktop App (Electron)
cd desktop-app
npm install
npm run dev            # Start Django backend + Electron app
npm test               # Jest tests
npm run test:e2e       # Playwright E2E tests
```

### Project Structure

#### Backend (`/backend/`)
- **Django apps**: `hmis/apps/patients/`, `hmis/apps/encounters/`
- **Settings**: `hmis/settings/` with base.py, development.py, production.py, test.py
- **Tests**: `tests/` with `conftest.py` for pytest fixtures
- **Models**: Generate MRN on save (format: `MRN-YYYYMMDD-XXXX`)

#### Desktop App (`/desktop-app/`)
- **Electron main process**: `src/main/index.js` (spawns Django backend)
- **Renderer**: `src/renderer/` (HTML/CSS/JS communicating with Django REST API)
- **Preload**: `src/preload/preload.js` (IPC bridge)

### Key Patterns

#### 1. MRN Generation (Medical Record Number)
**Pattern**: Auto-generated in `Patient.save()` method, not in serializer
```python
# Format: MRN-YYYYMMDD-XXXX (4-digit daily sequence)
# Example: MRN-20260115-0001
# See: backend/hmis/apps/patients/models.py:generate_mrn()
```

#### 2. Django Settings Split
**Pattern**: Environment-based settings using `DJANGO_ENV` variable
- Development: `hmis.settings.development` (DEBUG=True, SQLite)
- Production: `hmis.settings.production` (DEBUG=False, PostgreSQL with RLS)
- Test: `hmis.settings.test` (in-memory SQLite for speed)

#### 3. API Standards
**Pattern**: Django REST Framework with ViewSets
- Use `ModelViewSet` for CRUD endpoints
- Pagination: Default 20 items per page
- Search: Django-filter integration (e.g., `?search=John` on patient names)
- See: [backend/hmis/apps/patients/views.py](../backend/hmis/apps/patients/views.py)

#### 4. Offline-First Data Flow
**Pattern**: SQLite local → Optional PostgreSQL cloud sync
- Desktop app uses Django REST API running locally (port 8000)
- No network calls required for core operations
- Future: Conflict resolution strategy for multi-device sync (Phase 2)

### Coding Standards

#### Python/Django ([docs/coding-standards.md](../docs/coding-standards.md))
- **Formatter**: Black (line length 100)
- **Linter**: Ruff (replacing Flake8/Pylint)
- **Import sorting**: isort with Black compatibility
- **Type hints**: Required for function signatures (mypy checks enabled)
- **Docstrings**: Google style for all public functions/classes

```python
def generate_mrn() -> str:
    """
    Generate unique Medical Record Number.
    
    Format: MRN-YYYYMMDD-XXXX where XXXX is daily sequence.
    
    Returns:
        str: Formatted MRN (e.g., MRN-20260115-0001)
    """
```

#### JavaScript ([docs/coding-standards.md](../docs/coding-standards.md))
- **Style**: ESLint with standard config
- **Formatter**: Prettier
- Use `const`/`let` (no `var`)
- Async/await over callbacks

### Kenya-Specific Requirements
- **Identifiers**: Support National ID, Passport, Phone as patient identifiers
- **Compliance**: Kenya Data Protection Act 2019 (audit logging, consent tracking)
- **Sensitive data**: `is_sensitive` flag on Patient model (HIV, GBV, Mental Health)
- **SHA Integration**: Social Health Authority claims (Phase 2)
- **KHIS Reporting**: Mandatory DHIS2 indicators mapping (Phase 3)

### Common Commands & Locations

#### Add New Django App
```bash
cd backend
python manage.py startapp app_name hmis/apps/app_name
# Add to INSTALLED_APPS in hmis/settings/base.py
```

#### Database Migrations
```bash
cd backend
python manage.py makemigrations
python manage.py migrate
# Use --settings flag for specific env if needed
```

#### Run Tests
```bash
# Backend - Always run before committing
cd backend
make test                    # Full test suite with coverage
make test-unit              # Unit tests only (fast)
pytest -k test_name         # Specific test
pytest --lf                 # Last failed tests only

# Desktop
cd desktop-app
npm test                    # Jest tests
npm run test:e2e           # Playwright E2E
```

### CI/CD Pipeline
GitHub Actions enforces:
- ✅ Ruff linting (no warnings allowed)
- ✅ Black formatting check
- ✅ Pytest with 80% coverage minimum
- ✅ Mypy type checking
- ✅ Bandit security scan
- ✅ All tests must pass

**Branch protection**: Pull requests blocked until checks pass

### Documentation References
- [README.md](../README.md) - Complete technical blueprint (1143 lines)
- [ROADMAP.md](../ROADMAP.md) - Phased delivery plan (Jan 2026 - Q4 2027)
- [docs/tdd-guidelines.md](../docs/tdd-guidelines.md) - TDD examples and patterns
- [docs/coding-standards.md](../docs/coding-standards.md) - Style guide and review process
- [docs/mvp-scope-acceptance-criteria.md](../docs/mvp-scope-acceptance-criteria.md) - Phase 0 MVP definition
- [docs/cicd-pipeline.md](../docs/cicd-pipeline.md) - CI/CD workflow details

### Important Notes
- **Never skip tests**: CI/CD enforces 80% coverage, PRs will fail without tests
- **Offline-first mindset**: Assume no network in core features
- **Security by default**: All models include `created_at`, `updated_at` for audit trails
- **Kenya compliance**: Consider data protection requirements for all patient data handling
- **Poetry for backend**: Use `poetry add <package>` not pip (updates pyproject.toml)

### Current Phase: Sprint 0.2
Focus: Backend foundation with Patient and Encounter models (TDD approach)
- ✅ Patient model with MRN generation
- ✅ Encounter model with vitals
- ✅ REST API endpoints
- 🔄 Desktop app integration (in progress)

See [docs/sprint-0.1-deliverables.md](../docs/sprint-0.1-deliverables.md) for task status.
