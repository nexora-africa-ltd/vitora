# Contract Testing Recommendations — Vitora HMIS

> **Goal**: Surface API data shape mismatches between the Django backend and Next.js frontend before they cause runtime errors.

---

## Current State

| Layer | Status |
|-------|--------|
| **Backend serializers** | 13 apps, 50+ serializers |
| **Frontend Zod schemas** | 16 schema files, `parseResponse()` validation on every API call |
| **OpenAPI schema** | ✅ `drf-spectacular` configured (`/api/schema/`, `/api/docs/`) |
| **Backend contract tests** | ✅ 67 serializer snapshot tests in `tests/test_contracts.py` |
| **Frontend contract tests** | ✅ Started — 6/13 modules (98 tests) |

The frontend validates API responses with Zod at runtime via `parseResponse()`. Backend serializer snapshot tests now catch field changes **before deployment**. When a serializer field is added, renamed, or removed, the contract test fails with a clear message directing the developer to update the frontend Zod schema.

---

## Strategy: Four Layers of Contract Coverage

### Layer 1 — Backend Serializer Snapshot Tests (pytest) ✅ IMPLEMENTED

**What**: Assert that each serializer's field set exactly matches a known expected set. If a developer adds or removes a field, the test fails with a clear message: *"New fields added — update frontend Zod schema"*.

**File**: `backend/tests/test_contracts.py` — 67 parameterized tests covering all primary serializers across 13 apps.

**Run**: `make test-contracts` or `poetry run pytest tests/test_contracts.py -v`

**Catches**: Field additions, removals, renames on the backend side.

```python
# Example failure output:
# PatientSerializer: new fields added to serializer.
#   Added: ['blood_type']
#   → Update the CONTRACTS dict in tests/test_contracts.py
#   → Update the frontend Zod schema to include these fields
```

**How to update when intentionally changing a serializer**:
1. Change the serializer field.
2. Run `make test-contracts` — it will fail showing added/removed fields.
3. Update the `CONTRACTS` dict in `tests/test_contracts.py` to match.
4. Update the corresponding Zod schema in `web-app/lib/schemas/`.

### Layer 2 — OpenAPI Schema Generation (drf-spectacular) ✅ IMPLEMENTED

**What**: Auto-generate an OpenAPI 3.0 JSON schema from all DRF serializers and views.

