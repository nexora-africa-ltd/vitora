# Sprint 1.3-1.4 Track C: Project Setup

**Part of**: Web Frontend Foundation (Next.js)
**Priority**: P0 (Critical Path)
**Estimated Tests**: 5 infrastructure tests
**Parallel Track**: 🅰️ Track A (Days 1-2)

---

## Overview

This document covers the initial Next.js project setup including scaffolding, TypeScript configuration, TailwindCSS, shadcn/ui installation, and essential tooling.

---

## 1. Project Initialization

### 1.1 Create Next.js Project

```bash
# Create web-app directory at project root
cd /home/thande/dev/vitora
npx create-next-app@14 web-app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

### 1.2 Initial package.json

**web-app/package.json**:
```json
{
  "name": "vitora-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3009",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "type-check": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --reporters=default --reporters=jest-junit",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:debug": "playwright test --debug",
    "e2e:report": "playwright show-report",
    "quality": "npm run lint && npm run type-check && npm run format:check"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-query": "^5.17.0",
    "axios": "^1.6.5",
    "zustand": "^4.4.7",
    "react-hook-form": "^7.49.3",
    "@hookform/resolvers": "^3.3.4",
    "zod": "^3.22.4",
    "date-fns": "^3.2.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "lucide-react": "^0.312.0",
    "next-themes": "^0.2.1",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-toast": "^1.1.5",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-separator": "^1.0.3"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "typescript": "^5.3.3",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.33",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-config-next": "14.2.0",
    "prettier": "^3.2.4",
    "prettier-plugin-tailwindcss": "^0.5.11",
    "@playwright/test": "^1.41.0",
    "@testing-library/jest-dom": "^6.2.0",
    "@testing-library/react": "^14.1.2",
    "@testing-library/user-event": "^14.5.2",
    "@types/jest": "^29.5.11",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "jest-junit": "^16.0.0",
    "msw": "^2.0.14"
  }
}
```

---

## 2. TypeScript Configuration

**web-app/tsconfig.json**:
```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    },
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "playwright-report", "coverage"]
}
```

---

## 3. TailwindCSS Configuration

**web-app/tailwind.config.ts**:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Vitora brand colors - Deep Burgundy
        vitora: {
          50: '#F9E6E9',
          100: '#F0BFC7',
          200: '#E69AA6',
          300: '#D97485',
          400: '#CC4F64',
          500: '#3D000F',  // Main primary
          600: '#370010',
          700: '#30000D',
          800: '#29000B',
          900: '#1F0008',
        },
        // Secondary - Teal (healthcare trust)
        teal: {
          50: '#E6F2F4',
          100: '#C0DFE4',
          200: '#99CCD4',
          300: '#73B8C4',
          400: '#4DA5B4',
          500: '#1A4D5C',  // Main secondary
          600: '#174552',
          700: '#143C48',
          800: '#11333E',
          900: '#0D262E',
        },
        // Accent - Warm Gold (Kenya sun)
        gold: {
          50: '#FDF6ED',
          100: '#FAE9D1',
          200: '#F5D5A8',
          300: '#EFC17F',
          400: '#EAAD56',
          500: '#D4A574',  // Main accent
          600: '#C49462',
          700: '#B38350',
          800: '#A3733E',
          900: '#8A6034',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'slide-in-from-top': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'slide-in-from-top': 'slide-in-from-top 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

---

## 4. Global CSS

**app/globals.css**:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 11% 12%;  /* neutral-900 */
    --card: 0 0% 100%;
    --card-foreground: 0 11% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 11% 12%;
    --primary: 349 100% 12%;  /* Deep Burgundy #3D000F */
    --primary-foreground: 0 0% 100%;
    --secondary: 193 55% 23%;  /* Teal #1A4D5C */
    --secondary-foreground: 0 0% 100%;
    --muted: 0 3% 96%;  /* neutral-100 */
    --muted-foreground: 0 5% 42%;  /* neutral-600 */
    --accent: 27 50% 65%;  /* Warm Gold #D4A574 */
    --accent-foreground: 0 11% 12%;
    --destructive: 0 65% 47%;  /* error main #C62828 */
    --destructive-foreground: 0 0% 100%;
    --border: 0 4% 86%;  /* neutral-300 */
    --input: 0 4% 86%;
    --ring: 349 100% 12%;  /* primary */
    --radius: 0.5rem;

    /* Semantic colors */
    --success: 145 46% 34%;  /* #2E7D4A */
    --warning: 38 79% 52%;  /* #E6A023 */
    --info: 193 55% 23%;  /* Teal */
    --critical: 0 65% 47%;  /* #C62828 */
  }

  .dark {
    --background: 350 9% 9%;  /* background.dark #1A1516 */
    --foreground: 0 0% 100%;
    --card: 350 7% 15%;  /* background.paperDark #2A2324 */
    --card-foreground: 0 0% 100%;
    --popover: 350 7% 15%;
    --popover-foreground: 0 0% 100%;
    --primary: 349 85% 30%;  /* Lighter burgundy for dark mode */
    --primary-foreground: 0 0% 100%;
    --secondary: 193 45% 35%;  /* Lighter teal for dark mode */
    --secondary-foreground: 0 0% 100%;
    --muted: 350 7% 18%;
    --muted-foreground: 0 4% 72%;  /* neutral-400 */
    --accent: 27 50% 65%;  /* Warm Gold */
    --accent-foreground: 0 11% 12%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 0 0% 100%;
    --border: 350 7% 20%;
    --input: 350 7% 20%;
    --ring: 349 85% 30%;

    /* Semantic colors (dark) */
    --success: 145 50% 40%;
    --warning: 38 85% 55%;
    --info: 193 45% 35%;
    --critical: 0 63% 45%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: 'rlig' 1, 'calt' 1;
  }
}

/* Custom scrollbar */
@layer utilities {
  .scrollbar-thin {
    scrollbar-width: thin;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    @apply bg-muted;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    @apply bg-muted-foreground/30 rounded-full;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    @apply bg-muted-foreground/50;
  }
}
```

