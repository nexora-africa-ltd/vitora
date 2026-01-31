# Vitora HMIS Web Application

Next.js web frontend for Vitora Hospital Management Information System.

![Next.js](https://img.shields.io/badge/Next.js-16.x-black.svg)
![React](https://img.shields.io/badge/React-19.x-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)
![Tests](https://img.shields.io/badge/tests-142%20files-brightgreen.svg)

---

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Development](#-development)
- [Testing](#-testing)
- [API Clients](#-api-clients)
- [Configuration](#-configuration)

---

## ✨ Features

### Modules (21 Route Groups)
| Module | Status | Description |
|--------|--------|-------------|
| **Dashboard** | ✅ | Overview stats, activity feed |
| **Patients** | ✅ | Registration, search, demographics |
| **Encounters** | ✅ | Clinical visits, vitals, diagnoses |
| **Clinics** | ✅ | 8 clinic types, sessions, queues |
| **Triage** | ✅ | KETA scale, priority assessment |
| **Pharmacy** | ✅ | Drugs, inventory, dispensing |
| **Laboratory** | ✅ | Orders, results, queue |
| **Billing** | ✅ | Invoices, payments, receipts |
| **Wards** | ✅ | Ward management, bed status |
| **Admissions** | ✅ | Inpatient admissions |
| **Reports** | ✅ | Analytics dashboards |
| **Admin** | ✅ | System administration |
| **Finance** | ✅ | Financial management |
| **Insurance** | ✅ | Insurance/SHA management |
| **Notifications** | ✅ | Alert center |
| **Imaging** | 📋 | Planned (Phase 2) |
| **Theatre** | 📋 | Planned (Phase 2) |

### Technical Features
- **App Router**: Next.js 16 with React 19
- **Type Safety**: TypeScript throughout
- **State Management**: TanStack Query 5 + Zustand 4
- **UI Components**: shadcn/ui (Radix primitives)
- **Forms**: React Hook Form 7 + Zod 3.22 validation
- **API Validation**: Zod schemas for all responses
- **Charts**: Recharts 2.15
- **Dark Mode**: System preference + manual toggle

---

## 🔧 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | ≥20.x | \`node --version\` |
| npm | ≥9.x | \`npm --version\` |

---

## 🚀 Quick Start

\`\`\`bash
# Install dependencies
cd web-app
npm install

# Copy environment configuration
cp .env.example .env.local
# Edit .env.local with your backend URL

# Start development server
npm run dev
\`\`\`

Open [http://localhost:3009](http://localhost:3009)

---

## 📁 Project Structure

\`\`\`
web-app/
├── app/                        # Next.js App Router
│   ├── (dashboard)/            # Protected routes (21 modules)
│   │   ├── layout.tsx          # Dashboard layout with sidebar
│   │   ├── page.tsx            # Main dashboard
│   │   ├── patients/           # Patient management
│   │   ├── encounters/         # Clinical encounters
│   │   ├── clinics/            # Clinic management
│   │   ├── triage/             # Triage queue
│   │   ├── pharmacy/           # Pharmacy module
│   │   ├── laboratory/         # Lab module
│   │   ├── billing/            # Billing module
│   │   ├── wards/              # Ward management
│   │   ├── admissions/         # Inpatient admissions
│   │   ├── reports/            # Reports & analytics
│   │   ├── admin/              # Administration
│   │   ├── finance/            # Finance module
│   │   ├── insurance/          # Insurance/SHA
│   │   └── notifications/      # Notifications
│   └── login/                  # Authentication
│
├── components/
│   ├── layout/                 # Sidebar, Header, Breadcrumb
│   ├── ui/                     # shadcn/ui components
│   └── shared/                 # LoadingSpinner, EmptyState, PageHeader
│
├── lib/
│   ├── api/                    # 18 API client modules
│   │   ├── billing.ts
│   │   ├── clinics.ts
│   │   ├── encounters.ts
│   │   ├── laboratory.ts
│   │   ├── patients.ts
│   │   ├── pharmacy.ts
│   │   ├── sha.ts
│   │   ├── triage.ts
│   │   └── ...
│   ├── schemas/                # Zod validation schemas
│   ├── auth/                   # AuthProvider, AuthGuard
│   ├── hooks/                  # Custom React hooks
│   └── utils/                  # Utilities
│
├── features/                   # BDD feature files (~750 scenarios)
│   ├── patients/
│   ├── pharmacy/
│   ├── triage/
│   └── step-definitions/
│
├── e2e/                        # Playwright E2E tests
├── __tests__/                  # Jest unit tests
├── public/                     # Static assets
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── README.md
\`\`\`

---

## 🛠 Development

### Start Development Server
\`\`\`bash
npm run dev                 # http://localhost:3009
\`\`\`

### Backend Connection
Ensure the Django backend is running:
\`\`\`bash
cd ../backend
poetry shell
python manage.py runserver  # http://127.0.0.1:9088
\`\`\`

### Build for Production
\`\`\`bash
npm run build
npm start
\`\`\`

---

## 🧪 Testing

### Unit Tests (Jest)
\`\`\`bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
\`\`\`

### E2E Tests (Playwright)
\`\`\`bash
npm run test:e2e            # Run E2E tests
npm run test:e2e:ui         # With UI mode
\`\`\`

### BDD Tests (Cucumber)
\`\`\`bash
npm run bdd:dry-run         # Validate features
npm run bdd:e2e             # Run E2E with Playwright-BDD
npm run bdd:e2e:smoke       # Smoke tests only
npm run bdd:patients        # Patient module
npm run bdd:pharmacy        # Pharmacy module
npm run bdd:triage          # Triage module
\`\`\`

---

## 📡 API Clients

All API clients are in \`lib/api/\` with Zod validation:

| Module | File | Description |
|--------|------|-------------|
| Billing | \`billing.ts\` | Invoices, payments, receipts |
| Clinical Templates | \`clinical-templates.ts\` | Treatment templates |
| Clinics | \`clinics.ts\` | Clinic sessions, visits |
| Consultation Queue | \`consultation-queue.ts\` | Doctor queue management |
| Core | \`core.ts\` | Audit logs, activity feed |
| Encounters | \`encounters.ts\` | Clinical encounters |
| Events | \`events.ts\` | Frontend event tracking |
| Inpatient | \`inpatient.ts\` | Wards, beds, admissions |
| Laboratory | \`laboratory.ts\` | Lab orders, results |
| Locations | \`locations.ts\` | Kenya location hierarchy |
| Notifications | \`notifications.ts\` | In-app notifications |
| Patients | \`patients.ts\` | Patient CRUD |
| Pharmacy | \`pharmacy.ts\` | Drugs, inventory, dispensing |
| RBAC | \`rbac.ts\` | Roles, permissions |
| SHA | \`sha.ts\` | SHA claims, eligibility |
| Triage | \`triage.ts\` | Triage assessments |

### API Client Pattern
\`\`\`typescript
import { parseResponse } from '@/lib/schemas/validation';
import { PatientSchema } from '@/lib/schemas/patient.schema';

export const patientsApi = {
  get: async (id: number): Promise<Patient> => {
    const response = await apiClient.get(\`/api/patients/\${id}/\`);
    return parseResponse(PatientSchema, response.data, {
      context: 'patientsApi.get'
    });
  },
};
\`\`\`

---

## ⚙️ Configuration

### Environment Variables
\`\`\`bash
# .env.local
NEXT_PUBLIC_API_URL=http://127.0.0.1:9088
NEXT_PUBLIC_APP_NAME=Vitora HMIS
\`\`\`

### Key Dependencies
- **next**: ^16.1.1
- **react**: ^19.2.3
- **@tanstack/react-query**: ^5.17
- **zustand**: ^4.4
- **react-hook-form**: ^7.49
- **zod**: ^3.22
- **recharts**: ^2.15
- **date-fns**: ^3.6

---

## 🎨 Brand Colors

\`\`\`css
:root {
  --primary: #3D000F;      /* Deep Burgundy */
  --secondary: #1A4D5C;    /* Teal */
  --accent: #D4A574;       /* Warm Gold */
}
\`\`\`

---

## 📚 Related Documentation

- **Backend API**: [../backend/README.md](../backend/README.md)
- **BDD Features**: [features/README.md](features/README.md)
- **Main Documentation**: [../README.md](../README.md)
- **Roadmap**: [../ROADMAP.md](../ROADMAP.md)

---

## License

Apache-2.0 - Nexora Africa Ltd © 2026
