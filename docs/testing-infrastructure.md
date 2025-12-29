# Testing Infrastructure Setup Guide

**Version**: 1.0
**Date**: December 27, 2025
**Sprint**: 0.1 Task 6
**Status**: ACTIVE

---

## Overview

This document describes the testing infrastructure for Vitora HMIS, including Pytest, coverage tools, and linters (Ruff, Black, isort). The setup enforces Test-Driven Development (TDD) practices with 80% minimum code coverage.

---

## Installed Tools

### Testing Framework
- **Pytest** (7.4+): Modern testing framework
- **pytest-django** (4.7+): Django integration for Pytest
- **pytest-cov** (4.1+): Coverage plugin
- **pytest-xdist** (3.5+): Parallel test execution
- **pytest-mock** (3.12+): Mocking support

### Test Data
- **Faker** (22.0+): Generate fake data
- **Factory Boy** (3.3+): Test fixtures and factories

### Linting & Formatting
- **Ruff** (0.1+): Fast Python linter (replaces Flake8, isort, others)
- **Black** (23.12+): Code formatter
- **isort** (5.13+): Import sorter

### Type Checking
- **mypy** (1.8+): Static type checker
- **django-stubs** (4.2+): Django type stubs
- **djangorestframework-stubs** (3.14+): DRF type stubs

### Security
- **Bandit** (1.7+): Security issue scanner

### Documentation
- **Sphinx** (7.2+): Documentation generator
- **sphinx-rtd-theme** (2.0+): Read the Docs theme

### Development
- **IPython** (8.20+): Enhanced Python shell
- **ipdb** (0.13+): IPython debugger

---

## Installation

### Prerequisites
- Python 3.12+
- Poetry installed

### Install Dependencies

```bash
cd backend
poetry install
```

This installs all dependencies defined in `pyproject.toml`.

### Verify Installation

```bash
# Check Poetry environment
poetry env info

# Check installed packages
poetry show

# Activate shell
poetry shell

# Verify tools are available
pytest --version
ruff --version
black --version
mypy --version
```

---

## Usage Guide

### Running Tests

#### All Tests with Coverage
```bash
poetry run pytest
```
This runs all tests with coverage reporting and fails if coverage < 80%.

#### Fast Run (No Coverage)
```bash
poetry run pytest -x
```
Stops at first failure, useful during development.

#### Specific Test File
```bash
poetry run pytest tests/test_infrastructure.py
```

#### Specific Test Function
```bash
poetry run pytest tests/test_infrastructure.py::test_python_version
```

#### By Marker
```bash
# Unit tests only
poetry run pytest -m unit

# Integration tests only
poetry run pytest -m integration

# Skip slow tests
poetry run pytest -m "not slow"
```

#### Parallel Execution
```bash
poetry run pytest -n auto
```
Runs tests in parallel using all CPU cores.

#### Verbose Output
```bash
poetry run pytest -vv
```

#### With Print Statements
```bash
poetry run pytest -s
```

### Code Quality

#### Ruff Linter
```bash
# Check for issues
poetry run ruff check .

# Auto-fix issues
poetry run ruff check . --fix

# Check specific file
poetry run ruff check hmis/apps/patients/models.py
```

**What Ruff Checks**:
- Code style (PEP 8)
- Import sorting
- Unused variables/imports
- Security issues
- Django-specific issues
- Complexity
- And 600+ other rules

#### Black Formatter
```bash
# Check formatting
poetry run black --check .

# Format code
poetry run black .

# Format specific file
poetry run black hmis/apps/patients/models.py

# Show diff
poetry run black --diff .
```

#### isort Import Sorter
```bash
# Check imports
poetry run isort --check .

# Sort imports
poetry run isort .
```

#### All Formatting at Once
```bash
poetry run black . && poetry run isort .
```

### Type Checking

```bash
# Check all files
poetry run mypy hmis

# Check specific file
poetry run mypy hmis/apps/patients/models.py

# With verbose output
poetry run mypy hmis --pretty
```

### Security Scanning

```bash
# Scan for security issues
poetry run bandit -r hmis

# With detailed output
poetry run bandit -r hmis -v

# Generate report
poetry run bandit -r hmis -f json -o bandit-report.json
```

### Using Makefile

The `Makefile` provides convenient shortcuts:

