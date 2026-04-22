/**
 * Zod schemas for Patients API response validation
 *
 * These schemas validate API responses at runtime to catch data shape mismatches
 * before they cause runtime errors in components.
 *
 * Matches types defined in lib/types/patient.ts
 */
import { z } from 'zod';

// =============================================================================
// ENUMS (matching TypeScript types)
// =============================================================================

export const IdentificationTypeSchema = z.enum([
  'national_id',
  'cr_number',
  'mandate_number',
  'alien_id',
  'kra_pin',
  'temporary_id',
  'passport',
  'birth_certificate',
]);

// Base title enum (for contract tests)
export const TitleEnumSchema = z.enum(['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Hon', 'Rev', '']);
// Optional wrapper (for use in patient schemas)
export const PatientTitleSchema = TitleEnumSchema.optional();

export const GenderSchema = z.enum(['M', 'F', 'O']);

export const ReferralSourceSchema = z.enum(['self', 'clinic', 'other_facility']);

export const PaymentModeSchema = z.enum([
  'cash',
  'sha',
  'insurance_private',
  'insurance_corporate',
  'mpesa',
  'insurance',
  'corporate',
  'mixed',
]);

export const EncounterStatusSchema = z.enum(['CREATED', 'CHECKED_IN', 'TRIAGED', 'IN_PROGRESS', 'ON_HOLD', 'ORDERS_PLACED', 'RESULTS_PENDING', 'READY_TO_CLOSE', 'CLOSED', 'COMPLETED', 'CANCELLED']);

// =============================================================================
// EMERGENCY CONTACT SCHEMA
// =============================================================================

export const EmergencyContactSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  relationship: z.string(),
  phone_number: z.string(),
  alternative_phone: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// PATIENT SCHEMAS
// =============================================================================

/**
 * Full Patient schema (for detail view)
 */
export const PatientSchema = z.object({
  id: z.number(),
  mrn: z.string(),

  // Client Registry
  cr_number: z.string().optional().nullable(),
  cr_synced_at: z.string().optional().nullable(),

  // SHA Integration
  sha_number: z.string().optional().nullable(),

  // Personal Information
  title: PatientTitleSchema.nullable(),
  first_name: z.string(),
  middle_name: z.string().optional().nullable(),
  last_name: z.string(),
  full_name: z.string().optional(),
  date_of_birth: z.string(),
  place_of_birth: z.string().optional().nullable(),
  age: z.number().optional().nullable(),
  gender: GenderSchema,
  citizenship: z.string().optional().nullable(),
  is_person_with_disability: z.boolean().optional(),

  // Identification
  identification_type: IdentificationTypeSchema.optional().nullable(),
  identification_number: z.string().optional().nullable(),
  national_id: z.string().optional().nullable(), // Legacy

  // Contact Information
  phone_number: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),

  // Location
  county: z.number().nullable(),
  county_name: z.string().optional().nullable(),
  sub_county: z.number().nullable(),
  sub_county_name: z.string().optional().nullable(),
  ward: z.number().optional().nullable(),
  ward_name: z.string().optional().nullable(),
  village: z.string().optional().nullable(),

  // Consent & Sensitivity
  is_sensitive: z.boolean(),
  consent_given: z.boolean(),
  consent_date: z.string().optional().nullable(),
  consent_deferred: z.boolean().optional(),
  referral_source: ReferralSourceSchema,
  referred_from_facility: z.string().optional().nullable(),

  // Emergency contacts (nested array)
  emergency_contacts: z.array(EmergencyContactSchema).optional(),

  // Primary emergency contact convenience fields
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  emergency_contact_relationship: z.string().optional().nullable(),

  // Clinical summary (read-only, computed)
  allergy_summary: z.array(z.string()).optional(),
  chronic_conditions_summary: z.string().optional().nullable(),

  // Metadata
  registered_by: z.number().nullable(),
  registered_by_username: z.string().optional(),
  registered_at_facility: z.number().optional().nullable(),
  registered_at_facility_name: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * Patient list item schema (for list views - fewer fields)
 */
export const PatientListItemSchema = z.object({
  id: z.number(),
  mrn: z.string(),
  cr_number: z.string().optional().nullable(),
  cr_synced_at: z.string().optional().nullable(),
  sha_number: z.string().optional().nullable(),
  title: PatientTitleSchema.nullable(),
  first_name: z.string(),
  middle_name: z.string().optional().nullable(),
  last_name: z.string(),
  full_name: z.string().optional(),
  date_of_birth: z.string(),
  age: z.number().optional().nullable(),
  gender: GenderSchema,
  phone_number: z.string().optional().nullable(),
  county_name: z.string().optional(),
  sub_county_name: z.string().optional(),
  registered_at_facility: z.number().optional().nullable(),
  registered_at_facility_name: z.string().optional().nullable(),
  is_sensitive: z.boolean(),
  created_at: z.string(),
});

/**
 * Patient encounter schema (for patient history)
 */
export const PatientEncounterSchema = z.object({
  id: z.number(),
  encounter_type: z.string(),
  status: EncounterStatusSchema,
  encounter_date: z.string(),
  chief_complaint: z.string(),
  created_at: z.string(),
});

// =============================================================================
// REQUEST SCHEMAS (for form validation)
// =============================================================================

/**
 * Patient create request schema
 */
export const PatientCreateDataSchema = z.object({
  // Client Registry (readonly after creation if from CR)
  cr_number: z.string().optional(),

  // SHA (Social Health Authority)
  sha_number: z.string().optional(),

  // Personal Information
  title: PatientTitleSchema,
  first_name: z.string().min(1, 'First name is required'),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, 'Last name is required'),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  place_of_birth: z.string().optional(),
  gender: GenderSchema,
  citizenship: z.string().optional(),
  is_person_with_disability: z.boolean().optional(),

  // Identification
  identification_type: IdentificationTypeSchema.optional(),
  identification_number: z.string().optional(),
  national_id: z.string().optional(), // Legacy

  // Contact Information
  phone_number: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),

  // Location
  county: z.number({ required_error: 'County is required' }),
  sub_county: z.number({ required_error: 'Sub-county is required' }),
  ward: z.number().optional(),
  village: z.string().optional(),

  // Payment
  payment_mode: PaymentModeSchema.optional(),
  insurance_provider: z.string().optional(),
  insurance_member_number: z.string().optional(),

  // Other
  referral_source: ReferralSourceSchema.optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  emergency_contact_relationship: z.string().optional(),
  consent_given: z.boolean().optional(),
  consent_date: z.string().optional(),
  consent_deferred: z.boolean().optional(),
});

