# Sprint 1.1-1.2 Track B: Mobile App Foundation - Deliverables

**Sprint Duration**: Weeks 1-4 (Phase 1)
**Status**: 📋 PLANNED
**Target Date**: April 2026
**Parallel Track**: Running alongside Track A (Encounter Management)

---

## Executive Summary

Sprint 1.1-1.2 Track B establishes the React Native mobile application foundation for Vitora HMIS. Following Test-Driven Development (TDD) methodology, this sprint delivers an offline-capable mobile app targeting Android devices, enabling community health workers (CHWs) to access patient data in the field without internet connectivity.

**Why Mobile Early?**
- Kenya has higher smartphone penetration than desktop computers
- Community Health Workers (CHWs) need field access for rural outreach
- Backend API is ready (Phase 0 complete with 467+ tests)
- Earlier cross-device testing reduces integration risk in later sprints

---

## Test Requirements Summary (TDD)

| Test Category | Estimated Tests | Priority |
|---------------|-----------------|----------|
| React Native Setup | 8 | P0 |
| SQLite/WatermelonDB | 15 | P0 |
| Offline Patient Storage | 20 | P0 |
| JWT Authentication | 18 | P0 |
| API Client | 12 | P1 |
| Navigation | 10 | P1 |
| UI Components | 25 | P1 |
| Sync Foundation | 15 | P2 |
| **Total** | **~123** | |

---

## 📋 Task Checklist

### Week 1: Project Setup & Database Foundation

#### Day 1-2: Project Scaffold
- [x] Create `mobile-app/` directory in project root
- [x] Initialize Expo project with TypeScript template (`npx create-expo-app`)
- [x] Configure `tsconfig.json` with strict mode and path aliases
- [x] Set up ESLint + Prettier with project rules
- [x] Configure `babel.config.js` with required plugins
- [x] Add `.env` file with `API_BASE_URL` configuration
- [x] Create `constants/config.ts` for environment variables
- [x] Set up Jest with React Native Testing Library
- [x] Write 8 setup tests (verify scaffold works)
- [x] ✅ **Checkpoint**: `npm test` passes, app launches on emulator

#### Day 3-4: WatermelonDB Setup
- [x] Install WatermelonDB and expo-sqlite dependencies
- [x] Create `lib/db/schema.ts` with patients table schema
- [x] Create `lib/db/schema.ts` with sync_queue table schema
- [x] Create `lib/db/schema.ts` with counties/sub_counties tables
- [x] Create `lib/db/models/Patient.ts` model class
- [x] Create `lib/db/models/SyncQueue.ts` model class
- [x] Create `lib/db/index.ts` database initialization
- [x] Create `lib/db/context.tsx` DatabaseProvider
- [x] Write 15 database tests (schema, CRUD, persistence)
- [x] ✅ **Checkpoint**: Database initializes, models work

#### Day 5: Patient Repository
- [ ] Create `lib/db/repositories/patientRepository.ts`
- [ ] Implement `getAll()` with pagination
- [ ] Implement `search()` by name/MRN/phone
- [ ] Implement `getById()` and `getByMrn()`
- [ ] Implement `create()` with sync queue integration
- [ ] Implement `update()` with sync queue integration
- [ ] Implement `delete()` (soft delete) with sync queue
- [ ] Implement `getUnsyncedCount()`
- [ ] Write 20 patient storage tests
- [ ] ✅ **Checkpoint**: All CRUD operations work offline

### Week 2: Authentication & API Client

#### Day 6-7: Secure Token Storage
- [ ] Install expo-secure-store
- [ ] Create `lib/auth/storage.ts` with token methods
- [ ] Implement `setTokens()` for access + refresh tokens
- [ ] Implement `getAccessToken()` and `getRefreshToken()`
- [ ] Implement `setUser()` and `getUser()`
- [ ] Implement `clearAll()` for logout
- [ ] Implement `isAuthenticated()` check
- [ ] Write 6 secure storage tests
- [ ] ✅ **Checkpoint**: Tokens persist across app restarts

#### Day 8-9: Auth Context & Login Flow
- [ ] Create `lib/auth/context.tsx` AuthProvider
- [ ] Implement `restoreSession()` on app start
- [ ] Implement `login(username, password)` method
- [ ] Implement `logout()` method
- [ ] Implement `refreshSession()` method
- [ ] Create `useAuth()` hook
- [ ] Create `lib/api/auth.ts` with login/refresh/verify APIs
- [ ] Write 12 auth flow tests
- [ ] ✅ **Checkpoint**: Login works, session persists

#### Day 10: API Client with Interceptors
- [ ] Install axios
- [ ] Create `lib/api/client.ts` with base configuration
- [ ] Implement request interceptor for auth header injection
- [ ] Implement response interceptor for 401 handling
- [ ] Implement token refresh queue (concurrent request handling)
- [ ] Create `lib/api/patients.ts` with CRUD methods
- [ ] Create `lib/api/locations.ts` for counties/sub-counties
- [ ] Write 12 API client tests
- [ ] ✅ **Checkpoint**: API calls work with auto token refresh

### Week 3: Navigation & UI Components

