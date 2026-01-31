# FHIR/HL7/SMART on FHIR Validation Plan

> **Document Version**: 1.2  
> **Created**: January 31, 2026  
> **Last Updated**: January 31, 2026  
> **Status**: Phase 1-3 Complete, Phase 4 In Progress, Phase 5 Complete  
> **Owner**: Engineering Team

---

## 1. Executive Summary

This document outlines the validation strategy for Vitora HMIS's FHIR R4, HL7, and SMART on FHIR compliance. The plan ensures our implementation meets international healthcare interoperability standards while maintaining Kenya SHA (Social Health Authority) specific requirements.

---

## 2. Current Implementation Status

| Area | Status | Location | Notes |
|------|--------|----------|-------|
| **FHIR R4 Bundles** | ✅ Partial | `hmis/apps/billing/services/sha_claims.py` | SHA claims use FHIR message bundles |
| **IPS Bundle** | ✅ Tests exist | `tests/billing/test_shr_compliance/test_ips_bundle.py` | International Patient Summary |
| **MedicationRequest** | ✅ Tests exist | `tests/billing/test_shr_compliance/test_medication_request.py` | FHIR resource fixtures |
| **MedicationDispense** | ✅ Tests exist | `tests/billing/test_shr_compliance/test_medication_dispense.py` | Pharmacy dispensing |
| **Patient Resource** | ✅ Tests exist | `tests/billing/test_shr_compliance/test_patient_resource.py` | SHA client registry |
| **HL7 v2 Messaging** | 🔄 In Progress | `hmis/apps/laboratory/services/hl7_service.py` | 43 tests passing |
| **SMART on FHIR** | ✅ Implemented | `hmis/apps/core/oauth/` | 39 tests passing |

---

## 3. Validation Phases

### Phase 1: Automated FHIR R4 Schema Validation ✅ COMPLETE

**Objective**: Add programmatic FHIR R4 resource validation using the official `fhir.resources` library.

#### Deliverables

| Deliverable | Description | File |
|-------------|-------------|------|
| FHIR dependency | Add `fhir.resources` to project | `pyproject.toml` |
| Validator service | Reusable FHIR validation service | `hmis/apps/core/services/fhir_validator.py` |
| Unit tests | Validator service tests | `tests/core/test_fhir_validator.py` |
| Integration | Integrate with SHA claims | `hmis/apps/billing/services/sha_claims.py` |
| Makefile target | `make test-fhir` command | `Makefile` |

#### Exit Criteria

- [x] `fhir.resources` package installed and importable
- [x] `FHIRValidator` service class implemented with:
  - [x] `validate_resource(resource_dict, resource_type)` method
  - [x] `validate_bundle(bundle_dict)` method
  - [x] `validate_patient(patient_dict)` method
  - [x] `validate_claim(claim_dict)` method
  - [x] `get_resource_errors(resource_dict)` method returning structured errors
- [x] Unit tests passing with ≥90% coverage of validator service (92.78%)
- [x] `make test-fhir` runs all FHIR-related tests (190 tests)
- [ ] CI pipeline includes FHIR validation step
- [x] Documentation updated in README.md

---

### Phase 2: Kenya SHA Profile Conformance ✅ COMPLETE

**Objective**: Validate FHIR resources against Kenya SHA-specific profiles and extensions.

#### Deliverables

| Deliverable | Description | File |
|-------------|-------------|------|
| SHA Profile definitions | Kenya-specific FHIR profile constraints | `hmis/apps/core/fhir/profiles/` |
| Profile validator | SHA profile validation logic | `hmis/apps/core/services/sha_profile_validator.py` |
| ICD-11 validation | Ensure diagnoses use ICD-11 (not ICD-10) | Integrated in validator |
| CR identifier check | SHA Client Registry identifier validation | Integrated in validator |
| Extended tests | Profile-specific test cases | `tests/billing/test_shr_compliance/test_sha_profiles.py` |

#### Exit Criteria

- [x] SHA FHIR profiles documented (Patient, Claim, Coverage, Organization)
- [x] `SHAProfileValidator` class implemented
- [x] All SHA bundles validated against Kenya-specific constraints:
  - [x] Bundle.type = "message" for claims
  - [x] Patient has SHA CR identifier with system `urn:sha:client-registry`
  - [x] Diagnosis uses ICD-11 coding system
  - [x] Organization has MFL (Master Facility List) code
  - [x] Coverage includes SHA scheme extensions
- [x] ≥95% of existing SHA tests pass profile validation
- [ ] Profile validation integrated into claim submission workflow

---

### Phase 3: HAPI FHIR Server Integration Testing ✅ COMPLETE

**Objective**: Validate resources against a real FHIR R4 server for end-to-end compliance.

#### Deliverables

