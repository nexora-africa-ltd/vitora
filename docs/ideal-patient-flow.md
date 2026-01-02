# Vitora HMIS - Ideal User/Logic/Patient Flow

> **Document Purpose**: This document provides a comprehensive, verbose description of the ideal patient journey through the Vitora Hospital Management Information System, from first contact to discharge and follow-up. It covers all user roles, system logic, and data flows.

**Version**: 1.0  
**Created**: January 3, 2026  
**Author**: Engineering Team, Nexora Africa Ltd

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Entry Points](#2-system-entry-points)
3. [Patient Registration Flow](#3-patient-registration-flow)
4. [Outpatient (OPD) Clinical Flow](#4-outpatient-opd-clinical-flow)
5. [Laboratory Workflow](#5-laboratory-workflow)
6. [Pharmacy Workflow](#6-pharmacy-workflow)
7. [Billing & Payment Flow](#7-billing--payment-flow)
8. [Inpatient (IPD) Admission Flow](#8-inpatient-ipd-admission-flow)
9. [Discharge & Follow-up Flow](#9-discharge--follow-up-flow)
10. [Offline Sync & Data Flow](#10-offline-sync--data-flow)
11. [Security & Audit Flow](#11-security--audit-flow)
12. [Integration Flows (SHA, KHIS)](#12-integration-flows-sha-khis)

---

## 1. Executive Summary

### 1.1 Overview

The Vitora HMIS patient flow is designed around three core principles:

1. **Patient-Centric Care**: Every workflow centers on the patient's journey, ensuring continuity of care across departments
2. **Offline-First Reliability**: All critical functions work without internet connectivity, with intelligent sync when connected
3. **Kenya Compliance**: Full alignment with Kenya Data Protection Act 2019, SHA claims, and KHIS reporting requirements

### 1.2 Key Actors

| Actor | Primary Responsibilities | System Access Level |
|-------|-------------------------|---------------------|
| **Patient** | Receives care, provides consent, makes payments | View own records (future) |
| **Receptionist** | Registration, queue management, basic updates | `patients.add/change`, `core.view_queue` |
| **Nurse** | Vitals, triage, nursing notes, medication administration | `encounters.add/change`, `patients.view` |
| **Doctor/Clinical Officer** | Diagnosis, treatment plans, orders, referrals | Full clinical access |
| **Pharmacist** | Dispense medications, stock management | `pharmacy.*` permissions |
| **Lab Technician** | Process samples, enter results | `laboratory.*` permissions |
| **Cashier** | Process payments, generate receipts | `billing.process_payment` |
| **Claims Officer** | SHA claims submission and tracking | `billing.manage_claims` |
| **Administrator** | System configuration, reporting, audit access | Full system access |

### 1.3 Patient Journey Overview (Happy Path)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        IDEAL PATIENT JOURNEY - OPD                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. ARRIVAL          2. REGISTRATION       3. TRIAGE            4. CONSULTATION │
│  ┌─────────┐         ┌─────────┐          ┌─────────┐          ┌─────────┐      │
│  │ Patient │  ───▶   │Reception│   ───▶   │  Nurse  │   ───▶   │ Doctor  │      │
│  │ Arrives │         │  Desk   │          │ Station │          │  Room   │      │
│  └─────────┘         └─────────┘          └─────────┘          └─────────┘      │
│       │                   │                    │                    │           │
│       │              MRN Created          Vitals Taken        Diagnosis Made    │
│       │              Consent Given        Queue Assigned      Orders Placed     │
│       │                                                                         │
│  ─────┴───────────────────┴────────────────────┴────────────────────┴──────────▶│
│                                                                                 │
│  5. LABORATORY       6. PHARMACY          7. BILLING           8. DEPARTURE    │
│  ┌─────────┐         ┌─────────┐          ┌─────────┐          ┌─────────┐      │
│  │   Lab   │  ───▶   │Dispensing│  ───▶   │ Cashier │   ───▶   │ Patient │      │
│  │ Station │         │ Counter │          │  Desk   │          │ Leaves  │      │
│  └─────────┘         └─────────┘          └─────────┘          └─────────┘      │
│       │                   │                    │                    │           │
│  Samples Collected   Meds Dispensed      Payment Made         Follow-up        │
│  Results Entered     Stock Updated       Receipt Issued       Scheduled        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. System Entry Points

### 2.1 Desktop Application (Primary - Phase 0)

The Electron-based desktop application is the primary entry point for facility staff. It runs locally with an embedded Django backend.

**Startup Sequence:**

```
1. User double-clicks Vitora HMIS icon
   │
   ▼
2. Electron main process starts
   │
   ├── Spawns Django backend on port 9088
   │   └── Waits for health check: GET /api/health/
   │
   ├── Initializes SQLite database (or connects to existing)
   │
   └── Loads preload.js for secure IPC bridge
   │
   ▼
3. Renderer process loads login screen
   │
   ▼
4. User enters credentials
   │
   ├── POST /api/token/ with {username, password}
   │
   ├── On success: Receives {access, refresh} JWT tokens
   │   └── Tokens stored in encrypted electron-store
   │
   └── On failure: Error message displayed, retry allowed
   │
   ▼
5. Main application UI loads
   │
   ├── Auth header injection enabled for all API calls
   │
   ├── Token refresh timer started (25-minute interval)
   │
   └── Connectivity monitor started (checks server every 30s)
```

### 2.2 Web Application (Phase 2+)

The Next.js web application provides browser-based access for users who don't have the desktop app installed.

**Authentication Flow:**

```
1. User navigates to https://facility.vitora.health/
   │
   ▼
2. Next.js middleware checks for valid session
   │
   ├── If no session: Redirect to /login
   │
   └── If valid session: Render requested page
   │
   ▼
3. Login form submission
   │
   ├── Client-side validation (email format, password length)
   │
   ├── POST /api/auth/login (Next.js API route)
   │   └── Backend call: POST /api/token/
   │
   └── Set HTTP-only cookies for tokens
   │
   ▼
4. Role-based dashboard displayed
```

### 2.3 Mobile Application (Phase 1+)

The React Native mobile app is designed for community health workers and field staff.

**Entry Points:**

- Offline patient registration in remote areas
- Vitals capture during home visits
- Immunization recording for outreach programs
- Sync with facility database when connectivity available

---

## 3. Patient Registration Flow

### 3.1 Overview

Patient registration is the foundational workflow that creates the patient record in the system. It captures demographics, location, consent, and emergency contacts.

### 3.2 Pre-Registration Steps

**Step 1: Patient Arrival**

```
Patient arrives at facility
        │
        ▼
Reception staff greets patient
        │
        ├── First-time visitor? ───▶ Proceed to NEW Registration (3.3)
        │
        └── Returning patient? ───▶ Proceed to RETURNING Flow (3.4)
```

**Step 2: Initial Screening**

Before registration, receptionist performs quick verbal screening:

- Is this an emergency? → Route to Emergency Department immediately
- Does patient have referral letter? → Capture referral source
- Does patient have national ID? → Required for registration
- Does patient have insurance (SHA card)? → Capture for billing

### 3.3 New Patient Registration Flow

**Step 3A: Capture Demographics**

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEW PATIENT REGISTRATION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  REQUIRED FIELDS                  │  OPTIONAL FIELDS            │
│  ─────────────────                │  ──────────────────          │
│  ✓ First Name                     │  ○ Middle Name               │
│  ✓ Last Name                      │  ○ Ward (within Sub-County)  │
│  ✓ Date of Birth                  │  ○ Village/Street Address    │
│  ✓ Gender (M/F/O)                 │  ○ Email Address             │
│  ✓ National ID or Passport        │  ○ Occupation                │
│  ✓ Phone Number                   │  ○ Religion                  │
│  ✓ County (47 options)            │  ○ Marital Status            │
│  ✓ Sub-County (cascading)         │                              │
│                                                                 │
│  ENCRYPTED FIELDS (Fernet AES-128)                              │
│  ──────────────────────────────────                             │
│  🔒 National ID                                                 │
│  🔒 Phone Number                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Data Validation Rules:**

| Field | Validation | Error Message |
|-------|------------|---------------|
| Date of Birth | Must not be in future | "Date of birth cannot be a future date" |
| National ID | 8 digits for Kenya ID | "Invalid national ID format" |
| Phone Number | Kenya format (+254...) | "Enter valid Kenya phone number" |
| County | Must exist in Kenya hierarchy | "Select a valid county" |
| Sub-County | Must belong to selected County | "Sub-county does not match county" |

**Step 3B: Kenya Location Hierarchy**

The system enforces Kenya's administrative hierarchy:

```
COUNTY (47 total)
    │
    └── Examples: Nairobi, Mombasa, Kisumu, Nakuru, Kiambu...
        │
        ▼
SUB-COUNTY (289 total)
    │
    └── Cascading dropdown: Only shows sub-counties for selected county
        │
        ▼
WARD (1448 total) - Optional
    │
    └── Cascading dropdown: Only shows wards for selected sub-county
        │
        ▼
VILLAGE/STREET (Free text) - Optional
```

**API Flow for Location Selection:**

```javascript
// User selects County
GET /api/locations/counties/
Response: [{id: 1, code: 1, name: "Mombasa"}, {id: 2, code: 2, name: "Kwale"}, ...]

// User selects Sub-County (filtered by county)
GET /api/locations/sub-counties/?county=1
Response: [{id: 1, name: "Changamwe", county: 1}, {id: 2, name: "Jomvu", county: 1}, ...]

// User selects Ward (filtered by sub-county) - Optional
GET /api/locations/wards/?sub_county=1
Response: [{id: 1, name: "Port Reitz", sub_county: 1}, ...]
```

**Step 3C: Capture Emergency Contact**

```
┌─────────────────────────────────────────────────────────────────┐
│                    EMERGENCY CONTACT SECTION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Primary Emergency Contact (Recommended)                        │
│  ────────────────────────────────────────                       │
│  Name:         [________________________]                       │
│  Phone:        [________________________]                       │
│  Relationship: [Spouse ▼] (Spouse, Parent, Child, Sibling,      │
│                            Friend, Guardian, Other)             │
│                                                                 │
│  [+ Add Another Emergency Contact]                              │
│                                                                 │
│  Note: At least one emergency contact is strongly recommended   │
│        for patient safety.                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Step 3D: Capture Referral Source**

```
How did the patient arrive?
    │
    ├── Self ───────────────▶ No additional fields needed
    │
    ├── Clinic ─────────────▶ No additional fields needed
    │
    └── Other Facility ─────▶ Show "Referred From Facility" text field
                              └── Capture facility name for continuity
```

**Step 3E: Consent Capture**

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA PROCESSING CONSENT                       │
│                    (Kenya Data Protection Act 2019)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  By checking this box, the patient/guardian consents to:        │
│                                                                 │
│  ☐ Processing of personal data for healthcare purposes          │
│  ☐ Sharing of data with Social Health Authority for claims      │
│  ☐ Storage of medical records for the legally required period   │
│                                                                 │
│  The patient has the right to:                                  │
│  • Access their personal data                                   │
│  • Request correction of inaccurate data                        │
│  • Withdraw consent (does not affect prior processing)          │
│                                                                 │
│  Consent Given: ☐ Yes   ○ No (Document reason)                  │
│                                                                 │
│  If consent withheld:                                           │
│  Reason: [________________________________]                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Step 3F: MRN Generation & Record Creation**

```
FORM SUBMISSION
        │
        ▼
POST /api/patients/
{
  "first_name": "Jane",
  "last_name": "Wanjiku",
  "date_of_birth": "1985-05-20",
  "gender": "F",
  "national_id": "12345678",        // Encrypted at rest
  "phone_number": "+254712345678",  // Encrypted at rest
  "county": 1,
  "sub_county": 3,
  "ward": 12,                       // Optional
  "referral_source": "self",
  "emergency_contact_name": "John Wanjiku",
  "emergency_contact_phone": "+254723456789",
  "emergency_contact_relationship": "spouse",
  "consent_given": true
}
        │
        ▼
BACKEND PROCESSING
        │
        ├── Validate all fields
        │
        ├── Check for duplicate (national_id, phone)
        │   └── If duplicate found: Return error with existing MRN
        │
        ├── Generate MRN: MRN-YYYYMMDD-XXXX
        │   └── Format: MRN-20260103-0042 (date + daily sequence)
        │
        ├── Encrypt sensitive fields (national_id, phone_number)
        │
        ├── Set registered_by = current authenticated user
        │
        ├── Set consent_date = current timestamp (if consent_given=true)
        │
        └── Create AuditLog entry
            {
              "action": "patient_create",
              "user": "reception_user",
              "resource_type": "Patient",
              "resource_id": 42,
              "details": {"mrn": "MRN-20260103-0042"}
            }
        │
        ▼
RESPONSE
{
  "id": 42,
  "mrn": "MRN-20260103-0042",
  "first_name": "Jane",
  "last_name": "Wanjiku",
  ...
}
        │
        ▼
UI CONFIRMATION
        │
        ├── Success toast: "Patient registered successfully"
        │
        ├── Display MRN prominently: "MRN: MRN-20260103-0042"
        │
        └── Options: [Print Card] [Add to Queue] [New Registration]
```

### 3.4 Returning Patient Flow

```
PATIENT ARRIVES WITH EXISTING RECORD
        │
        ▼
RECEPTIONIST SEARCHES
        │
        ├── Search by MRN: "MRN-20260103-0042"
        │
        ├── Search by National ID: "12345678"
        │
        ├── Search by Phone: "+254712345678"
        │
        └── Search by Name: "Jane Wanjiku" (partial match supported)
        │
        ▼
GET /api/patients/?search=jane+wanjiku
        │
        ▼
SEARCH RESULTS DISPLAYED
        │
        ├── Patient found: Display record, verify identity
        │   └── Proceed to Update Check (below)
        │
        └── Patient not found: Proceed to New Registration
        │
        ▼
UPDATE CHECK
        │
        ├── Address changed? → Update location fields
        │
        ├── Phone changed? → Update phone (re-encrypt)
        │
        ├── Emergency contact changed? → Update contact
        │
        └── Insurance status changed? → Update payer info
        │
        ▼
ADD TO QUEUE
        │
        └── Proceed to Triage (Section 4)
```

---

## 4. Outpatient (OPD) Clinical Flow

### 4.1 Queue Management & Triage

**Step 1: Queue Assignment**

After registration, patient is added to the appropriate queue:

```
QUEUE ASSIGNMENT LOGIC
        │
        ▼
Assess Patient Urgency
        │
        ├── EMERGENCY (Red) ────────▶ Immediate doctor attention
        │   └── Symptoms: Chest pain, difficulty breathing, severe bleeding
        │
        ├── URGENT (Orange) ────────▶ Priority queue (seen within 30 min)
        │   └── Symptoms: High fever, severe pain, pregnancy complications
        │
        ├── PRIORITY (Yellow) ──────▶ Expedited queue
        │   └── Categories: Pregnant women, elderly (65+), disabled
        │
        └── STANDARD (Green) ───────▶ Regular queue (FIFO)
            └── Routine consultations, follow-ups
        │
        ▼
QUEUE ENTRY CREATED
{
  "patient": 42,
  "department": "OPD",
  "priority": "STANDARD",
  "status": "WAITING",
  "check_in_time": "2026-01-03T09:15:00Z",
  "estimated_wait": 45  // minutes
}
```

**Step 2: Triage (Nurse Station)**

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRIAGE WORKFLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Patient: Jane Wanjiku (MRN-20260103-0042)                      │
│  Queue Position: #7 in OPD                                      │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  VITAL SIGNS CAPTURE                                            │
│  ───────────────────                                            │
│                                                                 │
│  Temperature:     [38.2] °C    (Normal: 36.1-37.2)  ⚠️ Elevated │
│  Pulse:           [88 ] BPM   (Normal: 60-100)     ✓ Normal    │
│  Blood Pressure:  [120/80]    (Normal: <120/<80)   ✓ Normal    │
│  Respiratory Rate:[18 ] /min  (Normal: 12-20)      ✓ Normal    │
│  SpO2:            [97 ] %     (Normal: 95-100)     ✓ Normal    │
│  Weight:          [65.5] kg                                     │
│  Height:          [165] cm                                      │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  CHIEF COMPLAINT (Why is patient here today?)                   │
│  ─────────────────────────────────────────────                  │
│  [Fever and body aches for 3 days                    ]          │
│  [                                                   ]          │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  ALLERGIES (Known allergies?)                                   │
│  ───────────────────────────                                    │
│  [Penicillin - causes rash                           ]          │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  [Submit Triage] [Cancel]                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**SpO2 Critical Alert Logic:**

```
IF SpO2 < 95%:
    │
    ▼
CRITICAL ALERT TRIGGERED
    │
    ├── Red banner displayed: "⚠️ CRITICAL: Hypoxemia Alert - SpO2 {value}%"
    │
    ├── Audio alert (configurable)
    │
    ├── Patient priority auto-elevated to URGENT
    │
    └── AuditLog entry: "spo2_critical_alert"
    │
    ▼
IMMEDIATE ESCALATION
    │
    └── Nurse must acknowledge alert and escalate to doctor
```

**Triage Submission:**

```
POST /api/encounters/
{
  "patient": 42,
  "encounter_type": "OPD",
  "encounter_date": "2026-01-03",
  "chief_complaint": "Fever and body aches for 3 days",
  "temperature": 38.2,
  "pulse": 88,
  "blood_pressure": "120/80",
  "respiratory_rate": 18,
  "spo2": 97,
  "weight": 65.5,
  "height": 165,
  "allergies": "Penicillin - causes rash",
  "chronic_conditions": "",
  "current_medications": "",
  "past_surgeries": "",
  "family_history": "",
  "social_history": ""
}
```

### 4.2 Doctor Consultation

**Step 3: Clinical Assessment**

```
DOCTOR RECEIVES PATIENT
        │
        ▼
REVIEW PRE-CONSULTATION DATA
        │
        ├── Patient demographics (age, gender)
        │
        ├── Vital signs from triage (with any alerts)
        │
        ├── Chief complaint
        │
        ├── Known allergies (prominently displayed)
        │
        ├── Medical history (if returning patient)
        │
        └── Previous encounters and diagnoses
        │
        ▼
CLINICAL EXAMINATION
        │
        ├── Physical examination findings
        │
        ├── Systems review
        │
        └── Additional history taking
        │
        ▼
CLINICAL NOTES ENTRY

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLINICAL NOTES SECTION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Patient: Jane Wanjiku (MRN-20260103-0042) | Age: 40 | F        │
│  Vitals: T 38.2°C | P 88 | BP 120/80 | RR 18 | SpO2 97%        │
│  ⚠️ ALLERGY: Penicillin (rash)                                  │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  HISTORY OF PRESENTING ILLNESS                                  │
│  ─────────────────────────────                                  │
│  [Patient reports 3-day history of fever, reaching 38.5°C at   ]│
│  [home. Associated with generalized body aches, mild headache, ]│
│  [and fatigue. No cough, no rash, no vomiting.                 ]│
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  EXAMINATION FINDINGS                                           │
│  ────────────────────                                           │
│  [General: Alert, febrile, mild pallor                         ]│
│  [HEENT: No jaundice, no lymphadenopathy                       ]│
│  [Chest: Clear breath sounds bilaterally                       ]│
│  [Abdomen: Soft, non-tender, no organomegaly                   ]│
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  MEDICAL HISTORY (Pre-populated from previous encounters)       │
│  ─────────────────────────────────────────────────────────      │
│  Chronic Conditions: [Hypertension - controlled                ]│
│  Current Medications: [Amlodipine 5mg OD                       ]│
│  Past Surgeries:      [Appendectomy 2015                       ]│
│  Family History:      [Father - diabetes, Mother - hypertension]│
│  Social History:      [Non-smoker, occasional alcohol          ]│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Step 4: Diagnosis Entry**

```
DIAGNOSIS WORKFLOW
        │
        ▼
ICD-10 CODE SEARCH
        │
        ├── Doctor types: "malaria"
        │
        ├── GET /api/encounters/icd10/?search=malaria
        │
        └── Results displayed:
            ├── B50.9 - Plasmodium falciparum malaria, unspecified
            ├── B51.9 - Plasmodium vivax malaria, unspecified
            ├── B52.9 - Plasmodium malariae malaria, unspecified
            └── B54 - Unspecified malaria
        │
        ▼
DIAGNOSIS SELECTION
        │
        ├── Primary Diagnosis: B50.9 - Plasmodium falciparum malaria
        │
        └── Secondary Diagnosis: (optional) R50.9 - Fever, unspecified
        │
        ▼
DIAGNOSIS RECORDED IN ENCOUNTER
{
  "diagnoses": [
    {"icd10_code": "B50.9", "description": "Plasmodium falciparum malaria", "is_primary": true},
    {"icd10_code": "R50.9", "description": "Fever, unspecified", "is_primary": false}
  ]
}
```

**Step 5: Treatment Plan & Orders**

```
TREATMENT PLAN WORKFLOW
        │
        ▼
SELECT CLINICAL TEMPLATE (Optional)
        │
        ├── GET /api/clinical-templates/?diagnosis=malaria
        │
        └── Available templates:
            ├── Uncomplicated Malaria (Adult)
            ├── Uncomplicated Malaria (Pediatric)
            ├── Severe Malaria (Referral)
            └── Malaria in Pregnancy
        │
        ▼
TEMPLATE SELECTED: "Uncomplicated Malaria (Adult)"
        │
        ├── Pre-populates:
        │   ├── Recommended medications (KEML-compliant)
        │   ├── Standard investigations
        │   └── Follow-up schedule
        │
        └── Doctor can modify based on patient specifics
        │
        ▼
FINALIZE ORDERS
```

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORDERS & PRESCRIPTIONS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LABORATORY ORDERS                                              │
│  ─────────────────                                              │
│  ☑ Malaria RDT (Rapid Diagnostic Test)        [Urgent  ▼]      │
│  ☑ Full Blood Count (FBC)                     [Routine ▼]      │
│  ☐ Renal Function Tests                                         │
│  ☐ Liver Function Tests                                         │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  PRESCRIPTIONS                                                  │
│  ─────────────                                                  │
│  ⚠️ ALLERGY ALERT: Penicillin - Avoid penicillin-class drugs   │
│                                                                 │
│  1. Artemether-Lumefantrine (AL) 20/120mg                       │
│     Dosage: 4 tablets BD x 3 days                               │
│     Route: Oral                                                 │
│     Quantity: 24 tablets                                        │
│                                                                 │
│  2. Paracetamol 500mg                                           │
│     Dosage: 2 tablets TDS PRN for fever                         │
│     Route: Oral                                                 │
│     Quantity: 20 tablets                                        │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  FOLLOW-UP                                                      │
│  ─────────                                                      │
│  Return if: Symptoms worsen or persist beyond 3 days            │
│  Next appointment: [7 days] [Schedule Now]                      │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  [Save as Draft] [Submit Orders] [Print Summary]                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Order Submission Logic:**

```
SUBMIT ORDERS
        │
        ▼
BACKEND PROCESSING
        │
        ├── Validate all orders
        │
        ├── Check drug-allergy interactions
        │   └── If conflict: Block submission, show warning
        │
        ├── Create LabOrder records (status: PENDING)
        │
        ├── Create Prescription records (status: PENDING)
        │
        ├── Auto-generate BillingLineItems:
        │   ├── Consultation fee: KES 500
        │   ├── Malaria RDT: KES 300
        │   ├── FBC: KES 400
        │   ├── AL 24 tablets: KES 200
        │   └── Paracetamol 20 tablets: KES 100
        │
        ├── Update patient queue: status = "LAB_PENDING"
        │
        └── Create AuditLog entries for all actions
        │
        ▼
NOTIFICATIONS DISPATCHED
        │
        ├── Lab receives notification: "New lab order for MRN-20260103-0042"
        │
        └── Pharmacy receives notification: "Prescription pending for MRN-20260103-0042"
```

---

## 5. Laboratory Workflow

### 5.1 Lab Order Reception

```
LAB TECHNICIAN WORKFLOW
        │
        ▼
VIEW PENDING ORDERS
        │
        ├── GET /api/laboratory/orders/?status=PENDING
        │
        └── Queue displayed with priority sorting:
            ├── STAT orders (immediate) - highlighted red
            ├── Urgent orders (within 2 hours) - highlighted orange
            └── Routine orders (within 24 hours) - standard
        │
        ▼
SELECT ORDER TO PROCESS
        │
        └── Order details displayed:
            ├── Patient: Jane Wanjiku (MRN-20260103-0042)
            ├── Tests: Malaria RDT (Urgent), FBC (Routine)
            ├── Ordering clinician: Dr. Ochieng
            ├── Clinical indication: Suspected malaria
            └── Special instructions: (none)
```

### 5.2 Sample Collection & Processing

```
SAMPLE COLLECTION
        │
        ▼
ACKNOWLEDGE ORDER
        │
        ├── PATCH /api/laboratory/orders/{id}/
        │   {"status": "RECEIVED"}
        │
        └── Collection timestamp recorded
        │
        ▼
COLLECT SAMPLE
        │
        ├── Print barcode label for sample tube
        │
        ├── Record specimen type: "Whole blood (EDTA)"
        │
        ├── Record collector: "Lab Tech Mary"
        │
        └── Record collection time: "2026-01-03T10:30:00Z"
        │
        ▼
PROCESS SAMPLE
        │
        ├── Update status: "IN_PROGRESS"
        │
        ├── Perform Malaria RDT
        │   └── Result: Positive for P. falciparum
        │
        └── Run FBC on analyzer
            └── Results: Hb 11.2, WBC 8.5, Platelets 150
        │
        ▼
ENTER RESULTS
```

### 5.3 Results Entry & Verification

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAB RESULTS ENTRY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Patient: Jane Wanjiku (MRN-20260103-0042)                      │
│  Order ID: LAB-20260103-0015                                    │
│  Ordered by: Dr. Ochieng | Date: 03-Jan-2026 09:45             │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  TEST: MALARIA RAPID DIAGNOSTIC TEST (RDT)                      │
│  ──────────────────────────────────────────                     │
│  Result: [Positive ▼]                                           │
│  Species: [P. falciparum ▼]                                     │
│  Comments: [Strong positive band observed                ]      │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  TEST: FULL BLOOD COUNT (FBC)                                   │
│  ────────────────────────────                                   │
│  Parameter      │ Result  │ Unit    │ Reference Range │ Flag   │
│  ───────────────┼─────────┼─────────┼─────────────────┼────────│
│  Hemoglobin     │ [11.2 ] │ g/dL    │ 12.0-16.0       │ ⬇️ LOW │
│  WBC            │ [8.5  ] │ x10³/µL │ 4.0-11.0        │ ✓      │
│  Platelets      │ [150  ] │ x10³/µL │ 150-400         │ ✓      │
│  RBC            │ [4.2  ] │ x10⁶/µL │ 4.0-5.5         │ ✓      │
│  Hematocrit     │ [35   ] │ %       │ 36-46           │ ⬇️ LOW │
│  MCV            │ [83   ] │ fL      │ 80-100          │ ✓      │
│  MCH            │ [27   ] │ pg      │ 27-33           │ ✓      │
│  MCHC           │ [32   ] │ g/dL    │ 32-36           │ ✓      │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  Entered by: Mary Njeri (Lab Tech)                              │
│  Entry time: 03-Jan-2026 11:15                                  │
│                                                                 │
│  [Save Draft] [Submit for Verification]                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Two-Step Verification Process:**

```
STEP 1: LAB TECH ENTERS RESULTS
        │
        ├── Status: "PENDING_VERIFICATION"
        │
        └── Flagged for supervisor review
        │
        ▼
STEP 2: LAB SUPERVISOR VERIFIES
        │
        ├── Reviews entered values
        │
        ├── Checks for data entry errors
        │
        ├── Validates against quality control
        │
        └── Approves or rejects
        │
        ▼
IF APPROVED:
        │
        ├── Status: "COMPLETED"
        │
        ├── Results released to ordering clinician
        │
        ├── Auto-notification sent to Dr. Ochieng
        │
        └── Results viewable in patient encounter
        │
        ▼
IF REJECTED:
        │
        ├── Status: "REJECTED"
        │
        ├── Rejection reason documented
        │
        └── Lab tech notified to re-enter or re-test
```

---

## 6. Pharmacy Workflow

### 6.1 Prescription Queue

```
PHARMACIST WORKFLOW
        │
        ▼
VIEW PRESCRIPTION QUEUE
        │
        ├── GET /api/pharmacy/prescriptions/?status=PENDING
        │
        └── Queue shows:
            ├── Patient name and MRN
            ├── Prescribing clinician
            ├── Number of items
            ├── Priority indicator
            └── Time in queue
        │
        ▼
SELECT PRESCRIPTION TO DISPENSE
        │
        └── Full prescription details displayed
```

### 6.2 Dispensing Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    DISPENSING SCREEN                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Patient: Jane Wanjiku (MRN-20260103-0042)                      │
│  Prescription ID: RX-20260103-0087                              │
│  Prescriber: Dr. Ochieng | Date: 03-Jan-2026                   │
│                                                                 │
│  ⚠️ ALLERGY ALERT: PENICILLIN (causes rash)                    │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  PRESCRIBED MEDICATIONS                                         │
│  ──────────────────────                                         │
│                                                                 │
│  1. Artemether-Lumefantrine 20/120mg                            │
│     ├── Prescribed: 24 tablets                                  │
│     ├── Instructions: 4 tablets BD x 3 days                     │
│     ├── Available batches:                                      │
│     │   ├── Batch: AL-2025-001 | Qty: 500 | Exp: Dec 2026 ✓    │
│     │   └── Batch: AL-2024-003 | Qty: 50  | Exp: Mar 2026 ⚠️   │
│     └── Dispense from: [AL-2025-001 ▼] Qty: [24]               │
│                                                                 │
│  2. Paracetamol 500mg                                           │
│     ├── Prescribed: 20 tablets                                  │
│     ├── Instructions: 2 tablets TDS PRN for fever               │
│     ├── Available batches:                                      │
│     │   └── Batch: PCM-2025-010 | Qty: 1000 | Exp: Jun 2027 ✓  │
│     └── Dispense from: [PCM-2025-010 ▼] Qty: [20]              │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  DRUG INTERACTION CHECK: ✓ No interactions detected             │
│  ALLERGY CHECK: ✓ No prescribed drugs contain penicillin        │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  Dispensing Notes:                                              │
│  [Take AL with fatty food for better absorption. Complete the  ]│
│  [full course even if feeling better.                          ]│
│                                                                 │
│  [Cancel] [Partial Dispense] [Dispense All]                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Dispensing Submission:**

```
DISPENSE ALL CLICKED
        │
        ▼
BACKEND PROCESSING
        │
        ├── Validate stock availability
        │   └── If insufficient: Block, show alternative batches
        │
        ├── Deduct stock from selected batches:
        │   ├── AL-2025-001: 500 → 476 (-24)
        │   └── PCM-2025-010: 1000 → 980 (-20)
        │
        ├── Create Dispensing records:
        │   ├── {drug: "AL", batch: "AL-2025-001", qty: 24, dispensed_by: "Pharm_John"}
        │   └── {drug: "PCM", batch: "PCM-2025-010", qty: 20, dispensed_by: "Pharm_John"}
        │
        ├── Update Prescription status: "DISPENSED"
        │
        ├── Link to billing (already created from orders)
        │
        └── Create AuditLog: "medication_dispense"
        │
        ▼
PATIENT COUNSELING
        │
        ├── Pharmacist explains medication usage
        │
        ├── Print medication information leaflet (optional)
        │
        └── Patient signs acknowledgment (optional)
        │
        ▼
PATIENT DIRECTED TO CASHIER
```

### 6.3 Stock Management

```
STOCK ALERTS DASHBOARD
        │
        ├── LOW STOCK (Below reorder level)
        │   ├── Amoxicillin 500mg: 50 remaining (reorder at 100)
        │   └── Metformin 500mg: 80 remaining (reorder at 150)
        │
        ├── EXPIRING SOON (Within 90 days)
        │   ├── Batch INS-2024-005 Insulin: Expires Mar 2026
        │   └── Batch AMX-2024-002 Amoxicillin: Expires Feb 2026
        │
        └── EXPIRED (Requires quarantine)
            └── Batch VIT-2023-001 Vitamin C: Expired Dec 2025
```

---

## 7. Billing & Payment Flow

### 7.1 Invoice Generation

```
PATIENT ARRIVES AT CASHIER
        │
        ▼
RETRIEVE PATIENT BILL
        │
        ├── GET /api/billing/invoices/?patient=42&status=PENDING
        │
        └── Invoice displayed:

┌─────────────────────────────────────────────────────────────────┐
│                        PATIENT INVOICE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Patient: Jane Wanjiku (MRN-20260103-0042)                      │
│  Invoice #: INV-20260103-0156                                   │
│  Date: 03-Jan-2026                                              │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  SERVICES RENDERED                                              │
│  ─────────────────                                              │
│  Item                          │ Qty │ Unit Price │ Total       │
│  ──────────────────────────────┼─────┼────────────┼─────────────│
│  OPD Consultation              │ 1   │ KES 500    │ KES 500     │
│  Malaria RDT                   │ 1   │ KES 300    │ KES 300     │
│  Full Blood Count              │ 1   │ KES 400    │ KES 400     │
│  Artemether-Lumefantrine 24tab │ 1   │ KES 200    │ KES 200     │
│  Paracetamol 500mg 20tab       │ 1   │ KES 100    │ KES 100     │
│  ──────────────────────────────┼─────┼────────────┼─────────────│
│  SUBTOTAL                      │     │            │ KES 1,500   │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  INSURANCE/PAYER                                                │
│  ───────────────                                                │
│  Payer: SHA (Social Health Authority)                           │
│  Member ID: SHA-12345678                                        │
│  Eligibility: ✓ ACTIVE                                          │
│                                                                 │
│  SHA Coverage (100%):                    - KES 1,500            │
│  ──────────────────────────────────────────────────────────     │
│  PATIENT CO-PAY:                           KES 0                │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  [Print Invoice] [Apply Discount] [Process Payment]             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Payment Processing

```
PAYMENT WORKFLOW
        │
        ▼
SELECT PAYMENT METHOD
        │
        ├── CASH
        │   ├── Enter amount tendered
        │   ├── Calculate change
        │   └── Record cash payment
        │
        ├── M-PESA
        │   ├── Initiate STK Push to patient phone
        │   ├── Wait for confirmation
        │   └── Auto-record on success
        │
        ├── CARD
        │   ├── Swipe/tap on POS terminal
        │   ├── Wait for authorization
        │   └── Record card payment
        │
        └── INSURANCE (SHA)
            ├── Verify eligibility (already done)
            ├── Create claim package
            └── Submit to SHA claims queue
        │
        ▼
PAYMENT RECORDED
        │
        ├── Update Invoice status: "PAID"
        │
        ├── Generate Receipt
        │
        └── Create AuditLog: "payment_received"
        │
        ▼
PRINT RECEIPT
        │
        └── Patient receives receipt and exits facility
```

---

## 8. Inpatient (IPD) Admission Flow

### 8.1 Admission Recommendation

```
OPD CONSULTATION REVEALS NEED FOR ADMISSION
        │
        ▼
DOCTOR INITIATES ADMISSION RECOMMENDATION
        │
        ├── Clicks "Recommend for Admission" button
        │
        ├── Enters:
        │   ├── Admission reason: "Severe malaria requiring IV treatment"
        │   ├── Provisional diagnosis: B50.0 - Severe falciparum malaria
        │   └── Recommended ward: Medical Ward
        │
        └── Encounter status changes to: ADMISSION_PENDING
        │
        ▼
NOTIFICATION SENT TO RECEPTION
        │
        └── "Patient MRN-20260103-0042 recommended for admission by Dr. Ochieng"
```

### 8.2 Admission Processing

```
RECEPTIONIST RECEIVES NOTIFICATION
        │
        ▼
CHECK BED AVAILABILITY
        │
        ├── GET /api/wards/
        │
        └── Ward dashboard shows:
            ├── Medical Ward: 18/20 beds occupied (2 available)
            ├── Surgical Ward: 12/15 beds occupied (3 available)
            ├── Pediatric Ward: 8/10 beds occupied (2 available)
            └── ICU: 4/6 beds occupied (2 available)
        │
        ▼
PATIENT AGREES TO ADMISSION
        │
        ▼
COMPLETE ADMISSION FORM
        │
        ├── Assign ward: Medical Ward
        │
        ├── Assign bed: Bed M-15
        │
        ├── Confirm/update insurance details
        │
        └── Record admitting officer
        │
        ▼
POST /api/admissions/
{
  "patient": 42,
  "source_encounter": 156,  // OPD encounter
  "ward": 1,  // Medical Ward
  "bed": 15,
  "admission_reason": "Severe malaria requiring IV treatment",
  "provisional_diagnosis": "B50.0",
  "admitting_officer": "Dr. Ochieng"
}
        │
        ▼
ADMISSION RECORD CREATED
        │
        ├── Bed status updated: AVAILABLE → OCCUPIED
        │
        ├── Inpatient encounter created (type: IPD)
        │
        ├── All OPD data preserved and linked
        │
        └── AuditLog: "patient_admitted"
```

### 8.3 Inpatient Care Flow

```
DAILY WARD ROUNDS
        │
        ▼
FOR EACH INPATIENT:
        │
        ├── NURSE: Morning vitals capture
        │   └── Temperature, BP, Pulse, SpO2, etc.
        │
        ├── DOCTOR: Ward round assessment
        │   ├── Review overnight notes
        │   ├── Physical examination
        │   ├── Update treatment plan
        │   └── New orders if needed
        │
        ├── KARDEX UPDATE: Nursing care plan
        │   ├── Current orders summary
        │   ├── Care tasks for the day
        │   └── Monitoring requirements
        │
        └── HANDOVER: Shift change notes
            ├── Outgoing nurse documents status
            └── Incoming nurse acknowledges
```

---

## 9. Discharge & Follow-up Flow

### 9.1 Discharge Planning

```
PATIENT READY FOR DISCHARGE
        │
        ▼
DOCTOR INITIATES DISCHARGE
        │
        ├── Creates discharge summary:
        │   ├── Admission diagnosis
        │   ├── Final diagnosis
        │   ├── Treatment provided
        │   ├── Procedures performed
        │   ├── Discharge medications
        │   ├── Follow-up instructions
        │   └── Referrals (if any)
        │
        └── Discharge checklist verified:
            ├── ☑ Outstanding pharmacy items cleared
            ├── ☑ Pending lab results reviewed (or waived)
            ├── ☑ Billing finalized
            └── ☑ Follow-up appointment scheduled
        │
        ▼
DISCHARGE SUMMARY GENERATED
        │
        └── Printable document for patient
```

### 9.2 Financial Clearance

```
BILLING RECONCILIATION
        │
        ├── All inpatient charges aggregated:
        │   ├── Bed charges (per day)
        │   ├── Doctor consultations
        │   ├── Nursing care
        │   ├── Medications administered
        │   ├── Lab tests
        │   └── Procedures
        │
        ├── Insurance coverage applied
        │
        └── Balance due calculated
        │
        ▼
PAYMENT PROCESSED (Same as Section 7.2)
        │
        ▼
FINANCIAL CLEARANCE GRANTED
```

### 9.3 Discharge Execution

```
ALL CLEARANCES OBTAINED
        │
        ▼
DISCHARGE EXECUTED
        │
        ├── Bed status: OCCUPIED → AVAILABLE
        │
        ├── Admission status: ACTIVE → DISCHARGED
        │
        ├── Length of Stay (LOS) calculated and stored
        │
        └── AuditLog: "patient_discharged"
        │
        ▼
PATIENT RECEIVES:
        │
        ├── Discharge summary (printed)
        │
        ├── Discharge medications (from pharmacy)
        │
        ├── Follow-up appointment card
        │
        └── Emergency contact information
```

---

## 10. Offline Sync & Data Flow

### 10.1 Offline Operation

```
INTERNET CONNECTIVITY LOST
        │
        ▼
SYSTEM CONTINUES OPERATING
        │
        ├── All data stored in local SQLite database
        │
        ├── UI shows "Offline" indicator with pending count
        │
        └── All CRUD operations queued in SyncQueue
        │
        ▼
SYNCQUEUE ENTRIES CREATED
{
  "operation": "CREATE",
  "model_name": "Patient",
  "record_id": "temp-uuid-12345",
  "data": {...patient data...},
  "status": "PENDING",
  "created_at": "2026-01-03T14:30:00Z",
  "retry_count": 0
}
```

### 10.2 Sync Process

```
INTERNET CONNECTIVITY RESTORED
        │
        ▼
CONNECTIVITY MONITOR DETECTS
        │
        ├── Health check: GET /api/health/ → 200 OK
        │
        └── Triggers sync process
        │
        ▼
SYNC MANAGER PROCESSES QUEUE
        │
        FOR EACH PENDING ENTRY:
        │
        ├── Attempt to sync with server
        │
        ├── IF SUCCESS:
        │   ├── Update status: SYNCED
        │   ├── Update local record with server ID
        │   └── Remove from queue
        │
        ├── IF CONFLICT:
        │   ├── Create SyncConflict record
        │   ├── Status: CONFLICT
        │   └── Flag for manual resolution
        │
        └── IF FAILURE:
            ├── Increment retry_count
            ├── Status: FAILED (after max retries)
            └── Alert user for manual intervention
```

### 10.3 Conflict Resolution

```
CONFLICT DETECTED
        │
        ├── Same record modified offline AND on server
        │
        └── Conflict record created:
            {
              "local_data": {...offline changes...},
              "remote_data": {...server changes...},
              "resolution_strategy": "MANUAL"
            }
        │
        ▼
USER RESOLVES CONFLICT
        │
        ├── View both versions side-by-side
        │
        ├── Choose resolution:
        │   ├── LOCAL_WINS: Keep offline changes
        │   ├── REMOTE_WINS: Keep server changes
        │   └── MANUAL: Merge specific fields
        │
        └── Mark conflict as resolved
```

---

## 11. Security & Audit Flow

### 11.1 Authentication Flow

```
USER LOGIN
        │
        ├── POST /api/token/
        │   {"username": "nurse_mary", "password": "********"}
        │
        ├── Backend validates credentials
        │
        ├── IF VALID:
        │   ├── Generate JWT tokens (access + refresh)
        │   ├── Create AuditLog: "login_success"
        │   └── Return tokens
        │
        └── IF INVALID:
            ├── Create AuditLog: "login_failed"
            └── Return 401 Unauthorized
        │
        ▼
TOKEN MANAGEMENT
        │
        ├── Access token: 30-minute expiry
        │
        ├── Refresh token: 24-hour expiry
        │
        └── Auto-refresh: 5 minutes before expiry
```

### 11.2 Authorization (RBAC)

```
PERMISSION CHECK FOR EVERY REQUEST
        │
        ▼
CHECK USER PERMISSIONS
        │
        ├── Role-based: Doctor, Nurse, Receptionist, etc.
        │
        ├── Object-level: Can this user access this patient?
        │
        └── Sensitive access: Does user have view_sensitive_patient?
        │
        ▼
IF AUTHORIZED: Proceed
IF UNAUTHORIZED: 403 Forbidden + AuditLog entry
```

### 11.3 Audit Logging

```
EVERY SIGNIFICANT ACTION LOGGED
        │
        ├── User actions: login, logout, view, create, update, delete
        │
        ├── System events: sync, errors, alerts
        │
        └── Security events: unauthorized access attempts
        │
        ▼
AUDITLOG ENTRY
{
  "user": "nurse_mary",
  "action": "patient_view",
  "resource_type": "Patient",
  "resource_id": 42,
  "timestamp": "2026-01-03T15:30:00Z",
  "ip_address": "192.168.1.100",
  "details": {"purpose": "clinical_care"}
}
        │
        ▼
RETENTION: 7 years (Kenya DPA 2019 compliance)
```

---

## 12. Integration Flows (SHA, KHIS)

### 12.1 SHA Claims Flow

```
PATIENT WITH SHA INSURANCE
        │
        ▼
ELIGIBILITY VERIFICATION
        │
        ├── Real-time API check (when online)
        │
        └── Cached eligibility (when offline)
        │
        ▼
SERVICES PROVIDED (Normal clinical flow)
        │
        ▼
CLAIM PACKAGE CREATED
        │
        ├── Patient demographics
        ├── Diagnosis codes (ICD-10)
        ├── Services rendered with tariff codes
        ├── Supporting documents:
        │   ├── Clinical notes
        │   ├── Lab results
        │   └── Prescriptions
        │
        └── FHIR-compliant format
        │
        ▼
CLAIM SUBMITTED TO SHA
        │
        ├── Status tracking: Submitted → Under Review → Approved/Rejected
        │
        └── Reimbursement received
```

### 12.2 KHIS/DHIS2 Reporting

```
END OF REPORTING PERIOD (Monthly)
        │
        ▼
AGGREGATE DATA COMPILED
        │
        ├── OPD attendance by age/gender
        ├── Disease morbidity (top 10 diagnoses)
        ├── Immunization coverage
        ├── Maternal health indicators
        └── Pharmaceutical consumption
        │
        ▼
REPORT PREVIEW & VALIDATION
        │
        ├── Administrator reviews report
        │
        └── Corrections made if needed
        │
        ▼
SUBMISSION TO DHIS2
        │
        ├── Via API (automated)
        │
        └── Or manual export (CSV/Excel)
        │
        ▼
ACKNOWLEDGMENT RECEIVED
        │
        └── Submission logged and tracked
```

---

## Appendix A: Data Model Summary

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| Patient | Patient demographics | mrn, name, dob, gender, location, consent |
| Encounter | Clinical visit | patient, type, vitals, diagnoses, treatment |
| EmergencyContact | Next of kin | patient, name, phone, relationship |
| County/SubCounty/Ward | Kenya geography | code, name, parent FK |

### Clinical Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| ICD10Code | Diagnosis codes | code, description, category |
| TreatmentPlan | Care plan | encounter, template, medications |
| ClinicalTemplate | Standard protocols | name, diagnosis, sections |

### Pharmacy Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| Drug | Medication catalog | name, keml_code, dosage_forms |
| StockBatch | Inventory | drug, batch_no, quantity, expiry |
| Prescription | Medication orders | encounter, items, status |
| Dispensing | Dispensed meds | prescription, batch, quantity |

### Billing Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| Invoice | Patient bill | patient, items, total, status |
| Payment | Payment record | invoice, method, amount, reference |
| Claim | Insurance claim | invoice, payer, status |

### Core Infrastructure

| Model | Purpose | Key Fields |
|-------|---------|------------|
| AuditLog | Compliance logging | user, action, resource, timestamp |
| SyncQueue | Offline queue | operation, data, status |
| SyncConflict | Conflict tracking | local_data, remote_data, resolution |

---

## Appendix B: API Endpoints Summary

### Authentication
- `POST /api/token/` - Login
- `POST /api/token/refresh/` - Refresh token
- `POST /api/token/verify/` - Verify token

### Patients
- `GET/POST /api/patients/` - List/Create
- `GET/PATCH/DELETE /api/patients/{id}/` - Detail/Update/Delete
- `GET/POST /api/patients/{id}/emergency-contacts/` - Emergency contacts

### Encounters
- `GET/POST /api/encounters/` - List/Create
- `GET/PATCH /api/encounters/{id}/` - Detail/Update
- `GET /api/encounters/icd10/` - ICD-10 search

### Locations
- `GET /api/locations/counties/` - All counties
- `GET /api/locations/sub-counties/?county={id}` - Filtered sub-counties
- `GET /api/locations/wards/?sub_county={id}` - Filtered wards

### Laboratory
- `GET/POST /api/laboratory/orders/` - Lab orders
- `PATCH /api/laboratory/orders/{id}/` - Update status/results

### Pharmacy
- `GET /api/pharmacy/drugs/` - Drug catalog
- `GET /api/pharmacy/stock/` - Stock levels
- `POST /api/pharmacy/dispensing/` - Dispense medications

### Billing
- `GET /api/billing/invoices/` - Invoices
- `POST /api/billing/payments/` - Process payment

---

*End of Document*

**Document History:**
- v1.0 (2026-01-03): Initial comprehensive flow documentation
```