#### Day 11-12: Navigation Structure
- [ ] Install expo-router
- [ ] Create `app/_layout.tsx` root layout with providers
- [ ] Create `app/index.tsx` entry redirect
- [ ] Create `app/(auth)/_layout.tsx` auth group layout
- [ ] Create `app/(auth)/login.tsx` login screen
- [ ] Create `app/(main)/_layout.tsx` with auth guard
- [ ] Create `app/(main)/index.tsx` dashboard
- [ ] Create `app/(main)/patients/index.tsx` patient list
- [ ] Create `app/(main)/patients/[id].tsx` patient detail
- [ ] Create `app/(main)/settings.tsx` settings screen
- [ ] Write 10 navigation tests
- [ ] ✅ **Checkpoint**: Navigation works with auth protection

#### Day 13-14: Core UI Components
- [ ] Create `components/ui/Button.tsx` (primary/secondary/danger)
- [ ] Create `components/ui/Input.tsx` (text/phone/date)
- [ ] Create `components/ui/Card.tsx` base card
- [ ] Create `components/ui/LoadingSpinner.tsx`
- [ ] Create `components/ui/EmptyState.tsx`
- [ ] Create `components/ui/ErrorBoundary.tsx`
- [ ] Create `components/ui/OfflineBanner.tsx`
- [ ] Create `constants/colors.ts` design tokens
- [ ] Create `constants/theme.ts` theme configuration
- [ ] Write 15 component tests
- [ ] ✅ **Checkpoint**: All UI components render correctly

#### Day 15: Patient Components
- [ ] Create `components/patients/PatientCard.tsx`
- [ ] Create `components/patients/PatientList.tsx`
- [ ] Create `components/patients/PatientSearch.tsx`
- [ ] Create `components/patients/PatientForm.tsx`
- [ ] Create `hooks/usePatients.ts` with TanStack Query
- [ ] Create `hooks/usePatient.ts` for single patient
- [ ] Create `hooks/useCreatePatient.ts` mutation
- [ ] Create `hooks/useUpdatePatient.ts` mutation
- [ ] Write 10 patient component tests
- [ ] ✅ **Checkpoint**: Patient list renders with search

### Week 4: Sync Foundation & Polish

#### Day 16-17: Sync Queue
- [ ] Create `lib/sync/queue.ts` sync queue manager
- [ ] Implement `add()` for queuing operations
- [ ] Implement `getPending()` and `getPendingCount()`
- [ ] Implement `markSyncing()`, `markSynced()`, `markFailed()`
- [ ] Implement `clearSynced()` cleanup
- [ ] Create `hooks/useOfflineStatus.ts` network detection
- [ ] Create `hooks/useSyncStatus.ts` pending count hook
- [ ] Write 15 sync queue tests
- [ ] ✅ **Checkpoint**: Changes queue correctly for sync

#### Day 18-19: Integration & Polish
- [ ] Integrate sync queue with patient repository
- [ ] Add offline indicator to all screens
- [ ] Add pull-to-refresh on patient list
- [ ] Add loading states to all async operations
- [ ] Add error handling with user-friendly messages
- [ ] Test complete offline workflow
- [ ] Test complete online workflow
- [ ] Test offline-to-online transition
- [ ] ✅ **Checkpoint**: Full offline/online flow works

#### Day 20: Build & Documentation
- [ ] Configure `app.json` for Android build
- [ ] Run `eas build --platform android --profile preview`
- [ ] Test APK on physical Android device
- [ ] Verify app size < 30MB
- [ ] Verify startup time < 3s
- [ ] Update `mobile-app/README.md` with setup instructions
- [ ] Document known limitations
- [ ] Create demo video showing offline capability
- [ ] ✅ **Checkpoint**: APK installs and runs on device

---

### 🎯 Sprint Completion Checklist

#### Code Quality
- [ ] All 123+ tests passing
- [ ] Test coverage ≥ 80%
- [ ] No ESLint errors or warnings
- [ ] No TypeScript errors
- [ ] All components have prop types

#### Functionality
- [ ] App launches on Android emulator
- [ ] App launches on physical Android device
- [ ] Login flow works end-to-end
- [ ] Patient list displays correctly
- [ ] Patient search works offline
- [ ] Patient detail view shows all fields
- [ ] Offline banner appears when disconnected
- [ ] Changes queue for sync when offline

#### Performance
- [ ] App startup < 3 seconds
- [ ] Patient list loads < 500ms (100 patients)
- [ ] Search response < 200ms
- [ ] APK size < 30MB

#### Documentation
- [ ] README.md with setup instructions
- [ ] All public functions have JSDoc comments
- [ ] Architecture decisions documented
- [ ] Known issues documented

---

## Components to Implement

### 1. React Native Project Scaffold

**Framework**: React Native with Expo (managed workflow)

