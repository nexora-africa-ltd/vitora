/**
 * Schema exports for API validation
 *
 * All API responses should be validated with Zod schemas at runtime.
 * See validation.ts for the parseResponse utility.
 *
 * Implementation status:
 * ✅ clinic.schema.ts - Fully implemented
 * 📋 All others - Placeholder schemas (TODO: implement)
 */

// Validation utilities
export * from './validation';

// Fully implemented schemas
export * from './clinic.schema';

// Placeholder schemas (to be implemented)
export * from './patient.schema';
export * from './encounter.schema';
export * from './pharmacy.schema';
export * from './laboratory.schema';
export * from './billing.schema';
export * from './triage.schema';
export * from './inpatient.schema';
export * from './rbac.schema';
export * from './sha.schema';
export * from './core.schema';
