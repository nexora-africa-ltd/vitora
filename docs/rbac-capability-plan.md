# RBAC & Capability-Based Experience Design Plan

> **Document Owner**: Engineering Lead  
> **Created**: February 25, 2026  
> **Status**: Draft  
> **Related**: [ROADMAP.md](../ROADMAP.md), [copilot-instructions.md](../.github/copilot-instructions.md)

---

## Executive Summary

This document outlines the implementation plan for a **two-dimensional access control system** in Vitora HMIS:

1. **Role-Based Access Control (RBAC)**: What a *user* can see and do based on their role
2. **Capability-Based Access Control**: What a *facility* offers based on its services

The combination ensures that:
- A **nurse at a Level 4 hospital** sees inpatient wards, lab, pharmacy
- A **nurse at a Level 2 dispensary** sees only outpatient and pharmacy (no lab, no inpatient)
- A **clinician** can prescribe; a **nurse** in the same module cannot

---

## Table of Contents

1. [Current State](#current-state)
2. [Problem Statement](#problem-statement)
3. [Architecture Overview](#architecture-overview)
4. [RBAC Implementation](#rbac-implementation)
5. [Capability Implementation](#capability-implementation)
6. [Combined Access Formula](#combined-access-formula)
7. [Implementation Phases](#implementation-phases)
8. [API Contracts](#api-contracts)
9. [Frontend Components](#frontend-components)
10. [Testing Strategy](#testing-strategy)
11. [Migration Plan](#migration-plan)

---

## Current State

### What Exists

| Component | Status | Location |
|-----------|--------|----------|
| `Role` model | ✅ Exists | `backend/hmis/apps/core/models.py` |
| `StaffProfile` model | ✅ Exists | `backend/hmis/apps/core/models.py` |
| `permissions_matrix` JSONField | ✅ Exists (unused) | `Role.permissions_matrix` |
| `usePermissions` hook | ✅ Partial | `web-app/lib/hooks/use-permissions.ts` |
| Navigation config | ✅ Static | `web-app/lib/config/navigation.ts` |
| Facility model | ❌ Missing | - |
| Module-based nav filtering | ❌ Missing | - |
| Action-based permission checks | ❌ Partial | - |

### Current Role Model

```python
class Role(models.Model):
    code = models.CharField(max_length=30, unique=True)  # e.g., "DOCTOR", "NURSE"
    name = models.CharField(max_length=100)
    category = models.CharField(choices=ROLE_CATEGORIES)  # CLINICAL, ADMINISTRATIVE, etc.
    permissions_matrix = models.JSONField(default=dict)  # Currently unused
    hierarchy_level = models.PositiveIntegerField(default=0)
    parent_role = models.ForeignKey("self", null=True)
    django_group = models.OneToOneField("auth.Group", null=True)
    requires_license = models.BooleanField(default=False)
    license_body = models.CharField(max_length=100, blank=True)  # KMPDB, NCK, etc.
```

---

## Problem Statement

### Current Issues

1. **All-or-nothing navigation**: Every user sees all sidebar items regardless of role
2. **No facility-level control**: A Level 2 dispensary shows Lab/Theatre modules it doesn't have
3. **Inconsistent permission checks**: Some pages check permissions, most don't
4. **Action vs Access confusion**: Navigation visibility conflated with action permissions

### Target State

```
┌─────────────────────────────────────────────────────────────────┐
│                     Access Control Matrix                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐             │
│  │  RBAC (User-Based)  │    │ Capability (Facility)│             │
│  │                     │    │                      │             │
│  │  Q: Can THIS USER   │    │  Q: Does THIS PLACE  │             │
│  │     access module?  │    │     have service?    │             │
│  │                     │    │                      │             │
│  │  • Role category    │ ∩  │  • Facility level    │             │
│  │  • Permissions list │    │  • Enabled modules   │             │
│  │  • Hierarchy level  │    │  • SHA registration  │             │
│  └──────────┬──────────┘    └──────────┬───────────┘             │
│             │                          │                         │
│             └────────────┬─────────────┘                         │
│                          │                                       │
│                          ▼                                       │
│             ┌────────────────────────┐                           │
│             │   VISIBLE = true/false │                           │
│             └────────────────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

### Two-Layer Permission Model

#### Layer 1: Module Access (Navigation Visibility)

**Question**: "Can I see this section in the sidebar?"

This is a **coarse-grained** check based on:
- User's role category (CLINICAL, ADMINISTRATIVE, TECHNICAL)
- Facility's enabled modules

| Module | Clinical | Admin | Technical | Billing |
|--------|----------|-------|-----------|---------|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Patients | ✅ | ✅ | ❌ | ✅ |
| Triage | ✅ | ❌ | ❌ | ❌ |
| Encounters | ✅ | ❌ | ❌ | ❌ |
| Inpatient | ✅ | ✅ | ❌ | ❌ |
| Pharmacy | ✅ | ✅ | ❌ | ❌ |
| Laboratory | ✅ | ✅ | ✅ | ❌ |
| Imaging | ✅ | ✅ | ✅ | ❌ |
| Billing | ❌ | ✅ | ❌ | ✅ |
| Admin | ❌ | ✅ | ✅ | ❌ |

#### Layer 2: Action Permissions (Feature Visibility)

**Question**: "Can I perform this action within the module?"

This is a **fine-grained** check based on:
- Specific Django permissions
- Role-action mappings

**Example: Inpatient Module**

| Action | Doctor | Clinical Officer | Nurse | Admin |
|--------|--------|------------------|-------|-------|
| View ward/patients | ✅ | ✅ | ✅ | ✅ |
| Record vitals | ✅ | ✅ | ✅ | ❌ |
| Make rounds notes | ✅ | ✅ | ❌ | ❌ |
| Prescribe medications | ✅ | ✅ | ❌ | ❌ |
| Administer medications | ✅ | ✅ | ✅ | ❌ |
| Order labs/imaging | ✅ | ✅ | ❌ | ❌ |
| Discharge patient | ✅ | ✅ | ❌ | ❌ |
| Transfer patient | ✅ | ✅ | ✅ | ❌ |

**Example: Pharmacy Module**

| Action | Pharmacist | Pharmacy Tech | Nurse | Clinician |
|--------|------------|---------------|-------|-----------|
| View prescriptions | ✅ | ✅ | ✅ | ✅ |
| Dispense medication | ✅ | ✅ | ❌ | ❌ |
| Verify prescription | ✅ | ❌ | ❌ | ❌ |
| Manage stock | ✅ | ✅ | ❌ | ❌ |
| Request refill | ✅ | ✅ | ✅ | ✅ |

---

## RBAC Implementation

### Phase 1: Permission Constants & Types

**File**: `web-app/lib/permissions/constants.ts`

```typescript
/**
 * Module access permissions
 * Maps sidebar modules to required Django permission
 */
export const MODULE_PERMISSIONS = {
  dashboard: null, // Everyone
  checkin: 'checkin.view_checkin',
  patients: 'patients.view_patient',
  triage: 'triage.view_triageassessment',
  emergency: 'encounters.view_encounter',
  surveillance: 'surveillance.view_notifiablecase',
  clinics: 'clinics.view_clinic',
  encounters: 'encounters.view_encounter',
  inpatient: 'inpatient.view_admission',
  pharmacy: 'pharmacy.view_prescription',
  laboratory: 'laboratory.view_laborder',
  imaging: 'imaging.view_imagingorder',
  theatre: 'scheduling.view_surgerycase',
  billing: 'billing.view_invoice',
  admin: 'core.view_staffprofile',
} as const;

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;
```

> **✅ Phase 1 Implemented** (March 9, 2026)
> - Created `web-app/lib/permissions/constants.ts` — `MODULE_PERMISSIONS` mapping 15 sidebar modules to Django permissions (or `null` for dashboard), plus `ModuleKey` type.
> - Created `web-app/lib/permissions/actions.ts` — `ACTION_PERMISSIONS` mapping 35 fine-grained actions across 7 modules (Inpatient, Pharmacy, Laboratory, Imaging, Billing, Encounters, Admin) to allowed roles, plus `ActionKey` type.
> - Both files compile cleanly with `npx tsc --noEmit`.

**File**: `web-app/lib/permissions/actions.ts`

```typescript
/**
 * Action permissions by module
 * Maps specific actions to allowed roles
 */
export const ACTION_PERMISSIONS = {
  // === Inpatient Module ===
  'inpatient.view_ward': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'ADMIN'],
  'inpatient.record_vitals': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'inpatient.make_rounds': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.prescribe': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.administer_medication': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'inpatient.order_lab': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.order_imaging': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.discharge': ['DOCTOR', 'CLINICAL_OFFICER'],
  'inpatient.transfer': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  
  // === Pharmacy Module ===
  'pharmacy.view_prescriptions': ['PHARMACIST', 'PHARMACY_TECH', 'NURSE', 'DOCTOR'],
  'pharmacy.dispense': ['PHARMACIST', 'PHARMACY_TECH'],
  'pharmacy.verify_prescription': ['PHARMACIST'],
  'pharmacy.manage_stock': ['PHARMACIST', 'PHARMACY_TECH', 'STORE_KEEPER'],
  'pharmacy.adjust_inventory': ['PHARMACIST', 'STORE_KEEPER'],
  
  // === Laboratory Module ===
  'laboratory.view_orders': ['LAB_TECHNICIAN', 'LAB_SCIENTIST', 'DOCTOR', 'NURSE'],
  'laboratory.collect_sample': ['LAB_TECHNICIAN', 'PHLEBOTOMIST', 'NURSE'],
  'laboratory.enter_results': ['LAB_TECHNICIAN', 'LAB_SCIENTIST'],
  'laboratory.verify_results': ['LAB_SCIENTIST', 'PATHOLOGIST'],
  'laboratory.release_results': ['LAB_SCIENTIST', 'PATHOLOGIST'],
  
  // === Imaging Module ===
  'imaging.view_orders': ['RADIOGRAPHER', 'RADIOLOGIST', 'DOCTOR', 'NURSE'],
  'imaging.perform_scan': ['RADIOGRAPHER'],
  'imaging.upload_images': ['RADIOGRAPHER'],
  'imaging.write_report': ['RADIOLOGIST'],
  'imaging.verify_report': ['RADIOLOGIST'],
  
  // === Billing Module ===
  'billing.view_invoices': ['BILLING_CLERK', 'CASHIER', 'BILLING_SUPERVISOR'],
  'billing.create_invoice': ['BILLING_CLERK', 'CASHIER'],
  'billing.record_payment': ['CASHIER', 'BILLING_CLERK'],
  'billing.apply_discount': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.void_invoice': ['BILLING_SUPERVISOR', 'ADMIN'],
  'billing.submit_sha_claim': ['BILLING_CLERK', 'BILLING_SUPERVISOR'],
  
  // === Encounters Module ===
  'encounters.create': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  'encounters.prescribe': ['DOCTOR', 'CLINICAL_OFFICER'],
  'encounters.order_lab': ['DOCTOR', 'CLINICAL_OFFICER'],
  'encounters.order_imaging': ['DOCTOR', 'CLINICAL_OFFICER'],
  'encounters.diagnose': ['DOCTOR', 'CLINICAL_OFFICER'],
  'encounters.refer': ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'],
  
  // === Admin Module ===
  'admin.manage_staff': ['ADMIN', 'HR_OFFICER'],
  'admin.manage_roles': ['ADMIN'],
  'admin.view_audit_logs': ['ADMIN', 'COMPLIANCE_OFFICER'],
  'admin.manage_facilities': ['ADMIN'],
} as const;

export type ActionKey = keyof typeof ACTION_PERMISSIONS;
```

### Phase 2: Enhanced usePermissions Hook

**File**: `web-app/lib/hooks/use-permissions.ts`

```typescript
import { useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';
import { MODULE_PERMISSIONS, ModuleKey } from '@/lib/permissions/constants';
import { ACTION_PERMISSIONS, ActionKey } from '@/lib/permissions/actions';

export interface PermissionsResult {
  // Module access (for navigation filtering)
  canAccessModule: (module: ModuleKey) => boolean;
  
  // Action permissions (for button/feature visibility)
  canPerformAction: (action: ActionKey) => boolean;
  
  // Generic permission check (Django format)
  hasPermission: (permission: string) => boolean;
  
  // User context
  role: string | null;
  roleCategory: string | null;
  isAuthenticated: boolean;
  isSuperuser: boolean;
}

export function usePermissions(): PermissionsResult {
  const { user, isAuthenticated } = useAuth();

  const isSuperuser = useMemo(() => {
    return user?.is_superuser === true;
  }, [user]);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!isAuthenticated || !user) return false;
    if (isSuperuser) return true;
    
    const userPerms = user.permissions || [];
    // Check exact match or codename-only match
    return userPerms.includes(permission) || 
           userPerms.some(p => p.endsWith(`.${permission}`));
  }, [user, isAuthenticated, isSuperuser]);

  const canAccessModule = useCallback((module: ModuleKey): boolean => {
    if (!isAuthenticated) return false;
    if (isSuperuser) return true;
    
    const requiredPerm = MODULE_PERMISSIONS[module];
    if (!requiredPerm) return true; // null = no permission required
    
    return hasPermission(requiredPerm);
  }, [isAuthenticated, isSuperuser, hasPermission]);

  const canPerformAction = useCallback((action: ActionKey): boolean => {
    if (!isAuthenticated || !user) return false;
    if (isSuperuser) return true;
    
    const allowedRoles = ACTION_PERMISSIONS[action];
    if (!allowedRoles) return false;
    
    const userRole = user.role || '';
    return allowedRoles.includes(userRole as any);
  }, [user, isAuthenticated, isSuperuser]);

  return useMemo(() => ({
    canAccessModule,
    canPerformAction,
    hasPermission,
    role: user?.role || null,
    roleCategory: user?.role_category || null,
    isAuthenticated,
    isSuperuser,
  }), [
    canAccessModule,
    canPerformAction,
    hasPermission,
    user?.role,
    user?.role_category,
    isAuthenticated,
    isSuperuser,
  ]);
}
```

> **✅ Phase 2 Implemented** (March 9, 2026)
> - Enhanced `web-app/lib/hooks/use-permissions.ts` with two new capabilities:
>   - `canAccessModule(module)` — Layer 1 check against `MODULE_PERMISSIONS` (Django permission lookup, superuser bypass, `null` = open access).
>   - `canPerformAction(action)` — Layer 2 check against `ACTION_PERMISSIONS` (role-based lookup, superuser bypass).
>   - `roleCategory` — Exposed in return value (reads `role_category` from user object).
> - Refactored `hasPermission`, `isSuperuser`, `isAdmin` to stable `useCallback`/`useMemo` for proper dependency tracking.
> - All legacy properties preserved (`canEditPatient`, `canEditIdentity`, `canCreateInvoice`, `canCreateEncounter`, `canViewSensitive`).
> - All 14 existing tests pass, zero TypeScript errors.

### Phase 3: Navigation with Module Keys

**File**: `web-app/lib/config/navigation.ts`

```typescript
export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey?: ModuleKey;        // RBAC: required module permission
  facilityModule?: FacilityModule; // Capability: required facility service
  badge?: number;
}

export interface NavItemWithChildren {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey?: ModuleKey;
  facilityModule?: FacilityModule;
  children: NavItem[];
}

export const mainNavItems: NavItemType[] = [
  { 
    label: 'Dashboard', 
    href: '/', 
    icon: LayoutDashboard,
    moduleKey: 'dashboard',
  },
  { 
    label: 'Check-in', 
    href: '/patients/checkin', 
    icon: UserCheck,
    moduleKey: 'checkin',
  },
  { 
    label: 'Patients', 
    href: '/patients', 
    icon: Users,
    moduleKey: 'patients',
  },
  { 
    label: 'Triage', 
    href: '/triage', 
    icon: AlertTriangle,
    moduleKey: 'triage',
  },
  {
    label: 'Inpatient',
    icon: BedDouble,
    moduleKey: 'inpatient',
    facilityModule: 'inpatient', // Only show if facility has inpatient services
    children: [
      { label: 'Wards', href: '/wards', icon: Building2 },
      { label: 'Admissions', href: '/admissions', icon: ClipboardList },
    ],
  },
  { 
    label: 'Pharmacy', 
    href: '/pharmacy', 
    icon: Pill,
    moduleKey: 'pharmacy',
    facilityModule: 'pharmacy',
  },
  {
    label: 'Diagnostics',
    icon: FlaskConical,
    children: [
      { 
        label: 'Laboratory', 
        href: '/laboratory', 
        icon: Microscope,
        moduleKey: 'laboratory',
        facilityModule: 'laboratory',
      },
      { 
        label: 'Imaging', 
        href: '/imaging', 
        icon: ScanLine,
        moduleKey: 'imaging',
        facilityModule: 'imaging',
      },
    ],
  },
  {
    label: 'Theatre',
    icon: Scissors,
    moduleKey: 'theatre',
    facilityModule: 'theatre',
    children: [
      { label: 'Schedule', href: '/theatre/schedule', icon: CalendarDays },
      { label: 'Cases', href: '/theatre/cases', icon: ClipboardList },
    ],
  },
  {
    label: 'Finance',
    icon: BadgeCent,
    moduleKey: 'billing',
    children: [
      { label: 'Invoices', href: '/transactions/invoices', icon: FileText },
      { label: 'Payments', href: '/transactions/payments', icon: CreditCard },
      { label: 'SHA Claims', href: '/transactions/sha-claims', icon: SHAIcon },
    ],
  },
  {
    label: 'Admin',
    icon: ShieldUser,
    moduleKey: 'admin',
    children: [
      { label: 'Staff', href: '/admin/staff', icon: UserCog },
      { label: 'Roles', href: '/admin/roles', icon: ShieldUser },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText },
    ],
  },
];
```

> **✅ Phase 3 Implemented** (March 9, 2026)
> - Added `moduleKey?: ModuleKey` to `NavItem` and `NavItemWithChildren` interfaces.
> - Annotated all 15 nav items with their `moduleKey` (dashboard, checkin, patients, triage, emergency, surveillance, clinics, encounters, inpatient, pharmacy, laboratory, imaging, theatre, billing, admin).
> - Nav items without a module key (MCH, Allied Health, Quality, CDS, AI Assistant) remain visible to all users.
> - Zero TypeScript errors.

### Phase 4: Sidebar Filtering

**File**: `web-app/components/layout/sidebar.tsx`

```typescript
// Add filtering logic
function useFilteredNavItems() {
  const { canAccessModule } = usePermissions();
  const { facility } = useFacility(); // From capability context
  
  return useMemo(() => {
    const filterItem = (item: NavItemType): NavItemType | null => {
      // Check RBAC (user role)
      if (item.moduleKey && !canAccessModule(item.moduleKey)) {
        return null;
      }
      
      // Check Capability (facility services)
      if (item.facilityModule && !facility?.modules?.[item.facilityModule]) {
        return null;
      }
      
      // For parent items with children, filter children
      if (hasChildren(item)) {
        const filteredChildren = item.children
          .map(child => filterItem(child))
          .filter(Boolean) as NavItem[];
        
        // Hide parent if no children remain
        if (filteredChildren.length === 0) return null;
        
        return { ...item, children: filteredChildren };
      }
      
      return item;
    };
    
    return mainNavItems
      .map(filterItem)
      .filter(Boolean) as NavItemType[];
  }, [canAccessModule, facility]);
}
```

> **✅ Phase 4 Implemented** (March 9, 2026)
> - Added `useFilteredNavItems()` hook to `web-app/components/layout/sidebar.tsx`.
> - Filters both top-level items and children within parent groups based on `canAccessModule()`.
> - Parent groups with no visible children are automatically hidden.
> - Sidebar renders `filteredNavItems` instead of raw `mainNavItems`.
> - Auto-open logic respects filtered parents (won't try to open a removed group).
> - Updated sidebar tests: added `usePermissions` mock (superuser = all access), fixed stale "Diagnostics" references to match current nav structure.
> - All 14 sidebar tests pass, all 14 permission tests pass, zero TypeScript errors.

---

## Capability Implementation

### Phase 1: Facility Model (Backend)

**File**: `backend/hmis/apps/core/models.py`

```python
class Facility(TimeStampedModel):
    """
    Healthcare facility with enabled service modules.
    
    Integrates with Kenya Master Facility List (MFL) for official registration
    and SHA for claims eligibility.
    """
    
    FACILITY_LEVELS = [
        ('1', 'Level 1 - Community Unit'),
        ('2', 'Level 2 - Dispensary'),
        ('3', 'Level 3 - Health Centre'),
        ('4', 'Level 4 - Sub-County Hospital'),
        ('5', 'Level 5 - County Referral Hospital'),
        ('6', 'Level 6 - National Referral Hospital'),
    ]
    
    OWNERSHIP_TYPES = [
        ('GOK', 'Government of Kenya'),
        ('FBO', 'Faith-Based Organization'),
        ('NGO', 'Non-Governmental Organization'),
        ('PRIVATE', 'Private Practice'),
    ]
    
    # === Identity ===
    mfl_code = models.CharField(
        max_length=20,
        unique=True,
        help_text="Kenya Master Facility List code",
    )
    name = models.CharField(max_length=200)
    level = models.CharField(max_length=1, choices=FACILITY_LEVELS)
    ownership = models.CharField(max_length=20, choices=OWNERSHIP_TYPES)
    
    # === Location ===
    county = models.ForeignKey('County', on_delete=models.PROTECT)
    sub_county = models.ForeignKey('SubCounty', on_delete=models.PROTECT)
    ward = models.ForeignKey('Ward', on_delete=models.PROTECT, null=True, blank=True)
    
    # === SHA Registration ===
    sha_contracted = models.BooleanField(
        default=False,
        help_text="Whether facility is SHA-contracted for claims",
    )
    sha_contract_expiry = models.DateField(null=True, blank=True)
    sha_facility_code = models.CharField(max_length=50, blank=True)
    
    # === Enabled Modules (Capability-Based) ===
    # Using explicit booleans for type safety and query performance
    has_outpatient = models.BooleanField(default=True)
    has_inpatient = models.BooleanField(default=False)
    has_emergency = models.BooleanField(default=False)
    has_pharmacy = models.BooleanField(default=True)
    has_laboratory = models.BooleanField(default=False)
    has_imaging = models.BooleanField(default=False)
    has_theatre = models.BooleanField(default=False)
    has_dialysis = models.BooleanField(default=False)
    has_icu = models.BooleanField(default=False)
    has_maternity = models.BooleanField(default=False)
    has_mortuary = models.BooleanField(default=False)
    has_blood_bank = models.BooleanField(default=False)
    
    # OR use JSONField for flexibility (alternative approach)
    # modules_config = models.JSONField(default=dict)
    
    # === Status ===
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = "Facility"
        verbose_name_plural = "Facilities"
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.mfl_code})"
    
    @property
    def modules(self) -> dict:
        """Return enabled modules as a dict for API response."""
        return {
            'outpatient': self.has_outpatient,
            'inpatient': self.has_inpatient,
            'emergency': self.has_emergency,
            'pharmacy': self.has_pharmacy,
            'laboratory': self.has_laboratory,
            'imaging': self.has_imaging,
            'theatre': self.has_theatre,
            'dialysis': self.has_dialysis,
            'icu': self.has_icu,
            'maternity': self.has_maternity,
            'mortuary': self.has_mortuary,
            'blood_bank': self.has_blood_bank,
        }
    
    @classmethod
    def default_modules_for_level(cls, level: str) -> dict:
        """Return default enabled modules based on facility level."""
        defaults = {
            '1': {'outpatient': True, 'pharmacy': True},
            '2': {'outpatient': True, 'pharmacy': True},
            '3': {'outpatient': True, 'pharmacy': True, 'laboratory': True, 'maternity': True},
            '4': {'outpatient': True, 'inpatient': True, 'emergency': True, 'pharmacy': True, 
                  'laboratory': True, 'imaging': True, 'theatre': True, 'maternity': True},
            '5': {'outpatient': True, 'inpatient': True, 'emergency': True, 'pharmacy': True,
                  'laboratory': True, 'imaging': True, 'theatre': True, 'icu': True, 
                  'maternity': True, 'dialysis': True},
            '6': {'outpatient': True, 'inpatient': True, 'emergency': True, 'pharmacy': True,
                  'laboratory': True, 'imaging': True, 'theatre': True, 'icu': True,
                  'maternity': True, 'dialysis': True, 'blood_bank': True, 'mortuary': True},
        }
        return defaults.get(level, {'outpatient': True, 'pharmacy': True})
```

> **✅ Phase 1 Implemented** (March 9, 2026)
> - Added `Facility` model to `backend/hmis/apps/core/models.py` with `FacilityLevel` and `OwnershipType` TextChoices enums, MFL code (unique), location FKs (County/SubCounty/Ward with PROTECT), SHA registration fields, 12 explicit boolean module flags, `is_active` status.
> - `modules` property returns all 12 flags as a dictionary; `enabled_module_names` returns only enabled module names.
> - `default_modules_for_level()` class method provides KEPH-level defaults (Level 1–2: outpatient+pharmacy; Level 6: all modules).
> - Three serializers: `FacilityListSerializer` (compact), `FacilityDetailSerializer` (full with modules map), `FacilityCreateSerializer` (location hierarchy validation, auto-applies KEPH defaults when no module flags provided).
> - `FacilityViewSet` with action-based serializer selection, admin-only write permissions, query-param filtering (level, ownership, county, `has_*` module flags), search by name/MFL code, audit logging on create/update/delete.
> - Custom `/api/facilities/default_modules/?level=N` action for frontend module pre-population.
> - `FacilityAdmin` with colour-coded KEPH level badges, module flag list filters, grouped fieldsets.
> - Migration `0023_facility_model` applied.
> - **36 tests** (9 model, 6 serializer, 21 API) — all passing.
> - Registered on main router at `/api/facilities/`.

### Phase 2: Link Staff to Facility

**Update**: `backend/hmis/apps/core/models.py` - StaffProfile

```python
class StaffProfile(models.Model):
    # ... existing fields ...
    
    # Add facility assignment
    primary_facility = models.ForeignKey(
        'Facility',
        on_delete=models.PROTECT,
        related_name='staff',
        help_text="Primary work facility",
    )
    secondary_facilities = models.ManyToManyField(
        'Facility',
        blank=True,
        related_name='secondary_staff',
        help_text="Additional facilities (for multi-site workers)",
    )
```

> **✅ Phase 2 Implemented** (March 9, 2026)
> - Added `primary_facility` FK (nullable, `PROTECT`) and `secondary_facilities` M2M to `StaffProfile` in `backend/hmis/apps/core/models.py`.
> - Added `get_all_facilities()` method returning primary + secondary facilities (primary first, deduplicated).
> - Updated `StaffProfileSerializer` with `primary_facility_name` (resolved read-only) and `secondary_facilities` (nested `FacilityListSerializer`, read-only).
> - Updated `StaffProfileUpdateSerializer` and `StaffProfileCreateSerializer` to accept `primary_facility` and `secondary_facilities` fields.
> - Updated `StaffProfileViewSet` with `select_related("primary_facility")` and `prefetch_related("secondary_facilities")` for query optimisation; added `primary_facility` to filterset fields.
> - Updated `StaffProfileAdmin` with `primary_facility` in list display/filters, `filter_horizontal` for secondary facilities, and a dedicated "Facility Assignment" fieldset.
> - Migration `0024_staff_facility_link` applied.
> - **20 tests** (9 model, 4 serializer, 7 API) — covering FK/M2M assignment, `get_all_facilities()`, `PROTECT` delete guard, reverse relations, serializer field resolution, API CRUD with facility, and staff-by-facility filtering.

### Phase 3: Facility API & Context

**File**: `backend/hmis/apps/core/serializers.py`

```python
class FacilitySerializer(serializers.ModelSerializer):
    modules = serializers.ReadOnlyField()
    county_name = serializers.CharField(source='county.name', read_only=True)
    
    class Meta:
        model = Facility
        fields = [
            'id', 'mfl_code', 'name', 'level', 'ownership',
            'county', 'county_name', 'sub_county', 'ward',
            'sha_contracted', 'sha_facility_code',
            'modules', 'is_active',
        ]
```

**File**: `web-app/lib/context/facility-context.tsx`

```typescript
interface FacilityModules {
  outpatient: boolean;
  inpatient: boolean;
  emergency: boolean;
  pharmacy: boolean;
  laboratory: boolean;
  imaging: boolean;
  theatre: boolean;
  dialysis: boolean;
  icu: boolean;
  maternity: boolean;
  mortuary: boolean;
  blood_bank: boolean;
}

interface Facility {
  id: number;
  mfl_code: string;
  name: string;
  level: string;
  modules: FacilityModules;
  sha_contracted: boolean;
}

interface FacilityContextValue {
  facility: Facility | null;
  isLoading: boolean;
  hasModule: (module: keyof FacilityModules) => boolean;
}

export function useFacility(): FacilityContextValue {
  // Derived from user's StaffProfile.primary_facility
  // Loaded on login along with user data
}
```

### Phase 4: Auth Response Enhancement

**Update JWT token claims or /api/me/ endpoint:**

```json
{
  "id": 1,
  "username": "nurse001",
  "email": "nurse@example.com",
  "role": "NURSE",
  "role_category": "CLINICAL",
  "permissions": ["patients.view_patient", "triage.add_triageassessment", ...],
  "facility": {
    "id": 1,
    "mfl_code": "12345",
    "name": "Kenyatta National Hospital",
    "level": "6",
    "modules": {
      "outpatient": true,
      "inpatient": true,
      "emergency": true,
      "pharmacy": true,
      "laboratory": true,
      "imaging": true,
      "theatre": true,
      "icu": true
    },
    "sha_contracted": true
  }
}
```

---

## Combined Access Formula

### Navigation Visibility

```typescript
const isNavItemVisible = (item: NavItem): boolean => {
  // 1. Check RBAC (user has module permission)
  if (item.moduleKey && !canAccessModule(item.moduleKey)) {
    return false;
  }
  
  // 2. Check Capability (facility has service)
  if (item.facilityModule && !hasModule(item.facilityModule)) {
    return false;
  }
  
  return true;
};
```

### Action Visibility

```typescript
const isActionAllowed = (action: ActionKey): boolean => {
  // Only check RBAC for actions (facility already confirmed by nav visibility)
  return canPerformAction(action);
};
```

### Full Example Matrix

| User | Role | Facility | Sees Nav | Can Prescribe |
|------|------|----------|----------|---------------|
| Dr. Wanjiku | DOCTOR | Level 6 (all modules) | All clinical | ✅ |
| Nurse Alice | NURSE | Level 6 (all modules) | All clinical | ❌ |
| Nurse Bob | NURSE | Level 2 (no lab) | No Lab/Imaging | ❌ |
| Pharmacist | PHARMACIST | Level 3 | Only Pharmacy | ❌ |
| Admin Mary | ADMIN | Level 4 | Everything | ✅ (superuser) |

---

## Implementation Phases

### Phase 1: RBAC Foundation (Week 1)
- [ ] Create `web-app/lib/permissions/constants.ts`
- [ ] Create `web-app/lib/permissions/actions.ts`
- [ ] Update `usePermissions` hook with `canAccessModule()` and `canPerformAction()`
- [ ] Add `moduleKey` to navigation config
- [ ] Filter sidebar based on RBAC
- [ ] Add route guards for protected pages
- [ ] Write unit tests for permission logic

**Effort**: 8-12 hours  
**Dependencies**: None  
**Deliverables**: Role-filtered navigation working

### Phase 2: Action Permissions (Week 2)
- [ ] Implement `canPerformAction()` in all relevant components
- [ ] Add permission-based button visibility (inpatient, pharmacy, lab, billing)
- [ ] Add API-level permission checks (backend)
- [ ] Create `PermissionGate` component for declarative permission checks
- [ ] Write E2E tests for permission-restricted actions

**Effort**: 12-16 hours  
**Dependencies**: Phase 1  
**Deliverables**: Action buttons show/hide based on role

### Phase 3: Facility Model (Week 3)
- [ ] Create `Facility` model with migrations
- [ ] Add `primary_facility` to `StaffProfile`
- [ ] Create `FacilitySerializer` and API endpoints
- [ ] Seed data with Kenya MFL facility levels
- [ ] Create admin interface for facility management

**Effort**: 8-12 hours  
**Dependencies**: None (can parallel with Phase 1-2)  
**Deliverables**: Facility model in database

### Phase 4: Capability Context (Week 4)
- [ ] Create `FacilityContext` provider
- [ ] Add facility to auth response (`/api/me/`)
- [ ] Add `facilityModule` to navigation config
- [ ] Combine RBAC + Capability filtering in sidebar
- [ ] Write integration tests

**Effort**: 8-12 hours  
**Dependencies**: Phase 3  
**Deliverables**: Capability-filtered navigation working

### Phase 5: Polish & Documentation (Week 5)
- [ ] Create admin UI for role permissions_matrix
- [ ] Create admin UI for facility module toggles
- [ ] Write user documentation
- [ ] Add permission debugging tools (dev mode)
- [ ] Performance optimization (caching)

**Effort**: 8-12 hours  
**Dependencies**: Phases 1-4  
**Deliverables**: Production-ready system

---

## API Contracts

### GET /api/me/ (Enhanced)

```json
{
  "id": 1,
  "username": "nurse001",
  "first_name": "Alice",
  "last_name": "Kamau",
  "email": "alice@hospital.co.ke",
  "is_staff": true,
  "is_superuser": false,
  "role": "NURSE",
  "role_category": "CLINICAL",
  "role_hierarchy_level": 3,
  "permissions": [
    "patients.view_patient",
    "patients.add_patient",
    "triage.view_triageassessment",
    "triage.add_triageassessment",
    "encounters.view_encounter",
    "inpatient.view_admission",
    "pharmacy.view_prescription"
  ],
  "facility": {
    "id": 1,
    "mfl_code": "12345",
    "name": "Kenyatta National Hospital",
    "level": "6",
    "modules": {
      "outpatient": true,
      "inpatient": true,
      "emergency": true,
      "pharmacy": true,
      "laboratory": true,
      "imaging": true,
      "theatre": true,
      "icu": true,
      "maternity": true,
      "dialysis": true,
      "blood_bank": true,
      "mortuary": true
    },
    "sha_contracted": true
  }
}
```

### GET /api/facilities/

```json
{
  "count": 50,
  "results": [
    {
      "id": 1,
      "mfl_code": "12345",
      "name": "Kenyatta National Hospital",
      "level": "6",
      "county_name": "Nairobi",
      "modules": { ... },
      "sha_contracted": true
    }
  ]
}
```

### GET /api/roles/

```json
{
  "count": 15,
  "results": [
    {
      "id": 1,
      "code": "DOCTOR",
      "name": "Medical Officer",
      "category": "CLINICAL",
      "hierarchy_level": 2,
      "permissions_matrix": {
        "modules": {
          "patients": true,
          "encounters": true,
          "inpatient": true,
          "pharmacy": true,
          "laboratory": true,
          "imaging": true,
          "billing": false,
          "admin": false
        },
        "actions": {
          "encounters.prescribe": true,
          "encounters.order_lab": true,
          "inpatient.make_rounds": true,
          "inpatient.discharge": true
        }
      }
    }
  ]
}
```

---

## Frontend Components

### PermissionGate Component

```typescript
// components/shared/permission-gate.tsx

interface PermissionGateProps {
  /** Required module access */
  module?: ModuleKey;
  /** Required action permission */
  action?: ActionKey;
  /** Required facility module */
  facilityModule?: FacilityModule;
  /** Fallback component if access denied */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({ 
  module, 
  action, 
  facilityModule,
  fallback = null,
  children 
}: PermissionGateProps) {
  const { canAccessModule, canPerformAction } = usePermissions();
  const { hasModule } = useFacility();
  
  // Check all conditions
  if (module && !canAccessModule(module)) return fallback;
  if (action && !canPerformAction(action)) return fallback;
  if (facilityModule && !hasModule(facilityModule)) return fallback;
  
  return <>{children}</>;
}

// Usage
<PermissionGate action="inpatient.prescribe">
  <Button onClick={openPrescribeModal}>Prescribe</Button>
</PermissionGate>

<PermissionGate module="billing">
  <Link href="/billing">View Billing</Link>
</PermissionGate>

<PermissionGate facilityModule="laboratory">
  <LabOrderButton />
</PermissionGate>
```

### ActionButton Component

```typescript
// components/shared/action-button.tsx

interface ActionButtonProps extends ButtonProps {
  action: ActionKey;
  fallback?: React.ReactNode; // Show disabled button or nothing
}

export function ActionButton({ action, fallback, ...props }: ActionButtonProps) {
  const { canPerformAction } = usePermissions();
  
  if (!canPerformAction(action)) {
    if (fallback) return <>{fallback}</>;
    return null;
  }
  
  return <Button {...props} />;
}

// Usage
<ActionButton action="inpatient.discharge" onClick={handleDischarge}>
  Discharge Patient
</ActionButton>
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/lib/permissions/use-permissions.test.tsx

describe('usePermissions', () => {
  describe('canAccessModule', () => {
    it('returns true for superuser on any module', () => {
      mockAuth({ is_superuser: true });
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canAccessModule('admin')).toBe(true);
    });
    
    it('returns false for nurse accessing admin module', () => {
      mockAuth({ role: 'NURSE', permissions: ['patients.view_patient'] });
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canAccessModule('admin')).toBe(false);
    });
    
    it('returns true for null permission modules (dashboard)', () => {
      mockAuth({ role: 'NURSE', permissions: [] });
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canAccessModule('dashboard')).toBe(true);
    });
  });
  
  describe('canPerformAction', () => {
    it('returns true for doctor prescribing', () => {
      mockAuth({ role: 'DOCTOR' });
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canPerformAction('encounters.prescribe')).toBe(true);
    });
    
    it('returns false for nurse prescribing', () => {
      mockAuth({ role: 'NURSE' });
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canPerformAction('encounters.prescribe')).toBe(false);
    });
    
    it('returns true for nurse recording vitals', () => {
      mockAuth({ role: 'NURSE' });
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canPerformAction('inpatient.record_vitals')).toBe(true);
    });
  });
});
```

### E2E Tests

```typescript
// e2e/permissions.spec.ts

