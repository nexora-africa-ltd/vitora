import { z } from 'zod';

// ── Enums ──

export const WardTypeSchema = z.enum(['MEDICAL', 'SURGICAL', 'PEDIATRIC', 'MATERNITY', 'ICU', 'ISOLATION']);
export const BedStatusSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED']);
export const AdmissionStatusSchema = z.enum(['ACTIVE', 'DISCHARGED', 'TRANSFERRED_OUT', 'DECEASED', 'ABSCONDED']);
export const PayerTypeSchema = z.enum(['CASH', 'SHA', 'CORPORATE']);
export const DischargeTypeSchema = z.enum(['NORMAL', 'AGAINST_ADVICE', 'TRANSFERRED', 'DECEASED', 'ABSCONDED']);
export const RiskLevelSchema = z.enum(['LOW', 'MODERATE', 'HIGH']);
export const CarePlanStatusSchema = z.enum(['ACTIVE', 'RESOLVED', 'ONGOING']);
export const ShiftSchema = z.enum(['DAY', 'NIGHT']);
export const FluidEntryTypeSchema = z.enum([
  'INTRAVENOUS', 'ALIMENTARY', 'OTHER_INTAKE',
  'VOMIT', 'STOOL', 'NASOGASTRIC', 'OTHER_OUTPUT', 'URINE',
]);

// ── Ward ──

export const InpatientWardSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  ward_type: WardTypeSchema,
  ward_type_display: z.string().optional(),
  floor: z.string().optional().nullable(),
  capacity: z.number(),
  description: z.string().optional().nullable(),
  is_active: z.boolean(),
  daily_rate: z.string().optional().nullable(),
  gender_restriction: z.string().optional().nullable(),
  min_age_years: z.number().optional().nullable(),
  max_age_years: z.number().optional().nullable(),
  isolation_capable: z.boolean(),
  oxygen_equipped: z.boolean().optional(),
  ventilator_capable: z.boolean().optional(),
  available_beds: z.number(),
  total_beds: z.number(),
  occupied_beds: z.number(),
  occupancy_rate: z.number(),
});

// ── Bed ──

export const BedSchema = z.object({
  id: z.number(),
  ward: z.number(),
  ward_name: z.string().optional(),
  bed_number: z.string(),
  status: BedStatusSchema,
  status_display: z.string().optional(),
  bed_type: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status_changed_by: z.number().optional().nullable(),
  status_changed_by_username: z.string().optional().nullable(),
  status_changed_at: z.string().optional().nullable(),
});

// ── Admission ──

export const AdmissionSchema = z.object({
  id: z.number(),
  admission_number: z.string(),
  patient: z.number(),
  patient_name: z.string().optional(),
  patient_age: z.number().optional().nullable(),
  patient_gender: z.string().optional().nullable(),
  opd_encounter: z.number().optional().nullable(),
  mch_registration: z.number().optional().nullable(),
  mch_registration_number: z.string().optional().nullable(),
  ipd_encounter: z.number().optional().nullable(),
  recommendation: z.number().optional().nullable(),
  admission_date: z.string(),
  admitting_diagnosis: z.coerce.string().optional().nullable(),
  admitting_diagnosis_text: z.string().optional().nullable(),
  admitting_officer: z.number().optional().nullable(),
  admitting_officer_username: z.string().optional().nullable(),
  attending_doctor: z.number().optional().nullable(),
  attending_doctor_username: z.string().optional().nullable(),
  ward: z.number(),
  ward_name: z.string().optional(),
  bed: z.number().optional().nullable(),
  bed_number: z.string().optional().nullable(),
  admission_status: AdmissionStatusSchema,
  admission_status_display: z.string().optional(),
  payer_type: PayerTypeSchema,
  payer_type_display: z.string().optional(),
  insurance_details: z.any().optional().nullable(),
  constraint_override: z.boolean().optional(),
  constraint_override_reason: z.string().optional().nullable(),
  constraint_violations: z.array(z.string()).optional(),
  length_of_stay: z.number().optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// ── Discharge ──

export const DischargeSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  discharge_type: DischargeTypeSchema,
  discharge_type_display: z.string().optional(),
  discharge_date: z.string(),
  discharged_by: z.number().optional().nullable(),
  discharged_by_username: z.string().optional().nullable(),
  admission_diagnosis: z.string().optional().nullable(),
  final_diagnosis: z.number().optional().nullable(),
  final_diagnosis_text: z.string().optional().nullable(),
  procedures_performed: z.string().optional().nullable(),
  treatment_summary: z.string(),
  discharge_medications: z.string().optional().nullable(),
  follow_up_date: z.string().optional().nullable(),
  follow_up_instructions: z.string().optional().nullable(),
  referral_facility: z.string().optional().nullable(),
  referral_reason: z.string().optional().nullable(),
  patient_instructions: z.string().optional().nullable(),
  pharmacy_cleared: z.boolean(),
  billing_cleared: z.boolean(),
  lab_results_acknowledged: z.boolean(),
  length_of_stay: z.number().optional().nullable(),
  created_at: z.string().optional(),
});

// ── Transfer ──

export const TransferSchema = z.object({
  id: z.number(),
  admission: z.number(),
  source_ward: z.number().optional().nullable(),
  source_ward_name: z.string().optional(),
  source_bed: z.number().optional().nullable(),
  source_bed_number: z.string().optional(),
  destination_ward: z.number(),
  destination_ward_name: z.string().optional(),
  destination_bed: z.number().optional().nullable(),
  destination_bed_number: z.string().optional(),
  reason: z.string(),
  clinical_handover_notes: z.string().optional().nullable(),
  transferred_by: z.number().optional().nullable(),
  transferred_by_username: z.string().optional().nullable(),
  created_at: z.string().optional(),
});

