import { z } from 'zod';

export const GenderSchema = z.enum(['M', 'F', 'O']);
export const ReferralSourceSchema = z.enum(['self', 'clinic', 'other_facility']);
export const EncounterStatusSchema = z.enum([
  'CREATED',
  'CHECKED_IN',
  'TRIAGED',
  'IN_PROGRESS',
  'ON_HOLD',
  'ORDERS_PLACED',
  'RESULTS_PENDING',
  'READY_TO_CLOSE',
  'CLOSED',
  'COMPLETED',
  'CANCELLED',
]);

export const PatientSchema = z.object({
  id: z.number(),
  mrn: z.string(),
  cr_number: z.string().optional().nullable(),
  sha_number: z.string().optional().nullable(),
  first_name: z.string(),
  middle_name: z.string().optional().nullable(),
  last_name: z.string(),
  full_name: z.string().optional().nullable(),
  date_of_birth: z.string(),
  age: z.number().optional().nullable(),
  gender: GenderSchema,
  identification_type: z.string().optional().nullable(),
  identification_number: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  county: z.number(),
  county_name: z.string().optional(),
  sub_county: z.number(),
  sub_county_name: z.string().optional(),
  ward: z.number().optional().nullable(),
  ward_name: z.string().optional().nullable(),
  village: z.string().optional().nullable(),
  is_sensitive: z.boolean(),
  consent_given: z.boolean(),
  consent_date: z.string().optional().nullable(),
  referral_source: ReferralSourceSchema,
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  emergency_contact_relationship: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PatientEncounterSchema = z.object({
  id: z.number(),
  encounter_type: z.string(),
  status: EncounterStatusSchema,
  encounter_date: z.string(),
  chief_complaint: z.string(),
  created_at: z.string(),
});

const paginated = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

export const PaginatedPatientSchema = paginated(PatientSchema);
export const PatientEncounterArraySchema = paginated(PatientEncounterSchema);