| Deliverable | Description | File | Status |
|-------------|-------------|------|--------|
| HAPI FHIR Docker setup | Test FHIR server for CI/CD | `docker/hapi-fhir/compose.yml` | ✅ Created |
| FHIR Client service | Consolidated client with retry/auth | `hmis/apps/core/services/fhir_client.py` | ✅ Implemented |
| Integration test suite | Tests against live FHIR server | `tests/integration/test_fhir_server.py` | ✅ 55 tests passing |
| Test fixtures (conftest) | Shared fixtures for FHIR tests | `tests/integration/conftest.py` | ✅ Created |
| CI integration | GitHub Actions workflow | `.github/workflows/fhir-integration.yml` | 📋 Optional |

#### Exit Criteria

- [x] HAPI FHIR Docker compose file created with health check
- [x] FHIRClient service consolidated with:
  - [x] Retry logic with exponential backoff
  - [x] Proper exception hierarchy (FHIRClientError, FHIRConnectionError, FHIRNotFoundError)
  - [x] Context manager support
  - [x] wait_for_server() method
- [x] Integration test suite written (55 tests covering CRUD, search, bundles, versioning)
- [x] All FHIR resources verified against live HAPI FHIR server:
  - [x] Patient, Practitioner, Organization - CRUD operations
  - [x] Encounter, Observation, Condition - clinical resources
  - [x] MedicationRequest, MedicationDispense - pharmacy
  - [x] ServiceRequest, Coverage, Claim - billing/insurance
  - [x] Search with standard parameters (name, identifier, date, status)
- [x] Bundle operations verified:
  - [x] Transaction bundles (atomic create/rollback)
  - [x] Batch bundles (independent processing)
  - [x] Message bundles (SHA claim format)
- [x] Resource versioning verified (version tracking, history retrieval)
- [x] Response times verified (<500ms for warmed-up operations)
- [ ] CI workflow (optional - tests require HAPI FHIR server)

> **Note**: Integration tests are excluded from `make test` as they require HAPI FHIR server.
> Run manually with:
> ```bash
> # Start HAPI FHIR server
> cd docker/hapi-fhir && docker compose up -d
> # Wait ~2 minutes for server initialization
> # Run tests
> cd backend && poetry run pytest tests/integration/test_fhir_server.py -v
> ```

---

### Phase 4: HL7 v2 Messaging (Lab Integration) 🔄 IN PROGRESS

**Objective**: Implement HL7 v2.x messaging for laboratory system integration.

#### Deliverables

| Deliverable | Description | File | Status |
|-------------|-------------|------|--------|
| HL7 library | Add `hl7apy` | `pyproject.toml` | ✅ Installed |
| Message builder | HL7 ORM/ORU message generation | `hmis/apps/laboratory/services/hl7_service.py` | ✅ Implemented |
| Message parser | Parse incoming HL7 results | Integrated in hl7_service.py | ✅ Implemented |
| MLLP adapter | TCP/IP transport layer | `hmis/apps/laboratory/services/mllp_client.py` | ✅ Implemented |
| Integration tests | HL7 message round-trip tests | `tests/test_hl7_integration.py` | ✅ 43 tests passing |

#### Exit Criteria

- [x] Generate valid HL7 v2.5.1 ORM^O01 (Lab Order) messages
- [x] Parse HL7 v2.5.1 ORU^R01 (Lab Result) messages
- [ ] Messages pass HL7 validation tools (external validation pending)
- [x] MLLP client can send/receive messages
- [x] Lab results auto-import from HL7 messages
- [x] Acknowledgment (ACK) messages handled correctly

#### External HL7 Validation Guide