**Project Structure**:
```
mobile-app/
├── app/                      # Expo Router app directory
│   ├── (auth)/               # Auth group (login, register)
│   │   ├── login.tsx
│   │   └── _layout.tsx
│   ├── (main)/               # Main app (authenticated)
│   │   ├── index.tsx         # Dashboard
│   │   ├── patients/
│   │   │   ├── index.tsx     # Patient list
│   │   │   └── [id].tsx      # Patient detail
│   │   └── _layout.tsx
│   ├── _layout.tsx           # Root layout
│   └── index.tsx             # Entry point
├── components/
│   ├── ui/                   # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── LoadingSpinner.tsx
│   ├── patients/
│   │   ├── PatientCard.tsx
│   │   ├── PatientList.tsx
│   │   └── PatientSearch.tsx
│   └── layout/
│       ├── Header.tsx
│       └── TabBar.tsx
├── lib/
│   ├── api/
│   │   ├── client.ts         # API client with auth
│   │   ├── patients.ts       # Patient API calls
│   │   └── auth.ts           # Auth API calls
│   ├── db/
│   │   ├── schema.ts         # WatermelonDB schema
│   │   ├── models/           # WatermelonDB models
│   │   │   ├── Patient.ts
│   │   │   └── SyncQueue.ts
│   │   └── index.ts          # Database setup
│   ├── auth/
│   │   ├── context.tsx       # Auth context provider
│   │   ├── storage.ts        # Secure token storage
│   │   └── hooks.ts          # useAuth, useUser hooks
│   └── sync/
│       ├── queue.ts          # Offline sync queue
│       └── manager.ts        # Sync manager
├── hooks/
│   ├── usePatients.ts        # Patient data hook
│   ├── useOfflineStatus.ts   # Network status hook
│   └── useDatabase.ts        # Database hook
├── constants/
│   ├── colors.ts
│   ├── config.ts             # API URLs, timeouts
│   └── theme.ts
├── __tests__/                # Jest tests
│   ├── setup/
│   │   └── jest.setup.ts
│   ├── lib/
│   │   ├── api.test.ts
│   │   ├── auth.test.ts
│   │   └── db.test.ts
│   ├── components/
│   │   └── PatientCard.test.tsx
│   └── e2e/                  # Detox E2E tests
├── app.json
├── package.json
├── tsconfig.json
├── babel.config.js
└── README.md
```

**Dependencies**:
```json
{
  "dependencies": {
    "expo": "~50.x",
    "expo-router": "~3.x",
    "expo-secure-store": "~12.x",
    "expo-sqlite": "~13.x",
    "@nozbe/watermelondb": "^0.27.x",
    "@tanstack/react-query": "^5.x",
    "react-native-mmkv": "^2.x",
    "axios": "^1.x",
    "zustand": "^4.x",
    "date-fns": "^3.x"
  },
  "devDependencies": {
    "jest": "^29.x",
    "@testing-library/react-native": "^12.x",
    "detox": "^20.x",
    "typescript": "^5.x",
    "@types/react": "^18.x"
  }
}
```

**Test Coverage (8 tests)**:
```typescript
// __tests__/setup/app.test.ts
describe('React Native App Setup', () => {
  it('should initialize Expo app without errors');
  it('should configure TypeScript correctly');
  it('should set up Expo Router navigation');
  it('should configure Metro bundler');
  it('should load environment variables');
  it('should configure babel with required plugins');
  it('should set up path aliases (@/ for src)');
  it('should pass ESLint checks');
});
```

---

### 2. SQLite/WatermelonDB Offline Storage

**Module**: `lib/db/`

**Schema Definition**:
```typescript
// lib/db/schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'patients',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'mrn', type: 'string' },
        { name: 'first_name', type: 'string' },
        { name: 'last_name', type: 'string' },
        { name: 'date_of_birth', type: 'number' }, // timestamp
        { name: 'gender', type: 'string' },
        { name: 'phone_number', type: 'string', isOptional: true },
        { name: 'national_id', type: 'string', isOptional: true },
        { name: 'county_id', type: 'number', isOptional: true },
        { name: 'sub_county_id', type: 'number', isOptional: true },
        { name: 'emergency_contact_name', type: 'string', isOptional: true },
        { name: 'emergency_contact_phone', type: 'string', isOptional: true },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'operation', type: 'string' }, // CREATE, UPDATE, DELETE
        { name: 'model_name', type: 'string' },
        { name: 'record_id', type: 'string' },
        { name: 'data', type: 'string' }, // JSON
        { name: 'status', type: 'string' }, // PENDING, SYNCING, SYNCED, FAILED
        { name: 'retry_count', type: 'number' },
        { name: 'error_message', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'counties',
      columns: [
        { name: 'server_id', type: 'number' },
        { name: 'code', type: 'number' },
        { name: 'name', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'sub_counties',
      columns: [
        { name: 'server_id', type: 'number' },
        { name: 'county_id', type: 'number' },
        { name: 'name', type: 'string' },
      ],
    }),
  ],
});
```

**Model Classes**:
```typescript
// lib/db/models/Patient.ts
import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text } from '@nozbe/watermelondb/decorators';

export class Patient extends Model {
  static table = 'patients';

  @text('server_id') serverId!: string | null;
  @text('mrn') mrn!: string;
  @text('first_name') firstName!: string;
  @text('last_name') lastName!: string;
  @date('date_of_birth') dateOfBirth!: Date;
  @text('gender') gender!: string;
  @text('phone_number') phoneNumber!: string | null;
  @text('national_id') nationalId!: string | null;
  @field('county_id') countyId!: number | null;
  @field('sub_county_id') subCountyId!: number | null;
  @text('emergency_contact_name') emergencyContactName!: string | null;
  @text('emergency_contact_phone') emergencyContactPhone!: string | null;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  get age(): number {
    const today = new Date();
    const birth = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }
}
```

