# Inferno FHIR Compliance Testing

This directory contains the Inferno testing suite configuration for validating Vitora HMIS FHIR compliance.

## Overview

[Inferno](https://inferno-framework.github.io/) is the official HL7 testing framework for FHIR implementations. It validates conformance to:

- **FHIR R4** - Core resource profiles
- **SMART App Launch v2.0.0** - OAuth2 authorization for FHIR apps
- **International Patient Summary (IPS)** - Critical for Kenya SHA integration

## Architecture

Vitora implements FHIR R4 resource endpoints **natively** in Django:

\`\`\`
┌─────────────────┐          ┌─────────────────┐
│   Inferno       │   HTTP   │  Vitora HMIS    │
│   Test Suite    │◄────────►│  Django Backend │
│  (localhost:4567)│          │ (localhost:9088) │
└─────────────────┘          └─────────────────┘
                                     │
                                     ▼
                             ┌─────────────────┐
                             │  SQLite/Postgres │
                             │   Patient Data   │
                             └─────────────────┘
\`\`\`

No external FHIR server is required - Vitora handles all FHIR operations directly.

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- Vitora backend running on port 9088
- Test data seeded in the database

### 2. Seed Test Data

\`\`\`bash
cd backend
poetry shell
python manage.py seed_fhir_test_data
\`\`\`

### 3. Start Vitora Backend

\`\`\`bash
cd backend
python manage.py runserver 0.0.0.0:9088
\`\`\`

### 4. Start Inferno

\`\`\`bash
# Start Inferno Core (IPS testing)
./docker/inferno/run-tests.sh --setup

# Or for ONC Program (SMART + US Core tests)
./docker/inferno/run-tests.sh --onc
\`\`\`

When Inferno Core starts through this Compose file, it reapplies a small local IPS compatibility patch on boot. That keeps the known IPS validator workaround in place across container recreates and restarts.

### 5. Access Test UIs

| Test Kit | URL | How to Start |
|----------|-----|--------------|
| Inferno Core | http://localhost:4567 | \`--setup\` (default) |
| ONC Program | http://localhost:4568 | \`--onc\` |

### 6. Configure Tests

When prompted in the Inferno UI, use these Vitora endpoints:

| Setting | Value |
|---------|-------|
| FHIR Server URL | \`http://host.docker.internal:9088/fhir\` |
| SMART Config | \`http://host.docker.internal:9088/.well-known/smart-configuration\` |
| Authorization | \`http://host.docker.internal:9088/oauth/authorize/\` |
| Token | \`http://host.docker.internal:9088/oauth/token/\` |

> **Note**: Use \`host.docker.internal\` when Inferno (in Docker) needs to reach Vitora (on host). On Linux, the Compose file must also provide \`host.docker.internal:host-gateway\`; this repo now does that for the Inferno container. For Snap-managed Docker hosts that show AppArmor signal denials when stopping Inferno, the Inferno service also runs with \`apparmor=unconfined\` to avoid the stop/kill deadlock.

### 7. Create Test OAuth2 Client (for SMART tests)

\`\`\`bash
cd backend
poetry run python manage.py shell
\`\`\`

\`\`\`python
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
    redirect_uris='http://localhost:4567/custom/smart/redirect http://localhost:4568/custom/smart/redirect'
)
\`\`\`

## Implemented FHIR Endpoints

All endpoints require JWT authentication via Bearer token.

| Endpoint | Description | Status |
|----------|-------------|--------|
| \`/fhir/metadata\` | CapabilityStatement | ✅ Working |
| \`/fhir/Patient/{id}\` | Patient resource | ✅ Working |
| \`/fhir/Patient/{id}/$summary\` | IPS Bundle | ✅ Working |
| \`/fhir/Practitioner/{id}\` | Practitioner resource | ✅ Working |
| \`/fhir/Organization/{id}\` | Organization resource | ✅ Working |
| \`/fhir/Condition/{id}\` | Condition (from Diagnosis) | ✅ Working |
| \`/fhir/Observation/{id}\` | Lab results & vitals | ✅ Working |
| \`/fhir/Encounter/{id}\` | Encounter resource | ✅ Working |
| \`/fhir/Composition/{id}\` | IPS Composition | ✅ Working |

## Test Suites

### International Patient Summary (IPS) Tests

Tests IPS document generation (critical for Kenya SHA):

1. **Bundle Structure**: Document bundle with Composition
2. **Required Sections**: Allergies, Medications, Problems
3. **Coding Systems**: ICD-10, LOINC, SNOMED CT validation

**Target**: ≥90% pass rate

### SMART App Launch Tests

Tests OAuth2 authorization flows for FHIR applications:

1. **Discovery Tests**: Validates \`/.well-known/smart-configuration\` and \`CapabilityStatement\`
2. **Standalone Launch**: Tests authorization code flow with PKCE
3. **EHR Launch**: Tests context-aware launch from EHR
4. **Scopes**: Validates SMART v2 scope handling
5. **Token Operations**: Tests token exchange, refresh, and introspection

**Target**: ≥90% pass rate

## Files

| File | Description |
|------|-------------|
| \`compose.yml\` | Docker Compose configuration for Inferno services |
| \`.env.example\` | Environment configuration template |
| \`run-tests.sh\` | Test runner script with helpful options |

## Troubleshooting

### Inferno Won't Start

\`\`\`bash
# Check container logs
docker compose -f docker/inferno/compose.yml logs -f

# Restart services
docker compose -f docker/inferno/compose.yml down -v
docker compose -f docker/inferno/compose.yml up -d
\`\`\`

### IPS Tests Regress After Recreate

The Inferno service starts through [docker/inferno/start-with-local-patches.sh](/home/azureuser/vitora/docker/inferno/start-with-local-patches.sh), which reapplies the local IPS suite workaround on every boot. If IPS document or summary tests start failing again after a recreate, verify you started Inferno from [docker/inferno/compose.yml](/home/azureuser/vitora/docker/inferno/compose.yml) rather than from a separate ad hoc Docker command.

### Can't Reach Vitora from Inferno

Ensure Vitora is bound to all interfaces:

\`\`\`bash
cd backend
python manage.py runserver 0.0.0.0:9088
\`\`\`

If you're on Linux, recreate Inferno after Compose changes so Docker applies the host alias:

\`\`\`bash
docker compose -f docker/inferno/compose.yml down
docker compose -f docker/inferno/compose.yml up -d
\`\`\`

If the existing container is already stuck with `permission denied` on stop, restart the Docker daemon first, then recreate Inferno:

\`\`\`bash
sudo snap restart docker
sudo docker-compose -f docker/inferno/compose.yml up -d --force-recreate
\`\`\`

### SMART Tests Fail on Authorization

1. Verify OAuth2 client exists with correct redirect URIs
2. Check SMART configuration endpoint returns valid JSON
3. Ensure user is logged in to Vitora before authorizing

### 401 Unauthorized on FHIR Endpoints

FHIR endpoints require JWT authentication:

\`\`\`bash
# Get token
TOKEN=\$(curl -s -X POST http://localhost:9088/api/token/ \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"admin123"}' | jq -r '.access')

# Use token
curl -H "Authorization: Bearer \$TOKEN" http://localhost:9088/fhir/Patient/1
\`\`\`

## Reporting

After running tests, document results in:
- [FHIR Compliance Report](../../docs/fhir-compliance-report.md)

## References

- [Inferno Framework Documentation](https://inferno-framework.github.io/)
- [US Core Implementation Guide](https://hl7.org/fhir/us/core/)
- [SMART App Launch IG](https://hl7.org/fhir/smart-app-launch/)
- [International Patient Summary](https://hl7.org/fhir/uv/ips/)
- [Vitora FHIR Validation Plan](../../docs/fhir-validation-plan.md)
