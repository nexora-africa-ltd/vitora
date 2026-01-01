# Sprint 1.3-1.4 Track C: Web Frontend Foundation (Next.js)

## Overview Document

**Sprint Duration**: Weeks 13-16 (4 weeks)
**Team Size**: 2-3 developers
**Priority**: P1 (High)
**Total Estimated Tests**: 150+ tests

---

## Executive Summary

This sprint establishes the Next.js web frontend foundation for Vitora HMIS, providing a modern, responsive, and accessible web interface for desktop and tablet users. The frontend complements the existing Electron desktop app and upcoming mobile app.

---

## 📁 Document Structure

This spec is split into 7 parallel-implementable documents:

| # | Document | Focus Area | Tests | Days | Priority |
|---|----------|------------|-------|------|----------|
| 00 | **[00-overview.md](./00-overview.md)** | This document | - | - | - |
| 01 | **[01-project-setup.md](./01-project-setup.md)** | Next.js scaffold, TypeScript, TailwindCSS, shadcn/ui | 5 | 1-2 | P0 |
| 02 | **[02-authentication.md](./02-authentication.md)** | JWT auth, login/logout, session management | 28 | 3-4 | P0 |
| 03 | **[03-layout-navigation.md](./03-layout-navigation.md)** | Dashboard layout, sidebar, header, breadcrumbs | 22 | 5-6 | P0 |
| 04 | **[04-patient-module.md](./04-patient-module.md)** | Patient list, search, detail view | 35 | 9-12 | P0 |
| 05 | **[05-encounter-module.md](./05-encounter-module.md)** | Encounter views, vitals, diagnoses | 25 | 13-15 | P1 |
| 06 | **[06-api-state-management.md](./06-api-state-management.md)** | Axios client, TanStack Query, Zustand | 20 | 7-8 | P0 |
| 07 | **[07-testing-infrastructure.md](./07-testing-infrastructure.md)** | Jest, MSW, Playwright setup | Infra | 1-2 | P0 |

---

## Parallel Implementation Strategy

### Week 1 (Days 1-5)

```
┌──────────────────────────────────────────────────────────────────┐
│                      WEEK 1: Foundation                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Day 1-2:  🅰️ Project Setup (01) + 🅱️ Testing Infra (07)        │
│            ├─ Next.js scaffold                                   │
│            ├─ TypeScript config                                  │
│            ├─ TailwindCSS + shadcn/ui                           │
│            ├─ Jest + MSW setup                                   │
│            └─ Playwright config                                  │
│                                                                  │
│  Day 3-4:  🅲 Authentication (02)                                │
│            ├─ AuthContext + Provider                             │
│            ├─ Login page + form                                  │
│            ├─ Token storage                                      │
│            ├─ Auth guard                                         │
│            └─ 28 auth tests                                      │
│                                                                  │
│  Day 5:    🅳 Layout Foundation (03-start)                       │
│            ├─ Dashboard layout                                   │
│            └─ Sidebar component                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Week 2 (Days 6-10)

```
┌──────────────────────────────────────────────────────────────────┐
│                      WEEK 2: Core UI                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Day 6:    🅳 Layout Navigation (03-complete)                    │
│            ├─ Header component                                   │
│            ├─ Breadcrumbs                                        │
│            ├─ Dashboard home                                     │
│            └─ 22 layout tests                                    │
│                                                                  │
│  Day 7-8:  🅴 API & State (06)                                   │
│            ├─ Axios client                                       │
│            ├─ Token refresh                                      │
│            ├─ TanStack Query                                     │
│            ├─ Zustand stores                                     │
│            └─ 20 API/state tests                                 │
│                                                                  │
│  Day 9-10: 🅵 Patient Module (04-start)                          │
│            ├─ Patient types                                      │
│            ├─ Patient API client                                 │
│            ├─ Patient list page                                  │
│            └─ Patient table                                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Week 3 (Days 11-15)

