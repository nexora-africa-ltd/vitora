# Inferno FHIR Compliance Testing

This directory contains the Inferno testing suite configuration for validating Vitora HMIS FHIR compliance.

## Overview

[Inferno](https://inferno-framework.github.io/) is the official HL7 testing framework for FHIR implementations.

**Available Test Suites:**
- **International Patient Summary (IPS)** - Critical for Kenya SHA integration
- **SMART Health Cards** - Vaccination & testing credentials

## Current Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| SMART Configuration | ✅ Implemented | `/.well-known/smart-configuration` |
| CapabilityStatement | ✅ Implemented | `/fhir/metadata` |
| OAuth2 Endpoints | ✅ Implemented | `/oauth/authorize/`, `/oauth/token/` |
| FHIR Resource Endpoints | 🔴 **NOT IMPLEMENTED** | `/fhir/Patient`, `/fhir/Observation`, etc. |
| IPS Bundle Generation | 🔴 **NOT IMPLEMENTED** | `/fhir/Patient/$summary` |

> **⚠️ IMPORTANT**: Inferno IPS tests require FHIR resource endpoints that are not yet implemented in Vitora.
> See [FHIR Compliance Report](../../docs/fhir-compliance-report.md) for implementation plan.

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- Vitora backend running on port 9088
- **FHIR resource endpoints implemented** (see status above)
- Test data seeded in the database

### 2. Start Inferno

```bash
# Start Inferno Core
./docker/inferno/run-tests.sh --setup

# Check status
./docker/inferno/run-tests.sh --status

# Teardown
./docker/inferno/run-tests.sh --teardown
```

### 3. Access Test UI

| Test Kit | URL | Status |
|----------|-----|--------|
| Inferno Core | http://localhost:4567 | ✅ Available |

**Available Test Suites:**
- International Patient Summary (IPS)
- SMART Health Cards: Vaccination & Testing

### 4. Configure Tests

When prompted in the Inferno UI, use these Vitora endpoints:

| Setting | Value | Status |
|---------|-------|--------|
| FHIR Server URL | `http://host.docker.internal:9088/fhir` | 🔴 Endpoints needed |
| SMART Config | `http://host.docker.internal:9088/.well-known/smart-configuration` | ✅ Working |
| CapabilityStatement | `http://host.docker.internal:9088/fhir/metadata` | ✅ Working |

> **Note**: Use `host.docker.internal` when Inferno (in Docker) needs to reach Vitora (on host).

### 5. Required FHIR Endpoints for IPS Testing

The IPS test suite requires these FHIR resource endpoints:

| Endpoint | Resource | Priority | Status |
|----------|----------|----------|--------|
| `/fhir/Patient/{id}` | Patient | Critical | 🔴 Not implemented |
| `/fhir/Patient/{id}/$summary` | IPS Bundle | Critical | 🔴 Not implemented |
| `/fhir/Composition/{id}` | Composition | Critical | 🔴 Not implemented |
| `/fhir/Practitioner/{id}` | Practitioner | High | 🔴 Not implemented |
| `/fhir/Organization/{id}` | Organization | High | 🔴 Not implemented |
| `/fhir/Observation/{id}` | Observation | High | 🔴 Not implemented |
| `/fhir/Condition/{id}` | Condition | High | 🔴 Not implemented |
| `/fhir/MedicationStatement/{id}` | MedicationStatement | High | 🔴 Not implemented |
| `/fhir/AllergyIntolerance/{id}` | AllergyIntolerance | Medium | 🔴 Not implemented |
| `/fhir/Device/{id}` | Device | Low | 🔴 Not implemented |

## Test Suites

### International Patient Summary (IPS) Tests

Tests IPS document generation (critical for Kenya SHA):

1. **Bundle Structure**: Document bundle with Composition
2. **Required Sections**: Allergies, Medications, Problems
3. **Coding Systems**: ICD-11, LOINC, SNOMED CT validation

**Target**: ≥90% pass rate

**Required Test Inputs:**
- `url` - FHIR server base URL
- `patient_id` - Patient resource ID
- `composition_id` - IPS Composition ID
- `practitioner_id` - Practitioner resource ID (optional)
- `observation_*_id` - Various observation IDs (optional)
- `device_id` - Device resource ID (optional)

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

### IPS Tests Can't Find Resources

The FHIR resource endpoints (Patient, Observation, etc.) are **not yet implemented** in Vitora. See the implementation plan in [FHIR Compliance Report](../../docs/fhir-compliance-report.md).

## Next Steps

1. **Implement FHIR resource endpoints** in Vitora
2. **Seed test data** - Create test patient, observations, etc.
3. **Run IPS tests** - Use Inferno Core at http://localhost:4567
4. **Document results** - Update compliance report

## References

- [Inferno Framework Documentation](https://inferno-framework.github.io/)
- [International Patient Summary](https://hl7.org/fhir/uv/ips/)
- [FHIR Compliance Report](../../docs/fhir-compliance-report.md)
- [FHIR Validation Plan](../../docs/fhir-validation-plan.md)