**Test Coverage (15 tests)**:
```typescript
// __tests__/lib/db.test.ts
describe('WatermelonDB Setup', () => {
  describe('Schema', () => {
    it('should define patients table with all required columns');
    it('should define sync_queue table');
    it('should define counties table');
    it('should define sub_counties table');
    it('should set correct column types');
  });

  describe('Database Initialization', () => {
    it('should initialize SQLite database');
    it('should apply schema migrations');
    it('should handle database reset');
    it('should persist data across app restarts');
  });

  describe('Patient Model', () => {
    it('should create patient record');
    it('should update patient record');
    it('should delete patient record');
    it('should calculate fullName correctly');
    it('should calculate age correctly');
    it('should track sync status');
  });
});
```

---

### 3. Offline Patient Storage & Retrieval

**Module**: `lib/db/` and `hooks/usePatients.ts`

**Features**:
- CRUD operations on local SQLite database
- Search by name, MRN, or phone number
- Pagination for large patient lists
- Automatic sync queue population on changes

**Patient Repository**:
```typescript
// lib/db/repositories/patientRepository.ts
import { Q } from '@nozbe/watermelondb';
import { database } from '../index';
import { Patient } from '../models/Patient';

export const patientRepository = {
  async getAll(limit = 50, offset = 0): Promise<Patient[]> {
    return database
      .get<Patient>('patients')
      .query(Q.sortBy('created_at', Q.desc), Q.skip(offset), Q.take(limit))
      .fetch();
  },

  async search(query: string): Promise<Patient[]> {
    const lowerQuery = query.toLowerCase();
    return database
      .get<Patient>('patients')
      .query(
        Q.or(
          Q.where('first_name', Q.like(`%${lowerQuery}%`)),
          Q.where('last_name', Q.like(`%${lowerQuery}%`)),
          Q.where('mrn', Q.like(`%${lowerQuery}%`)),
          Q.where('phone_number', Q.like(`%${query}%`))
        )
      )
      .fetch();
  },

  async getById(id: string): Promise<Patient | null> {
    try {
      return await database.get<Patient>('patients').find(id);
    } catch {
      return null;
    }
  },

  async getByMrn(mrn: string): Promise<Patient | null> {
    const results = await database
      .get<Patient>('patients')
      .query(Q.where('mrn', mrn))
      .fetch();
    return results[0] || null;
  },

  async create(data: Omit<PatientData, 'id'>): Promise<Patient> {
    return database.write(async () => {
      const patient = await database.get<Patient>('patients').create((p) => {
        p.mrn = data.mrn;
        p.firstName = data.firstName;
        p.lastName = data.lastName;
        p.dateOfBirth = data.dateOfBirth;
        p.gender = data.gender;
        p.phoneNumber = data.phoneNumber;
        p.nationalId = data.nationalId;
        p.countyId = data.countyId;
        p.subCountyId = data.subCountyId;
        p.emergencyContactName = data.emergencyContactName;
        p.emergencyContactPhone = data.emergencyContactPhone;
        p.isSynced = false;
      });

      // Queue for sync
      await syncQueue.add('CREATE', 'Patient', patient.id, patient);

      return patient;
    });
  },

  async update(id: string, data: Partial<PatientData>): Promise<Patient> {
    return database.write(async () => {
      const patient = await database.get<Patient>('patients').find(id);
      await patient.update((p) => {
        Object.assign(p, data);
        p.isSynced = false;
      });

      // Queue for sync
      await syncQueue.add('UPDATE', 'Patient', patient.id, patient);

      return patient;
    });
  },

  async delete(id: string): Promise<void> {
    return database.write(async () => {
      const patient = await database.get<Patient>('patients').find(id);
      
      // Queue for sync before delete
      await syncQueue.add('DELETE', 'Patient', patient.id, { id: patient.serverId });
      
      await patient.markAsDeleted();
    });
  },

  async getUnsyncedCount(): Promise<number> {
    return database
      .get<Patient>('patients')
      .query(Q.where('is_synced', false))
      .fetchCount();
  },
};
```

**React Hook**:
```typescript
// hooks/usePatients.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientRepository } from '@/lib/db/repositories/patientRepository';

export function usePatients(searchQuery?: string) {
  return useQuery({
    queryKey: ['patients', searchQuery],
    queryFn: () =>
      searchQuery
        ? patientRepository.search(searchQuery)
        : patientRepository.getAll(),
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientRepository.getById(id),
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: patientRepository.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PatientData> }) =>
      patientRepository.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
    },
  });
}
```