```bash
# Show all available commands
make help

# Install dependencies
make install

# Run tests
make test

# Run linters
make lint

# Format code
make format

# Type check
make type-check

# Security scan
make security

# Run all quality checks
make quality

# Pre-commit checks (format + quality + test)
make pre-commit

# Clean generated files
make clean

# Generate HTML coverage report
make coverage-html
```

---

## Configuration

All tool configurations are in `pyproject.toml`:

### Pytest Configuration

```toml
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "hmis.settings.test"
testpaths = ["tests"]
addopts = [
    "-v",
    "--tb=short",
    "--strict-markers",
    "--cov=hmis",
    "--cov-report=term-missing",
    "--cov-report=html",
    "--cov-report=xml",
    "--cov-fail-under=80",
]
```

**Key Settings**:
- Minimum coverage: 80%
- Test directory: `tests/`
- Coverage reports: Terminal, HTML, XML
- Verbose output by default

### Coverage Configuration

```toml
[tool.coverage.run]
source = ["hmis"]
omit = [
    "*/migrations/*",
    "*/tests/*",
]
branch = true
```

**Excluded from Coverage**:
- Django migrations
- Test files themselves
- Virtual environments

### Ruff Configuration

```toml
[tool.ruff]
line-length = 100
target-version = "py312"
select = ["E", "W", "F", "I", "B", "C4", "UP", "ARG", "SIM", "S", "T20", "DJ"]
ignore = ["E501", "S101", "DJ001"]
```

**Selected Rules**:
- E/W: pycodestyle
- F: pyflakes
- I: isort
- B: bugbear
- C4: comprehensions
- UP: pyupgrade
- ARG: unused arguments
- SIM: simplify
- S: security (bandit)
- T20: print statements
- DJ: Django-specific

### Black Configuration

```toml
[tool.black]
line-length = 100
target-version = ["py312"]
```

### mypy Configuration

```toml
[tool.mypy]
python_version = "3.12"
plugins = ["mypy_django_plugin.main", "mypy_drf_plugin.main"]
warn_return_any = true
warn_unused_configs = true
```

---

## Writing Tests

### Test File Structure

```python
"""
Module docstring describing what is being tested.
"""

import pytest


@pytest.mark.unit
def test_something():
    """Test docstring."""
    # Arrange
    expected = "result"

    # Act
    actual = some_function()

    # Assert
    assert actual == expected
```

### Test Markers

```python
# Unit test
@pytest.mark.unit
def test_unit_example():
    pass

# Integration test
@pytest.mark.integration
def test_integration_example(db):
    pass

# E2E test
@pytest.mark.e2e
def test_e2e_example(api_client):
    pass

# Slow test
@pytest.mark.slow
def test_slow_example():
    pass
```

### Using Fixtures

```python
def test_with_fixture(sample_data):
    """Use fixture defined in conftest.py."""
    assert sample_data["name"] == "Test User"
```

### Parametrized Tests

```python
@pytest.mark.parametrize("input,expected", [
    (1, 2),
    (2, 4),
    (3, 6),
])
def test_multiplication(input, expected):
    assert input * 2 == expected
```

### Testing Exceptions

```python
def test_exception():
    with pytest.raises(ValueError):
        raise ValueError("Expected error")
```

### Mocking

```python
def test_with_mock(mocker):
    mock_func = mocker.patch('module.function')
    mock_func.return_value = "mocked"

    result = call_function_that_uses_mocked()
    assert result == "mocked"
```

---

## Coverage Reports

### Terminal Report

Run tests and see coverage in terminal:
```bash
poetry run pytest --cov=hmis --cov-report=term-missing
```

### HTML Report

Generate browseable HTML report:
```bash
poetry run pytest --cov=hmis --cov-report=html
open htmlcov/index.html
```

### XML Report

For CI/CD tools:
```bash
poetry run pytest --cov=hmis --cov-report=xml
```

### Checking Coverage

```bash
# Show coverage report
poetry run coverage report

# Show specific file coverage
poetry run coverage report hmis/apps/patients/models.py
```

---

## CI/CD Integration

The CI/CD pipeline (`.github/workflows/ci.yml`) automatically runs:

1. **Install dependencies**: `poetry install`
2. **Run Ruff**: `poetry run ruff check .`
3. **Check Black**: `poetry run black --check .`
4. **Run tests with coverage**: `poetry run pytest --cov=hmis --cov-fail-under=80`
5. **Type check**: `poetry run mypy hmis`
6. **Security scan**: `poetry run bandit -r hmis`

