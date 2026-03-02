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
  'CARDIOVASCULAR',
  'RENAL',
  'GI_DISORDERS',
  'EATING_DISORDER',
  'MALNUTRITION',
  'PREGNANCY',
  'PEDIATRIC',
  'ONCOLOGY',
  'FOOD_ALLERGY',
  'TUBE_FEEDING',
  'TPN',
  'SPORTS',
  'GENERAL',
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
// DEPRECATED - Kept for backward compatibility but not used
// The backend returns flat fields, not nested anthropometrics
// =============================================================================

/** @deprecated Use flat fields on NutritionConsultationSchema instead */
export const AnthropometricsSchema = z.object({
  weight: z.union([z.number(), z.string()]).nullable(),
  height: z.union([z.number(), z.string()]).nullable(),
  waist_circumference: z.union([z.number(), z.string()]).nullable(),
  hip_circumference: z.union([z.number(), z.string()]).nullable(),
  mid_upper_arm_circumference: z.union([z.number(), z.string()]).nullable(),
  bmi: z.union([z.number(), z.string()]).nullable(),
  bmi_classification: BMIClassificationSchema.nullable(),
  waist_hip_ratio: z.union([z.number(), z.string()]).nullable(),
});

/** @deprecated Use flat fields on NutritionConsultationSchema instead */
export const NutritionalCalculationsSchema = z.object({
  basal_metabolic_rate: z.union([z.number(), z.string()]).nullable(),
  total_daily_energy_expenditure: z.union([z.number(), z.string()]).nullable(),
  ideal_body_weight: z.union([z.number(), z.string()]).nullable(),
  activity_level: ActivityLevelSchema,
});

// =============================================================================
// CONSULTATION
// =============================================================================

export const NutritionConsultationSchema = z.object({
  // Identity
  id: z.number(),
  consultation_number: z.string(),
  // Patient & Encounter
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  clinic_visit: z.number().nullable(),
  // Status
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  priority: AlliedHealthPrioritySchema,
  priority_display: z.string().optional(),
  // Referral
  referral_reason: NutritionReferralReasonSchema,
  referral_reason_display: z.string().optional(),
  referral_notes: z.string(),
  diagnosis: z.string(),
  // Anthropometrics (flat fields as returned by backend)
  weight: z.union([z.number(), z.string()]).nullable(),
  height: z.union([z.number(), z.string()]).nullable(),
  bmi: z.union([z.number(), z.string()]).nullable(),
  bmi_classification: BMIClassificationSchema.nullable(),
  bmi_classification_display: z.string().nullable().optional(),
  waist_circumference: z.union([z.number(), z.string()]).nullable(),
  hip_circumference: z.union([z.number(), z.string()]).nullable(),
  waist_hip_ratio: z.union([z.number(), z.string()]).nullable(),
  mid_upper_arm_circumference: z.union([z.number(), z.string()]).nullable(),
  triceps_skinfold: z.union([z.number(), z.string()]).nullable(),
  ideal_body_weight: z.union([z.number(), z.string()]).nullable(),
  percent_ideal_weight: z.union([z.number(), z.string()]).nullable(),
  muac_classification: z.string().nullable().optional(),
  // Nutritional Assessment
  nutritional_status: z.string().nullable(),
  nutritional_status_display: z.string().nullable().optional(),
  activity_level: ActivityLevelSchema,
  activity_level_display: z.string().optional(),
  dietary_history: z.string(),
  food_preferences: z.string(),
  food_allergies: z.string(),
  food_intolerances: z.string(),
  current_diet: z.string(),
  meals_per_day: z.number().nullable(),
  snacks_per_day: z.number().nullable(),
  fluid_intake: z.string(),
  alcohol_consumption: z.string(),
  supplement_use: z.string(),
  // Caloric Needs
  basal_metabolic_rate: z.union([z.number(), z.string()]).nullable(),
  total_daily_energy_expenditure: z.union([z.number(), z.string()]).nullable(),
  recommended_calories: z.number().nullable(),
  recommended_protein: z.number().nullable(),
  recommended_carbs: z.number().nullable(),
  recommended_fat: z.number().nullable(),
  // Clinical Assessment
  clinical_signs: z.string(),
  lab_results_summary: z.string(),
  medical_history: z.string(),
  medications: z.string(),
  gi_symptoms: z.string(),
  appetite_assessment: z.string(),
  chewing_swallowing: z.string(),
  // Goals & Recommendations
  nutrition_goals: z.string(),
  recommendations: z.string(),
  education_provided: z.string(),
  follow_up_plan: z.string(),
  follow_up_date: z.string().nullable(),
  // Staff
  dietitian: z.number().nullable(),
  dietitian_name: z.string().nullable(),
  referred_by: z.number().nullable(),
  referred_by_name: z.string().nullable(),
  age: z.number().nullable().optional(),
  diet_plan_count: z.number().optional(),
  // SHA
  sha_claimable: z.boolean(),
  sha_intervention_code: z.string(),
  invoice: z.number().nullable(),
  // Timestamps
  consultation_date: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});

export const NutritionConsultationListItemSchema = z.object({
  id: z.number(),
  consultation_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  priority: AlliedHealthPrioritySchema,
  priority_display: z.string().optional(),
  referral_reason: NutritionReferralReasonSchema,
  referral_reason_display: z.string().optional(),
  bmi: z.union([z.number(), z.string()]).nullable(),
  bmi_classification: BMIClassificationSchema.nullable(),
  bmi_classification_display: z.string().nullable().optional(),
  nutritional_status: z.string().nullable(),
  dietitian: z.number().nullable(),
  dietitian_name: z.string().nullable(),
  consultation_date: z.string(),
  follow_up_date: z.string().nullable(),
});

export const PaginatedNutritionConsultationListSchema = createPaginatedSchema(
  NutritionConsultationListItemSchema
);

// =============================================================================
// DIET PLAN
// =============================================================================

export const DietPlanTypeSchema = z.enum([
  'WEIGHT_LOSS',
  'WEIGHT_GAIN',
  'DIABETIC',
  'RENAL',
  'CARDIAC',
  'LOW_SODIUM',
  'LOW_FAT',
  'HIGH_PROTEIN',
  'THERAPEUTIC',
  'GENERAL',
  'OTHER',
]);

export const DurationUnitSchema = z.enum(['DAYS', 'WEEKS', 'MONTHS']);

export const DietPlanSchema = z.object({
  // Identity
  id: z.number(),
  plan_number: z.string(),
  // Links
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  consultation: z.number().nullable(),
  consultation_number: z.string().nullable(),
  // Plan Details
  name: z.string(),
  plan_type: DietPlanTypeSchema,
  plan_type_display: z.string().optional(),
  status: DietPlanStatusSchema,
  status_display: z.string().optional(),
  description: z.string(),
  goals: z.string(),
  // Duration
  start_date: z.string(),
  end_date: z.string().nullable(),
  duration_value: z.number().nullable(),
  duration_unit: DurationUnitSchema.nullable(),
  duration_unit_display: z.string().nullable().optional(),
  // Meal Plan
  meal_plan: z.string(),
  breakfast_guidelines: z.string(),
  lunch_guidelines: z.string(),
  dinner_guidelines: z.string(),
  snack_guidelines: z.string(),
  sample_menu: z.string(),
  portion_guidelines: z.string(),
  // Nutritional Targets
  target_calories: z.number().nullable(),
  target_protein: z.number().nullable(),
  target_carbs: z.number().nullable(),
  target_fat: z.number().nullable(),
  target_fiber: z.number().nullable(),
  target_sodium: z.number().nullable(),
  target_fluid: z.number().nullable(),
  // Restrictions
  restrictions: z.string(),
  foods_to_avoid: z.string(),
  foods_to_limit: z.string(),
  foods_to_include: z.string(),
  allergen_restrictions: z.string(),
  texture_modifications: z.string(),
  // Supplements
  supplements: z.string(),
  oral_nutrition_supplements: z.string(),
  vitamin_supplements: z.string(),
  mineral_supplements: z.string(),
  // Special Instructions
  special_instructions: z.string(),
  food_preparation_notes: z.string(),
  timing_instructions: z.string(),
  hydration_instructions: z.string(),
  // Monitoring
  monitoring_parameters: z.string(),
  target_outcomes: z.string(),
  review_date: z.string().nullable(),
  // Staff
  created_by: z.number().nullable(),
  created_by_name: z.string().nullable(),
  updated_by: z.number().nullable(),
  updated_by_name: z.string().nullable(),
  // Status helpers
  is_active: z.boolean(),
  days_remaining: z.number().nullable(),
  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
  activated_at: z.string().nullable(),
  discontinued_at: z.string().nullable(),
  discontinuation_reason: z.string().nullable(),
});

export const DietPlanListItemSchema = z.object({
  id: z.number(),
  plan_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  name: z.string(),
  plan_type: DietPlanTypeSchema,
  plan_type_display: z.string().optional(),
  status: DietPlanStatusSchema,
  status_display: z.string().optional(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  target_calories: z.number().nullable(),
  is_active: z.boolean(),
  days_remaining: z.number().nullable(),
  review_date: z.string().nullable(),
  created_at: z.string(),
});

export const PaginatedDietPlanListSchema = createPaginatedSchema(DietPlanListItemSchema);

// =============================================================================
// CREATE/UPDATE SCHEMAS
// =============================================================================

export const NutritionConsultationCreateSchema = z.object({
  patient: z.number(),
  encounter: z.number().optional(),
  clinic_visit: z.number().optional(),
  priority: AlliedHealthPrioritySchema.optional(),
  referral_reason: NutritionReferralReasonSchema,
  referral_notes: z.string().optional(),
  diagnosis: z.string().optional(),
  dietitian: z.number().optional(),
  // Anthropometrics (optional on create)
  weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
  waist_circumference: z.number().positive().optional(),
  hip_circumference: z.number().positive().optional(),
  mid_upper_arm_circumference: z.number().positive().optional(),
  triceps_skinfold: z.number().positive().optional(),
  // Basic assessment
  activity_level: ActivityLevelSchema.optional(),
  dietary_history: z.string().optional(),
  food_allergies: z.string().optional(),
  current_diet: z.string().optional(),
});

export const NutritionConsultationUpdateSchema = z.object({
  priority: AlliedHealthPrioritySchema.optional(),
  referral_reason: NutritionReferralReasonSchema.optional(),
  referral_notes: z.string().optional(),
  diagnosis: z.string().optional(),
  dietitian: z.number().optional(),
  // Anthropometrics
  weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
  waist_circumference: z.number().positive().optional(),
  hip_circumference: z.number().positive().optional(),
  mid_upper_arm_circumference: z.number().positive().optional(),
  triceps_skinfold: z.number().positive().optional(),
  // Assessment
  activity_level: ActivityLevelSchema.optional(),
  nutritional_status: z.string().optional(),
  dietary_history: z.string().optional(),
  food_preferences: z.string().optional(),
  food_allergies: z.string().optional(),
  food_intolerances: z.string().optional(),
  current_diet: z.string().optional(),
  meals_per_day: z.number().optional(),
  snacks_per_day: z.number().optional(),
  fluid_intake: z.string().optional(),
  alcohol_consumption: z.string().optional(),
  supplement_use: z.string().optional(),
  // Clinical
  clinical_signs: z.string().optional(),
  lab_results_summary: z.string().optional(),
  medical_history: z.string().optional(),
  medications: z.string().optional(),
  gi_symptoms: z.string().optional(),
  appetite_assessment: z.string().optional(),
  chewing_swallowing: z.string().optional(),
  // Goals
  nutrition_goals: z.string().optional(),
  recommendations: z.string().optional(),
  education_provided: z.string().optional(),
  follow_up_plan: z.string().optional(),
  follow_up_date: z.string().optional(),
});

export const DietPlanCreateSchema = z.object({
  patient: z.number(),
  consultation: z.number().optional(),
  name: z.string().min(1, 'Name is required'),
  plan_type: DietPlanTypeSchema,
  description: z.string().optional(),
  goals: z.string().optional(),
  start_date: z.string(),
  end_date: z.string().optional(),
  duration_value: z.number().positive().optional(),
  duration_unit: DurationUnitSchema.optional(),
  // Nutritional Targets
  target_calories: z.number().positive().optional(),
  target_protein: z.number().positive().optional(),
  target_carbs: z.number().positive().optional(),
  target_fat: z.number().positive().optional(),
  target_fiber: z.number().positive().optional(),
  target_sodium: z.number().positive().optional(),
  target_fluid: z.number().positive().optional(),
  // Meal Plan
  meal_plan: z.string().optional(),
  breakfast_guidelines: z.string().optional(),
  lunch_guidelines: z.string().optional(),
  dinner_guidelines: z.string().optional(),
  snack_guidelines: z.string().optional(),
  // Restrictions
  restrictions: z.string().optional(),
  foods_to_avoid: z.string().optional(),
  foods_to_limit: z.string().optional(),
  foods_to_include: z.string().optional(),
  // Supplements
  supplements: z.string().optional(),
});
