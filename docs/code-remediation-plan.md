<!--
What this file is for: Actionable remediation plan to reduce ai risk signals and improve maintainability, safety, and consistency across the Vitora repo.
How to use: Treat as a working checklist. Pick a workstream, implement tasks in small PRs, and record progress/status in each section.
Supported inputs/args: N/A (documentation file).
-->

# Code Remediation Plan

This plan targets concrete risk signals found in the codebase: oversized files, broad exception swallowing, TypeScript `any` usage, inconsistent API schema validation, and desktop test coverage gaps.

## Goals

- Reduce fragile, high-entropy code paths.
- Enforce consistent type and API contract safety.
- Improve failure visibility (fewer silent errors).
- Add confidence via focused automated tests.

## Baseline Metrics (track weekly)

- Backend broad exception count (`except Exception`):
  - Command: `cd backend && rg -n "except Exception" hmis/apps | wc -l`
- Web TypeScript escape hatch count (`: any` / `as any`):
  - Command: `cd web-app && rg -n "(:\s*any\b|\bas\s+any\b|<any>)" . --glob "*.ts" --glob "*.tsx" | wc -l`
- Large Python file count (>1500 lines):
  - Command: `cd backend && python - <<'PY'
import pathlib
files=[p for p in pathlib.Path('hmis/apps').rglob('*.py')]
big=[(p,sum(1 for _ in p.open())) for p in files]
big=[x for x in big if x[1]>1500]
print(len(big))
for p,n in sorted(big,key=lambda x:x[1], reverse=True)[:20]:
    print(n,p)
PY`
- Web API raw return count (`return response.data`):
  - Command: `cd web-app && rg -n "return response\.data" lib/api | wc -l`

## Workstream A: Break Up Oversized Backend Files

### Priority files

- `backend/hmis/apps/billing/sha_views.py`
- `backend/hmis/apps/billing/models.py`
- `backend/hmis/apps/core/models.py`
- `backend/hmis/apps/inpatient/views.py`

### Actions

1. Split by domain concern (serializers/views/services/selectors/utils), not by arbitrary line ranges.
2. Keep public import paths stable with temporary re-export shims.
3. Add regression tests before and after each extraction.
4. Cap new modules to ~400-800 lines when feasible.

### Exit criteria

- No target file remains above 2500 lines.
- No behavior changes in API contract/integration tests.

## Workstream B: Eliminate Silent Failure Patterns

### Actions

1. Replace `except Exception: pass` with one of:
   - specific exception types,
   - explicit fallback + structured logging,
   - re-raise with context where safety-critical.
2. Introduce a policy:
   - disallow bare/broad exception handlers in request/transaction code paths,
   - allow only in explicitly documented resilience boundaries.
3. Add tests for failure-path behavior (timeouts, invalid payloads, missing dependencies).

### Exit criteria

- Broad exception count reduced by at least 50% in first pass.
- Critical flows log actionable context on failure.

## Workstream C: Remove TypeScript `any` Debt

### High-priority files

- `web-app/app/(dashboard)/wards/page.tsx`
- `web-app/app/(dashboard)/inpatient/bed-board/page.tsx`
- `web-app/app/onboarding/page.tsx`

### Actions

1. Replace `any` with typed DTOs from `lib/types/*`.
2. Where data is uncertain, parse with Zod and narrow from `unknown`.
3. Add lint rule pressure:
   - increase strictness on explicit `any` (warn -> error in phases).
4. Require typed error handling (`catch (err: unknown)` + narrowing helpers).

### Exit criteria

- 70% reduction in `: any` / `as any` in app pages.
- New code introduces zero new explicit `any` without waiver.

## Workstream D: Enforce API Contract Validation Everywhere

### Problem

Some API methods still return raw `response.data` without Zod validation.

### Actions

1. In `web-app/lib/api/*`, enforce `parseResponse()` for all JSON endpoints.
2. Keep explicit exceptions only for blobs/streams/downloads.
3. Add a lightweight contract test template for every API module.
4. Add CI guard (lint script) to flag raw `return response.data` in API client files.

### Exit criteria

- All JSON-returning API methods are schema-validated.
- Contract tests exist for all high-traffic modules (patients, encounters, billing, scheduling, inventory).

## Workstream E: Add Desktop Test Coverage

### Actions

1. Add unit tests for Rust sidecar lifecycle helpers in `desktop-app/src-tauri`.
2. Add smoke integration tests for:
   - sidecar health probe,
   - failure page rendering when sidecar crashes,
   - single-instance/tray behavior.
3. Add npm scripts for test execution and CI hook.

### Exit criteria

- Desktop app has runnable automated tests in CI.
- At least one test protects each critical startup/shutdown guardrail.

## Workstream F: Tighten Lint Exceptions and Governance

### Actions

1. Audit `backend/pyproject.toml` `per-file-ignores` entries and classify:
   - justified permanent,
   - temporary (must get issue + deadline),
   - removable now.
2. Remove ignores that permit silent-failure patterns (`S110`) unless explicitly justified.
3. Add PR checklist item: "New lint ignores require rationale + expiry."

### Exit criteria

- Reduced ignore surface area with documented rationale.
- No new blanket ignores without owner and due date.

## Suggested Execution Plan (6 Weeks)

- Week 1: Baseline metrics, CI guards, pick top 2 large files.
- Week 2: Workstream B (exception cleanup) for billing + core hot paths.
- Week 3: Workstream C (TS any removal) on inpatient + onboarding pages.
- Week 4: Workstream D (API parseResponse coverage) for inventory/patients/scheduling.
- Week 5: Workstream E (desktop tests) minimum smoke suite.
- Week 6: Workstream F lint-governance hardening + retro + next cycle planning.

## PR Template Additions (Recommended)

- "Does this introduce broad exception handling? If yes, why is it safe?"
- "Does this add explicit `any`? If yes, why can it not be typed now?"
- "Are all JSON API responses parsed with Zod `parseResponse()`?"
- "If lint ignores were added, include issue link + removal date."

## Definition of Done for De-vibecoding

- High-risk monoliths are decomposed into reviewable modules.
- Silent error paths are replaced with explicit, observable behavior.
- Web frontend uses typed + runtime-validated contracts consistently.
- Desktop critical runtime paths are covered by automated tests.
- Governance prevents regression into the same patterns.
