# Maternal & Child Health (MCH) Module

> **Status**: ✅ Implemented (Phase 2) | **Backend App**: `hmis.apps.mch` | **Frontend Route**: `/mch`

The MCH module provides comprehensive maternal and child health management aligned with Kenya's Ministry of Health guidelines. It covers the full continuum of care from antenatal registration through postnatal follow-up, including pediatric growth monitoring, the Kenya Expanded Programme on Immunisation (KEPI), and HIV-Exposed Infant (HEI) tracking.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Data Models](#data-models)
  - [MCHRegistration](#mchregistration)
  - [ANCVisit](#ancvisit)
  - [Delivery](#delivery)
  - [PNCVisit](#pncvisit)
  - [GrowthMeasurement](#growthmeasurement)
  - [Vaccine & ImmunizationRecord](#vaccine--immunizationrecord)
  - [VitaminASupplement](#vitaminasupplement)
  - [AEFI](#aefi)
  - [HEIFollowUp & HEIPCRTest](#heifollowup--heipcrtest)
- [API Endpoints](#api-endpoints)
- [Custom Actions](#custom-actions)
- [Filter & Search Parameters](#filter--search-parameters)
- [Signals & Automation](#signals--automation)
- [Services](#services)
  - [WHO Growth Calculator](#who-growth-calculator)
  - [KEPI Schedule Generation](#kepi-schedule-generation)
  - [Billing Integration](#billing-integration)
  - [PDF Export](#pdf-export)
- [Clinical Business Logic](#clinical-business-logic)
  - [Gestational Age & EDD](#gestational-age--edd)
  - [Z-Score Interpretation](#z-score-interpretation)
  - [MUAC Classification](#muac-classification)
  - [Critical Alerts](#critical-alerts)
  - [HEI Status Determination](#hei-status-determination)
  - [Linda Jamii Free Maternity](#linda-jamii-free-maternity)
- [Frontend Architecture](#frontend-architecture)
  - [Pages](#pages)
  - [Components](#components)
  - [API Client](#api-client)
  - [Types & Schemas](#types--schemas)
- [Sensitive Data & Access Control](#sensitive-data--access-control)
- [Management Commands](#management-commands)
- [Testing](#testing)
- [Configuration & Setup](#configuration--setup)
- [Patient Flow](#patient-flow)

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            MCH Module Architecture                         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Frontend (Next.js)                                                        │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Pages: /mch, /mch/[id], /mch/new, /mch/deliveries,               │    │
│  │        /mch/growth, /mch/immunizations, /mch/hei                  │    │
│  │ Components: anc-visits-tab, delivery-tab, pnc-visits-tab,         │    │
│  │             growth-tab, growth-chart, immunizations-tab, hei-tab  │    │
│  │ API Client: mchApi (10 sub-clients, Zod-validated)                │    │
│  └──────────────────────────┬─────────────────────────────────────────┘    │
│                              │                                             │
│  Backend (Django REST)       │                                             │
│  ┌──────────────────────────▼─────────────────────────────────────────┐    │
│  │ ViewSets (11)  →  Serializers (20+)  →  Models (11)               │    │
│  │                                                                    │    │
│  │ Services:                                                          │    │
│  │  ├─ growth.py        WHO LMS Z-score calculator                   │    │
│  │  ├─ immunization.py  KEPI schedule generator                      │    │
│  │  ├─ billing.py       ANC/PNC/Delivery invoicing + Linda Jamii     │    │
│  │  └─ pdf_export.py    Growth chart PDF via ReportLab               │    │
│  │                                                                    │    │
│  │ Signals (9): Auto-enrollment, status transitions, baby creation,  │    │
│  │              appointment scheduling, billing, CCC enrollment      │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  Integrations:                                                             │
│  ├─ Clinics module (ANC ClinicEnrollment reuse)                           │
│  ├─ Billing module (auto-invoice creation)                                │
│  ├─ Scheduling module (auto-appointment creation)                         │
│  └─ Patients module (baby Patient auto-creation)                          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

The MCH module contains **11 models** in `backend/hmis/apps/mch/models.py`.

### MCHRegistration

The primary record representing a pregnancy / MCH card. Each registration tracks one pregnancy from enrolment through postnatal completion.

| Field | Type | Description |
|-------|------|-------------|
| `mch_number` | CharField (auto) | Auto-generated: `MCH-YYYYMMDD-XXXX` |
| `mother` | FK → Patient | The pregnant woman (PROTECT) |
| `anc_enrollment` | FK → ClinicEnrollment | Links to ANC enrollment for gravida, parity, LMP, EDD, blood group, HIV status (SET_NULL) |
| `baby` | FK → Patient | Linked post-delivery (SET_NULL) |
| `registration_date` | DateField | Date of MCH registration |
| `status` | CharField | State machine with 7 states (see below) |
| `is_high_risk` | BooleanField | High-risk pregnancy flag |
| `risk_factors` | TextField | Description of risk factors |
| `sha_claimable` | BooleanField | Whether SHA claims can be submitted |
| `linda_jamii_beneficiary` | BooleanField | Linda Jamii free maternity programme |
| `gbv_related` | BooleanField | Gender-based violence related |
| `is_sensitive` | BooleanField | Auto-set for HIV+ or GBV cases |
| `registered_by` | FK → User | Registering clinician |

**Status State Machine:**

```
ACTIVE ──────────→ DELIVERED ──→ POSTNATAL ──→ COMPLETED
   │                   │             │
   ├──→ TRANSFERRED_OUT │             ├──→ TRANSFERRED_OUT
   ├──→ LOST_TO_FOLLOW_UP            ├──→ LOST_TO_FOLLOW_UP
   └──→ DECEASED       └──→ DECEASED └──→ DECEASED
```

Valid transitions are enforced via `STATUS_TRANSITIONS` dict and `can_transition_to()` / `transition_status()` methods.

**Computed Properties:**

| Property | Description |
|----------|-------------|
| `gestation_display` | Human-readable gestational age from LMP (e.g., "32 weeks, 4 days") |
| `edd` | Expected date of delivery from linked ClinicEnrollment |
| `trimester` | Current trimester (1st/2nd/3rd) |
| `anc_visit_count` | Total ANC visits recorded |
| `pnc_visit_count` | Total PNC visits recorded |

**Permissions:** `view_sensitive_mch_registration` — required to view HIV+ or GBV registrations.

---

### ANCVisit

Antenatal care visit record following WHO's 8+ contact model.

| Field | Type | Description |
|-------|------|-------------|
| `registration` | FK → MCHRegistration | Parent MCH registration (PROTECT) |
| `encounter` | FK → Encounter | Optional linked clinical encounter |
| `visit_number` | IntegerField (1–20) | Sequential visit number |
| `visit_date` | DateField | Date of visit |
| `gestation_weeks` | IntegerField | Auto-calculated from LMP |
| **Maternal Vitals** | | |
| `weight` | DecimalField | Maternal weight (kg) |
| `blood_pressure` | CharField | Format: "120/80" |
| **Obstetric Examination** | | |
| `fundal_height` | DecimalField | Fundal height (cm) |
| `fetal_heart_rate` | IntegerField (80–200) | Normal: 110–160 BPM |
| `presentation` | CharField | CEPHALIC, BREECH, TRANSVERSE, OBLIQUE, UNKNOWN |
| `lie` | CharField | LONGITUDINAL, TRANSVERSE, OBLIQUE |
| `fetal_movements` | BooleanField | Whether fetal movements present |
| **Urine Tests** | | |
| `urine_protein` | CharField | NEGATIVE, TRACE, 1+, 2+, 3+, 4+ |
| `urine_glucose` | CharField | NEGATIVE, TRACE, 1+, 2+, 3+, 4+ |
| **Lab Investigations** | | |
| `hb_level` | DecimalField | Haemoglobin level (g/dL) |
| `blood_sugar` | DecimalField | Blood glucose level |
| `hiv_test_done` | BooleanField | HIV test performed |
| `syphilis_test_done` | BooleanField | Syphilis test performed |
| **Supplements & Prophylaxis** | | |
| `iron_folate_given` | BooleanField | Iron/folate supplement provided |
| `calcium_given` | BooleanField | Calcium supplement provided |
| `deworming_given` | BooleanField | Deworming administered |
| `tetanus_toxoid_dose` | IntegerField | TT dose number |
| **Follow-up** | | |
| `next_visit_date` | DateField | Scheduled next ANC visit |
| `notes` | TextField | Clinical notes |
| `conducted_by` | FK → User | Conducting clinician |

**Unique constraint:** `[registration, visit_number]` — one entry per visit number per pregnancy.

**Clinical Alerts:**
- Fetal bradycardia (FHR < 110 BPM) / tachycardia (FHR > 160 BPM)
- Proteinuria (urine protein ≥ 2+) — pre-eclampsia risk
- Anaemia (Hb < 10 g/dL)

---

### Delivery

Records the delivery event and birth outcome.

| Field | Type | Description |
|-------|------|-------------|
| `registration` | FK → MCHRegistration | Parent MCH registration |
| `delivery_date` | DateField | Date of delivery |
| `delivery_time` | TimeField | Time of delivery |
| `delivery_type` | CharField | SVD, ASSISTED_VAGINAL, ELECTIVE_CS, EMERGENCY_CS, VACUUM, FORCEPS |
| `delivery_outcome` | CharField | LIVE_BIRTH, STILLBIRTH, NEONATAL_DEATH, MATERNAL_DEATH |
| `place_of_delivery` | CharField | FACILITY, HOME, EN_ROUTE |
| `status` | CharField | PENDING, COMPLETED, REFERRED |
| **Baby Details** | | |
| `baby_gender` | CharField | M, F |
| `birth_weight` | DecimalField | 0.30–8.00 kg |
| `apgar_score_1min` | IntegerField (0–10) | APGAR at 1 minute |
| `apgar_score_5min` | IntegerField (0–10) | APGAR at 5 minutes |
| `apgar_score_10min` | IntegerField (0–10) | APGAR at 10 minutes |
| `resuscitation_done` | BooleanField | Whether resuscitation was needed |
| `baby_patient` | FK → Patient | Auto-created baby record |
| **Complications** | | |
| `maternal_complications` | TextField | Maternal complications |
| `neonatal_complications` | TextField | Neonatal complications |
| `blood_loss_ml` | IntegerField | Estimated blood loss (mL) |
| `placenta_complete` | BooleanField | Whether placenta was delivered complete |

**Computed Properties:**

| Property | Description |
|----------|-------------|
| `is_low_birth_weight` | True if birth weight < 2.5 kg |
| `is_macrosomia` | True if birth weight > 4.0 kg |

**Critical Alerts:**
- Low birth weight (< 2.5 kg)
- Macrosomia (> 4.0 kg)
- Low APGAR score (< 7 at 5 minutes)
- Postpartum haemorrhage (blood loss > 500 mL)
- Incomplete placenta

---

### PNCVisit

Postnatal care visit for both mother and baby. The standard Kenyan PNC schedule is: 48 hours, 3–7 days, 8–14 days, and 6 weeks postpartum.

| Field | Type | Description |
|-------|------|-------------|
| `registration` | FK → MCHRegistration | Parent MCH registration |
| `encounter` | FK → Encounter | Optional linked encounter |
| `visit_number` | IntegerField (1–10) | Sequential PNC visit number |
| `visit_date` | DateField | Date of visit |
| `days_postpartum` | IntegerField | Auto-calculated from delivery date |
| **Mother Assessment** | | |
| `blood_pressure` | CharField | Maternal blood pressure |
| `temperature` | DecimalField | Maternal temperature (°C) |
| `uterine_involution` | TextField | Uterine involution assessment |
| `lochia` | CharField | NORMAL, HEAVY, FOUL_SMELLING, ABSENT |
| `breast_condition` | CharField | NORMAL, ENGORGED, CRACKED_NIPPLES, MASTITIS, ABSCESS |
| `mood_assessment` | CharField | NORMAL, MILD_CONCERN, MODERATE_CONCERN, SEVERE_CONCERN (PPD screening) |
| **Baby Assessment** | | |
| `baby_weight` | DecimalField | Baby weight (kg) |
| `baby_temperature` | DecimalField | Baby temperature (°C) |
| `cord_status` | CharField | CLEAN, INFECTED, FALLEN_OFF |
| `breastfeeding_status` | CharField | EXCLUSIVE, MIXED, FORMULA, NOT_FEEDING |
| **Family Planning** | | |
| `family_planning_counselling` | BooleanField | FP counselling provided |
| `contraceptive_given` | CharField | Contraceptive method provided |

**Critical Alerts:**
- Foul-smelling lochia (infection risk)
- Mastitis or breast abscess
- Infected umbilical cord
- Moderate/severe depression concern
- Maternal or baby fever (> 37.5°C)

---

### GrowthMeasurement

Pediatric growth monitoring with WHO Z-score calculation.

| Field | Type | Description |
|-------|------|-------------|
| `patient` | FK → Patient | Child patient record |
| `encounter` | FK → Encounter | Optional linked encounter |
| `measurement_date` | DateField | Date of measurement |
| `age_in_days` | IntegerField | Auto-calculated from DOB |
| **Anthropometric Measurements** | | |
| `weight` | DecimalField | Weight (kg) |
| `height` | DecimalField | Height/length (cm) |
| `head_circumference` | DecimalField | Head circumference (cm) |
| `muac` | DecimalField | Mid-upper arm circumference (cm) |
| **Z-Scores (auto-calculated on save)** | | |
| `weight_for_age_z` | DecimalField | WAZ — underweight indicator |
| `height_for_age_z` | DecimalField | HAZ — stunting indicator |
| `weight_for_height_z` | DecimalField | WHZ — wasting indicator |
| `bmi_for_age_z` | DecimalField | BAZ — overweight/obesity indicator |
| `head_circumference_for_age_z` | DecimalField | HCZ — microcephaly/macrocephaly indicator |
| **Classifications** | | |
| `muac_classification` | CharField | SAM, MAM, NORMAL (auto-classified) |
| `nutritional_status` | CharField | Based on WAZ (see Z-Score Interpretation) |
| `measured_by` | FK → User | Measuring clinician |

---

### Vaccine & ImmunizationRecord

KEPI (Kenya Expanded Programme on Immunisation) reference data and individual patient immunization records.

**Vaccine** (reference data):

| Field | Type | Description |
|-------|------|-------------|
| `code` | CharField (unique) | e.g., "BCG", "PENTA1", "OPV0" |
| `name` | CharField | Full vaccine name |
| `description` | TextField | Description and purpose |
| `disease_target` | CharField | Target disease(s) |
| `standard_age_days` | IntegerField | Recommended age in days from birth |
| `route` | CharField | ORAL, IM (intramuscular), SC (subcutaneous), ID (intradermal) |
| `dose_number` | IntegerField | Dose number in series |
| `series_name` | CharField | Vaccine series group |
| `is_active` | BooleanField | Whether currently in use |

**ImmunizationRecord** (per patient):

| Field | Type | Description |
|-------|------|-------------|
| `patient` | FK → Patient | Child patient |
| `vaccine` | FK → Vaccine | Vaccine reference |
| `scheduled_date` | DateField | Auto: DOB + `vaccine.standard_age_days` |
| `administered_date` | DateField | Actual administration date |
| `status` | CharField | SCHEDULED, ADMINISTERED, MISSED, CONTRAINDICATED, DEFERRED |
| `dose_number` | IntegerField | Dose number administered |
| `batch_number` | CharField | Vaccine batch number |
| `lot_number` | CharField | Vaccine lot number |
| `expiry_date` | DateField | Vaccine expiry date |
| `site` | CharField | LEFT_DELTOID, RIGHT_DELTOID, LEFT_THIGH, RIGHT_THIGH, ORAL |
| `administered_by` | FK → User | Administering clinician |
| `next_dose_date` | DateField | Next dose due date |

**Computed:** `is_overdue` (True if SCHEDULED and past date), `days_overdue`.

**Unique constraint:** `[patient, vaccine]`

---

### VitaminASupplement

| Field | Type | Description |
|-------|------|-------------|
| `patient` | FK → Patient | Child patient |
| `administered_date` | DateField | Date administered |
| `dose` | IntegerField | 100,000 IU (6–11 months) or 200,000 IU (12–59 months) |
| `administered_by` | FK → User | Administering clinician |

---

### AEFI

Adverse Event Following Immunization reporting.

| Field | Type | Description |
|-------|------|-------------|
| `immunization_record` | FK → ImmunizationRecord | Related immunization |
| `event_date` | DateField | Date of adverse event |
| `event_type` | CharField | LOCAL_REACTION, SYSTEMIC_REACTION, SEVERE, DEATH |
| `severity` | CharField | MILD, MODERATE, SEVERE |
| `description` | TextField | Detailed event description |
| `outcome` | CharField | RECOVERED, RECOVERING, NOT_RECOVERED, SEQUELAE, FATAL, UNKNOWN |
| `reported_to_authorities` | BooleanField | Reported to pharmacovigilance authorities |
| `report_date` | DateField | Date reported |
| `investigated_by` | FK → User | Investigating officer |
| `investigation_notes` | TextField | Investigation findings |

---

### HEIFollowUp & HEIPCRTest

HIV-Exposed Infant follow-up aligned with Kenya NASCOP guidelines.

**HEIFollowUp:**

| Field | Type | Description |
|-------|------|-------------|
| `hei_number` | CharField (auto) | Auto-generated: `HEI-YYYYMMDD-XXXX` |
| `infant` | FK → Patient | Infant patient |
| `mch_registration` | FK → MCHRegistration | Parent MCH registration (SET_NULL) |
| `enrollment_date` | DateField | Date enrolled in HEI programme |
| `status` | CharField | ACTIVE, CONFIRMED_NEGATIVE, CONFIRMED_POSITIVE, LOST_TO_FOLLOW_UP, TRANSFERRED, DECEASED |
| `mother_art_status` | CharField | ON_ART, NOT_ON_ART, UNKNOWN |
| `infant_arv_prophylaxis` | CharField | NVP, AZT, NVP_AZT, NONE |
| `arv_start_date` / `arv_end_date` | DateField | ARV prophylaxis period |
| `breastfeeding_status` | CharField | EXCLUSIVE, MIXED, FORMULA, STOPPED |
| `cotrimoxazole_prophylaxis` | BooleanField | CTX prophylaxis started |
| `cotrimoxazole_start_date` | DateField | CTX start date |
| `is_sensitive` | BooleanField | Always True (enforced in `save()`) |

**HEIPCRTest:**

| Field | Type | Description |
|-------|------|-------------|
| `hei_followup` | FK → HEIFollowUp | Parent HEI record |
| `test_number` | IntegerField (1–5) | Test sequence (1 = 6 weeks, 2 = 9 months, 3 = confirmatory) |
| `scheduled_date` | DateField | Expected test date |
| `actual_date` | DateField | Actual test date |
| `result` | CharField | POSITIVE, NEGATIVE, INDETERMINATE, PENDING |
| `lab_reference` | CharField | Lab reference number |

**Unique constraint:** `[hei_followup, test_number]`

**Permission:** `view_sensitive_hei_followup` — required to view HEI records.

---

## API Endpoints

All endpoints are under `/api/mch/` and require authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| **MCH Registrations** | | |
| GET | `/api/mch/registrations/` | List registrations (paginated, filterable) |
| POST | `/api/mch/registrations/` | Create new MCH registration |
| GET | `/api/mch/registrations/{id}/` | Get registration detail |
| PATCH | `/api/mch/registrations/{id}/` | Update registration |
| DELETE | `/api/mch/registrations/{id}/` | Delete registration |
| POST | `/api/mch/registrations/{id}/transition_status/` | Transition status (see state machine) |
| POST | `/api/mch/registrations/{id}/route_to_anc/` | Route mother to ANC clinic queue |
| POST | `/api/mch/registrations/{id}/schedule_anc_visit/` | Schedule next ANC visit |
| **ANC Visits** | | |
| GET | `/api/mch/anc-visits/` | List ANC visits |
| POST | `/api/mch/anc-visits/` | Create ANC visit |
| GET | `/api/mch/anc-visits/{id}/` | Get ANC visit detail |
| PATCH | `/api/mch/anc-visits/{id}/` | Update ANC visit |
| DELETE | `/api/mch/anc-visits/{id}/` | Delete ANC visit |
| **Deliveries** | | |
| GET | `/api/mch/deliveries/` | List deliveries |
| POST | `/api/mch/deliveries/` | Create delivery record |
| GET | `/api/mch/deliveries/{id}/` | Get delivery detail |
| PATCH | `/api/mch/deliveries/{id}/` | Update delivery |
| DELETE | `/api/mch/deliveries/{id}/` | Delete delivery |
| GET | `/api/mch/deliveries/dashboard/` | Aggregated delivery stats, trends, upcoming EDDs |
| **PNC Visits** | | |
| GET | `/api/mch/pnc-visits/` | List PNC visits |
| POST | `/api/mch/pnc-visits/` | Create PNC visit |
| GET | `/api/mch/pnc-visits/{id}/` | Get PNC visit detail |
| PATCH | `/api/mch/pnc-visits/{id}/` | Update PNC visit |
| DELETE | `/api/mch/pnc-visits/{id}/` | Delete PNC visit |
| **Growth Measurements** | | |
| GET | `/api/mch/growth-measurements/` | List measurements |
| POST | `/api/mch/growth-measurements/` | Record measurement (Z-scores auto-calculated) |
| GET | `/api/mch/growth-measurements/{id}/` | Get measurement detail |
| PATCH | `/api/mch/growth-measurements/{id}/` | Update measurement |
| DELETE | `/api/mch/growth-measurements/{id}/` | Delete measurement |
| GET | `/api/mch/growth-measurements/chart_data/` | Growth chart data with WHO percentile bands |
| GET | `/api/mch/growth-measurements/export_pdf/` | Export growth chart as PDF |
| **Vaccines** (read-only) | | |
| GET | `/api/mch/vaccines/` | List KEPI vaccines |
| GET | `/api/mch/vaccines/{id}/` | Get vaccine detail |
| **Immunizations** | | |
| GET | `/api/mch/immunizations/` | List immunization records |
| GET | `/api/mch/immunizations/{id}/` | Get immunization detail |
| POST | `/api/mch/immunizations/{id}/administer/` | Record vaccine administration |
| POST | `/api/mch/immunizations/{id}/generate_schedule/` | Generate KEPI schedule for patient |
| POST | `/api/mch/immunizations/{id}/report_aefi/` | Report adverse event |
| **Vitamin A** | | |
| GET | `/api/mch/vitamin-a/` | List Vitamin A records |
| POST | `/api/mch/vitamin-a/` | Record Vitamin A administration |
| GET | `/api/mch/vitamin-a/{id}/` | Get supplement detail |
| **AEFI** | | |
| GET | `/api/mch/aefi/` | List AEFI reports |
| GET | `/api/mch/aefi/{id}/` | Get AEFI detail |
| PATCH | `/api/mch/aefi/{id}/` | Update AEFI report |
| **HEI Follow-up** | | |
| GET | `/api/mch/hei/` | List HEI follow-ups |
| POST | `/api/mch/hei/` | Create HEI enrollment |
| GET | `/api/mch/hei/{id}/` | Get HEI detail |
| PATCH | `/api/mch/hei/{id}/` | Update HEI follow-up |
| POST | `/api/mch/hei/{id}/determine_final_status/` | Determine final HIV status from PCR results |
| POST | `/api/mch/hei/{id}/update_feeding/` | Update breastfeeding status |
| **HEI PCR Tests** | | |
| GET | `/api/mch/hei-pcr/` | List PCR tests |
| POST | `/api/mch/hei-pcr/` | Record PCR test |
| GET | `/api/mch/hei-pcr/{id}/` | Get PCR test detail |
| PATCH | `/api/mch/hei-pcr/{id}/` | Update PCR test result |

---

## Custom Actions

### `transition_status` (MCHRegistration)

Transitions the MCH registration through its state machine.

```json
POST /api/mch/registrations/{id}/transition_status/
{
    "new_status": "DELIVERED"
}
```

Returns `400` if the transition is not valid from the current state.

### `route_to_anc` (MCHRegistration)

Routes the mother to the ANC clinic queue for consultation.

```json
POST /api/mch/registrations/{id}/route_to_anc/
```

### `schedule_anc_visit` (MCHRegistration)

Creates a scheduled ANC visit and appointment.

```json
POST /api/mch/registrations/{id}/schedule_anc_visit/
{
    "visit_date": "2026-04-15"
}
```

### `dashboard` (Delivery)

Returns aggregated delivery statistics.

```
GET /api/mch/deliveries/dashboard/
```

Response includes:
- Total deliveries, live births, stillbirths, C-section rate
- Monthly trends
- Delivery type breakdown
- Upcoming EDDs for active pregnancies

### `administer` (ImmunizationRecord)

Records vaccine administration for a scheduled immunization.

```json
POST /api/mch/immunizations/{id}/administer/
{
    "administered_date": "2026-03-01",
    "batch_number": "ABC123",
    "lot_number": "LOT456",
    "expiry_date": "2027-01-01",
    "site": "LEFT_THIGH"
}
```

### `generate_schedule` (ImmunizationRecord)

Generates the full KEPI immunization schedule for a patient.

```json
POST /api/mch/immunizations/{id}/generate_schedule/
{
    "patient_id": 42
}
```

### `report_aefi` (ImmunizationRecord)

Reports an adverse event following immunization.

```json
POST /api/mch/immunizations/{id}/report_aefi/
{
    "event_date": "2026-03-02",
    "event_type": "LOCAL_REACTION",
    "severity": "MILD",
    "description": "Swelling at injection site"
}
```

### `determine_final_status` (HEIFollowUp)

Algorithmically determines the infant's final HIV status based on PCR test history:
- **CONFIRMED_POSITIVE** — if any PCR test is positive
- **CONFIRMED_NEGATIVE** — if 2+ PCR tests are negative with no positives
- Remains **ACTIVE** otherwise

```json
POST /api/mch/hei/{id}/determine_final_status/
```

### `update_feeding` (HEIFollowUp)

Updates the infant's breastfeeding status.

```json
POST /api/mch/hei/{id}/update_feeding/
{
    "breastfeeding_status": "EXCLUSIVE"
}
```

---

## Filter & Search Parameters

### MCH Registrations

| Parameter | Type | Description |
|-----------|------|-------------|
| `mother` | number | Filter by mother patient ID |
| `status` | string | Filter by status (case-insensitive) |
| `is_high_risk` | boolean | Filter high-risk pregnancies |
| `linda_jamii_beneficiary` | boolean | Filter Linda Jamii beneficiaries |
| `registration_from` | date | Registration date >= |
| `registration_to` | date | Registration date <= |
| `search` | string | Search by MCH number, mother's name, or MRN |
| `ordering` | string | Order by `registration_date`, `created_at`, `status` |

### ANC Visits

| Parameter | Type | Description |
|-----------|------|-------------|
| `registration` | number | Filter by MCH registration ID |
| `visit_number` | number | Filter by visit number |
| `visit_from` / `visit_to` | date | Date range filter |

### Deliveries

| Parameter | Type | Description |
|-----------|------|-------------|
| `registration` | number | Filter by MCH registration ID |
| `status` | string | PENDING, COMPLETED, REFERRED |
| `delivery_type` | string | SVD, ELECTIVE_CS, etc. |
| `delivery_outcome` | string | LIVE_BIRTH, STILLBIRTH, etc. |
| `delivery_from` / `delivery_to` | date | Date range filter |

### Growth Measurements

| Parameter | Type | Description |
|-----------|------|-------------|
| `patient` | number | Filter by child patient ID |
| `muac_classification` | string | SAM, MAM, NORMAL |
| `measurement_from` / `measurement_to` | date | Date range filter |

### Immunizations

| Parameter | Type | Description |
|-----------|------|-------------|
| `patient` | number | Filter by patient ID |
| `vaccine` | number | Filter by vaccine ID |
| `status` | string | SCHEDULED, ADMINISTERED, MISSED, etc. |

### HEI Follow-ups

| Parameter | Type | Description |
|-----------|------|-------------|
| `infant` | number | Filter by infant patient ID |
| `status` | string | ACTIVE, CONFIRMED_NEGATIVE, CONFIRMED_POSITIVE, etc. |

---

## Signals & Automation

The MCH module uses **9 Django signals** for automated workflows:

| # | Signal | Trigger | Action |
|---|--------|---------|--------|
| 1 | `auto_generate_immunization_schedule` | Patient created | Generates KEPI schedule for children ≤ 5 years |
| 2 | `auto_create_anc_enrollment` | MCHRegistration created | Creates ANC `ClinicEnrollment` if none linked |
| 3 | `auto_transition_mch_to_delivered` | Delivery saved (COMPLETED) | Transitions MCH status from ACTIVE → DELIVERED |
| 4 | `auto_create_anc_appointment` | ANCVisit saved | Creates Scheduling `Appointment` from `next_visit_date` |
| 5 | `create_baby_patient_on_delivery` | Delivery saved (COMPLETED) | Creates baby `Patient` record, links to MCH registration |
| 6 | `auto_enroll_confirmed_positive_to_ccc` | HEIFollowUp saved | Auto-enrolls CONFIRMED_POSITIVE infant into CCC (Comprehensive Care Clinic) |
| 7 | `auto_create_anc_visit_invoice` | ANCVisit created | Creates billing invoice (skips Linda Jamii beneficiaries) |
| 8 | `auto_create_pnc_visit_invoice` | PNCVisit created | Creates billing invoice (skips Linda Jamii beneficiaries) |
| 9 | `auto_create_delivery_invoice` | Delivery saved (COMPLETED) | Creates delivery invoice (skips Linda Jamii beneficiaries) |

---

## Services

### WHO Growth Calculator

**Location:** `backend/hmis/apps/mch/services/growth.py`

Implements the WHO Child Growth Standards using the LMS (Lambda-Mu-Sigma) method for Z-score calculation.

**Formula:**

$$Z = \frac{\left(\frac{X}{M}\right)^L - 1}{L \times S}$$

Where:
- $X$ = measured value (weight, height, etc.)
- $L$ = Box-Cox power (skewness)
- $M$ = median
- $S$ = coefficient of variation

**Available Calculations:**

| Method | Indicator | Clinical Use |
|--------|-----------|--------------|
| `weight_for_age_z(sex, age_days, weight)` | WAZ | Underweight detection |
| `height_for_age_z(sex, age_days, height)` | HAZ | Stunting detection |
| `weight_for_height_z(sex, height, weight)` | WHZ | Wasting detection |
| `bmi_for_age_z(sex, age_days, bmi)` | BAZ | Overweight/obesity |
| `head_circumference_for_age_z(sex, age_days, hc)` | HCZ | Microcephaly/macrocephaly |
| `get_percentile_lines(indicator, sex, age_range)` | — | Growth chart reference lines |

Z-scores are auto-calculated when a `GrowthMeasurement` is saved. The calculator loads WHO LMS reference data from JSON files and interpolates between data points for exact age matching.

---

### KEPI Schedule Generation

**Location:** `backend/hmis/apps/mch/services/immunization.py`

Generates the full Kenya Expanded Programme on Immunisation schedule for a child based on their date of birth.

**Standard KEPI Schedule:**

| Age | Vaccines |
|-----|----------|
| Birth | BCG, OPV 0 |
| 6 weeks | OPV 1, Pentavalent 1, PCV 10-1, Rotavirus 1 |
| 10 weeks | OPV 2, Pentavalent 2, PCV 10-2, Rotavirus 2 |
| 14 weeks | OPV 3, Pentavalent 3, PCV 10-3, IPV |
| 6 months | Vitamin A (100,000 IU) |
| 9 months | Measles-Rubella 1, Yellow Fever |
| 12 months | Vitamin A (200,000 IU) |
| 18 months | Measles-Rubella 2 |

For each active vaccine, an `ImmunizationRecord` is created with:
- `status = SCHEDULED`
- `scheduled_date = DOB + vaccine.standard_age_days`

---

### Billing Integration

**Location:** `backend/hmis/apps/mch/services/billing.py`

Automatically generates invoices for MCH services through signal handlers:

| Service | Function | Trigger |
|---------|----------|---------|
| ANC Visit | `create_anc_visit_invoice()` | ANCVisit post_save (created) |
| PNC Visit | `create_pnc_visit_invoice()` | PNCVisit post_save (created) |
| Delivery | `create_delivery_invoice()` | Delivery post_save (COMPLETED) |

**Linda Jamii Exemption:** All billing functions check `mch_registration.linda_jamii_beneficiary`. If True, no invoice is generated — the service is covered under Kenya's free maternity programme.

---

### PDF Export

**Location:** `backend/hmis/apps/mch/services/pdf_export.py`

Generates a growth chart PDF report using ReportLab containing:
- Patient demographics (name, MRN, DOB, age)
- Growth measurement history table
- Visual growth chart with WHO percentile reference lines
- Z-score summary and nutritional status

Access via API: `GET /api/mch/growth-measurements/export_pdf/?patient={id}`

---

## Clinical Business Logic

### Gestational Age & EDD

Gestational age is calculated from the Last Menstrual Period (LMP) stored on the linked `ClinicEnrollment`:

```
Gestational Age = Today - LMP (in weeks and days)
EDD = LMP + 280 days (Naegele's rule)
```

The `MCHRegistration.gestation_display` property returns human-readable format (e.g., "32 weeks, 4 days"). The `trimester` property returns:
- **1st trimester**: 0–13 weeks
- **2nd trimester**: 14–27 weeks
- **3rd trimester**: 28+ weeks

On ANC visits, `gestation_weeks` is auto-calculated from LMP and the visit date.

---

### Z-Score Interpretation

| Z-Score Range | WAZ (Underweight) | HAZ (Stunting) | WHZ (Wasting) |
|---------------|-------------------|----------------|---------------|
| < -3 | Severe underweight | Severe stunting | Severe wasting (SAM) |
| -3 to < -2 | Moderate underweight | Moderate stunting | Moderate wasting (MAM) |
| -2 to < -1 | Mild underweight | Mild stunting | At risk |
| -1 to +1 | **Normal** | **Normal** | **Normal** |
| +1 to +2 | Overweight | — | Overweight |
| > +2 | Obese | — | Obese |

The `nutritional_status` field on `GrowthMeasurement` is auto-classified from WAZ using these thresholds.

---

### MUAC Classification

Mid-Upper Arm Circumference classification for children aged 6–59 months:

| MUAC | Classification | Clinical Action |
|------|---------------|-----------------|
| < 11.5 cm | **SAM** (Severe Acute Malnutrition) | Immediate therapeutic feeding |
| 11.5–12.4 cm | **MAM** (Moderate Acute Malnutrition) | Supplementary feeding |
| ≥ 12.5 cm | **NORMAL** | Continue monitoring |

---

### Critical Alerts

The module generates alerts at multiple levels:

**ANC Visit Alerts:**
- Fetal bradycardia: FHR < 110 BPM
- Fetal tachycardia: FHR > 160 BPM
- Proteinuria: Urine protein ≥ 2+ (pre-eclampsia risk)
- Anaemia: Hb < 10 g/dL

**Delivery Alerts:**
- Low birth weight: < 2.5 kg
- Macrosomia: > 4.0 kg
- Low APGAR: < 7 at 5 minutes
- Postpartum haemorrhage: Blood loss > 500 mL
- Incomplete placenta

**PNC Visit Alerts:**
- Foul-smelling lochia
- Mastitis or breast abscess
- Infected umbilical cord
- Postpartum depression (moderate/severe concern)
- Maternal fever (≥ 37.5°C)
- Neonatal fever (≥ 37.5°C)

**Growth Alerts:**
- SAM (MUAC < 11.5 cm or any Z-score < -3)
- MAM (MUAC 11.5–12.4 cm)
- Severely underweight (WAZ < -3)
- Severe stunting (HAZ < -3)
- Severe wasting (WHZ < -3)

---

### HEI Status Determination

The `determine_final_status` action uses the following algorithm:

1. If **any** HEI PCR test result is **POSITIVE** → status = `CONFIRMED_POSITIVE`
   - Auto-enrolls infant into CCC (Comprehensive Care Clinic) via signal
2. If **2 or more** PCR tests are **NEGATIVE** and none are positive → status = `CONFIRMED_NEGATIVE`
3. Otherwise → remains `ACTIVE` (more testing needed)

Standard PCR testing schedule:
- Test 1: 6 weeks of age
- Test 2: 9 months of age
- Test 3: Confirmatory (if indicated)

---

### Linda Jamii Free Maternity

Linda Jamii is Kenya's free maternity programme under the Social Health Authority (SHA). When `mch_registration.linda_jamii_beneficiary = True`:

- ANC visit invoices are **not generated**
- PNC visit invoices are **not generated**
- Delivery invoices are **not generated**
- The flag is displayed in the UI for visibility
- All other clinical workflows remain identical

---

## Frontend Architecture

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/mch` | MCH Registrations List | Stats cards (total/active/high-risk/Linda Jamii), search with status and risk filters, responsive table with MCH#, mother, gestation, EDD, ANC visits, status |
| `/mch/new` | New MCH Registration | Patient search (female only), optional ANC enrollment link (auto-creates if omitted), Linda Jamii and high-risk toggles, GBV flag |
| `/mch/[id]` | Registration Detail | Summary bar with status badges and risk flags, gestation/EDD/visit counters, 6 tabs: ANC Visits, Delivery, PNC Visits, Growth (if baby linked), Immunizations (if baby linked), HEI (if sensitive) |
| `/mch/deliveries` | Deliveries List | Delivery records with outcome, type, and status filters |
| `/mch/growth` | Growth Charts | Child growth monitoring with WHO chart visualization |
| `/mch/immunizations` | Immunizations | KEPI schedule view with administration tracking |
| `/mch/hei` | HEI Follow-up | HEI cohort list with status tracking |
| `/clinics/mch` | MCH Clinic Queue | ANC/PNC clinic queue integration |

### Components

Located in `web-app/components/mch/`:

| Component | Purpose |
|-----------|---------|
| `anc-visits-tab.tsx` | ANC visits list and creation form within MCH detail page |
| `delivery-tab.tsx` | Delivery recording form within MCH detail page |
| `pnc-visits-tab.tsx` | PNC visits list and creation form within MCH detail page |
| `growth-tab.tsx` | Growth measurements data table within MCH detail page |
| `growth-chart.tsx` | Interactive growth chart using Recharts with WHO percentile bands as reference lines |
| `growth-measurement-form.tsx` | Form to record weight, height, head circumference, and MUAC |
| `malnutrition-alert.tsx` | Alert banner displayed when SAM or MAM is detected |
| `immunizations-tab.tsx` | Immunization schedule display and administration within MCH detail page |
| `hei-tab.tsx` | HEI follow-up view and PCR test recording within MCH detail page |
| `enrollment-search-input.tsx` | Autocomplete search for existing ANC enrollments to link to MCH registration |

### API Client

Located in `web-app/lib/api/mch.ts` — exports `mchApi` object with 10 sub-clients:

```typescript
mchApi.registrations.list(params)     // → PaginatedResponse<MCHRegistrationListItem>
mchApi.registrations.get(id)          // → MCHRegistrationDetail
mchApi.registrations.create(data)     // → MCHRegistrationDetail
mchApi.registrations.transitionStatus(id, { new_status })
mchApi.registrations.routeToANC(id)
mchApi.registrations.scheduleANCVisit(id, { visit_date })

mchApi.ancVisits.list(params)         // → PaginatedResponse<ANCVisitListItem>
mchApi.ancVisits.create(data)         // → ANCVisitDetail

mchApi.deliveries.list(params)        // → PaginatedResponse<DeliveryListItem>
mchApi.deliveries.create(data)        // → DeliveryDetail
mchApi.deliveries.dashboard()         // → DeliveryDashboard

mchApi.pncVisits.list(params)         // → PaginatedResponse<PNCVisitListItem>
mchApi.pncVisits.create(data)         // → PNCVisitDetail

mchApi.growthMeasurements.list(params)   // → PaginatedResponse<GrowthMeasurementListItem>
mchApi.growthMeasurements.create(data)   // → GrowthMeasurementDetail
mchApi.growthMeasurements.getChartData(params) // → GrowthChartData
mchApi.growthMeasurements.exportPdf(params)    // → Blob (PDF)

mchApi.vaccines.list()                // → PaginatedResponse<Vaccine>

mchApi.immunizations.list(params)     // → PaginatedResponse<ImmunizationRecordListItem>
mchApi.immunizations.administer(id, data)
mchApi.immunizations.generateSchedule(data)
mchApi.immunizations.reportAEFI(id, data)

mchApi.vitaminA.list(params)          // → PaginatedResponse<VitaminASupplement>
mchApi.vitaminA.create(data)

mchApi.aefi.list(params)              // → PaginatedResponse<AEFIListItem>

mchApi.heiFollowUp.list(params)       // → PaginatedResponse<HEIFollowUpListItem>
mchApi.heiFollowUp.create(data)       // → HEIFollowUpDetail
mchApi.heiFollowUp.recordPCR(id, data)
mchApi.heiFollowUp.determineStatus(id)
mchApi.heiFollowUp.updateFeeding(id, data)
```

All methods validate responses with Zod schemas via `parseResponse()`.

### Types & Schemas

- **Types:** `web-app/lib/types/mch.ts` (1026 lines) — complete TypeScript interfaces for all models, list items, detail views, create payloads, and dashboard data.
- **Schemas:** `web-app/lib/schemas/mch.schema.ts` (638 lines) — Zod validation schemas matching all backend response shapes, including paginated responses and custom action responses.

---

## Sensitive Data & Access Control

The MCH module handles highly sensitive health data (HIV status, GBV). The following safeguards are in place:

### Automatic Sensitivity Flagging

- `MCHRegistration.is_sensitive` is automatically set to `True` when:
  - The linked ANC enrollment indicates HIV+ status
  - The `gbv_related` flag is set to True
- `HEIFollowUp.is_sensitive` is **always** True (enforced in `save()`)

### Custom Permissions

| Permission | Purpose |
|------------|---------|
| `mch.view_sensitive_mch_registration` | Required to view HIV+ or GBV-related MCH registrations |
| `mch.view_sensitive_hei_followup` | Required to view HEI follow-up records |

Users without these permissions will not see sensitive records in list views.

### Audit Logging

All CRUD operations on MCH data are audit-logged per Kenya Data Protection Act 2019 requirements, including:
- Who accessed or modified the record
- What action was performed
- IP address and timestamp
- 7-year retention period

---

## Management Commands

### `seed_kepi_schedule`

Seeds the `Vaccine` reference table with the standard KEPI vaccines.

```bash
cd backend
python manage.py seed_kepi_schedule
```

### `validate_who_lms`

Validates that WHO LMS reference data files are correctly loaded and Z-score calculations produce expected results.

```bash
cd backend
python manage.py validate_who_lms
```

---

## Testing

### Test Files

| File | Lines | Coverage Area |
|------|-------|---------------|
| `backend/tests/test_mch.py` | 346 | Core model tests: MCH registration, ANC visits, delivery, growth measurement, immunization schedule, HEI follow-up |
| `backend/tests/test_mch_uncommitted.py` | 1042 | Extended tests: billing services, signals, billing signals, route-to-ANC, growth chart PDF export, AEFI reporting, HEI actions, PDF service, WHO LMS validation, model changes, delivery dashboard, delivery list |
| `backend/tests/test_mch_integration_gaps.py` | 571 | Integration tests: auto-ANC enrollment, auto-transition to DELIVERED, auto-ANC appointment creation, auto-immunization appointment creation, ANC visit list includes next_visit_date |

### Running MCH Tests

```bash
cd backend

# All MCH tests
poetry run pytest tests/test_mch*.py -v

# Specific test class
poetry run pytest tests/test_mch.py::TestMCHRegistration -v

# With coverage
poetry run pytest tests/test_mch*.py --cov=hmis.apps.mch --cov-report=term-missing

# Just signal integration tests
poetry run pytest tests/test_mch_integration_gaps.py -v

# Pattern matching
poetry run pytest -k "mch and delivery" -v
```

### Key Test Classes

| Class | What It Tests |
|-------|---------------|
| `TestMCHRegistration` | Creation, auto MCH number, status transitions, validation |
| `TestANCVisits` | ANC visit creation, gestation calculation, alert generation |
| `TestDelivery` | Delivery recording, baby creation signal, birth weight alerts |
| `TestGrowthMeasurement` | Z-score calculation, MUAC classification, nutritional status |
| `TestImmunizationSchedule` | KEPI schedule generation, vaccine administration, overdue detection |
| `TestHEIFollowUp` | HEI enrollment, PCR test recording, status determination |
| `TestMCHBillingServices` | Invoice creation for ANC/PNC/delivery |
| `TestMCHBillingSignals` | Linda Jamii exemption, signal-based invoice creation |
| `TestMCHSignals` | Auto-enrollment, status transitions, baby creation, CCC enrollment |
| `TestDeliveryDashboardEndpoint` | Dashboard stats, trends, aggregation |

---

## Configuration & Setup

### Initial Setup

```bash
cd backend
poetry shell

# Apply migrations
python manage.py migrate

# Seed KEPI vaccine schedule
python manage.py seed_kepi_schedule

# Validate WHO LMS data
python manage.py validate_who_lms
```

### Required Dependencies

The MCH module depends on:
- `hmis.apps.patients` — Patient model for mother and baby
- `hmis.apps.encounters` — Encounter model for visit linking
- `hmis.apps.clinics` — ClinicEnrollment for ANC data (LMP, EDD, gravida, parity)
- `hmis.apps.billing` — Invoice generation for MCH services
- `hmis.apps.scheduling` — Appointment creation for follow-up visits
- `simple_history` — Historical record tracking
- `reportlab` — PDF generation for growth charts

### WHO LMS Reference Data

WHO growth standard reference data is stored as JSON files and loaded by the `WHOGrowthCalculator`. These files contain LMS parameters for each indicator by sex and age/height.

---

## Patient Flow

The typical MCH workflow follows this sequence:

```
1. REGISTRATION
   ├── Mother visits facility (or is referred)
   ├── Create/find Patient record (female)
   ├── Create MCH Registration → auto-generates MCH number
   ├── Link or auto-create ANC ClinicEnrollment
   └── Record pregnancy details (gravida, parity, LMP, EDD)

2. ANTENATAL CARE (ANC)
   ├── WHO 8+ contact model
   ├── Record maternal vitals, obstetric exam, labs, supplements
   ├── Auto-calculate gestation from LMP
   ├── Schedule next ANC visit → auto-creates Appointment
   ├── Generate clinical alerts (fetal distress, pre-eclampsia, anaemia)
   └── Auto-create billing invoice (unless Linda Jamii)

3. DELIVERY
   ├── Record delivery details (type, outcome, complications)
   ├── Record birth weight, APGAR scores
   ├── On COMPLETED → auto-create baby Patient record
   ├── On COMPLETED → auto-transition MCH to DELIVERED status
   ├── On COMPLETED → auto-generate KEPI immunization schedule for baby
   └── On COMPLETED → auto-create delivery invoice (unless Linda Jamii)

4. POSTNATAL CARE (PNC)
   ├── Standard schedule: 48hrs, 3-7d, 8-14d, 6 weeks
   ├── Assess mother (uterus, lochia, breasts, mood/PPD screening)
   ├── Assess baby (weight, temperature, cord, breastfeeding)
   ├── Family planning counselling
   └── Auto-create billing invoice (unless Linda Jamii)

5. CHILD HEALTH
   ├── Growth monitoring (weight, height, HC, MUAC)
   │   ├── Auto-calculate WHO Z-scores
   │   ├── Auto-classify nutritional status and MUAC
   │   ├── Generate malnutrition alerts (SAM/MAM)
   │   └── Export growth chart as PDF
   ├── Immunizations (KEPI schedule)
   │   ├── Track scheduled → administered → missed
   │   ├── Record batch/lot numbers
   │   ├── Report AEFI if adverse events
   │   └── Vitamin A supplementation
   └── HEI Follow-up (if HIV-exposed)
       ├── Track ARV prophylaxis and cotrimoxazole
       ├── Monitor breastfeeding status
       ├── Record PCR tests (6 weeks, 9 months, confirmatory)
       ├── Determine final HIV status from results
       └── Auto-enroll to CCC if confirmed positive

6. COMPLETION
   ├── Transition MCH status: POSTNATAL → COMPLETED
   └── Record remains available for historical reference
```

---

## Related Documentation

| Document | Description |
|----------|-------------|
| `docs/ideal-patient-flow.md` | Overall patient journey through the HMIS |
| `docs/billing-implementation-plan.md` | Billing module integration details |
| `docs/clinic-module-features.md` | Clinic enrollment and queue management |
| `ROADMAP.md` | Development roadmap (MCH originally Phase 3, implemented in Phase 2) |

---

**Last Updated**: March 2, 2026
**Module Version**: 1.0
