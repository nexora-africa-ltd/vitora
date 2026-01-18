/**
 * Configuration Tests
 *
 * Tests for constants/config.ts exports.
 */

describe('Configuration Module', () => {
  // Reset modules before each test to get fresh config
  beforeEach(() => {
    jest.resetModules();
  });

  describe('API Configuration', () => {
    test('should export API_BASE_URL', () => {
      const { API_BASE_URL } = require('../../constants/config');
      expect(API_BASE_URL).toBeDefined();
      expect(typeof API_BASE_URL).toBe('string');
    });

    test('should export API_TIMEOUT with default value', () => {
      const { API_TIMEOUT } = require('../../constants/config');
      expect(API_TIMEOUT).toBe(30000);
    });

    test('should have default API_BASE_URL', () => {
      const { API_BASE_URL } = require('../../constants/config');
      expect(API_BASE_URL).toBe('http://localhost:9088');
    });
  });

  describe('Environment Detection', () => {
    test('should export IS_DEVELOPMENT flag', () => {
      const { IS_DEVELOPMENT } = require('../../constants/config');
      expect(typeof IS_DEVELOPMENT).toBe('boolean');
    });

    test('should export IS_PRODUCTION flag', () => {
      const { IS_PRODUCTION } = require('../../constants/config');
      expect(typeof IS_PRODUCTION).toBe('boolean');
    });

    test('should have opposite values for IS_DEVELOPMENT and IS_PRODUCTION', () => {
      const { IS_DEVELOPMENT, IS_PRODUCTION } = require('../../constants/config');
      expect(IS_DEVELOPMENT).toBe(!IS_PRODUCTION);
    });
  });

  describe('Feature Flags', () => {
    test('should export ENABLE_OFFLINE_MODE', () => {
      const { ENABLE_OFFLINE_MODE } = require('../../constants/config');
      expect(typeof ENABLE_OFFLINE_MODE).toBe('boolean');
    });

    test('should export ENABLE_SYNC_LOGGING', () => {
      const { ENABLE_SYNC_LOGGING } = require('../../constants/config');
      expect(typeof ENABLE_SYNC_LOGGING).toBe('boolean');
    });

    test('should default ENABLE_OFFLINE_MODE to true', () => {
      const { ENABLE_OFFLINE_MODE } = require('../../constants/config');
      expect(ENABLE_OFFLINE_MODE).toBe(true);
    });
  });

  describe('App Metadata', () => {
    test('should export APP_NAME', () => {
      const { APP_NAME } = require('../../constants/config');
      expect(APP_NAME).toBeDefined();
      expect(typeof APP_NAME).toBe('string');
    });

    test('should export APP_VERSION', () => {
      const { APP_VERSION } = require('../../constants/config');
      expect(APP_VERSION).toBeDefined();
      expect(typeof APP_VERSION).toBe('string');
    });

    test('should have default APP_NAME', () => {
      const { APP_NAME } = require('../../constants/config');
      expect(APP_NAME).toBe('Vitora HMIS');
    });

    test('should have default APP_VERSION', () => {
      const { APP_VERSION } = require('../../constants/config');
      expect(APP_VERSION).toBe('1.0.0');
    });
  });

  describe('Storage Keys', () => {
    test('should export STORAGE_KEYS object', () => {
      const { STORAGE_KEYS } = require('../../constants/config');
      expect(STORAGE_KEYS).toBeDefined();
      expect(typeof STORAGE_KEYS).toBe('object');
    });

    test('should have ACCESS_TOKEN key', () => {
      const { STORAGE_KEYS } = require('../../constants/config');
      expect(STORAGE_KEYS.ACCESS_TOKEN).toBe('vitora_access_token');
    });

    test('should have REFRESH_TOKEN key', () => {
      const { STORAGE_KEYS } = require('../../constants/config');
      expect(STORAGE_KEYS.REFRESH_TOKEN).toBe('vitora_refresh_token');
    });

    test('should have USER_DATA key', () => {
      const { STORAGE_KEYS } = require('../../constants/config');
      expect(STORAGE_KEYS.USER_DATA).toBe('vitora_user');
    });

    test('should have THEME key', () => {
      const { STORAGE_KEYS } = require('../../constants/config');
      expect(STORAGE_KEYS.THEME).toBe('vitora_theme');
    });

    test('should have LAST_SYNC key', () => {
      const { STORAGE_KEYS } = require('../../constants/config');
      expect(STORAGE_KEYS.LAST_SYNC).toBe('vitora_last_sync');
    });
  });

  describe('API Endpoints', () => {
    test('should export API_ENDPOINTS object', () => {
      const { API_ENDPOINTS } = require('../../constants/config');
      expect(API_ENDPOINTS).toBeDefined();
      expect(typeof API_ENDPOINTS).toBe('object');
    });

    test('should have auth endpoints', () => {
      const { API_ENDPOINTS } = require('../../constants/config');
      expect(API_ENDPOINTS.LOGIN).toBe('/api/token/');
      expect(API_ENDPOINTS.REFRESH).toBe('/api/token/refresh/');
      expect(API_ENDPOINTS.VERIFY).toBe('/api/token/verify/');
    });

    test('should have patient endpoints', () => {
      const { API_ENDPOINTS } = require('../../constants/config');
      expect(API_ENDPOINTS.PATIENTS).toBe('/api/patients/');
      expect(API_ENDPOINTS.PATIENT_DETAIL(1)).toBe('/api/patients/1/');
    });

    test('should have encounter endpoints', () => {
      const { API_ENDPOINTS } = require('../../constants/config');
      expect(API_ENDPOINTS.ENCOUNTERS).toBe('/api/encounters/');
      expect(API_ENDPOINTS.ENCOUNTER_DETAIL(1)).toBe('/api/encounters/1/');
    });

    test('should have location endpoints', () => {
      const { API_ENDPOINTS } = require('../../constants/config');
      expect(API_ENDPOINTS.COUNTIES).toBe('/api/locations/counties/');
      expect(API_ENDPOINTS.SUB_COUNTIES).toBe('/api/locations/sub-counties/');
      expect(API_ENDPOINTS.WARDS).toBe('/api/locations/wards/');
    });

    test('should have emergency contacts endpoint function', () => {
      const { API_ENDPOINTS } = require('../../constants/config');
      expect(API_ENDPOINTS.EMERGENCY_CONTACTS(1)).toBe('/api/patients/1/emergency-contacts/');
    });
  });

  describe('Database Configuration', () => {
    test('should export DATABASE_NAME', () => {
      const { DATABASE_NAME } = require('../../constants/config');
      expect(DATABASE_NAME).toBe('vitora_hmis');
    });

    test('should export DATABASE_VERSION', () => {
      const { DATABASE_VERSION } = require('../../constants/config');
      expect(DATABASE_VERSION).toBe(1);
    });
  });

  describe('Sync Configuration', () => {
    test('should export SYNC_CONFIG object', () => {
      const { SYNC_CONFIG } = require('../../constants/config');
      expect(SYNC_CONFIG).toBeDefined();
      expect(typeof SYNC_CONFIG).toBe('object');
    });

    test('should have MAX_RETRIES', () => {
      const { SYNC_CONFIG } = require('../../constants/config');
      expect(SYNC_CONFIG.MAX_RETRIES).toBe(3);
    });

    test('should have RETRY_DELAY_MS', () => {
      const { SYNC_CONFIG } = require('../../constants/config');
      expect(SYNC_CONFIG.RETRY_DELAY_MS).toBe(1000);
    });

    test('should have BATCH_SIZE', () => {
      const { SYNC_CONFIG } = require('../../constants/config');
      expect(SYNC_CONFIG.BATCH_SIZE).toBe(50);
    });

    test('should have AUTO_SYNC_INTERVAL_MS', () => {
      const { SYNC_CONFIG } = require('../../constants/config');
      expect(SYNC_CONFIG.AUTO_SYNC_INTERVAL_MS).toBe(60000);
    });
  });

  describe('Default Export', () => {
    test('should export all config as default', () => {
      const config = require('../../constants/config').default;

      expect(config.API_BASE_URL).toBeDefined();
      expect(config.API_TIMEOUT).toBeDefined();
      expect(config.IS_DEVELOPMENT).toBeDefined();
      expect(config.IS_PRODUCTION).toBeDefined();
      expect(config.ENABLE_OFFLINE_MODE).toBeDefined();
      expect(config.ENABLE_SYNC_LOGGING).toBeDefined();
      expect(config.APP_NAME).toBeDefined();
      expect(config.APP_VERSION).toBeDefined();
      expect(config.STORAGE_KEYS).toBeDefined();
      expect(config.API_ENDPOINTS).toBeDefined();
      expect(config.DATABASE_NAME).toBeDefined();
      expect(config.DATABASE_VERSION).toBeDefined();
      expect(config.SYNC_CONFIG).toBeDefined();
    });
  });
});
