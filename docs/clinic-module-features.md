---

# **A. CLINICS MODULE**

*(Welfare clinics, follow-ups, chronic care)*

## 1️⃣ Purpose

Handle **scheduled, preventive, and continuity-of-care services** that are **not illness-driven OPD**.

---

## 2️⃣ Clinic Types (Configurable)

Model clinics as **service programs**, not departments.

### Core clinic programs

* Child Welfare Clinic (CWC)
* Maternal & Child Health (ANC / PNC)
* Immunization (EPI)
* Nutrition clinic
* Chronic follow-up (HIV, TB, NCDs)
* Post-procedure follow-up
* Community health referrals

Each clinic has:

* Eligibility rules (age, sex, condition)
* Required observations
* Scheduled visit cadence
* Reporting mappings

---

## 3️⃣ Clinic Visit Workflow

**Registration → Visit → Observations → Interventions → Scheduling → Close**

### A. Registration

* Link to existing patient
* Assign **clinic program**
* Auto-enroll if criteria met (e.g. child <5)

### B. Visit data capture (examples)

#### Child welfare

* Weight, height, MUAC
* Z-score (computed)
* Feeding practices
* Vitamin A / deworming

#### Immunization

* Vaccine type, dose, batch
* Next due date (auto-calculated)
* Defaulter flag

#### Chronic follow-up

* Condition
* Medication adherence
* Clinical notes

### C. Decision support

* Z-score alerts
* Missed vaccine alerts
* Follow-up due alerts

### D. Scheduling

* Next visit auto-scheduled
* SMS/print reminder ready

---

## 4️⃣ Data Model (Key Entities)

* `clinic_program`
* `clinic_enrollment`
* `clinic_visit`
* `observations`
* `interventions`
* `followup_schedule`

---

# **B. PROCEDURES MODULE**

*(Circumcision, eye irrigation, wound care, minor surgery)*

## 1️⃣ Purpose

Capture **discrete clinical actions** that:

* Are not diagnoses
* May occur in OPD, wards, or clinics
* Often require **consent, consumables, outcomes, and follow-up**

---

## 2️⃣ Procedure Types

Model procedures using **standard codes** (where possible):

* Minor procedures (eye irrigation, abscess drainage)
* Preventive (male circumcision)
* Diagnostic (biopsy, aspiration)
* Therapeutic (suturing, wound dressing)

---

## 3️⃣ Procedure Workflow

**Order → Consent → Perform → Record Outcome → Follow-up**

### A. Procedure order

* Linked to encounter or clinic visit
* Indication / reason
* Ordering clinician

### B. Consent (mandatory where applicable)

* Consent type
* Guardian consent (for minors)
* Timestamp & staff

### C. Performance record

* Procedure code
* Date/time
* Staff
* Consumables used
* Complications (if any)

### D. Outcome

* Successful / partial / failed
* Immediate observations

### E. Follow-up

* Auto-create clinic follow-up if needed
* Link to welfare / post-procedure clinic

---

## 4️⃣ Data Model

* `procedure_catalog`
* `procedure_order`
* `procedure_event`
* `procedure_outcome`
* `procedure_followup`

---

# **C. REPORTING MODULE**

*(MoH, DHIS2, WHO-aligned)*

## 1️⃣ Principle

> **Raw clinical data → Aggregation → Indicators → DHIS2**

Never store indicators as primary data.

---

## 2️⃣ Reporting Layers

### Layer 1: Operational Reports (facility use)

* Daily clinic attendance
* Procedures performed
* Defaulter lists
* Vaccine stock usage

### Layer 2: Management Analytics

* Growth trends
* Immunization coverage
* Procedure outcomes
* Follow-up compliance

### Layer 3: Compliance Reporting

* MOH 711 / 747
* Nutrition indicators
* DHIS2 datasets

---

## 3️⃣ Reporting Workflow

**Extract → Aggregate → Validate → Approve → Export**

* Extract raw visits, procedures, observations
* Aggregate by:

  * Period
  * Age band
  * Sex
  * Clinic / procedure type
* Validate (logic rules)
* Lock period
* Export (CSV / API)

---

## 4️⃣ DHIS2 Integration (Late-stage)

* Map:

  * Clinics → DHIS2 datasets
  * Procedures → DHIS2 service counts
* Push **aggregates only**
* Audit trail of submissions

---

# **D. HOW THESE MODULES WORK TOGETHER**

```
Patient
 ├── OPD Encounter
 ├── Clinic Enrollment
 │    ├── Clinic Visit
 │    │    ├── Observations (Z-score, vitals)
 │    │    ├── Interventions (vaccines, supplements)
 │    │    └── Follow-up
 ├── Procedure
 │    ├── Consent
 │    ├── Outcome
 │    └── Follow-up Clinic
 └── Reporting Aggregation
      ├── Facility Dashboards
      └── DHIS2 Export
```

---

# **E. PRIORITISATION & PHASING**

| Phase          | Build                                                 |
| -------------- | ----------------------------------------------------- |
| **MVP**        | Clinics (basic), Procedures (basic), internal reports |
| **Mid-stage**  | Z-scores, immunization schedules, procedure outcomes  |
| **Late-stage** | DHIS2 export, MoH validation, audit trails            |

---

# **F. KEY DESIGN RULES (DO NOT VIOLATE)**

1. Clinics ≠ OPD
2. Procedures ≠ diagnoses
3. Reporting ≠ data entry
4. WHO standards inform logic, not storage
5. DHIS2 gets aggregates only

---

## **One-line summary**

> **Clinics manage continuity, procedures capture discrete actions, and reporting turns everything into compliance-ready intelligence.**

---
