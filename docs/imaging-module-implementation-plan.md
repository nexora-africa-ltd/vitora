# Imaging/Radiology Module - Implementation Plan

> **Project**: Vitora HMIS
> **Module**: Diagnostics (Imaging/Radiology)
> **Version**: 1.5
> **Last Updated**: February 14, 2026
> **Estimated Duration**: 9-12 weeks
> **Original Roadmap**: Phase 3, Sprint 3.4-3.6 (Apr-Sep 2027)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Overview](#architecture-overview)
4. [Data Models](#data-models)
5. [API Endpoints](#api-endpoints)
6. [Implementation Phases](#implementation-phases)
   - [Phase A: Foundation](#phase-a-foundation-2-3-weeks)
   - [Phase B: Frontend Order Management](#phase-b-frontend-order-management-2-3-weeks)
   - [Phase C: DICOM Integration](#phase-c-dicom-integration-3-4-weeks)
   - [Phase D: Radiology Reporting](#phase-d-radiology-reporting-2-weeks)
7. [Technical Decisions](#technical-decisions)
8. [Test Strategy](#test-strategy)
9. [Risks & Mitigations](#risks--mitigations)
10. [Timeline Summary](#timeline-summary)

---

## Executive Summary

The imaging module will provide comprehensive radiology and diagnostic imaging workflow management for Vitora HMIS, following the established laboratory module pattern. Key capabilities include:

- **Imaging Order Management** - X-ray, Ultrasound, CT, MRI ordering workflow
- **DICOM Integration** - Image ingestion, storage, and web-based viewing
- **Radiology Reporting** - Structured reports with templates and voice dictation
- **PACS-lite** - Local image archival with future cloud migration path
- **SHA Claims Integration** - Kenya Social Health Authority reimbursement workflow

---

## Current State Analysis

| Aspect | Status | Notes |
|--------|--------|-------|
| Backend imaging app | ✅ Complete | Phase A implemented |
| Frontend imaging page | ✅ Complete | Phase B implemented |
| Scheduling integration | ✅ Complete | Uses scheduling module (ImagingOrder → Appointment link) |
| DICOM backend (models) | ✅ Complete | Phase C Sprint C.1 — DICOMStudy/Series/Instance models |
| DICOM services | ✅ Complete | Phase C Sprint C.1 — parsing (pydicom) + PACS storage |
| DICOM API & WADO | ✅ Complete | Phase C Sprint C.2 — upload, list, retrieve, delete |
| DICOM viewer (frontend) | ✅ Complete | Phase C Sprint C.3 — Cornerstone.js + frame rendering |
| Frame rendering endpoint | ✅ Complete | GET /api/imaging/dicom/{sop_uid}/frame/ — PNG output |
| DICOM E2E tests | ✅ Complete | Playwright tests for viewer pages |
| Roadmap placement | Sprint 3.4-3.6 | Phase 3 (Apr-Sep 2027) |
| Similar pattern reference | ✅ Laboratory module | Fully implemented, use as template |
| Test infrastructure | ✅ Ready | pytest, Jest, Playwright configured |
| SHA integration | ✅ Complete | DHA services ready for claims |

---

## Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Imaging Module Architecture                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Frontend (Next.js)                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ Order Forms  │  │ DICOM Viewer │  │ Report Editor│               │   │
│  │  │ & Worklist   │  │ (Cornerstone)│  │ (Rich Text)  │               │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │   │
│  └─────────┼─────────────────┼─────────────────┼───────────────────────┘   │
│            │                 │                 │                            │
│            └─────────────────┼─────────────────┘                            │
│                              │ REST API                                     │
│  ┌───────────────────────────▼─────────────────────────────────────────┐   │
│  │                      Backend (Django REST)                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ Order Views  │  │ DICOM Service│  │Report Service│               │   │
│  │  │ & Serializers│  │ (pydicom)    │  │ (PDF gen)    │               │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │   │
│  └─────────┼─────────────────┼─────────────────┼───────────────────────┘   │
│            │                 │                 │                            │
│  ┌─────────▼─────────────────▼─────────────────▼───────────────────────┐   │
│  │                         Data Layer                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │  PostgreSQL  │  │ PACS Storage │  │ File Storage │               │   │
│  │  │  (metadata)  │  │ (DICOM files)│  │ (PDF reports)│               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Module Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Imaging Module Components                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────┐     ┌────────────────────┐                         │
│  │  ImagingProcedure  │     │   ImagingOrder     │                         │
│  │    (Catalog)       │────▶│  (from Encounter)  │                         │
│  │                    │     │                    │                         │
│  │ - code             │     │ - order_number     │                         │
│  │ - name             │     │ - patient          │                         │
│  │ - modality         │     │ - encounter        │                         │
│  │ - body_region      │     │ - priority         │                         │
│  │ - cost             │     │ - status           │                         │
│  │ - sha_claimable    │     │ - scheduled_at     │                         │
│  └────────────────────┘     └─────────┬──────────┘                         │
│                                       │                                     │
│           ┌───────────────────────────┼───────────────────────┐             │
│           │                           │                       │             │
│           ▼                           ▼                       ▼             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐  │
│  │  ImagingOrderItem   │  │     DICOMStudy      │  │  RadiologyReport   │  │
│  │                     │  │                     │  │                    │  │
│  │ - procedure         │  │ - study_instance_uid│  │ - order            │  │
│  │ - laterality        │  │ - accession_number  │  │ - findings         │  │
│  │ - instructions      │  │ - modality          │  │ - impression       │  │
│  │ - unit_cost         │  │ - storage_path      │  │ - status           │  │
│  └─────────────────────┘  └──────────┬──────────┘  │ - reported_by      │  │
│                                      │             │ - is_critical      │  │
│                           ┌──────────▼──────────┐  └────────────────────┘  │
│                           │     DICOMSeries     │                          │
│                           │                     │                          │
│                           │ - series_instance_uid                          │
│                           │ - modality          │                          │
│                           │ - body_part         │                          │
│                           └──────────┬──────────┘                          │
│                                      │                                      │
│                           ┌──────────▼──────────┐                          │
│                           │    DICOMInstance    │                          │
│                           │                     │                          │
│                           │ - sop_instance_uid  │                          │
│                           │ - file_path         │                          │
│                           │ - dimensions        │                          │
│                           └─────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Order Status Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Imaging Order Status Flow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────┐                                                               │
│   │  DRAFT  │ ◀── Created by clinician                                     │
│   └────┬────┘                                                               │
│        │ Submit order                                                       │
│        ▼                                                                    │
│   ┌─────────┐                                                               │
│   │ ORDERED │ ──────────────────────────────┐                               │
│   └────┬────┘                               │                               │
│        │ Schedule appointment               │ Cancel                        │
│        ▼                                    ▼                               │
│   ┌───────────┐                      ┌───────────┐                         │
│   │ SCHEDULED │                      │ CANCELLED │                         │
│   └─────┬─────┘                      └───────────┘                         │
│         │ Patient arrives                                                   │
│         ▼                                                                   │
│   ┌─────────────┐                                                           │
│   │ IN_PROGRESS │ ◀── Imaging being performed                              │
│   └──────┬──────┘                                                           │
│          │ Images acquired                                                  │
│          ▼                                                                  │
│   ┌─────────────┐                                                           │
│   │  COMPLETED  │ ◀── Pending radiologist report                           │
│   └──────┬──────┘                                                           │
│          │ Report signed                                                    │
│          ▼                                                                  │
│   ┌──────────┐                                                              │
│   │ REPORTED │ ◀── Final report available                                  │
│   └──────────┘                                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
backend/hmis/apps/imaging/
├── __init__.py
├── admin.py                 # Django admin registrations
├── apps.py                  # App configuration
├── models.py                # Core models
├── serializers.py           # DRF serializers
├── urls.py                  # API routes
├── views.py                 # ViewSets
├── validators.py            # Business rule validators
├── services/
│   ├── __init__.py
│   ├── dicom.py             # DICOM parsing/handling (pydicom)
│   ├── pacs.py              # PACS-lite storage service
│   └── reporting.py         # Report PDF generation
├── templates/
│   └── radiology/           # Report HTML templates
└── migrations/

web-app/
├── app/(dashboard)/imaging/
│   ├── page.tsx             # Dashboard/overview
│   ├── layout.tsx           # Shared layout
│   ├── orders/
│   │   ├── page.tsx         # Orders list
│   │   ├── new/page.tsx     # Create order
│   │   └── [orderNumber]/
│   │       ├── page.tsx     # Order details
│   │       └── report/page.tsx  # Report view
│   ├── studies/
│   │   ├── page.tsx         # DICOM studies list
│   │   └── [studyId]/page.tsx   # DICOM viewer
│   ├── worklist/page.tsx    # Radiologist worklist
│   └── catalog/page.tsx     # Procedures catalog
├── components/imaging/
│   ├── imaging-order-form.tsx
│   ├── dicom-viewer.tsx
│   ├── radiology-report-editor.tsx
│   └── order-status-badge.tsx
└── lib/
    ├── api/imaging.ts       # API client
    ├── types/imaging.ts     # TypeScript types
    └── schemas/imaging.schema.ts  # Zod validation
```

---

## Data Models

### 1. ImagingProcedure (Catalog)

```python
class ImagingProcedure(models.Model):
    """Master catalog of imaging procedures."""

    MODALITY_CHOICES = [
        ('XR', 'X-Ray'),
        ('US', 'Ultrasound'),
        ('CT', 'Computed Tomography'),
        ('MRI', 'Magnetic Resonance Imaging'),
        ('NM', 'Nuclear Medicine'),
        ('MG', 'Mammography'),
        ('FL', 'Fluoroscopy'),
        ('OTHER', 'Other'),
    ]

    BODY_REGION_CHOICES = [
        ('HEAD', 'Head/Brain'),
        ('NECK', 'Neck'),
        ('CHEST', 'Chest'),
        ('ABDOMEN', 'Abdomen'),
        ('PELVIS', 'Pelvis'),
        ('SPINE', 'Spine'),
        ('UPPER_EXTREMITY', 'Upper Extremity'),
        ('LOWER_EXTREMITY', 'Lower Extremity'),
        ('WHOLE_BODY', 'Whole Body'),
        ('OTHER', 'Other'),
    ]

    # Identity
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    modality = models.CharField(max_length=20, choices=MODALITY_CHOICES)
    body_region = models.CharField(max_length=30, choices=BODY_REGION_CHOICES)

    # Interoperability codes
    radlex_code = models.CharField(max_length=50, blank=True)  # RadLex Playbook ID
    loinc_code = models.CharField(max_length=20, blank=True)

    # Requirements
    requires_contrast = models.BooleanField(default=False)
    requires_sedation = models.BooleanField(default=False)
    special_preparation = models.TextField(blank=True)
    turnaround_hours = models.IntegerField(default=24)

    # Pricing & SHA
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sha_claimable = models.BooleanField(default=True)
    sha_intervention_code = models.CharField(max_length=50, blank=True)

    # Status
    is_active = models.BooleanField(default=True)
    available_in_house = models.BooleanField(default=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

### 2. ImagingOrder

```python
class ImagingOrder(models.Model):
    """Imaging order from clinical encounter."""

    ORDER_STATUS = [
        ('DRAFT', 'Draft'),
        ('ORDERED', 'Ordered'),
        ('SCHEDULED', 'Scheduled'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed - Pending Report'),
        ('REPORTED', 'Reported'),
        ('CANCELLED', 'Cancelled'),
    ]

    PRIORITY_LEVELS = [
        ('ROUTINE', 'Routine'),
        ('URGENT', 'Urgent'),
        ('STAT', 'STAT (Immediate)'),
    ]

    # Valid status transitions
    STATUS_TRANSITIONS = {
        'DRAFT': ['ORDERED', 'CANCELLED'],
        'ORDERED': ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
        'SCHEDULED': ['IN_PROGRESS', 'CANCELLED'],
        'IN_PROGRESS': ['COMPLETED'],
        'COMPLETED': ['REPORTED'],
        'REPORTED': [],
        'CANCELLED': [],
    }

    # Identity - format: RAD-YYYYMMDD-XXXX
    order_number = models.CharField(max_length=30, unique=True, editable=False)

    # Relationships
    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT)
    encounter = models.ForeignKey('encounters.Encounter', on_delete=models.PROTECT)
    ordered_by = models.ForeignKey(User, on_delete=models.PROTECT)

    # Order details
    priority = models.CharField(max_length=20, choices=PRIORITY_LEVELS, default='ROUTINE')
    clinical_indication = models.TextField()
    relevant_clinical_history = models.TextField(blank=True)

    # Status tracking
    status = models.CharField(max_length=30, choices=ORDER_STATUS, default='DRAFT')
    status_changed_at = models.DateTimeField(auto_now=True)

    # Scheduling
    scheduled_datetime = models.DateTimeField(null=True, blank=True)
    scheduled_room = models.CharField(max_length=50, blank=True)

    # DICOM/PACS
    accession_number = models.CharField(max_length=50, blank=True)
    study_instance_uid = models.CharField(max_length=128, blank=True)

    # Billing
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_paid = models.BooleanField(default=False)

    # Timestamps
    ordered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
```

### 3. ImagingOrderItem

```python
class ImagingOrderItem(models.Model):
    """Individual imaging procedure within an order."""

    LATERALITY_CHOICES = [
        ('NA', 'Not Applicable'),
        ('LEFT', 'Left'),
        ('RIGHT', 'Right'),
        ('BILATERAL', 'Bilateral'),
    ]

    order = models.ForeignKey(ImagingOrder, on_delete=models.CASCADE, related_name='items')
    procedure = models.ForeignKey(ImagingProcedure, on_delete=models.PROTECT)
    laterality = models.CharField(max_length=20, choices=LATERALITY_CHOICES, default='NA')
    specific_instructions = models.TextField(blank=True)
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
```

### 4. DICOM Models

```python
class DICOMStudy(models.Model):
    """DICOM Study metadata (collection of imaging series)."""

    imaging_order = models.ForeignKey(ImagingOrder, on_delete=models.SET_NULL, null=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT)

    # DICOM UIDs
    study_instance_uid = models.CharField(max_length=128, unique=True)
    accession_number = models.CharField(max_length=50)

    # Study metadata
    study_date = models.DateField()
    study_time = models.TimeField(null=True)
    study_description = models.CharField(max_length=200, blank=True)
    modality = models.CharField(max_length=20)

    # Storage
    storage_path = models.CharField(max_length=500)
    number_of_series = models.IntegerField(default=0)
    number_of_instances = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)


class DICOMSeries(models.Model):
    """DICOM Series within a study."""

    study = models.ForeignKey(DICOMStudy, on_delete=models.CASCADE, related_name='series')
    series_instance_uid = models.CharField(max_length=128, unique=True)
    series_number = models.IntegerField()
    series_description = models.CharField(max_length=200, blank=True)
    modality = models.CharField(max_length=20)
    body_part_examined = models.CharField(max_length=50, blank=True)
    number_of_instances = models.IntegerField(default=0)


class DICOMInstance(models.Model):
    """Individual DICOM image/instance."""

    series = models.ForeignKey(DICOMSeries, on_delete=models.CASCADE, related_name='instances')
    sop_instance_uid = models.CharField(max_length=128, unique=True)
    instance_number = models.IntegerField()
    file_path = models.CharField(max_length=500)
    file_size = models.BigIntegerField()
    rows = models.IntegerField(null=True)
    columns = models.IntegerField(null=True)
    bits_allocated = models.IntegerField(null=True)
```

### 5. RadiologyReport

```python
class RadiologyReport(models.Model):
    """Radiology report for an imaging study."""

    REPORT_STATUS = [
        ('DRAFT', 'Draft'),
        ('PRELIMINARY', 'Preliminary'),
        ('FINAL', 'Final'),
        ('AMENDED', 'Amended'),
    ]

    imaging_order = models.OneToOneField(ImagingOrder, on_delete=models.PROTECT)
    study = models.ForeignKey(DICOMStudy, on_delete=models.SET_NULL, null=True)

    # Report content
    technique = models.TextField(blank=True)
    findings = models.TextField()
    impression = models.TextField()
    recommendations = models.TextField(blank=True)

    # Critical findings
    is_critical = models.BooleanField(default=False)
    critical_finding_communicated = models.BooleanField(default=False)
    critical_finding_communicated_to = models.CharField(max_length=100, blank=True)
    critical_finding_communicated_at = models.DateTimeField(null=True)

    # Status
    status = models.CharField(max_length=20, choices=REPORT_STATUS, default='DRAFT')

    # Reporting
    reported_by = models.ForeignKey(User, on_delete=models.PROTECT)
    signed_at = models.DateTimeField(null=True)

    # Amendments
    amendment_reason = models.TextField(blank=True)
    amended_at = models.DateTimeField(null=True)
    amended_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='amended_reports')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

---

## API Endpoints

### Imaging Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/imaging/orders/` | List imaging orders (paginated, filterable) |
| POST | `/api/imaging/orders/` | Create new imaging order |
| GET | `/api/imaging/orders/{id}/` | Get order details |
| PATCH | `/api/imaging/orders/{id}/` | Update order |
| POST | `/api/imaging/orders/{id}/submit/` | Submit order (DRAFT → ORDERED) |
| POST | `/api/imaging/orders/{id}/schedule/` | Schedule order (optionally links to scheduling.Appointment) |
| POST | `/api/imaging/orders/{id}/start/` | Start imaging (→ IN_PROGRESS) |
| POST | `/api/imaging/orders/{id}/complete/` | Mark imaging complete |
| POST | `/api/imaging/orders/{id}/cancel/` | Cancel order |

### Imaging Scheduling Resources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/imaging/resources/` | List radiology resources (rooms/scanners) |
| GET | `/api/imaging/resources/{id}/` | Get resource details |
| GET | `/api/imaging/resources/{id}/availability/` | Get slots for specific date |
| GET | `/api/imaging/resources/{id}/availability/weekly/` | Get weekly availability |
| GET | `/api/imaging/resources/{id}/availability/check/` | Check specific slot |
| GET | `/api/imaging/calendar/` | Department-wide calendar view |

### Imaging Catalog

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/imaging/procedures/` | List procedures (filterable by modality) |
| GET | `/api/imaging/procedures/{id}/` | Get procedure details |
| POST | `/api/imaging/procedures/` | Create procedure (admin) |
| PATCH | `/api/imaging/procedures/{id}/` | Update procedure (admin) |

### DICOM Studies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/imaging/studies/` | List DICOM studies |
| GET | `/api/imaging/studies/{uid}/` | Get study metadata |
| POST | `/api/imaging/studies/upload/` | Upload DICOM files |
| GET | `/api/imaging/studies/{uid}/series/` | List series in study |
| GET | `/api/imaging/studies/{uid}/instances/` | List all instances |
| GET | `/api/imaging/dicom/{instance_uid}/` | Get DICOM file (WADO) |

### Radiology Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/imaging/reports/` | List reports |
| POST | `/api/imaging/reports/` | Create report draft |
| GET | `/api/imaging/reports/{id}/` | Get report |
| PATCH | `/api/imaging/reports/{id}/` | Update report |
| POST | `/api/imaging/reports/{id}/sign/` | Sign and finalize report |
| POST | `/api/imaging/reports/{id}/amend/` | Amend signed report |
| GET | `/api/imaging/reports/{id}/pdf/` | Download PDF report |

---

## Implementation Phases

### Phase A: Foundation (2-3 weeks) ✅ COMPLETED

> **Completed**: February 6, 2026
> **Tests**: 124 passing (71 model + 53 API)
> **Coverage**: 95-100% on imaging app

**Sprint A.1: Backend Models & Catalog** (Week 1) ✅

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| A.1.1 | Create Django imaging app | High | - | ✅ Done |
| A.1.2 | Implement ImagingProcedure model | High | 15 tests | ✅ Done |
| A.1.3 | Implement ImagingOrder model | High | 20 tests | ✅ Done |
| A.1.4 | Implement ImagingOrderItem model | High | 12 tests | ✅ Done |
| A.1.5 | Create order number generator | Medium | 5 tests | ✅ Done |
| A.1.6 | Implement status transition logic | High | 15 tests | ✅ Done |
| A.1.7 | Add Django admin registrations | Low | - | ✅ Done |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase A.1 Dependencies                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── patients.Patient model (exists ✅)                         │
│  ├── encounters.Encounter model (exists ✅)                     │
│  └── auth.User model (exists ✅)                                │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── A.1.2 ImagingProcedure ──▶ A.1.4 ImagingOrderItem         │
│  └── A.1.3 ImagingOrder ──▶ A.1.4 ImagingOrderItem             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Sprint A.2: API Endpoints & SHA Integration** (Week 2-3) ✅

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| A.2.1 | Implement serializers | High | 20 tests | ✅ Done |
| A.2.2 | Implement ViewSets (CRUD) | High | 30 tests | ✅ Done |
| A.2.3 | Add order workflow actions | High | 15 tests | ✅ Done |
| A.2.4 | Integrate with SHA billing | Medium | 10 tests | ⏸️ Deferred to Phase B |
| A.2.5 | Create imaging catalog seeder | Medium | 5 tests | ✅ Done |
| A.2.6 | Add audit logging | High | 8 tests | ✅ Done |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase A.2 Dependencies                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PREREQUISITE:                                                  │
│  └── Phase A.1 complete ✅                                      │
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── billing.Invoice model (exists ✅)                          │
│  ├── core.AuditLog model (exists ✅)                            │
│  └── DHA SHA integration services (exists ✅)                   │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── A.2.1 Serializers ──▶ A.2.2 ViewSets                      │
│  └── A.2.2 ViewSets ──▶ A.2.3 Workflow actions                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria / Exit Checklist - Phase A

- [x] **Models**
  - [x] ImagingProcedure model with all fields and choices
  - [x] ImagingOrder model with status transitions
  - [x] ImagingOrderItem model with laterality
  - [x] All models registered in Django admin
  - [x] Migrations created and applied

- [x] **API**
  - [x] Full CRUD for imaging orders
  - [x] Order workflow actions (submit, schedule, start, complete, cancel)
  - [x] Procedure catalog endpoints
  - [x] Pagination and filtering working
  - [x] Authentication required on all endpoints

- [x] **Business Logic**
  - [x] Order number auto-generation (RAD-YYYYMMDD-XXXX)
  - [x] Status transition validation
  - [x] Total cost calculation from items
  - [x] Audit logging for all CRUD operations

- [x] **Tests**
  - [x] ≥80% coverage on imaging app (achieved: 95-100%)
  - [x] All status transition scenarios tested
  - [x] Validation error cases tested
  - [x] 100+ tests passing (achieved: 124 tests)

- [x] **Data**
  - [x] Imaging catalog seeded with common Kenya procedures (20 procedures)
  - [x] SHA intervention codes mapped

---

### Phase B: Frontend Order Management (2-3 weeks) ✅ COMPLETED

**Sprint B.1: Orders UI** (Week 1-2)

#### Tasks

| # | Task | Priority |
|---|------|----------|
| B.1.1 | Create TypeScript types (`lib/types/imaging.ts`) | ✅ Done |
| B.1.2 | Create Zod schemas (`lib/schemas/imaging.schema.ts`) | ✅ Done |
| B.1.3 | Implement API client (`lib/api/imaging.ts`) | ✅ Done |
| B.1.4 | Build orders list page with DataTable | ✅ Done |
| B.1.5 | Build order creation form | ✅ Done |
| B.1.6 | Build order detail view | ✅ Done |
| B.1.7 | Add order status badge component | ✅ Done |

**Sprint B.2: Worklist & Integration** (Week 2-3)

#### Tasks

| # | Task | Priority |
|---|------|----------|
| B.2.1 | Build radiologist/tech worklist page | ✅ Done |
| B.2.2 | Integrate order creation with encounters | ✅ Done |
| B.2.3 | Add scheduling calendar view (backend) | ✅ Done |
| B.2.4 | Implement order status updates | ✅ Done |
| B.2.5 | Add procedure search/autocomplete | ✅ Done |
| B.2.6 | Write Jest unit tests | ✅ Done (136 tests) |
| B.2.7 | Write Playwright E2E tests | ✅ Done |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase B Dependencies                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PREREQUISITE:                                                  │
│  └── Phase A complete (backend API ready) ✅                    │
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── web-app/lib/api/client.ts (exists ✅)                      │
│  ├── web-app/components/ui/* (exists ✅)                        │
│  ├── web-app/components/shared/data-table.tsx (exists ✅)       │
│  └── encounters module integration point (exists ✅)            │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── B.1.1 Types ──▶ B.1.2 Schemas ──▶ B.1.3 API client ✅     │
│  ├── B.1.3 API client ──▶ B.1.4-B.1.6 UI pages ✅              │
│  └── B.1.* ──▶ B.2.* (Sprint B.2 depends on B.1) ✅            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria / Exit Checklist - Phase B

- [x] **Pages**
  - [x] Imaging orders list page with filtering
  - [x] Order creation form (from encounter context)
  - [x] Order detail page with status timeline
  - [x] Radiologist/technologist worklist
  - [x] Procedure catalog browser

- [x] **Components**
  - [x] ImagingOrderForm with validation
  - [x] OrderStatusBadge with colors
  - [x] ProcedureCombobox with search
  - [x] SchedulingCalendar frontend view with resource availability, date navigation, and modality filtering

- [x] **Integration**
  - [x] Order button in encounter view
  - [x] Order list in patient timeline (via encounter)
  - [ ] Billing integration for paid status - Deferred

- [x] **API Validation**
  - [x] Zod schemas for all responses
  - [x] parseResponse() used in all API calls
  - [x] Error handling with toast notifications

- [x] **Tests**
  - [x] Jest unit tests for components (166 tests passing - includes 30 SchedulingCalendar tests)
  - [x] Playwright E2E tests for order workflow
  - [x] Playwright E2E tests for scheduling calendar (17 tests)

---

### Phase C: DICOM Integration (3-4 weeks) — Sprint C.1 & C.2 ✅ COMPLETED

> **Sprint C.1-C.2 Completed**: February 7, 2026
> **Tests**: 114 passing (41 model + 37 service + 36 API)
> **New dependencies**: pydicom ^3.0.1, pynetdicom ^3.0.4, numpy ^2.4.2

**Sprint C.1: DICOM Backend** (Week 1-2) ✅

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| C.1.1 | Add pydicom dependency | High | - | ✅ Done |
| C.1.2 | Implement DICOMStudy model | High | 15 tests | ✅ Done |
| C.1.3 | Implement DICOMSeries model | High | 10 tests | ✅ Done |
| C.1.4 | Implement DICOMInstance model | High | 10 tests | ✅ Done |
| C.1.5 | Create DICOM parsing service | High | 20 tests | ✅ Done |
| C.1.6 | Create PACS storage service | High | 15 tests | ✅ Done |
| C.1.7 | Implement DICOM upload endpoint | High | 11 tests | ✅ Done |

**Sprint C.2: DICOM API & WADO** (Week 2-3) ✅

#### Tasks

| # | Task | Priority | TDD Tests | Status |
|---|------|----------|-----------|--------|
| C.2.1 | Implement study list API | High | 10 tests | ✅ Done |
| C.2.2 | Implement WADO-RS lite endpoint | High | 6 tests | ✅ Done |
| C.2.3 | Add thumbnail generation | Medium | 7 tests | ✅ Done |
| C.2.4 | Link DICOM studies to orders | High | 4 tests | ✅ Done |
| C.2.5 | Implement study deletion cleanup | Medium | 5 tests | ✅ Done |

**Sprint C.3: DICOM Viewer** (Week 3-4) ✅

#### Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| C.3.1 | Add Cornerstone.js dependencies | High | ✅ Done |
| C.3.2 | Build DICOMViewer component | High | ✅ Done |
| C.3.3 | Implement image loading/rendering | High | ✅ Done |
| C.3.4 | Add basic tools (zoom, pan, window/level) | High | ✅ Done |
| C.3.5 | Add measurement tools (ruler, angle) | Medium | ✅ Done |
| C.3.6 | Build study browser sidebar | Medium | ✅ Done |
| C.3.7 | Write E2E tests for viewer | High | ✅ Done |
| C.3.8 | Backend frame rendering endpoint (PNG) | Medium | ✅ Done |

#### Implementation Details (Sprint C.3)

**Frontend Components:**
- `components/imaging/dicom/DICOMViewer.tsx` — Main viewer with Cornerstone.js
- `components/imaging/dicom/DICOMViewerToolbar.tsx` — Toolbar with zoom, pan, W/L, measurements
- `components/imaging/dicom/DICOMSeriesPanel.tsx` — Series thumbnail sidebar
- `components/imaging/dicom/useCornerstoneCore.ts` — React hook for Cornerstone initialization
- `app/(dashboard)/imaging/studies/page.tsx` — Studies list with filters
- `app/(dashboard)/imaging/studies/[studyUid]/page.tsx` — Study detail with viewer

**Backend Endpoint:**
- `GET /api/imaging/dicom/{sop_uid}/frame/` — Render DICOM as PNG
  - Query params: `size`, `frame`, `window_center`, `window_width`
  - 7 unit tests passing

**Dependencies (installed):**
- `@cornerstonejs/core` — Core rendering
- `@cornerstonejs/tools` — Annotation and measurement tools
- `@cornerstonejs/dicom-image-loader` — DICOM loading
- `dicom-parser` — JavaScript DICOM parsing

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase C Dependencies                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PREREQUISITE:                                                  │
│  └── Phase A complete (ImagingOrder model)                      │
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── pydicom >= 2.4.0 (Python DICOM library)                   │
│  ├── Pillow >= 10.0.0 (image processing)                       │
│  ├── cornerstone-core (JavaScript DICOM viewer)                │
│  ├── cornerstone-wado-image-loader (DICOM loading)             │
│  └── dicom-parser (JavaScript DICOM parsing)                   │
│                                                                 │
│  STORAGE DEPENDENCIES:                                          │
│  └── media/dicom/ directory with write permissions             │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── C.1.2-C.1.4 Models ──▶ C.1.5 Parsing service              │
│  ├── C.1.5 Parsing ──▶ C.1.6 Storage service                   │
│  ├── C.1.* ──▶ C.2.* (API depends on models/services)          │
│  └── C.2.* ──▶ C.3.* (Viewer depends on API)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria / Exit Checklist - Phase C

- [x] **DICOM Models** (Sprint C.1)
  - [x] DICOMStudy with all DICOM UIDs
  - [x] DICOMSeries linked to studies
  - [x] DICOMInstance with file references
  - [x] Proper cascading deletion
  - [x] Database indexes on UIDs, patient, modality, study_date
  - [x] Migrations created and applied

- [x] **DICOM Services** (Sprint C.1)
  - [x] Parse DICOM files and extract metadata (DICOMParsingService)
  - [x] Store files in organized PACS structure (PACSStorageService)
  - [x] Generate thumbnails for quick preview
  - [x] Handle common modalities (XR, US, CT, MRI, NM, MG, FL)
  - [x] DICOM modality code mapping (CR→XR, MR→MRI, DX→XR, etc.)
  - [x] Multi-frame DICOM support (ultrasound cine loops)
  - [x] CT windowing for thumbnails
  - [x] File validation with required tag checking
  - [x] Group files by study utility

- [x] **API** (Sprint C.2)
  - [x] DICOM upload endpoint (multipart) — POST `/api/imaging/studies/upload/`
  - [x] Study list with filtering (patient, modality, date range, order)
  - [x] Study detail with nested series — GET `/api/imaging/studies/{uid}/`
  - [x] Series list for study — GET `/api/imaging/studies/{uid}/series/`
  - [x] Instance list for study — GET `/api/imaging/studies/{uid}/instances/`
  - [x] WADO-RS lite for image retrieval — GET `/api/imaging/dicom/{sop_uid}/`
  - [x] Proper `application/dicom` content-type headers
  - [x] Content-Disposition header for file downloads
  - [x] Study deletion with PACS cleanup — DELETE `/api/imaging/studies/{uid}/`
  - [x] Audit logging for upload, retrieve, and delete

- [x] **Viewer** (Sprint C.3 — complete)
  - [x] Load and render DICOM images
  - [x] Zoom, pan, window/level tools
  - [x] Measurement tools (ruler, angle)
  - [x] Series/instance navigation
  - [x] Responsive design
  - [x] Backend PNG rendering fallback
  - [x] E2E tests for viewer pages

- [x] **Storage** (Sprint C.1-C.2)
  - [x] Files organized: `media/dicom/{study_uid}/{series_uid}/{sop_uid}.dcm`
  - [x] Cleanup on study deletion (PACS files + DB cascade)
  - [x] Storage usage tracking (`get_storage_stats()`)
  - [x] Copy and move modes for file storage
  - [x] Study/series/instance deletion

- [x] **Tests** (Sprint C.1-C.2)
  - [x] 114 DICOM-specific tests passing
  - [x] Synthetic DICOM test file utilities (`dicom_test_utils.py`)
  - [x] Test coverage for models, services, and API
  - [x] Multi-modality test coverage (XR, CT, US, MRI, NM, MG, FL)
  - [x] Edge cases: minimal DICOM, multi-frame, invalid files, missing tags

---

### Phase D: Radiology Reporting (2 weeks)

**Sprint D.1: Reporting Backend & Frontend** (Week 1-2)

#### Tasks

| # | Task | Priority | TDD Tests |
|---|------|----------|-----------|
| D.1.1 | Implement RadiologyReport model | High | 20 tests |
| D.1.2 | Create report API endpoints | High | 15 tests |
| D.1.3 | Implement report signing workflow | High | 12 tests |
| D.1.4 | Implement report amendment flow | High | 10 tests |
| D.1.5 | Create critical findings alert | High | 8 tests |
| D.1.6 | Build report editor component | High | - |
| D.1.7 | Build report viewer component | High | - |
| D.1.8 | Implement report PDF generation | Medium | 5 tests |
| D.1.9 | Add report templates by modality | Medium | 5 tests |
| D.1.10 | Write E2E tests for reporting | High | - |

#### Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase D Dependencies                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PREREQUISITE:                                                  │
│  ├── Phase A complete (ImagingOrder model)                      │
│  └── Phase C complete (DICOMStudy for linking)                  │
│                                                                 │
│  EXTERNAL DEPENDENCIES:                                         │
│  ├── weasyprint or reportlab (PDF generation)                  │
│  └── Rich text editor (TipTap or Quill)                        │
│                                                                 │
│  OPTIONAL DEPENDENCIES:                                         │
│  └── Voice dictation API (Web Speech API or external)          │
│                                                                 │
│  INTERNAL DEPENDENCIES:                                         │
│  ├── D.1.1 Model ──▶ D.1.2 API ──▶ D.1.3-D.1.5 Workflows       │
│  └── D.1.2 API ──▶ D.1.6-D.1.7 UI components                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria / Exit Checklist - Phase D

- [ ] **Report Model**
  - [ ] RadiologyReport with all fields
  - [ ] Report status workflow (DRAFT → PRELIMINARY → FINAL)
  - [ ] Amendment tracking
  - [ ] Critical findings flagging

- [ ] **Reporting Workflow**
  - [ ] Create draft report from completed order
  - [ ] Save/auto-save drafts
  - [ ] Sign and finalize reports
  - [ ] Amend finalized reports with reason
  - [ ] Critical findings communication tracking

- [ ] **Report UI**
  - [ ] Rich text editor for findings/impression
  - [ ] Report templates by modality
  - [ ] Side-by-side viewer + editor layout
  - [ ] Report preview before signing

- [ ] **Critical Findings**
  - [ ] Alert banner for critical findings
  - [ ] Communication tracking (who, when)
  - [ ] Audit trail for notifications

- [ ] **PDF Generation**
  - [ ] Professional report layout
  - [ ] Facility letterhead
  - [ ] Digital signature indication
  - [ ] Download/print functionality

- [ ] **Tests**
  - [ ] Report workflow E2E tests
  - [ ] Amendment scenarios tested
  - [ ] PDF generation tested

---

## Technical Decisions

### DICOM Viewer Selection

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Cornerstone.js** | Lightweight, open source, good docs | Less features than OHIF | ✅ **Use for Phase C** |
| **OHIF Viewer** | Full-featured, production-ready | Heavy bundle, complex setup | Phase 4+ consideration |
| **DWV** | Simple, embeddable | Limited features | Not recommended |

**Decision**: Start with **Cornerstone.js** for its balance of features and simplicity. Plan migration path to OHIF for advanced use cases.

### PACS Storage Strategy

| Phase | Strategy | Details |
|-------|----------|---------|
| C (MVP) | Local filesystem | `media/dicom/{study_uid}/{series_uid}/` |
| Phase 4 | Object storage | MinIO or AWS S3 |
| Future | Orthanc | Full PACS server integration |

### Key Dependencies

**Backend (pyproject.toml)**
```toml
[tool.poetry.dependencies]
pydicom = "^3.0.1"        # DICOM file parsing
pynetdicom = "^3.0.4"     # DICOM networking (future C-STORE/C-FIND)
numpy = "^2.4.2"          # Pixel data processing
Pillow = "^10.0.0"        # Image processing / thumbnails
weasyprint = "^60.0"      # PDF generation (or reportlab)
```

**Frontend (package.json)**
```json
{
  "dependencies": {
    "cornerstone-core": "^2.6.0",
    "cornerstone-wado-image-loader": "^4.4.0",
    "dicom-parser": "^1.8.0",
    "@tiptap/react": "^2.0.0"
  }
}
```

---

## Test Strategy

Following TDD principles established in the project:

| Category | Target Coverage | Estimated Tests |
|----------|----------------|-----------------|
| Models | 100% | 80+ |
| Serializers | 100% | 40+ |
| Views/API | 100% | 60+ |
| Services (DICOM, PACS) | 90%+ | 50+ |
| Frontend Components | 80%+ | 50+ |
| E2E Flows | Critical paths | 20+ |
| **Total** | **≥80%** | **300+** |

### Test Data Requirements

- Sample DICOM files for each modality (XR, US, CT, MRI)
- Anonymized test datasets
- Multi-series study examples
- Edge cases (corrupted files, missing metadata)

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| DICOM complexity | High | Medium | Start with common modalities (XR, US); defer edge cases |
| Large file storage | Medium | High | Implement cleanup policies; use compression; plan cloud migration |
| Viewer performance | Medium | Medium | Lazy loading; web workers; image caching |
| Device integration | High | Low | Defer DICOM Modality Worklist to Phase 4; support manual upload |
| Radiologist adoption | Medium | Low | Involve radiologists in UI design; familiar reporting workflow |

---

## Timeline Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Implementation Timeline                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Week   1    2    3    4    5    6    7    8    9   10   11   12           │
│        ┌─────────────┐                                                     │
│        │   Phase A   │ Backend Foundation ✅ DONE                          │
│        │  (2-3 wks)  │ Models, API, SHA                                   │
│        └──────┬──────┘                                                     │
│               │                                                            │
│               └───────┬─────────────┐                                      │
│                       │   Phase B   │ Frontend Orders ✅ DONE              │
│                       │  (2-3 wks)  │ UI, Worklist, Integration           │
│                       └──────┬──────┘                                      │
│                              │                                             │
│                              └───────┬───────────────────┐                 │
│                                      │     Phase C       │ DICOM          │
│                                      │    (3-4 wks)      │ Parse, Store,  │
│                                      │                   │ View           │
│                                      └───────┬───────────┘                 │
│                                              │                             │
│                                              └───────┬─────────┐           │
│                                                      │ Phase D │ Reports  │
│                                                      │ (2 wks) │          │
│                                                      └─────────┘           │
│                                                                            │
│  ════════════════════════════════════════════════════════════════════════ │
│  Total Duration: 9-12 weeks                                                │
│  Completed: Phase A (backend), Phase B (frontend + scheduling calendar),   │
│             Phase C Sprint C.1-C.2 (DICOM backend)                         │
│  Tests Passing: 421+ (backend 238 + frontend 166 + E2E 17)                 │
│  Target Coverage: ≥80%                                                     │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Common Kenya Imaging Procedures (Seed Data)

| Code | Name | Modality | Body Region | SHA Claimable |
|------|------|----------|-------------|---------------|
| XR-CHEST-PA | Chest X-ray (PA) | XR | Chest | Yes |
| XR-CHEST-LAT | Chest X-ray (Lateral) | XR | Chest | Yes |
| XR-SPINE-C | Cervical Spine X-ray | XR | Spine | Yes |
| XR-SPINE-L | Lumbar Spine X-ray | XR | Spine | Yes |
| XR-PELVIS | Pelvic X-ray | XR | Pelvis | Yes |
| XR-HAND | Hand X-ray | XR | Upper Extremity | Yes |
| XR-FOOT | Foot X-ray | XR | Lower Extremity | Yes |
| US-ABD | Abdominal Ultrasound | US | Abdomen | Yes |
| US-OB | Obstetric Ultrasound | US | Pelvis | Yes |
| US-PELV | Pelvic Ultrasound | US | Pelvis | Yes |
| US-THYROID | Thyroid Ultrasound | US | Neck | Yes |
| CT-HEAD | CT Head (Non-contrast) | CT | Head | Yes |
| CT-HEAD-C | CT Head (Contrast) | CT | Head | Yes |
| CT-CHEST | CT Chest | CT | Chest | Yes |
| CT-ABD | CT Abdomen | CT | Abdomen | Yes |
| MRI-BRAIN | MRI Brain | MRI | Head | Limited |
| MRI-SPINE | MRI Spine | MRI | Spine | Limited |

---

## References

- [DICOM Standard](https://www.dicomstandard.org/)
- [RadLex Playbook](http://playbook.radlex.org/)
- [Cornerstone.js Documentation](https://cornerstonejs.org/)
- [pydicom Documentation](https://pydicom.github.io/)
- [Kenya SHA Intervention Codes](https://sha.go.ke/)
- [Vitora HMIS ROADMAP.md](../ROADMAP.md)
- [Laboratory Module Implementation](../backend/hmis/apps/laboratory/) (reference pattern)

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-06 | Engineering Team | Initial plan |
| 1.1 | 2026-02-06 | Engineering Team | Phase A backend completed (124 tests) |
| 1.2 | 2026-02-06 | Engineering Team | Phase B frontend completed (136 tests) |
| 1.3 | 2026-02-07 | Engineering Team | SchedulingCalendar frontend view completed (30 unit + 17 E2E tests) |
| 1.4 | 2026-02-07 | Engineering Team | Phase C Sprint C.1-C.2 DICOM backend completed (114 tests) — models, parsing service, PACS storage, upload/list/retrieve/delete APIs, thumbnail generation |
