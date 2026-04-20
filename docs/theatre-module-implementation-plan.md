# Theatre/Operating Room Module - Implementation Plan

> **Project**: Vitora HMIS
> **Module**: Theatre/Operating Room Management
> **Version**: 1.3
> **Last Updated**: April 20, 2026
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
| Backend theatre app | ✅ **Implemented** | 10 models, 23 serializers, 2 ViewSets, 20+ actions, 85 tests passing |
| Backend models | ✅ **Complete** | OperatingTheatre, SurgeryCase (9-state machine), SurgicalTeamMember, WHOSafetyChecklist, AnesthesiaRecord, IntraOpVitalReading, OperativeNote, TheatreConsumable, PACURecord, PACUVitalReading |
| Backend serializers | ✅ **Complete** | 23 serializers (split Create/Read pattern) |
| Backend views | ✅ **Complete** | `OperatingTheatreViewSet` + `SurgeryCaseViewSet` with 9 workflow actions, team CRUD, WHO checklist 3 phases, anesthesia, operative notes, consumables, PACU |
| Backend signals/events | ✅ **Complete** | 13 TheatreEvents constants, 3 signal receivers (status, team, checklist) |
| Backend admin | ✅ **Complete** | 8 admin classes with colored badges, fieldsets, raw_id_fields |
| Backend filters | ✅ **Complete** | `OperatingTheatreFilter`, `SurgeryCaseFilter` |
| Backend permissions | ✅ **Complete** | `CanManageTheatreSettings`, `CanManageTheatre`, `CanDocumentSurgery`; setup CRUD and broader workflow writes now enforce backend RBAC |
| Backend services | ✅ **Complete** | `scheduling.py` now bridges `OperatingTheatre` to scheduling `Resource` PLACE records, defines recurring theatre schedules on those resources, uses scheduling-backed slot validation, and validates team shift coverage via `Shift` |
| Backend migrations | ✅ **Created** | `0001_initial.py` |
| Backend tests | ✅ **85 passing** | 37 model tests, 43 API tests, 5 event tests |
| ProcedureCatalog extension | ✅ **Complete** | `SURGICAL` category + 11 theatre-specific fields added |
| INSTALLED_APPS | ✅ **Wired** | `hmis.apps.theatre.apps.TheatreConfig` in settings |
| URL include | ✅ **Wired** | `api/theatre/` → `hmis.apps.theatre.urls` |
| Core events export | ✅ **Wired** | `TheatreEvents` exported from `core/events/__init__.py` |
| Dashboard stats | ✅ **Wired** | `_get_theatre_stats()` queries `SurgeryCase` model |
| Frontend theatre pages | ⚠️ Partial implementation | Dashboard, schedule, cases list, case detail, dedicated pre-op/intra-op/post-op workspace routes, anesthesia queue, and theatre setup/configuration are live; analytics remains scaffold-level |
| Frontend types/schemas/API | ✅ Implemented | Theatre API client, runtime schemas, and types are in place and aligned to backend routes |
| Frontend components | ✅ Implemented | Shared theatre component library now includes pre-op/intra-op/post-op workspaces, reusable case status and priority badges, theatre metric cards, and operating theatre admin table/form components used across dashboard, cases, schedule, detail, and setup views |
| Feature flag | ✅ `ENABLE_THEATRE` | Wired in `constants.ts`, `navigation.ts`, `layout.tsx`; defaults `true` in non-production |
| Roadmap placement | Sprint 2.3-2.4 | Phase 2 (Oct-Dec 2026) |
| Inpatient module | ✅ Complete | Ward, Bed, Admission, Discharge, Transfer, WardRound |
| Procedures module | ✅ **Complete** | 8 models (ProcedureCatalog, ProcedureOrder, ProcedureConsent, ProcedureLog, ProcedureConsumable, ProcedureKit, ProcedureKitItem, ProcedureOutcome) at `/api/procedures/` |
| Billing module | ✅ Complete | Invoice, InvoiceItem, Service, Payment, Receipt |
| Laboratory module | ✅ Complete | LabOrder, LabOrderItem, LabResult at `/api/lab/` |
| Pharmacy module | ✅ Complete | Drug, StockBatch, Prescription, Dispensing at `/api/pharmacy/` |
| Staff/RBAC module | ✅ Complete | Role model + group sync in place; default admin/clinical roles now carry theatre workflow permissions on `SurgeryCase` |
| Core mixins | ✅ Available | `FacilityScopedModel`, `TenantScopedViewMixin`, `ReadOnCreateMixin` |
| Domain events infra | ✅ Available | `publish_event()`, `EventBus`, `EventStore`; 15 event classes, 110 constants — **TheatreEvents wired** |
| Dashboard theatre section | ✅ **Live** | Queries SurgeryCase for `scheduled_today`, `in_progress`, `completed_today` |
| `Facility.has_theatre` | ✅ Exists | Boolean capability flag on Facility model |

