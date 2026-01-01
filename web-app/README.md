# Vitora HMIS Web Frontend

Modern web frontend for Vitora Hospital Management Information System built with Next.js 14, TypeScript, and TailwindCSS.

## 🎯 Overview

This is the web interface for Vitora HMIS, providing healthcare professionals with a responsive, accessible, and feature-rich platform for managing patient records, encounters, and clinical workflows.

### Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5
- **Styling**: TailwindCSS 3 + shadcn/ui
- **State Management**: TanStack Query 5 (server state) + Zustand 4 (client state)
- **HTTP Client**: Axios 1
- **Forms**: React Hook Form 7 + Zod 3
- **Icons**: Lucide React
- **Testing**: Jest 29 + React Testing Library + Playwright

## 📦 Installation

### Prerequisites

- Node.js 20+ and npm
- Backend API running on `http://127.0.0.1:9088` (see `/backend` directory)

### Setup

```bash
# Navigate to web-app directory
cd web-app

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your backend API URL

# Run development server
npm run dev

# Open http://localhost:3000
```

## 🎨 Features

### Patient Module ✅

The patient module provides comprehensive patient management capabilities:

#### Patient List
- **Search**: By name, MRN, or phone number (debounced)
- **Filters**: Gender filter with dropdown
- **Pagination**: Navigate through patient records (10 per page)
- **Actions**: View, edit, delete options per patient
- **Badges**: Visual indicators for sensitive patients

#### Patient Detail
- **Comprehensive Info Cards**:
  - Basic Information (gender, DOB with age calculation, contact)
  - Address (County, Sub-County, Ward, Village)
  - Emergency Contact (primary contact details)
- **Tabbed Interface**:
  - Encounters: List of patient encounters with status
  - Emergency Contacts: All registered emergency contacts
  - Prescriptions: Placeholder for future implementation
  - Lab Results: Placeholder for future implementation

## 🔧 Available Scripts

```bash
# Development
npm run dev              # Start dev server on port 3000
npm run build            # Production build
npm run start            # Start production server

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run type-check       # TypeScript type checking
npm run format           # Format with Prettier
npm run quality          # Run all quality checks

# Testing
npm test                 # Run Jest tests
npm run test:coverage    # With coverage report
npm run e2e              # Playwright E2E tests
```

## 🚀 Quick Start

```bash
# 1. Start the backend
cd ../backend
poetry shell
python manage.py runserver

# 2. In a new terminal, start the frontend
cd web-app
npm run dev

# 3. Open http://localhost:3000 and login
```

For detailed documentation, see the project wiki.

