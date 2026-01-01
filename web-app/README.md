# Vitora HMIS - Web Application

This is the Next.js web frontend for Vitora HMIS.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running on `http://127.0.0.1:9088` (or configure `NEXT_PUBLIC_API_BASE_URL`)

### Installation

```bash
npm install
```

### Development

```bash
# Start development server
npm run dev

# Visit http://localhost:3000
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Code Quality

```bash
# Run all quality checks (lint, type-check, format)
npm run quality

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Building

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
web-app/
├── lib/                    # Core utilities and logic
│   ├── api/               # API clients (Axios)
│   ├── auth/              # Authentication utilities
│   ├── hooks/             # React hooks
│   ├── stores/            # Zustand state stores
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
├── components/            # React components
│   ├── shared/           # Shared components
│   └── ui/               # UI primitives
├── __tests__/            # Test files
└── package.json          # Dependencies and scripts
```

## Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:9088
```

## Features Implemented

- ✅ Axios API client with auth interceptors
- ✅ Automatic JWT token refresh
- ✅ TanStack Query for data fetching
- ✅ Kenya locations API (Counties, Sub-Counties, Wards)
- ✅ Zustand stores (UI state, Form drafts)
- ✅ Network status detection
- ✅ Error boundary for graceful error handling
- ✅ Offline banner
- ✅ Toast notifications
- ✅ 20 tests covering API, hooks, and stores

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **HTTP Client**: Axios
- **Testing**: Jest + React Testing Library
- **Code Quality**: ESLint + TypeScript

## Related Documentation

- [Sprint 1.3-1.4 Track C Documentation](../docs/sprint-1.3-1.4-track-c-web-frontend/)
- [API State Management](../docs/sprint-1.3-1.4-track-c-web-frontend/06-api-state-management.md)
