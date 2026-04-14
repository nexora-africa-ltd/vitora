import { z } from 'zod';

export const TriageLevelSchema = z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE']);

export const TriageMentalStatusSchema = z.enum(['A', 'V', 'P', 'U']);

export const TriageAssignedAreaSchema = z.enum([
  'ER_RESUS',
  'ER_ACUTE',
  'ER_FAST_TRACK',
  'OBSERVATION',
  'OPD',
  'TRAUMA',
  'PEDIATRIC_ER',
  'MATERNITY',
  'SPECIALTY',
]);

export const TriageAlertSchema = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'WARNING']),
  vital_type: z.string(),
  message: z.string(),
  value: z.number(),
  threshold: z.number(),
});

export const TriageVitalsSchema = z.object({
  spo2: z.union([z.string(), z.number()]).optional(),
  heart_rate: z.number().optional(),
  blood_pressure: z.string().optional(),
  temperature: z.union([z.string(), z.number()]).optional(),
  respiratory_rate: z.number().optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
});

export const TriageAssessmentSchema = z.object({
  id: z.number(),
  encounter: z.number(),
  encounter_mrn: z.string().optional().nullable(),
  patient_name: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  patient_age: z.number().optional().nullable(),
  patient_gender: z.string().optional().nullable(),
  chief_complaint: z.string(),
  chief_complaint_category: z.string(),
  pain_score: z.number().optional().nullable(),
  mental_status: TriageMentalStatusSchema,
  gcs_eye: z.number().optional().nullable(),
  gcs_verbal: z.number().optional().nullable(),
  gcs_motor: z.number().optional().nullable(),
  gcs_total: z.number().optional().nullable(),
  gcs_severity: z.string().optional().nullable(),
  mobility: z.string(),
  arrival_mode: z.string(),
  referring_facility_name: z.string().optional(),
  allergies_noted: z.string().optional(),
  spo2: z.number().optional().nullable(),
  heart_rate: z.number().optional().nullable(),
  systolic_bp: z.number().optional().nullable(),
  diastolic_bp: z.number().optional().nullable(),
  temperature: z.number().optional().nullable(),
  respiratory_rate: z.number().optional().nullable(),
  weight: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
  triage_category: TriageLevelSchema,
  auto_calculated_category: TriageLevelSchema.optional().nullable(),
  category_override_reason: z.string().optional(),
  assigned_area: TriageAssignedAreaSchema.or(z.literal('')).optional().nullable(),
  assigned_clinic: z.number().optional().nullable(),
  assigned_clinic_name: z.string().optional().nullable(),
  routing_destination: z.string().optional().nullable(),
  assigned_clinician: z.number().optional().nullable(),
  assigned_clinician_name: z.string().optional().nullable(),
  arrival_time: z.string(),
  triage_start_time: z.string().optional().nullable(),
  triage_end_time: z.string().optional().nullable(),
  seen_by_clinician_time: z.string().optional().nullable(),
  alerts: z.array(TriageAlertSchema),
  vitals: TriageVitalsSchema,
  wait_time_minutes: z.number().optional(),
  is_wait_time_exceeded: z.boolean().optional(),
  triaged_by: z.number().optional().nullable(),
  triaged_by_name: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedTriageAssessmentSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TriageAssessmentSchema),
});
