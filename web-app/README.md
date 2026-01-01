# Vitora HMIS Web Frontend

Next.js web frontend for Vitora Hospital Management Information System.

## Features Implemented (Sprint 1.3-1.4 Track C)

### Encounter Module ✅

- **Encounter List Page**: Paginated table with filters (status, type) and critical vital alerts
- **Encounter Detail Page**: Comprehensive encounter view with tabs for:
  - Assessment (history, physical exam, assessment, plan)
  - Diagnoses (ICD-10 codes with type badges)
  - Treatment Plan (medications, follow-up)
  - Medical History (allergies, chronic conditions, etc.)
- **Vitals Display**: Color-coded vital signs with normal ranges and critical alerts
- **API Integration**: Full integration with Django REST backend
- **React Query**: Data fetching, caching, and state management
- **TypeScript**: Complete type safety for all components and APIs

## Prerequisites

- Node.js 18+ and npm
- Vitora backend running on http://127.0.0.1:9088

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

## Project Structure

```
web-app/
├── src/
│   ├── app/                    # Next.js 14 App Router
│   │   ├── encounters/         # Encounter pages
│   │   │   ├── [id]/          # Encounter detail page
│   │   │   └── page.tsx       # Encounter list page
│   │   ├── layout.tsx         # Root layout
│   │   ├── providers.tsx      # React Query provider
│   │   └── page.tsx           # Home page
│   ├── components/
│   │   ├── ui/                # Base UI components (shadcn/ui style)
│   │   ├── shared/            # Shared components (PageHeader, EmptyState)
│   │   └── encounters/        # Encounter-specific components
│   │       ├── encounter-table.tsx
│   │       ├── vitals-display.tsx
│   │       ├── diagnoses-list.tsx
│   │       ├── treatment-plan-view.tsx
│   │       └── medical-history-view.tsx
│   └── lib/
│       ├── api/               # API clients
│       │   ├── client.ts      # Axios client with JWT interceptors
│       │   └── encounters.ts  # Encounters API
│       ├── hooks/             # React hooks
│       │   ├── use-encounters.ts
│       │   └── use-debounce.ts
│       ├── types/             # TypeScript types
│       │   ├── patient.ts
│       │   └── encounter.ts
│       └── utils/             # Utilities
│           ├── cn.ts          # Class name utility
│           ├── format.ts      # Date formatting
│           └── constants.ts   # App constants
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm test` - Run Jest tests
- `npm run test:coverage` - Run tests with coverage

## Backend API Integration

The web app connects to the Vitora Django backend API:

- Base URL: `http://127.0.0.1:9088` (configurable via `NEXT_PUBLIC_API_URL`)
- Authentication: JWT tokens with automatic refresh
- Endpoints used:
  - `GET /api/encounters/` - List encounters
  - `GET /api/encounters/{id}/` - Get encounter detail
  - `GET /api/encounters/{id}/diagnoses/` - Get encounter diagnoses
  - `GET /api/encounters/{id}/treatment-plan/` - Get treatment plan

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components (shadcn/ui inspired)
- **State Management**: TanStack Query (React Query) v5
- **HTTP Client**: Axios
- **Date Handling**: date-fns
- **Icons**: Lucide React

## Development Notes

### Critical Vital Signs

The system highlights critical vital signs:
- SpO2 < 95%: Warning badge (amber)
- SpO2 < 90%: Critical badge (red)
- Temperature < 35°C or > 39°C: Critical
- Pulse < 50 or > 120: Critical
- Respiratory Rate < 8 or > 30: Critical

### Authentication

JWT authentication is handled automatically by the API client:
- Tokens stored in localStorage
- Automatic token refresh on 401 responses
- Redirect to /login on refresh failure

### Type Safety

All API responses and component props are fully typed using TypeScript interfaces matching the backend Django models.

## Next Steps (Future Sprints)

- Authentication pages (login, logout)
- Patient module pages
- Encounter creation and editing forms
- Dashboard with statistics
- Full test coverage
- E2E tests with Playwright

## License

Private - Nexora Africa Ltd