### Implemented Backend Structure

```
backend/hmis/apps/theatre/
├── __init__.py
├── admin.py              # 8 admin classes with colored badges ✅
├── apps.py               # TheatreConfig, ready() imports signals ✅
├── filters.py            # OperatingTheatreFilter, SurgeryCaseFilter ✅
├── models.py             # 10 models (all FacilityScopedModel or TimeStampedModel) ✅
├── permissions.py        # CanManageTheatreSettings, CanManageTheatre, CanDocumentSurgery ✅
├── serializers.py        # 23 serializers (split Create/Read) ✅
├── signals.py            # 3 receivers → publish_event() ✅
├── urls.py               # DRF router: operating-theatres, cases ✅
├── validators.py         # Placeholder (reserved for future business rules)
├── views.py              # 2 ViewSets, 20+ @action methods ✅
├── services/
│   ├── __init__.py
│   └── scheduling.py     # Slot management, conflict detection ✅
└── migrations/
    ├── __init__.py
    └── 0001_initial.py   # ✅ Created

backend/tests/theatre/
├── __init__.py
├── conftest.py           # 7 fixtures ✅
├── test_theatre_models.py   # 37 tests ✅
├── test_theatre_api.py      # 43 tests ✅
└── test_theatre_events.py   # 5 tests ✅
```

### Existing Frontend Surface