```
┌──────────────────────────────────────────────────────────────────┐
│                    WEEK 3: Patient & Encounter                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Day 11-12: 🅵 Patient Module (04-complete)                      │
│             ├─ Patient detail page                               │
│             ├─ Patient card                                      │
│             ├─ Emergency contacts                                │
│             └─ 35 patient tests                                  │
│                                                                  │
│  Day 13-14: 🅶 Encounter Module (05-start)                       │
│             ├─ Encounter types                                   │
│             ├─ Encounter API                                     │
│             ├─ Encounter list page                               │
│             └─ Encounter table                                   │
│                                                                  │
│  Day 15:    🅶 Encounter Module (05-complete)                    │
│             ├─ Encounter detail                                  │
│             ├─ Vitals display                                    │
│             ├─ Diagnoses list                                    │
│             └─ 25 encounter tests                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Week 4 (Days 16-20)

```
┌──────────────────────────────────────────────────────────────────┐
│                    WEEK 4: Integration & Polish                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Day 16-17: 🅷 Integration Testing                               │
│             ├─ E2E test suite                                    │
│             ├─ Cross-browser testing                             │
│             └─ Mobile viewport testing                           │
│                                                                  │
│  Day 18-19: 🅸 Bug Fixes & Polish                                │
│             ├─ Fix failing tests                                 │
│             ├─ Accessibility audit                               │
│             ├─ Performance optimization                          │
│             └─ Loading states                                    │
│                                                                  │
│  Day 20:    🅹 Documentation & Handoff                           │
│             ├─ README updates                                    │
│             ├─ Component documentation                           │
│             └─ Sprint retrospective                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Web Frontend Architecture                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Next.js 14+ App                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │   App       │  │   Server    │  │   Client    │  │   API      │  │   │
│  │  │   Router    │  │   Components│  │   Components│  │   Routes   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────▼───────────────────────────────────┐   │
│  │                         State Management                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │  TanStack   │  │   Zustand   │  │   React     │                  │   │
│  │  │  Query      │  │   Stores    │  │   Context   │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────▼───────────────────────────────────┐   │
│  │                         API Layer                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │   Axios     │  │   Auth      │  │   Error     │                  │   │
│  │  │   Client    │  │   Interceptor│  │   Handler   │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Django REST API (Backend)                         │   │
│  │                    http://localhost:9088/api/                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Brand Colors

The web frontend uses the **Vitora HMIS brand colors** consistent with the mobile app:

| Color | Hex Code | Usage |
|-------|----------|-------|
| **Primary (Deep Burgundy)** | `#3D000F` | Buttons, links, header gradient |
| **Secondary (Teal)** | `#1A4D5C` | Healthcare trust, info states |
| **Accent (Warm Gold)** | `#D4A574` | Highlights, Kenya sun warmth |
| **Success** | `#2E7D4A` | Success states, confirmations |
| **Warning** | `#E6A023` | Warnings, pending states |
| **Error/Critical** | `#C62828` | Errors, critical vitals (SpO2 < 95%) |

See [colors.ts](../../mobile-app/constants/colors.ts) for the complete color palette.

---

## Key Deliverables Summary

| Deliverable | Spec File | Tests Required | Priority |
|-------------|-----------|----------------|----------|
| Next.js Project Scaffold | [01-project-setup.md](./01-project-setup.md) | 5 tests | P0 |
| Authentication System | [02-authentication.md](./02-authentication.md) | 28 tests | P0 |
| Core Layout & Navigation | [03-layout-navigation.md](./03-layout-navigation.md) | 22 tests | P0 |
| Patient Module | [04-patient-module.md](./04-patient-module.md) | 35 tests | P0 |
| Encounter Module | [05-encounter-module.md](./05-encounter-module.md) | 25 tests | P1 |
| API Client & State | [06-api-state-management.md](./06-api-state-management.md) | 20 tests | P0 |
| Testing Infrastructure | [07-testing-infrastructure.md](./07-testing-infrastructure.md) | 15 tests | P0 |

**Total Planned Tests**: ~150 tests
**Target Coverage**: ≥70%

---

## Technology Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Framework** | Next.js | 14.x | React framework with App Router |
| **Language** | TypeScript | 5.x | Type safety |
| **Styling** | TailwindCSS | 3.x | Utility-first CSS |
| **Components** | shadcn/ui | latest | Accessible component library |
| **State (Server)** | TanStack Query | 5.x | Server state management |
| **State (Client)** | Zustand | 4.x | Client state management |
| **HTTP Client** | Axios | 1.x | API requests |
| **Forms** | React Hook Form | 7.x | Form handling |
| **Validation** | Zod | 3.x | Schema validation |
| **Icons** | Lucide React | latest | Icon library |
| **Charts** | Recharts | 2.x | Data visualization |
| **Tables** | TanStack Table | 8.x | Data tables |
| **Testing** | Jest + RTL | 29.x | Unit/Integration tests |
| **E2E Testing** | Playwright | 1.x | End-to-end tests |

---

## Project Structure