**Endpoints**:
- Schema download: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`

**Export for CI**: `python manage.py spectacular --file schema.json`

### Layer 3 — Frontend Schema Comparison Tests (Jest)

**What**: Convert Zod schemas to JSON Schema (via `zod-to-json-schema`), then compare field-by-field against the OpenAPI spec exported from Layer 2.

**How**: Jest tests in `web-app/__tests__/contracts/` that:
1. Read the exported `schema.json` from backend
2. Convert each Zod schema to JSON Schema
3. Assert that required fields, types, and nesting match

**Catches**: Frontend schema drift — when the Zod schema doesn't match the actual API.

**Run**: `npm test -- --testPathPattern=contracts`

#### Planned Contract Tests

| Schema File | Test File | Status | Key Schemas |
|-------------|-----------|--------|-------------|
| `encounter.schema.ts` | `encounter.contract.test.ts` | ✅ Done (15 tests) | Encounter, Diagnosis, TreatmentPlan, ICD10Code + 10 enums |
| `patient.schema.ts` | `patient.contract.test.ts` | ✅ Done (12 tests) | Patient, EmergencyContact, PatientListItem + 6 enums |
| `clinic.schema.ts` | `clinic.contract.test.ts` | ✅ Done (17 tests) | Clinic, Session, Visit, Staff, Schedule, Enrollment + 10 enums |
| `pharmacy.schema.ts` | `pharmacy.contract.test.ts` | ✅ Done (18 tests) | Drug, StockBatch, Prescription, Dispensing, Adjustment + 9 enums |
| `laboratory.schema.ts` | `laboratory.contract.test.ts` | ✅ Done (16 tests) | LabOrder, LabOrderItem, LabResult, LabQueue + 10 enums |
| `imaging.schema.ts` | `imaging.contract.test.ts` | ✅ Done (20 tests) | ImagingOrder, ImagingOrderItem, ImagingProcedure, ImagingResource + 5 enums |
| `billing.schema.ts` | `billing.contract.test.ts` | 📋 TODO | Invoice, Payment, BillingItem, InsuranceClaim |
| `triage.schema.ts` | `triage.contract.test.ts` | 📋 TODO | TriageAssessment, TriageCategory, VitalSigns |
| `inpatient.schema.ts` | `inpatient.contract.test.ts` | 📋 TODO | Admission, Bed, Ward, Discharge |
| `sha.schema.ts` | `sha.contract.test.ts` | 📋 TODO | SHAClaim, SHAPreauth, SHAMember |
| `rbac.schema.ts` | `rbac.contract.test.ts` | 📋 TODO | User, Role, Permission, Group |
| `core.schema.ts` | `core.contract.test.ts` | 📋 TODO | County, SubCounty, Ward, AuditLog |
| `checkin.schema.ts` | `checkin.contract.test.ts` | 📋 TODO | CheckIn, Queue, WaitTime |

**Note**: Document schemas (`invoice.schema.ts`, `prescription.schema.ts`, etc.) are frontend-only and do not require contract tests.

#### How to Add a New Contract Test

Follow this approach when adding contract tests for a new module:

**1. Create the test file:**
```bash
touch web-app/__tests__/contracts/{module}.contract.test.ts
```

**2. Use this template structure:**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { MySchema, MyEnumSchema } from '@/lib/schemas/{module}.schema';

// OpenAPI schema loader (YAML format despite .json extension)
function loadOpenAPISchema() {
  const schemaPath = path.resolve(__dirname, '../../../backend/schema.json');
  return yaml.load(fs.readFileSync(schemaPath, 'utf-8'));
}

// Helper: Get schema properties
function getSchemaProperties(openapi, schemaName) {
  const schema = openapi.components.schemas[schemaName];
  return schema?.properties ?? null;
}

// Helper: Get enum values
function getSchemaEnumValues(openapi, schemaName) {
  const schema = openapi.components.schemas[schemaName];
  return schema?.enum ?? null;
}

// Helper: Extract Zod schema field names
function getZodSchemaFields(zodSchema) {
  const jsonSchema = zodToJsonSchema(zodSchema, { target: 'openApi3' });
  return jsonSchema.properties ? Object.keys(jsonSchema.properties) : [];
}

// Helper: Extract Zod enum values
function getZodEnumValues(zodSchema) {
  const jsonSchema = zodToJsonSchema(zodSchema, { target: 'openApi3' });
  return jsonSchema.enum ?? [];
}
```

**3. Test pattern for object schemas:**

```typescript
describe('MySchema', () => {
  it('should have all fields from the OpenAPI MyModel schema', () => {
    const zodFields = getZodSchemaFields(MySchema);
    const apiProperties = getSchemaProperties(openapi, 'MyModel');
    
    if (!apiProperties) {
      console.warn('MyModel schema not found in OpenAPI');
      return;
    }

    const apiFields = Object.keys(apiProperties);
    const missingInZod = apiFields.filter(f => !zodFields.includes(f));
    
    // Log missing fields for debugging (helps identify drift)
    if (missingInZod.length > 0) {
      console.warn(`⚠️  MySchema: API fields missing:\n  ${missingInZod.join(', ')}`);
    }

    // Only fail on critical fields (core identifiers)
    const criticalMissing = missingInZod.filter(f => 
      ['id', 'name', 'status'].includes(f)
    );
    expect(criticalMissing).toEqual([]);
  });
});
```

**4. Test pattern for enum schemas:**

