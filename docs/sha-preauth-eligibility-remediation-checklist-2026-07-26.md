# SHA/DHA Preauth + Eligibility Remediation Checklist

Date: 2026-07-26
Based on: `docs/sha-preauth-eligibility-compliance-audit-2026-07-26.md`

## Planning Assumptions

- Owners are role-based and can be mapped to actual names in sprint planning.
- Effort uses T-shirt sizing with rough elapsed time:
  - S: 0.5-2 days
  - M: 3-5 days
  - L: 1-2 weeks
- Sequence is dependency-aware and optimized for risk reduction first.

## Workstreams

### WS-1: Canonical Preauth Status Model (P0)

| ID | Task | Owner | Effort | Dependencies | Output / Done Criteria |
| --- | --- | --- | --- | --- | --- |
| WS1-01 | Define canonical internal preauth status map covering legacy `PreauthRequest` and ILM `SHAPreauth` | Backend Lead | S | None | ADR/spec doc merged under `docs/` with final enum + mapping table |
| WS1-02 | Implement backend adapter/normalizer for all preauth read paths | Backend Engineer | M | WS1-01 | Service/util layer returns normalized status regardless of source model |
| WS1-03 | Update API serializers/views to expose canonical status consistently | Backend Engineer | M | WS1-02 | `preauth` APIs return consistent status contract in both legacy/ILM routes |
| WS1-04 | Update frontend schemas/types/UI consumers to rely on canonical status | Frontend Engineer | M | WS1-03 | `web-app/lib/schemas/sha.schema.ts` + consuming views no longer branch on model-specific statuses |
| WS1-05 | Add parity tests for legacy vs ILM status outcomes | QA + Backend Engineer | M | WS1-03 | Test suite asserts equivalent user-visible decision/status behavior |

### WS-2: Eligibility Fallback Safety Controls (P0)

| ID | Task | Owner | Effort | Dependencies | Output / Done Criteria |
| --- | --- | --- | --- | --- | --- |
| WS2-01 | Define eligibility confidence states (`verified`, `fallback`, `unknown`, `ineligible`) and policy for actions | Product + Compliance + Backend Lead | S | None | Signed policy matrix for what actions are allowed per state |
| WS2-02 | Tighten frontend fallback logic to avoid implicit positive eligibility on upstream failures | Frontend Engineer | M | WS2-01 | `sha.ts` fallback paths require explicit confidence and block risky flows |
| WS2-03 | Add backend guardrails for SHA-covered actions when confidence is not `verified` | Backend Engineer | M | WS2-01 | Preauth/claim-proceed endpoints enforce confidence constraints |
| WS2-04 | Implement audit telemetry on fallback decisions (actor, reason, endpoint, timestamp) | Backend Engineer | S | WS2-03 | Structured audit event emitted and queryable for each fallback allowance |
| WS2-05 | Add negative-path E2E tests for dependent and upstream-failure scenarios | QA Engineer | M | WS2-02, WS2-03 | E2E tests cover denied/unknown/fallback branches and expected UI/API behavior |

### WS-3: Route Contract and Namespace Governance (P1)

| ID | Task | Owner | Effort | Dependencies | Output / Done Criteria |
| --- | --- | --- | --- | --- | --- |
| WS3-01 | Publish a single contract note for legacy vs ILM parameter conventions | Integration Engineer | S | None | Doc includes `doc_type/doc_value` vs `identification_type/identification_number` mapping |
| WS3-02 | Decide namespace strategy (`/api/sha` facade vs current mixed routes with formal policy) | Backend Lead + Architect | S | WS3-01 | Decision captured in ADR with migration/no-migration rationale |
| WS3-03 | Implement compatibility facade or route aliasing as per ADR | Backend Engineer | M | WS3-02 | Discoverable route set with no behavior regressions |
| WS3-04 | Add permission and observability checks across both namespaces | Backend Engineer + DevOps | S | WS3-03 | Access controls + dashboards/alerts cover all SHA endpoints |
| WS3-05 | Update frontend client references and docs to finalized route strategy | Frontend Engineer | S | WS3-03 | `web-app/lib/api/sha.ts` and docs aligned to chosen contract |

### WS-4: Occupancy Scope Decision (P2 / Conditional)

| ID | Task | Owner | Effort | Dependencies | Output / Done Criteria |
| --- | --- | --- | --- | --- | --- |
| WS4-01 | Confirm with DHA whether occupancy exchange is mandatory for this deployment profile | Compliance + Integration Lead | S | None | Written confirmation stored in project docs |
| WS4-02 | If mandatory: design SHA-scoped occupancy endpoint/service contract | Backend Lead | S | WS4-01 | API design approved with payload examples and auth/audit plan |
| WS4-03 | If mandatory: implement backend occupancy integration and local API | Backend Engineer | M | WS4-02 | Endpoint live with tests and operational logging |
| WS4-04 | If mandatory: add frontend consumer and operator visibility | Frontend Engineer | S | WS4-03 | UI path wired and validated |

## Sequenced Delivery Plan

### Phase 1 (Week 1): Risk Containment

1. Complete WS1-01, WS2-01, WS3-01.
2. Start WS2-02 and WS2-03 in parallel after WS2-01.
3. Add immediate telemetry (WS2-04) before broader refactors complete.

### Phase 2 (Week 2): Canonicalization and Parity

1. Complete WS1-02, WS1-03, WS1-04.
2. Add parity tests (WS1-05) and negative-path tests (WS2-05).
3. Freeze API contract deltas for release candidate.

### Phase 3 (Week 3): Governance Hardening

1. Complete WS3-02, WS3-03, WS3-04, WS3-05.
2. Run regression across all SHA eligibility/preauth journeys.
3. Publish updated integrator-facing docs.

### Phase 4 (Conditional): Occupancy

1. Execute WS4-* only if DHA confirms mandatory occupancy integration.

## Verification Gate (Release Exit Criteria)

- Canonical preauth status is consistent across all API/UI paths.
- No fallback path silently upgrades eligibility confidence to fully verified.
- Audit trail exists for every fallback authorization decision.
- Contract docs and route conventions are explicit and current.
- Test suite includes:
  - legacy/ILM parity tests,
  - eligibility negative paths,
  - permission checks across namespaces.

## Suggested Owners to Assign

- Backend Lead: SHA integration maintainer
- Frontend Lead: Billing/SHA UX maintainer
- QA Lead: E2E + contract testing owner
- Compliance/Integration Lead: DHA liaison and sign-off owner
- DevOps: observability and alerting owner
