/**
 * Nutrition Zod Schemas
 * Sprint Allied Health - Nutrition validation
 */

import { z } from 'zod';
import {
  StaffReferenceSchema,
  PatientReferenceSchema,
  AlliedHealthOrderStatusSchema,
  AlliedHealthPrioritySchema,
  createPaginatedSchema,
} from './allied-health.schema';

// =============================================================================
// ENUMS
// =============================================================================

export const NutritionReferralReasonSchema = z.enum([
  'WEIGHT_MANAGEMENT',
  'DIABETES',
  'RENAL',
  'CARDIAC',
  'ONCOLOGY',
  'PEDIATRIC_GROWTH',
  'PREGNANCY',
  'LACTATION',
  'MALNUTRITION',
  'EATING_DISORDER',
  'FOOD_ALLERGY',
  'GI_DISORDER',
  'LIVER_DISEASE',
  'SPORTS_NUTRITION',
  'TUBE_FEEDING',
  'OTHER',
]);

export const BMIClassificationSchema = z.enum([
  'UNDERWEIGHT_SEVERE',
  'UNDERWEIGHT_MODERATE',
  'UNDERWEIGHT_MILD',
  'NORMAL',
  'OVERWEIGHT',
  'OBESE_CLASS_I',
  'OBESE_CLASS_II',
  'OBESE_CLASS_III',
]);

export const MalnutritionStatusSchema = z.enum(['NORMAL', 'MAM', 'SAM']);

export const ActivityLevelSchema = z.enum([
  'SEDENTARY',
  'LIGHTLY_ACTIVE',
  'MODERATELY_ACTIVE',
  'VERY_ACTIVE',
  'EXTREMELY_ACTIVE',
]);

export const DietPlanStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'ON_HOLD',
  'DISCONTINUED',
  'COMPLETED',
]);

// =============================================================================
// ANTHROPOMETRICS
// =============================================================================

export const AnthropometricsSchema = z.object({
  weight_kg: z.number().nullable(),
  height_cm: z.number().nullable(),
  waist_cm: z.number().nullable(),
  hip_cm: z.number().nullable(),
  muac_cm: z.number().nullable(),
  bmi: z.number().nullable(),
  bmi_classification: BMIClassificationSchema.nullable(),
  waist_hip_ratio: z.number().nullable(),
  malnutrition_status: MalnutritionStatusSchema.nullable(),
});

export const NutritionalCalculationsSchema = z.object({
  bmr: z.number().nullable(),
  tdee: z.number().nullable(),
  ideal_body_weight: z.number().nullable(),
  activity_level: ActivityLevelSchema,
});

// =============================================================================
// CONSULTATION
// =============================================================================

export const NutritionConsultationSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient: PatientReferenceSchema,
  patient_id: z.number(),
  encounter_id: z.number().nullable(),
  clinic_visit_id: z.number().nullable(),
  ordered_by: StaffReferenceSchema,
  ordered_by_id: z.number(),
  assigned_dietitian: StaffReferenceSchema.nullable(),
  assigned_dietitian_id: z.number().nullable(),
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  referral_reason: NutritionReferralReasonSchema,
  clinical_notes: z.string(),
  is_sensitive: z.boolean(),
  anthropometrics: AnthropometricsSchema,
  calculations: NutritionalCalculationsSchema,
  dietary_history: z.string(),
  food_allergies: z.string(),
  current_diet: z.string(),
  nutritional_diagnosis: z.string(),
  recommendations: z.string(),
  sha_code: z.string().nullable(),
  sha_claimable: z.boolean(),
  consultation_date: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const NutritionConsultationListItemSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  referral_reason: NutritionReferralReasonSchema,
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  assigned_dietitian_name: z.string().nullable(),
  bmi: z.number().nullable(),
  bmi_classification: BMIClassificationSchema.nullable(),
  malnutrition_status: MalnutritionStatusSchema.nullable(),
  consultation_date: z.string(),
  created_at: z.string(),
});