```
web-app/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth group (unauthenticated)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/              # Main app (authenticated)
│   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   ├── page.tsx              # Dashboard home
│   │   ├── patients/
│   │   │   ├── page.tsx          # Patient list
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Patient detail
│   │   ├── encounters/
│   │   │   ├── page.tsx          # Encounter list
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Encounter detail
│   │   └── settings/
│   │       └── page.tsx          # Settings
│   ├── api/                      # API routes (if needed)
│   ├── layout.tsx                # Root layout
│   ├── loading.tsx               # Global loading
│   ├── error.tsx                 # Global error
│   └── not-found.tsx             # 404 page
├── components/
│   ├── ui/                       # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── table.tsx
│   │   └── ...
│   ├── layout/                   # Layout components
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── breadcrumb.tsx
│   │   └── footer.tsx
│   ├── patients/                 # Patient-specific components
│   │   ├── patient-card.tsx
│   │   ├── patient-table.tsx
│   │   ├── patient-search.tsx
│   │   └── patient-detail.tsx
│   ├── encounters/               # Encounter components
│   │   ├── encounter-card.tsx
│   │   ├── encounter-timeline.tsx
│   │   └── vitals-display.tsx
│   └── shared/                   # Shared components
│       ├── data-table.tsx
│       ├── search-input.tsx
│       ├── loading-spinner.tsx
│       ├── empty-state.tsx
│       └── error-boundary.tsx
├── lib/
│   ├── api/                      # API client
│   │   ├── client.ts             # Axios instance
│   │   ├── auth.ts               # Auth endpoints
│   │   ├── patients.ts           # Patient endpoints
│   │   ├── encounters.ts         # Encounter endpoints
│   │   └── locations.ts          # Kenya locations
│   ├── auth/                     # Auth utilities
│   │   ├── context.tsx           # Auth context provider
│   │   ├── hooks.ts              # useAuth, useUser
│   │   └── guard.tsx             # Auth guard component
│   ├── stores/                   # Zustand stores
│   │   ├── auth-store.ts
│   │   └── ui-store.ts
│   ├── hooks/                    # Custom hooks
│   │   ├── use-patients.ts
│   │   ├── use-encounters.ts
│   │   └── use-debounce.ts
│   ├── utils/                    # Utility functions
│   │   ├── cn.ts                 # Class name utility
│   │   ├── format.ts             # Date/number formatting
│   │   └── validation.ts         # Zod schemas
│   └── types/                    # TypeScript types
│       ├── patient.ts
│       ├── encounter.ts
│       └── api.ts
├── __tests__/                    # Test files
│   ├── components/
│   ├── lib/
│   ├── app/
│   └── e2e/
├── public/                       # Static assets
│   ├── logo.svg
│   └── favicon.ico
├── styles/
│   └── globals.css               # Global styles + Tailwind
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── jest.config.js
├── playwright.config.ts
├── package.json
└── README.md
```

---

## Backend API Endpoints (Available)

The backend provides these endpoints for the web frontend:

### Authentication
```
POST   /api/token/              # Login → {access, refresh}
POST   /api/token/refresh/      # Refresh token
POST   /api/token/verify/       # Verify token
```

### Patients
```
GET    /api/patients/                           # List (paginated, searchable)
GET    /api/patients/{id}/                      # Detail
POST   /api/patients/                           # Create
PATCH  /api/patients/{id}/                      # Update
DELETE /api/patients/{id}/                      # Delete
GET    /api/patients/{id}/emergency-contacts/   # Emergency contacts
GET    /api/patients/{id}/encounters/           # Patient's encounters
```

### Encounters
```
GET    /api/encounters/                         # List
GET    /api/encounters/{id}/                    # Detail
POST   /api/encounters/                         # Create
PATCH  /api/encounters/{id}/                    # Update
GET    /api/encounters/{id}/diagnoses/          # Diagnoses
GET    /api/encounters/{id}/treatment-plan/     # Treatment plan
```

### Locations
```
GET    /api/locations/counties/                 # 47 Kenya counties
GET    /api/locations/sub-counties/?county=X    # Cascading
GET    /api/locations/wards/?sub_county=X       # Cascading
```

### RBAC
```
GET    /api/departments/                        # Departments
GET    /api/roles/                              # Roles
GET    /api/staff/                              # Staff profiles
```

### Pharmacy (Read-only for dashboard)
```
GET    /api/pharmacy/drugs/                     # Drug catalog
GET    /api/pharmacy/stock/                     # Stock levels
GET    /api/pharmacy/alerts/                    # Stock alerts
```

### Laboratory (Read-only for dashboard)
```
GET    /api/lab/orders/                         # Lab orders
GET    /api/lab/results/                        # Lab results
```

---

## Sprint Timeline

