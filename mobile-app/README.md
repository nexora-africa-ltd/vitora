# Vitora HMIS Mobile App

**Offline-First Hospital Management System for Kenya**

A React Native mobile application built with Expo, designed for Community Health Workers (CHWs) to access patient data in the field without internet connectivity.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Android-green.svg)
![React Native](https://img.shields.io/badge/React%20Native-0.81-61dafb.svg)
![Expo](https://img.shields.io/badge/Expo-54-000020.svg)
![Tests](https://img.shields.io/badge/tests-388%20passing-brightgreen.svg)

---

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Development Setup](#-development-setup)
- [Project Structure](#-project-structure)
- [Running Tests](#-running-tests)
- [Building for Production](#-building-for-production)
- [Configuration](#-configuration)
- [Architecture](#-architecture)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### Core Functionality
- **Offline-First Architecture**: Full CRUD operations work without internet
- **Patient Management**: Create, view, search, and update patient records
- **Kenya Location Hierarchy**: 47 Counties → 289 Sub-Counties → 1,448 Wards
- **Secure Authentication**: JWT-based auth with secure token storage
- **Sync Queue**: Automatic queuing of changes for later synchronization

### User Experience
- **Fast Search**: <200ms search across patient records
- **Pull-to-Refresh**: Refresh patient lists with gesture
- **Offline Indicator**: Visual banner when disconnected
- **Dark Mode Support**: Automatic theme based on system preference

### Security & Compliance
- **Kenya Data Protection Act 2019**: Compliant data handling
- **Encrypted Token Storage**: Using expo-secure-store
- **Audit-Ready**: All operations logged for compliance

---

## 🔧 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | ≥18.0.0 | \`node --version\` |
| npm | ≥9.0.0 | \`npm --version\` |
| Expo CLI | Latest | \`npx expo --version\` |
| Android Studio | Latest | For Android emulator |
| Java JDK | 17 | \`java --version\` |

### For Android Development
1. Install [Android Studio](https://developer.android.com/studio)
2. Set up Android SDK (API Level 34+)
3. Configure \`ANDROID_HOME\` environment variable
4. Create an Android Virtual Device (AVD) or connect a physical device

### For EAS Build (Production)
\`\`\`bash
npm install -g eas-cli
eas login  # Login with Expo account
\`\`\`

---

## 🚀 Quick Start

\`\`\`bash
# Clone the repository
git clone https://github.com/nexora-africa-ltd/vitora.git
cd vitora/mobile-app

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your backend URL

# Start development server
npx expo start

# Press 'a' to open on Android emulator
# Or scan QR code with Expo Go app on device
\`\`\`

---

## 🛠 Development Setup

### 1. Install Dependencies
\`\`\`bash
cd mobile-app
npm install
\`\`\`

### 2. Environment Configuration
Create a \`.env\` file based on \`.env.example\`:
\`\`\`bash
# .env
API_BASE_URL=http://localhost:9088
# For physical device, use your machine's IP:
# API_BASE_URL=http://192.168.1.100:9088
\`\`\`

### 3. Start Backend Server
The mobile app requires the Django backend running:
\`\`\`bash
# In a separate terminal
cd ../backend
poetry install
poetry shell
python manage.py runserver 0.0.0.0:9088
\`\`\`

### 4. Start Development Server
\`\`\`bash
# Development with Expo Go
npx expo start

# Development build (recommended for native modules)
npx expo run:android
\`\`\`

### 5. Running on Physical Device
1. Enable USB debugging on your Android device
2. Connect device via USB
3. Run \`adb devices\` to verify connection
4. Run \`npx expo run:android --device\`

Or use Expo Go:
1. Install Expo Go from Play Store
2. Scan QR code from \`npx expo start\`

---

## 📁 Project Structure

\`\`\`
mobile-app/
├── app/                      # Expo Router screens
│   ├── (auth)/               # Authentication screens
│   │   ├── _layout.tsx       # Auth layout
│   │   └── login.tsx         # Login screen
│   ├── (main)/               # Main app screens (authenticated)
│   │   ├── _layout.tsx       # Main layout with tabs
│   │   ├── index.tsx         # Dashboard
│   │   ├── patients/
│   │   │   ├── index.tsx     # Patient list
│   │   │   └── [id].tsx      # Patient detail
│   │   └── settings.tsx      # Settings
│   ├── _layout.tsx           # Root layout with providers
│   └── index.tsx             # Entry redirect
│
├── components/
│   ├── patients/             # Patient-specific components
│   │   ├── PatientCard.tsx
│   │   ├── PatientList.tsx
│   │   ├── PatientSearch.tsx
│   │   ├── PatientForm.tsx
│   │   └── index.ts
│   └── ui/                   # Reusable UI components
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Card.tsx
│       ├── LoadingSpinner.tsx
│       ├── EmptyState.tsx
│       ├── ErrorBoundary.tsx
│       ├── OfflineBanner.tsx
│       └── index.ts
│
├── hooks/
│   ├── usePatients.ts        # Patient list query
│   ├── usePatient.ts         # Single patient query
│   ├── useCreatePatient.ts   # Create mutation
│   ├── useUpdatePatient.ts   # Update mutation
│   ├── useOfflineStatus.ts   # Network detection
│   ├── useSyncStatus.ts      # Sync queue status
│   └── index.ts
│
├── lib/
│   ├── api/                  # API client layer
│   │   ├── client.ts         # Axios instance with interceptors
│   │   ├── auth.ts           # Auth API
│   │   ├── patients.ts       # Patient CRUD API
│   │   ├── locations.ts      # Kenya locations API
│   │   └── index.ts
│   ├── auth/                 # Authentication
│   │   ├── context.tsx       # AuthProvider
│   │   ├── storage.ts        # Secure token storage
│   │   └── index.ts
│   ├── db/                   # WatermelonDB offline storage
│   │   ├── schema.ts         # Database schema
│   │   ├── context.tsx       # DatabaseProvider
│   │   ├── models/           # WatermelonDB models
│   │   │   ├── Patient.ts
│   │   │   ├── SyncQueue.ts
│   │   │   ├── County.ts
│   │   │   └── ...
│   │   └── repositories/     # Data access layer
│   └── sync/                 # Offline sync
│       ├── queue.ts          # Sync queue manager
│       ├── processor.ts      # Sync processor
│       └── index.ts
│
├── constants/
│   ├── colors.ts             # Design tokens
│   ├── config.ts             # App configuration
│   ├── theme.ts              # Theme constants
│   └── index.ts
│
├── __tests__/                # Jest tests (388+)
├── assets/                   # Images, fonts, icons
├── app.config.js             # Expo configuration
├── eas.json                  # EAS Build configuration
├── package.json
├── tsconfig.json
└── jest.config.js
\`\`\`

---

## 🧪 Running Tests

### All Tests
\`\`\`bash
npm test
\`\`\`

### With Coverage Report
\`\`\`bash
npm test -- --coverage
\`\`\`

### Watch Mode (Development)
\`\`\`bash
npm test -- --watch
\`\`\`

### Specific Test File
\`\`\`bash
npm test -- --testPathPattern="PatientCard"
\`\`\`

### Coverage Thresholds
| Metric | Threshold | Current |
|--------|-----------|---------|
| Statements | 85% | 87%+ |
| Branches | 60% | 61%+ |
| Functions | 80% | 81%+ |
| Lines | 85% | 89%+ |

---

## 📱 Building for Production

### Prerequisites
\`\`\`bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project (if not done)
eas build:configure
\`\`\`

### Development Build (Testing)
\`\`\`bash
# Build APK for testing
eas build --platform android --profile development
\`\`\`

### Production Build
\`\`\`bash
# Build AAB for Play Store
eas build --platform android --profile production
\`\`\`

### Local Build
\`\`\`bash
# Build APK locally
npx expo run:android --variant release
\`\`\`

---

## ⚙️ Configuration

### Key Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| expo | ^54.0.30 | React Native framework |
| react-native | 0.81.5 | Core framework |
| @nozbe/watermelondb | ^0.28 | Offline database |
| @tanstack/react-query | ^5.90 | Data fetching |
| zustand | ^5.0 | State management |
| expo-secure-store | ^15.0 | Secure storage |
| expo-sqlite | ^16.0 | SQLite support |

### Environment Variables
\`\`\`bash
# .env
API_BASE_URL=http://localhost:9088
\`\`\`

---

## 🏗 Architecture

### Offline-First Design
1. **WatermelonDB**: Local SQLite database for offline storage
2. **Sync Queue**: Tracks changes made while offline
3. **Background Sync**: Automatically syncs when connectivity is restored
4. **Conflict Resolution**: Server-wins strategy for conflicts

### State Management
- **Server State**: TanStack Query for API data
- **Local State**: Zustand for UI state
- **Auth State**: React Context for authentication

### Data Flow
\`\`\`
User Action
    ↓
Local Database (WatermelonDB)
    ↓
Sync Queue (if offline)
    ↓
API Request (when online)
    ↓
Server Response
    ↓
Cache Update (TanStack Query)
\`\`\`

---

## 🐛 Troubleshooting

### Metro Bundler Issues
\`\`\`bash
# Clear cache
npx expo start -c
\`\`\`

### Android Build Fails
\`\`\`bash
# Clean build
cd android && ./gradlew clean && cd ..
npx expo run:android
\`\`\`

### WatermelonDB Issues
\`\`\`bash
# Reset database
# Clear app data on device/emulator
\`\`\`

### Network Issues on Emulator
- Use \`10.0.2.2\` instead of \`localhost\` for Android emulator
- Ensure backend is running on \`0.0.0.0:9088\`

---

## 📚 Related Documentation

- **Backend API**: [../backend/README.md](../backend/README.md)
- **Main Documentation**: [../README.md](../README.md)
- **Roadmap**: [../ROADMAP.md](../ROADMAP.md)

---

## Known Limitations

- **Android Only**: iOS support planned for future release
- **Expo Go Restrictions**: Some native modules require development build
- **Sync Conflicts**: Complex conflicts require manual resolution

---

## License

Apache-2.0 - Nexora Africa Ltd © 2026

---

## Contributing

This is part of Phase 1 of the Vitora HMIS development. See \`ROADMAP.md\` in the repository root for more information.
