/**
 * Index Exports Tests
 *
 * Tests for barrel exports from index files to ensure proper module coverage.
 */

// Mock native modules before imports
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

describe('Index Exports', () => {
  describe('components/ui/index.ts', () => {
    test('should export Button', () => {
      const { Button } = require('../../components/ui');
      expect(Button).toBeDefined();
    });

    test('should export Input', () => {
      const { Input } = require('../../components/ui');
      expect(Input).toBeDefined();
    });

    test('should export Card', () => {
      const { Card } = require('../../components/ui');
      expect(Card).toBeDefined();
    });

    test('should export LoadingSpinner', () => {
      const { LoadingSpinner } = require('../../components/ui');
      expect(LoadingSpinner).toBeDefined();
    });

    test('should export EmptyState', () => {
      const { EmptyState } = require('../../components/ui');
      expect(EmptyState).toBeDefined();
    });

    test('should export ErrorBoundary', () => {
      const { ErrorBoundary } = require('../../components/ui');
      expect(ErrorBoundary).toBeDefined();
    });

    test('should export OfflineBanner', () => {
      const { OfflineBanner } = require('../../components/ui');
      expect(OfflineBanner).toBeDefined();
    });
  });

  describe('components/patients/index.ts', () => {
    test('should export PatientCard', () => {
      const { PatientCard } = require('../../components/patients');
      expect(PatientCard).toBeDefined();
    });

    test('should export PatientList', () => {
      const { PatientList } = require('../../components/patients');
      expect(PatientList).toBeDefined();
    });

    test('should export PatientSearch', () => {
      const { PatientSearch } = require('../../components/patients');
      expect(PatientSearch).toBeDefined();
    });

    test('should export PatientForm', () => {
      const { PatientForm } = require('../../components/patients');
      expect(PatientForm).toBeDefined();
    });
  });

  describe('hooks/index.ts', () => {
    test('should export usePatients', () => {
      const { usePatients } = require('../../hooks');
      expect(usePatients).toBeDefined();
    });

    test('should export patientKeys', () => {
      const { patientKeys } = require('../../hooks');
      expect(patientKeys).toBeDefined();
    });

    test('should export usePatient', () => {
      const { usePatient } = require('../../hooks');
      expect(usePatient).toBeDefined();
    });

    test('should export useCreatePatient', () => {
      const { useCreatePatient } = require('../../hooks');
      expect(useCreatePatient).toBeDefined();
    });

    test('should export useUpdatePatient', () => {
      const { useUpdatePatient } = require('../../hooks');
      expect(useUpdatePatient).toBeDefined();
    });

    test('should export useOfflineStatus', () => {
      const { useOfflineStatus } = require('../../hooks');
      expect(useOfflineStatus).toBeDefined();
    });

    test('should export useSyncStatus', () => {
      const { useSyncStatus } = require('../../hooks');
      expect(useSyncStatus).toBeDefined();
    });
  });

  describe('constants/index.ts', () => {
    test('should export colors', () => {
      const { colors } = require('../../constants');
      expect(colors).toBeDefined();
      expect(colors.primary).toBeDefined();
    });

    test('should export theme', () => {
      const { theme } = require('../../constants');
      expect(theme).toBeDefined();
    });

    test('should export API_BASE_URL from config', () => {
      const { API_BASE_URL } = require('../../constants');
      expect(API_BASE_URL).toBeDefined();
    });

    test('should export STORAGE_KEYS from config', () => {
      const { STORAGE_KEYS } = require('../../constants');
      expect(STORAGE_KEYS).toBeDefined();
    });
  });

  describe('lib/api/index.ts', () => {
    test('should export configureApiClient', () => {
      const { configureApiClient } = require('../../lib/api');
      expect(configureApiClient).toBeDefined();
    });

    test('should export getApiClient', () => {
      const { getApiClient } = require('../../lib/api');
      expect(getApiClient).toBeDefined();
    });

    test('should export resetApiClient', () => {
      const { resetApiClient } = require('../../lib/api');
      expect(resetApiClient).toBeDefined();
    });

    test('should export patientsApi', () => {
      const { patientsApi } = require('../../lib/api');
      expect(patientsApi).toBeDefined();
    });

    test('should export locationsApi', () => {
      const { locationsApi } = require('../../lib/api');
      expect(locationsApi).toBeDefined();
    });

    test('should export auth functions', () => {
      const { login, refresh, verify } = require('../../lib/api');
      expect(login).toBeDefined();
      expect(refresh).toBeDefined();
      expect(verify).toBeDefined();
    });
  });

  describe('lib/sync/index.ts', () => {
    test('should export syncQueueManager', () => {
      const { syncQueueManager } = require('../../lib/sync');
      expect(syncQueueManager).toBeDefined();
    });

    test('should export syncProcessor', () => {
      const { syncProcessor } = require('../../lib/sync');
      expect(syncProcessor).toBeDefined();
    });
  });

  describe('lib/db/models/index.ts', () => {
    test('should export Patient model', () => {
      const { Patient } = require('../../lib/db/models');
      expect(Patient).toBeDefined();
    });

    test('should export SyncQueue model', () => {
      const { SyncQueue } = require('../../lib/db/models');
      expect(SyncQueue).toBeDefined();
    });

    test('should export County model', () => {
      const { County } = require('../../lib/db/models');
      expect(County).toBeDefined();
    });

    test('should export SubCounty model', () => {
      const { SubCounty } = require('../../lib/db/models');
      expect(SubCounty).toBeDefined();
    });

    test('should export Ward model', () => {
      const { Ward } = require('../../lib/db/models');
      expect(Ward).toBeDefined();
    });
  });
});