/**
 * Patient update request schema
 */
export const PatientUpdateDataSchema = PatientCreateDataSchema.partial().extend({
  is_sensitive: z.boolean().optional(),
});

// =============================================================================
// PAGINATED RESPONSE SCHEMAS
// =============================================================================

/**
 * Generic paginated response helper (local to patient schemas)
 */
const patientPaginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

/**
 * Paginated patient list response
 */
export const PaginatedPatientSchema = patientPaginatedResponse(PatientListItemSchema);

/**
 * Paginated patient detail response (for search results with full data)
 */
export const PaginatedPatientDetailSchema = patientPaginatedResponse(PatientSchema);

/**
 * Emergency contacts array response
 */
export const EmergencyContactArrayResponseSchema = z.union([
  // Some endpoints return a raw list
  z.array(EmergencyContactSchema),
  // DRF pagination (common when global pagination is enabled)
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(EmergencyContactSchema),
  }),
]);

/**
 * Patient encounters array response
 */
export const PatientEncounterArrayResponseSchema = z.object({
  results: z.array(PatientEncounterSchema),
});

/**
 * Patient QR code response
 */
export const PatientQRCodeSchema = z.object({
  qr_data_uri: z.string(),
  qr_payload: z.string(),
  mrn: z.string(),
  patient_name: z.string(),
});

// =============================================================================
// VITALS HISTORY
// =============================================================================

export const VitalsDataPointSchema = z.object({
  timestamp: z.string(),
  source: z.string().nullable().optional().transform((v) => v ?? undefined),
  temperature: z.number().nullable().optional(),
  heart_rate: z.number().nullable().optional(),
  spo2: z.number().nullable().optional(),
  respiratory_rate: z.number().nullable().optional(),
  systolic_bp: z.number().nullable().optional(),
  diastolic_bp: z.number().nullable().optional(),
  weight: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
});

export const VitalsHistoryResponseSchema = z.array(VitalsDataPointSchema);

// =============================================================================
// TYPE EXPORTS (inferred from schemas)
// =============================================================================

export type PatientSchemaType = z.infer<typeof PatientSchema>;
export type PatientListItemSchemaType = z.infer<typeof PatientListItemSchema>;
export type EmergencyContactSchemaType = z.infer<typeof EmergencyContactSchema>;
export type PatientCreateDataSchemaType = z.infer<typeof PatientCreateDataSchema>;
export type PatientUpdateDataSchemaType = z.infer<typeof PatientUpdateDataSchema>;
export type PatientEncounterSchemaType = z.infer<typeof PatientEncounterSchema>;
export type PatientQRCodeSchemaType = z.infer<typeof PatientQRCodeSchema>;
export type VitalsDataPointSchemaType = z.infer<typeof VitalsDataPointSchema>;
