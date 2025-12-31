# Vitora HMIS Mobile App

**Offline-First Hospital Management System for Kenya**

A React Native mobile application built with Expo, designed for Community Health Workers (CHWs) to access patient data in the field without internet connectivity.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Android-green.svg)
![React Native](https://img.shields.io/badge/React%20Native-0.76-61dafb.svg)
![Expo](https://img.shields.io/badge/Expo-52-000020.svg)
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
- [Known Limitations](#-known-limitations)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### Core Functionality
- **Offline-First Architecture**: Full CRUD operations work without internet
- **Patient Management**: Create, view, search, and update patient records
- **Kenya Location Hierarchy**: 47 Counties → 289 Sub-Counties → 1448 Wards
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

Before you begin, ensure you have:

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | ≥18.0.0 | `node --version` |
| npm | ≥9.0.0 | `npm --version` |
| Expo CLI | Latest | `npx expo --version` |
| Android Studio | Latest | For Android emulator |
| Java JDK | 17 | `java --version` |

### For Android Development
1. Install [Android Studio](https://developer.android.com/studio)
2. Set up Android SDK (API Level 34+)
3. Configure `ANDROID_HOME` environment variable
4. Create an Android Virtual Device (AVD) or connect a physical device

### For EAS Build (Production)
```bash
npm install -g eas-cli
eas login  # Login with Expo account
```

---

## 🚀 Quick Start

```bash
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
```

---

## 🛠 Development Setup

### 1. Install Dependencies

```bash
cd mobile-app
npm install
```

### 2. Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
# .env
API_BASE_URL=http://localhost:8000
# For physical device, use your machine's IP:
# API_BASE_URL=http://192.168.1.100:8000
```

### 3. Start Backend Server

The mobile app requires the Django backend running:

```bash
# In a separate terminal
cd ../backend
poetry install
poetry shell
python manage.py runserver 0.0.0.0:8000
```

### 4. Start Development Server

```bash
# Development with Expo Go
npx expo start

# Development build (recommended for native modules)
npx expo run:android
```

### 5. Running on Physical Device

1. Enable USB debugging on your Android device
2. Connect device via USB
3. Run `adb devices` to verify connection
4. Run `npx expo run:android --device`

Or use Expo Go:
1. Install Expo Go from Play Store
2. Scan QR code from `npx expo start`

---

## 📁 Project Structure

```
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
├── constants/
│   ├── colors.ts             # Design tokens
│   ├── config.ts             # App configuration
│   ├── theme.ts              # Theme constants
│   └── index.ts
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
│   │   ├── auth.ts           # Auth API (login, refresh, verify)
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
│   │   ├── index.ts          # Database initialization
│   │   ├── models/           # WatermelonDB models
│   │   │   ├── Patient.ts
│   │   │   ├── SyncQueue.ts
│   │   │   ├── County.ts
│   │   │   ├── SubCounty.ts
│   │   │   ├── Ward.ts
│   │   │   └── index.ts
│   │   └── repositories/     # Data access layer
│   │       └── patientRepository.ts
│   └── sync/                 # Offline sync
│       ├── queue.ts          # Sync queue manager
│       ├── processor.ts      # Sync processor
│       └── index.ts
│
├── __tests__/                # Jest tests
│   ├── setup/
│   │   └── jest.setup.ts     # Test configuration
│   ├── api/                  # API tests
│   ├── components/           # Component tests
│   ├── hooks/                # Hook tests
│   ├── lib/                  # Library tests
│   └── navigation/           # Navigation tests
│
├── assets/                   # Images, fonts, icons
├── app.json                  # Expo configuration
├── eas.json                  # EAS Build configuration
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## 🧪 Running Tests

### All Tests
```bash
npm test
```

### With Coverage Report
```bash
npm test -- --coverage
```

### Watch Mode (Development)
```bash
npm test -- --watch
```

### Specific Test File
```bash
npm test -- --testPathPattern="PatientCard"
```

### Coverage Thresholds
| Metric | Threshold | Current |
|--------|-----------|---------|
| Statements | 85% | 87.14% |
| Branches | 60% | 61.40% |
| Functions | 80% | 81.22% |
| Lines | 85% | 89.86% |

---

## 📱 Building for Production

### Prerequisites
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project (if not done)
eas build:configure
```

### Build Android APK (Preview)
```bash
# Build APK for testing
eas build --platform android --profile preview

# Download APK from provided URL after build completes
```

### Build Android AAB (Production)
```bash
# Build for Play Store
eas build --platform android --profile production
```

### Local Development Build
```bash
# Build locally (requires Android SDK)
npx expo run:android --variant release
```

### Build Profiles (`eas.json`)
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | Backend API URL | `http://localhost:8000` |

### App Configuration (`app.json`)

| Setting | Value |
|---------|-------|
| Package Name | `com.nexora.vitora` |
| Version | `0.1.0` |
| Android Target SDK | 34 |
| Minimum SDK | 24 (Android 7.0) |

### Build Configuration (`eas.json`)

See [eas.json](./eas.json) for build profiles.

---

## 🏗 Architecture

### Offline-First Design

```
┌─────────────────────────────────────────────────────────┐
│                      Mobile App                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐     ┌─────────────┐     ┌───────────┐  │
│  │   Screens   │────▶│    Hooks    │────▶│  TanStack │  │
│  │  (Expo      │     │  usePatients│     │   Query   │  │
│  │   Router)   │     │  useAuth    │     │           │  │
│  └─────────────┘     └─────────────┘     └─────┬─────┘  │
│                                                 │        │
│                            ┌────────────────────┼────┐   │
│                            │                    │    │   │
│                      ┌─────▼─────┐        ┌─────▼────┴┐  │
│                      │  API      │        │ WaterMelon│  │
│                      │  Client   │        │    DB     │  │
│                      │  (Axios)  │        │  (SQLite) │  │
│                      └─────┬─────┘        └─────┬─────┘  │
│                            │                    │        │
│                      ┌─────▼─────┐        ┌─────▼─────┐  │
│                      │   Sync    │◀──────▶│   Sync    │  │
│                      │ Processor │        │   Queue   │  │
│                      └─────┬─────┘        └───────────┘  │
│                            │                             │
└────────────────────────────┼─────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Django Backend │
                    │  (REST API)     │
                    └─────────────────┘
```

### Data Flow

1. **Online Mode**: API → TanStack Query Cache → UI
2. **Offline Mode**: WatermelonDB → UI
3. **Sync**: SyncQueue → SyncProcessor → API → Clear Queue

### Key Technologies

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | React Native + Expo | Cross-platform mobile |
| Navigation | Expo Router | File-based routing |
| State Management | TanStack Query | Server state + caching |
| Offline Storage | WatermelonDB | SQLite with React integration |
| API Client | Axios | HTTP requests + interceptors |
| Auth Storage | expo-secure-store | Encrypted token storage |
| Testing | Jest + RTL | Unit and integration tests |

---

## ⚠️ Known Limitations

### Current Version (0.1.0)

1. **Android Only**: iOS support planned for future release
2. **No Real-Time Sync**: Manual sync trigger required (automatic sync in v0.2.0)
3. **Limited Conflict Resolution**: Last-write-wins strategy only
4. **No Image Support**: Patient photos not yet implemented
5. **Single User**: Multi-user offline support in progress
6. **Kenya Locations**: Pre-loaded, not dynamically updated

### Database Constraints

- Maximum offline patients: ~10,000 (SQLite limitation)
- Sync queue maximum: 1,000 pending operations
- Date range: 1900-01-01 to current date

### Network Requirements

- Initial login requires internet
- Sync requires internet connection
- Location data cached on first load

### Performance Notes

- Cold start: ~2-3 seconds
- Patient list render: <500ms for 100 patients
- Search: <200ms response time
- APK size: ~25MB (estimated)

---

## 🔧 Troubleshooting

### Common Issues

#### Metro Bundler Issues
```bash
# Clear cache and restart
npx expo start --clear
```

#### Android Build Failures
```bash
# Clean Android build
cd android && ./gradlew clean && cd ..
npx expo run:android
```

#### Database Reset
```bash
# Delete local database (development only)
rm -f vitora_hmis.db
npx expo start --clear
```

#### Authentication Issues
```bash
# Clear secure storage (development)
# In app: Settings > Clear Data
# Or reinstall the app
```

#### Network Connection to Backend
1. Ensure backend is running on `0.0.0.0:8000`
2. For physical device, use machine's IP in `.env`
3. Check firewall allows port 8000

### Debug Mode

```bash
# Enable React Native debugger
npx expo start
# Press 'j' for JavaScript debugger
# Press 'm' for menu, then 'Debug Remote JS'
```

### Logs

```bash
# Android logs
adb logcat | grep -i vitora

# Expo logs
npx expo start --verbose
```

---

## 📚 Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [WatermelonDB Guide](https://nozbe.github.io/WatermelonDB/)
- [TanStack Query](https://tanstack.com/query/latest)
- [Vitora Backend README](../backend/README.md)
- [Project Roadmap](../ROADMAP.md)

---

## 🤝 Contributing

1. Follow TDD methodology (write tests first)
2. Ensure all tests pass: `npm test`
3. Maintain coverage thresholds
4. Use conventional commits
5. Update documentation as needed

---

## 📄 License

Copyright © 2025 Nexora Africa Ltd. All rights reserved.

---

**Built with ❤️ for Kenya's Healthcare Workers**
