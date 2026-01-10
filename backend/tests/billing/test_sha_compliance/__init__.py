"""
SHA Compliance Test Suite.

This package contains quality assurance tests that validate whether the Vitora
codebase aligns with the SHA (Social Health Authority) integration guidelines.

Reference documents:
    - docs/sha-guides/fhir-guide.md
    - docs/sha-guides/claims.md
    - docs/sha-guides/claims-submission.md
    - docs/sha-guides/eligibility.md
    - docs/sha-guides/patients.md
    - docs/sha-guides/facilities.md
    - docs/sha-guides/hwr.md
    - docs/sha-guides/cr.md
    - docs/sha-guides/shr.md

Test Categories:
    1. FHIR Bundle Structure - Bundle format, resources, profiles
    2. Claims Submission - ICD-11 coding, tariffs, required fields
    3. Eligibility API - Request/response format, endpoints
    4. Patient Registry (CR) - Patient identifiers, demographics
    5. Facility Registry - MFL codes, facility levels
    6. Health Worker Registry - Practitioner identifiers
    7. Coverage & Insurance - SHA scheme extensions

These tests may fail if the implementation is incomplete. They serve as a
compliance checklist and gap analysis tool for SHA integration readiness.
"""