// ── Ward Round ──

export const WardRoundSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  round_date: z.string(),
  round_time: z.string().optional().nullable(),
  conducted_by: z.number().optional().nullable(),
  conducted_by_username: z.string().optional().nullable(),
  review_type: z.string().optional().nullable(),
  subjective: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  assessment: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
  condition_status: z.string().optional().nullable(),
  created_at: z.string().optional(),
});

// ── Nursing Kardex ──

export const KardexShiftNoteSchema = z.object({
  id: z.number(),
  kardex: z.number(),
  shift: ShiftSchema,
  note: z.string(),
  recorded_at: z.string(),
  recorded_by: z.number().optional().nullable(),
  recorded_by_username: z.string().optional().nullable(),
});

export const KardexHandoverNoteSchema = z.object({
  id: z.number(),
  kardex: z.number(),
  note: z.string(),
  outgoing_nurse: z.string().optional().nullable(),
  incoming_nurse: z.string().optional().nullable(),
  recorded_at: z.string(),
});

export const NursingCarePlanEntrySchema = z.object({
  id: z.number(),
  kardex: z.number(),
  recorded_at: z.string(),
  recorded_by: z.number().optional().nullable(),
  recorded_by_username: z.string().optional().nullable(),
  assessment: z.string().optional().nullable(),
  nursing_diagnosis: z.string().optional().nullable(),
  goal_and_outcome_criteria: z.string().optional().nullable(),
  plan_of_action: z.string().optional().nullable(),
  scientific_rationale: z.string().optional().nullable(),
  implementation: z.string().optional().nullable(),
  evaluation: z.string().optional().nullable(),
  status: CarePlanStatusSchema,
  status_display: z.string().optional(),
});

export const NursingKardexSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  ward_name: z.string().optional(),
  bed_number: z.string().optional(),
  mobility_status: z.string().optional().nullable(),
  dietary_requirements: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  iv_access: z.string().optional().nullable(),
  fall_risk: RiskLevelSchema.optional().nullable(),
  fall_risk_display: z.string().optional().nullable(),
  pressure_sore_risk: RiskLevelSchema.optional().nullable(),
  pressure_sore_risk_display: z.string().optional().nullable(),
  isolation_required: z.boolean().optional(),
  isolation_type: z.string().optional().nullable(),
  shift_notes: z.array(KardexShiftNoteSchema),
  handover_notes: z.array(KardexHandoverNoteSchema),
  care_plan_entries: z.array(NursingCarePlanEntrySchema),
});

// ── Temperature / TPR ──

export const TemperatureReadingSchema = z.object({
  id: z.number(),
  admission: z.number(),
  temperature: z.number(),
  pulse: z.number(),
  respiratory_rate: z.number(),
  recorded_at: z.string(),
  recorded_by: z.number().optional().nullable(),
  recorded_by_username: z.string().optional().nullable(),
});

// ── Fluid Balance ──

export const FluidBalanceEntrySchema = z.object({
  id: z.number(),
  sheet: z.number(),
  entry_type: FluidEntryTypeSchema,
  entry_type_display: z.string().optional(),
  amount_ml: z.number(),
  specific_gravity: z.number().optional().nullable(),
  time_recorded: z.string(),
  notes: z.string().optional().nullable(),
  recorded_by: z.number().optional().nullable(),
  recorded_by_username: z.string().optional().nullable(),
});

export const FluidBalanceSheetSchema = z.object({
  id: z.number(),
  admission: z.number(),
  date: z.string(),
  total_intake: z.number(),
  total_output: z.number(),
  balance: z.number(),
  entries: z.array(FluidBalanceEntrySchema),
  created_at: z.string().optional(),
});

// ── Paginated helpers ──

const paginated = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

export const PaginatedWardSchema = paginated(InpatientWardSchema);
export const PaginatedBedSchema = paginated(BedSchema);
export const PaginatedAdmissionSchema = paginated(AdmissionSchema);
export const PaginatedDischargeSchema = paginated(DischargeSchema);
export const PaginatedWardRoundSchema = paginated(WardRoundSchema);
export const PaginatedTemperatureReadingSchema = paginated(TemperatureReadingSchema);
export const PaginatedFluidBalanceSheetSchema = paginated(FluidBalanceSheetSchema);

// ── Medication Administration (MAR) ──

export const MARStatusSchema = z.enum(['SCHEDULED', 'GIVEN', 'SKIPPED', 'REFUSED', 'HELD', 'VOMITED']);

export const MedicationAdministrationSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  prescription_item: z.number(),
  drug_name: z.string().optional(),
  scheduled_time: z.string(),
  actual_time: z.string().optional().nullable(),
  status: MARStatusSchema,
  status_display: z.string().optional(),
  dose_given: z.string().optional(),
  route: z.string().optional(),
  administered_by: z.number().optional().nullable(),
  administered_by_username: z.string().optional().nullable(),
  notes: z.string().optional(),
  is_prn: z.boolean(),
  is_overdue: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PaginatedMedicationAdministrationSchema = paginated(MedicationAdministrationSchema);

// ── Bed Swap ──

export const BedSwapResultSchema = z.object({
  bed_a: z.number(),
  bed_b: z.number(),
  bed_a_number: z.string(),
  bed_b_number: z.string(),
  message: z.string(),
});

// ── MAR Schedule Generation ──

export const MARScheduleGenerateResultSchema = z.object({
  created: z.number(),
  admission: z.number(),
  prescription_item: z.number(),
  message: z.string(),
});
