# Vitora HMIS — API Reference

> **Last Updated**: July 2026
> **Base URL**: `https://api.vitora.health` (production) | `http://127.0.0.1:9088` (development)
> **Auth**: JWT via httpOnly cookies or Authorization header

---

## Table of Contents

1. [Authentication](#authentication)
2. [Patients](#patients)
3. [Encounters](#encounters)
4. [Triage](#triage)
5. [Clinics](#clinics)
6. [Laboratory](#laboratory)
7. [Pharmacy](#pharmacy)
8. [Billing](#billing)
9. [Inpatient](#inpatient)
10. [SHA / DHA HIE Integration](#sha--dha-hie-integration)
11. [Insurance (Private Payers)](#insurance-private-payers)
12. [Scheduling](#scheduling)
13. [Imaging / Radiology](#imaging--radiology)
14. [MCH (Maternal & Child Health)](#mch-maternal--child-health)
15. [Immunizations](#immunizations)
16. [Surveillance](#surveillance)
17. [Allied Health](#allied-health)
18. [Procedures & Theatre](#procedures--theatre)
19. [Blood Bank & Dialysis](#blood-bank--dialysis)
20. [Referrals](#referrals)
21. [AI / TibaBot](#ai--tibabot)
22. [Clinical Decision Support (CDS)](#clinical-decision-support-cds)
23. [Quality](#quality)
24. [Analytics & MOH Reporting](#analytics--moh-reporting)
25. [Inventory](#inventory)
26. [RBAC & Staff](#rbac--staff)
27. [Kenya Locations](#kenya-locations)
28. [Notifications & Comments](#notifications--comments)
29. [Offline Sync & PowerSync](#offline-sync--powersync)
30. [Interoperability (HL7 / KENHDD)](#interoperability-hl7--kenhdd)
31. [Platform (MFA, Licensing, Setup)](#platform-mfa-licensing-setup)

---

## Authentication

### JWT Token (Header-based)

```
POST   /api/token/                  # Login: {username, password} → {access, refresh}
                                     # username field accepts username OR email
POST   /api/token/refresh/          # Refresh: {refresh} → {access}
POST   /api/token/verify/           # Verify: {token} → 200 OK or 401
```

### Cookie-based (Web Frontend)

```
POST   /api/auth/login/             # Cookie login: sets httpOnly access+refresh cookies
POST   /api/auth/refresh/           # Cookie refresh: rotates httpOnly cookies
POST   /api/auth/logout/            # Cookie logout: clears httpOnly cookies
POST   /api/auth/mfa-verify/        # MFA TOTP verification (cookie-based)
```

### Auth Flows (Public)

```
POST   /api/core/auth/signup/                    # Org self-service signup
POST   /api/core/auth/verify-email/              # Email verification token
POST   /api/core/auth/password-reset/request/    # Request password reset
POST   /api/core/auth/password-reset/confirm/    # Confirm password reset
POST   /api/core/auth/change-password/           # Change password (authenticated)
```

---

## Patients

### CRUD

```
GET    /api/patients/                # List patients (paginated, filterable)
POST   /api/patients/                # Create patient (auto-generates MRN)
GET    /api/patients/{id}/           # Get patient detail
PATCH  /api/patients/{id}/           # Update patient
DELETE /api/patients/{id}/           # Delete patient (soft delete)
```

### Nested Resources

```
# Emergency Contacts
GET    /api/patients/{id}/emergency-contacts/
POST   /api/patients/{id}/emergency-contacts/
PATCH  /api/patients/{id}/emergency-contacts/{contact_id}/
DELETE /api/patients/{id}/emergency-contacts/{contact_id}/

# Allergies
GET    /api/patients/{id}/allergies/
POST   /api/patients/{id}/allergies/
PATCH  /api/patients/{id}/allergies/{pk}/
DELETE /api/patients/{id}/allergies/{pk}/

# Social History
GET    /api/patients/{id}/social-history/
POST   /api/patients/{id}/social-history/
PATCH  /api/patients/{id}/social-history/{pk}/
DELETE /api/patients/{id}/social-history/{pk}/

# Chronic Conditions
GET    /api/patients/{id}/chronic-conditions/
POST   /api/patients/{id}/chronic-conditions/
PATCH  /api/patients/{id}/chronic-conditions/{pk}/
DELETE /api/patients/{id}/chronic-conditions/{pk}/

# Current Medications
GET    /api/patients/{id}/current-medications/
POST   /api/patients/{id}/current-medications/
PATCH  /api/patients/{id}/current-medications/{pk}/
DELETE /api/patients/{id}/current-medications/{pk}/

# Past Surgeries
GET    /api/patients/{id}/past-surgeries/
POST   /api/patients/{id}/past-surgeries/
PATCH  /api/patients/{id}/past-surgeries/{pk}/
DELETE /api/patients/{id}/past-surgeries/{pk}/

# Family History
GET    /api/patients/{id}/family-history/
POST   /api/patients/{id}/family-history/
PATCH  /api/patients/{id}/family-history/{pk}/
DELETE /api/patients/{id}/family-history/{pk}/

# Patient Lab Orders & Results
GET    /api/patients/{id}/lab-orders/
GET    /api/patients/{id}/lab-results/
```

---

## Encounters

### CRUD

```
GET    /api/encounters/              # List encounters
POST   /api/encounters/              # Create encounter
GET    /api/encounters/{id}/         # Get encounter detail
PATCH  /api/encounters/{id}/         # Update encounter
DELETE /api/encounters/{id}/         # Delete encounter
```

### Nested Resources

```
# Diagnoses
GET    /api/encounters/{id}/diagnoses/
POST   /api/encounters/{id}/diagnoses/
PATCH  /api/encounters/{id}/diagnoses/{pk}/
DELETE /api/encounters/{id}/diagnoses/{pk}/

# Treatment Plan (single per encounter)
GET    /api/encounters/{id}/treatment-plan/
PUT    /api/encounters/{id}/treatment-plan/
POST   /api/encounters/{id}/treatment-plan/apply-template/

# Medications (under treatment plan)
GET    /api/encounters/{id}/treatment-plan/medications/
POST   /api/encounters/{id}/treatment-plan/medications/
PATCH  /api/encounters/{id}/treatment-plan/medications/{pk}/
DELETE /api/encounters/{id}/treatment-plan/medications/{pk}/

# Clinical Comments
GET    /api/encounters/{id}/comments/
POST   /api/encounters/{id}/comments/
PATCH  /api/encounters/{id}/comments/{pk}/
DELETE /api/encounters/{id}/comments/{pk}/
POST   /api/encounters/{id}/comments/{pk}/react/

# Lab Orders (nested view)
GET    /api/encounters/{id}/lab-orders/

# SNOMED CT Search
GET    /api/encounters/snomed/search/?q={term}
```

### Reference Data

```
GET    /api/icd10-codes/             # ICD-10 codes with search
GET    /api/treatment-templates/     # Treatment plan templates
```

---

## Triage

```
# Managed via included app URLs
GET|POST        /api/triage/assessments/         # List / create triage assessments
GET|PATCH       /api/triage/assessments/{id}/    # Detail / update
GET             /api/triage/queue/               # Priority-sorted waiting queue
```

> Uses KETA scale: RED (immediate) / ORANGE (very urgent) / YELLOW (urgent) / GREEN (standard) / BLUE (non-urgent)

---

## Clinics

```
GET|POST        /api/clinics/                        # List / create clinics (8 types)
GET|PATCH       /api/clinics/{id}/                   # Detail / update
GET|POST        /api/clinics/{id}/rooms/             # List / add rooms for a clinic
DELETE          /api/clinics/{id}/rooms/{room_id}/   # Remove room from clinic
GET             /api/clinics/{id}/public-queue/      # Public queue display (no auth required)
```

> Clinic types: OPD, ANC, PNC, CWC, FP, IMMUNIZATION, TB, HIV

---

## Laboratory

```
# Orders
GET|POST        /api/lab/orders/                     # List / create lab orders
GET|PATCH       /api/lab/orders/{id}/                # Detail / update
POST            /api/lab/orders/{id}/collect/         # Mark sample collected
POST            /api/lab/orders/{id}/cancel/          # Cancel order

# Results
GET|POST        /api/lab/results/                    # List / create results
GET|PATCH       /api/lab/results/{id}/               # Detail / update
POST            /api/lab/results/{id}/verify/         # Verify result

# Queue
GET             /api/lab/queue/                      # Lab processing queue

# Comments on lab orders
GET|POST        /api/lab/orders/{id}/comments/
```

---

## Pharmacy

```
# Drug Catalogue
GET             /api/pharmacy/drugs/                 # Drug formulary (search, filter)
GET             /api/pharmacy/drugs/{id}/            # Drug detail

# Prescriptions
GET|POST        /api/pharmacy/prescriptions/         # List / create
GET|PATCH       /api/pharmacy/prescriptions/{id}/    # Detail / update

# Dispensing
POST            /api/pharmacy/dispense/              # Dispense medication (FEFO)
GET             /api/pharmacy/dispensing-history/     # Dispensing records

# Inventory & Stock
GET             /api/pharmacy/stock/                 # Current stock levels
GET             /api/pharmacy/stock-alerts/          # Low stock / expiry alerts

# Comments on prescriptions
GET|POST        /api/pharmacy/prescriptions/{id}/comments/
```

---

## Billing

```
# Invoices
GET|POST        /api/billing/invoices/               # List / create invoices
GET|PATCH       /api/billing/invoices/{id}/          # Detail / update
POST            /api/billing/invoices/{id}/finalize/ # Finalize invoice
POST            /api/billing/invoices/{id}/void/     # Void invoice

# Payments
GET|POST        /api/billing/payments/               # List / create payments
GET             /api/billing/payments/{id}/          # Payment detail

# Payment Points
GET|POST        /api/billing/payment-points/         # List / manage payment points

# Receipts
GET             /api/billing/receipts/               # List receipts
GET             /api/billing/receipts/{id}/          # Receipt detail

# Credit Notes
GET|POST        /api/billing/credit-notes/           # List / create
GET             /api/billing/credit-notes/{id}/      # Detail

# Services & Categories
GET             /api/billing/services/               # Service catalogue
GET             /api/billing/service-categories/     # Service categories
```

---

## Inpatient

```
# Wards
GET|POST        /api/inpatient/wards/                # List / create wards
GET|PATCH       /api/inpatient/wards/{id}/           # Detail / update
POST            /api/inpatient/wards/{id}/generate_beds/  # Auto-generate bed records

# Beds
GET             /api/inpatient/beds/                 # List beds (with occupancy)
PATCH           /api/inpatient/beds/{id}/            # Update bed status

# Admissions
GET|POST        /api/inpatient/admissions/           # List / create admissions
GET|PATCH       /api/inpatient/admissions/{id}/      # Detail / update
POST            /api/inpatient/admissions/{id}/discharge/  # Discharge patient
POST            /api/inpatient/admissions/{id}/transfer/   # Transfer to another ward

# Nursing Kardex
GET|POST        /api/inpatient/kardex/               # Nursing care records

# Comments on admissions
GET|POST        /api/admissions/{id}/comments/
```

---

## SHA / DHA HIE Integration

### Eligibility

```
POST   /api/sha/eligibility/check/                          # Check patient eligibility (includes PFMS fields)
```

### Consent & Visit

```
POST   /api/sha/consent/send-otp/                           # Send consent OTP to patient
POST   /api/sha/consent/validate-otp/                       # Validate OTP → consent token
POST   /api/sha/consent/start-visit/                        # Start visit with DHA
POST   /api/sha/consent/authorize/                          # Initiate biometric auth → {auth_guid, iframe_url}
GET    /api/sha/consent/authorize/{guid}/status/             # Poll biometric status
```

### Claims

```
POST   /api/sha/claims/{id}/validate/                       # Pre-submit validation
POST   /api/sha/claims/{id}/submit/                         # Submit claim to DHA
POST   /api/sha/claims/{id}/ilm/interventions/retire/       # Retire intervention
POST   /api/sha/claims/{id}/ilm/interventions/restore/      # Restore intervention
POST   /api/sha/claims/{id}/ilm/preview-payer/              # Fetch payer-side adjudication view
```

### Preauthorizations

```
POST   /api/sha/ilm/preauth/create/                         # Create preauth (7 types)
POST   /api/sha/preauth/submit/                             # Submit preauth
POST   /api/sha/ilm/preauth/cancel/                         # Cancel preauth
GET    /api/sha/ilm/preauth/fetch/                          # Fetch preauth status
POST   /api/sha/ilm/preauth/doctor-consent/                 # Request doctor consent (Practice360)
GET    /api/sha/ilm/preauth/doctor-consent/poll/            # Poll doctor consent status
GET    /api/sha/preauths/                                   # List preauths
```

### Remittances

```
GET    /api/sha/remittances/                                # List remittances (facility-scoped)
GET    /api/sha/remittances/{id}/                           # Remittance detail
GET    /api/sha/remittances/{id}/claims/                    # Claims paid in remittance
POST   /api/sha/remittances/fetch/                          # Trigger DHA remittance fetch
```

---

## Insurance (Private Payers)

```
# Managed via included app URLs at /api/insurance/
GET|POST        /api/insurance/payers/               # List / create insurance payers
GET|PATCH       /api/insurance/payers/{id}/          # Payer detail / update
GET|POST        /api/insurance/policies/             # List / create patient policies
GET|PATCH       /api/insurance/policies/{id}/        # Policy detail / update
POST            /api/insurance/claims/               # Submit claim to private payer
GET             /api/insurance/claims/               # List claims
```

---

## Scheduling

### Shifts & Roster

```
GET|POST        /api/scheduling/shifts/                       # List / bulk-create shifts
PATCH|DELETE    /api/scheduling/shifts/{id}/                   # Update / delete shift
POST            /api/scheduling/shifts/bulk_delete/            # Bulk delete by ID list
GET             /api/scheduling/shifts/cross_facility_conflicts/  # Detect same-staff overlaps (org-scoped)
GET             /api/scheduling/shifts/staff-workload/         # Staff workload stats for date range
GET             /api/scheduling/shifts/my-shift-today/         # Current user's shift for today
GET             /api/scheduling/shifts/available-rooms/        # Unoccupied PLACE resources for clock-in
```

### Clock-in/out (Room-aware)

```
POST            /api/scheduling/shifts/{id}/start/             # Clock in (blocks after shift end time)
POST            /api/scheduling/shifts/{id}/complete/          # Clock out (auto-closes ClinicSession)
POST            /api/scheduling/shifts/{id}/cancel/            # Cancel shift
POST            /api/scheduling/shifts/{id}/take_break/        # Start break (ACTIVE → ON_BREAK)
POST            /api/scheduling/shifts/{id}/resume/            # Resume from break (ON_BREAK → ACTIVE)
```

### Settings & Constraints

```
GET|POST|PATCH  /api/scheduling/settings/                      # Per-facility scheduling settings
GET             /api/scheduling/settings/current/              # Current facility's settings
GET|POST        /api/scheduling/staff-constraints/             # Staff scheduling constraints
PATCH|DELETE    /api/scheduling/staff-constraints/{id}/        # Update / delete constraint
```

### Resources

```
POST            /api/scheduling/resources/sync_from_staff/     # Sync resources from staff profiles
POST            /api/scheduling/resources/sync_from_clinics/   # Sync PLACE resources from clinics
POST            /api/scheduling/resources/sync_from_wards/     # Sync PLACE resources from wards
GET             /api/scheduling/resources/{id}/linked_clinics/ # Clinics linked via ClinicRoom
```

### Comments on Shifts

```
GET|POST        /api/scheduling/shifts/{id}/comments/
```

---

## Imaging / Radiology

```
# Managed via included app URLs at /api/imaging/
GET|POST        /api/imaging/orders/                 # Imaging orders
GET|PATCH       /api/imaging/orders/{id}/            # Order detail / update
GET             /api/imaging/studies/                 # DICOM studies
GET             /api/imaging/series/                  # DICOM series
GET             /api/imaging/instances/               # DICOM instances
GET             /api/imaging/procedures/              # Procedure catalogue
```

---

## MCH (Maternal & Child Health)

```
# Managed via included app URLs at /api/mch/
GET|POST        /api/mch/anc-visits/                 # ANC visit records
GET|POST        /api/mch/deliveries/                 # Delivery records
GET|POST        /api/mch/pnc-visits/                 # PNC visit records
GET|POST        /api/mch/growth-monitoring/          # Child growth monitoring
GET|POST        /api/mch/labour/                     # Labour / partograph records
```

---

## Immunizations

```
# Managed via included app URLs at /api/immunizations/
GET|POST        /api/immunizations/records/           # Immunization records (KEPI + adult)
GET|POST        /api/immunizations/campaigns/         # Campaign management
GET             /api/immunizations/schedule/           # Patient immunization schedule
GET             /api/immunizations/stock/              # Vaccine stock levels
```

---

## Surveillance

```
# Managed via included app URLs at /api/surveillance/
GET|POST        /api/surveillance/idsr-reports/       # IDSR weekly reports
GET|POST        /api/surveillance/ihr-notifications/  # IHR notifications
GET             /api/surveillance/outbreak-alerts/    # Outbreak alert dashboard
```

---

## Allied Health

```
# Physiotherapy
GET|POST        /api/physiotherapy/assessments/      # PT assessments
GET|PATCH       /api/physiotherapy/assessments/{id}/

# Nutrition / Dietetics
GET|POST        /api/nutrition/screenings/           # Nutrition screenings
GET|PATCH       /api/nutrition/screenings/{id}/

# Occupational Therapy
GET|POST        /api/occupational-therapy/assessments/
GET|PATCH       /api/occupational-therapy/assessments/{id}/

# Social Work
GET|POST        /api/social-work/assessments/
GET|PATCH       /api/social-work/assessments/{id}/

# Counselling
GET|POST        /api/counselling/sessions/
GET|PATCH       /api/counselling/sessions/{id}/

# Combined Dashboard
GET             /api/allied-health/dashboard/        # Aggregated stats across disciplines
```

---

## Procedures & Theatre

```
# Procedures
GET|POST        /api/procedures/                     # Clinical procedures
GET|PATCH       /api/procedures/{id}/

# Theatre / Operating Room
GET|POST        /api/theatre/cases/                  # Theatre cases
GET|PATCH       /api/theatre/cases/{id}/
GET             /api/theatre/schedule/               # Operating schedule
```

---

## Blood Bank & Dialysis

```
# Blood Bank
GET|POST        /api/blood-bank/donations/
GET|POST        /api/blood-bank/requests/
GET             /api/blood-bank/inventory/

# Dialysis
GET|POST        /api/dialysis/sessions/
GET|PATCH       /api/dialysis/sessions/{id}/
```

---

## Referrals

```
GET|POST        /api/referrals/                      # Inter-facility referrals
GET|PATCH       /api/referrals/{id}/
POST            /api/referrals/{id}/accept/
POST            /api/referrals/{id}/reject/
```

---

## AI / TibaBot

### Stored AI Results

```
GET    /api/ai/results/care-plans/?encounter_id={id}           # Stored care plans
GET    /api/ai/results/cds/?encounter_id={id}                  # Stored CDS evaluations
GET    /api/ai/results/lab-interpretations/?encounter_id={id}  # Stored lab interpretations
GET    /api/ai/results/lab-interpretations/?lab_result_id={id} # By lab result
GET    /api/ai/results/discharge/?admission_id={id}            # Stored discharge assessments
GET    /api/ai/results/icu-risk/?admission_id={id}             # Stored ICU risk predictions
```

### TibaBot Proxy

```
POST   /api/ai/chat/                # Clinical chat (streaming)
POST   /api/ai/icd10-suggest/       # ICD-10 code suggestions from clinical text
POST   /api/ai/care-plan/generate/  # Generate care plan
POST   /api/ai/lab/interpret/       # Lab result interpretation
POST   /api/ai/clerking/autocomplete/  # Clerking note autocomplete
POST   /api/ai/drugs/search/        # Unified drug search (SmPC, PPB, KEML)
```

> See also: `docs/ai-api-guide.md` for detailed TibaBot integration guide.

---

## Clinical Decision Support (CDS)

```
# Managed via included app URLs at /api/cds/
GET             /api/cds/rules/                      # CDS rule definitions
POST            /api/cds/evaluate/                   # Evaluate rules for patient/encounter
GET             /api/cds/alerts/                     # Active CDS alerts
```

---

## Quality

```
# Managed via included app URLs at /api/quality/
GET|POST        /api/quality/measures/               # Quality improvement measures
GET|PATCH       /api/quality/measures/{id}/
GET             /api/quality/reports/                 # Quality reports / dashboards
```

---

## Analytics & MOH Reporting

```
# Analytics & BI
GET             /api/analytics/dashboard/            # Dashboard statistics
GET             /api/analytics/reports/              # Generated reports

# MOH Returns
GET|POST        /api/moh-reports/                    # MOH report submissions
GET             /api/moh-reports/templates/          # Report templates (MOH 204, 405, etc.)
```

---

## Inventory

```
# Managed via included app URLs at /api/inventory/
GET|POST        /api/inventory/items/                # Stock items
GET|PATCH       /api/inventory/items/{id}/
POST            /api/inventory/receive/              # Receive stock
POST            /api/inventory/transfer/             # Inter-facility transfer
GET|POST        /api/inventory/stock-counts/         # Stock count sessions
GET             /api/inventory/alerts/               # Low stock / expiry alerts
```

---

## RBAC & Staff

```
# Staff
GET|POST        /api/staff/                          # List / create staff profiles
GET|PATCH       /api/staff/{id}/                     # Detail / update
GET             /api/staff/me/                       # Current user's profile

# Roles & Permissions
GET             /api/roles/                          # Available roles
GET             /api/permissions/                    # Permission matrix
GET             /api/me/permissions/                 # Current user's permissions

# Departments
GET|POST        /api/departments/                    # List / create departments
GET|PATCH       /api/departments/{id}/

# Organizations
GET|PATCH       /api/organizations/                  # Org management
GET             /api/subscription-plans/             # Subscription tiers

# Org Memberships
GET|POST        /api/org-memberships/                # Staff membership assignments

# Invitations
GET|POST        /api/invitations/                    # List / create invitations
POST            /api/invitations/{id}/resend/        # Resend invitation email
POST            /api/invitations/{id}/revoke/        # Revoke invitation
GET             /api/invitations/{token}/            # Public invitation lookup (no auth)
POST            /api/invitations/accept/             # Accept invitation (public)
```

---

## Kenya Locations

```
GET    /api/locations/counties/                     # All 47 Kenya counties
GET    /api/locations/sub-counties/?county={id}     # Sub-counties for county
GET    /api/locations/wards/?sub_county={id}        # Wards for sub-county
```

---

## Notifications & Comments

```
# Notifications
GET             /api/notifications/                  # User notifications
PATCH           /api/notifications/{id}/mark-read/   # Mark as read
GET             /api/push-subscriptions/             # Push subscription management

# Comments (@mention, reactions)
GET             /api/comments/mentions/              # @mention autocomplete (org-scoped)
GET             /api/comments/count/                 # Comment count for resource

# Audit Logs
GET             /api/auditlogs/                      # List audit logs (admin only)
GET             /api/auditlogs/?user={id}            # Filter by user
GET             /api/auditlogs/?action=patient_view  # Filter by action
```

---

## Offline Sync & PowerSync

```
# PowerSync credentials (dedicated JWT for PowerSync Cloud)
GET    /api/powersync/credentials/                   # Returns JWT with kid header + facility/org claims

# REST Sync (Tauri/Hub offline clients)
GET    /api/sync/pull/                               # Pull changes since timestamp
POST   /api/sync/push/                               # Push local changes to cloud
GET    /api/sync/status/                             # Sync queue status

# Hub Management
GET    /api/hub/health/                              # Hub health check
POST   /api/hub/remote-wipe/                         # Remote wipe (admin)

# WebSocket Health
GET    /api/ws/health/                               # WebSocket server status
```

---

## Interoperability (HL7 / KENHDD)

```
# HL7v2 Messaging
POST   /api/hl7/adt/                                 # HL7v2 ADT message submission
GET    /api/hl7/messages/                            # Message log

# KENHDD (Kenya Health Data Dictionary)
GET    /api/kenhdd/validate/                         # Validate data element against KENHDD schema

# Terminology
GET    /api/terminology/codesystems/                 # Available code systems (ICD-10, LOINC, SNOMED)
```

---

## Platform (MFA, Licensing, Setup)

### MFA

```
GET    /api/mfa/status/                              # MFA enrollment status
POST   /api/mfa/totp/setup/                          # Begin TOTP setup
POST   /api/mfa/totp/verify/                         # Verify TOTP token
GET    /api/mfa/backup-codes/                        # Get backup codes
```

### Licensing (Desktop Hub)

```
GET    /api/licensing/eula/                          # Fetch current Hub EULA text + version
POST   /api/licensing/activate/                      # Activate installation (requires eula_accepted + eula_version)
GET    /api/licensing/status/                        # License status
POST   /api/licensing/check-in/                      # Periodic license check-in
```

### Setup & Onboarding

```
GET    /api/core/setup/check/                        # Check if setup wizard needed (public)
POST   /api/core/setup/initialize/                   # First-run initialization (public)
GET    /api/core/onboarding/status/                  # Onboarding checklist (authenticated)
POST   /api/core/onboarding/status/                  # Mark onboarding complete

# Facilities
GET|POST        /api/facilities/                     # List / create facilities
GET|PATCH       /api/facilities/{id}/                # Facility detail / update
```

### Utilities

```
GET    /api/core/generate/prc-number/                # Generate PRC number
GET    /api/health/                                  # API health check
GET    /api/projections/                             # Read-model projection queries
```

---

## Common Patterns

### Pagination

All list endpoints return paginated responses:

```json
{
  "count": 150,
  "next": "https://api.vitora.health/api/patients/?page=2",
  "previous": null,
  "results": [...]
}
```

### Filtering

Most list endpoints support query parameters for filtering:

```
GET /api/patients/?search=Jane&gender=F&county=1
GET /api/encounters/?patient={id}&encounter_type=OPD&date_from=2026-01-01
GET /api/billing/invoices/?status=PENDING&patient={id}
```

### Tenant Scoping

All requests must include the facility header (set automatically by the web frontend):

```
X-Facility-Id: 1
```

Organization-scoped resources (patients, allergies) are filtered by the user's organization. Facility-scoped resources (encounters, invoices) are filtered by the active facility.

### Error Responses

```json
{
  "detail": "Not found.",
  "code": "not_found"
}
```

```json
{
  "field_name": ["This field is required."],
  "non_field_errors": ["Custom validation error."]
}
```

---

## Related Documentation

| Document | Covers |
|----------|--------|
| `docs/ai-api-guide.md` | TibaBot AI endpoints in detail |
| `docs/drug-formulary-api-guide.md` | Drug search unified interface |
| `docs/clinical-features-api-guide.md` | Clinical features & CDS rules |
| `docs/sha-frontend-integration-guide.md` | SHA claims frontend integration |
| `docs/dha-hie-implementation.md` | DHA HIE implementation phases |
| `docs/facility-auth-guide.md` | Facility switching & auth flows |
| `docs/powersync-integration.md` | PowerSync offline sync details |
