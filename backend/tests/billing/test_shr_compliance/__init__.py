"""
SHR (Shared Health Record) compliance test suite for Vitora HMIS.

This test suite validates compliance with SHA's SHR integration requirements
as documented in docs/sha-guides/shr-integration.md.

Key workflows tested:
1. Patient registration/update via SHR
2. MedicationRequest (Prescription) FHIR structure
3. MedicationDispense FHIR structure
4. International Patient Summary (IPS) bundle
5. Refill balance calculation
6. API endpoint configuration

Reference: SHA Digital Superhighway FHIR API
"""
