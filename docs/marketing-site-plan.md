# Vitora HMIS — Marketing Site Plan

> **Purpose**: Complete implementation plan for the Vitora HMIS marketing/landing website.  
> **Audience**: Developer or AI agent tasked with building the site.  
> **Status**: Ready for implementation  
> **Date**: March 2, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technical Architecture](#2-technical-architecture)
3. [Brand Identity & Design System](#3-brand-identity--design-system)
4. [Site Map & Page Structure](#4-site-map--page-structure)
5. [Page-by-Page Specifications](#5-page-by-page-specifications)
6. [TibaBot AI Integration](#6-tibabot-ai-integration)
7. [Content Strategy](#7-content-strategy)
8. [SEO & Performance](#8-seo--performance)
9. [Deployment & Infrastructure](#9-deployment--infrastructure)
10. [Implementation Phases](#10-implementation-phases)
11. [Appendix: Copy & Messaging](#11-appendix-copy--messaging)
12. [Developer Setup](#12-developer-setup)

---

## 1. Overview

### 1.1 What We're Building

A public-facing marketing website for **Vitora HMIS** — an offline-first Hospital Management Information System built for Kenya's healthcare infrastructure by **Nexora Africa Ltd**. The site will:

- Communicate the product's value proposition to hospital administrators, health IT decision-makers, county health directors, and NGOs
- Showcase features, integrations (SHA, KHIS/DHIS2), and AI capabilities (TibaBot)
- Provide a live TibaBot demo widget for visitors to interact with
- Drive conversions: demo requests, pilot program sign-ups, and contact inquiries
- Establish Nexora Africa as a credible health-tech company in the Kenyan market

### 1.2 Target Audiences

| Audience | What They Care About | Key Pages |
|----------|---------------------|-----------|
| **Hospital Administrators / CEOs** | Cost savings, compliance, ROI, staff efficiency | Home, Contact Sales, Case Studies |
| **County Health Directors / MoH** | KHIS/DHIS2 reporting, SHA compliance, data sovereignty | Features, Compliance, Integrations |
| **IT Managers / CTOs** | Architecture, security, offline-first, FHIR, API docs | Features, Technical, Developers |
| **Clinicians (Doctors, Nurses)** | Ease of use, clinical decision support, speed | Features, TibaBot AI, Demo |
| **NGOs / Donors** | Impact metrics, scalability, sustainability | About, Case Studies, Contact |
| **Pharmacists, Lab Techs, Billing** | Module-specific workflows | Features (sub-pages) |

### 1.3 Success Metrics

| Metric | Target |
|--------|--------|
| Demo requests / month | 20+ |
| Average time on site | > 3 minutes |
| Bounce rate | < 40% |
| TibaBot widget interactions | 50+ / month |
| SEO ranking for "Kenya HMIS" | Top 10 |

---

## 2. Technical Architecture

### 2.1 Target Repository

The marketing site lives in its **own repository**, separate from the product monorepo:

```
Organization: nexora-africa-ltd
├── vitora                 # Product: backend, web-app, desktop-app, mobile-app
└── vitora-marketing       # ← THIS — Marketing / landing site (Next.js, Vercel)
```

**Why a separate repo?**

| Concern | Benefit |
|---------|---------|
| Deployment lifecycle | Marketing deploys independently of product releases |
| Security | No clinical / PII code adjacent to the public site |
| CI speed | Only ~50 components to lint/build — no 467+ backend tests |
| Access control | Content editors never see HMIS source code |
| CMS webhooks | Clean webhook → redeploy on Vercel, no monorepo plumbing |

The **only integration point** is the TibaBot chat proxy (`/api/chat`), which talks to the upstream TibaBot service via server-only env vars — no code sharing required.

> This plan doc stays in `vitora/docs/marketing-site-plan.md` as the canonical spec.  
> Implementation happens in `vitora-marketing`.

### 2.2 Tech Stack & Project Structure

```
vitora-marketing/                 # Standalone repo
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  # Home / Landing
│   ├── features/
│   ├── about/
│   ├── contact/
│   ├── demo/
│   ├── ai/                       # TibaBot AI page
│   ├── integrations/
│   ├── compliance/
│   ├── developers/
│   ├── blog/
│   ├── legal/
│   └── api/
│       └── chat/                 # TibaBot proxy route (server-only secrets)
│           ├── route.ts
│           └── health/
│               └── route.ts
├── components/
│   ├── layout/                   # Navbar, Footer, CTA
│   ├── sections/                 # Hero, Features, Testimonials, etc.
│   ├── ui/                       # Shared UI primitives
│   ├── tibabot/                  # TibaBot chat widget
│   └── animations/               # Framer Motion components
├── content/                      # MDX blog posts, case studies
├── lib/
│   ├── tibabot-client.ts         # Browser-safe chat client (calls /api/chat)
│   └── constants.ts
├── public/
│   ├── images/
│   ├── screenshots/              # Product screenshots
│   └── videos/                   # Demo videos
├── .github/
│   └── workflows/
│       └── ci.yml                # Lint → Build → Deploy (Vercel)
├── next.config.ts
├── tailwind.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

### 2.3 Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^3.4.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.400.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-accordion": "^1.0.0",
    "@radix-ui/react-tabs": "^1.0.0",
    "next-themes": "^0.2.1",
    "next-mdx-remote": "^4.4.0",
    "gray-matter": "^4.0.0",
    "react-intersection-observer": "^9.5.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/react": "^19.0.0",
    "tailwindcss-animate": "^1.0.7",
    "eslint": "^8.56.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.2.0"
  }
}
```

### 2.4 Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Separate **repository** (`vitora-marketing`) | Different deployment lifecycle, security posture, CI pipeline, and team access from the HMIS product. |
| Next.js App Router + SSG | Static generation for fast page loads, excellent SEO, and cheap hosting. |
| MDX for blog/case studies | Content team can write in Markdown; renders as React components. |
| Framer Motion for animations | Smooth scroll-triggered animations for visual polish without heavy JS. |
| TibaBot via server-side proxy | API route at `/api/chat` hides secrets; browser only talks to local proxy. |
| Copy brand tokens (don't import) | Same Vitora palette/fonts, but no cross-repo dependency. Tokens are duplicated in `tailwind.config.ts` (see §3.6). |

---

## 3. Brand Identity & Design System

### 3.1 Brand Colors

Duplicate the Vitora brand palette (originally from `vitora/web-app/app/globals.css`) into the marketing repo's own Tailwind config:

| Color | Hex | Usage |
|-------|-----|-------|
| **Deep Burgundy** | `#3D000F` | Primary brand, headings, CTA buttons |
| **Teal** | `#1A4D5C` | Secondary, links, feature icons, accents |
| **Warm Gold** | `#D4A574` | Accent highlights, badges, decorative elements |
| **White** | `#FFFFFF` | Backgrounds, text on dark |
| **Slate** | `#64748B` | Body text, descriptions |
| **Success Green** | `#2E7D4A` | Positive metrics, checkmarks |
| **Error Red** | `#C62828` | Alerts, critical info |

**Gradient**: Use a subtle burgundy-to-teal gradient for hero sections and CTAs:
```css
background: linear-gradient(135deg, #3D000F 0%, #1A4D5C 100%);
```

### 3.2 Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| H1 (Hero) | Inter | 800 (Extra Bold) | 48-72px |
| H2 (Section) | Inter | 700 (Bold) | 36-48px |
| H3 (Sub-section) | Inter | 600 (Semi Bold) | 24-30px |
| Body | Inter | 400 (Regular) | 16-18px |
| Small / Caption | Inter | 400 | 14px |
| Code / Technical | JetBrains Mono | 400 | 14px |

### 3.3 Logo Assets

Copy from `vitora/web-app/public/` into `vitora-marketing/public/images/`:
- `logo.png` — main logo
- `light-theme-logo.png` — for light backgrounds
- `dark-theme-logo.png` — for dark backgrounds
- `white.png` — white version for dark hero sections
- `favicon.png` — browser favicon
- `sha-logo.svg` — SHA partner logo
- `coa.svg` — Kenya Coat of Arms (for compliance section)

### 3.4 Design Principles

1. **Professional & Trustworthy** — This is healthcare software. Avoid playful or casual aesthetics. Use clean layouts, generous whitespace, and authoritative typography.
2. **Kenya-Proud** — Subtly incorporate Kenyan visual elements: warm gold accents (Kenya sun), the Coat of Arms in the compliance section, SHA branding in integrations.
3. **Offline-First Narrative** — Visual storytelling around connectivity challenges: illustrations of rural clinics, healthcare workers in the field, the concept of "always-on" healthcare.
4. **Dark Mode** — Full dark mode support using `next-themes`. The product has dark mode; the marketing site should too.
5. **Mobile-First** — Many visitors will be on mobile devices. Every section must work perfectly on small screens.

### 3.5 Visual Style

| Element | Style |
|---------|-------|
| Cards | Soft shadow, rounded-xl (12px), subtle border |
| Buttons (Primary) | Burgundy bg, white text, rounded-lg, hover: darken 10% |
| Buttons (Secondary) | Teal outline, teal text, rounded-lg, hover: teal fill |
| Buttons (Ghost) | Transparent, text only, hover: light bg |
| Icons | Lucide icons, 24px, teal or burgundy depending on context |
| Animations | Fade-up on scroll (staggered), subtle parallax on hero |
| Screenshots | Framed in a browser/device mockup, with subtle shadow |
| Dividers | Subtle gradient line or wave SVG between sections |

### 3.6 Tailwind Theme Configuration

The concrete Tailwind config that implements sections 3.1–3.5. Paste this into `tailwind.config.ts`:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.mdx',
  ],
  theme: {
    extend: {
      /* ——— Brand Colors (§3.1) ——— */
      colors: {
        brand: {
          burgundy: {
            DEFAULT: '#3D000F',
            50:  '#FDF2F4',
            100: '#F9E3E7',
            200: '#F0C4CC',
            300: '#E49BA8',
            400: '#D06A7E',
            500: '#B84058',
            600: '#9B2A42',
            700: '#7C1E33',
            800: '#5C1525',
            900: '#3D000F',  // primary – headings, CTA bg
          },
          teal: {
            DEFAULT: '#1A4D5C',
            50:  '#EFF8FA',
            100: '#D5EDF2',
            200: '#AADBE5',
            300: '#72C0D0',
            400: '#3C9DB3',
            500: '#267D93',
            600: '#1F6478',
            700: '#1A4D5C',  // secondary – links, icons, accents
            800: '#163D4A',
            900: '#112F38',
          },
          gold: {
            DEFAULT: '#D4A574',
            50:  '#FBF6F0',
            100: '#F5E8D9',
            200: '#EDCFB0',
            300: '#D4A574',  // accent – badges, highlights
            400: '#C48D56',
            500: '#B07740',
            600: '#946033',
            700: '#764C29',
            800: '#5C3B20',
            900: '#422B18',
          },
        },
        /* Semantic aliases */
        success: '#2E7D4A',
        error:   '#C62828',
        slate:   '#64748B',  // body text
      },

      /* ——— Typography (§3.2) ——— */
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Hero & section headings (mobile → desktop via responsive prefix)
        'hero':      ['3rem',   { lineHeight: '1.1', fontWeight: '800' }],   // 48px
        'hero-lg':   ['4.5rem', { lineHeight: '1.05', fontWeight: '800' }],  // 72px
        'section':   ['2.25rem',{ lineHeight: '1.2', fontWeight: '700' }],   // 36px
        'section-lg':['3rem',   { lineHeight: '1.15', fontWeight: '700' }],  // 48px
        'sub':       ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],   // 24px
        'sub-lg':    ['1.875rem',{ lineHeight: '1.25', fontWeight: '600' }], // 30px
      },

      /* ——— Decorative (§3.5) ——— */
      borderRadius: {
        xl: '0.75rem',   // 12px – cards
      },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        hover: '0 10px 25px rgba(0,0,0,0.08)',
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #3D000F 0%, #1A4D5C 100%)',
      },

      /* ——— Animation tokens ——— */
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up':  'fade-up 0.6s ease-out forwards',
        'fade-in':  'fade-in 0.4s ease-out forwards',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
```

#### Global CSS variables (`app/globals.css`)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Brand primitives */
    --brand-burgundy: 61 0 15;      /* #3D000F */
    --brand-teal:     26 77 92;     /* #1A4D5C */
    --brand-gold:     212 165 116;  /* #D4A574 */

    /* Semantic */
    --background:     0 0% 100%;
    --foreground:     222 47% 11%;
    --muted:          210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --card:           0 0% 100%;
    --card-foreground: 222 47% 11%;
    --border:         214 32% 91%;
    --ring:           var(--brand-teal);
  }

  .dark {
    --background:     222 47% 6%;
    --foreground:     210 40% 98%;
    --muted:          217 33% 17%;
    --muted-foreground: 215 20% 65%;
    --card:           222 47% 9%;
    --card-foreground: 210 40% 98%;
    --border:         217 33% 17%;
  }
}

/* Gradient utility */
.bg-hero-gradient {
  background: linear-gradient(135deg, #3D000F 0%, #1A4D5C 100%);
}
```

---

## 4. Site Map & Page Structure

```
/                           → Home (Landing Page)
/features                   → Features Overview
/features/patient-management → Patient Management deep-dive
/features/clinical          → Clinical & Encounters
/features/pharmacy          → Pharmacy & Inventory
/features/laboratory        → Laboratory Management
/features/billing           → Billing & Insurance
/features/inpatient         → Inpatient & Ward Management
/features/triage            → Triage (KETA)
/ai                         → TibaBot AI (with live demo widget)
/integrations               → SHA, KHIS/DHIS2, FHIR, M-Pesa
/compliance                 → Kenya DPA, Security, Audit
/about                      → About Nexora Africa
/contact                    → Contact / Request Demo
/demo                       → Schedule a Demo (form + embedded video)
/developers                 → API docs overview, FHIR, open-source info
/blog                       → Blog listing (MDX)
/blog/[slug]                → Individual blog post
/legal/privacy              → Privacy Policy
/legal/terms                → Terms of Service
```

### Navigation Structure

**Main Nav (Desktop)**:
```
[Logo]  Features ▼   AI   Integrations   Developers   [Request Demo →]
```

Features dropdown:
```
┌──────────────────────────────────────────┐
│  Patient Management    Pharmacy          │
│  Clinical & Encounters Laboratory        │
│  Billing & Insurance   Inpatient         │
│  Triage (KETA)         All Features →    │
└──────────────────────────────────────────┘
```

**Mobile Nav**: Hamburger menu → full-screen overlay with all links.

**Footer**:
```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]                                                      │
│                                                              │
│  Product          Resources        Company       Legal       │
│  ─────────        ──────────       ──────────    ─────       │
│  Features         Documentation    About Us      Privacy     │
│  AI (TibaBot)     API Docs         Careers       Terms       │
│  Integrations     Blog             Contact       DPA Policy  │
│                   Case Studies     Partners                  │
│                   Support                                    │
│                                                              │
│  🇰🇪 Built for Kenya's Healthcare    © 2026 Nexora Africa   │
│  info@nexora.africa  •  +254 XXX XXX XXX                     │
│                                                              │
│  [Twitter] [LinkedIn] [GitHub]                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Page-by-Page Specifications

### 5.1 Home / Landing Page (`/`)

The most important page. Must communicate: **what Vitora is → why it matters → how it works → social proof → CTA**.

#### Section 1: Hero

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  [Nav Bar]                                                     │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                                                        │    │
│  │  Built for Care Without Limits                         │    │
│  │                                                        │    │
│  │  The offline-first Hospital Management System          │    │
│  │  designed for Kenya's healthcare infrastructure.       │    │
│  │  SHA-compliant. AI-powered. Always available.          │    │
│  │                                                        │    │
│  │  [Request a Demo]  [See Features →]                    │    │
│  │                                                        │    │
│  │  ✓ Offline-first  ✓ SHA Integrated  ✓ Kenya DPA       │    │
│  │                                                        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  [Hero Image: Dashboard screenshot in device mockup]           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

- **Background**: Burgundy-to-teal gradient (dark) or clean white with subtle pattern (light)
- **Animation**: Fade-up text, slide-in screenshot mockup
- **Trust badges below hero**: SHA logo, Kenya Coat of Arms, FHIR logo

#### Section 2: Problem Statement

```
"Kenya's healthcare facilities lose XX hours per week to paper records,
manual SHA claims, and disconnected systems."

Three pain-point cards:
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 🔌 Unreliable    │  │ 📋 Manual         │  │ 🔒 Compliance    │
│    Internet       │  │    Processes      │  │    Burden        │
│                   │  │                   │  │                  │
│ 60% of Kenyan    │  │ Paper records,    │  │ SHA claims,      │
│ health facilities │  │ manual billing,   │  │ KHIS reporting,  │
│ lack reliable    │  │ handwritten       │  │ DPA audits —     │
│ connectivity.    │  │ prescriptions.    │  │ all manual.      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

#### Section 3: Solution Overview

```
"Vitora HMIS: Everything Your Facility Needs"

Six feature cards in a 3×2 grid (icons + short description + link):
- Patient Management    - Pharmacy & Inventory
- Clinical Encounters   - Laboratory
- Billing & Insurance   - Inpatient & Wards

[See All Features →]
```

Each card: icon (Lucide), title, 2-line description, subtle hover animation.

#### Section 4: AI-Powered Healthcare (TibaBot)

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  "AI-Powered Clinical Intelligence"                            │
│                                                                │
│  ┌────────────────────────┐  ┌────────────────────────────┐    │
│  │                        │  │  ┌──────────────────────┐  │    │
│  │  • Symptom Checker     │  │  │  TibaBot Chat Demo   │  │    │
│  │  • ICD-10 Auto-Coding  │  │  │                      │  │    │
│  │  • Clinical Decision   │  │  │  User: "I have a     │  │    │
│  │    Support             │  │  │  headache and fever"  │  │    │
│  │  • Kenya Clinical      │  │  │                      │  │    │
│  │    Guidelines (KEML)   │  │  │  TibaBot: "Based on  │  │    │
│  │  • Condition Predictor │  │  │  your symptoms..."   │  │    │
│  │  • ICU Risk Scoring    │  │  │                      │  │    │
│  │                        │  │  │  [Try it now →]      │  │    │
│  │  [Learn More →]        │  │  └──────────────────────┘  │    │
│  └────────────────────────┘  └────────────────────────────┘    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

- Left: Feature list with icons
- Right: Mini chat preview (static mockup or live TibaBot widget)
- Link to `/ai` for full details

#### Section 5: Key Differentiators

Four columns with animated counters:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│     90%      │  │     15      │  │    4,200+    │  │     47      │
│   Uptime     │  │   SHA APIs  │  │    Tests     │  │   Counties  │
│   Without    │  │  Integrated │  │  87%+ Cov.   │  │  Supported  │
│   Internet   │  │             │  │              │  │             │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

#### Section 6: How It Works

Three-step horizontal flow with illustrations:

```
Step 1                    Step 2                    Step 3
┌──────────┐              ┌──────────┐              ┌──────────┐
│  Deploy  │ ──────────── │  Operate │ ──────────── │  Report  │
│          │              │          │              │          │
│ Install  │              │ Register │              │ Auto     │
│ on any   │              │ patients,│              │ SHA      │
│ device.  │              │ treat,   │              │ claims,  │
│ Works    │              │ dispense,│              │ KHIS     │
│ offline. │              │ bill.    │              │ reports. │
└──────────┘              └──────────┘              └──────────┘
```

#### Section 7: Integrations Banner

Horizontal scrolling logo strip:

```
"Trusted Integrations"
[SHA Logo] [FHIR Logo] [DHIS2 Logo] [M-Pesa Logo] [ICD-10 Logo] [LOINC Logo]
```

#### Section 8: Testimonials / Social Proof

> **Note**: Use placeholder testimonials until pilot data is available. Structure for:
> - Quote from a hospital administrator
> - Quote from a clinician
> - Quote from a county health director
>
> Format: Photo, Name, Title, Facility, Quote.

#### Section 9: CTA Section

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  "Ready to Transform Your Facility?"                           │
│                                                                │
│  Join the growing number of Kenyan healthcare facilities       │
│  modernizing with Vitora HMIS.                                 │
│                                                                │
│  [Request a Demo]           [Contact Sales]                    │
│                                                                │
│  ✓ Free 30-day pilot   ✓ Full onboarding   ✓ Local support    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

Dark background (burgundy-to-teal gradient), white text.

---

### 5.2 Features Overview (`/features`)

A comprehensive page listing all modules with visual cards linking to detail pages.

**Layout**: Section per module category:

1. **Core Clinical** — Patient Management, Clinical Encounters, Triage
2. **Diagnostics & Treatment** — Laboratory, Pharmacy & Inventory
3. **Financial** — Billing & Insurance, SHA Claims
4. **Operations** — Inpatient & Wards, Scheduling
5. **Intelligence** — TibaBot AI, Dashboards & Analytics, Reporting
6. **Platform** — Offline-First, Security, RBAC, Audit Logging

Each module card: Icon, title, 3-4 bullet points, screenshot thumbnail, [Learn More →].

---

### 5.3 Feature Detail Pages (`/features/[module]`)

Each feature page follows a consistent template:

```
1. Hero: Module name + tagline + key screenshot
2. Problem: What pain does this module solve?
3. Capabilities: 6-8 feature bullets with icons
4. Screenshot Gallery: 3-4 annotated screenshots
5. Integration Points: What other modules it connects to
6. CTA: "See it in action" → demo request
```

#### Patient Management (`/features/patient-management`)
- Auto-MRN generation (`MRN-YYYYMMDD-XXXX`)
- Kenya location hierarchy (47 counties cascading)
- Emergency contacts with relationship tracking
- Encrypted PII (Fernet: national ID, phone)
- Consent tracking (Kenya DPA 2019)
- Sensitive patient access control (HIV, GBV, Mental Health)
- Referral source tracking

#### Clinical & Encounters (`/features/clinical`)
- Encounter workflow: Draft → In Progress → Completed
- Comprehensive vitals (temp, BP, pulse, RR, SpO2, weight, height)
- Critical vital alerts (SpO2 < 95% hypoxemia)
- Medical history capture (allergies, chronic conditions, medications, surgeries)
- ICD-10/ICD-11 diagnosis coding with search
- Treatment plan templates
- Clinical document generation

#### Pharmacy & Inventory (`/features/pharmacy`)
- Drug catalog with SHA integration
- FEFO (First Expiry, First Out) tracking
- Prescription management
- Dispensing workflow
- Low stock and expiry alerts
- Batch tracking
- Drug interaction checking

#### Laboratory (`/features/laboratory`)
- Lab order placement (in-house + external referral)
- Result entry with abnormal flagging
- Queue management
- PDF requisitions for external labs
- Result attachment (scanned externals)
- LOINC code reference

#### Billing & Insurance (`/features/billing`)
- Invoice generation
- Multi-payment: Cash, M-Pesa, Card, Insurance, SHA
- Receipt generation
- SHA claims packaging (FHIR R4 bundles)
- Financial reports

#### Inpatient & Wards (`/features/inpatient`)
- Ward types: Medical, Surgical, Pediatric, Maternity, ICU, Isolation
- Bed management (Available, Occupied, Maintenance, Reserved)
- Admission/discharge workflow
- Nursing Kardex with shift handover
- Ward rounds documentation
- Inter-ward transfers
- Real-time bed occupancy dashboard

#### Triage (`/features/triage`)
- KETA scale: RED, ORANGE, YELLOW, GREEN, BLUE
- Priority-sorted waiting queues
- Configurable vital thresholds per facility
- Nurse override with mandatory reason logging
- Wait time and volume reporting

---

### 5.4 AI Page (`/ai`)

Dedicated page for TibaBot AI capabilities. This is a key differentiator.

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  "Meet TibaBot — Your AI Clinical Assistant"                   │
│  Powered by Kenya's own clinical knowledge base.               │
│                                                                │
│  [Try TibaBot Now →]                                           │
│                                                                │
└────────────────────────────────────────────────────────────────┘

Section: Capabilities (6 cards)
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 💬 Patient Chat  │  │ 🔍 Symptom       │  │ 🏥 Clinical      │
│                  │  │    Checker        │  │    Assistant      │
│ Health Q&A with  │  │ Guided triage    │  │ Decision support │
│ risk assessment  │  │ with differential│  │ with Kenya MOH   │
│ and safety.      │  │ diagnosis.       │  │ guidelines.      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 🏷️ ICD-10        │  │ 🧠 Condition     │  │ 🫀 ICU Risk      │
│    Auto-Coding   │  │    Predictor     │  │    Scoring       │
│                  │  │                   │  │                  │
│ 91.8% accuracy,  │  │ CatBoost ML,    │  │ Sepsis, ARDS,    │
│ 121K+ codes.     │  │ ~96% accuracy.  │  │ AKI, Shock.      │
└──────────────────┘  └──────────────────┘  └──────────────────┘

Section: Kenya Clinical Knowledge Base
- KEML 2023: 675 medicines with dosing
- 58 MOH clinical guidelines (5,803 indexed chunks)
- 1,677 PPB registered products
- 1,575 clinical abbreviations
- 9,421 total indexed Kenya clinical documents

Section: Live Demo Widget
[Embedded TibaBot chat interface — full-height, interactive]

Section: How It Integrates
Diagram showing TibaBot ↔ Vitora HMIS integration points:
- Auto-coding during encounter documentation
- Clinical decision support in consultation view
- Symptom checker in patient portal
- Drug interaction checking in pharmacy

Section: Safety & Privacy
- Medical disclaimer
- No patient data storage
- Emergency detection with Kenya numbers (999/112)
- Risk level stratification
```

---

### 5.5 Integrations Page (`/integrations`)

```
Section: SHA (Social Health Authority)
- All 15 DHA APIs integrated
- Eligibility verification
- FHIR R4 claims submission
- Client registry (fetch, register, update)
- Terminology services (ICD-11, LOINC, ICHI)
[SHA logo + "Verified Integration" badge]

Section: KHIS / DHIS2
- Automated MOH reporting
- IDSR weekly disease surveillance
- Aggregate data push
- DHIS2 standard compliance

Section: FHIR R4
- International interoperability standard
- Patient Summary (IPS) bundles
- Claims bundles
- Terminology bindings

Section: M-Pesa
- Mobile payment integration
- Real-time payment confirmation
- Reconciliation reporting

Section: Standards & Terminologies
- ICD-10 / ICD-11 diagnosis coding
- LOINC laboratory codes
- ICHI interventions
- KEML drug catalog
- Kenya MFL (Master Facility List)
- Kenya HWR (Health Worker Registry)
```

---

### 5.6 Compliance Page (`/compliance`)

Critical for the Kenya market.

```
Section: Kenya Data Protection Act 2019
- Full DPA compliance
- DPIA completed and documented
- 7-year audit log retention
- Purpose limitation & data minimization
- Patient consent tracking
- Data subject rights (export, delete)

Section: Security Architecture
- Fernet field-level encryption (AES-128) for PII
- JWT authentication with refresh tokens
- Role-Based Access Control (RBAC) with department scoping
- Full audit trail on every data access
- Bandit security scanning (zero issues)
- Multi-factor authentication support

Section: Audit & Accountability
- Every action logged: who, what, when, where, why
- IP address tracking
- Session management
- Tamper-proof audit logs
- Exportable for regulatory review

[Kenya Coat of Arms] [DPA Badge] [FHIR Certified badge]
```

---

> **Pricing**: No public pricing page for now. All pricing inquiries route to Contact / Request Demo. A pricing page will be added once the pricing model is finalized.

---

### 5.7 About Page (`/about`)

```
Section: Our Mission
"Nexora Africa builds technology that makes quality healthcare accessible
to every Kenyan, regardless of geography or connectivity."

Section: The Problem We Solve
Story-driven narrative about Kenyan healthcare challenges.

Section: Our Team
Placeholder for team photos and bios.

Section: Values
- Kenya-First: Built here, for here
- Offline-First: Healthcare doesn't stop when internet does
- Open Standards: FHIR, ICD, LOINC — no vendor lock-in
- Security-First: Your data, your facility, your rules

Section: Partners & Supporters
Logo grid: MOH, SHA, etc. (when available)
```

---

### 5.8 Contact / Demo Page (`/contact`, `/demo`)

```
/contact:
- Contact form: Name, Email, Phone, Organization, Message
- Email: info@nexora.africa
- Phone: +254 XXX XXX XXX
- Location: Nairobi, Kenya
- Embedded map (optional)

/demo:
- Demo request form: Name, Email, Phone, Facility Name,
  Facility Type (dropdown), Number of Staff, Current System, Message
- Embedded product demo video
- "What to expect" section:
  1. 15-min discovery call
  2. Personalized demo walkthrough
  3. 30-day free pilot setup
- Testimonial sidebar
```

Forms should submit to a backend endpoint or service (e.g., Formspree, Resend, or custom backend endpoint).

---

### 5.9 Developers Page (`/developers`)

```
Section: For Developers
- Architecture overview (offline-first, FHIR R4)
- API documentation link
- Open-source information (Apache-2.0)
- GitHub repository link

Section: API Overview
- REST API with JWT authentication
- FHIR R4 resource support
- WebSocket real-time updates
- Swagger/OpenAPI documentation

Section: TibaBot API
- Endpoint overview for AI integration
- Code samples (Python, TypeScript, cURL)
- Rate limits and authentication

Section: Contribute
- How to contribute
- Development setup guide
- Code of conduct
```

---

### 5.10 Blog (`/blog`, `/blog/[slug]`)

MDX-powered blog for content marketing. Suggested initial posts:

1. "Why Kenya's Healthcare Needs Offline-First Software"
2. "Understanding SHA Claims: A Guide for Facility Administrators"
3. "How AI is Transforming Clinical Decision Support in Kenya"
4. "FHIR R4: What It Means for Kenyan Health Data"
5. "Data Protection in Healthcare: Kenya DPA 2019 Compliance Guide"

**Blog post template**:
```
---
title: "Post Title"
date: "2026-03-01"
author: "Author Name"
category: "Product | Technical | Industry | Guide"
excerpt: "Short description for listing cards."
coverImage: "/images/blog/post-slug.jpg"
---

Content in MDX...
```

---

### 5.11 Legal Pages (`/legal/privacy`, `/legal/terms`)

Standard legal pages. Include:
- Privacy Policy (Kenya DPA 2019 aligned)
- Terms of Service
- Cookie Policy
- Data Processing Agreement (DPA) template for facilities

---

## 6. TibaBot AI Integration

### 6.1 Chat Widget Component

Build a floating chat widget that appears on every page (bottom-right corner). Clicking it opens an embedded TibaBot chat interface.

> **Security: Server-Side Proxy Required**
>
> TibaBot requests MUST be proxied through a Next.js API route. Never call the
> TibaBot backend directly from the browser — doing so would expose the API key
> in client-side JavaScript (any `NEXT_PUBLIC_` env var is bundled into the
> browser build). A server-side proxy keeps the key private, enables rate
> limiting, and prevents abuse (scraping the KEML/MOH knowledge base, cost
> incurrence on the LLM tier, etc.).

#### 6.1.1 Server-Side Proxy (API Route)

```typescript
// marketing/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

const TIBABOT_BASE_URL =
  process.env.TIBABOT_URL || 'https://tibabot.hmis.nexora.africa';

// --- Rate limiting (recommended: @upstash/ratelimit or similar) ---
// import { Ratelimit } from '@upstash/ratelimit';
// import { Redis } from '@upstash/redis';
// const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(20, '1 m') });

export async function POST(req: NextRequest) {
  // Optional: rate-limit by IP
  // const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
  // const { success } = await ratelimit.limit(ip);
  // if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const body = await req.json();

  const res = await fetch(`${TIBABOT_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.TIBABOT_API_KEY && {
        'X-API-Key': process.env.TIBABOT_API_KEY, // server-only — never exposed to browser
      }),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: 'TibaBot service error' },
      { status: res.status },
    );
  }

  return NextResponse.json(await res.json());
}
```

```typescript
// marketing/app/api/chat/health/route.ts
import { NextResponse } from 'next/server';

const TIBABOT_BASE_URL =
  process.env.TIBABOT_URL || 'https://tibabot.hmis.nexora.africa';

export async function GET() {
  try {
    const res = await fetch(`${TIBABOT_BASE_URL}/health`, {
      next: { revalidate: 30 }, // cache for 30 s to avoid hammering upstream
    });
    const data = await res.json();
    return NextResponse.json({ healthy: data.status === 'healthy' });
  } catch {
    return NextResponse.json({ healthy: false });
  }
}
```

#### 6.1.2 Client-Side Chat Client

The browser only talks to the local `/api/chat` proxy — no secrets are involved.

```typescript
// marketing/lib/tibabot-client.ts

interface ChatMessage {
  message: string;
  session_id?: string;
  context?: {
    source: 'marketing_site';
    page: string;
  };
}

interface ChatResponse {
  response: string;
  risk_level: 'low' | 'medium' | 'high' | 'emergency';
  suggested_actions: string[];
  citations: string[];
  session_id: string;
}

export async function sendMessage(payload: ChatMessage): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Chat error: ${res.status}`);
  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/chat/health');
    const data = await res.json();
    return data.healthy === true;
  } catch {
    return false;
  }
}
```

### 6.2 Widget Behavior

| State | Display |
|-------|---------|
| Collapsed | Floating teal button with chat icon + pulse animation |
| Expanded | 400×600px chat panel with message history |
| Offline/Error | "TibaBot is unavailable" + fallback message |
| Emergency detected | Red risk banner + Kenya emergency numbers (999/112) |

### 6.3 AI Demo on `/ai` Page

Full-page TibaBot experience:
- Larger chat interface (centered, 800px max-width)
- Pre-populated quick action buttons: "Check symptoms", "Find ICD-10 code", "Drug interactions"
- Risk level badge display
- Source citations shown
- Medical disclaimer always visible

### 6.4 Environment Variables

```env
# Server-only — NEVER prefix with NEXT_PUBLIC_ (would leak to the browser bundle)
TIBABOT_URL=https://tibabot.hmis.nexora.africa
TIBABOT_API_KEY=              # Required in production; omit for demo mode

# Optional: Upstash Redis for rate limiting the /api/chat proxy
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
```

> **Security note:** All TibaBot credentials are server-only env vars accessed
> exclusively by the API route handlers. The browser never sees them.

---

## 7. Content Strategy

### 7.1 Voice & Tone

| Attribute | Description |
|-----------|-------------|
| **Professional** | Healthcare demands trust. No hype, no jargon-for-jargon's sake. |
| **Empathetic** | Acknowledge the real challenges Kenyan facilities face. |
| **Confident** | State capabilities clearly. Backed by numbers (4,200+ tests, 87% coverage). |
| **Kenyan** | Use local context: counties, SHA, M-Pesa, MoH. |

### 7.2 Key Messaging Pillars

1. **"Works Without Internet"** — Offline-first architecture means healthcare never stops.
2. **"SHA-Ready from Day One"** — All 15 DHA APIs integrated. No additional integration work.
3. **"AI That Understands Kenya"** — TibaBot trained on KEML, MOH guidelines, Kenya clinical protocols.
4. **"Your Data, Your Facility"** — Kenya DPA 2019 compliant. Data stays within your control.
5. **"Deploy Anywhere"** — Desktop, web, or mobile. Works on the devices you already have.

### 7.3 Tagline Options

- **Primary**: "Built for Care Without Limits" (from README)
- **Alternatives**:
  - "Healthcare That Never Goes Offline"
  - "Kenya's Smartest Hospital System"
  - "Where Every Patient Record Matters"

### 7.4 Screenshots Needed

Create or capture these screenshots from the staging environment (`https://vitora.onrender.com`):

| Screenshot | Page/View | Notes |
|------------|-----------|-------|
| Dashboard overview | `/dashboard` | Light + dark mode |
| Patient registration | `/dashboard/patients/register` | Show MRN auto-generation |
| Patient list | `/dashboard/patients` | Show search + filters |
| Encounter view | `/dashboard/encounters/[id]` | Show vitals + critical alerts |
| Triage queue | `/dashboard/triage` | Show KETA color coding |
| Pharmacy dispensing | `/dashboard/pharmacy/dispensing` | Show prescription workflow |
| Lab results | `/dashboard/laboratory` | Show result entry + flagging |
| Billing invoice | `/dashboard/billing/invoices/[id]` | Show payment recording |
| Ward bed map | `/dashboard/inpatient/wards` | Show bed occupancy |
| SHA claims | `/dashboard/sha` | Show claims submission |
| RBAC settings | `/dashboard/settings/roles` | Show role configuration |
| Audit log | `/dashboard/audit` | Show audit trail |
| Dark mode | Any page | Full dark mode view |
| Mobile view | Any page | Responsive mobile layout |

---

## 8. SEO & Performance

### 8.1 SEO Strategy

**Target Keywords**:
| Primary | Secondary |
|---------|-----------|
| Kenya HMIS | hospital management system Kenya |
| healthcare software Kenya | electronic health records Kenya |
| offline HMIS | SHA integration software |
| hospital billing software Kenya | clinic management system |
| KHIS reporting software | FHIR health system Kenya |

**Per-Page SEO**:

```typescript
// Example: app/page.tsx
export const metadata: Metadata = {
  title: 'Vitora HMIS — Offline-First Hospital Management for Kenya',
  description: 'The offline-first hospital management system built for Kenya. SHA-compliant, AI-powered clinical decision support, FHIR R4 interoperable. Request a demo today.',
  keywords: ['Kenya HMIS', 'hospital management system', 'offline healthcare', 'SHA integration', 'FHIR R4'],
  openGraph: {
    title: 'Vitora HMIS — Built for Care Without Limits',
    description: 'Transform your facility with Kenya\'s smartest hospital management system.',
    images: ['/images/og-image.png'],
    type: 'website',
    locale: 'en_KE',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vitora HMIS — Offline-First Hospital Management',
    description: 'SHA-compliant, AI-powered, always available.',
    images: ['/images/og-image.png'],
  },
};
```

### 8.2 Technical SEO

- Sitemap generation (`next-sitemap`)
- robots.txt
- Structured data (Organization, SoftwareApplication, MedicalWebPage schemas)
- Canonical URLs
- Alt text on all images
- Semantic HTML (`<main>`, `<article>`, `<section>`, `<nav>`)

### 8.3 Performance Targets

| Metric | Target |
|--------|--------|
| Lighthouse Performance | > 95 |
| Lighthouse Accessibility | > 95 |
| Lighthouse SEO | > 95 |
| LCP (Largest Contentful Paint) | < 2.5s |
| FID (First Input Delay) | < 100ms |
| CLS (Cumulative Layout Shift) | < 0.1 |
| Total page weight | < 500KB (excl. images) |

### 8.4 Performance Techniques

- Static site generation (SSG) for all marketing pages
- Image optimization with `next/image` (WebP/AVIF)
- Font optimization with `next/font` (Inter preloaded)
- Lazy-load TibaBot widget (dynamic import, load on interaction)
- Minimal client-side JavaScript
- Edge caching headers

---

## 9. Deployment & Infrastructure

### 9.1 Hosting Options

| Option | Cost | Pros | Cons |
|--------|------|------|------|
| **Vercel** (Recommended) | Free tier sufficient | Native Next.js, global CDN, preview deploys | Vendor lock-in |
| **Render** | Free tier (already used) | Consistent with backend hosting | Slower cold starts |
| **Cloudflare Pages** | Free | Global CDN, fast, workers | Build config complexity |

**Recommendation**: Deploy on **Vercel** for optimal Next.js performance. Static export means near-zero hosting costs.

### 9.2 Domain Strategy

| Domain | Purpose |
|--------|---------|
| `vitora.nexora.africa` | Marketing site (primary) |
| `app.vitora.nexora.africa` | Web dashboard (existing `web-app/`) |
| `api.vitora.nexora.africa` | Backend API |
| `tibabot.hmis.nexora.africa` | TibaBot AI (existing, Azure) |

### 9.3 CI/CD

Since `vitora-marketing` is its own repo, the workflow lives at `.github/workflows/ci.yml`:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run build

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

### 9.4 Environment Variables

```env
# .env.local (vitora-marketing repo root)

# Server-only — NEVER prefix with NEXT_PUBLIC_ (would leak to the browser)
TIBABOT_URL=https://tibabot.hmis.nexora.africa
TIBABOT_API_KEY=              # Required in production; omit for demo mode

# Public (safe to expose — no secrets)
NEXT_PUBLIC_APP_URL=https://app.vitora.nexora.africa
NEXT_PUBLIC_API_URL=https://api.vitora.nexora.africa
NEXT_PUBLIC_SITE_URL=https://vitora.nexora.africa

# Optional: Upstash Redis for /api/chat rate limiting
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1)

| Task | Priority | Details |
|------|----------|---------|
| Project scaffolding | P0 | `vitora-marketing` repo, Next.js + Tailwind + TypeScript |
| Design system setup | P0 | Paste brand tokens into `tailwind.config.ts` (see §3.6) |
| Layout components | P0 | Navbar, Footer, CTA Banner, Page Shell |
| Home page — Hero section | P0 | Hero text, CTA buttons, trust badges |
| Home page — Problem/Solution | P0 | Pain points + feature overview cards |
| Home page — Stats section | P1 | Animated counters |
| Dark mode | P1 | `next-themes` integration |
| Mobile responsiveness | P0 | All Phase 1 pages |

### Phase 2: Core Pages (Week 2)

| Task | Priority | Details |
|------|----------|---------|
| Features overview page | P0 | Module grid with icons + descriptions |
| 7 feature detail pages | P0 | Template-based, content for each module |
| Integrations page | P0 | SHA, KHIS, FHIR, M-Pesa sections |
| Compliance page | P0 | DPA, security, audit sections |
| About page | P1 | Mission, team (placeholders), values |
| Contact page | P0 | Contact form + info |
| Demo request page | P0 | Form + "what to expect" |

### Phase 3: AI & Interactivity (Week 3)

| Task | Priority | Details |
|------|----------|---------|
| TibaBot API client | P0 | REST client with error handling |
| TibaBot chat widget | P0 | Floating widget on all pages |
| AI page (`/ai`) | P0 | Full TibaBot showcase + live demo |
| Home page — AI section | P0 | Mini chat preview + feature list |
| Home page — Integrations banner | P1 | Logo ticker |
| Home page — Testimonials | P2 | Placeholder testimonials |
| Scroll animations | P1 | Framer Motion fade-up stagger |

### Phase 4: Content & SEO (Week 4)

| Task | Priority | Details |
|------|----------|---------|
| Developers page | P1 | API overview, contribute section |
| Blog infrastructure | P1 | MDX setup, listing page, post template |
| 3 initial blog posts | P2 | Content marketing pieces |
| SEO metadata (all pages) | P0 | Title, description, OG, Twitter cards |
| Sitemap + robots.txt | P0 | `next-sitemap` |
| Structured data | P1 | JSON-LD schema markup |
| Legal pages | P1 | Privacy, terms (placeholders) |

### Phase 5: Polish & Launch (Week 5)

| Task | Priority | Details |
|------|----------|---------|
| Product screenshots | P0 | Capture from staging, frame in mockups |
| Performance optimization | P0 | Lighthouse 95+ all categories |
| Cross-browser testing | P0 | Chrome, Firefox, Safari, Edge |
| Mobile testing | P0 | iOS Safari, Android Chrome |
| Accessibility audit | P1 | WCAG 2.1 AA compliance |
| CI/CD pipeline | P0 | GitHub Actions + Vercel deployment |
| Domain setup | P0 | DNS, SSL, redirects |
| Analytics setup | P1 | Google Analytics 4 or Plausible |
| Launch | P0 | Ship it! |

---

## 11. Appendix: Copy & Messaging

### 11.1 Hero Copy Options

**Option A (Direct)**:
> **Built for Care Without Limits**  
> The offline-first hospital management system designed for Kenya's healthcare infrastructure. SHA-compliant. AI-powered. Always available.

**Option B (Problem-led)**:
> **Healthcare Doesn't Stop When Internet Does**  
> Vitora HMIS keeps your facility running — online or offline. Full SHA integration, AI clinical support, and rock-solid compliance.

**Option C (Impact-led)**:
> **Transform Your Facility with Kenya's Smartest HMIS**  
> From patient registration to SHA claims — one system that works everywhere, even without internet.

### 11.2 Feature Taglines

| Module | Tagline |
|--------|---------|
| Patient Management | "Every patient, every detail, always secure." |
| Clinical Encounters | "From vitals to diagnosis in one seamless flow." |
| Pharmacy | "Dispense with confidence. Track every batch." |
| Laboratory | "Results you can trust, delivered faster." |
| Billing | "Bill accurately. Get paid faster. SHA-ready." |
| Inpatient | "Every bed accounted for. Every shift covered." |
| Triage | "The right patient, the right priority, every time." |
| TibaBot AI | "Clinical intelligence, powered by Kenya's own guidelines." |

### 11.3 Social Proof Placeholders

> "Since implementing Vitora, our SHA claims processing time has decreased by 60%. The offline capability means we never lose patient data during power outages."  
> — *[Name], Hospital Administrator, [Facility Name]*

> "The AI-powered ICD-10 coding saves me 15 minutes per patient encounter. TibaBot's drug interaction warnings have caught several potential issues."  
> — *[Name], Clinical Officer, [Facility Name]*

> "For the first time, we have real-time visibility into bed occupancy across all our wards. The triage system has streamlined our emergency department flow."  
> — *[Name], Nursing Officer In-Charge, [Facility Name]*

### 11.4 FAQ Content

**Q: Does Vitora work without internet?**  
A: Yes. Vitora is built offline-first. All core functions — patient registration, encounters, prescriptions, billing — work without internet. Data syncs automatically when connectivity returns.

**Q: How does SHA integration work?**  
A: Vitora integrates with all 15 SHA Digital Health Agency APIs. Eligibility verification, claims submission, and status tracking happen automatically within your normal workflow. No separate SHA portal needed.

**Q: Is my data secure?**  
A: Absolutely. Patient data is encrypted at rest using industry-standard Fernet encryption. We comply fully with the Kenya Data Protection Act 2019. A complete DPIA is available on request.

**Q: What devices does Vitora run on?**  
A: Vitora runs on desktop (Windows, macOS, Linux via Electron), web browsers (Chrome, Firefox, Safari, Edge), and mobile devices (Android & iOS via React Native).

**Q: What training is provided?**  
A: We provide role-based training (30-45 minutes per role), on-site support during pilot, and comprehensive documentation. Most staff are productive within one day.

**Q: Can I try before I buy?**  
A: Yes. We offer a free 30-day pilot program at your facility with full onboarding and support.

---

## Design Resources & References

### Inspiration Sites

These are well-designed healthcare/SaaS marketing sites to reference for visual inspiration:

- [Epic Systems](https://www.epic.com) — Healthcare enterprise
- [Athenahealth](https://www.athenahealth.com) — Cloud-based healthcare
- [Linear](https://linear.app) — Clean SaaS marketing (design reference)
- [Vercel](https://vercel.com) — Dark mode, developer-focused (design reference)
- [Stripe](https://stripe.com) — Trust-building, technical product marketing

### Image Resources

- Product screenshots from staging: `https://vitora.onrender.com`
- Stock healthcare images: Unsplash (Kenya healthcare, African hospital, clinician with tablet)
- Icons: Lucide React (already standard in the project)
- Illustrations: Consider [unDraw](https://undraw.co) for custom-colored illustrations

---

---

## 12. Developer Setup

Quick-start guide for `vitora-marketing`.

### 12.1 Prerequisites

- Node.js ≥ 20 (LTS)
- npm ≥ 10 (ships with Node 20)
- Git

### 12.2 Clone & Install

```bash
git clone git@github.com:nexora-africa-ltd/vitora-marketing.git
cd vitora-marketing
npm install
```

### 12.3 Environment

Copy the template and fill in values:

```bash
cp .env.example .env.local
```

Minimal `.env.local` for local dev (TibaBot optional):

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3001   # or your local web-app URL
# TIBABOT_URL=https://tibabot.hmis.nexora.africa
# TIBABOT_API_KEY=
```

### 12.4 Development

```bash
npm run dev          # Starts Next.js on http://localhost:3000
npm run build        # Production build (SSG)
npm run lint         # ESLint + Prettier check
npm run lint:fix     # Auto-fix lint issues
```

### 12.5 Copy Logo & Brand Assets

One-time step — copy brand assets from the product repo:

```bash
# From the vitora (product) repo
cp vitora/web-app/public/logo.png           public/images/
cp vitora/web-app/public/light-theme-logo.png public/images/
cp vitora/web-app/public/dark-theme-logo.png  public/images/
cp vitora/web-app/public/white.png           public/images/
cp vitora/web-app/public/favicon.png         public/
cp vitora/web-app/public/sha-logo.svg        public/images/
cp vitora/web-app/public/coa.svg             public/images/
```

### 12.6 Deployment

The site deploys automatically to Vercel on merge to `main`.

| Environment | Trigger | URL |
|-------------|---------|-----|
| Preview | Every PR | `*.vercel.app` (auto-generated) |
| Production | Merge to `main` | `vitora.nexora.africa` |

For manual deploy:

```bash
npx vercel            # Preview deploy
npx vercel --prod     # Production deploy
```

### 12.7 Relationship to Product Repo

```
nexora-africa-ltd/vitora             # HMIS product (backend, web-app, desktop, mobile)
  └── docs/marketing-site-plan.md    # ← Canonical spec (this file)

nexora-africa-ltd/vitora-marketing   # Marketing site implementation
  └── (Next.js source)               # Built from this spec
```

- **Spec**: This plan doc lives in `vitora/docs/` — update it here.
- **Code**: Implementation lives in `vitora-marketing` — PRs go there.
- **Assets**: Brand assets are copied (not symlinked) from `vitora/web-app/public/`.
- **Integration**: Only the TibaBot proxy (`/api/chat`) connects to external services.

---

**Document Version**: 1.1  
**Author**: Engineering Team  
**Last Updated**: March 2, 2026  
**Next Review**: After Phase 1 implementation