### Week 5 (Days 1-5)
| Day | Track | Tasks |
|-----|-------|-------|
| 1 | Setup | Project scaffold, TypeScript, ESLint |
| 2 | Setup | TailwindCSS, shadcn/ui, theme config |
| 3 | Auth | Auth context, token storage, login page |
| 4 | Auth | Auth guard, session restore, logout |
| 5 | Layout | Sidebar, header, dashboard shell |

### Week 6 (Days 6-10)
| Day | Track | Tasks |
|-----|-------|-------|
| 6 | Layout | Navigation, breadcrumbs, mobile responsive |
| 7 | API | Axios client, interceptors, error handling |
| 8 | API | TanStack Query setup, patient hooks |
| 9 | Patient | Patient list page, table component |
| 10 | Patient | Patient search, filters, pagination |

### Week 7 (Days 11-15)
| Day | Track | Tasks |
|-----|-------|-------|
| 11 | Patient | Patient detail page, info cards |
| 12 | Patient | Patient timeline, emergency contacts |
| 13 | Encounter | Encounter list, encounter card |
| 14 | Encounter | Encounter detail, vitals display |
| 15 | Encounter | Encounter timeline, diagnoses view |

### Week 8 (Days 16-20)
| Day | Track | Tasks |
|-----|-------|-------|
| 16 | Dashboard | Stats cards, charts setup |
| 17 | Dashboard | Recent patients, alerts widget |
| 18 | Testing | Unit tests completion, coverage check |
| 19 | Testing | E2E tests, accessibility audit |
| 20 | Polish | Bug fixes, documentation, demo prep |

---

## Parallel Implementation Tracks

### 🅰️ Track A: Core Infrastructure (Days 1-5)
**Owner**: Developer 1
**Files**: `01-setup-infrastructure.md`, `02-authentication.md`
- Next.js scaffold
- TypeScript config
- TailwindCSS + shadcn/ui
- Auth system

### 🅱️ Track B: Layout & API (Days 5-10)
**Owner**: Developer 2
**Files**: `03-layout-navigation.md`, `06-api-state-management.md`
- Dashboard layout
- Sidebar navigation
- API client
- TanStack Query

### 🅲 Track C: Patient Module (Days 9-14)
**Owner**: Developer 1 or 3
**Files**: `04-patient-module.md`
- Patient list
- Patient detail
- Search & filters

### 🅳 Track D: Encounter Module (Days 13-17)
**Owner**: Developer 2 or 3
**Files**: `05-encounter-module.md`
- Encounter views
- Vitals display
- Timeline

### 🅴 Track E: Testing & Polish (Days 16-20)
**Owner**: All developers
**Files**: `07-testing-infrastructure.md`
- Unit tests
- E2E tests
- Documentation

---

## Acceptance Criteria

| Criterion | Target | Status |
|-----------|--------|--------|
| Next.js app with App Router | ✓ | 📋 |
| JWT authentication working | ✓ | 📋 |
| Patient list with search | ✓ | 📋 |
| Patient detail view | ✓ | 📋 |
| Encounter views | ✓ | 📋 |
| Responsive design (mobile) | ✓ | 📋 |
| Dark mode support | ✓ | 📋 |
| All tests pass | ~157 | 📋 |
| Coverage ≥80% | ✓ | 📋 |
| Accessibility (WCAG 2.1 AA) | ✓ | 📋 |
| Lighthouse score ≥90 | ✓ | 📋 |

---

## Dependencies

- ✅ Backend API (Phase 0 complete)
- ✅ Patient model & API (467+ tests)
- ✅ Encounter model & API
- ✅ Kenya locations API
- ✅ JWT authentication
- 📋 RBAC system (Track C of 1.1-1.2) - optional for initial release

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Next.js 14 breaking changes | Medium | Low | Pin versions, use stable features |
| shadcn/ui component gaps | Low | Low | Extend components as needed |
| API response format changes | Medium | Low | TypeScript types, API versioning |
| Performance with large datasets | Medium | Medium | Pagination, virtual scrolling |
| Mobile responsiveness issues | Medium | Medium | Mobile-first approach, testing |

---

## Document Index

1. [Setup & Infrastructure](./01-setup-infrastructure.md)
2. [Authentication System](./02-authentication.md)
3. [Layout & Navigation](./03-layout-navigation.md)
4. [Patient Module](./04-patient-module.md)
5. [Encounter Module](./05-encounter-module.md)
6. [API Client & State Management](./06-api-state-management.md)
7. [Testing Infrastructure](./07-testing-infrastructure.md)

---

**Document Status**: PLANNED
**Sprint Status**: 📋 NOT STARTED
**Document Owner**: Engineering Lead
**Last Updated**: January 1, 2026