All checks must pass for merge approval.

---

## TDD Workflow

### Red-Green-Refactor Cycle

#### 1. Red: Write Failing Test

```python
# tests/test_patient.py
import pytest

@pytest.mark.unit
def test_patient_mrn_generation():
    """Test that MRN is auto-generated."""
    from hmis.apps.patients.models import Patient

    patient = Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth="1990-01-01",
        gender="M"
    )

    assert patient.mrn is not None
    assert patient.mrn.startswith("MRN-")
```

Run test (should fail):
```bash
poetry run pytest tests/test_patient.py::test_patient_mrn_generation
```

#### 2. Green: Write Minimal Code

```python
# hmis/apps/patients/models.py
from django.db import models
import uuid

class Patient(models.Model):
    mrn = models.CharField(max_length=20, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=10)

    def save(self, *args, **kwargs):
        if not self.mrn:
            self.mrn = f"MRN-{uuid.uuid4().hex[:8]}"
        super().save(*args, **kwargs)
```

Run test again (should pass):
```bash
poetry run pytest tests/test_patient.py::test_patient_mrn_generation
```

#### 3. Refactor: Improve Code

```python
# Refactor MRN generation to use date-based format
from datetime import datetime

def generate_mrn():
    date_part = datetime.now().strftime("%Y%m%d")
    random_part = uuid.uuid4().hex[:4].upper()
    return f"MRN-{date_part}-{random_part}"

class Patient(models.Model):
    # ... fields ...

    def save(self, *args, **kwargs):
        if not self.mrn:
            self.mrn = generate_mrn()
        super().save(*args, **kwargs)
```

Run tests again (should still pass):
```bash
poetry run pytest tests/test_patient.py
```

---

## Best Practices

### Do's ✅

1. **Write tests first** (TDD)
2. **Keep tests simple and focused**
3. **Use descriptive test names**
4. **Test one thing per test**
5. **Use fixtures for setup**
6. **Mock external dependencies**
7. **Run tests frequently**
8. **Aim for 80%+ coverage**
9. **Use markers to organize tests**
10. **Keep tests fast**

### Don'ts ❌

1. **Don't skip writing tests**
2. **Don't test implementation details**
3. **Don't write flaky tests**
4. **Don't ignore failing tests**
5. **Don't commit code that fails tests**
6. **Don't aim for 100% coverage at expense of quality**
7. **Don't test third-party code**
8. **Don't use sleep() in tests (use mocking)**

---

## Troubleshooting

### Tests Not Found

```bash
# Make sure you're in the backend directory
cd backend

# Check test discovery
poetry run pytest --collect-only
```

### Coverage Not Working

```bash
# Make sure pytest-cov is installed
poetry show pytest-cov

# Run with verbose coverage
poetry run pytest --cov=hmis --cov-report=term-missing -v
```

### Import Errors

```bash
# Ensure you're in poetry shell
poetry shell

# Or use poetry run
poetry run pytest
```

### Slow Tests

```bash
# Run with durations report
poetry run pytest --durations=10

# Skip slow tests
poetry run pytest -m "not slow"

# Run in parallel
poetry run pytest -n auto
```

### Ruff/Black Conflicts

```bash
# Format with black first
poetry run black .

# Then run ruff
poetry run ruff check . --fix
```

---

## Next Steps

After Task 6 completion:

- **Task 7**: Create test templates and TDD guidelines document
- **Task 8**: Define coding standards and review process
- **Sprint 0.2**: Begin implementing Django models with TDD

---

## Resources

### Documentation
- [Pytest Documentation](https://docs.pytest.org/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [Black Documentation](https://black.readthedocs.io/)
- [mypy Documentation](https://mypy.readthedocs.io/)
- [Coverage.py Documentation](https://coverage.readthedocs.io/)

### Tools
- [Pytest](https://pytest.org/)
- [Ruff](https://github.com/astral-sh/ruff)
- [Black](https://github.com/psf/black)
- [mypy](https://github.com/python/mypy)
- [Bandit](https://github.com/PyCQA/bandit)

---

**Document Status**: APPROVED
**Next Action**: Begin Sprint 0.1 Task 7 (Test templates and TDD guidelines)
**Document Owner**: Engineering Lead
**Last Updated**: December 27, 2025
