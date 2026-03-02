/**
 * Nutrition/Dietetics Module Types
 * Sprint Allied Health - Nutrition
 */

import {
  BaseAlliedHealthOrder,
  AlliedHealthOrderStatus,
  AlliedHealthPriority,
  AlliedHealthOrderListParams,
  StaffReference,
  PatientReference,
} from './allied-health';

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Nutrition referral reason
 */
export type NutritionReferralReason =
  | 'WEIGHT_MANAGEMENT'
  | 'DIABETES'
  | 'CARDIOVASCULAR'
  | 'RENAL'
  | 'GI_DISORDERS'
  | 'EATING_DISORDER'
  | 'MALNUTRITION'
  | 'PREGNANCY'
  | 'PEDIATRIC'
  | 'ONCOLOGY'
  | 'FOOD_ALLERGY'
  | 'TUBE_FEEDING'
  | 'TPN'
  | 'SPORTS'
  | 'GENERAL'
  | 'OTHER';

/**
 * BMI classification
 */
export type BMIClassification =
  | 'UNDERWEIGHT_SEVERE'
  | 'UNDERWEIGHT_MODERATE'
  | 'UNDERWEIGHT_MILD'
  | 'NORMAL'
  | 'OVERWEIGHT'
  | 'OBESE_CLASS_I'
  | 'OBESE_CLASS_II'
  | 'OBESE_CLASS_III';

/**
 * Malnutrition screening result (MUAC-based)
 */
export type MalnutritionStatus = 'NORMAL' | 'MAM' | 'SAM';

/**
 * Activity level for TDEE calculation
 */
export type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHTLY_ACTIVE'
  | 'MODERATELY_ACTIVE'
  | 'VERY_ACTIVE'
  | 'EXTREMELY_ACTIVE';

/**
 * Diet plan status
 */
export type DietPlanStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'DISCONTINUED' | 'COMPLETED';

// =============================================================================
// DISPLAY CONFIGURATIONS
// =============================================================================

export const BMI_CLASSIFICATION_CONFIG: Record<
  BMIClassification,
  { label: string; color: string; range: string }
> = {
  UNDERWEIGHT_SEVERE: { label: 'Severely Underweight', color: 'text-red-600', range: '< 16.0' },
  UNDERWEIGHT_MODERATE: { label: 'Moderately Underweight', color: 'text-orange-600', range: '16.0-16.9' },
  UNDERWEIGHT_MILD: { label: 'Mildly Underweight', color: 'text-yellow-600', range: '17.0-18.4' },
  NORMAL: { label: 'Normal', color: 'text-green-600', range: '18.5-24.9' },
  OVERWEIGHT: { label: 'Overweight', color: 'text-yellow-600', range: '25.0-29.9' },
  OBESE_CLASS_I: { label: 'Obese Class I', color: 'text-orange-600', range: '30.0-34.9' },
  OBESE_CLASS_II: { label: 'Obese Class II', color: 'text-red-500', range: '35.0-39.9' },
  OBESE_CLASS_III: { label: 'Obese Class III', color: 'text-red-700', range: '>= 40.0' },
};

export const MALNUTRITION_STATUS_CONFIG: Record<
  MalnutritionStatus,
  { label: string; variant: 'default' | 'destructive' | 'outline'; description: string }
> = {
  NORMAL: { label: 'Normal', variant: 'outline', description: 'MUAC >= 12.5 cm' },
  MAM: { label: 'MAM', variant: 'default', description: 'Moderate Acute Malnutrition (11.5-12.4 cm)' },
  SAM: { label: 'SAM', variant: 'destructive', description: 'Severe Acute Malnutrition (< 11.5 cm)' },
};

export const DIET_PLAN_STATUS_CONFIG: Record<
  DietPlanStatus,
  { label: string; className: string; description: string }
> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-800', description: 'Plan is being created' },
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-800', description: 'Plan is currently being followed' },
  ON_HOLD: { label: 'On Hold', className: 'bg-yellow-100 text-yellow-800', description: 'Plan temporarily paused' },
  DISCONTINUED: { label: 'Discontinued', className: 'bg-red-100 text-red-800', description: 'Plan has been stopped' },
  COMPLETED: { label: 'Completed', className: 'bg-blue-100 text-blue-800', description: 'Plan successfully completed' },
};

export const REFERRAL_REASON_LABELS: Record<NutritionReferralReason, string> = {
  WEIGHT_MANAGEMENT: 'Weight Management',
  DIABETES: 'Diabetes Management',
  CARDIOVASCULAR: 'Cardiovascular Disease',
  RENAL: 'Renal Disease/CKD',
  GI_DISORDERS: 'GI Disorders',
  EATING_DISORDER: 'Eating Disorder',
  MALNUTRITION: 'Malnutrition (SAM/MAM)',
  PREGNANCY: 'Pregnancy/Prenatal',
  PEDIATRIC: 'Pediatric Nutrition',
  ONCOLOGY: 'Oncology Support',
  FOOD_ALLERGY: 'Food Allergy Management',
  TUBE_FEEDING: 'Tube Feeding/Enteral Nutrition',
  TPN: 'Total Parenteral Nutrition',
  SPORTS: 'Sports Nutrition',
  GENERAL: 'General Nutrition Counseling',
  OTHER: 'Other',
};