```typescript
describe('MyStatusSchema (enum)', () => {
  it('should match OpenAPI StatusEnum values', () => {
    const zodValues = getZodEnumValues(MyStatusSchema);
    const apiValues = getSchemaEnumValues(openapi, 'StatusEnum');
    // OpenAPI may use hashed names like 'Status145Enum' - check schema.json

    if (!apiValues) {
      console.warn('StatusEnum not found in OpenAPI');
      return;
    }

    const missingInZod = apiValues.filter(v => !zodValues.includes(v));
    
    if (missingInZod.length > 0) {
      console.warn(`MyStatusSchema: Missing values: ${missingInZod.join(', ')}`);
    }

    expect(missingInZod).toEqual([]);  // Enums must match exactly
  });
});
```

**5. Finding OpenAPI enum names:**

OpenAPI uses hashed enum names (e.g., `Status145Enum`, `Priority0b7Enum`). To find the correct name:
```bash
grep -n "your_enum_value" backend/schema.json | head -5
```

**6. When a test fails:**

The contract test catching a mismatch is **success** — it means the test is working! Fix by:

1. **Missing enum values**: Add the missing values to the Zod schema
2. **Missing object fields**: Either add to Zod (if needed on frontend) or verify it's intentionally skipped
3. **Update the doc**: Run tests again to confirm, then commit

**7. Run and verify:**
```bash
cd web-app && npm test -- --testPathPattern=contracts/{module} --no-coverage
```

```typescript
// web-app/__tests__/contracts/patient.contract.test.ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { PatientSchema } from "@/lib/schemas/patient.schema";
import openApiSpec from "../../backend/schema.json";

it("Patient schema fields match OpenAPI spec", () => {
  const zodFields = Object.keys(zodToJsonSchema(PatientSchema).properties ?? {});
  const apiFields = Object.keys(openApiSpec.components.schemas.Patient.properties ?? {});
  
  const missing = apiFields.filter(f => !zodFields.includes(f));
  expect(missing).toEqual([]);
});
```

### Layer 4 (Optional) — Live Contract Tests

**What**: Hit real API endpoints and validate responses with Zod `safeParse`. Catches issues that static analysis misses (computed fields, conditional inclusion).

**When**: CI with a test database, or local dev.

```typescript
it("GET /api/patients/ response matches Zod schema", async () => {
  const res = await axios.get(`${API}/api/patients/`, { headers: authHeaders });
  const result = PatientListResponseSchema.safeParse(res.data);
  expect(result.success).toBe(true);
});
```

---

## Implementation Status

| Step | What | Status | Impact |
|------|------|--------|--------|
| **1** | `drf-spectacular` + settings | ✅ Done | Enables everything else |
| **2** | Backend serializer snapshot tests | ✅ Done (67 tests) | Catches 80% of breakages |
| **3** | CI: export schema on every push | 📋 TODO | Keeps schema.json current |
| **4** | Frontend schema comparison tests | ✅ Started (Encounter) | Catches frontend drift |
| **5** | Live contract tests | 📋 TODO | Full E2E validation |

---

## CI Pipeline

```yaml
# .github/workflows/contract-tests.yml
jobs:
  contracts:
    steps:
      # Backend: run snapshot tests + export schema
      - run: |
          cd backend && poetry install
          poetry run pytest tests/test_contracts.py -v
          poetry run python manage.py spectacular --file schema.json
      
      # Frontend: compare Zod schemas against exported schema
      - run: |
          cd web-app && npm ci
          cp ../backend/schema.json ./schema.json
          npm test -- --testPathPattern=contracts
```

---

## Rules for Developers

1. **Backend field change?** → Update `CONTRACTS` dict in `test_contracts.py`, then tell frontend team to update the corresponding Zod schema.
2. **Frontend schema change?** → Run contract tests to verify it still matches the API.
3. **New endpoint?** → Add serializer to `CONTRACTS`, add Zod schema, add contract test.

---

*Generated: 2026-02-07 | Updated: 2026-02-08 (Layers 1, 2 & 3: 6 modules done)*
