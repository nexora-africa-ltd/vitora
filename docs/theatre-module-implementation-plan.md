# Theatre/Operating Room Module - Implementation Plan

> **Project**: Vitora HMIS
> **Module**: Theatre/Operating Room Management
> **Version**: 1.1
> **Last Updated**: April 17, 2026
> **Estimated Duration**: 10-14 weeks
> **Original Roadmap**: Phase 2, Sprint 2.3-2.4 (Oct-Dec 2026)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Scope Definition](#scope-definition)
4. [Architecture Overview](#architecture-overview)
5. [Staff Roles & Permissions](#staff-roles--permissions)
6. [Data Models](#data-models)
7. [API Endpoints](#api-endpoints)
8. [Implementation Phases](#implementation-phases)
   - [Phase A: Foundation & Scheduling](#phase-a-foundation--scheduling-3-4-weeks)
   - [Phase B: Pre-Operative Workflow](#phase-b-pre-operative-workflow-2-3-weeks)
   - [Phase C: Intra-Operative Documentation](#phase-c-intra-operative-documentation-2-3-weeks)
   - [Phase D: Post-Operative & Analytics](#phase-d-post-operative--analytics-2-3-weeks)
9. [Technical Decisions](#technical-decisions)
10. [Test Strategy](#test-strategy)
11. [Risks & Mitigations](#risks--mitigations)
12. [Timeline Summary](#timeline-summary)

---

## Executive Summary

The Theatre Module provides comprehensive operating room management for Vitora HMIS, handling the complete perioperative journey from surgery scheduling to post-operative recovery. Key capabilities include:

- **Theatre Management** - Operating rooms, equipment, and availability tracking
- **Surgery Scheduling** - Booking, theatre lists, and calendar-based planning
- **Surgical Team Management** - Surgeons, anesthesiologists, theatre nurses, scrub technicians
- **Pre-Operative Workflow** - Consent, labs, vitals, anesthesia assessment, WHO checklist
- **Intra-Operative Documentation** - Procedure notes, timings, implants, consumables
- **Anesthesia Documentation** - Pre-op assessment, intra-op monitoring, post-op handover
- **Post-Operative Tracking** - PACU recovery, monitoring, complications, discharge
- **Theatre Analytics** - Utilization, turnaround times, throughput metrics

### Relationship to Procedures Module

| Module | Scope | Examples |
|--------|-------|----------|
| **Procedures** | Minor procedures in OPD/clinics | Wound suturing, circumcision, I&D |
| **Theatre** | Major surgeries in operating rooms | Appendectomy, C-section, hip replacement |

The Theatre module handles **major surgeries** requiring dedicated operating rooms, surgical teams, and anesthesia, while the Procedures module handles **minor procedures** in outpatient settings.

---

## Current State Analysis

| Aspect | Status | Notes |
|--------|--------|-------|
| Backend theatre app | ❌ Does not exist | Needs creation under `hmis/apps/theatre/` |
| Frontend theatre pages | ⏸️ Placeholders only | 6 files (5 pages + feature-flag layout) |
| Feature flag | ✅ `ENABLE_THEATRE` | Wired in `constants.ts`, `navigation.ts`, `layout.tsx`; defaults `true` in non-production |
| Roadmap placement | Sprint 2.3-2.4 | Phase 2 (Oct-Dec 2026) |
| Inpatient module | ✅ Complete | Ward, Bed, Admission, Discharge, Transfer, WardRound |
| Procedures module | ✅ **Complete** | 8 models (ProcedureCatalog, ProcedureOrder, ProcedureConsent, ProcedureLog, ProcedureConsumable, ProcedureKit, ProcedureKitItem, ProcedureOutcome) at `/api/procedures/` |
| Billing module | ✅ Complete | Invoice, InvoiceItem, Service, Payment, Receipt |
| Laboratory module | ✅ Complete | LabOrder, LabOrderItem, LabResult at `/api/lab/` |
| Pharmacy module | ✅ Complete | Drug, StockBatch, Prescription, Dispensing at `/api/pharmacy/` |
| Staff/RBAC module | ✅ Complete | Role model exists; **no theatre-specific roles seeded yet** |
| Core mixins | ✅ Available | `FacilityScopedModel`, `TenantScopedViewMixin`, `ReadOnCreateMixin` |
| Domain events infra | ✅ Available | `publish_event()`, `EventBus`, `EventStore`; 14 event classes, 97 constants — **no TheatreEvents yet** |
| Dashboard theatre section | ✅ Stub | Returns zeros for `scheduled_today`, `in_progress`, `completed_today` |
| `Facility.has_theatre` | ✅ Exists | Boolean capability flag on Facility model |

### Existing Frontend Placeholders

```
web-app/app/(dashboard)/theatre/
├── layout.tsx            # Feature-flag gate (ENABLE_THEATRE) ✅
├── page.tsx              # Dashboard placeholder ✅
├── cases/page.tsx        # Surgery cases placeholder ✅
├── checklists/page.tsx   # Checklists placeholder ✅
├── schedule/page.tsx     # Scheduling placeholder ✅
└── reports/page.tsx      # Reports placeholder ✅
```

### Key Integration Point: Procedures Module

The `procedures` app is **fully implemented** and explicitly reserves `Category.SURGICAL` for the theatre module:

```python
# ProcedureCatalog.Category (procedures/models.py)
# NOTE: Category "SURGICAL" is reserved for the future theatre module.
# This module covers minor/outpatient procedures only.
```

The theatre module **reuses** ProcedureCatalog (with `SURGICAL` category) rather than creating a duplicate `SurgicalProcedure` model. It also reuses `ProcedureConsent` for surgical consent tracking. See [Data Models](#data-models) for details.

---

## Scope Definition

### In Scope

| Category | Features |
|----------|----------|
| **Theatre Setup** | Operating rooms, equipment inventory, theatre types |
| **Scheduling** | Surgery booking, theatre lists, slot management |
| **Surgical Team** | Role assignment, workload tracking, availability |
| **Pre-Op** | Consent, pre-op assessment, WHO Sign-In checklist |
| **Anesthesia** | Pre-op evaluation, intra-op record, ASA classification |
| **Intra-Op** | Procedure notes, timings, implants, consumables |
| **Post-Op** | PACU scores, recovery monitoring, discharge |
| **WHO Safety** | Sign-In, Time-Out, Sign-Out checklists |
| **Billing** | Theatre charges, surgeon fees, anesthesia fees |
| **Analytics** | Utilization, turnaround, throughput reports |

### Out of Scope (Future Phases)

| Feature | Reason | Future Phase |
|---------|--------|--------------|
| Robotic surgery integration | Advanced feature | Phase 4 |
| Real-time equipment sensors | IoT complexity | Phase 4 |
| AI surgical assistance | Advanced ML | Phase 4+ |
| External surgeon credentialing | Regulatory complexity | Phase 3 |

---

## Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Theatre Module Architecture                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Frontend (Next.js)                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │  Scheduling  │  │  Live Board  │  │   Checklist  │               │   │
│  │  │   Calendar   │  │  (Theatre)   │  │    Forms     │               │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │   │
│  │         │                 │                 │                        │   │
│  │  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐               │   │
│  │  │   Surgery    │  │  Anesthesia  │  │   Recovery   │               │   │
│  │  │   Notes      │  │    Record    │  │     PACU     │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────┼─────────────────┼─────────────────┼───────────────────────┘   │
│            │                 │                 │                            │
│            └─────────────────┼─────────────────┘                            │
│                              │ REST API + WebSocket (live updates)          │
│  ┌───────────────────────────▼─────────────────────────────────────────┐   │
│  │                      Backend (Django REST)                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │  Theatre     │  │  Surgery     │  │  Anesthesia  │               │   │
│  │  │  Scheduling  │  │  Case        │  │    Record    │               │   │
│  │  │  Service     │  │  Service     │  │   Service    │               │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │   │
│  │         │                 │                 │                        │   │
│  │  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐               │   │
│  │  │   Safety     │  │   Billing    │  │  Analytics   │               │   │
│  │  │  Checklist   │  │ Integration  │  │   Service    │               │   │
│  │  │   Service    │  │              │  │              │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                          │                                  │
│  ┌───────────────────────────────────────▼─────────────────────────────┐   │
│  │                         Data Layer                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │  PostgreSQL  │  │    Redis     │  │ File Storage │               │   │
│  │  │  (metadata)  │  │ (live board) │  │ (documents)  │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Perioperative Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PERIOPERATIVE WORKFLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐     │
│  │  SCHEDULING │──▶│   PRE-OP    │──▶│  INTRA-OP   │──▶│   POST-OP   │     │
│  │             │   │             │   │             │   │             │     │
│  │ • Booking   │   │ • Consent   │   │ • Procedure │   │ • PACU      │     │
│  │ • Theatre   │   │ • Labs      │   │ • Timings   │   │ • Monitoring│     │
│  │   List      │   │ • Vitals    │   │ • Team      │   │ • Discharge │     │
│  │ • Team      │   │ • Anesthesia│   │ • Implants  │   │ • Follow-up │     │
│  │   Assign    │   │   Eval      │   │ • Notes     │   │             │     │
│  │             │   │ • WHO       │   │ • WHO       │   │             │     │
│  │             │   │   Sign-In   │   │   Time-Out  │   │             │     │
│  │             │   │             │   │   Sign-Out  │   │             │     │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘     │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  KEY ROLES INVOLVED:                                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  👨‍⚕️ SURGEON         - Lead surgeon, operating assistant(s)           │ │
│  │  💉 ANESTHESIOLOGIST - Pre-op eval, intra-op monitoring, PACU handover│ │
│  │  👩‍⚕️ THEATRE NURSE   - Circulating nurse, patient advocate           │ │
│  │  🔧 SCRUB TECH      - Sterile field, instruments, consumables         │ │
│  │  🩺 RECOVERY NURSE  - PACU monitoring, recovery assessment            │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Surgery Case Status Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Surgery Case Status Flow                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                                                         │
│   │   REQUESTED  │ ◀── Clinician requests surgery                          │
│   └───────┬──────┘                                                         │
│           │ Theatre coordinator reviews                                     │
│           ▼                                                                 │
│   ┌──────────────┐                                                         │
│   │   SCHEDULED  │ ──────────────────────────────────────────┐              │
│   └───────┬──────┘                                           │              │
│           │ Day of surgery                                   │ Postpone/    │
│           ▼                                                  │ Cancel       │
│   ┌──────────────┐                                           ▼              │
│   │   PRE_OP     │ ◀── Patient arrives, WHO Sign-In   ┌──────────┐         │
│   └───────┬──────┘                                    │POSTPONED │         │
│           │ Sign-In complete                          └──────────┘         │
│           ▼                                                  │              │
│   ┌──────────────┐                                           │              │
│   │   IN_THEATRE │ ◀── Team in theatre, WHO Time-Out        │              │
│   └───────┬──────┘                                           │              │
│           │ Incision                                         ▼              │
│           ▼                                           ┌──────────┐         │
│   ┌──────────────┐                                    │CANCELLED │         │
│   │  IN_SURGERY  │ ◀── Surgery in progress            └──────────┘         │
│   └───────┬──────┘                                                         │
│           │ Closure complete, WHO Sign-Out                                  │
│           ▼                                                                 │
│   ┌──────────────┐                                                         │
│   │   IN_PACU    │ ◀── Recovery room monitoring                            │
│   └───────┬──────┘                                                         │
│           │ Recovery criteria met                                           │
│           ▼                                                                 │
│   ┌──────────────┐                                                         │
│   │  DISCHARGED  │ ◀── To ward/ICU or day-case discharge                   │
│   └──────────────┘                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
backend/hmis/apps/theatre/
├── __init__.py
├── admin.py                  # Django admin (facility in list_display, list_filter, raw_id_fields)
├── apps.py                   # App configuration (ready() imports signals)
├── models.py                 # Core models (all inherit FacilityScopedModel)
├── serializers.py            # DRF serializers (split Create/Read per convention)
├── signals.py                # Domain event publishing via publish_event()
├── urls.py                   # API routes
├── views.py                  # ViewSets (TenantScopedViewMixin + ReadOnCreateMixin)
├── validators.py             # Business rule validators
├── permissions.py            # Theatre-specific permissions
├── services/
│   ├── __init__.py
│   ├── scheduling.py         # Slot management, conflicts
│   ├── checklist.py          # WHO Safety Checklist logic
│   ├── anesthesia.py         # Anesthesia record handling
│   └── analytics.py          # Theatre metrics computation
├── templates/
│   └── theatre/              # PDF templates (consent, reports)
└── migrations/

web-app/
├── app/(dashboard)/theatre/
│   ├── page.tsx              # Dashboard (live theatre board)
│   ├── layout.tsx            # Shared layout
│   ├── schedule/
│   │   ├── page.tsx          # Theatre calendar
│   │   └── [date]/page.tsx   # Daily theatre list
│   ├── cases/
│   │   ├── page.tsx          # Surgery cases list
│   │   ├── new/page.tsx      # Book new surgery
│   │   └── [caseNumber]/
│   │       ├── page.tsx      # Case details
│   │       ├── pre-op/page.tsx
│   │       ├── intra-op/page.tsx
│   │       └── post-op/page.tsx
│   ├── checklists/
│   │   └── page.tsx          # WHO checklist viewer
│   ├── anesthesia/
│   │   ├── page.tsx          # Anesthesia records list
│   │   └── [caseId]/page.tsx # Anesthesia record detail
│   └── reports/
│       └── page.tsx          # Utilization reports
├── components/theatre/
│   ├── theatre-board.tsx
│   ├── surgery-booking-form.tsx
│   ├── who-checklist-dialog.tsx
│   ├── anesthesia-record-form.tsx
│   ├── operative-note-editor.tsx
│   ├── pacu-monitoring-form.tsx
│   └── case-status-badge.tsx
└── lib/
    ├── api/theatre.ts        # API client
    ├── types/theatre.ts      # TypeScript types
    └── schemas/theatre.schema.ts  # Zod validation
```

---

## Staff Roles & Permissions

### Theatre-Specific Roles

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| **Theatre Coordinator** | Manages scheduling, theatre lists | Schedule surgeries, assign teams |
| **Surgeon** | Performs surgeries | View assigned cases, document operative notes |
| **Anesthesiologist** | Anesthesia care | Pre-op eval, anesthesia record, PACU handover |
| **Theatre Nurse** | Circulating nurse | WHO checklists, patient care, documentation |
| **Scrub Technician** | Sterile field management | Instrument counts, consumable tracking |
| **Recovery Nurse** | PACU care | Post-op monitoring, discharge criteria |

### Permission Matrix

| Permission | Coordinator | Surgeon | Anesthesiologist | Theatre Nurse | Scrub Tech | Recovery Nurse |
|------------|:-----------:|:-------:|:----------------:|:-------------:|:----------:|:--------------:|
| View theatre schedule | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create surgery booking | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit surgery booking | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign surgical team | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Complete WHO Sign-In | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Complete WHO Time-Out | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Complete WHO Sign-Out | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Document operative note | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Document anesthesia record | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Track consumables | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Document PACU care | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Discharge from PACU | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| View analytics | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Data Models

### 1. OperatingTheatre

```python
class OperatingTheatre(FacilityScopedModel, TimeStampedModel):
    """
    Operating room/theatre setup.

    Represents a physical operating theatre with equipment and capabilities.
    Inherits facility + organization FKs from FacilityScopedModel.
    """

    class TheatreType(models.TextChoices):
        GENERAL = 'GENERAL', 'General Surgery'
        ORTHO = 'ORTHO', 'Orthopedic'
        CARDIAC = 'CARDIAC', 'Cardiac Surgery'
        NEURO = 'NEURO', 'Neurosurgery'
        EYE = 'EYE', 'Ophthalmology'
        ENT = 'ENT', 'ENT Surgery'
        OBSTETRIC = 'OBSTETRIC', 'Obstetric/Gynecology'
        PEDIATRIC = 'PEDIATRIC', 'Pediatric Surgery'
        EMERGENCY = 'EMERGENCY', 'Emergency/Trauma'
        MINOR = 'MINOR', 'Minor Procedures'

    # Identity
    code = models.CharField(max_length=20)  # e.g., "OT-01" (unique per facility)
    name = models.CharField(max_length=100)  # e.g., "Operating Theatre 1"
    theatre_type = models.CharField(max_length=20, choices=TheatreType.choices)
    location = models.CharField(max_length=100, blank=True)  # Floor/building

    # Capabilities
    has_laminar_flow = models.BooleanField(default=False)
    has_cath_lab = models.BooleanField(default=False)
    has_image_intensifier = models.BooleanField(default=False)
    equipment_notes = models.TextField(blank=True)

    # Scheduling
    operating_hours_start = models.TimeField(default='08:00')
    operating_hours_end = models.TimeField(default='18:00')
    slot_duration_minutes = models.IntegerField(default=30)

    # Status
    is_active = models.BooleanField(default=True)
    maintenance_notes = models.TextField(blank=True)

    class Meta:
        unique_together = ['facility', 'code']
```

### 2. ProcedureCatalog Extension (Reuse Existing)

> **No new model.** The `procedures.ProcedureCatalog` already provides ICHI/CPT coding,
> consent requirements, anesthesia flags, duration, staffing, and billing integration.
> Category `"SURGICAL"` is explicitly reserved for the theatre module.

**Migration: add `SURGICAL` to `ProcedureCatalog.Category`:**

```python
# In procedures/models.py — add to Category TextChoices:
SURGICAL = "SURGICAL", "Surgical Procedure"
```

**Add theatre-specific fields to ProcedureCatalog** (migration):

```python
# New fields on ProcedureCatalog
complexity = models.CharField(
    max_length=20,
    choices=[('MINOR', 'Minor'), ('INTERMEDIATE', 'Intermediate'),
             ('MAJOR', 'Major'), ('COMPLEX', 'Complex')],
    blank=True, default='',
    help_text="Surgical complexity (only for SURGICAL category)",
)
sha_intervention_code = models.CharField(max_length=50, blank=True, default='')  # Kenya SHA
requires_icu_bed = models.BooleanField(default=False)
typical_blood_requirement = models.CharField(max_length=50, blank=True, default='')
special_equipment = models.TextField(blank=True, default='')
setup_time_minutes = models.PositiveIntegerField(default=15)
cleanup_time_minutes = models.PositiveIntegerField(default=15)
surgeon_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
theatre_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
anesthesia_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
```

> **Rationale:** One catalog, one search, one admin interface.
> The seed command for surgical procedures filters `category=SURGICAL`.

### 3. SurgeryCase

```python
class SurgeryCase(FacilityScopedModel, TimeStampedModel):
    """
    A surgical case from booking to discharge.

    Tracks the entire perioperative journey for a patient.
    Inherits facility + organization FKs from FacilityScopedModel.
    """

    class CaseStatus(models.TextChoices):
        REQUESTED = 'REQUESTED', 'Requested'
        SCHEDULED = 'SCHEDULED', 'Scheduled'
        PRE_OP = 'PRE_OP', 'Pre-Operative'
        IN_THEATRE = 'IN_THEATRE', 'In Theatre'
        IN_SURGERY = 'IN_SURGERY', 'Surgery In Progress'
        IN_PACU = 'IN_PACU', 'In Recovery (PACU)'
        DISCHARGED = 'DISCHARGED', 'Discharged'
        POSTPONED = 'POSTPONED', 'Postponed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    class Priority(models.TextChoices):
        ELECTIVE = 'ELECTIVE', 'Elective'
        URGENT = 'URGENT', 'Urgent'
        EMERGENCY = 'EMERGENCY', 'Emergency'

    class ASAClass(models.TextChoices):
        I = 'I', 'ASA I - Healthy'
        II = 'II', 'ASA II - Mild systemic disease'
        III = 'III', 'ASA III - Severe systemic disease'
        IV = 'IV', 'ASA IV - Life-threatening disease'
        V = 'V', 'ASA V - Moribund'
        VI = 'VI', 'ASA VI - Brain dead donor'

    class AnesthesiaType(models.TextChoices):
        GENERAL = 'GENERAL', 'General Anesthesia'
        SPINAL = 'SPINAL', 'Spinal Anesthesia'
        EPIDURAL = 'EPIDURAL', 'Epidural Anesthesia'
        REGIONAL = 'REGIONAL', 'Regional Block'
        LOCAL = 'LOCAL', 'Local Anesthesia'
        SEDATION = 'SEDATION', 'Sedation'
        COMBINED = 'COMBINED', 'Combined'

    # Valid status transitions (model owns workflow logic)
    STATUS_TRANSITIONS = {
        'REQUESTED': ['SCHEDULED', 'CANCELLED'],
        'SCHEDULED': ['PRE_OP', 'POSTPONED', 'CANCELLED'],
        'PRE_OP': ['IN_THEATRE', 'POSTPONED', 'CANCELLED'],
        'IN_THEATRE': ['IN_SURGERY', 'POSTPONED', 'CANCELLED'],
        'IN_SURGERY': ['IN_PACU'],
        'IN_PACU': ['DISCHARGED'],
        'DISCHARGED': [],
        'POSTPONED': ['SCHEDULED', 'CANCELLED'],
        'CANCELLED': [],
    }

    # Identity - format: SURG-YYYYMMDD-XXXX
    case_number = models.CharField(max_length=30, unique=True, editable=False)

    # Patient & Encounter
    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT)
    encounter = models.ForeignKey('encounters.Encounter', on_delete=models.PROTECT, null=True)
    admission = models.ForeignKey('inpatient.Admission', on_delete=models.SET_NULL, null=True, blank=True)

    # Procedure — FK to existing ProcedureCatalog (category=SURGICAL)
    primary_procedure = models.ForeignKey('procedures.ProcedureCatalog', on_delete=models.PROTECT)
    additional_procedures = models.ManyToManyField('procedures.ProcedureCatalog', related_name='secondary_cases', blank=True)
    procedure_notes = models.TextField(blank=True)  # Pre-op notes about the procedure

    # Scheduling
    theatre = models.ForeignKey(OperatingTheatre, on_delete=models.PROTECT)
    scheduled_date = models.DateField()
    scheduled_start_time = models.TimeField()
    estimated_duration_minutes = models.IntegerField()
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.ELECTIVE)

    # Clinical
    diagnosis = models.TextField()
    laterality = models.CharField(max_length=20, blank=True)  # Left/Right/Bilateral/N/A
    asa_class = models.CharField(max_length=5, choices=ASAClass.choices, blank=True)
    anesthesia_type = models.CharField(max_length=20, choices=AnesthesiaType.choices, blank=True)

    # Status
    status = models.CharField(max_length=20, choices=CaseStatus.choices, default=CaseStatus.REQUESTED)
    status_changed_at = models.DateTimeField(auto_now=True)
    status_changed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='case_status_changes')

    # Cancellation/Postponement
    cancellation_reason = models.TextField(blank=True)
    postponed_to_date = models.DateField(null=True, blank=True)

    # Requesting clinician
    requesting_doctor = models.ForeignKey(User, on_delete=models.PROTECT, related_name='surgery_requests')
    requested_at = models.DateTimeField(auto_now_add=True)

    # Billing
    total_charges = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_billable = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        # Auto-resolve facility/org from encounter or patient if not already set
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        super().save(*args, **kwargs)

    # Status transition methods (model owns workflow — views stay thin)
    def transition_to(self, new_status, user=None):
        """Validate and apply a status transition."""
        allowed = self.STATUS_TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            raise ValueError(f"Cannot transition from {self.status} to {new_status}")
        self.status = new_status
        self.status_changed_by = user
        self.save(update_fields=['status', 'status_changed_at', 'status_changed_by'])
```

### 4. SurgicalTeam

```python
class SurgicalTeamMember(TimeStampedModel):
    """
    Surgical team assignment for a case.

    Tracks all personnel involved in the surgery.
    """

    ROLE_CHOICES = [
        ('LEAD_SURGEON', 'Lead Surgeon'),
        ('ASSISTANT_SURGEON', 'Assistant Surgeon'),
        ('ANESTHESIOLOGIST', 'Anesthesiologist'),
        ('ANESTHESIA_TECH', 'Anesthesia Technician'),
        ('CIRCULATING_NURSE', 'Circulating Nurse'),
        ('SCRUB_NURSE', 'Scrub Nurse'),
        ('SCRUB_TECH', 'Scrub Technician'),
        ('RECOVERY_NURSE', 'Recovery Nurse'),
        ('OBSERVER', 'Observer/Trainee'),
    ]

    surgery_case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name='team_members')
    staff_member = models.ForeignKey(User, on_delete=models.PROTECT)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)

    # Timing (for workload tracking)
    scrub_in_time = models.DateTimeField(null=True, blank=True)
    scrub_out_time = models.DateTimeField(null=True, blank=True)

    # Notes
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ['surgery_case', 'staff_member', 'role']
```

### 5. WHOSafetyChecklist

```python
class WHOSafetyChecklist(TimeStampedModel):
    """
    WHO Surgical Safety Checklist implementation.

    Three phases: Sign-In (before anesthesia), Time-Out (before incision), Sign-Out (before leaving).
    """

    surgery_case = models.OneToOneField(SurgeryCase, on_delete=models.CASCADE, related_name='who_checklist')

    # =========================================================================
    # SIGN-IN (Before Anesthesia Induction)
    # =========================================================================
    sign_in_completed_at = models.DateTimeField(null=True, blank=True)
    sign_in_completed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='who_sign_ins')

    # Patient confirmation
    patient_identity_confirmed = models.BooleanField(default=False)
    procedure_site_marked = models.BooleanField(default=False)
    consent_signed = models.BooleanField(default=False)

    # Anesthesia safety check
    anesthesia_machine_checked = models.BooleanField(default=False)
    pulse_oximeter_attached = models.BooleanField(default=False)

    # Known allergy
    allergies_reviewed = models.BooleanField(default=False)
    allergy_notes = models.TextField(blank=True)

    # Airway/aspiration risk
    difficult_airway_risk = models.BooleanField(default=False)
    aspiration_risk = models.BooleanField(default=False)
    airway_equipment_available = models.BooleanField(default=False)

    # Blood loss risk
    blood_loss_risk = models.CharField(max_length=20, blank=True)  # Low/Moderate/High
    iv_access_adequate = models.BooleanField(default=False)
    blood_products_available = models.BooleanField(default=False)

    # =========================================================================
    # TIME-OUT (Before Skin Incision)
    # =========================================================================
    time_out_completed_at = models.DateTimeField(null=True, blank=True)
    time_out_completed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='who_time_outs')

    # Team introduction
    team_members_introduced = models.BooleanField(default=False)

    # Verbal confirmation
    patient_name_confirmed = models.BooleanField(default=False)
    procedure_confirmed = models.BooleanField(default=False)
    site_confirmed = models.BooleanField(default=False)

    # Anticipated events
    surgeon_critical_steps_discussed = models.BooleanField(default=False)
    anesthesia_concerns_discussed = models.BooleanField(default=False)
    nursing_concerns_discussed = models.BooleanField(default=False)

    # Antibiotic prophylaxis
    prophylactic_antibiotics_given = models.BooleanField(default=False)
    antibiotics_timing_within_60_min = models.BooleanField(default=False)
    antibiotics_not_applicable = models.BooleanField(default=False)

    # Imaging
    essential_imaging_displayed = models.BooleanField(default=False)
    imaging_not_applicable = models.BooleanField(default=False)

    # =========================================================================
    # SIGN-OUT (Before Patient Leaves)
    # =========================================================================
    sign_out_completed_at = models.DateTimeField(null=True, blank=True)
    sign_out_completed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='who_sign_outs')

    # Procedure confirmation
    procedure_name_recorded = models.BooleanField(default=False)

    # Counts
    instrument_count_correct = models.BooleanField(default=False)
    sponge_count_correct = models.BooleanField(default=False)
    needle_count_correct = models.BooleanField(default=False)

    # Specimen labeling
    specimens_labeled = models.BooleanField(default=False)
    specimen_count = models.IntegerField(default=0)

    # Equipment issues
    equipment_problems_noted = models.BooleanField(default=False)
    equipment_problems_description = models.TextField(blank=True)

    # Recovery concerns
    key_recovery_concerns = models.TextField(blank=True)
```

### 6. AnesthesiaRecord

```python
class AnesthesiaRecord(TimeStampedModel):
    """
    Complete anesthesia documentation for a surgery case.

    Covers pre-op assessment, intra-op monitoring, and PACU handover.
    """

    surgery_case = models.OneToOneField(SurgeryCase, on_delete=models.CASCADE, related_name='anesthesia_record')
    anesthesiologist = models.ForeignKey(User, on_delete=models.PROTECT, related_name='anesthesia_records')

    # =========================================================================
    # PRE-OPERATIVE ASSESSMENT
    # =========================================================================
    pre_op_assessment_at = models.DateTimeField(null=True, blank=True)

    # Airway assessment
    mallampati_class = models.CharField(max_length=5, blank=True)  # I, II, III, IV
    mouth_opening = models.CharField(max_length=50, blank=True)
    neck_mobility = models.CharField(max_length=50, blank=True)
    dentition_notes = models.TextField(blank=True)

    # NPO status
    last_solid_food = models.DateTimeField(null=True, blank=True)
    last_clear_fluids = models.DateTimeField(null=True, blank=True)
    npo_confirmed = models.BooleanField(default=False)

    # Pre-medication
    premedication_given = models.TextField(blank=True)

    # Consent
    anesthesia_consent_obtained = models.BooleanField(default=False)
    risks_explained = models.BooleanField(default=False)

    # =========================================================================
    # INTRA-OPERATIVE
    # =========================================================================
    # Timing
    induction_time = models.DateTimeField(null=True, blank=True)
    intubation_time = models.DateTimeField(null=True, blank=True)
    extubation_time = models.DateTimeField(null=True, blank=True)

    # Airway
    airway_device = models.CharField(max_length=100, blank=True)  # ETT, LMA, etc.
    tube_size = models.CharField(max_length=20, blank=True)
    intubation_attempts = models.IntegerField(default=1)
    intubation_difficulty = models.TextField(blank=True)

    # Anesthesia technique
    anesthesia_technique = models.TextField(blank=True)  # Detailed technique
    induction_agents = models.TextField(blank=True)
    maintenance_agents = models.TextField(blank=True)
    muscle_relaxants = models.TextField(blank=True)
    reversal_agents = models.TextField(blank=True)

    # Fluids
    crystalloid_volume = models.IntegerField(default=0)  # mL
    colloid_volume = models.IntegerField(default=0)
    blood_products = models.TextField(blank=True)

    # Blood loss
    estimated_blood_loss = models.IntegerField(default=0)  # mL
    urine_output = models.IntegerField(default=0)

    # Complications
    intraop_complications = models.TextField(blank=True)

    # =========================================================================
    # POST-OPERATIVE (PACU Handover)
    # =========================================================================
    pacu_handover_at = models.DateTimeField(null=True, blank=True)
    pacu_handover_notes = models.TextField(blank=True)

    # Post-op orders
    pain_management_plan = models.TextField(blank=True)
    post_op_nausea_plan = models.TextField(blank=True)
    other_post_op_orders = models.TextField(blank=True)
```

### 7. VitalReading (Intra-Operative Vitals)

```python
class IntraOpVitalReading(TimeStampedModel):
    """
    Timed vital signs recording during surgery.

    Typically recorded every 5 minutes.
    """

    anesthesia_record = models.ForeignKey(AnesthesiaRecord, on_delete=models.CASCADE, related_name='vital_readings')
    recorded_at = models.DateTimeField()
    recorded_by = models.ForeignKey(User, on_delete=models.PROTECT)

    # Cardiovascular
    systolic_bp = models.IntegerField(null=True, blank=True)
    diastolic_bp = models.IntegerField(null=True, blank=True)
    heart_rate = models.IntegerField(null=True, blank=True)

    # Respiratory
    respiratory_rate = models.IntegerField(null=True, blank=True)
    spo2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    etco2 = models.IntegerField(null=True, blank=True)  # End-tidal CO2

    # Ventilator settings (if applicable)
    fio2 = models.IntegerField(null=True, blank=True)  # Fraction of inspired O2
    tidal_volume = models.IntegerField(null=True, blank=True)
    peak_pressure = models.IntegerField(null=True, blank=True)

    # Other
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    # Notes
    notes = models.TextField(blank=True)
```

### 8. OperativeNote

```python
class OperativeNote(TimeStampedModel):
    """
    Surgeon's operative note documenting the procedure.
    """

    surgery_case = models.OneToOneField(SurgeryCase, on_delete=models.CASCADE, related_name='operative_note')
    dictated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='dictated_notes')

    # Timings
    incision_time = models.DateTimeField(null=True, blank=True)
    closure_time = models.DateTimeField(null=True, blank=True)

    # Procedure details
    pre_operative_diagnosis = models.TextField()
    post_operative_diagnosis = models.TextField()
    procedure_performed = models.TextField()

    # Findings
    findings = models.TextField()

    # Technique
    technique_description = models.TextField()

    # Implants / Materials
    implants_used = models.TextField(blank=True)
    drains_placed = models.TextField(blank=True)
    sutures_used = models.TextField(blank=True)

    # Blood loss
    estimated_blood_loss = models.IntegerField(default=0)

    # Specimens
    specimens_sent = models.TextField(blank=True)
    frozen_section = models.BooleanField(default=False)
    frozen_section_result = models.TextField(blank=True)

    # Complications
    intraoperative_complications = models.TextField(blank=True)

    # Plan
    post_operative_plan = models.TextField()

    # Signature
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='signed_operative_notes')
```

### 9. TheatreConsumable

> **Note:** The existing `procedures.ProcedureConsumable` already tracks items used
> (quantity, lot number, cost, `pharmacy.Drug` FK). `TheatreConsumable` extends this
> pattern with implant-specific fields for the surgical context.

```python
class TheatreConsumable(FacilityScopedModel, TimeStampedModel):
    """
    Tracks consumables and implants used in surgery.

    References pharmacy.Drug for the item catalog and pharmacy.StockBatch
    for stock deduction.
    """

    surgery_case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name='consumables')

    # Item
    item = models.ForeignKey('pharmacy.Drug', on_delete=models.PROTECT)  # Reuse pharmacy catalog
    lot_number = models.CharField(max_length=50, blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    # Quantity
    quantity_used = models.IntegerField()
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Tracking
    added_by = models.ForeignKey(User, on_delete=models.PROTECT)
    added_at = models.DateTimeField(auto_now_add=True)

    # For implants
    is_implant = models.BooleanField(default=False)
    implant_serial_number = models.CharField(max_length=100, blank=True)
```

### 10. PACURecord

```python
class PACURecord(TimeStampedModel):
    """
    Post-Anesthesia Care Unit (PACU) recovery record.
    """

    surgery_case = models.OneToOneField(SurgeryCase, on_delete=models.CASCADE, related_name='pacu_record')

    # Arrival
    arrival_time = models.DateTimeField()
    arriving_nurse = models.ForeignKey(User, on_delete=models.PROTECT, related_name='pacu_arrivals')

    # Initial assessment
    initial_aldrete_score = models.IntegerField()  # 0-10 scale
    initial_pain_score = models.IntegerField(null=True, blank=True)  # 0-10 NRS

    # Discharge criteria
    discharge_time = models.DateTimeField(null=True, blank=True)
    discharge_aldrete_score = models.IntegerField(null=True, blank=True)

    # Destination
    DISCHARGE_DESTINATION_CHOICES = [
        ('WARD', 'Ward'),
        ('ICU', 'ICU'),
        ('DAY_CASE_DISCHARGE', 'Day Case Discharge'),
        ('EXTENDED_OBSERVATION', 'Extended Observation'),
    ]
    discharge_destination = models.CharField(max_length=30, choices=DISCHARGE_DESTINATION_CHOICES, blank=True)

    # Complications
    nausea_vomiting = models.BooleanField(default=False)
    shivering = models.BooleanField(default=False)
    respiratory_issues = models.BooleanField(default=False)
    cardiovascular_issues = models.BooleanField(default=False)
    complications_notes = models.TextField(blank=True)

    # Medications given in PACU
    medications_given = models.TextField(blank=True)

    # Discharge
    discharged_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='pacu_discharges')
    discharge_notes = models.TextField(blank=True)


class PACUVitalReading(TimeStampedModel):
    """PACU vital signs monitoring."""

    pacu_record = models.ForeignKey(PACURecord, on_delete=models.CASCADE, related_name='vital_readings')
    recorded_at = models.DateTimeField()
    recorded_by = models.ForeignKey(User, on_delete=models.PROTECT)

    # Vitals
    systolic_bp = models.IntegerField(null=True, blank=True)
    diastolic_bp = models.IntegerField(null=True, blank=True)
    heart_rate = models.IntegerField(null=True, blank=True)
    respiratory_rate = models.IntegerField(null=True, blank=True)
    spo2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    # PACU-specific
    aldrete_score = models.IntegerField(null=True, blank=True)
    pain_score = models.IntegerField(null=True, blank=True)
    sedation_level = models.CharField(max_length=50, blank=True)

    notes = models.TextField(blank=True)
```

---

## API Endpoints

### Operating Theatres

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/operating-theatres/` | List all theatres |
| POST | `/api/theatre/operating-theatres/` | Create theatre (admin) |
| GET | `/api/theatre/operating-theatres/{id}/` | Get theatre details |
| PATCH | `/api/theatre/operating-theatres/{id}/` | Update theatre |
| GET | `/api/theatre/operating-theatres/{id}/availability/` | Get theatre slots |

### Surgical Procedures (Existing ProcedureCatalog)

> **No new endpoints.** Use existing `/api/procedures/catalog/` filtered by `category=SURGICAL`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/procedures/catalog/?category=SURGICAL` | List surgical procedures (existing) |
| GET | `/api/procedures/catalog/{id}/` | Get procedure details (existing) |
| POST | `/api/procedures/catalog/` | Create procedure (existing, admin) |

### Surgery Cases

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/cases/` | List surgery cases |
| POST | `/api/theatre/cases/` | Request new surgery |
| GET | `/api/theatre/cases/{caseNumber}/` | Get case details |
| PATCH | `/api/theatre/cases/{caseNumber}/` | Update case |
| POST | `/api/theatre/cases/{caseNumber}/schedule/` | Schedule case |
| POST | `/api/theatre/cases/{caseNumber}/start-pre-op/` | Begin pre-op |
| POST | `/api/theatre/cases/{caseNumber}/enter-theatre/` | Enter theatre |
| POST | `/api/theatre/cases/{caseNumber}/start-surgery/` | Begin surgery |
| POST | `/api/theatre/cases/{caseNumber}/end-surgery/` | End surgery |
| POST | `/api/theatre/cases/{caseNumber}/enter-pacu/` | Enter PACU |
| POST | `/api/theatre/cases/{caseNumber}/discharge/` | Discharge |
| POST | `/api/theatre/cases/{caseNumber}/cancel/` | Cancel surgery |
| POST | `/api/theatre/cases/{caseNumber}/postpone/` | Postpone surgery |

### Surgical Team

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/cases/{caseNumber}/team/` | Get team members |
| POST | `/api/theatre/cases/{caseNumber}/team/` | Add team member |
| DELETE | `/api/theatre/cases/{caseNumber}/team/{id}/` | Remove team member |

### WHO Checklist

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/cases/{caseNumber}/who-checklist/` | Get checklist |
| POST | `/api/theatre/cases/{caseNumber}/who-checklist/sign-in/` | Complete Sign-In |
| POST | `/api/theatre/cases/{caseNumber}/who-checklist/time-out/` | Complete Time-Out |
| POST | `/api/theatre/cases/{caseNumber}/who-checklist/sign-out/` | Complete Sign-Out |

### Anesthesia Record

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/cases/{caseNumber}/anesthesia/` | Get anesthesia record |
| POST | `/api/theatre/cases/{caseNumber}/anesthesia/` | Create record |
| PATCH | `/api/theatre/cases/{caseNumber}/anesthesia/` | Update record |
| POST | `/api/theatre/cases/{caseNumber}/anesthesia/vitals/` | Add vital reading |

### Operative Note

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/cases/{caseNumber}/operative-note/` | Get operative note |
| POST | `/api/theatre/cases/{caseNumber}/operative-note/` | Create note |
| PATCH | `/api/theatre/cases/{caseNumber}/operative-note/` | Update note |
| POST | `/api/theatre/cases/{caseNumber}/operative-note/sign/` | Sign note |

### PACU Record

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/cases/{caseNumber}/pacu/` | Get PACU record |
| POST | `/api/theatre/cases/{caseNumber}/pacu/` | Create PACU record |
| PATCH | `/api/theatre/cases/{caseNumber}/pacu/` | Update record |
| POST | `/api/theatre/cases/{caseNumber}/pacu/vitals/` | Add vital reading |
| POST | `/api/theatre/cases/{caseNumber}/pacu/discharge/` | Discharge from PACU |

### Consumables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/cases/{caseNumber}/consumables/` | List consumables |
| POST | `/api/theatre/cases/{caseNumber}/consumables/` | Add consumable |
| DELETE | `/api/theatre/cases/{caseNumber}/consumables/{id}/` | Remove consumable |

### Theatre Schedule & Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/theatre/schedule/` | Theatre schedule (calendar) |
| GET | `/api/theatre/schedule/{date}/` | Daily theatre list |
| GET | `/api/theatre/reports/utilization/` | Utilization report |
| GET | `/api/theatre/reports/turnaround/` | Turnaround times |
| GET | `/api/theatre/reports/throughput/` | Throughput metrics |

---

## Implementation Phases

### Phase A: Foundation & Scheduling (3-4 weeks)

**Sprint A.1: Backend Models & Theatre Setup** (Week 1-2)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| A.1.1 | Create Django theatre app (`hmis/apps/theatre/`) | High | - |
| A.1.2 | Implement OperatingTheatre model (FacilityScopedModel) | High | 12 tests |
| A.1.3 | Extend ProcedureCatalog: add `SURGICAL` category + theatre fields (migration) | High | 10 tests |
| A.1.4 | Implement SurgeryCase model (FacilityScopedModel, status state machine) | High | 25 tests |
| A.1.5 | Implement SurgicalTeamMember model | High | 15 tests |
| A.1.6 | Create case number generator (SURG-YYYYMMDD-XXXX) | Medium | 5 tests |
| A.1.7 | Implement status transition methods on SurgeryCase model | High | 20 tests |
| A.1.8 | Define TheatreEvents in `core/events/types.py` + wire signals | High | 10 tests |
| A.1.9 | RBAC permissions setup + seed theatre-specific roles | High | 15 tests |
| A.1.10 | Django admin registrations (facility in list_display/list_filter/raw_id_fields) | Low | - |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase A.1 Dependencies                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EXTERNAL DEPENDENCIES (all exist ✅):                          │
│  ├── patients.Patient model                                     │
│  ├── encounters.Encounter model (HistoryMixin)                  │
│  ├── inpatient.Admission model                                  │
│  ├── procedures.ProcedureCatalog (SURGICAL category reserved)   │
│  ├── auth.User model                                            │
│  ├── core.TimeStampedModel                                      │
│  ├── core.mixins.FacilityScopedModel                            │
│  ├── core.mixins.resolve_tenant_from_related                    │
│  ├── core.events.publish_event + EventBus + EventStore          │
│  └── core.models.Role (seed theatre roles here)                 │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── A.1.2 OperatingTheatre ──▶ A.1.4 SurgeryCase              │
│  ├── A.1.3 ProcedureCatalog extension ──▶ A.1.4 SurgeryCase    │
│  └── A.1.4 SurgeryCase ──▶ A.1.5 SurgicalTeamMember            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Sprint A.2: Scheduling API & Frontend** (Week 2-4)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| A.2.1 | Implement serializers (split Create/Read, use get_serializer_class) | High | 25 tests |
| A.2.2 | Implement ViewSets (TenantScopedViewMixin + ReadOnCreateMixin) | High | 35 tests |
| A.2.3 | Theatre slot management service | High | 15 tests |
| A.2.4 | Conflict detection | High | 12 tests |
| A.2.5 | Seed surgical procedure catalog (ProcedureCatalog category=SURGICAL) | Medium | 5 tests |
| A.2.6 | Frontend: TypeScript types, Zod schemas, API client | High | - |
| A.2.7 | Frontend: Schedule calendar page | High | - |
| A.2.8 | Frontend: Surgery booking form | High | - |
| A.2.9 | Frontend: Daily theatre list | High | - |
| A.2.10 | Frontend: Live theatre board | High | - |
| A.2.11 | Add audit logging + contract tests | High | 12 tests |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase A.2 Dependencies                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PREREQUISITE:                                                  │
│  └── Phase A.1 complete (models ready)                          │
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── billing.Invoice for charges (exists ✅)                    │
│  ├── core.AuditLog model (exists ✅)                            │
│  └── React calendar/scheduler component                         │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── A.2.1 Serializers ──▶ A.2.2 ViewSets                      │
│  ├── A.2.2 ViewSets ──▶ A.2.3 Slot management                  │
│  └── A.2.3 Slot management ──▶ A.2.4 Conflict detection        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria / Exit Checklist - Phase A

- [ ] **Models**
  - [ ] OperatingTheatre with FacilityScopedModel + all fields
  - [ ] ProcedureCatalog extended with `SURGICAL` category + theatre fields
  - [ ] SurgeryCase with FacilityScopedModel + status state machine + transition methods
  - [ ] SurgicalTeamMember with role tracking
  - [ ] All models registered in Django admin (facility in list_display/list_filter/raw_id_fields)
  - [ ] Migrations created and applied

- [ ] **API**
  - [ ] Full CRUD for theatre setup (TenantScopedViewMixin, ReadOnCreateMixin)
  - [ ] Surgery booking workflow (request → schedule)
  - [ ] Team assignment endpoints
  - [ ] Status transition actions (thin views calling model methods)
  - [ ] Conflict detection working
  - [ ] All responses validated with Zod schemas (parseResponse)

- [ ] **Domain Events**
  - [ ] TheatreEvents class defined in `core/events/types.py`
  - [ ] Signals wired in `theatre/signals.py` for status transitions
  - [ ] `apps.py` `ready()` imports signals
  - [ ] Event tests verify publish_event calls
  - [ ] `docs/domain-events.md` SSOT updated

- [ ] **Frontend**
  - [ ] `lib/types/theatre.ts` + `lib/schemas/theatre.schema.ts` + `lib/api/theatre.ts`
  - [ ] Theatre calendar view
  - [ ] Surgery booking form
  - [ ] Daily theatre list view
  - [ ] Live theatre board (basic)
  - [ ] Team assignment UI

- [ ] **Business Logic**
  - [ ] Case number auto-generation (SURG-YYYYMMDD-XXXX)
  - [ ] Valid status transitions enforced
  - [ ] Slot conflict detection
  - [ ] Team role validation

- [ ] **Tests**
  - [ ] ≥80% coverage on theatre app
  - [ ] All status transitions tested
  - [ ] 150+ backend tests passing

- [ ] **Data**
  - [ ] Surgical procedure catalog seeded
  - [ ] SHA intervention codes mapped

---

### Phase B: Pre-Operative Workflow (2-3 weeks)

**Sprint B.1: WHO Sign-In & Pre-Op Assessment** (Week 1-2)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| B.1.1 | Implement WHOSafetyChecklist model | High | 20 tests |
| B.1.2 | WHO Sign-In API endpoint | High | 12 tests |
| B.1.3 | Pre-op consent integration | High | 8 tests |
| B.1.4 | Pre-op labs verification | Medium | 10 tests |
| B.1.5 | Frontend: WHO Sign-In form | High | - |
| B.1.6 | Frontend: Pre-op checklist UI | High | - |

**Sprint B.2: Anesthesia Pre-Op** (Week 2-3)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| B.2.1 | Implement AnesthesiaRecord model | High | 20 tests |
| B.2.2 | Pre-op assessment API | High | 15 tests |
| B.2.3 | ASA classification logic | Medium | 8 tests |
| B.2.4 | NPO verification | Medium | 6 tests |
| B.2.5 | Frontend: Anesthesia pre-op form | High | - |
| B.2.6 | Jest unit tests | High | 30+ tests |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase B Dependencies                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PREREQUISITE:                                                  │
│  └── Phase A complete (SurgeryCase model)                       │
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── laboratory.LabOrder for pre-op labs (exists ✅)            │
│  └── procedures.ProcedureConsent for consent (exists ✅)        │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── B.1.1 WHOChecklist ──linked to── SurgeryCase              │
│  ├── B.2.1 AnesthesiaRecord ──linked to── SurgeryCase          │
│  └── B.1.* ──▶ B.2.* (Anesthesia after WHO Sign-In)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria / Exit Checklist - Phase B

- [ ] **WHO Checklist**
  - [ ] WHOSafetyChecklist model with all Sign-In fields
  - [ ] Sign-In completion API
  - [ ] Validation for required fields
  - [ ] Timestamp and user tracking

- [ ] **Pre-Op Assessment**
  - [ ] Lab results verification
  - [ ] Consent confirmation
  - [ ] NPO status check
  - [ ] Pre-op vital signs

- [ ] **Anesthesia Pre-Op**
  - [ ] Airway assessment (Mallampati)
  - [ ] ASA classification
  - [ ] Pre-medication documentation
  - [ ] Anesthesia consent

- [ ] **Frontend**
  - [ ] WHO Sign-In dialog/form
  - [ ] Pre-op checklist dashboard
  - [ ] Anesthesia assessment form
  - [ ] "Ready for theatre" indicator

- [ ] **Tests**
  - [ ] WHO checklist workflow tests
  - [ ] Pre-op validation tests
  - [ ] 80+ additional tests

---

### Phase C: Intra-Operative Documentation (2-3 weeks)

**Sprint C.1: Surgery & Anesthesia Intra-Op** (Week 1-2)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| C.1.1 | WHO Time-Out API | High | 12 tests |
| C.1.2 | WHO Sign-Out API | High | 12 tests |
| C.1.3 | Implement IntraOpVitalReading model | High | 15 tests |
| C.1.4 | Timed vitals recording API | High | 10 tests |
| C.1.5 | Anesthesia intra-op updates | High | 15 tests |
| C.1.6 | Frontend: WHO Time-Out/Sign-Out | High | - |
| C.1.7 | Frontend: Anesthesia vitals graph | Medium | - |

**Sprint C.2: Operative Note & Consumables** (Week 2-3)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| C.2.1 | Implement OperativeNote model | High | 18 tests |
| C.2.2 | Operative note API | High | 15 tests |
| C.2.3 | Implement TheatreConsumable model | High | 12 tests |
| C.2.4 | Consumables/implant tracking API | High | 15 tests |
| C.2.5 | Pharmacy stock deduction integration | Medium | 10 tests |
| C.2.6 | Frontend: Operative note editor | High | - |
| C.2.7 | Frontend: Consumables tracking UI | High | - |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase C Dependencies                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PREREQUISITE:                                                  │
│  ├── Phase A complete (SurgeryCase in IN_SURGERY status)       │
│  └── Phase B complete (WHO Sign-In done, Anesthesia started)   │
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── pharmacy.Drug for consumables catalog (exists ✅)          │
│  └── pharmacy.StockBatch for stock deduction (exists ✅)        │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── C.1.* WHO checklists ──depends on── C.2.2 Counts          │
│  ├── C.2.1 OperativeNote ──linked to── SurgeryCase             │
│  └── C.2.3 TheatreConsumable ──linked to── SurgeryCase         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria / Exit Checklist - Phase C

- [ ] **WHO Time-Out & Sign-Out**
  - [ ] Time-Out checklist complete
  - [ ] Sign-Out with counts verification
  - [ ] All three phases tracked with timestamps

- [ ] **Intra-Op Vitals**
  - [ ] Timed vital recordings every 5 min
  - [ ] BP, HR, SpO2, EtCO2, FiO2 tracking
  - [ ] Vitals graph visualization

- [ ] **Operative Note**
  - [ ] Rich text editor for findings
  - [ ] Procedure templates
  - [ ] Digital signature
  - [ ] PDF generation

- [ ] **Consumables**
  - [ ] Item tracking with lot/expiry
  - [ ] Implant serial numbers
  - [ ] Pharmacy stock deduction
  - [ ] Cost calculation

- [ ] **Tests**
  - [ ] Intra-op workflow E2E tests
  - [ ] Consumable stock integration tests
  - [ ] 120+ additional tests

---

### Phase D: Post-Operative & Analytics (2-3 weeks)

**Sprint D.1: PACU Recovery** (Week 1-2)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| D.1.1 | Implement PACURecord model | High | 15 tests |
| D.1.2 | Implement PACUVitalReading model | High | 12 tests |
| D.1.3 | PACU arrival/discharge API | High | 15 tests |
| D.1.4 | Aldrete scoring implementation | High | 10 tests |
| D.1.5 | Discharge criteria validation | High | 8 tests |
| D.1.6 | Frontend: PACU monitoring form | High | - |
| D.1.7 | Frontend: Discharge workflow | High | - |

**Sprint D.2: Analytics & Reports** (Week 2-3)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| D.2.1 | Theatre utilization service | High | 15 tests |
| D.2.2 | Turnaround time calculation | High | 12 tests |
| D.2.3 | Throughput metrics | High | 10 tests |
| D.2.4 | Surgeon/anesthesiologist workload | Medium | 10 tests |
| D.2.5 | Frontend: Analytics dashboard | High | - |
| D.2.6 | Frontend: Reports page | High | - |
| D.2.7 | Playwright E2E tests | High | 15+ tests |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase D Dependencies                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PREREQUISITE:                                                  │
│  └── Phase C complete (Surgery finished)                        │
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── inpatient.Ward for ward discharge (exists ✅)              │
│  └── billing.Invoice for final charges (exists ✅)              │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── D.1.* PACU ──follows── C.* Surgery completion             │
│  └── D.2.* Analytics ──uses── All phase data                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria / Exit Checklist - Phase D

- [ ] **PACU Record**
  - [ ] Arrival documentation
  - [ ] Timed vital readings
  - [ ] Aldrete scoring
  - [ ] Pain scoring
  - [ ] Complication tracking

- [ ] **Discharge**
  - [ ] Discharge criteria validation
  - [ ] Destination selection (Ward/ICU/Day case)
  - [ ] Handover documentation

- [ ] **Analytics**
  - [ ] Theatre utilization percentage
  - [ ] Average turnaround time
  - [ ] On-time starts percentage
  - [ ] Case volume by procedure
  - [ ] Surgeon workload reports

- [ ] **Billing Integration**
  - [ ] Surgeon fees calculated
  - [ ] Theatre fees calculated
  - [ ] Consumable charges
  - [ ] Total case cost

- [ ] **Tests**
  - [ ] Full perioperative E2E tests
  - [ ] Analytics accuracy tests
  - [ ] 80+ additional tests

---

## Technical Decisions

### Live Theatre Board

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Polling (5s)** | Simple, works everywhere | Latency, server load | Phase A MVP |
| **WebSockets** | Real-time, efficient | Infrastructure complexity | Phase B+ |
| **Server-Sent Events** | Simple, real-time | One-way only | Consider for Phase B |

**Decision**: Start with polling for MVP, add WebSocket support in Phase B for live board.

### Anesthesia Vitals Charting

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Chart.js** | Lightweight, familiar | Limited medical features | ✅ Phase C |
| **ECharts** | Powerful, customizable | Larger bundle | Consider |
| **Custom SVG** | Full control | Development time | Not recommended |

### PDF Generation

- **Operative Notes**: WeasyPrint with HTML templates
- **Consent Forms**: Pre-designed templates with dynamic fields
- **Theatre Lists**: Tabular PDF for printing

---

## Test Strategy

| Category | Target Coverage | Estimated Tests |
|----------|----------------|-----------------|
| Models | 100% | 120+ |
| Serializers (+ contract tests) | 100% | 70+ |
| Views/API | 100% | 100+ |
| Services (scheduling, analytics) | 90%+ | 60+ |
| Domain Events (signal wiring) | 100% | 20+ |
| Frontend Components | 80%+ | 80+ |
| E2E Flows | Critical paths | 25+ |
| **Total** | **≥80%** | **475+** |

### Test Scenarios

- **Scheduling**: Conflict detection, slot allocation, rescheduling
- **WHO Checklist**: All three phases, incomplete prevention
- **Status Flow**: Valid/invalid transitions, edge cases
- **Anesthesia**: Pre-op → intra-op → PACU handover
- **Consumables**: StockBatch deduction, implant tracking
- **Domain Events**: All status transitions publish correct event types
- **Tenant Scoping**: Facility isolation, cross-tenant data leak prevention
- **Contract Tests**: Serializer snapshot tests per `docs/contract-testing-recommendations.md`
- **Analytics**: Utilization calculations, date ranges
- **Fixture pattern**: All test fixtures include `sample_facility` / `sample_organization` per Gotcha #11

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Complex perioperative workflow | High | Medium | Phased approach, continuous clinician feedback |
| Real-time requirements | Medium | Medium | Start with polling, upgrade to WebSockets |
| WHO checklist compliance | High | Low | Strict validation, mandatory fields |
| Anesthesia documentation complexity | Medium | Medium | Templates, structured forms |
| Staff role management | Medium | Low | Leverage existing RBAC module |
| Pharmacy stock integration | Medium | Low | Existing pharmacy APIs ready |

---

## Timeline Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Implementation Timeline                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Week   1    2    3    4    5    6    7    8    9   10   11   12   13   14 │
│        ┌─────────────────────┐                                              │
│        │      Phase A        │ Foundation & Scheduling                      │
│        │     (3-4 wks)       │ Theatres, Cases, Team                       │
│        └──────────┬──────────┘                                              │
│                   │                                                         │
│                   └───────────┬─────────────┐                               │
│                               │   Phase B   │ Pre-Operative                 │
│                               │  (2-3 wks)  │ WHO Sign-In, Anesthesia eval │
│                               └──────┬──────┘                               │
│                                      │                                      │
│                                      └───────┬─────────────┐                │
│                                              │   Phase C   │ Intra-Op       │
│                                              │  (2-3 wks)  │ Checklists,    │
│                                              │             │ Notes, Consume │
│                                              └──────┬──────┘                │
│                                                     │                       │
│                                                     └───────┬───────────┐   │
│                                                             │  Phase D  │   │
│                                                             │ (2-3 wks) │   │
│                                                             │ PACU,     │   │
│                                                             │ Analytics │   │
│                                                             └───────────┘   │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│  Total Duration: 10-14 weeks                                                │
│  Total Backend Tests: 450+                                                  │
│  Total Frontend Tests: 100+                                                 │
│  Target Coverage: ≥80%                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix A: Common Kenya Surgical Procedures (Seed Data)

| Code | Name | Specialty | Complexity | Est. Duration |
|------|------|-----------|------------|---------------|
| GS-APP | Appendectomy | General Surgery | Intermediate | 60 min |
| GS-CHOLE | Cholecystectomy | General Surgery | Intermediate | 90 min |
| GS-HERNIA | Hernia Repair | General Surgery | Minor | 45 min |
| OB-CS | Cesarean Section | OB/GYN | Intermediate | 60 min |
| OB-HYST | Hysterectomy | OB/GYN | Major | 120 min |
| OR-THR | Total Hip Replacement | Orthopedics | Major | 150 min |
| OR-TKR | Total Knee Replacement | Orthopedics | Major | 120 min |
| OR-ORIF | ORIF (Fracture Fix) | Orthopedics | Intermediate | 90 min |
| UR-TURP | TURP | Urology | Intermediate | 60 min |
| ENT-TONSIL | Tonsillectomy | ENT | Minor | 30 min |
| EYE-CATARACT | Cataract Surgery | Ophthalmology | Minor | 30 min |
| PED-CIRCUM | Circumcision | Pediatric | Minor | 20 min |

---

## Appendix B: Aldrete Score Components

| Criterion | Score 2 | Score 1 | Score 0 |
|-----------|---------|---------|---------|
| **Activity** | Moves 4 extremities | Moves 2 extremities | Unable to move |
| **Respiration** | Deep breath, cough | Dyspnea, shallow | Apneic |
| **Circulation** | BP ±20% of pre-op | BP ±20-50% of pre-op | BP ±50% of pre-op |
| **Consciousness** | Fully awake | Arousable | Not responding |
| **O2 Saturation** | >92% on room air | Needs O2 to maintain >90% | <90% with O2 |

**Discharge criteria**: Aldrete score ≥9, stable vitals, pain controlled

---

## Appendix C: WHO Surgical Safety Checklist Summary

| Phase | Timing | Key Items |
|-------|--------|-----------|
| **Sign-In** | Before anesthesia | Identity, consent, site marking, allergies, airway, blood loss risk |
| **Time-Out** | Before incision | Team intro, patient/procedure/site confirmation, critical steps, antibiotics, imaging |
| **Sign-Out** | Before leaving OR | Procedure recorded, counts correct, specimens labeled, equipment issues, recovery concerns |

---

## References

- [WHO Surgical Safety Checklist](https://www.who.int/teams/integrated-health-services/patient-safety/research/safe-surgery/tool-and-resources)
- [ASA Physical Status Classification](https://www.asahq.org/standards-and-guidelines/asa-physical-status-classification-system)
- [Aldrete Scoring System](https://pubmed.ncbi.nlm.nih.gov/7493860/)
- [Kenya SHA Intervention Codes](https://sha.go.ke/)
- [ICHI (International Classification of Health Interventions)](https://www.who.int/standards/classifications/international-classification-of-health-interventions)
- [Vitora HMIS ROADMAP.md](../ROADMAP.md)
- [Inpatient Module](../backend/hmis/apps/inpatient/) (reference pattern)
- [Procedures Module Plan](./procedures-module-implementation-plan.md) (related module)
- [Imaging Module Plan](./imaging-module-implementation-plan.md) (related module)

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-06 | Engineering Team | Initial plan |
| 1.1 | 2026-04-17 | Engineering Team | Aligned with repo: reuse ProcedureCatalog (SURGICAL category) instead of separate SurgicalProcedure; add FacilityScopedModel to all models; add TheatreEvents domain events; fix pharmacy.Stock → StockBatch; reuse ProcedureConsent; add ReadOnCreateMixin/TenantScopedViewMixin; document ENABLE_THEATRE feature flag; add contract tests to strategy; update current state analysis to reflect completed procedures, billing, lab, pharmacy modules |
