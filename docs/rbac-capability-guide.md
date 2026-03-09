# RBAC & Capability-Based Access Control — User Guide

> **Audience**: System administrators, facility IT staff, developers  
> **Last Updated**: March 9, 2026

---

## Overview

Vitora HMIS uses a **two-dimensional access control** system:

| Dimension | Question | Controlled By |
|-----------|----------|---------------|
| **RBAC** (Role-Based) | *Can this **user** see/do this?* | Staff role (Doctor, Nurse, etc.) |
| **Capability** (Facility-Based) | *Does this **facility** offer this service?* | Facility KEPH level & enabled modules |

A feature is visible only when **both** checks pass.

---

## How It Works

### Sidebar Navigation

The sidebar only shows modules that the user's role allows **and** the facility supports:

```
Visible = RBAC allows module  AND  Facility has module enabled
```

**Example scenarios:**

| User | Facility | Sees Pharmacy? | Sees Theatre? | Sees Lab? |
|------|----------|---------------|---------------|-----------|
| Doctor at KNH (Level 6) | All modules ON | ✅ | ✅ | ✅ |
| Nurse at Dispensary (Level 2) | Pharmacy ON, Lab OFF | ✅ | ❌ | ❌ |
| Billing Clerk at Level 4 | All clinical ON | ❌ (RBAC) | ❌ (RBAC) | ❌ (RBAC) |

### Page-Level Route Guards

If a user navigates directly to a restricted URL (e.g. `/pharmacy` when they lack pharmacy access), a **Route Guard** blocks the page and shows an "Access Denied" message. This prevents bookmark/URL-based bypasses.

Protected routes and their required modules:

| Route Prefix | Required Module |
|-------------|-----------------|
| `/pharmacy` | pharmacy |
| `/laboratory` | laboratory |
| `/admissions`, `/wards`, `/inpatient` | inpatient |
| `/encounters` | encounters |
| `/transactions`, `/finance`, `/insurance` | billing |
| `/imaging` | imaging |
| `/theatre` | theatre |
| `/triage` | triage |
| `/emergency` | emergency |
| `/patients`, `/patients/checkin` | patients / checkin |
| `/surveillance` | surveillance |
| `/clinics` | clinics |
| `/admin`, `/reports` | admin |

Routes without a module requirement (e.g. `/dashboard`, `/`) are accessible to all authenticated users.

### Action-Level Permission Gates

Within a module, individual buttons/actions are gated by **fine-grained action permissions**. For example:

| Module | Action | Who Can Do It |
|--------|--------|---------------|
| Pharmacy | Dispense medication | Pharmacist, Pharmacy Tech |
| Billing | Apply discount | Billing Officer, Admin |
| Billing | Cancel/void invoice | Admin only |
| Billing | Record payment | Billing Officer, Cashier |
| Inpatient | Discharge patient | Doctor, Clinical Officer |
| Inpatient | Transfer patient | Doctor, Clinical Officer, Nurse |
| Laboratory | Collect sample | Lab Technician, Lab Tech |
| Laboratory | Enter results | Lab Technician |

Users without the required action permission simply don't see the button — no error, no confusion.

---

## Administration

### Managing Roles

Navigate to **Admin → Roles** to view and edit roles.

Each role has:
- **Code**: Unique identifier (e.g. `DOCTOR`, `NURSE`, `PHARMACIST`)
- **Category**: `CLINICAL`, `ADMINISTRATIVE`, `TECHNICAL`, `BILLING`, `SUPPORT`
- **Permissions Matrix**: JSON object mapping module keys to allowed actions
- **Hierarchy Level**: Numeric rank for role inheritance (higher level inherits lower)

### Managing Facility Modules

Navigate to **Admin → Facilities** or use the Django admin.

Each facility has boolean flags for each service module:
- `has_outpatient`, `has_inpatient`, `has_emergency`
- `has_pharmacy`, `has_laboratory`, `has_imaging`
- `has_theatre`, `has_dialysis`, `has_icu`
- `has_maternity`, `has_mortuary`, `has_blood_bank`

Toggling a flag immediately hides/shows the corresponding sidebar item for **all staff** at that facility.

### Seeding Demo Facilities

For development or staging environments:

```bash
cd backend
poetry run python manage.py seed_facilities          # create representative facilities
poetry run python manage.py seed_facilities --force   # recreate even if they exist
```

This creates 8 facilities across KEPH levels 1–6 (community units through national referrals) with appropriate default modules.

### Default Modules by KEPH Level

| Level | Type | Modules Enabled |
|-------|------|-----------------|
| 1 | Community Unit | Outpatient |
| 2 | Dispensary | Outpatient, Pharmacy |
| 3 | Health Centre | Outpatient, Pharmacy, Lab (basic), Maternity |
| 4 | Sub-County Hospital | Outpatient, Inpatient, Emergency, Pharmacy, Lab, Imaging, Theatre, Maternity |
| 5 | County Referral | All of Level 4 + ICU, Dialysis |
| 6 | National Referral | All modules |

---

## Frontend Components Reference

### `PermissionGate`

A declarative wrapper that hides children when the user lacks a required permission. Use this to gate action buttons:

```tsx
import { PermissionGate } from '@/components/shared/permission-gate';

// Gate by action key
<PermissionGate action="pharmacy.dispense">
  <Button onClick={handleDispense}>Dispense</Button>
</PermissionGate>

// Gate by module access
<PermissionGate module="billing">
  <Card>Billing summary</Card>
</PermissionGate>

// Gate by raw permission
<PermissionGate permission="delete_patient">
  <Button variant="destructive">Delete</Button>
</PermissionGate>

// With custom fallback
<PermissionGate action="billing.void_invoice" fallback={<span>Contact admin</span>}>
  <Button>Void Invoice</Button>
</PermissionGate>
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `module` | `ModuleKey` | Check `canAccessModule(module)` |
| `action` | `ActionKey` | Check `canPerformAction(action)` |
| `permission` | `string` | Check `hasPermission(permission)` |
| `fallback` | `ReactNode` | Shown when denied (default: nothing) |
| `children` | `ReactNode` | Shown when allowed |

Multiple props can be combined — all must pass.

### `RouteGuard`

Wraps page content and blocks access if the current route's module is denied:

```tsx
<RouteGuard>
  {children}
</RouteGuard>
```

Already wired into the dashboard layout — you don't need to add it manually.

### `usePermissions` Hook

The primary hook for imperative permission checks:

```tsx
const {
  canAccessModule,    // (moduleKey: ModuleKey) => boolean
  canPerformAction,   // (actionKey: ActionKey) => boolean
  hasPermission,      // (permission: string) => boolean
  role,               // current user's role code
  roleCategory,       // CLINICAL | ADMINISTRATIVE | etc.
  isSuperuser,        // superusers bypass all checks
} = usePermissions();
```

### `useFacility` Hook

Access facility context:

```tsx
const {
  facility,    // UserFacility | null
  isLoading,   // boolean
  hasModule,   // (module: keyof FacilityModules) => boolean
} = useFacility();
```

When `facility` is null (e.g. user has no assigned facility), `hasModule` returns `true` for all modules.

---

## Debugging (Development Mode)

In development (`NODE_ENV=development`), a **Permission Debug Panel** appears as a small bug icon (🐛) in the bottom-left corner of the screen.

Click it to see:
- **Modules tab**: Which module keys are ALLOW/DENY for the current user
- **Actions tab**: Which action keys are ALLOW/DENY
- **Facility tab**: Which facility capability modules are ON/OFF

This helps developers verify that permissions are configured correctly without needing to check the database.

---

## Troubleshooting

### User can't see a sidebar item

1. Check RBAC: Does the user's role grant access to that module? (Admin → Roles)
2. Check Capability: Does the facility have that module enabled? (Admin → Facilities)
3. Check feature flags: Some items (Theatre, AI) have feature flags (`ENABLE_THEATRE`, `ENABLE_AI`)

### User sees "Access Denied" on a page

The route guard blocked access. Check the route-to-module mapping table above and verify the user has access to the required module.

### Action button is missing

The button is wrapped in a `PermissionGate`. Check the action permission mapping in `lib/permissions/actions.ts` and verify the user's role has that action.

### All modules show for a user

The user may be a **superuser** (bypasses all RBAC checks) or may have no assigned facility (capability check defaults to "allow all").

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Login Response                   │
│  { role, permissions[], facility.modules{} }     │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│   AuthProvider    │     │ FacilityProvider  │
│  stores role &    │     │ stores facility   │
│  permissions      │     │ modules           │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌──────────────────┐
│ usePermissions()  │     │  useFacility()   │
│ canAccessModule() │     │  hasModule()     │
│ canPerformAction()│     │                  │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └───────────┬────────────┘
                     ▼
         ┌───────────────────────┐
         │    Combined Check     │
         │  Sidebar filtering    │
         │  RouteGuard           │
         │  PermissionGate       │
         └───────────────────────┘
```

### File Locations

| File | Purpose |
|------|---------|
| `lib/permissions/constants.ts` | Module permission keys & role-module mapping |
| `lib/permissions/actions.ts` | Action permission keys & role-action mapping |
| `lib/hooks/use-permissions.ts` | `usePermissions()` hook |
| `lib/context/facility-context.tsx` | `FacilityProvider` & `useFacility()` |
| `lib/auth/guard.tsx` | `RouteGuard`, `PermissionGuard`, `getModuleForRoute()` |
| `lib/config/navigation.ts` | `moduleKey` & `facilityModule` on nav items |
| `components/shared/permission-gate.tsx` | `PermissionGate` declarative component |
| `components/shared/permission-debug-panel.tsx` | Dev-mode debug panel |
| `components/layout/sidebar.tsx` | Combined RBAC+Capability nav filtering |

---

## Related Documents

- [RBAC & Capability Plan](rbac-capability-plan.md) — Original design document
- [Admin RBAC & Staff Feature](admin-rbac-staff-feature.md) — Admin UI for roles & staff
- [Sprint 1.1-1.2 Track C Deliverables](sprint-1.1-1.2-track-c-rbac-deliverables.md) — Sprint deliverables
