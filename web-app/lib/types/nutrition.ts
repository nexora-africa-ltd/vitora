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
  | 'RENAL'
  | 'CARDIAC'
  | 'ONCOLOGY'
  | 'PEDIATRIC_GROWTH'
  | 'PREGNANCY'
  | 'LACTATION'
  | 'MALNUTRITION'
  | 'EATING_DISORDER'
  | 'FOOD_ALLERGY'
  | 'GI_DISORDER'
  | 'LIVER_DISEASE'
  | 'SPORTS_NUTRITION'
  | 'TUBE_FEEDING'
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

export const REFERRAL_REASON_LABELS: Record<NutritionReferralReason, string> = {
  WEIGHT_MANAGEMENT: 'Weight Management',
  DIABETES: 'Diabetes Management',
  RENAL: 'Renal Disease',
  CARDIAC: 'Cardiac Disease',
  ONCOLOGY: 'Oncology Support',
  PEDIATRIC_GROWTH: 'Pediatric Growth',
  PREGNANCY: 'Pregnancy Nutrition',
  LACTATION: 'Lactation Support',
  MALNUTRITION: 'Malnutrition',
  EATING_DISORDER: 'Eating Disorder',
  FOOD_ALLERGY: 'Food Allergy/Intolerance',
  GI_DISORDER: 'GI Disorder',
  LIVER_DISEASE: 'Liver Disease',
  SPORTS_NUTRITION: 'Sports Nutrition',
  TUBE_FEEDING: 'Tube Feeding/Enteral',
  OTHER: 'Other',
};

// =============================================================================
// CONSULTATION
// =============================================================================

/**
 * Anthropometric measurements
 */
export interface Anthropometrics {
  weight_kg: number | null;
  height_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  muac_cm: number | null;
  // Computed fields
  bmi: number | null;
  bmi_classification: BMIClassification | null;
  waist_hip_ratio: number | null;
  malnutrition_status: MalnutritionStatus | null;
}

/**
 * Calculated nutritional values
 */
export interface NutritionalCalculations {
  bmr: number | null;
  tdee: number | null;
  ideal_body_weight: number | null;
  activity_level: ActivityLevel;
}

/**
 * Nutrition consultation (assessment)
 */
export interface NutritionConsultation {
  id: number;
  order_number: string;
  patient: PatientReference;
  patient_id: number;
  encounter_id: number | null;
  clinic_visit_id: number | null;
  ordered_by: StaffReference;
  ordered_by_id: number;
  assigned_dietitian: StaffReference | null;
  assigned_dietitian_id: number | null;
  status: AlliedHealthOrderStatus;
  priority: AlliedHealthPriority;
  referral_reason: NutritionReferralReason;
  clinical_notes: string;
  is_sensitive: boolean;
  // Anthropometrics
  anthropometrics: Anthropometrics;
  // Calculations
  calculations: NutritionalCalculations;
  // Assessment details
  dietary_history: string;
  food_allergies: string;
  current_diet: string;
  nutritional_diagnosis: string;
  recommendations: string;
  // SHA
  sha_code: string | null;
  sha_claimable: boolean;
  // Timestamps
  consultation_date: string;
  created_at: string;
  updated_at: string;
}

/**
 * Nutrition consultation list item
 */
export interface NutritionConsultationListItem {
  id: number;
  order_number: string;
  patient_name: string;
  patient_mrn: string;
  referral_reason: NutritionReferralReason;
  status: AlliedHealthOrderStatus;
  priority: AlliedHealthPriority;
  assigned_dietitian_name: string | null;
  bmi: number | null;
  bmi_classification: BMIClassification | null;
  malnutrition_status: MalnutritionStatus | null;
  consultation_date: string;
  created_at: string;
}

/**
 * Create nutrition consultation payload
 */
export interface NutritionConsultationCreateData {
  patient_id: number;
  encounter_id?: number;
  referral_reason: NutritionReferralReason;
  priority?: AlliedHealthPriority;
  clinical_notes: string;
  // Optional initial anthropometrics
  weight_kg?: number;
  height_cm?: number;
  waist_cm?: number;
  hip_cm?: number;
  muac_cm?: number;
  activity_level?: ActivityLevel;
}

/**
 * Update nutrition consultation payload
 */
export interface NutritionConsultationUpdateData {
  priority?: AlliedHealthPriority;
  clinical_notes?: string;
  referral_reason?: NutritionReferralReason;
  // Anthropometrics
  weight_kg?: number;
  height_cm?: number;
  waist_cm?: number;
  hip_cm?: number;
  muac_cm?: number;
  activity_level?: ActivityLevel;
  // Assessment
  dietary_history?: string;
  food_allergies?: string;
  current_diet?: string;
  nutritional_diagnosis?: string;
  recommendations?: string;
}

// =============================================================================
// DIET PLAN
// =============================================================================

/**
 * Diet plan
 */
export interface DietPlan {
  id: number;
  plan_number: string;
  consultation: Pick<NutritionConsultation, 'id' | 'order_number' | 'patient'>;
  consultation_id: number;
  created_by: StaffReference;
  created_by_id: number;
  status: DietPlanStatus;
  title: string;
  description: string;
  // Targets
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  target_fiber_g: number | null;
  target_sodium_mg: number | null;
  // Meal plans
  breakfast: string;
  mid_morning_snack: string;
  lunch: string;
  afternoon_snack: string;
  dinner: string;
  bedtime_snack: string;
  // Additional
  foods_to_avoid: string;
  foods_to_include: string;
  special_instructions: string;
  supplements: string;
  // Duration
  start_date: string;
  end_date: string | null;
  review_date: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Diet plan list item
 */
export interface DietPlanListItem {
  id: number;
  plan_number: string;
  patient_name: string;
  patient_mrn: string;
  title: string;
  status: DietPlanStatus;
  target_calories: number | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

/**
 * Create diet plan payload
 */
export interface DietPlanCreateData {
  consultation_id: number;
  title: string;
  description?: string;
  target_calories?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fat_g?: number;
  target_fiber_g?: number;
  target_sodium_mg?: number;
  breakfast?: string;
  mid_morning_snack?: string;
  lunch?: string;
  afternoon_snack?: string;
  dinner?: string;
  bedtime_snack?: string;
  foods_to_avoid?: string;
  foods_to_include?: string;
  special_instructions?: string;
  supplements?: string;
  start_date: string;
  end_date?: string;
  review_date?: string;
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
