# Multi-Tenancy Architecture — Single Source of Truth

> **Status**: ✅ Implemented (Phase 1 + Phase 2)
> **Last Updated**: March 26, 2026
> **Canonical Location**: `docs/multitenancy.md`
> **Test Coverage**: `backend/tests/core/test_multitenancy.py` (1222 lines), `backend/tests/core/test_staff_facility.py` (379 lines)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Hierarchy & Terminology](#2-hierarchy--terminology)
3. [Scoping Rules](#3-scoping-rules)
4. [Backend Implementation](#4-backend-implementation)
   - 4.1 [Models](#41-models)
   - 4.2 [Abstract Mixins](#42-abstract-mixins)
   - 4.3 [Middleware](#43-middleware)
   - 4.4 [ViewSet Mixin](#44-viewset-mixin)
   - 4.5 [Staff–Facility Assignment](#45-stafffacility-assignment)
   - 4.6 [Role Scoping](#46-role-scoping)
   - 4.7 [Audit & Sync Scoping](#47-audit--sync-scoping)
5. [Frontend Implementation](#5-frontend-implementation)
   - 5.1 [API Client Header Injection](#51-api-client-header-injection)
   - 5.2 [FacilityProvider Context](#52-facilityprovider-context)
   - 5.3 [Module-Based Sidebar Filtering](#53-module-based-sidebar-filtering)
   - 5.4 [TypeScript Types](#54-typescript-types)
6. [API Endpoints](#6-api-endpoints)
7. [Data Flow Diagram](#7-data-flow-diagram)
8. [Scoping Matrix](#8-scoping-matrix)
9. [Migrations](#9-migrations)
10. [Adding Tenancy to a New Model](#10-adding-tenancy-to-a-new-model)
11. [Testing Tenancy](#11-testing-tenancy)
12. [Security Considerations](#12-security-considerations)
13. [Subscription & Limits](#13-subscription--limits)
14. [Future Considerations](#14-future-considerations)
15. [File Reference](#15-file-reference)

---

## 1. Overview

Vitora HMIS uses a **shared-database, shared-schema, row-level isolation** multi-tenancy strategy. All tenants coexist in a single PostgreSQL (or SQLite for development) database. Data isolation is enforced at the application layer through foreign key relationships and automatic query filtering.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Isolation strategy** | Row-level (logical) | Simpler ops, no schema-per-tenant migration burden |
| **Tenant identifier** | HTTP header (`X-Facility-Id`) | Works across web, mobile, desktop; no subdomain infra needed |
| **Two-tier hierarchy** | Organization → Facility | Supports hospital groups with multiple branches |
| **Enforcement layer** | Django middleware + ViewSet mixin | Consistent, hard to bypass, works with DRF |

---

## 2. Hierarchy & Terminology

```
Organization (tenant)          ← Legal entity / hospital group
├── Facility A (branch)        ← Physical site with MFL code
│   ├── Staff (primary)
│   ├── Encounters
│   ├── Triage
│   ├── Invoices
│   └── Lab Orders
├── Facility B (branch)
│   └── ...
└── Shared Data (org-scoped)
    ├── Patients
    ├── Allergies
    └── Custom Roles
```

| Term | Definition | Example |
|------|-----------|---------|
| **Organization** | Top-level tenant. A legal entity that owns one or more facilities. | "Nairobi Hospital Group" |
| **Facility** | A physical healthcare site registered on the Kenya Master Facility List (MFL). Always belongs to one Organization. | "Nairobi Hospital – Westlands Branch" (MFL: 12345) |
| **Organization-scoped** | Data shared across all facilities within the same organization. | Patient records, Allergies |
| **Facility-scoped** | Data created at and visible to a single facility. | Encounters, Triage, Invoices, Lab Orders |
| **Primary facility** | The staff member's default workplace (`StaffProfile.primary_facility`). | — |
| **Secondary facilities** | Additional facilities a staff member can access (`StaffProfile.secondary_facilities`). | Multi-site locum doctors |

---

## 3. Scoping Rules

### Organization-Scoped Data (shared across branches)

A doctor at Facility A can see patients registered at Facility B **within the same organization**. This enables patient transfers between branches.

**Models**: `Patient`, `Allergy`, `AuditLog` (org-level), custom `Role` (scope=ORG)

### Facility-Scoped Data (branch-specific)

An encounter created at Facility A is only visible to staff at Facility A. Staff at Facility B cannot see or modify it.

**Models**: `Encounter`, `Triage`, `Clinic`, `ClinicSession`, `ClinicVisit`, `Invoice`, `LabOrder`, `Prescription`, `Ward`, `Admission`

### Cross-Organization Isolation

Organization A can **never** see Organization B's data. This is the hard security boundary.

---

## 4. Backend Implementation

### 4.1 Models

#### Organization (`hmis/apps/core/models.py`)

```python
class Organization(TimeStampedModel):
    # Identity
    name = CharField(max_length=200, unique=True)
    slug = SlugField(max_length=100, unique=True)
    logo = ImageField(upload_to="organizations/logos/", null=True)

    # Contact
    contact_email = EmailField(blank=True)
    contact_phone = CharField(max_length=20, blank=True)
    address = TextField(blank=True)

    # Location (optional HQ)
    county = ForeignKey("core.County", null=True)
    sub_county = ForeignKey("core.SubCounty", null=True)

    # Subscription (SaaS licensing)
    subscription_tier = CharField(choices=SubscriptionTier.choices, default="BASIC")
    max_facilities = PositiveIntegerField(null=True)   # null = unlimited
    max_users = PositiveIntegerField(null=True)        # null = unlimited

    # Compliance (Kenya DPA 2019)
    data_retention_years = PositiveIntegerField(default=7)

    # Configuration
    settings = JSONField(default=dict)

    # Status
    is_active = BooleanField(default=True)
```

**Subscription Tiers**: `FREE`, `BASIC`, `PROFESSIONAL`, `ENTERPRISE`

**Properties**:
- `facility_count` → number of child facilities
- `staff_count` → number of staff in the org
- `can_add_facility()` → checks against `max_facilities`
- `can_add_user()` → checks against `max_users`

#### Facility (`hmis/apps/core/models.py`)

```python
class Facility(TimeStampedModel):
    # Parent tenant
    organization = ForeignKey("Organization", on_delete=PROTECT, null=True)

    # Kenya MFL identity
    mfl_code = CharField(max_length=20, unique=True)
    name = CharField(max_length=200)
    level = CharField(choices=FacilityLevel.choices)   # KEPH Levels 1–6
    ownership = CharField(choices=OwnershipType.choices)

    # Branch identity
    is_headquarters = BooleanField(default=False)
    branch_code = CharField(max_length=50, blank=True)

    # Location (Kenya hierarchy)
    county = ForeignKey("County", on_delete=PROTECT)
    sub_county = ForeignKey("SubCounty", on_delete=PROTECT)
    ward = ForeignKey("Ward", null=True)

    # SHA integration
    sha_contracted = BooleanField(default=False)
    sha_contract_expiry = DateField(null=True)
    sha_facility_code = CharField(max_length=50, blank=True)

    # Capability module flags (12 booleans)
    has_outpatient = BooleanField(default=True)
    has_inpatient = BooleanField(default=False)
    has_emergency = BooleanField(default=False)
    has_pharmacy = BooleanField(default=True)
    has_laboratory = BooleanField(default=False)
    has_imaging = BooleanField(default=False)
    has_theatre = BooleanField(default=False)
    has_dialysis = BooleanField(default=False)
    has_icu = BooleanField(default=False)
    has_maternity = BooleanField(default=False)
    has_mortuary = BooleanField(default=False)
    has_blood_bank = BooleanField(default=False)

    is_active = BooleanField(default=True)
```

**KEPH Levels**: 1 (Community Unit) → 6 (National Referral Hospital)

**Ownership Types**: `GOK`, `FBO`, `NGO`, `PRIVATE`

**Properties**:
- `modules` → `dict[str, bool]` of all capability flags
- `enabled_module_names` → `list[str]` of enabled module names

**Class Methods**:
- `default_modules_for_level(level)` → returns sensible module defaults per KEPH level

### 4.2 Abstract Mixins

**File**: `hmis/apps/core/mixins.py`

#### OrganizationScopedModel

```python
class OrganizationScopedModel(models.Model):
    organization = ForeignKey("core.Organization", on_delete=CASCADE,
                              related_name="%(app_label)s_%(class)s_set",
                              null=True, blank=True)
    class Meta:
        abstract = True
```

Inherit from this for data that should be visible across all facilities within the same organization. The `organization` FK is the tenant boundary.

#### FacilityScopedModel

```python
class FacilityScopedModel(OrganizationScopedModel):
    facility = ForeignKey("core.Facility", on_delete=CASCADE,
                          related_name="%(app_label)s_%(class)s_set",
                          null=True, blank=True)
    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        # Auto-set organization from facility
        if self.facility and self.facility.organization:
            self.organization = self.facility.organization
        super().save(*args, **kwargs)
```

Inherit from this for data scoped to a single facility. The `organization` FK is auto-populated from the `facility` on save, so you never need to set both manually.

### 4.3 Middleware

**File**: `hmis/apps/core/middleware.py`
**Registration**: `hmis.settings.base.MIDDLEWARE` (after `AuthenticationMiddleware`)

```python
class TenantMiddleware:
    def __call__(self, request):
        request.facility = None
        request.organization = None

        if user is authenticated:
            facility = self._resolve_facility(request, user)
            if facility:
                request.facility = facility
                request.organization = facility.organization

        return self.get_response(request)
```

#### Resolution Order

1. **`X-Facility-Id` header** — sent by the frontend on every request. The middleware looks up the `Facility` by PK, verifies it's active, and checks user access.
2. **`StaffProfile.primary_facility` fallback** — if no header is present, the user's primary facility is used.
3. **`None`** — if neither is available (e.g., superuser without a profile), both `request.facility` and `request.organization` remain `None`.

#### Access Control

```python
def _user_has_facility_access(self, user, facility):
    if user.is_superuser:
        return True  # Superusers can access any facility

    profile = user.staff_profile
    if profile.primary_facility_id == facility.pk:
        return True

    return profile.secondary_facilities.filter(pk=facility.pk).exists()
```

A non-superuser can only set `X-Facility-Id` to a facility that is either their **primary** or one of their **secondary** facilities. Unauthorized facility IDs are silently ignored (the middleware returns `None` rather than a 403).

### 4.4 ViewSet Mixin

**File**: `hmis/apps/core/mixins.py`

```python
class TenantScopedViewMixin:
    tenant_scope: str = "facility"  # "organization" or "facility"
```

#### Automatic Queryset Filtering (`get_queryset`)

```python
def get_queryset(self):
    self._resolve_tenant_context()
    qs = super().get_queryset()

    if self.tenant_scope == "facility" and request.facility:
        qs = qs.filter(facility=request.facility)
    elif request.organization:
        qs = qs.filter(organization=request.organization)

    return qs
```

- `tenant_scope = "facility"` → filters by `facility` (narrows to current branch)
- `tenant_scope = "organization"` → filters by `organization` (all branches in the org)
- If neither `facility` nor `organization` is set, the full queryset is returned (only happens for superusers with no profile)

#### Automatic FK Injection (`perform_create`)

```python
def perform_create(self, serializer):
    serializer.save(**self.get_tenant_save_kwargs())

def get_tenant_save_kwargs(self) -> dict:
    extra = {}
    if request.organization:
        extra["organization"] = request.organization
    if self.tenant_scope == "facility" and request.facility:
        extra["facility"] = request.facility
    return extra
```

When creating records, the mixin automatically sets the `organization` and `facility` FKs from the request context. No manual assignment needed.

#### Lazy Resolution for Tests

The `_resolve_tenant_context()` helper handles the edge case where DRF test clients use `force_authenticate()`, which bypasses Django middleware (so `request.facility` is `None`). It re-resolves from the `X-Facility-Id` header or `StaffProfile.primary_facility` at the view layer.

### 4.5 Staff–Facility Assignment

**Model**: `StaffProfile` in `hmis/apps/core/models.py`

```python
class StaffProfile(models.Model):
    user = OneToOneField(User, related_name="staff_profile")

    # Tenant linkage
    organization = ForeignKey("Organization", null=True, on_delete=PROTECT,
                              related_name="staff_profiles")
    primary_facility = ForeignKey("Facility", null=True, on_delete=PROTECT,
                                  related_name="staff")
    secondary_facilities = ManyToManyField("Facility", blank=True,
                                            related_name="secondary_staff")
```

| Field | Purpose |
|-------|---------|
| `organization` | Cached from `primary_facility.organization` for query performance |
| `primary_facility` | Default workplace; used as fallback by `TenantMiddleware` |
| `secondary_facilities` | Additional sites (for multi-site workers / locum doctors) |

**Access rule**: A user can set `X-Facility-Id` to their primary facility OR any facility in `secondary_facilities`. Superusers can access any facility.

### 4.6 Role Scoping

**Migration**: `0030_role_multitenancy_scope.py`

```python
class Role(models.Model):
    organization = ForeignKey("Organization", null=True, on_delete=CASCADE,
                              related_name="roles")
    facility = ForeignKey("Facility", null=True, on_delete=CASCADE,
                          related_name="roles")
    scope = CharField(choices=[("ORG", "Organization-wide"),
                               ("FACILITY", "Facility-specific")],
                      default="ORG")
```

**Constraint**: `role_facility_required_when_facility_scoped` — if `scope=FACILITY`, then `facility` must not be null.

- **System-wide roles** (`organization=None`): Visible to all orgs (seeded defaults like "Doctor", "Nurse").
- **Org-wide roles** (`scope=ORG`): Custom roles visible across all facilities in the org.
- **Facility-specific roles** (`scope=FACILITY`): Roles scoped to a single branch.

### 4.7 Audit & Sync Scoping

**Migration**: `0029_multitenancy_clinical_fks.py`

Both `AuditLog` and `SyncQueue` now have optional `facility` and `organization` FKs:

```python
# AuditLog
facility = ForeignKey("Facility", null=True, on_delete=SET_NULL, related_name="audit_logs")
organization = ForeignKey("Organization", null=True, on_delete=SET_NULL, related_name="audit_logs")

# SyncQueue
facility = ForeignKey("Facility", null=True, on_delete=SET_NULL, related_name="sync_queue_entries")
organization = ForeignKey("Organization", null=True, on_delete=SET_NULL, related_name="sync_queue_entries")
```

The `AuditLogViewSet` uses `TenantScopedViewMixin` with `tenant_scope = "organization"` so org admins can see logs across all their facilities.

---

## 5. Frontend Implementation

### 5.1 API Client Header Injection

**File**: `web-app/lib/api/client.ts`

```typescript
let _activeFacilityId: number | null = null;

export function setActiveFacilityId(id: number | null): void {
  _activeFacilityId = id;
}

// Axios request interceptor
apiClient.interceptors.request.use(async (config) => {
  if (_activeFacilityId != null) {
    config.headers['X-Facility-Id'] = String(_activeFacilityId);
  }
  // ... JWT token logic
  return config;
});
```

Every outgoing API request automatically includes the `X-Facility-Id` header when a facility is active. The value is managed by `FacilityProvider`.

### 5.2 FacilityProvider Context

**File**: `web-app/lib/context/facility-context.tsx`

```typescript
interface FacilityContextValue {
  facility: UserFacility | null;          // Active facility (assigned or override)
  facilityDetail: FacilityDetail | null;  // Full detail (fetched via React Query)
  organization: { id: number; name: string } | null;  // Derived from facility
  assignedFacility: UserFacility | null;  // From auth context (primary)
  facilityOverride: UserFacility | null;  // Manual override (dev/superuser)
  isUsingFacilityOverride: boolean;
  isLoading: boolean;
  hasModule: (module: keyof FacilityModules) => boolean;
  switchFacility: (facility: UserFacility) => void;
  setFacilityOverride: (facility: UserFacility | null) => void;
  clearFacilityOverride: () => void;
}
```

#### Facility Resolution

1. **Override** — if the user is a superuser (or in dev mode) and has set an override, use it.
2. **Assigned** — fall back to `user.facility` from the auth context (i.e., `StaffProfile.primary_facility`).
3. **None** — if the user has no facility assigned.

#### Override Persistence

- Stored in `localStorage` under `vitora_dev_facility_override`.
- Only available in development OR for superusers in production.
- Cleared automatically when the user loses override privileges.

#### Sync to API Client

```typescript
useEffect(() => {
  setActiveFacilityId(facilityId);
}, [facilityId]);
```

Whenever the active facility changes, the API client's `_activeFacilityId` is updated, ensuring all subsequent requests use the correct `X-Facility-Id`.

### 5.3 Module-Based Sidebar Filtering

The `hasModule()` function drives sidebar visibility:

```typescript
const hasModule = (module: keyof FacilityModules): boolean => {
  if (user?.is_superuser) return true;     // Superusers see everything
  if (!facility) return true;              // No facility = no filtering
  return facility.modules[module] ?? false;
};
```

Navigation items are conditionally rendered based on the facility's enabled modules. For example, a Level 2 Dispensary (`has_laboratory=false`) won't show the Laboratory navigation item.

### 5.4 TypeScript Types

**File**: `web-app/lib/types/organization.ts`

```typescript
export interface OrganizationListItem {
  id: number;
  name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  is_active: boolean;
  county_name: string | null;
  facility_count: number;
  staff_count: number;
}

export interface OrganizationDetail extends OrganizationListItem {
  logo: string | null;
  contact_email: string;
  contact_phone: string;
  address: string;
  county: number | null;
  sub_county: number | null;
  sub_county_name: string | null;
  max_facilities: number;
  max_users: number;
  data_retention_years: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

**File**: `web-app/lib/types/facility.ts`

```typescript
export interface FacilityListItem {
  id: number;
  organization: number | null;
  organization_name: string | null;
  mfl_code: string;
  name: string;
  level: string;
  ownership: string;
  county: number;
  county_name: string;
  sub_county: number;
  sub_county_name: string;
  is_headquarters: boolean;
  branch_code: string;
  sha_contracted: boolean;
  is_active: boolean;
}

export interface FacilityDetail extends FacilityListItem {
  ward: number | null;
  ward_name: string | null;
  sha_contract_expiry: string | null;
  sha_facility_code: string;
  modules: FacilityModules;
  enabled_module_names: string[];
  has_outpatient: boolean;
  has_inpatient: boolean;
  /* ... 10 more module flags ... */
  created_at: string;
  updated_at: string;
}
```

---

## 6. API Endpoints

### Organizations

```
GET    /api/organizations/                    # List all organizations
POST   /api/organizations/                    # Create organization (admin only)
GET    /api/organizations/{id}/               # Organization detail
PATCH  /api/organizations/{id}/               # Update organization (admin only)
DELETE /api/organizations/{id}/               # Delete organization (admin only)
GET    /api/organizations/{id}/facilities/    # List facilities under org
```

### Facilities

```
GET    /api/core/facilities/                  # List all facilities
POST   /api/core/facilities/                  # Create facility (admin only)
GET    /api/core/facilities/{id}/             # Facility detail (with modules)
PATCH  /api/core/facilities/{id}/             # Update facility (admin only)
DELETE /api/core/facilities/{id}/             # Delete facility (admin only)
```

**Query Parameters** (Facilities):
- `level` — KEPH level (1–6)
- `ownership` — GOK, FBO, NGO, PRIVATE
- `county` — County ID
- `is_active` — true/false
- `sha_contracted` — true/false
- `has_outpatient`, `has_inpatient`, `has_pharmacy`, etc. — module filters

---

## 7. Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           REQUEST FLOW                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Frontend (Web/Mobile/Desktop)                                           │
│  ┌───────────────────────────────────────────────────────┐               │
│  │  FacilityProvider resolves active facility:           │               │
│  │    1. Override (dev/superuser)                        │               │
│  │    2. user.facility (primary_facility from auth)      │               │
│  │  → setActiveFacilityId(id)                            │               │
│  └───────────────────────────────────┬───────────────────┘               │
│                                      │                                   │
│  Axios Interceptor                   ▼                                   │
│  ┌───────────────────────────────────────────────────────┐               │
│  │  Every request gets:                                  │               │
│  │    Authorization: Bearer <jwt>                        │               │
│  │    X-Facility-Id: <active_facility_id>                │               │
│  └───────────────────────────────────┬───────────────────┘               │
│                                      │                                   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ HTTP ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│                                      │                                   │
│  Django Backend                      ▼                                   │
│  ┌───────────────────────────────────────────────────────┐               │
│  │  TenantMiddleware                                     │               │
│  │    1. Read X-Facility-Id header                       │               │
│  │    2. Lookup Facility (active=True)                   │               │
│  │    3. Verify user has access (primary or secondary)   │               │
│  │    4. Fallback to StaffProfile.primary_facility       │               │
│  │    → request.facility = <Facility>                    │               │
│  │    → request.organization = <Organization>            │               │
│  └───────────────────────────────────┬───────────────────┘               │
│                                      │                                   │
│  ViewSet (with TenantScopedViewMixin)▼                                   │
│  ┌───────────────────────────────────────────────────────┐               │
│  │  GET  → get_queryset() filters by tenant_scope:       │               │
│  │         "facility"     → .filter(facility=X)          │               │
│  │         "organization" → .filter(organization=X)      │               │
│  │                                                       │               │
│  │  POST → perform_create() auto-injects:                │               │
│  │         organization=request.organization             │               │
│  │         facility=request.facility (if scope=facility) │               │
│  └───────────────────────────────────────────────────────┘               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Scoping Matrix

### ViewSets Using `TenantScopedViewMixin`

| App | ViewSet | `tenant_scope` | Rationale |
|-----|---------|----------------|-----------|
| **patients** | `PatientViewSet` | `"organization"` | Patients shared across branches |
| **patients** | `AllergyViewSet` | `"organization"` | Shared medical history |
| **encounters** | `EncounterViewSet` | `"facility"` | Operational, branch-specific |
| **triage** | `TriageAssessmentViewSet` | `"facility"` | Branch-specific queue |
| **clinics** | `ClinicViewSet` | `"facility"` | Branch-specific clinic |
| **clinics** | `ClinicSessionViewSet` | `"facility"` | Branch-specific session |
| **clinics** | `ClinicVisitViewSet` | `"facility"` | Branch-specific visit |
| **billing** | `InvoiceViewSet` | `"facility"` | Branch-specific billing |
| **pharmacy** | `PrescriptionViewSet` | `"facility"` | Branch-specific dispensing |
| **laboratory** | `LabOrderViewSet` | `"facility"` | Branch-specific lab |
| **inpatient** | `WardViewSet` | `"facility"` | Branch-specific wards |
| **inpatient** | `AdmissionViewSet` | `"facility"` | Branch-specific admissions |
| **core** | `AuditLogViewSet` | `"organization"` | Org admins see all facility logs |

### Which Mixin to Use on Models

| Scope | Mixin | When to Use | Examples |
|-------|-------|-------------|---------|
| **Organization** | `OrganizationScopedModel` | Data shared across branches | Patient, Allergy |
| **Facility** | `FacilityScopedModel` | Data specific to one branch | Encounter, Triage, Invoice, LabOrder |
| **Neither** | (no mixin) | System-wide reference data | County, SubCounty, ICD10Code, SNOMEDConcept |

---

## 9. Migrations

Tenancy was introduced across three migrations:

| Migration | Date | Changes |
|-----------|------|---------|
| `0023_facility_model.py` | Phase 1 | Created `Facility` model with MFL code, KEPH level, ownership, module flags |
| `0024_staff_facility_link.py` | Phase 1 | Added `StaffProfile.primary_facility` (FK) and `secondary_facilities` (M2M) |
| `0028_multitenancy_organization.py` | Phase 2 | Created `Organization` model; added `Facility.is_headquarters`, `Facility.branch_code`, `Facility.organization` FK |
| `0029_multitenancy_clinical_fks.py` | Phase 2 | Added `facility` and `organization` FKs to `AuditLog` and `SyncQueue` |
| `0030_role_multitenancy_scope.py` | Phase 2 | Added `organization`, `facility`, and `scope` fields to `Role`; added check constraint |

---

## 10. Adding Tenancy to a New Model

### Step 1: Choose the Scope

- **Organization-scoped** → inherit `OrganizationScopedModel`
- **Facility-scoped** → inherit `FacilityScopedModel` (auto-sets org from facility)

```python
from hmis.apps.core.mixins import FacilityScopedModel

class Appointment(FacilityScopedModel):
    patient = ForeignKey("patients.Patient", on_delete=CASCADE)
    datetime = DateTimeField()
    # ... (organization and facility FKs are inherited)
```

### Step 2: Create and Run the Migration

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
```

### Step 3: Add the ViewSet Mixin

```python
from hmis.apps.core.mixins import TenantScopedViewMixin

class AppointmentViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    tenant_scope = "facility"  # or "organization"
    queryset = Appointment.objects.all()
    serializer_class = AppointmentSerializer
```

### Step 4: If You Override `create()`

If your ViewSet overrides `create()` directly (instead of using `perform_create()`), unpack tenant kwargs manually:

```python
def create(self, request, *args, **kwargs):
    serializer = self.get_serializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    appointment = serializer.save(
        created_by=request.user,
        **self.get_tenant_save_kwargs(),  # Injects organization + facility
    )
    return Response(AppointmentSerializer(appointment).data, status=201)
```

### Step 5: Add Tests

```python
class TestAppointmentTenancy:
    def test_facility_A_cannot_see_facility_B_appointments(
        self, authenticated_client, facility_a, facility_b
    ):
        """Appointments are facility-scoped."""
        # Create appointment at facility_a
        Appointment.objects.create(facility=facility_a, organization=facility_a.organization, ...)

        # Request as user at facility_b
        authenticated_client.credentials(HTTP_X_FACILITY_ID=str(facility_b.id))
        response = authenticated_client.get("/api/appointments/")

        assert len(response.data) == 0  # Cannot see facility_a's appointments
```

---

## 11. Testing Tenancy

### Test Files

| File | Lines | Coverage |
|------|-------|---------|
| `backend/tests/core/test_multitenancy.py` | 1222 | Organization model, Facility linkage, TenantMiddleware, Organization API, clinical model scoping |
| `backend/tests/core/test_staff_facility.py` | 379 | StaffProfile–Facility linkage, primary/secondary facilities, serializer coverage |

### Key Test Fixtures

```python
@pytest.fixture
def sample_org(db):
    return Organization.objects.create(name="Demo Health Group", slug="demo-health-group")

@pytest.fixture
def sample_facility(db, sample_org, org_county, org_sub_county):
    return Facility.objects.create(
        organization=sample_org, mfl_code="12345",
        name="Demo Clinic - Main", level="3", ownership="PRIVATE",
        county=org_county, sub_county=org_sub_county,
    )

@pytest.fixture
def second_facility(db, sample_org, org_county, org_sub_county):
    return Facility.objects.create(
        organization=sample_org, mfl_code="12346",
        name="Demo Clinic - Branch", level="2", ownership="PRIVATE",
        county=org_county, sub_county=org_sub_county,
    )
```

### Testing with `X-Facility-Id`

In DRF tests, set the header via `credentials()`:

```python
authenticated_client.credentials(HTTP_X_FACILITY_ID=str(facility.id))
response = authenticated_client.get("/api/encounters/")
```

### Running Tenancy Tests

```bash
cd backend
poetry run pytest tests/core/test_multitenancy.py -v --no-cov
poetry run pytest tests/core/test_staff_facility.py -v --no-cov
```

---

## 12. Security Considerations

### Cross-Tenant Data Leakage Prevention

1. **ViewSet mixin** — `TenantScopedViewMixin.get_queryset()` filters all list/retrieve operations by the active tenant. Forgetting to add the mixin means no filtering.
2. **Middleware validation** — `TenantMiddleware._user_has_facility_access()` prevents users from setting `X-Facility-Id` to a facility they're not assigned to.
3. **Superuser bypass** — Superusers can access any facility. This is intentional for support/admin purposes but should be audited.

### Gotchas

| Risk | Mitigation |
|------|-----------|
| ViewSet without `TenantScopedViewMixin` | All new feature ViewSets **must** include the mixin (code review checklist item) |
| Direct `Model.objects.all()` in business logic | Use `request.facility` / `request.organization` to scope manual queries |
| `null=True` on tenant FKs | Existing records from before multi-tenancy may have `null` org/facility — handle in data migration |
| Test with `force_authenticate` but no facility | `_resolve_tenant_context()` lazily resolves, but ensure test fixtures set up `StaffProfile.primary_facility` or send `HTTP_X_FACILITY_ID` |

### Kenya DPA 2019 Compliance

- Audit logs include `facility` and `organization` context for accountability.
- `data_retention_years` on `Organization` supports per-tenant retention policies.
- Sensitive patient filtering (`is_sensitive=True`) works within the tenant scope.

---

## 13. Subscription & Limits

| Tier | Max Facilities | Max Users | Intended For |
|------|---------------|-----------|-------------|
| `FREE` | Per config | Per config | Trial / demo |
| `BASIC` | Per config | Per config | Single-site clinics |
| `PROFESSIONAL` | Per config | Per config | Multi-site practices |
| `ENTERPRISE` | Unlimited (`null`) | Unlimited (`null`) | Hospital groups |

Limits are checked via:
- `Organization.can_add_facility()` → `facility_count < max_facilities`
- `Organization.can_add_user()` → `staff_count < max_users`

> **Note**: Limit enforcement is currently at the model/property level. It is not yet enforced in the serializer or view layer (planned for Phase 3 SaaS billing integration).

---

## 14. Future Considerations

| Enhancement | Status | Notes |
|------------|--------|-------|
| **Subdomain routing** (`demo.vitora.health`) | 📋 Planned | `Organization.slug` is already unique; DNS + middleware change needed |
| **Subscription enforcement** | 📋 Planned | Block facility/user creation when limits exceeded |
| **Tenant-scoped media** | 📋 Planned | Separate S3 prefixes per org: `organizations/{slug}/...` |
| **Cross-org patient referral** | 📋 Planned | Requires consent-based data sharing protocol |
| **Tenant admin panel** | 📋 Planned | Self-service org management (billing, facilities, staff) |
| **Data export per tenant** | 📋 Planned | GDPR/DPA data portability requirement |
| **Row-Level Security (DB)** | 📋 Considered | PostgreSQL RLS for defense-in-depth (supplement to app-layer) |

---

## 15. File Reference

### Backend

| File | Purpose |
|------|---------|
| `hmis/apps/core/models.py` (L2216–2401) | `Organization` model |
| `hmis/apps/core/models.py` (L2402–2800) | `Facility` model with module flags |
| `hmis/apps/core/models.py` (L1351–1460) | `StaffProfile` with facility assignment fields |
| `hmis/apps/core/mixins.py` (L178–197) | `OrganizationScopedModel` abstract mixin |
| `hmis/apps/core/mixins.py` (L199–225) | `FacilityScopedModel` abstract mixin |
| `hmis/apps/core/mixins.py` (L228–340) | `TenantScopedViewMixin` |
| `hmis/apps/core/middleware.py` (L40–132) | `TenantMiddleware` |
| `hmis/apps/core/serializers.py` (L664–687) | `OrganizationListSerializer` |
| `hmis/apps/core/serializers.py` (L688–746) | `OrganizationDetailSerializer` |
| `hmis/apps/core/serializers.py` (L747–787) | `FacilityListSerializer` |
| `hmis/apps/core/serializers.py` (L788–865) | `FacilityDetailSerializer` |
| `hmis/apps/core/serializers.py` (L866–930) | `FacilityCreateSerializer` |
| `hmis/apps/core/views.py` (L1482–1523) | `OrganizationViewSet` |
| `hmis/apps/core/views.py` (L1525–1650) | `FacilityViewSet` |
| `hmis/apps/core/urls.py` | Router registration for `facilities` |
| `hmis/urls.py` (L105) | Router registration for `organizations` |
| `hmis/settings/base.py` (L97) | `TenantMiddleware` in MIDDLEWARE |
| `tests/core/test_multitenancy.py` | 1222 lines of tenancy tests |
| `tests/core/test_staff_facility.py` | 379 lines of staff–facility tests |

### Migrations

| Migration | Purpose |
|-----------|---------|
| `core/0023_facility_model.py` | Facility model creation |
| `core/0024_staff_facility_link.py` | StaffProfile ↔ Facility linkage |
| `core/0028_multitenancy_organization.py` | Organization model + Facility branch fields |
| `core/0029_multitenancy_clinical_fks.py` | AuditLog + SyncQueue tenant FKs |
| `core/0030_role_multitenancy_scope.py` | Role scoping (org/facility) |

### Frontend

| File | Purpose |
|------|---------|
| `web-app/lib/api/client.ts` | `X-Facility-Id` header injection via Axios interceptor |
| `web-app/lib/context/facility-context.tsx` | `FacilityProvider`, `useFacility()` hook |
| `web-app/lib/types/organization.ts` | Organization TypeScript interfaces |
| `web-app/lib/types/facility.ts` | Facility TypeScript interfaces |