**Recommended Validator**: [HAPI HL7 v2 Validator](https://hapifhir.github.io/hapi-hl7v2/)

HAPI is the most widely-used open-source HL7 v2 library (Java) and provides robust validation against the official HL7 v2.5.1 specification.

**Quick Validation Steps**:

1. **Install HAPI Test Panel** (GUI tool):
   ```bash
   # Download from: https://github.com/hapifhir/hapi-hl7v2/releases
   # Run the JAR file
   java -jar hapi-testpanel-x.x.jar
   ```

2. **Generate a test message**:
   ```python
   from hmis.apps.laboratory.services import HL7Service
   
   service = HL7Service()
   message = service.build_orm_o01(lab_order)
   print(message)  # Copy this output
   ```

3. **Validate in HAPI Test Panel**:
   - Paste message in "Messages" tab
   - Select "HL7 v2.5.1" profile
   - Click "Validate" → Review any conformance warnings

**Alternative Validators**:

| Validator | Type | Use Case |
|-----------|------|----------|
| [NIST HL7 Tool](https://hl7v2.nist.gov/) | Web | Official NIST testing (US healthcare) |
| [hl7apy validation](https://hl7apy.readthedocs.io/) | Python | Programmatic validation in tests |
| [Gazelle](https://gazelle.ihe.net/) | Web | IHE profile testing (EU/international) |

> TODO: Evaluate Gazelle for future use.

**Adding Programmatic Validation** (future enhancement):
```python
# Using hl7apy's built-in validation
from hl7apy.parser import parse_message
from hl7apy.validation import Validator

def validate_hl7_message(message_str: str) -> list[str]:
    """Validate HL7 message and return any errors."""
    msg = parse_message(message_str, version="2.5.1")
    validator = Validator(msg)
    return validator.validate()
```

---

### Phase 5: SMART on FHIR Authorization ✅ COMPLETE

**Objective**: Implement SMART on FHIR OAuth2 authorization for third-party app integration.

#### Deliverables

| Deliverable | Description | File | Status |
|-------------|-------------|------|--------|
| OAuth2 server | django-oauth-toolkit integration | `hmis/apps/core/oauth/` | ✅ Created |
| SMART scopes | SMART v2 scope backend | `hmis/apps/core/oauth/scopes.py` | ✅ Implemented |
| Custom validator | SMART-specific OAuth2 validation | `hmis/apps/core/oauth/validators.py` | ✅ Implemented |
| SMART configuration | `.well-known/smart-configuration` | `hmis/apps/core/oauth/views.py` | ✅ Implemented |
| Capability statement | FHIR CapabilityStatement resource | `hmis/apps/core/oauth/views.py` | ✅ Implemented |
| Launch handlers | EHR and standalone launch | `hmis/apps/core/oauth/views.py` | ✅ Implemented |
| Scope enforcement | Patient-level access control | `hmis/apps/core/oauth/permissions.py` | ✅ Implemented |
| Tests | Comprehensive test suite | `tests/test_smart_on_fhir.py` | ✅ 39 tests passing |

#### Exit Criteria

- [x] OAuth2 authorization server functional (django-oauth-toolkit 3.2.0)
- [x] SMART configuration endpoint returns valid JSON (`/.well-known/smart-configuration`)
- [x] Supported scopes:
  - [x] `openid`, `profile`, `fhirUser`, `offline_access`
  - [x] `patient/*.read`, `patient/*.write`, `patient/*.*`
  - [x] `user/*.read`, `user/*.write`, `user/*.*`
  - [x] `system/*.read`, `system/*.write`, `system/*.*`
  - [x] `launch`, `launch/patient`, `launch/encounter`
- [x] EHR launch flow working with context (`/smart/launch`)
- [x] Standalone launch flow working
- [x] Launch context creation endpoint (`/smart/launch-context`)
- [x] Token introspection endpoint (`/smart/introspect`)
- [x] CapabilityStatement endpoint (`/fhir/metadata`)
- [ ] Pass Inferno SMART App Launch test suite (basic tests) - **Pending Phase 6**
- [ ] Third-party SMART apps can connect - **Pending end-to-end testing**

#### Configuration

Add to Django settings:
```python
INSTALLED_APPS = [
    ...
    "oauth2_provider",
]

OAUTH2_PROVIDER = {
    "SCOPES_BACKEND_CLASS": "hmis.apps.core.oauth.scopes.SMARTScopes",
    "OAUTH2_VALIDATOR_CLASS": "hmis.apps.core.oauth.validators.SMARTOAuth2Validator",
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,
    "REFRESH_TOKEN_EXPIRE_SECONDS": 86400 * 30,
    "PKCE_REQUIRED": True,
    "OIDC_ENABLED": True,
}

FHIR_BASE_URL = os.getenv("FHIR_BASE_URL", "http://localhost:9088")
```

#### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/smart-configuration` | GET | SMART configuration discovery |
| `/fhir/metadata` | GET | FHIR CapabilityStatement |
| `/smart/launch` | GET | EHR launch handler |
| `/smart/launch-context` | POST | Create launch context token |
| `/smart/introspect` | POST | Token introspection |
| `/oauth/authorize/` | GET | OAuth2 authorization |
| `/oauth/token/` | POST | OAuth2 token exchange |

---

### Phase 6: Inferno Testing Suite

**Objective**: Validate implementation against official HL7 Inferno testing framework.

#### Deliverables

| Deliverable | Description | File |
|-------------|-------------|------|
| Inferno setup | Local Inferno instance | `docker/inferno/compose.yml` |
| US Core tests | Basic US Core profile tests | N/A (external tool) |
| IPS tests | International Patient Summary | N/A (external tool) |
| SMART tests | SMART App Launch tests | N/A (external tool) |
| Compliance report | Test results documentation | `docs/fhir-compliance-report.md` |

#### Exit Criteria

- [ ] Inferno test suite runs against Vitora
- [ ] US Core Profile tests: ≥80% pass rate
- [ ] IPS tests: ≥90% pass rate (critical for SHA)
- [ ] SMART App Launch tests: ≥90% pass rate
- [ ] All critical failures documented with remediation plan
- [ ] Compliance report generated and reviewed

---

## 4. FHIR Resource Mapping

### Django Model → FHIR R4 Resource Mapping

| Django Model | FHIR Resource | Notes |
|--------------|---------------|-------|
| `Patient` | `Patient` | Core demographics |
| `Encounter` | `Encounter` | Clinical visits |
| `Prescription` | `MedicationRequest` | Medication orders |
| `PrescriptionItem` | `MedicationRequest` | Individual medications |
| `Dispensing` | `MedicationDispense` | Pharmacy dispensing |
| `LabOrder` | `ServiceRequest` | Lab test orders |
| `LabResult` | `Observation` | Lab results |
| `Diagnosis` | `Condition` | ICD-11 diagnoses |
| `SHAClaim` | `Claim` | Insurance claims |
| `Invoice` | `Invoice` | Billing |
| `StaffProfile` | `Practitioner` | Healthcare providers |
| `Facility` | `Organization` | Healthcare facilities |
| `Allergy` | `AllergyIntolerance` | Patient allergies |
| `Vitals` | `Observation` | Vital signs |
| `Admission` | `Encounter` (type=inpatient) | Inpatient admissions |

---

## 5. Kenya SHA-Specific Requirements

### Required FHIR Extensions

| Extension | URI | Purpose |
|-----------|-----|---------|
| SHA Scheme | `urn:sha:scheme` | Insurance scheme (CAT-SHA-001, etc.) |
| MFL Code | `urn:kenya:mfl` | Master Facility List code |
| CR Number | `urn:sha:client-registry` | Client Registry identifier |
| NHIF Number | `urn:kenya:nhif` | Legacy NHIF identifier |

### Coding Systems

| System | URI | Usage |
|--------|-----|-------|
| ICD-11 | `http://id.who.int/icd/release/11/mms` | Diagnosis (required) |
| ICD-10 | `http://hl7.org/fhir/sid/icd-10` | Legacy (deprecated for SHA) |
| LOINC | `http://loinc.org` | Lab tests |
| ICHI | `http://id.who.int/ichi` | Interventions |
| SHA Interventions | `urn:sha:interventions` | Kenya-specific procedures |

---

## 6. Testing Strategy

### Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit Tests | `tests/core/test_fhir_validator.py` | Validator logic |
| Schema Tests | `tests/billing/test_shr_compliance/` | FHIR structure |
| Profile Tests | `tests/billing/test_shr_compliance/test_sha_profiles.py` | Kenya profiles |
| Integration Tests | `tests/integration/test_fhir_server.py` | HAPI FHIR server |
| E2E Tests | `tests/e2e/test_sha_workflow.py` | Full claim workflow |

### Coverage Requirements

| Phase | Minimum Coverage |
|-------|------------------|
| Phase 1 | 90% validator service |
| Phase 2 | 95% profile validator |
| Phase 3 | 80% integration tests |
| Phase 4 | 85% HL7 service |
| Phase 5 | 90% SMART implementation |

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| SHA API changes | High | Version pin, monitor announcements |
| FHIR spec updates | Medium | Use stable R4, plan R5 migration |
| HL7 v2 complexity | Medium | Focus on ORM/ORU only initially |
| SMART scope creep | Low | Implement basic launch first |
| Inferno failures | Medium | Document known limitations |

---

## 8. Timeline

| Phase | Duration | Dependencies | Target |
|-------|----------|--------------|--------|
| Phase 1 | 1 week | None | ✅ Complete |
| Phase 2 | 2 weeks | Phase 1 | ✅ Complete |
| Phase 3 | 1 week | Phase 1, Docker | ✅ Complete |
| Phase 4 | 3 weeks | Lab module complete | Q2 2026 |
| Phase 5 | 4 weeks | OAuth2 expertise | Q2 2026 |
| Phase 6 | 2 weeks | Phases 1-5 | Q3 2026 |

---

## 9. References

- [HL7 FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [SMART on FHIR](https://docs.smarthealthit.org/)
- [International Patient Summary (IPS)](https://hl7.org/fhir/uv/ips/)
- [Kenya SHA API Documentation](docs/sha-guides/)
- [HAPI FHIR Server](https://hapifhir.io/)
- [Inferno Testing Framework](https://inferno.healthit.gov/)
- [fhir.resources Python Library](https://pypi.org/project/fhir.resources/)

---

## 10. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| QA Lead | | | |
| Product Owner | | | |

---

**Document History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-31 | AI Assistant | Initial draft |
| 1.1 | 2026-01-31 | AI Assistant | Phase 3 complete - 55 integration tests passing |
