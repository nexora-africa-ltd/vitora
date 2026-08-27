<!--
This file records the Workstream F lint-ignore audit and governance decisions.
Use: review before adding/changing Ruff ignores; update in the same PR as lint config edits.
Inputs: backend/pyproject.toml per-file-ignores entries, new/changed ignore codes, owner, and expiry date.
-->

# Lint Ignore Audit (Workstream F)

## Scope

- Audited `backend/pyproject.toml` `[tool.ruff.lint.per-file-ignores]` entries.
- Focused on silent-failure suppressions (`S110`) and governance for new ignores.

## Classification

- `permanent`: framework/signature constraints (`ARG*`, `E402`, `DJ012`) or required compatibility patterns.
- `temporary`: readability/legacy suppressions that should be reduced over time (`SIM*`, selected `B904`, etc.).
- `removed`: stale suppressions no longer needed after codebase cleanup.

## Changes Applied

- Removed all `S110` suppressions from backend Ruff per-file ignores.
- Removed entries that only existed to suppress `S110`:
  - `hmis/apps/core/dashboard_views.py`
  - `hmis/apps/allied_health/views.py`
  - `hmis/apps/clinics/models.py`
  - `hmis/apps/mch/models.py`
- Kept and documented non-`S110` ignores where they map to framework constraints or accepted temporary debt.

## Verification

- Ran `poetry run ruff check hmis` after removing `S110` ignores.
- Result: pass (no new violations).

## Governance Rule

Any new lint ignore must include all of:

1. short rationale in `backend/pyproject.toml` comment,
2. owner (team or module),
3. expiry date or removal milestone,
4. linked follow-up issue in PR description.