---

## 5. Next.js Configuration

**web-app/next.config.js**:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode for development
  reactStrictMode: true,

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9088',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: 'api.vitora.health',
        pathname: '/media/**',
      },
    ],
  },

  // API rewrites for development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088'}/api/:path*`,
      },
    ];
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

module.exports = nextConfig;
```

---

## 6. Environment Configuration

**web-app/.env.local** (template):
```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://127.0.0.1:9088

# App name
NEXT_PUBLIC_APP_NAME=Vitora HMIS

# Environment
NEXT_PUBLIC_ENV=development
```

**web-app/.env.example**:
```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://127.0.0.1:9088

# App name
NEXT_PUBLIC_APP_NAME=Vitora HMIS

# Environment (development | staging | production)
NEXT_PUBLIC_ENV=development
```

---

## 7. Utility Functions

**lib/utils/cn.ts**:
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx.
 * Handles class conflicts properly.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

**lib/utils/format.ts**:
```typescript
import { format, formatDistanceToNow, parseISO, differenceInYears } from 'date-fns';

/**
 * Format a date string to a readable format.
 */
export function formatDate(date: string | Date, pattern = 'MMM d, yyyy'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, pattern);
}

/**
 * Format a date as relative time (e.g., "2 hours ago").
 */
export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(dateObj, { addSuffix: true });
}

/**
 * Calculate age from date of birth.
 */
export function calculateAge(dateOfBirth: string | Date): number {
  const dob = typeof dateOfBirth === 'string' ? parseISO(dateOfBirth) : dateOfBirth;
  return differenceInYears(new Date(), dob);
}

/**
 * Format phone number for display.
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  // Format Kenyan phone numbers
  if (phone.startsWith('+254')) {
    return phone.replace(/(\+254)(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4');
  }
  if (phone.startsWith('0')) {
    return phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
  }
  return phone;
}

/**
 * Format currency (KES).
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format MRN for display.
 */
export function formatMRN(mrn: string): string {
  return mrn; // MRN is already formatted
}
```

**lib/utils/constants.ts**:
```typescript
// API URL
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088';

// App info
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Vitora HMIS';
export const APP_ENV = process.env.NEXT_PUBLIC_ENV || 'development';

// Gender options
export const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
] as const;

// Referral source options
export const REFERRAL_SOURCE_OPTIONS = [
  { value: 'self', label: 'Self' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'other_facility', label: 'Other Facility' },
] as const;

// Encounter types
export const ENCOUNTER_TYPES = [
  { value: 'OPD', label: 'Outpatient' },
  { value: 'IPD', label: 'Inpatient' },
  { value: 'EMERGENCY', label: 'Emergency' },
] as const;

// Encounter status
export const ENCOUNTER_STATUS = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
] as const;

// Vital sign ranges
export const VITAL_RANGES = {
  temperature: { min: 36.1, max: 37.2, unit: '°C' },
  pulse: { min: 60, max: 100, unit: 'bpm' },
  respiratoryRate: { min: 12, max: 20, unit: '/min' },
  spo2: { min: 95, max: 100, unit: '%', critical: 95 },
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
```

---

## 8. Root Layout

**app/layout.tsx**:
```typescript
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { APP_NAME } from '@/lib/utils/constants';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: 'Hospital Management Information System for Kenya',
  applicationName: APP_NAME,
  authors: [{ name: 'Vitora Team' }],
  keywords: ['HMIS', 'Healthcare', 'Kenya', 'Hospital Management'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**app/providers.tsx**:
```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { AuthProvider } from '@/lib/auth/context';
import { Toaster } from '@/components/ui/toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: process.env.NODE_ENV === 'production',
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
```

---

## 9. ESLint Configuration

**web-app/.eslintrc.json**:
```json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "react/no-unescaped-entities": "off",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "prefer-const": "error",
    "no-var": "error"
  },
  "overrides": [
    {
      "files": ["**/__tests__/**/*", "**/*.test.*"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ]
}
```

---

## 10. Prettier Configuration

**web-app/.prettierrc**:
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

**web-app/.prettierignore**:
```
node_modules
.next
coverage
playwright-report
*.md
```

---

## 11. Checklist

### Day 1: Project Scaffold
- [ ] Create Next.js project with `create-next-app`
- [ ] Configure package.json with all dependencies
- [ ] Set up TypeScript with strict mode
- [ ] Configure TailwindCSS with custom theme
- [ ] Create globals.css with CSS variables
- [ ] Set up Next.js config with rewrites

### Day 2: Tooling & Utilities
- [ ] Configure ESLint
- [ ] Configure Prettier
- [ ] Create utility functions (cn, format)
- [ ] Create constants file
- [ ] Set up root layout
- [ ] Create providers component
- [ ] Test dev server starts (`npm run dev`)
- [ ] Verify build succeeds (`npm run build`)

---

## Deliverables

| Deliverable | Status |
|-------------|--------|
| Next.js 14 project scaffold | 📋 |
| TypeScript strict configuration | 📋 |
| TailwindCSS with custom theme | 📋 |
| shadcn/ui ready (CSS variables) | 📋 |
| ESLint + Prettier configured | 📋 |
| Root layout with providers | 📋 |
| Utility functions | 📋 |
| Constants file | 📋 |
| Environment configuration | 📋 |
| Dev server working | 📋 |
| Build succeeds | 📋 |

---

**Next**: [02-authentication.md](./02-authentication.md)
