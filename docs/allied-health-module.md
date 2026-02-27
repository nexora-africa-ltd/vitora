# Allied Health Module - Implementation Guide

> **Document Purpose**: Comprehensive documentation for the Allied Health module covering architecture, integration patterns, UI specifications, and implementation roadmap.

**Version**: 1.2
**Created**: February 26, 2026
**Updated**: February 27, 2026
**Author**: Engineering Team, Nexora Africa Ltd
**Status**: Backend Complete ✅ | Frontend Complete ✅

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Module Architecture](#2-module-architecture)
3. [Backend Implementation (Complete)](#3-backend-implementation-complete)
4. [Integration with Existing Flow](#4-integration-with-existing-flow)
5. [API Reference](#5-api-reference)
6. [Frontend Implementation (Complete)](#6-frontend-implementation-complete)
7. [UI/UX Specifications](#7-uiux-specifications)
8. [Testing Strategy](#8-testing-strategy)
9. [Deployment Checklist](#9-deployment-checklist)

---

## 1. Executive Summary

### 1.1 Overview

The Allied Health module extends Vitora HMIS with dedicated workflows for five professional disciplines:

| Module | Backend Status | Tests | Frontend Status |
|--------|---------------|-------|-----------------|
| **Physiotherapy** | ✅ Complete | 37 unit tests | ✅ Complete |
| **Nutrition/Dietetics** | ✅ Complete | 27 unit tests | ✅ Complete |
| **Occupational Therapy** | ✅ Complete | 41 unit tests | ✅ Complete |
| **Social Work** | ✅ Complete | 41 unit tests | ✅ Complete |
| **Counselling** | ✅ Complete | 40 unit tests | ✅ Complete |

**Total Backend Tests**: 186 unit tests
**Total Frontend Tests**: 6 test files (contract, hooks, components)

### 1.2 Key Features

- **Referral-based workflow**: Orders originate from clinical encounters
- **Encounter integration**: Allied Health tab on encounter detail + accordion section in clinical flow
- **Session-based treatment**: Track individual sessions with progress notes
- **Clinic queue integration**: Auto-routing to appropriate clinic on approval
- **Billing integration**: Auto-generate invoice items on session completion
- **SHA compliance**: SHA intervention codes for Kenya claims
- **Privacy controls**: Enhanced privacy for sensitive cases (GBV, HIV, Mental Health)
- **Vitals auto-population**: Nutrition form pre-fills weight/height from triage vitals
- **Diagnosis context**: Encounter diagnoses shown in nutrition referral form
- **Audit trail**: Full audit logging per Kenya DPA 2019

### 1.3 How Allied Health Fits in Patient Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PATIENT FLOW WITH ALLIED HEALTH                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. CHECK-IN        2. TRIAGE          3. CONSULTATION      4. ALLIED HEALTH   │
│  ┌─────────┐       ┌─────────┐        ┌─────────┐          ┌─────────┐         │
│  │Reception│ ───▶  │  Nurse  │  ───▶  │ Doctor  │  ───▶    │Therapist│         │
│  │  Desk   │       │ Station │        │  Room   │          │  Room   │         │
│  └─────────┘       └─────────┘        └─────────┘          └─────────┘         │
│       │                 │                  │                    │              │
│   MRN Check         Vitals            Diagnosis            Session             │
│   Queue             Triage           CREATES ORDER       Delivered             │
│   Assigned          Priority                                                   │
│                                           ▼                    ▼               │
│                                    ┌─────────────┐      ┌─────────────┐        │
│                                    │  Order with │      │  Progress   │        │
│                                    │  referral   │      │  tracked    │        │
│                                    │  reason     │      │  per session│        │
│                                    └─────────────┘      └─────────────┘        │
│                                                                                │
│  ─────────────────────────────────────────────────────────────────────────────▶│
│                                                                                │
│  5. BILLING          6. FOLLOW-UP                                              │
│  ┌─────────┐        ┌─────────┐                                                │
│  │ Auto    │  ───▶  │ Patient │                                                │
│  │ Invoice │        │ Returns │                                                │
│  └─────────┘        └─────────┘                                                │
│       │                  │                                                     │
│  Session fee         Next session                                              │
│  added auto          scheduled                                                 │
│                                                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Architecture

### 2.1 Backend App Structure

Each Allied Health module follows a consistent structure:

```
backend/hmis/apps/{module}/
├── __init__.py
├── admin.py           # Django admin configuration
├── apps.py            # App configuration
├── migrations/
│   └── 0001_initial.py
├── models.py          # Domain models (Order, Session, TreatmentType)
├── serializers.py     # DRF serializers with validation
├── signals.py         # Auto-actions (billing, privacy, clinic routing)
├── urls.py            # URL routing
└── views.py           # ViewSets with custom actions
```

### 2.2 Common Model Pattern

All Allied Health modules share a similar three-tier model structure:

```python
# Tier 1: Treatment Type Catalog
class TreatmentType(models.Model):
    code = models.CharField(unique=True)          # e.g., "PT-MSK-001"
    name = models.CharField()
    category = models.CharField(choices=CATEGORY_CHOICES)
    typical_duration_minutes = models.PositiveIntegerField()
    cost_per_session = models.DecimalField()
    sha_claimable = models.BooleanField()
    sha_intervention_code = models.CharField()
    is_active = models.BooleanField()

# Tier 2: Referral/Order
class Order(models.Model):
    order_number = models.CharField(unique=True)  # Auto-generated
    patient = models.ForeignKey(Patient)
    encounter = models.ForeignKey(Encounter)      # Origin encounter
    treatment_type = models.ForeignKey(TreatmentType)
    ordered_by = models.ForeignKey(User)          # Ordering clinician
    assigned_therapist = models.ForeignKey(User)  # Assigned provider
    status = models.CharField(choices=STATUS_CHOICES)
    clinical_notes = models.TextField()           # Referral reason
    priority = models.CharField()
    clinic_visit = models.ForeignKey(ClinicVisit) # Queue integration
    is_sensitive = models.BooleanField()          # Privacy flag

# Tier 3: Session
class Session(models.Model):
    session_number = models.CharField(unique=True)
    order = models.ForeignKey(Order)
    session_date = models.DateField()
    duration_minutes = models.PositiveIntegerField()
    progress_notes = models.TextField()
    outcome = models.CharField(choices=OUTCOME_CHOICES)
    conducted_by = models.ForeignKey(User)
    invoice_item = models.ForeignKey(InvoiceItem)  # Billing link
```

### 2.3 Status Flow

All Allied Health orders follow a standardized state machine:

```
                                    ┌──────────────┐
                                    │    DRAFT     │
                                    └──────┬───────┘
                                           │ submit
                                           ▼
                                    ┌──────────────┐
         ┌──────────────────────────│   PENDING    │──────────────────────────┐
         │ cancel                   └──────┬───────┘                          │ reject
         │                                 │ approve                          │
         ▼                                 ▼                                  ▼
┌──────────────┐                   ┌──────────────┐                  ┌──────────────┐
│  CANCELLED   │                   │   APPROVED   │                  │   REJECTED   │
└──────────────┘                   └──────┬───────┘                  └──────────────┘
                                          │ assign_therapist
                                          ▼
                                   ┌──────────────┐
         ┌─────────────────────────│   ASSIGNED   │─────────────────────────┐
         │ cancel                  └──────┬───────┘                         │ put_on_hold
         │                                │ start                           │
         ▼                                ▼                                 ▼
┌──────────────┐                   ┌──────────────┐                 ┌──────────────┐
│  CANCELLED   │                   │ IN_PROGRESS  │                 │   ON_HOLD    │
└──────────────┘                   └──────┬───────┘                 └──────────────┘
                                          │ complete
                                          ▼
                                   ┌──────────────┐
                                   │  COMPLETED   │
                                   └──────────────┘
```

---

## 3. Backend Implementation (Complete)

### 3.1 Physiotherapy Module

**Location**: `backend/hmis/apps/physiotherapy/`

**Models**:
- `PhysiotherapyTreatmentType` - Treatment catalog with 12 categories (Musculoskeletal, Neurological, Cardiorespiratory, etc.)
- `PhysiotherapyOrder` - Referral with order number format `PHYSIO-YYYYMMDD-XXXX`
- `PhysiotherapySession` - Session with FIM-style functional improvement tracking

**Key Features**:
- Equipment tracking (requires_equipment, equipment_needed)
- Contraindications and precautions documentation
- Recommended sessions and frequency per treatment type
- Session outcome tracking (IMPROVED, MAINTAINED, DECLINED, etc.)

### 3.2 Nutrition/Dietetics Module

**Location**: `backend/hmis/apps/nutrition/`

**Models**:
- `NutritionConsultation` - Assessment with order number format `NUT-YYYYMMDD-XXXX`
- `DietPlan` - Meal plans with number format `DIET-YYYYMMDD-XXXX`

**Key Features**:
- **Auto-calculated fields**:
  - BMI (weight / height²)
  - BMI classification (Underweight to Obese Class III)
  - Waist-hip ratio
  - Basal Metabolic Rate (BMR) using Mifflin-St Jeor equation
  - Total Daily Energy Expenditure (TDEE)
  - Ideal body weight
- MUAC-based malnutrition screening (SAM/MAM detection)
- Anthropometric sync from Encounter vitals
- **Frontend auto-population**: When opened from an encounter, weight and height are pre-filled from triage vitals
- **Encounter diagnoses display**: Referring encounter's diagnoses shown as read-only context in the consultation form
- 16 referral reasons (Weight Management, Diabetes, Renal, etc.)

**API Custom Actions**:
- `sync_anthropometrics` - Pull latest vitals from patient encounters
- `update_status` - Change consultation status
- `activate/discontinue/put_on_hold` - Diet plan lifecycle

### 3.3 Occupational Therapy Module

**Location**: `backend/hmis/apps/occupational_therapy/`

**Models**:
- `OTTreatmentType` - Treatment catalog with 13 categories (ADL Training, Cognitive Rehab, Hand Therapy, etc.)
- `OccupationalTherapyOrder` - Referral with order number format `OT-YYYYMMDD-XXXX`
- `OTSession` - Session with functional independence tracking

**Key Features**:
- FIM-style independence levels (1-7 scale)
- ADL/cognitive/sensory activity tracking
- Assistive technology assessment support
- Home modification recommendations

### 3.4 Social Work Module

**Location**: `backend/hmis/apps/social_work/`

**Models**:
- `SocialWorkReferral` - Referral with number format `SW-YYYYMMDD-XXXX`
- `SocialWorkCase` - Case management with number format `SWC-YYYYMMDD-XXXX`
- `CaseNote` - Progress notes with contact tracking
- `SocialWorkIntervention` - Discrete intervention records

**Key Features**:
- **Enhanced Privacy Protection**:
  - Auto-sensitive flag for GBV, Child Abuse, Human Trafficking cases
  - `view_sensitive_sw_referral` permission required
  - `view_sensitive_sw_case` permission required
- 20 referral reasons (GBV, Child Protection, Housing, Refugee Support, etc.)
- External agency referral tracking
- Contact method documentation (phone, in-person, home visit)

### 3.5 Counselling Module

**Location**: `backend/hmis/apps/counselling/`

**Models**:
- `CounsellingType` - Type catalog with 15 categories (HIV, Mental Health, Family Planning, etc.)
- `CounsellingReferral` - Referral with number format `COUNS-YYYYMMDD-XXXX`
- `CounsellingSession` - Session with number format `CS-YYYYMMDD-XXXX`

**Key Features**:
- **Privacy for Sensitive Referrals**:
  - Auto-sensitive for HIV, Suicidal Ideation, GBV cases
  - `view_sensitive_counselling_referral` permission required
- `is_mental_health_related` property detection
- Follow-up scheduling with recommended next session date
- Session types align with Kenya clinical protocols

---

## 4. Integration with Existing Flow

### 4.1 Encounter Integration

Allied Health orders originate from clinical encounters. The integration has three touchpoints:

#### 4.1.1 Encounter Edit Page (Clinical Flow Accordion)

During consultation, the clinical flow accordion includes an **"Allied Health" (AH)** section as section #8:

```
Hx → HPI → Template → Dx → Labs → Img → Rx → AH
```

This section uses `EncounterAlliedHealthContent` to show existing allied health referrals and provide in-context referral buttons for all 5 modules. Located in:
- Accordion section: `components/encounters/clinical-flow-accordion.tsx`
- Content component: `components/encounters/encounter-allied-health-content.tsx`
- Referral buttons: `components/encounters/allied-health-referral-actions.tsx`

#### 4.1.2 Encounter Detail Page (Allied Health Tab)

The read-only encounter detail page (`/encounters/[id]`) includes an **"Allied Health"** tab that displays all referrals linked to the encounter with badge counts:

```
SOAP | Assessment | Dx | Treatment | Lab | Imaging | Rx | Allied Health (3) | Hx | Audit
```

The tab shows referral cards grouped by module (Physiotherapy, Nutrition, OT, Counselling, Social Work) with status and priority badges.

#### 4.1.3 Data Flow from Encounter to Allied Health

When a referral is created from an encounter:

```python
# When a doctor creates an order during consultation
PhysiotherapyOrder.objects.create(
    patient=encounter.patient,
    encounter=encounter,              # Links to originating encounter
    treatment_type=treatment_type,
    ordered_by=request.user,          # Ordering clinician
    clinical_notes="Post-op rehabilitation needed",
    priority="ROUTINE"
)
```

### 4.2 Clinic Queue Integration

On order approval, a `ClinicVisit` is automatically created to route the patient:

```python
# Signal in signals.py (already implemented)
@receiver(post_save, sender=PhysiotherapyOrder)
def create_clinic_visit_on_approval(sender, instance, **kwargs):
    if instance.status == 'APPROVED' and not instance.clinic_visit:
        # Find or create PHYSIO clinic
        clinic = Clinic.objects.get(clinic_type='PHYSIO')
        
        # Create clinic visit for queue routing
        visit = ClinicVisit.objects.create(
            patient=instance.patient,
            clinic=clinic,
            source='REFERRAL',
            status='WAITING',
            priority=instance.priority
        )
        instance.clinic_visit = visit
        instance.save()
```

**Clinic Type Mapping**:

| Module | Clinic Type | Clinic Name |
|--------|-------------|-------------|
| Physiotherapy | `PHYSIO` | Physiotherapy Clinic |
| Nutrition | `NUTRITION` | Nutrition Clinic |
| Occupational Therapy | `OT` | Occupational Therapy Clinic |
| Social Work | `SOCIAL_WORK` | Social Work |
| Counselling | `MENTAL_HEALTH` | Mental Health / Counselling |

### 4.3 Billing Integration

Sessions auto-generate invoice items via signals:

```python
# Signal in signals.py (already implemented)
@receiver(post_save, sender=PhysiotherapySession)
def create_invoice_item_on_completion(sender, instance, **kwargs):
    if instance.status == 'COMPLETED' and not instance.invoice_item:
        # Get or create invoice for patient
        invoice = Invoice.objects.get_or_create(
            patient=instance.order.patient,
            status='DRAFT'
        )[0]
        
        # Create invoice item
        item = InvoiceItem.objects.create(
            invoice=invoice,
            item_type='SERVICE',
            description=f"Physiotherapy: {instance.order.treatment_type.name}",
            unit_price=instance.order.treatment_type.cost_per_session,
            quantity=1,
            sha_claimable=instance.order.treatment_type.sha_claimable,
            sha_intervention_code=instance.order.treatment_type.sha_intervention_code
        )
        instance.invoice_item = item
        instance.save()
```

### 4.4 Audit Logging

All CRUD operations are logged per Kenya DPA 2019:

```python
# In views.py (already implemented)
def perform_create(self, serializer):
    instance = serializer.save(ordered_by=self.request.user)
    AuditLog.log(
        action='physio_order_create',
        user=self.request.user,
        resource_type='PhysiotherapyOrder',
        resource_id=instance.id,
        request=self.request
    )
```

### 4.5 Privacy Controls

Sensitive cases auto-set `is_sensitive=True`:

```python
# Physiotherapy - no auto-sensitive (physical rehab rarely sensitive)
# Nutrition - no auto-sensitive

# Social Work - auto-sensitive for GBV, abuse cases
SENSITIVE_REASONS = ["GBV", "CHILD_ABUSE", "CHILD_PROTECTION", "ELDER_ABUSE", "HUMAN_TRAFFICKING"]

# Counselling - auto-sensitive for HIV, suicidal, GBV
SENSITIVE_REASONS = ["HIV", "SUICIDAL_IDEATION", "GBV", "TRAUMA"]
```

---

## 5. API Reference

### 5.1 Physiotherapy API

**Base URL**: `/api/physiotherapy/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/treatment-types/` | GET | List treatment types (paginated) |
| `/treatment-types/{id}/` | GET | Get treatment type detail |
| `/orders/` | GET, POST | List/create orders |
| `/orders/{id}/` | GET, PATCH, DELETE | Order CRUD |
| `/orders/{id}/approve/` | POST | Approve order (creates ClinicVisit) |
| `/orders/{id}/assign_therapist/` | POST | Assign therapist |
| `/orders/{id}/generate_sessions/` | POST | Generate session slots |
| `/orders/{id}/start/` | POST | Start treatment |
| `/orders/{id}/complete/` | POST | Complete order |
| `/orders/{id}/cancel/` | POST | Cancel order |
| `/sessions/` | GET, POST | List/create sessions |
| `/sessions/{id}/` | GET, PATCH, DELETE | Session CRUD |
| `/sessions/{id}/start/` | POST | Start session |
| `/sessions/{id}/complete/` | POST | Complete session (triggers billing) |
| `/sessions/{id}/no_show/` | POST | Mark as no-show |
| `/sessions/{id}/reschedule/` | POST | Reschedule session |

### 5.2 Nutrition API

**Base URL**: `/api/nutrition/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/consultations/` | GET, POST | List/create consultations |
| `/consultations/{id}/` | GET, PATCH, DELETE | Consultation CRUD |
| `/consultations/{id}/update_status/` | POST | Change status |
| `/consultations/{id}/assign_dietitian/` | POST | Assign dietitian |
| `/consultations/{id}/sync_anthropometrics/` | POST | Pull latest vitals |
| `/consultations/{id}/complete/` | POST | Complete consultation |
| `/consultations/{id}/cancel/` | POST | Cancel consultation |
| `/diet-plans/` | GET, POST | List/create diet plans |
| `/diet-plans/{id}/` | GET, PATCH, DELETE | Diet plan CRUD |
| `/diet-plans/{id}/activate/` | POST | Activate plan |
| `/diet-plans/{id}/discontinue/` | POST | Discontinue plan |
| `/diet-plans/{id}/put_on_hold/` | POST | Put on hold |

### 5.3 Occupational Therapy API

**Base URL**: `/api/occupational-therapy/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/treatment-types/` | GET | List OT treatment types |
| `/orders/` | GET, POST | List/create orders |
| `/orders/{id}/approve/` | POST | Approve order |
| `/orders/{id}/assign_therapist/` | POST | Assign OT |
| `/orders/{id}/generate_sessions/` | POST | Generate sessions |
| `/sessions/` | GET, POST | List/create sessions |
| `/sessions/{id}/complete/` | POST | Complete session |

### 5.4 Social Work API

**Base URL**: `/api/social-work/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/referrals/` | GET, POST | List/create referrals |
| `/referrals/{id}/accept/` | POST | Accept referral |
| `/referrals/{id}/assign_worker/` | POST | Assign social worker |
| `/referrals/{id}/create_case/` | POST | Create case from referral |
| `/cases/` | GET, POST | List/create cases |
| `/cases/{id}/update_status/` | POST | Change case status |
| `/cases/{id}/close/` | POST | Close case |
| `/notes/` | GET, POST | List/create case notes |
| `/interventions/` | GET, POST | List/create interventions |
| `/interventions/{id}/start/` | POST | Start intervention |
| `/interventions/{id}/complete/` | POST | Complete intervention |

### 5.5 Counselling API

**Base URL**: `/api/counselling/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/types/` | GET | List counselling types |
| `/referrals/` | GET, POST | List/create referrals |
| `/referrals/{id}/accept/` | POST | Accept referral |
| `/referrals/{id}/assign_counsellor/` | POST | Assign counsellor |
| `/referrals/{id}/generate_sessions/` | POST | Generate sessions |
| `/sessions/` | GET, POST | List/create sessions |
| `/sessions/{id}/start/` | POST | Start session |
| `/sessions/{id}/complete/` | POST | Complete session |
| `/sessions/{id}/reschedule/` | POST | Reschedule session |
| `/sessions/{id}/no_show/` | POST | Mark as no-show |

---

## 6. Frontend Implementation (Complete)

### 6.1 Files Created

#### Types (lib/types/)

```
lib/types/allied-health.ts                    # Shared Allied Health types
lib/types/physiotherapy.ts                    # Physiotherapy-specific types
lib/types/nutrition.ts                        # Nutrition-specific types  
lib/types/occupational-therapy.ts             # OT-specific types
lib/types/social-work.ts                      # Social Work-specific types
lib/types/counselling.ts                      # Counselling-specific types
```

#### Zod Schemas (lib/schemas/)

```
lib/schemas/allied-health.schema.ts           # Shared schemas
lib/schemas/physiotherapy.schema.ts           # Physiotherapy validation
lib/schemas/nutrition.schema.ts               # Nutrition validation
lib/schemas/occupational-therapy.schema.ts    # OT validation
lib/schemas/social-work.schema.ts             # Social Work validation
lib/schemas/counselling.schema.ts             # Counselling validation
```

#### API Clients (lib/api/)

```
lib/api/physiotherapy.ts                      # Physiotherapy API client
lib/api/nutrition.ts                          # Nutrition API client
lib/api/occupational-therapy.ts               # OT API client
lib/api/social-work.ts                        # Social Work API client
lib/api/counselling.ts                        # Counselling API client
```

#### Hooks (lib/hooks/)

```
lib/hooks/use-allied-health.ts                # Dashboard hook
lib/hooks/use-physiotherapy.ts                # Physiotherapy CRUD hooks
lib/hooks/use-nutrition.ts                    # Nutrition CRUD hooks
lib/hooks/use-occupational-therapy.ts         # OT CRUD hooks
lib/hooks/use-social-work.ts                  # Social Work CRUD hooks
lib/hooks/use-counselling.ts                  # Counselling CRUD hooks
lib/hooks/use-encounter-allied-health.ts      # Encounter-scoped queries (all 5 modules)
```

The `use-encounter-allied-health.ts` hooks provide encounter-filtered queries:

```typescript
useEncounterPhysioOrders(encounterId)
useEncounterNutritionConsultations(encounterId)
useEncounterOTOrders(encounterId)
useEncounterCounsellingReferrals(encounterId)
useEncounterSWReferrals(encounterId)
```

These power both the encounter detail "Allied Health" tab and the clinical accordion section.

#### Pages (app/(dashboard)/)

```
app/(dashboard)/allied-health/
├── page.tsx                                  # Allied Health dashboard
├── physiotherapy/
│   ├── page.tsx                              # Orders list
│   ├── [id]/page.tsx                         # Order detail
│   ├── orders/new/page.tsx                   # New order
│   ├── sessions/page.tsx                     # Sessions list
│   └── treatment-types/page.tsx              # Treatment catalog
├── nutrition/
│   ├── page.tsx                              # Consultations list
│   ├── [id]/page.tsx                         # Consultation detail
│   ├── consultations/new/page.tsx            # New consultation
│   └── diet-plans/page.tsx                   # Diet plans
├── occupational-therapy/
│   ├── page.tsx                              # Orders list
│   ├── [id]/page.tsx                         # Order detail
│   ├── orders/new/page.tsx                   # New order
│   └── sessions/page.tsx                     # Sessions list
├── social-work/
│   ├── page.tsx                              # Referrals list
│   ├── [id]/page.tsx                         # Referral detail
│   ├── referrals/new/page.tsx                # New referral
│   ├── cases/page.tsx                        # Cases list
│   ├── cases/new/page.tsx                    # New case
│   └── cases/[id]/
│       ├── page.tsx                          # Case detail
│       ├── edit/page.tsx                     # Edit case
│       ├── notes/page.tsx                    # Notes list
│       ├── notes/new/page.tsx                # Add note
│       └── interventions/new/page.tsx        # Add intervention
└── counselling/
    ├── page.tsx                              # Referrals list
    ├── [id]/page.tsx                         # Referral detail
    ├── referrals/new/page.tsx                # New referral
    └── sessions/page.tsx                     # Sessions list
```

#### Components (components/allied-health/)

```
components/allied-health/
├── shared/
│   ├── order-status-badge.tsx                # Reusable status badge
│   ├── session-form.tsx                      # Generic session form
│   ├── session-list.tsx                      # Sessions list component
│   ├── treatment-type-select.tsx             # Treatment type dropdown
│   └── therapist-assignment-dialog.tsx       # Assign therapist modal
├── physiotherapy/
│   ├── physio-order-form.tsx
│   ├── physio-order-card.tsx
│   └── physio-session-form.tsx
├── nutrition/
│   ├── nutrition-consultation-form.tsx
│   ├── anthropometrics-display.tsx
│   ├── bmi-indicator.tsx
│   └── diet-plan-form.tsx
├── occupational-therapy/
│   ├── ot-order-form.tsx
│   ├── independence-scale.tsx                # FIM scale display
│   └── ot-session-form.tsx
├── social-work/
│   ├── sw-referral-form.tsx
│   ├── sw-referral-table.tsx
│   ├── sw-case-form.tsx
│   ├── sw-case-detail.tsx
│   ├── sw-case-table.tsx
│   ├── social-work-referral-form.tsx         # Referral with SensitiveCaseBanner
│   ├── case-note-form.tsx                    # Wired to cases/[id]/notes/new
│   ├── intervention-form.tsx                 # Wired to cases/[id]/interventions/new
│   └── sensitive-case-banner.tsx             # Used in case detail + referral form
└── counselling/
    ├── counselling-referral-form.tsx
    ├── counselling-session-form.tsx
    └── follow-up-scheduler.tsx
```

#### Encounter Integration Components (components/encounters/)

```
components/encounters/
├── encounter-allied-health-content.tsx       # Allied health referrals per encounter
├── allied-health-referral-actions.tsx        # Referral creation buttons (5 modules)
└── clinical-flow-accordion.tsx              # Includes AH as section #8
```

### 6.2 Navigation Updates

Update `lib/config/navigation.ts`:

```typescript
// Add to mainNavItems array
{
  label: 'Allied Health',
  icon: Users,           // or a more specific icon
  children: [
    { label: 'Dashboard', href: '/allied-health', icon: LayoutDashboard },
    { label: 'Physiotherapy', href: '/allied-health/physiotherapy', icon: Activity },
    { label: 'Nutrition', href: '/allied-health/nutrition', icon: Apple },
    { label: 'Occupational Therapy', href: '/allied-health/occupational-therapy', icon: Hand },
    { label: 'Social Work', href: '/allied-health/social-work', icon: Heart },
    { label: 'Counselling', href: '/allied-health/counselling', icon: MessageCircle },
  ],
},
```

### 6.3 Clinic Types Update

Add missing clinic types to `lib/schemas/clinic.schema.ts`:

```typescript
export const ClinicTypeSchema = z.enum([
  'GENERAL_OPD', 'FILTER_CLINIC', 'ANC', 'PNC', 'FP', 'CWC', 'IMMUNIZATION',
  'NUTRITION', 'DENTAL', 'EYE', 'ENT', 'SURGICAL', 'ORTHO', 'PHYSIO', 'DERM',
  'CCC', 'TB', 'DIABETIC', 'HYPERTENSION', 'MENTAL_HEALTH', 'ONCOLOGY',
  'DIALYSIS', 'PROCEDURE', 'DRESSING', 'INJECTION',
  'OT',          // Add: Occupational Therapy
  'SOCIAL_WORK', // Add: Social Work
  'OTHER',
]);
```

---

## 7. UI/UX Specifications

### 7.1 Allied Health Dashboard

The main dashboard (`/allied-health`) provides an overview:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Allied Health Dashboard                                            [Help] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐               │
│  │ Physiotherapy   │ │ Nutrition       │ │ OT              │               │
│  │ ────────────────│ │ ────────────────│ │ ────────────────│               │
│  │ Pending: 5      │ │ Pending: 3      │ │ Pending: 2      │               │
│  │ In Progress: 12 │ │ In Progress: 8  │ │ In Progress: 4  │               │
│  │ Today: 8 sess   │ │ Today: 5 consults│ │ Today: 3 sess  │               │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘               │
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐                                   │
│  │ Social Work     │ │ Counselling     │                                   │
│  │ ────────────────│ │ ────────────────│                                   │
│  │ Open Cases: 15  │ │ Pending: 7      │                                   │
│  │ Urgent: 2       │ │ Today: 10 sess  │                                   │
│  │ This Week: 23   │ │ Follow-ups: 4   │                                   │
│  └─────────────────┘ └─────────────────┘                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────│
│  │ Today's Sessions                                                   [All]│
│  ├─────────────────────────────────────────────────────────────────────────│
│  │ 09:00  PT-001  John Doe       Physiotherapy  Post-op rehab    SCHEDULED │
│  │ 09:30  CS-042  Jane Smith     Counselling    HIV Support      IN_PROGRESS│
│  │ 10:00  OT-015  Mary Johnson   OT             ADL Training     SCHEDULED │
│  │ ...                                                                     │
│  └─────────────────────────────────────────────────────────────────────────│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Order/Referral List Page

Standard list with filters:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Physiotherapy Orders                                     [+ New Order]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Search by patient/order...]        Status: [All ▼]  Type: [All ▼]        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────│
│  │ Order #        │ Patient      │ Type              │ Status     │ Date  │
│  ├─────────────────────────────────────────────────────────────────────────│
│  │ PHYSIO-0226-01│ John Doe     │ Musculoskeletal   │ ●PENDING   │ Today │
│  │ PHYSIO-0226-02│ Jane Smith   │ Post-Surgical     │ ●APPROVED  │ Today │
│  │ PHYSIO-0225-05│ Mary Johnson │ Neurological      │ ●IN_PROGRESS│ Yest │
│  │ ...                                                                     │
│  └─────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  ◀ 1 2 3 ... 10 ▶                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Order Detail Page

Detail view with actions:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHYSIO-20260226-0001                                              [Help]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Patient: John Doe (MRN-20260101-0001)         Status: ● IN_PROGRESS       │
│  Ordered: Feb 26, 2026 by Dr. Smith            Assigned: PT Sarah Jones    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────│
│  │ Treatment Details                                                       │
│  ├─────────────────────────────────────────────────────────────────────────│
│  │ Type: Post-Surgical Rehabilitation                                      │
│  │ Category: POST_SURGICAL                                                 │
│  │ Sessions: 3 of 8 completed                                              │
│  │ Frequency: 2x per week                                                  │
│  │ Duration per session: 45 minutes                                        │
│  │ Priority: ROUTINE                                                       │
│  │ SHA Claimable: Yes (Code: SHA-PT-001)                                   │
│  │                                                                         │
│  │ Clinical Notes:                                                         │
│  │ Post total knee replacement. Focus on ROM and strengthening.            │
│  └─────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────│
│  │ Sessions                                            [+ Add Session]     │
│  ├─────────────────────────────────────────────────────────────────────────│
│  │ #1  Feb 20, 2026  45 min  ● COMPLETED  Good progress, flexion improved  │
│  │ #2  Feb 22, 2026  45 min  ● COMPLETED  Continued improvement            │
│  │ #3  Feb 26, 2026  45 min  ● SCHEDULED  --                               │
│  │ #4  Feb 28, 2026  45 min  ● SCHEDULED  --                               │
│  │ ...                                                                     │
│  └─────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  Actions: [Start Session] [Reschedule] [Put on Hold] [Complete Order]      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Nutrition Anthropometrics Display

Special component for nutrition module:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Anthropometric Assessment                               [Sync from Vitals]│
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Weight      │  │ Height      │  │ BMI         │  │Classification│       │
│  │ ──────────  │  │ ──────────  │  │ ──────────  │  │ ────────────│        │
│  │   72.5 kg   │  │   175 cm    │  │   23.7      │  │ ● NORMAL    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Waist       │  │ Hip         │  │ WHR         │  │ MUAC        │        │
│  │ ──────────  │  │ ──────────  │  │ ──────────  │  │ ──────────  │        │
│  │   85 cm     │  │   100 cm    │  │   0.85      │  │   27.5 cm   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                            │
│  Calculated Values:                                                        │
│  • BMR (Basal Metabolic Rate): 1,680 kcal/day                              │
│  • TDEE (Total Daily Energy): 2,268 kcal/day (Moderately Active)           │
│  • Ideal Body Weight: 70.0 kg (Hamwi formula)                              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.5 Sensitive Case Banner

For Social Work and Counselling modules:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ SENSITIVE CASE                                                           │
│ This case contains sensitive information (GBV). Access is restricted and   │
│ logged per Kenya Data Protection Act 2019.                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.6 Responsive Design

Follow existing patterns from copilot-instructions.md:

- **Sidebar visible**: `xl:translate-x-0` (at 1280px)
- **Mobile cards**: Use `ResponsiveTable` component
- **Action buttons**: Stack vertically on mobile (`flex-col sm:flex-row`)
- **Page header**: Use `PageHeader` component with `helpContent`

---

## 8. Testing Strategy

### 8.1 Backend Tests (Complete)

| Module | Test File | Tests | Coverage |
|--------|-----------|-------|----------|
| Physiotherapy | `tests/test_physiotherapy.py` | 37 | >90% |
| Nutrition | `tests/test_nutrition.py` | 27 | >90% |
| Occupational Therapy | `tests/test_occupational_therapy.py` | 41 | >90% |
| Social Work | `tests/test_social_work.py` | 41 | >90% |
| Counselling | `tests/test_counselling.py` | 40 | >90% |

### 8.2 Frontend Tests (Complete)

#### Unit Tests

| Test Type | File | Description |
|-----------|------|-------------|
| Contract | `__tests__/contracts/allied-health.contract.test.ts` | Schema comparison with OpenAPI |
| Hook | `__tests__/lib/hooks/use-allied-health.test.tsx` | Dashboard hook tests |
| Hook | `__tests__/lib/hooks/use-physiotherapy.test.tsx` | Physiotherapy CRUD hooks |
| Component | `__tests__/components/allied-health/status-badges.test.tsx` | Status badge rendering |
| Component | `__tests__/components/allied-health/session-progress.test.tsx` | Progress bar component |
| Component | `__tests__/components/allied-health/module-card.test.tsx` | Dashboard card component |
| Component | `__tests__/components/allied-health/physio-order-table.test.tsx` | Order list table component |
| Form (TDD) | `__tests__/components/allied-health/physio-order-form.test.tsx` | Order creation form (TDD) |
| Form (TDD) | `__tests__/components/allied-health/physio-session-form.test.tsx` | Session recording form (TDD) |
| Form (TDD) | `__tests__/components/allied-health/social-work-referral-form.test.tsx` | Social work referral form (TDD) |

#### Integration Tests

| Test File | Description |
|-----------|-------------|
| `__tests__/integration/allied-health/physiotherapy-flow.test.ts` | Complete physiotherapy workflow tests |

#### E2E Tests (Playwright)

| Test File | Description |
|-----------|-------------|
| `e2e/allied-health/allied-health.spec.ts` | Dashboard, physiotherapy, social work workflows |

#### Running Tests

```bash
# Run all allied health unit tests
cd web-app && npm test -- --testPathPattern="allied-health"

# Run contract tests
npm test -- --testPathPattern="contracts/allied-health"

# Run component tests
npm test -- --testPathPattern="components/allied-health"

# Run integration tests
npm test -- --testPathPattern="integration/allied-health"

# Run E2E tests (requires backend running)
npm run test:e2e -- --grep "Allied Health"
```

#### Example Hook Test

```typescript
// __tests__/lib/hooks/use-allied-health.test.tsx
describe('useAlliedHealthDashboard', () => {
  it('fetches dashboard successfully', async () => {
    mockAlliedHealthApi.getDashboard.mockResolvedValueOnce(mockDashboardData);

    const { result } = renderHook(() => useAlliedHealthDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.physiotherapy.pending_count).toBe(5);
  });
});
```

#### Example Unit Tests

```typescript
// __tests__/allied-health/physiotherapy-order-form.test.tsx
describe('PhysioOrderForm', () => {
  it('should require patient and treatment type', async () => {
    render(<PhysioOrderForm onSubmit={mockSubmit} />);
    
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    
    expect(screen.getByText(/patient is required/i)).toBeInTheDocument();
    expect(screen.getByText(/treatment type is required/i)).toBeInTheDocument();
  });

  it('should validate sessions count within range', async () => {
    render(<PhysioOrderForm onSubmit={mockSubmit} />);
    
    await userEvent.type(screen.getByLabelText(/total sessions/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    
    expect(screen.getByText(/sessions must be between 1 and 52/i)).toBeInTheDocument();
  });

  it('should submit with valid data', async () => {
    render(<PhysioOrderForm onSubmit={mockSubmit} />);
    
    await selectPatient('John Doe');
    await selectTreatmentType('Post-Surgery Rehabilitation');
    await userEvent.type(screen.getByLabelText(/clinical indication/i), 'Knee replacement rehab');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({
      patient_id: 1,
      treatment_type_id: 1,
      clinical_indication: 'Knee replacement rehab',
    }));
  });
});
```

#### Example Integration Tests

```typescript
// __tests__/allied-health/physiotherapy-flow.test.tsx
describe('Physiotherapy Order Flow', () => {
  it('should create order from encounter', async () => {
    // Setup: Mock encounter context
    const encounterId = 100;
    mockEncounter({ id: encounterId, patient_id: 1 });
    
    render(<PhysioOrderForm encounterId={encounterId} />);
    
    await selectTreatmentType('Post-Surgery Rehabilitation');
    await userEvent.type(screen.getByLabelText(/clinical indication/i), 'ACL repair');
    await userEvent.click(screen.getByRole('button', { name: /create order/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/order created successfully/i)).toBeInTheDocument();
    });
    
    expect(mockPhysiotherapyApi.createOrder).toHaveBeenCalledWith({
      encounter_id: encounterId,
      patient_id: 1,
      treatment_type_id: expect.any(Number),
      clinical_indication: 'ACL repair',
    });
  });

  it('should approve order and create clinic visit', async () => {
    const order = mockPhysioOrder({ status: 'PENDING' });
    mockPhysiotherapyApi.approveOrder.mockResolvedValueOnce({ ...order, status: 'APPROVED' });
    
    render(<PhysioOrderDetail orderId={order.id} />);
    
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/approved/i)).toBeInTheDocument();
    });
    
    // Verify clinic visit was created via signal
    expect(mockPhysiotherapyApi.approveOrder).toHaveBeenCalledWith(order.id);
  });

  it('should complete session and create invoice item', async () => {
    const session = mockPhysioSession({ status: 'IN_PROGRESS' });
    mockPhysiotherapyApi.completeSession.mockResolvedValueOnce({ 
      ...session, 
      status: 'COMPLETED',
      invoice_item_id: 123,
    });
    
    render(<PhysioSessionDetail sessionId={session.id} />);
    
    await userEvent.type(screen.getByLabelText(/progress notes/i), 'Good progress');
    await userEvent.click(screen.getByRole('button', { name: /complete session/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/session completed/i)).toBeInTheDocument();
    });
    
    // Verify invoice item was linked
    expect(screen.getByText(/invoice item created/i)).toBeInTheDocument();
  });
});
```

#### Example E2E Tests (Playwright)

```typescript
// e2e/allied-health.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Allied Health Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'testuser');
    await page.fill('[name="password"]', 'testpass');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('complete physiotherapy workflow', async ({ page }) => {
    // 1. Navigate to encounter and create physio order
    await page.goto('/encounters/100');
    await page.click('button:has-text("Allied Health Referral")');
    await page.click('text=Physiotherapy');
    
    // 2. Fill order form
    await page.selectOption('[name="treatment_type_id"]', { label: 'Post-Surgery Rehabilitation' });
    await page.fill('[name="clinical_indication"]', 'Knee replacement rehabilitation');
    await page.fill('[name="total_sessions"]', '12');
    await page.click('button:has-text("Create Order")');
    
    await expect(page.locator('.toast-success')).toContainText('Order created');
    
    // 3. Approve order (as supervisor)
    await page.goto('/allied-health/physiotherapy');
    await page.click('tr:has-text("PHYSIO-")');
    await page.click('button:has-text("Approve")');
    
    await expect(page.locator('[data-status]')).toContainText('Approved');
    
    // 4. Assign therapist
    await page.click('button:has-text("Assign Therapist")');
    await page.selectOption('[name="therapist_id"]', { label: 'Jane Therapist' });
    await page.click('button:has-text("Assign")');
    
    await expect(page.locator('.assigned-therapist')).toContainText('Jane Therapist');
    
    // 5. Generate sessions
    await page.click('button:has-text("Generate Sessions")');
    await expect(page.locator('.sessions-list tr')).toHaveCount(12);
    
    // 6. Complete first session
    await page.click('.sessions-list tr:first-child');
    await page.click('button:has-text("Start Session")');
    await page.fill('[name="progress_notes"]', 'Initial assessment completed. Good ROM.');
    await page.selectOption('[name="outcome"]', 'IMPROVED');
    await page.click('button:has-text("Complete Session")');
    
    await expect(page.locator('[data-session-status]')).toContainText('Completed');
    
    // 7. Verify invoice item created
    await page.goto('/billing/invoices');
    await expect(page.locator('tr:has-text("Physiotherapy")')).toBeVisible();
  });

  test('social work sensitive case handling', async ({ page }) => {
    // 1. Create sensitive referral (GBV case)
    await page.goto('/encounters/200');
    await page.click('button:has-text("Allied Health Referral")');
    await page.click('text=Social Work');
    
    await page.selectOption('[name="urgency"]', 'CRITICAL');
    await page.fill('[name="referral_reason"]', 'GBV support needed');
    await page.check('[name="is_sensitive"]');
    await page.click('button:has-text("Create Referral")');
    
    // 2. Verify sensitive case banner
    await page.goto('/allied-health/social-work');
    await page.click('tr:has-text("SW-")');
    
    await expect(page.locator('.sensitive-case-banner')).toContainText('Restricted Access');
    
    // 3. Verify audit log entry
    await page.goto('/admin/auditlogs');
    await expect(page.locator('tr:has-text("view_sensitive_sw_case")')).toBeVisible();
  });
});
```

---

## 9. Deployment Checklist

### 9.1 Backend (Already Complete)

- [x] Models created and migrated
- [x] Serializers with validation
- [x] ViewSets with custom actions
- [x] URL routing configured
- [x] Signals for billing integration
- [x] Signals for clinic queue routing
- [x] Privacy controls implemented
- [x] Admin configuration
- [x] Unit tests (186 total)
- [x] API documentation (OpenAPI/Swagger)

### 9.2 Frontend (Complete)

- [x] TypeScript types created (`lib/types/`)
- [x] Zod schemas created (`lib/schemas/allied-health.schema.ts`)
- [x] API clients created (`lib/api/`)
- [x] Navigation updated (`lib/config/navigation.ts`)
- [x] Dashboard page (`/allied-health`)
- [x] Physiotherapy pages (list, detail, sessions, new order)
- [x] Nutrition pages (consultations, new, diet plans)
- [x] OT pages (orders, new order, sessions)
- [x] Social Work pages (referrals, new referral, cases, case detail, edit, notes, interventions)
- [x] Counselling pages (referrals, new referral, sessions)
- [x] Shared components (status badges, session progress, module card)
- [x] **Encounter detail** — Allied Health tab with badge counts
- [x] **Clinical flow accordion** — AH section (#8) with inline referral actions
- [x] **Encounter-scoped hooks** (`use-encounter-allied-health.ts`)
- [x] **Barrel export** for `EncounterAlliedHealthContent`
- [x] Social Work: `CaseNoteForm` wired to `cases/[id]/notes/new`
- [x] Social Work: `InterventionForm` wired to `cases/[id]/interventions/new`
- [x] Social Work: `SensitiveCaseBanner` used in case detail + referral form
- [x] Social Work: Case edit page (`cases/[id]/edit`)
- [x] Social Work: Notes list page (`cases/[id]/notes`)
- [x] Nutrition: Auto-populate weight/height from encounter triage vitals
- [x] Nutrition: Show encounter diagnoses as referral context
- [x] Contract tests
- [x] Hook tests
- [x] Component tests

### 9.3 Data Seeding

Seed treatment type catalogs:

```bash
# Load treatment types
python manage.py loaddata physiotherapy_treatment_types.json
python manage.py loaddata ot_treatment_types.json
python manage.py loaddata counselling_types.json
```

### 9.4 Permissions Setup

Create permission groups:

| Group | Permissions |
|-------|-------------|
| `physiotherapists` | `physiotherapy.*` |
| `dietitians` | `nutrition.*` |
| `occupational_therapists` | `occupational_therapy.*` |
| `social_workers` | `social_work.*`, `view_sensitive_sw_*` |
| `counsellors` | `counselling.*`, `view_sensitive_counselling_*` |

### 9.5 Clinic Setup

Ensure clinics exist:

```python
# Management command or admin setup
Clinic.objects.get_or_create(
    clinic_type='PHYSIO',
    defaults={'name': 'Physiotherapy Clinic', 'status': 'ACTIVE'}
)
Clinic.objects.get_or_create(
    clinic_type='NUTRITION',
    defaults={'name': 'Nutrition Clinic', 'status': 'ACTIVE'}
)
# etc.
```

---

## 10. Future Enhancements

### Phase 2+ Considerations

1. **Telehealth Integration**: Remote counselling sessions via video
2. **Mobile App Support**: React Native screens for therapists
3. **Outcome Tracking**: Long-term outcome measurement
4. **Group Therapy**: Support for group counselling sessions
5. **Equipment Scheduling**: Physiotherapy equipment reservation
6. **Insurance Pre-authorization**: Auto pre-auth for SHA
7. **Progress Graphs**: Visualize patient progress over time
8. **AI Recommendations**: ML-based treatment suggestions

---

## Appendix A: Number Format Reference

| Module | Format | Example |
|--------|--------|---------|
| Physiotherapy Order | `PHYSIO-YYYYMMDD-XXXX` | PHYSIO-20260226-0001 |
| Nutrition Consultation | `NUT-YYYYMMDD-XXXX` | NUT-20260226-0001 |
| Diet Plan | `DIET-YYYYMMDD-XXXX` | DIET-20260226-0001 |
| OT Order | `OT-YYYYMMDD-XXXX` | OT-20260226-0001 |
| Social Work Referral | `SW-YYYYMMDD-XXXX` | SW-20260226-0001 |
| Social Work Case | `SWC-YYYYMMDD-XXXX` | SWC-20260226-0001 |
| Counselling Referral | `COUNS-YYYYMMDD-XXXX` | COUNS-20260226-0001 |
| Counselling Session | `CS-YYYYMMDD-XXXX` | CS-20260226-0001 |

---

## Appendix B: Status Color Reference

| Status | Color | Tailwind Class |
|--------|-------|----------------|
| DRAFT | Gray | `bg-gray-100 text-gray-800` |
| PENDING | Yellow | `bg-yellow-100 text-yellow-800` |
| APPROVED | Blue | `bg-blue-100 text-blue-800` |
| ASSIGNED | Indigo | `bg-indigo-100 text-indigo-800` |
| IN_PROGRESS | Purple | `bg-purple-100 text-purple-800` |
| COMPLETED | Green | `bg-green-100 text-green-800` |
| CANCELLED | Red | `bg-red-100 text-red-800` |
| ON_HOLD | Orange | `bg-orange-100 text-orange-800` |
| NO_SHOW | Gray | `bg-gray-200 text-gray-600` |

---

**Last Updated**: February 27, 2026
**Maintainer**: Engineering Lead
**Version**: 1.2