export const PaginatedNutritionConsultationListSchema = createPaginatedSchema(
  NutritionConsultationListItemSchema
);

// =============================================================================
// DIET PLAN
// =============================================================================

export const DietPlanSchema = z.object({
  id: z.number(),
  plan_number: z.string(),
  consultation: z.object({
    id: z.number(),
    order_number: z.string(),
    patient: PatientReferenceSchema,
  }),
  consultation_id: z.number(),
  created_by: StaffReferenceSchema,
  created_by_id: z.number(),
  status: DietPlanStatusSchema,
  title: z.string(),
  description: z.string(),
  target_calories: z.number().nullable(),
  target_protein_g: z.number().nullable(),
  target_carbs_g: z.number().nullable(),
  target_fat_g: z.number().nullable(),
  target_fiber_g: z.number().nullable(),
  target_sodium_mg: z.number().nullable(),
  breakfast: z.string(),
  mid_morning_snack: z.string(),
  lunch: z.string(),
  afternoon_snack: z.string(),
  dinner: z.string(),
  bedtime_snack: z.string(),
  foods_to_avoid: z.string(),
  foods_to_include: z.string(),
  special_instructions: z.string(),
  supplements: z.string(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  review_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const DietPlanListItemSchema = z.object({
  id: z.number(),
  plan_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  title: z.string(),
  status: DietPlanStatusSchema,
  target_calories: z.number().nullable(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  created_at: z.string(),
});

export const PaginatedDietPlanListSchema = createPaginatedSchema(DietPlanListItemSchema);

// =============================================================================
// CREATE/UPDATE SCHEMAS
// =============================================================================

export const NutritionConsultationCreateSchema = z.object({
  patient_id: z.number(),
  encounter_id: z.number().optional(),
  referral_reason: NutritionReferralReasonSchema,
  priority: AlliedHealthPrioritySchema.optional(),
  clinical_notes: z.string().min(1, 'Clinical notes are required'),
  weight_kg: z.number().positive().optional(),
  height_cm: z.number().positive().optional(),
  waist_cm: z.number().positive().optional(),
  hip_cm: z.number().positive().optional(),
  muac_cm: z.number().positive().optional(),
  activity_level: ActivityLevelSchema.optional(),
});

export const NutritionConsultationUpdateSchema = z.object({
  priority: AlliedHealthPrioritySchema.optional(),
  clinical_notes: z.string().optional(),
  referral_reason: NutritionReferralReasonSchema.optional(),
  weight_kg: z.number().positive().optional(),
  height_cm: z.number().positive().optional(),
  waist_cm: z.number().positive().optional(),
  hip_cm: z.number().positive().optional(),
  muac_cm: z.number().positive().optional(),
  activity_level: ActivityLevelSchema.optional(),
  dietary_history: z.string().optional(),
  food_allergies: z.string().optional(),
  current_diet: z.string().optional(),
  nutritional_diagnosis: z.string().optional(),
  recommendations: z.string().optional(),
});

export const DietPlanCreateSchema = z.object({
  consultation_id: z.number(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  target_calories: z.number().positive().optional(),
  target_protein_g: z.number().positive().optional(),
  target_carbs_g: z.number().positive().optional(),
  target_fat_g: z.number().positive().optional(),
  target_fiber_g: z.number().positive().optional(),
  target_sodium_mg: z.number().positive().optional(),
  breakfast: z.string().optional(),
  mid_morning_snack: z.string().optional(),
  lunch: z.string().optional(),
  afternoon_snack: z.string().optional(),
  dinner: z.string().optional(),
  bedtime_snack: z.string().optional(),
  foods_to_avoid: z.string().optional(),
  foods_to_include: z.string().optional(),
  special_instructions: z.string().optional(),
  supplements: z.string().optional(),
  start_date: z.string(),
  end_date: z.string().optional(),
  review_date: z.string().optional(),
});