```
web-app/app/(dashboard)/theatre/
├── layout.tsx                    # Feature-flag gate (ENABLE_THEATRE) ✅
├── page.tsx                      # Theatre dashboard / daily board ✅
├── cases/page.tsx                # Surgery cases list ✅
├── cases/[caseNumber]/page.tsx   # Case detail + Phase B pre-op workspace ✅
├── checklists/page.tsx           # Checklist route scaffold ✅
├── schedule/page.tsx             # Scheduling view ✅
└── reports/page.tsx              # Reports scaffold ✅
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
backend/hmis/apps/theatre/           # ✅ IMPLEMENTED
├── __init__.py
├── admin.py                  # 8 admin classes with colored badges ✅
├── apps.py                   # TheatreConfig, ready() imports signals ✅
├── models.py                 # 10 models (FacilityScopedModel / TimeStampedModel) ✅
├── serializers.py            # 23 DRF serializers (split Create/Read) ✅
├── signals.py                # 3 receivers → publish_event() ✅
├── urls.py                   # DRF router: operating-theatres, cases ✅
├── views.py                  # 2 ViewSets, 20+ @action methods ✅
├── validators.py             # Placeholder (reserved for future business rules)
├── permissions.py            # CanManageTheatre, CanDocumentSurgery ✅
├── filters.py                # OperatingTheatreFilter, SurgeryCaseFilter ✅
├── services/
│   ├── __init__.py
│   ├── scheduling.py         # Slot management, conflict detection ✅
│   ├── checklist.py          # WHO Safety Checklist logic ❌ Not created
│   ├── anesthesia.py         # Anesthesia record handling ❌ Not created
│   └── analytics.py          # Theatre metrics computation ❌ Not created
├── templates/
│   └── theatre/              # PDF templates (consent, reports) ❌ Not created
└── migrations/
    ├── __init__.py
    └── 0001_initial.py       # ✅ Created

backend/tests/theatre/               # ✅ 85 TESTS PASSING
├── __init__.py
├── conftest.py               # 7 fixtures ✅
├── test_theatre_models.py    # 37 tests ✅
├── test_theatre_api.py       # 43 tests ✅
└── test_theatre_events.py    # 5 tests ✅

web-app/                             # ⚠️ FRONTEND PARTIALLY IMPLEMENTED
├── app/(dashboard)/theatre/
│   ├── page.tsx              # Dashboard / daily theatre board ✅
│   ├── layout.tsx            # Feature-flag gate (ENABLE_THEATRE) ✅
│   ├── schedule/
│   │   ├── page.tsx          # Theatre schedule view ✅
│   │   └── [date]/page.tsx   # Daily theatre list — ❌ not created
│   ├── cases/
│   │   ├── page.tsx          # Surgery cases list ✅
│   │   ├── new/page.tsx      # Book new surgery ✅
│   │   └── [caseNumber]/
│   │       ├── page.tsx          # Case details + tabbed overview ✅
│   │       ├── pre-op/page.tsx   # Dedicated pre-op workspace ✅
│   │       ├── intra-op/page.tsx # Dedicated intra-op workspace ✅
│   │       └── post-op/page.tsx  # Dedicated post-op workspace ✅
│   ├── checklists/
│   │   └── page.tsx          # WHO checklist viewer scaffold ✅
│   ├── anesthesia/
│   │   ├── page.tsx          # Anesthesia case queue / workspace launcher ✅
│   │   └── [caseId]/page.tsx # Anesthesia record detail — ❌ not created
│   └── reports/
│       └── page.tsx          # Utilization reports scaffold ✅
├── components/theatre/       # ⚠️ partial
│   ├── theatre-board.tsx
│   ├── surgery-booking-form.tsx
│   ├── pre-op-workspace.tsx  # ✅ implemented (consent, labs, WHO Sign-In, anesthesia)
│   ├── who-checklist-dialog.tsx
│   ├── anesthesia-record-form.tsx
│   ├── operative-note-editor.tsx
│   ├── pacu-monitoring-form.tsx
│   └── case-status-badge.tsx
└── lib/
  ├── api/theatre.ts        # API client ✅
  ├── types/theatre.ts      # TypeScript types ✅
  └── schemas/theatre.schema.ts  # Zod validation ✅
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

### Phase A: Foundation & Scheduling (3-4 weeks) — ✅ BACKEND COMPLETE

**Sprint A.1: Backend Models & Theatre Setup** (Week 1-2) — ✅ COMPLETE

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| A.1.1 | Create Django theatre app (`hmis/apps/theatre/`) | High | - | ✅ Done |
| A.1.2 | Implement OperatingTheatre model (FacilityScopedModel) | High | 5 tests | ✅ Done |
| A.1.3 | Extend ProcedureCatalog: add `SURGICAL` category + theatre fields (migration) | High | - | ✅ Done |
| A.1.4 | Implement SurgeryCase model (FacilityScopedModel, status state machine) | High | 6 tests | ✅ Done |
| A.1.5 | Implement SurgicalTeamMember model | High | 3 tests | ✅ Done |
| A.1.6 | Create case number generator (SURG-YYYYMMDD-XXXX) | Medium | 3 tests | ✅ Done |
| A.1.7 | Implement status transition methods on SurgeryCase model | High | 15 tests | ✅ Done |
| A.1.8 | Define TheatreEvents in `core/events/types.py` + wire signals | High | 5 tests | ✅ Done |
| A.1.9 | RBAC permissions setup + seed theatre-specific roles | High | - | ✅ `seed_theatre_roles` management command (6 roles) |
| A.1.10 | Django admin registrations (facility in list_display/list_filter/raw_id_fields) | Low | - | ✅ Done |

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

**Sprint A.2: Scheduling API & Frontend** (Week 2-4) — ⏸️ Backend complete, Frontend not started

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| A.2.1 | Implement serializers (split Create/Read, use get_serializer_class) | High | - | ✅ Done (23 serializers) |
| A.2.2 | Implement ViewSets (TenantScopedViewMixin + ReadOnCreateMixin) | High | 43 tests | ✅ Done (2 ViewSets, 20+ actions) |
| A.2.3 | Theatre slot management service | High | - | ✅ Done (`services/scheduling.py`) |
| A.2.4 | Conflict detection | High | - | ✅ Done (`detect_theatre_conflicts`, `detect_surgeon_conflicts`) |
| A.2.5 | Seed surgical procedure catalog (ProcedureCatalog category=SURGICAL) | Medium | - | ✅ `seed_surgical_procedures` command (12 Kenya procedures) |
| A.2.6 | Frontend: TypeScript types, Zod schemas, API client | High | - | ✅ `theatre.schema.ts`, `theatre.ts` types, `theatre.ts` API (30+ methods) |
| A.2.7 | Frontend: Schedule calendar page | High | - | ✅ Date-nav daily theatre list with case cards |
| A.2.8 | Frontend: Surgery booking form | High | - | ✅ `cases/new/page.tsx` with react-hook-form + Zod |
| A.2.9 | Frontend: Daily theatre list | High | - | ✅ Integrated into schedule page + theatre dashboard |
| A.2.10 | Frontend: Live theatre board | High | - | ✅ Theatre dashboard with live status, stats cards, and today's list |
| A.2.11 | Add audit logging + contract tests | High | - | ✅ 27 serializer contract tests + audit logging in views |

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

- [x] **Models**
  - [x] OperatingTheatre with FacilityScopedModel + all fields
  - [x] ProcedureCatalog extended with `SURGICAL` category + theatre fields
  - [x] SurgeryCase with FacilityScopedModel + status state machine + transition methods
  - [x] SurgicalTeamMember with role tracking
  - [x] All models registered in Django admin (facility in list_display/list_filter/raw_id_fields)
  - [x] Migrations created and applied

- [x] **API** (backend only — frontend Zod validation pending)
  - [x] Full CRUD for theatre setup (TenantScopedViewMixin, ReadOnCreateMixin)
  - [x] Surgery booking workflow (request → schedule)
  - [x] Team assignment endpoints
  - [x] Status transition actions (thin views calling model methods)
  - [x] Conflict detection working
  - [x] All responses validated with Zod schemas (parseResponse) — `theatre.schema.ts` + `theatre.ts` API client

- [x] **Domain Events**
  - [x] TheatreEvents class defined in `core/events/types.py` (13 constants)
  - [x] Signals wired in `theatre/signals.py` for status transitions (3 receivers)
  - [x] `apps.py` `ready()` imports signals
  - [x] Event tests verify publish_event calls (5 tests)
  - [x] `docs/domain-events.md` SSOT updated

- [x] **Frontend** — ✅ Complete
  - [x] `lib/types/theatre.ts` + `lib/schemas/theatre.schema.ts` + `lib/api/theatre.ts`
  - [x] Theatre dashboard with live stats and today's list
  - [x] Date-navigable schedule page
  - [x] Surgery booking form (`cases/new/page.tsx`)
  - [x] Cases list page with filters, search, ResponsiveTable
  - [x] Case detail page with workflow actions, team, documentation status
  - [x] Checklists page (active cases needing checklist attention)
  - [ ] Team assignment UI — deferred to Phase B

- [x] **Business Logic**
  - [x] Case number auto-generation (SURG-YYYYMMDD-XXXX)
  - [x] Valid status transitions enforced (9-state machine with STATUS_TRANSITIONS dict)
  - [x] Slot conflict detection (`detect_theatre_conflicts`, `detect_surgeon_conflicts`)
  - [x] Team role validation (unique constraint on case + staff + role)

- [x] **Tests** — 85 passing
  - [x] ≥80% coverage on theatre app
  - [x] All status transitions tested
  - [x] 85 backend tests passing (37 model + 43 API + 5 events)

- [x] **Data**
  - [x] Surgical procedure catalog seeded (`seed_surgical_procedures` — 12 Kenya procedures)
  - [x] Theatre roles seeded (`seed_theatre_roles` — 6 roles)
  - [ ] SHA intervention codes mapped

---

### Phase B: Pre-Operative Workflow (2-3 weeks) — ✅ BACKEND COMPLETE

**Sprint B.1: WHO Sign-In & Pre-Op Assessment** (Week 1-2) — ✅ BACKEND COMPLETE

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| B.1.1 | Implement WHOSafetyChecklist model | High | 5 tests | ✅ Done (OneToOne with SurgeryCase, 3-phase completion methods) |
| B.1.2 | WHO Sign-In API endpoint | High | 4 tests | ✅ Done (`who-checklist/sign-in/` action) |
| B.1.3 | Pre-op consent integration | High | Focused Jest coverage | ✅ Done (reuses ProcedureOrder + ProcedureConsent in case detail pre-op workspace) |
| B.1.4 | Pre-op labs verification | Medium | Focused Jest coverage | ✅ Done (encounter/patient lab orders surfaced with readiness gating) |
| B.1.5 | Frontend: WHO Sign-In form | High | Focused Jest coverage | ✅ Done (case detail pre-op workspace) |
| B.1.6 | Frontend: Pre-op checklist UI | High | Focused Jest coverage | ✅ Done (readiness card + case-level pre-op workspace) |

**Sprint B.2: Anesthesia Pre-Op** (Week 2-3) — ✅ BACKEND COMPLETE

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| B.2.1 | Implement AnesthesiaRecord model | High | - | ✅ Done (pre-op/intra-op/post-op sections, Mallampati, ASA) |
| B.2.2 | Pre-op assessment API | High | 4 tests | ✅ Done (GET/POST/PATCH anesthesia endpoints) |
| B.2.3 | ASA classification logic | Medium | - | ✅ Done (field on AnesthesiaRecord) |
| B.2.4 | NPO verification | Medium | - | ✅ Done (npo_confirmed field) |
| B.2.5 | Frontend: Anesthesia pre-op form | High | Focused Jest coverage | ✅ Done (create/update assessment in case detail pre-op workspace) |
| B.2.6 | Jest unit tests | High | 2 focused suites | ✅ Done (`theatreApi` route tests + readiness card tests) |

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

- [x] **WHO Checklist**
  - [x] WHOSafetyChecklist model with all Sign-In fields
  - [x] Sign-In completion API
  - [x] Validation for required fields (phase ordering enforced)
  - [x] Timestamp and user tracking

- [x] **Pre-Op Assessment**
  - [x] Lab results verification
  - [x] Consent confirmation (ProcedureConsent integration)
  - [x] NPO status check
  - [ ] Pre-op vital signs

- [x] **Anesthesia Pre-Op**
  - [x] Airway assessment (Mallampati)
  - [x] ASA classification
  - [x] Pre-medication documentation
  - [x] Anesthesia consent

- [x] **Frontend**
  - [x] WHO Sign-In dialog/form
  - [x] Pre-op checklist dashboard
  - [x] Anesthesia assessment form
  - [x] "Ready for theatre" indicator

- [x] **Tests**
  - [x] WHO checklist workflow tests (5 model + 4 API tests)
  - [x] Anesthesia record tests (4 API tests)
  - [x] Focused frontend Jest coverage for Phase B workflow
  - [x] 80+ additional backend tests — covered as part of 85-test suite

---

### Phase C: Intra-Operative Documentation (2-3 weeks) — ✅ BACKEND COMPLETE

**Sprint C.1: Surgery & Anesthesia Intra-Op** (Week 1-2) — ✅ BACKEND COMPLETE

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| C.1.1 | WHO Time-Out API | High | 2 tests | ✅ Done (`who-checklist/time-out/` action) |
| C.1.2 | WHO Sign-Out API | High | 1 test | ✅ Done (`who-checklist/sign-out/` action) |
| C.1.3 | Implement IntraOpVitalReading model | High | - | ✅ Done (BP, HR, SpO2, EtCO2, peak pressure, FiO2) |
| C.1.4 | Timed vitals recording API | High | 1 test | ✅ Done (`anesthesia/vitals/` action) |
| C.1.5 | Anesthesia intra-op updates | High | - | ✅ Done (PATCH anesthesia endpoint) |
| C.1.6 | Frontend: WHO Time-Out/Sign-Out | High | - | ✅ Done (intra-op workspace + dedicated route) |
| C.1.7 | Frontend: Anesthesia vitals graph | Medium | - | ✅ Done (intra-op trend chart) |

**Sprint C.2: Operative Note & Consumables** (Week 2-3) — ✅ BACKEND COMPLETE

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| C.2.1 | Implement OperativeNote model | High | 2 tests | ✅ Done (findings, technique, EBL, implants, sign method) |
| C.2.2 | Operative note API | High | 3 tests | ✅ Done (GET/POST/sign actions) |
| C.2.3 | Implement TheatreConsumable model | High | - | ✅ Done (FacilityScopedModel, FK to pharmacy.Drug) |
| C.2.4 | Consumables/implant tracking API | High | - | ✅ Done (consumables CRUD on case) |
| C.2.5 | Pharmacy stock deduction integration | Medium | - | ❌ Not started |
| C.2.6 | Frontend: Operative note editor | High | - | ✅ Done (draft/save/sign with full operative note fields) |
| C.2.7 | Frontend: Consumables tracking UI | High | - | ✅ Done (search, add, list, remove) |

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

- [x] **WHO Time-Out & Sign-Out**
  - [x] Time-Out checklist complete (API + phase ordering validation)
  - [x] Sign-Out with counts verification
  - [x] All three phases tracked with timestamps and user

- [x] **Intra-Op Vitals**
  - [x] Timed vital recordings (IntraOpVitalReading model)
  - [x] BP, HR, SpO2, EtCO2, FiO2, peak pressure tracking
  - [ ] Vitals graph visualization — **frontend not started**

- [x] **Operative Note** (frontend + backend)
- [x] Structured editor for findings, technique, frozen section, and post-op plan
  - [ ] Procedure templates
  - [x] Digital signature (`sign()` method + `signed_by` FK)
  - [ ] PDF generation

- [x] **Consumables** (frontend + backend)
  - [x] Item tracking with lot/expiry
  - [x] Implant serial numbers
  - [x] Add/remove consumables from workspace log
  - [ ] Pharmacy stock deduction
  - [ ] Cost calculation

- [ ] **Tests**
  - [x] Backend workflow tests (covered in 85-test suite)
  - [ ] Consumable stock integration tests
  - [ ] 120+ additional tests — current total is 85

---

### Phase D: Post-Operative & Analytics (2-3 weeks) — ⏸️ BACKEND PACU COMPLETE, Analytics not started

**Sprint D.1: PACU Recovery** (Week 1-2) — ✅ BACKEND COMPLETE

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| D.1.1 | Implement PACURecord model | High | - | ✅ Done (arrival, Aldrete scoring, discharge destination) |
| D.1.2 | Implement PACUVitalReading model | High | - | ✅ Done (BP, HR, SpO2, Aldrete, pain score) |
| D.1.3 | PACU arrival/discharge API | High | 3 tests | ✅ Done (`pacu/` CRUD + `pacu/discharge/` action) |
| D.1.4 | Aldrete scoring implementation | High | - | ✅ Done (field on PACURecord + PACUVitalReading) |
| D.1.5 | Discharge criteria validation | High | - | ⏸️ Basic (PACUDischargeSerializer), no Aldrete threshold |
| D.1.6 | Frontend: PACU monitoring form | High | - | ❌ Not started |
| D.1.7 | Frontend: Discharge workflow | High | - | ❌ Not started |

**Sprint D.2: Analytics & Reports** (Week 2-3) — ❌ Not started

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| D.2.1 | Theatre utilization service | High | - | ❌ Not started |
| D.2.2 | Turnaround time calculation | High | - | ❌ Not started |
| D.2.3 | Throughput metrics | High | - | ❌ Not started |
| D.2.4 | Surgeon/anesthesiologist workload | Medium | - | ❌ Not started |
| D.2.5 | Frontend: Analytics dashboard | High | - | ❌ Not started (placeholder exists) |
| D.2.6 | Frontend: Reports page | High | - | ❌ Not started (placeholder exists) |
| D.2.7 | Playwright E2E tests | High | - | ❌ Not started |
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

- [x] **PACU Record** (backend)
  - [x] Arrival documentation
  - [x] Timed vital readings (PACUVitalReading model + API)
  - [x] Aldrete scoring (field on model)
  - [x] Pain scoring (field on PACUVitalReading)
  - [ ] Complication tracking

- [x] **Discharge** (backend)
  - [ ] Discharge criteria validation (Aldrete threshold)
  - [x] Destination selection (Ward/ICU/Day case — PACUDischargeSerializer)
  - [ ] Handover documentation

- [ ] **Analytics** — ❌ Not started
  - [ ] Theatre utilization percentage
  - [ ] Average turnaround time
  - [ ] On-time starts percentage
  - [ ] Case volume by procedure
  - [ ] Surgeon workload reports

- [ ] **Billing Integration** — ❌ Not started
  - [ ] Surgeon fees calculated
  - [ ] Theatre fees calculated
  - [ ] Consumable charges
  - [ ] Total case cost

- [ ] **Tests**
  - [x] PACU backend tests (3 API tests)
  - [ ] Analytics accuracy tests
  - [ ] Full perioperative E2E tests
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

| Category | Target Coverage | Estimated Tests | Actual (Apr 20) |
|----------|----------------|-----------------|------------------|
| Models | 100% | 120+ | 37 ✅ |
| Serializers (+ contract tests) | 100% | 70+ | — (covered in API tests) |
| Views/API | 100% | 100+ | 43 ✅ |
| Services (scheduling, analytics) | 90%+ | 60+ | — (scheduling covered in API tests) |
| Domain Events (signal wiring) | 100% | 20+ | 5 ✅ |
| Frontend Components | 80%+ | 80+ | 0 |
| E2E Flows | Critical paths | 25+ | 0 |
| **Total** | **≥80%** | **475+** | **85 passing** |

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
│        │ ✅ Phase A (BE)     │ Foundation & Scheduling                      │
│        │   BACKEND DONE      │ Models, Views, Tests, Events                 │
│        └──────────┬──────────┘                                              │
│                   │                                                         │
│                   └───────────┬─────────────┐                               │
│                               │ ✅ Phase B  │ Pre-Operative                 │
│                               │  (BE DONE)  │ WHO, Anesthesia eval          │
│                               └──────┬──────┘                               │
│                                      │                                      │
│                                      └───────┬─────────────┐                │
│                                              │ ✅ Phase C  │ Intra-Op       │
│                                              │  (BE DONE)  │ Checklists,    │
│                                              │             │ Notes, Consume │
│                                              └──────┬──────┘                │
│                                                     │                       │
│                                                     └───────┬───────────┐   │
│                                                             │ ⏸️ Phase D│   │
│                                                             │ PACU done │   │
│                                                             │ Analytics │   │
│                                                             │ pending   │   │
│                                                             └───────────┘   │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│  PROGRESS SNAPSHOT (April 20, 2026):                                        │
│  • Backend: 85 tests passing across 10 models, 23 serializers, 2 ViewSets  │
│  • Frontend: Placeholder pages only — types, schemas, API client needed     │
│  • Remaining backend: Analytics service, billing integration,               │
│    pharmacy stock deduction, role seeding, contract tests, domain-events.md │
│  • Remaining frontend: ALL pages, components, forms, live board             │
│  Total Duration: 10-14 weeks                                                │
│  Total Backend Tests: 450+ (target)  |  85 (current)                        │
│  Total Frontend Tests: 100+ (target) |  0 (current)                         │
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