**Test Coverage (20 tests)**:
```typescript
// __tests__/lib/patients.test.ts
describe('Patient Storage', () => {
  describe('Create', () => {
    it('should create patient with all required fields');
    it('should generate local ID for new patient');
    it('should set is_synced to false for new patient');
    it('should add CREATE entry to sync queue');
    it('should validate required fields');
  });

  describe('Read', () => {
    it('should fetch all patients with pagination');
    it('should search by first name');
    it('should search by last name');
    it('should search by MRN');
    it('should search by phone number');
    it('should get patient by ID');
    it('should return null for non-existent ID');
  });

  describe('Update', () => {
    it('should update patient fields');
    it('should set is_synced to false on update');
    it('should add UPDATE entry to sync queue');
    it('should preserve unmodified fields');
  });

  describe('Delete', () => {
    it('should soft-delete patient');
    it('should add DELETE entry to sync queue');
    it('should exclude deleted from queries');
  });

  describe('Offline Behavior', () => {
    it('should work without network connection');
    it('should persist data across app restarts');
  });
});
```

---

### 4. JWT Authentication for Mobile

**Module**: `lib/auth/`

**Features**:
- Secure token storage using Expo SecureStore
- Automatic token refresh
- Auth state persistence
- Logout with token cleanup

**Secure Storage**:
```typescript
// lib/auth/storage.ts
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'vitora_access_token';
const REFRESH_TOKEN_KEY = 'vitora_refresh_token';
const USER_KEY = 'vitora_user';

export const authStorage = {
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },

  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async setUser(user: User): Promise<void> {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  async getUser(): Promise<User | null> {
    const data = await SecureStore.getItemAsync(USER_KEY);
    return data ? JSON.parse(data) : null;
  },

  async clearAll(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  },
};
```

**Auth Context**:
```typescript
// lib/auth/context.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { authStorage } from './storage';
import { authApi } from '../api/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore session on app start
    restoreSession();
  }, []);

  async function restoreSession() {
    try {
      setIsLoading(true);
      const storedUser = await authStorage.getUser();
      const token = await authStorage.getAccessToken();

      if (storedUser && token) {
        // Verify token is still valid
        const isValid = await authApi.verifyToken(token);
        if (isValid) {
          setUser(storedUser);
        } else {
          // Try to refresh
          await refreshSession();
        }
      }
    } catch (error) {
      console.error('Session restore failed:', error);
      await authStorage.clearAll();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string) {
    const response = await authApi.login(username, password);
    await authStorage.setTokens(response.access, response.refresh);
    await authStorage.setUser(response.user);
    setUser(response.user);
  }

  async function logout() {
    await authStorage.clearAll();
    setUser(null);
  }

  async function refreshSession() {
    try {
      const refreshToken = await authStorage.getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const response = await authApi.refresh(refreshToken);
      await authStorage.setTokens(response.access, refreshToken);
    } catch (error) {
      await logout();
      throw error;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

**Test Coverage (18 tests)**:
```typescript
// __tests__/lib/auth.test.ts
describe('JWT Authentication', () => {
  describe('Secure Storage', () => {
    it('should store access token securely');
    it('should store refresh token securely');
    it('should store user data securely');
    it('should retrieve tokens correctly');
    it('should clear all auth data on logout');
    it('should report authentication status');
  });

  describe('Login Flow', () => {
    it('should login with valid credentials');
    it('should store tokens after successful login');
    it('should set user in context after login');
    it('should reject invalid credentials');
    it('should handle network errors gracefully');
  });

  describe('Token Refresh', () => {
    it('should refresh expired access token');
    it('should use refresh token for renewal');
    it('should logout if refresh fails');
    it('should update stored access token after refresh');
  });

  describe('Session Persistence', () => {
    it('should restore session on app start');
    it('should verify token validity on restore');
    it('should clear invalid session data');
  });
});
```

---

### 5. API Client with Authentication

**Module**: `lib/api/`

**Features**:
- Axios instance with auth interceptors
- Automatic token injection
- Token refresh on 401 responses
- Offline request queueing
- Request/response logging in development

**API Client**:
```typescript
// lib/api/client.ts
import axios, { AxiosInstance, AxiosError } from 'axios';
import { authStorage } from '../auth/storage';
import { API_BASE_URL } from '@/constants/config';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

function processQueue(error: Error | null, token: string | null = null) {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token!);
    }
  });
  failedQueue = [];
}