// =============================================================================
// CONSULTATION
// =============================================================================

/**
 * @deprecated Use flat fields on NutritionConsultation instead
 * Kept for backward compatibility during migration
 */
export interface Anthropometrics {
  weight: number | string | null;
  height: number | string | null;
  waist_circumference: number | string | null;
  hip_circumference: number | string | null;
  mid_upper_arm_circumference: number | string | null;
  bmi: number | string | null;
  bmi_classification: BMIClassification | null;
  waist_hip_ratio: number | string | null;
}

/**
 * @deprecated Use flat fields on NutritionConsultation instead
 * Kept for backward compatibility during migration
 */
export interface NutritionalCalculations {
  basal_metabolic_rate: number | string | null;
  total_daily_energy_expenditure: number | string | null;
  ideal_body_weight: number | string | null;
  activity_level: ActivityLevel;
}

/**
 * Nutrition consultation (assessment)
 */
export interface NutritionConsultation {
  // Identity
  id: number;
  consultation_number: string;
  // Patient & Encounter
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  clinic_visit: number | null;
  // Status
  status: AlliedHealthOrderStatus;
  status_display?: string;
  priority: AlliedHealthPriority;
  priority_display?: string;
  // Referral
  referral_reason: NutritionReferralReason;
  referral_reason_display?: string;
  referral_notes: string;
  diagnosis: string;
  // Anthropometrics (flat fields)
  weight: number | string | null;
  height: number | string | null;
  bmi: number | string | null;
  bmi_classification: BMIClassification | null;
  bmi_classification_display?: string | null;
  waist_circumference: number | string | null;
  hip_circumference: number | string | null;
  waist_hip_ratio: number | string | null;
  mid_upper_arm_circumference: number | string | null;
  triceps_skinfold: number | string | null;
  ideal_body_weight: number | string | null;
  percent_ideal_weight: number | string | null;
  muac_classification?: string | null;
  // Nutritional Assessment
  nutritional_status: string | null;
  nutritional_status_display?: string | null;
  activity_level: ActivityLevel;
  activity_level_display?: string;
  dietary_history: string;
  food_preferences: string;
  food_allergies: string;
  food_intolerances: string;
  current_diet: string;
  meals_per_day: number | null;
  snacks_per_day: number | null;
  fluid_intake: string;
  alcohol_consumption: string;
  supplement_use: string;
  // Caloric Needs
  basal_metabolic_rate: number | string | null;
  total_daily_energy_expenditure: number | string | null;
  recommended_calories: number | null;
  recommended_protein: number | null;
  recommended_carbs: number | null;
  recommended_fat: number | null;
  // Clinical Assessment
  clinical_signs: string;
  lab_results_summary: string;
  medical_history: string;
  medications: string;
  gi_symptoms: string;
  appetite_assessment: string;
  chewing_swallowing: string;
  // Goals & Recommendations
  nutrition_goals: string;
  recommendations: string;
  education_provided: string;
  follow_up_plan: string;
  follow_up_date: string | null;
  // Staff
  dietitian: number | null;
  dietitian_name: string | null;
  referred_by: number | null;
  referred_by_name: string | null;
  age?: number | null;
  diet_plan_count?: number;
  // SHA
  sha_claimable: boolean;
  sha_intervention_code: string;
  invoice: number | null;
  // Timestamps
  consultation_date: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * Nutrition consultation list item
 */
export interface NutritionConsultationListItem {
  id: number;
  consultation_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  status: AlliedHealthOrderStatus;
  status_display?: string;
  priority: AlliedHealthPriority;
  priority_display?: string;
  referral_reason: NutritionReferralReason;
  referral_reason_display?: string;
  bmi: number | string | null;
  bmi_classification: BMIClassification | null;
  bmi_classification_display?: string | null;
  nutritional_status: string | null;
  dietitian: number | null;
  dietitian_name: string | null;
  consultation_date: string;
  follow_up_date: string | null;
}

/**
 * Create nutrition consultation payload
 */
export interface NutritionConsultationCreateData {
  patient: number;
  encounter?: number;
  clinic_visit?: number;
  priority?: AlliedHealthPriority;
  referral_reason: NutritionReferralReason;
  referral_notes?: string;
  diagnosis?: string;
  dietitian?: number;
  // Anthropometrics (optional on create)
  weight?: number;
  height?: number;
  waist_circumference?: number;
  hip_circumference?: number;
  mid_upper_arm_circumference?: number;
  triceps_skinfold?: number;
  // Basic assessment
  activity_level?: ActivityLevel;
  dietary_history?: string;
  food_allergies?: string;
  current_diet?: string;
}

/**
 * Update nutrition consultation payload
 */
export interface NutritionConsultationUpdateData {
  priority?: AlliedHealthPriority;
  referral_reason?: NutritionReferralReason;
  referral_notes?: string;
  diagnosis?: string;
  dietitian?: number;
  // Anthropometrics
  weight?: number;
  height?: number;
  waist_circumference?: number;
  hip_circumference?: number;
  mid_upper_arm_circumference?: number;
  triceps_skinfold?: number;
  // Assessment
  activity_level?: ActivityLevel;
  nutritional_status?: string;
  dietary_history?: string;
  food_preferences?: string;
  food_allergies?: string;
  food_intolerances?: string;
  current_diet?: string;
  meals_per_day?: number;
  snacks_per_day?: number;
  fluid_intake?: string;
  alcohol_consumption?: string;
  supplement_use?: string;
  // Clinical
  clinical_signs?: string;
  lab_results_summary?: string;
  medical_history?: string;
  medications?: string;
  gi_symptoms?: string;
  appetite_assessment?: string;
  chewing_swallowing?: string;
  // Goals
  nutrition_goals?: string;
  recommendations?: string;
  education_provided?: string;
  follow_up_plan?: string;
  follow_up_date?: string;
}

// =============================================================================
// DIET PLAN
// =============================================================================

/**
 * Diet plan type
 */
export type DietPlanType =
  | 'WEIGHT_LOSS'
  | 'WEIGHT_GAIN'
  | 'DIABETIC'
  | 'RENAL'
  | 'CARDIAC'
  | 'LOW_SODIUM'
  | 'LOW_FAT'
  | 'HIGH_PROTEIN'
  | 'THERAPEUTIC'
  | 'GENERAL'
  | 'OTHER';

/**
 * Duration unit
 */
export type DurationUnit = 'DAYS' | 'WEEKS' | 'MONTHS';

/**
 * Diet plan
 */
export interface DietPlan {
  // Identity
  id: number;
  plan_number: string;
  // Links
  patient: number;
  patient_name: string;
  patient_mrn: string;
  consultation: number | null;
  consultation_number: string | null;
  // Plan Details
  name: string;
  plan_type: DietPlanType;
  plan_type_display?: string;
  status: DietPlanStatus;
  status_display?: string;
  description: string;
  goals: string;
  // Duration
  start_date: string;
  end_date: string | null;
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  duration_unit_display?: string | null;
  // Meal Plan
  meal_plan: string;
  breakfast_guidelines: string;
  lunch_guidelines: string;
  dinner_guidelines: string;
  snack_guidelines: string;
  sample_menu: string;
  portion_guidelines: string;
  // Nutritional Targets
  target_calories: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  target_fiber: number | null;
  target_sodium: number | null;
  target_fluid: number | null;
  // Restrictions
  restrictions: string;
  foods_to_avoid: string;
  foods_to_limit: string;
  foods_to_include: string;
  allergen_restrictions: string;
  texture_modifications: string;
  // Supplements
  supplements: string;
  oral_nutrition_supplements: string;
  vitamin_supplements: string;
  mineral_supplements: string;
  // Special Instructions
  special_instructions: string;
  food_preparation_notes: string;
  timing_instructions: string;
  hydration_instructions: string;
  // Monitoring
  monitoring_parameters: string;
  target_outcomes: string;
  review_date: string | null;
  // Staff
  created_by: number | null;
  created_by_name: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  // Status helpers
  is_active: boolean;
  days_remaining: number | null;
  // Timestamps
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  discontinued_at: string | null;
  discontinuation_reason: string | null;
}

/**
 * Diet plan list item
 */
export interface DietPlanListItem {
  id: number;
  plan_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  name: string;
  plan_type: DietPlanType;
  plan_type_display?: string;
  status: DietPlanStatus;
  status_display?: string;
  start_date: string;
  end_date: string | null;
  target_calories: number | null;
  is_active: boolean;
  days_remaining: number | null;
  review_date: string | null;
  created_at: string;
}

/**
 * Create diet plan payload
 */
export interface DietPlanCreateData {
  patient: number;
  consultation?: number;
  name: string;
  plan_type: DietPlanType;
  description?: string;
  goals?: string;
  start_date: string;
  end_date?: string;
  duration_value?: number;
  duration_unit?: DurationUnit;
  // Nutritional Targets
  target_calories?: number;
  target_protein?: number;
  target_carbs?: number;
  target_fat?: number;
  target_fiber?: number;
  target_sodium?: number;
  target_fluid?: number;
  // Meal Plan
  meal_plan?: string;
  breakfast_guidelines?: string;
  lunch_guidelines?: string;
  dinner_guidelines?: string;
  snack_guidelines?: string;
  // Restrictions
  restrictions?: string;
  foods_to_avoid?: string;
  foods_to_limit?: string;
  foods_to_include?: string;
  // Supplements
  supplements?: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

export interface NutritionConsultationListParams extends AlliedHealthOrderListParams {
  referral_reason?: NutritionReferralReason;
  assigned_dietitian_id?: number;
  bmi_classification?: BMIClassification;
  malnutrition_status?: MalnutritionStatus;
}

export interface DietPlanListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: DietPlanStatus;
  consultation_id?: number;
  patient_id?: number;
  ordering?: string;
}