test.describe('Role-Based Navigation', () => {
  test('nurse sees clinical modules but not admin', async ({ page }) => {
    await loginAsNurse(page);
    
    // Should see
    await expect(page.getByRole('link', { name: 'Patients' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Triage' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Inpatient' })).toBeVisible();
    
    // Should NOT see
    await expect(page.getByRole('link', { name: 'Admin' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Billing' })).not.toBeVisible();
  });
  
  test('nurse cannot prescribe on ward', async ({ page }) => {
    await loginAsNurse(page);
    await page.goto('/wards/1/patients/1');
    
    // Should see Record Vitals
    await expect(page.getByRole('button', { name: 'Record Vitals' })).toBeVisible();
    
    // Should NOT see Prescribe
    await expect(page.getByRole('button', { name: 'Prescribe' })).not.toBeVisible();
  });
  
  test('doctor can prescribe on ward', async ({ page }) => {
    await loginAsDoctor(page);
    await page.goto('/wards/1/patients/1');
    
    // Should see Prescribe
    await expect(page.getByRole('button', { name: 'Prescribe' })).toBeVisible();
  });
});

test.describe('Facility-Based Navigation', () => {
  test('level 2 dispensary hides lab module', async ({ page }) => {
    await loginAsNurseAtLevel2(page);
    
    // Should NOT see Lab (facility doesn't have it)
    await expect(page.getByRole('link', { name: 'Laboratory' })).not.toBeVisible();
    
    // Should see Pharmacy (all facilities have it)
    await expect(page.getByRole('link', { name: 'Pharmacy' })).toBeVisible();
  });
});
```

---

## Migration Plan

### Data Migration

1. **Create Facility records** from MFL import or manual entry
2. **Assign staff to facilities** via StaffProfile update
3. **Populate permissions_matrix** for each Role

### Rollout Strategy

1. **Phase A**: Deploy with feature flag disabled (navigation unchanged)
2. **Phase B**: Enable for admin users only (test in production)
3. **Phase C**: Enable for all users at pilot facility
4. **Phase D**: Gradual rollout to remaining facilities

### Feature Flags

```python
# backend/hmis/settings/base.py

RBAC_NAVIGATION_FILTERING = os.getenv('RBAC_NAVIGATION_FILTERING', 'false') == 'true'
CAPABILITY_NAVIGATION_FILTERING = os.getenv('CAPABILITY_NAVIGATION_FILTERING', 'false') == 'true'
```

```typescript
// Frontend feature flags via env
const FEATURE_FLAGS = {
  rbacNavigation: process.env.NEXT_PUBLIC_RBAC_NAVIGATION === 'true',
  capabilityNavigation: process.env.NEXT_PUBLIC_CAPABILITY_NAVIGATION === 'true',
};
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Navigation accuracy | 100% | No unauthorized module access |
| Action permission accuracy | 100% | No unauthorized action execution |
| Page load time impact | <50ms | Performance monitoring |
| Support tickets (access issues) | ↓ 50% | Help desk tracking |
| User satisfaction | ≥4/5 | User survey |

---

## Appendix: Kenya Facility Levels & Default Modules

| Level | Description | Default Modules |
|-------|-------------|-----------------|
| 1 | Community Unit | Outpatient only |
| 2 | Dispensary | Outpatient, Pharmacy |
| 3 | Health Centre | Outpatient, Pharmacy, Lab (basic), Maternity |
| 4 | Sub-County Hospital | Outpatient, Inpatient, Emergency, Pharmacy, Lab, Imaging, Theatre, Maternity |
| 5 | County Referral | All of Level 4 + ICU, Dialysis |
| 6 | National Referral | All modules |

---

## References

- [Kenya Master Facility List](http://kmhfl.health.go.ke/)
- [SHA Provider Registration](https://sha.go.ke/)
- [KMPDB Licensing](https://kmpdb.go.ke/)
- [Nursing Council of Kenya](https://nck.or.ke/)

---

**Document Status**: Draft  
**Last Updated**: February 25, 2026  
**Next Review**: After Phase 1 implementation