export function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor - add auth token
  client.interceptors.request.use(async (config) => {
    // Skip auth for login/refresh endpoints
    if (config.url?.includes('/api/token')) {
      return config;
    }

    const token = await authStorage.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Response interceptor - handle 401 and refresh
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as typeof error.config & { _retry?: boolean };

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // Queue this request while refresh is in progress
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return client(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = await authStorage.getRefreshToken();
          if (!refreshToken) throw new Error('No refresh token');

          const response = await axios.post(`${API_BASE_URL}/api/token/refresh/`, {
            refresh: refreshToken,
          });

          const newToken = response.data.access;
          await authStorage.setTokens(newToken, refreshToken);

          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return client(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError as Error, null);
          await authStorage.clearAll();
          throw refreshError;
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
}

export const apiClient = createApiClient();
```

**Patient API**:
```typescript
// lib/api/patients.ts
import { apiClient } from './client';

export interface PatientResponse {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  phone_number: string | null;
  national_id: string | null;
  county: number | null;
  sub_county: number | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
  updated_at: string;
}

export const patientsApi = {
  async list(params?: { search?: string; page?: number }): Promise<{
    results: PatientResponse[];
    count: number;
    next: string | null;
  }> {
    const response = await apiClient.get('/api/patients/', { params });
    return response.data;
  },

  async get(id: number): Promise<PatientResponse> {
    const response = await apiClient.get(`/api/patients/${id}/`);
    return response.data;
  },

  async create(data: Omit<PatientResponse, 'id' | 'mrn' | 'created_at' | 'updated_at'>): Promise<PatientResponse> {
    const response = await apiClient.post('/api/patients/', data);
    return response.data;
  },

  async update(id: number, data: Partial<PatientResponse>): Promise<PatientResponse> {
    const response = await apiClient.patch(`/api/patients/${id}/`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/patients/${id}/`);
  },
};
```

**Test Coverage (12 tests)**:
```typescript
// __tests__/lib/api.test.ts
describe('API Client', () => {
  describe('Request Interceptor', () => {
    it('should add auth header to requests');
    it('should skip auth header for login endpoint');
    it('should skip auth header for refresh endpoint');
  });

  describe('Response Interceptor', () => {
    it('should pass through successful responses');
    it('should attempt token refresh on 401');
    it('should queue requests during refresh');
    it('should retry requests after successful refresh');
    it('should clear auth on refresh failure');
  });

  describe('Patient API', () => {
    it('should list patients');
    it('should get single patient');
    it('should create patient');
    it('should handle network errors');
  });
});
```

---

### 6. Navigation Structure

**Framework**: Expo Router (file-based routing)

**Routes**:
```
/                     → Redirect to /login or /(main)
/(auth)/login         → Login screen
/(main)/              → Dashboard (patient stats)
/(main)/patients/     → Patient list with search
/(main)/patients/[id] → Patient detail view
/(main)/settings      → App settings
```

**Root Layout**:
```typescript
// app/_layout.tsx
import { Slot } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth/context';
import { DatabaseProvider } from '@/lib/db/context';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseProvider>
        <AuthProvider>
          <Slot />
        </AuthProvider>
      </DatabaseProvider>
    </QueryClientProvider>
  );
}
```

**Auth Guard**:
```typescript
// app/(main)/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth/context';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="patients/index" options={{ title: 'Patients' }} />
      <Stack.Screen name="patients/[id]" options={{ title: 'Patient Details' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
```

**Test Coverage (10 tests)**:
```typescript
// __tests__/navigation.test.ts
describe('Navigation', () => {
  describe('Auth Flow', () => {
    it('should redirect unauthenticated user to login');
    it('should redirect authenticated user to main');
    it('should show loading screen while checking auth');
  });

  describe('Routes', () => {
    it('should navigate to patient list');
    it('should navigate to patient detail');
    it('should navigate to settings');
    it('should go back from detail to list');
  });

  describe('Deep Linking', () => {
    it('should handle patient deep link');
    it('should require auth for protected routes');
    it('should preserve navigation state on app restart');
  });
});
```

---

### 7. Core UI Components

**Components**:
- `Button` - Primary, secondary, danger variants
- `Input` - Text, phone, date inputs with validation
- `Card` - Patient card, summary card
- `LoadingSpinner` - Loading states
- `EmptyState` - No data states
- `ErrorBoundary` - Error handling
- `OfflineBanner` - Network status indicator

**Patient List Screen**:
```typescript
// app/(main)/patients/index.tsx
import { useState } from 'react';
import { FlatList, View, TextInput, StyleSheet } from 'react-native';
import { usePatients } from '@/hooks/usePatients';
import { PatientCard } from '@/components/patients/PatientCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

export default function PatientListScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: patients, isLoading, error, refetch } = usePatients(searchQuery);
  const { isOnline } = useOfflineStatus();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={styles.container}>
      {!isOnline && <OfflineBanner />}
      
      <TextInput
        style={styles.searchInput}
        placeholder="Search patients..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {patients?.length === 0 ? (
        <EmptyState
          title="No patients found"
          description={searchQuery ? 'Try a different search' : 'Register your first patient'}
        />
      ) : (
        <FlatList
          data={patients}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PatientCard patient={item} />}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      )}
    </View>
  );
}
```

**Test Coverage (25 tests)**:
```typescript
// __tests__/components/ui.test.tsx
describe('UI Components', () => {
  describe('Button', () => {
    it('should render primary button');
    it('should render secondary button');
    it('should render danger button');
    it('should handle press events');
    it('should show loading state');
    it('should be disabled when loading');
  });

  describe('Input', () => {
    it('should render text input');
    it('should show error state');
    it('should call onChange');
    it('should support phone number format');
  });

  describe('PatientCard', () => {
    it('should display patient name');
    it('should display MRN');
    it('should display age');
    it('should navigate to detail on press');
    it('should show sync status icon');
  });

  describe('PatientList', () => {
    it('should render list of patients');
    it('should show loading spinner');
    it('should show empty state');
    it('should support pull to refresh');
    it('should filter by search query');
  });

  describe('OfflineBanner', () => {
    it('should show when offline');
    it('should hide when online');
    it('should show pending sync count');
  });

  describe('ErrorBoundary', () => {
    it('should catch component errors');
    it('should display error message');
  });
});
```

---

### 8. Sync Queue Foundation

**Module**: `lib/sync/`

**Features**:
- Queue local changes for sync
- Track pending operations
- Support CREATE, UPDATE, DELETE operations
- Persist queue across app restarts

**Sync Queue**:
```typescript
// lib/sync/queue.ts
import { database } from '../db';
import { SyncQueueEntry } from '../db/models/SyncQueue';

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export const syncQueue = {
  async add(
    operation: SyncOperation,
    modelName: string,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await database.write(async () => {
      await database.get<SyncQueueEntry>('sync_queue').create((entry) => {
        entry.operation = operation;
        entry.modelName = modelName;
        entry.recordId = recordId;
        entry.data = JSON.stringify(data);
        entry.status = 'PENDING';
        entry.retryCount = 0;
      });
    });
  },

  async getPending(): Promise<SyncQueueEntry[]> {
    return database
      .get<SyncQueueEntry>('sync_queue')
      .query(Q.where('status', 'PENDING'))
      .fetch();
  },

  async getPendingCount(): Promise<number> {
    return database
      .get<SyncQueueEntry>('sync_queue')
      .query(Q.where('status', 'PENDING'))
      .fetchCount();
  },

  async markSyncing(id: string): Promise<void> {
    await database.write(async () => {
      const entry = await database.get<SyncQueueEntry>('sync_queue').find(id);
      await entry.update((e) => {
        e.status = 'SYNCING';
      });
    });
  },

  async markSynced(id: string): Promise<void> {
    await database.write(async () => {
      const entry = await database.get<SyncQueueEntry>('sync_queue').find(id);
      await entry.update((e) => {
        e.status = 'SYNCED';
      });
    });
  },

  async markFailed(id: string, error: string): Promise<void> {
    await database.write(async () => {
      const entry = await database.get<SyncQueueEntry>('sync_queue').find(id);
      await entry.update((e) => {
        e.status = 'FAILED';
        e.errorMessage = error;
        e.retryCount = (e.retryCount || 0) + 1;
      });
    });
  },

  async clearSynced(): Promise<void> {
    await database.write(async () => {
      const synced = await database
        .get<SyncQueueEntry>('sync_queue')
        .query(Q.where('status', 'SYNCED'))
        .fetch();
      
      await Promise.all(synced.map((entry) => entry.destroyPermanently()));
    });
  },
};
```

**Test Coverage (15 tests)**:
```typescript
// __tests__/lib/sync.test.ts
describe('Sync Queue', () => {
  describe('Queue Operations', () => {
    it('should add CREATE entry to queue');
    it('should add UPDATE entry to queue');
    it('should add DELETE entry to queue');
    it('should store serialized data');
    it('should set initial status to PENDING');
  });

  describe('Status Management', () => {
    it('should get pending entries');
    it('should count pending entries');
    it('should mark entry as syncing');
    it('should mark entry as synced');
    it('should mark entry as failed with error');
    it('should increment retry count on failure');
  });

  describe('Cleanup', () => {
    it('should clear synced entries');
    it('should preserve pending entries on clear');
    it('should preserve failed entries on clear');
  });

  describe('Persistence', () => {
    it('should persist queue across app restarts');
  });
});
```

---

## Architecture Decisions

### 1. Expo Managed Workflow vs Bare

**Decision**: Use Expo managed workflow with Expo SDK 50+

**Rationale**:
- Faster development cycle (no native builds for most changes)
- OTA updates for quick bug fixes in the field
- Built-in modules for secure storage, SQLite, etc.
- Easier onboarding for frontend developers
- Can eject later if native modules required

### 2. WatermelonDB vs Expo SQLite

**Decision**: Use WatermelonDB on top of Expo SQLite

**Rationale**:
- Lazy loading for large datasets (performance)
- Reactive queries with observable collections
- Built-in sync primitives
- Better TypeScript support
- Proven at scale (used by Nozbe, etc.)

### 3. Zustand vs Redux for State Management

**Decision**: Use Zustand + TanStack Query

**Rationale**:
- Zustand: Lightweight global state (auth, settings)
- TanStack Query: Server state caching & sync
- Less boilerplate than Redux
- Better integration with React's concurrent features
- Simpler learning curve for team

### 4. Expo Router vs React Navigation

**Decision**: Use Expo Router (built on React Navigation)

**Rationale**:
- File-based routing (familiar to Next.js developers)
- Type-safe routes
- Deep linking out of the box
- Simplified navigation setup
- Better for offline-first (URL-based state)

### 5. Android-First vs Cross-Platform

**Decision**: Android-first development, iOS later

**Rationale**:
- 80%+ of Kenya smartphones are Android
- Lower device cost for healthcare workers
- Can add iOS support in Phase 2 without major refactoring
- Faster initial delivery

---

## Database Schema

```
┌─────────────────────────────────────────────────────────────┐
│                      SQLite Database                        │
├─────────────────────────────────────────────────────────────┤
│ patients                                                     │
│ ├── id (string, primary key, local UUID)                    │
│ ├── server_id (string, nullable, from Django)               │
│ ├── mrn (string)                                            │
│ ├── first_name (string)                                     │
│ ├── last_name (string)                                      │
│ ├── date_of_birth (timestamp)                               │
│ ├── gender (string: M/F/O)                                  │
│ ├── phone_number (string, nullable)                         │
│ ├── national_id (string, nullable)                          │
│ ├── county_id (number, FK)                                  │
│ ├── sub_county_id (number, FK)                              │
│ ├── emergency_contact_name (string, nullable)               │
│ ├── emergency_contact_phone (string, nullable)              │
│ ├── is_synced (boolean)                                     │
│ ├── created_at (timestamp)                                  │
│ └── updated_at (timestamp)                                  │
├─────────────────────────────────────────────────────────────┤
│ sync_queue                                                   │
│ ├── id (string, primary key)                                │
│ ├── operation (string: CREATE/UPDATE/DELETE)                │
│ ├── model_name (string)                                     │
│ ├── record_id (string)                                      │
│ ├── data (string, JSON)                                     │
│ ├── status (string: PENDING/SYNCING/SYNCED/FAILED)          │
│ ├── retry_count (number)                                    │
│ ├── error_message (string, nullable)                        │
│ └── created_at (timestamp)                                  │
├─────────────────────────────────────────────────────────────┤
│ counties                                                     │
│ ├── id (string, primary key)                                │
│ ├── server_id (number)                                      │
│ ├── code (number, Kenya county code 1-47)                   │
│ └── name (string)                                           │
├─────────────────────────────────────────────────────────────┤
│ sub_counties                                                 │
│ ├── id (string, primary key)                                │
│ ├── server_id (number)                                      │
│ ├── county_id (number, FK)                                  │
│ └── name (string)                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Sprint 1.1-1.2 Track B Acceptance Criteria

| Criterion | Priority | Status |
|-----------|----------|--------|
| React Native app scaffolded with Expo | P0 | 📋 |
| TypeScript configured correctly | P0 | 📋 |
| WatermelonDB schema defined | P0 | 📋 |
| Patient CRUD works offline | P0 | 📋 |
| JWT auth with secure storage | P0 | 📋 |
| Auto token refresh on 401 | P0 | 📋 |
| Patient list with search | P1 | 📋 |
| Patient detail view | P1 | 📋 |
| Navigation between screens | P1 | 📋 |
| Sync queue stores local changes | P1 | 📋 |
| Offline status indicator | P1 | 📋 |
| ~123 tests passing | P0 | 📋 |
| Android APK builds successfully | P0 | 📋 |

---

## Dependencies

### External Dependencies
- Expo SDK 50+
- React Native 0.73+
- Node.js 20+
- Android Studio (for emulator)
- Backend API (Phase 0 complete ✅)

### Internal Dependencies
- Backend patient API (`/api/patients/`)
- Backend auth API (`/api/token/`)
- Backend locations API (`/api/locations/`)
- Sync infrastructure (Sprint 0.5 complete ✅)

### Team Dependencies
- 1 Frontend Engineer (mobile focus)
- 0.5 Backend Engineer (API support)
- 0.5 QA Engineer (mobile testing)
- Design assets (Figma mockups)

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WatermelonDB learning curve | Medium | Medium | Spike task first week, documentation |
| Android device fragmentation | Medium | High | Test on 5+ device profiles, min SDK 24 |
| Expo limitations | Low | Low | Can eject if needed, most features covered |
| Offline sync complexity | High | Medium | Leverage Sprint 0.5 patterns, incremental approach |
| Performance on low-end devices | Medium | Medium | Profile early, lazy loading, pagination |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Test coverage | ≥80% |
| App startup time | <3s on mid-range device |
| Patient list load | <500ms for 100 patients |
| Search response | <200ms |
| Offline data persistence | 100% reliable |
| Android APK size | <30MB |

---

## Test Environment Setup

```bash
# Prerequisites
node --version  # >= 20.x
java --version  # >= 17 (for Android)

# Clone and setup
cd mobile-app
npm install

# Run tests
npm test                    # Jest unit tests
npm run test:coverage       # With coverage report

# Run on device/emulator
npm start                   # Expo dev server
npm run android             # Android emulator
npm run android:release     # Release build

# E2E tests (requires running app)
npm run test:e2e            # Detox E2E tests
```

---

## Next Steps (Sprint 1.3+)

After completing Mobile Foundation:

1. **Sprint 1.3-1.4**: Desktop encounter management
2. **Sprint 1.5-1.6**: Desktop billing
3. **Sprint 1.7-1.8**: Mobile vitals entry, encounters, sync
4. **Sprint 1.9-1.10**: Integration testing (Desktop ↔ Backend ↔ Mobile)
5. **Sprint 1.11-1.12**: Kenya pilots

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 30, 2025 | Engineering | Initial draft |

---

**Document Status**: DRAFT (Pre-Sprint Planning)
**Sprint Status**: 📋 PLANNED
**Document Owner**: Engineering Lead
**Last Updated**: December 30, 2025
