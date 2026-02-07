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
| **Frontend contract tests** | 📋 Planned (Layer 3) |

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
| **4** | Frontend schema comparison tests | 📋 TODO | Catches frontend drift |
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

*Generated: 2026-02-07 | Updated: 2026-02-08 (Layers 1 & 2 implemented)*
