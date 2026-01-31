# Inferno FHIR Compliance Testing

This directory contains the Inferno testing suite configuration for validating Vitora HMIS FHIR compliance.

## Overview

[Inferno](https://inferno-framework.github.io/) is the official HL7 testing framework for FHIR implementations. It validates conformance to:

- **US Core v6.1.0** - Patient Access API profiles
- **SMART App Launch v2.0.0** - OAuth2 authorization for FHIR apps
- **International Patient Summary (IPS)** - Critical for Kenya SHA integration

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- Vitora backend running on port 9088
- Test data seeded in the database
- **For IPS tests**: At least 10GB of memory available to Docker

### 2. Start Inferno

```bash
# Start Inferno Core (basic FHIR testing)
./docker/inferno/run-tests.sh --setup

# Or start ONC Inferno Program (SMART + US Core tests)
./docker/inferno/run-tests.sh --onc

# For IPS tests (clones from source, runs separately)
./docker/inferno/run-tests.sh --ips
```

### 3. Access Test UIs

| Test Kit | URL | How to Start |
|----------|-----|--------------|
| Inferno Core | http://localhost:4567 | `--setup` (default) |
| ONC Program | http://localhost:4568 | `--onc` |
| IPS Test Kit | http://localhost:80 | `--ips` then `cd docker/inferno/ips-test-kit && ./run.sh` |

> **Note**: The IPS test kit must be run from source as there's no pre-built Docker image.
> The `--ips` option clones the repository and runs the setup script.

### 4. Configure Tests

When prompted in the Inferno UI, use these Vitora endpoints:

| Setting | Value |
|---------|-------|
| FHIR Server URL | `http://host.docker.internal:9088/fhir` |
| SMART Config | `http://host.docker.internal:9088/.well-known/smart-configuration` |
| Authorization | `http://host.docker.internal:9088/oauth/authorize/` |
| Token | `http://host.docker.internal:9088/oauth/token/` |

> **Note**: Use `host.docker.internal` when Inferno (in Docker) needs to reach Vitora (on host).

### 5. Create Test OAuth2 Client

For SMART App Launch tests, create a test client in Vitora:

```bash
cd backend
poetry run python manage.py shell
```

```python
from oauth2_provider.models import Application
from django.contrib.auth import get_user_model

User = get_user_model()
admin = User.objects.filter(is_superuser=True).first()

Application.objects.create(
    name='Inferno Test Client',
    user=admin,
    client_id='inferno-test-client',
    client_secret='inferno-test-secret',
    client_type='confidential',
    authorization_grant_type='authorization-code',
    redirect_uris='http://localhost:4569/custom/smart/redirect http://localhost:4567/custom/smart/redirect'
)
```

## Test Suites

### SMART App Launch Tests

Tests OAuth2 authorization flows for FHIR applications:

1. **Discovery Tests**: Validates `/.well-known/smart-configuration` and `CapabilityStatement`
2. **Standalone Launch**: Tests authorization code flow with PKCE
3. **EHR Launch**: Tests context-aware launch from EHR
4. **Scopes**: Validates SMART v2 scope handling
5. **Token Operations**: Tests token exchange, refresh, and introspection

**Target**: ≥90% pass rate

### US Core Profile Tests

Tests FHIR resource conformance to US Core profiles:

1. **Patient**: Demographics, search, read operations
2. **Encounter**: Clinical visits, status transitions
3. **Condition**: Diagnoses, problem lists
4. **MedicationRequest**: Prescriptions
5. **Observation**: Vitals, lab results
6. **AllergyIntolerance**: Allergy records

**Target**: ≥80% pass rate

### International Patient Summary (IPS) Tests

Tests IPS document generation (critical for Kenya SHA):

1. **Bundle Structure**: Document bundle with Composition
2. **Required Sections**: Allergies, Medications, Problems
3. **Coding Systems**: ICD-11, LOINC, SNOMED CT validation

**Target**: ≥90% pass rate

## Files

| File | Description |
|------|-------------|
| `compose.yml` | Docker Compose configuration for Inferno services |
| `.env.example` | Environment configuration template |
| `run-tests.sh` | Test runner script with helpful options |

## Troubleshooting

### Inferno Won't Start

```bash
# Check container logs
docker compose -f docker/inferno/compose.yml logs -f

# Restart services
docker compose -f docker/inferno/compose.yml down -v
docker compose -f docker/inferno/compose.yml up -d
```

### Can't Reach Vitora from Inferno

Ensure Vitora is bound to all interfaces:

```bash
cd backend
poetry run python manage.py runserver 0.0.0.0:9088
```

### SMART Tests Fail on Authorization

1. Verify OAuth2 client exists with correct redirect URIs
2. Check SMART configuration endpoint returns valid JSON
3. Ensure user is logged in to Vitora before authorizing

### Database Connection Errors

```bash
# Reset Inferno database
./docker/inferno/run-tests.sh --teardown
./docker/inferno/run-tests.sh --setup
```

## Reporting

After running tests, document results in:
- [FHIR Compliance Report](../../docs/fhir-compliance-report.md)

## References

- [Inferno Framework Documentation](https://inferno-framework.github.io/)
- [US Core Implementation Guide](https://hl7.org/fhir/us/core/)
- [SMART App Launch IG](https://hl7.org/fhir/smart-app-launch/)
- [International Patient Summary](https://hl7.org/fhir/uv/ips/)
- [Vitora FHIR Validation Plan](../../docs/fhir-validation-plan.md)
