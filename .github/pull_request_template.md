<!--
This file defines the default pull request checklist for Vitora HMIS contributors.
Use: GitHub auto-loads this template when opening a PR in this repository.
Inputs: complete the checkboxes and add links (issues, docs, follow-ups) where requested.
-->

## What Changed

-

## Why

-

## Validation

- [ ] Relevant tests pass locally/CI
- [ ] Lint/type checks pass for touched areas
- [ ] Documentation updated when behavior/contracts changed

## Safety & Quality Checks

- [ ] Broad exception handling is justified at a true boundary (or removed)
- [ ] New explicit `any` usage is justified (frontend)
- [ ] JSON API responses are validated with `parseResponse()` + schema
- [ ] New lint ignores include rationale + owner + expiry/removal milestone

## Follow-ups

- Issue(s):
- Expiry/removal date(s) for temporary exceptions:
