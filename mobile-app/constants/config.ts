/**
 * Application configuration loaded from environment variables.
 *
 * @module constants/config
 */

import Constants from 'expo-constants';

/**
 * API configuration
 */
export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:8000';

export const API_TIMEOUT = Number(process.env.API_TIMEOUT) || 30000;

/**
 * Environment detection
 */
export const IS_DEVELOPMENT = __DEV__;
export const IS_PRODUCTION = !__DEV__;

/**
 * Feature flags
 */
export const ENABLE_OFFLINE_MODE = process.env.ENABLE_OFFLINE_MODE !== 'false';
export const ENABLE_SYNC_LOGGING = IS_DEVELOPMENT && process.env.ENABLE_SYNC_LOGGING !== 'false';

/**
 * App metadata
 */
export const APP_NAME = Constants.expoConfig?.name || 'Vitora HMIS';
export const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

/**
 * Storage keys
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'vitora_access_token',
  REFRESH_TOKEN: 'vitora_refresh_token',
  USER_DATA: 'vitora_user',
  THEME: 'vitora_theme',
  LAST_SYNC: 'vitora_last_sync',
} as const;

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/api/token/',
  REFRESH: '/api/token/refresh/',
  VERIFY: '/api/token/verify/',

  // Patients
  PATIENTS: '/api/patients/',
  PATIENT_DETAIL: (id: number) => `/api/patients/${id}/`,
  EMERGENCY_CONTACTS: (patientId: number) => `/api/patients/${patientId}/emergency-contacts/`,

  // Encounters
  ENCOUNTERS: '/api/encounters/',
  ENCOUNTER_DETAIL: (id: number) => `/api/encounters/${id}/`,

  // Locations
  COUNTIES: '/api/locations/counties/',
  SUB_COUNTIES: '/api/locations/sub-counties/',
  WARDS: '/api/locations/wards/',

  // Sync
  SYNC_QUEUE: '/api/sync/queue/',
} as const;

/**
 * Database configuration
 */
export const DATABASE_NAME = 'vitora_hmis';
export const DATABASE_VERSION = 1;

/**
 * Sync configuration
 */
export const SYNC_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  BATCH_SIZE: 50,
  AUTO_SYNC_INTERVAL_MS: 60000, // 1 minute
} as const;

export default {
  API_BASE_URL,
  API_TIMEOUT,
  IS_DEVELOPMENT,
  IS_PRODUCTION,
  ENABLE_OFFLINE_MODE,
  ENABLE_SYNC_LOGGING,
  APP_NAME,
  APP_VERSION,
  STORAGE_KEYS,
  API_ENDPOINTS,
  DATABASE_NAME,
  DATABASE_VERSION,
  SYNC_CONFIG,
};
