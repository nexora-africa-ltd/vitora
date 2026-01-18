/**
 * BDD Test Support - Custom World
 *
 * The World is a shared context object available to all step definitions.
 * It holds state between steps within a scenario.
 */

import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { Page, Browser, BrowserContext } from '@playwright/test';

/**
 * User context for authentication
 */
export interface UserContext {
  id: number;
  username: string;
  email: string;
  permissions: string[];
  token?: string;
}

/**
 * Patient context for patient-related scenarios
 */
export interface PatientContext {
  id?: number;
  mrn?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  county?: string;
  subCounty?: string;
}

/**
 * Encounter context for clinical scenarios
 */
export interface EncounterContext {
  id?: number;
  patientId?: number;
  type?: 'OPD' | 'IPD' | 'EMERGENCY';
  status?: string;
  vitals?: Record<string, number | string>;
  diagnoses?: Array<{ code: string; description: string; primary: boolean }>;
}

/**
 * Pharmacy context for pharmacy scenarios
 */
export interface PharmacyContext {
  prescriptionId?: number;
  dispensingId?: number;
  selectedDrug?: { id: number; name: string };
  selectedBatch?: { id: number; batchNumber: string; quantity: number };
}

/**
 * Custom World class for Vitora HMIS BDD tests
 */
export class VitoraWorld extends World {
  // Playwright instances (for E2E)
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;

  // Authentication state
  currentUser?: UserContext;
  authToken?: string;

  // Domain contexts
  patient?: PatientContext;
  encounter?: EncounterContext;
  pharmacy?: PharmacyContext;

  // API responses
  lastResponse?: {
    status: number;
    data: unknown;
    headers: Record<string, string>;
  };

  // UI state
  currentPage?: string;
  alerts: string[] = [];
  errors: string[] = [];

  // Test data storage
  testData: Map<string, unknown> = new Map();

  constructor(options: IWorldOptions) {
    super(options);
  }

  /**
   * Store data for later retrieval in steps
   */
  store(key: string, value: unknown): void {
    this.testData.set(key, value);
  }

  /**
   * Retrieve stored data
   */
  retrieve<T>(key: string): T | undefined {
    return this.testData.get(key) as T | undefined;
  }

  /**
   * Clear all stored data (called between scenarios)
   */
  reset(): void {
    this.currentUser = undefined;
    this.authToken = undefined;
    this.patient = undefined;
    this.encounter = undefined;
    this.pharmacy = undefined;
    this.lastResponse = undefined;
    this.currentPage = undefined;
    this.alerts = [];
    this.errors = [];
    this.testData.clear();
  }

  /**
   * Set authenticated user
   */
  setUser(user: UserContext): void {
    this.currentUser = user;
    this.authToken = user.token;
  }

  /**
   * Check if current user has permission
   */
  hasPermission(permission: string): boolean {
    return this.currentUser?.permissions.includes(permission) ?? false;
  }

  /**
   * Add an alert message
   */
  addAlert(message: string): void {
    this.alerts.push(message);
  }

  /**
   * Add an error message
   */
  addError(message: string): void {
    this.errors.push(message);
  }

  /**
   * Make API request (for integration tests)
   */
  async apiRequest(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: Record<string, unknown>
  ): Promise<unknown> {
    const baseUrl = process.env.API_URL || 'http://localhost:9088/api';
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    this.lastResponse = {
      status: response.status,
      data: await response.json(),
      headers: Object.fromEntries(response.headers.entries()),
    };

    return this.lastResponse.data;
  }
}

// Register the custom World
setWorldConstructor(VitoraWorld);

export default VitoraWorld;
