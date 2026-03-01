/**
 * MCH (Maternal & Child Health) Module Type Definitions
 *
 * Types for MCH registrations, ANC visits, deliveries, PNC visits,
 * growth measurements, immunizations, and HEI follow-up.
 * Aligned with backend hmis.apps.mch models and serializers.
 */

// =============================================================================
// MCH REGISTRATION TYPES
// =============================================================================

/**
 * MCH registration status
 */
export type MCHRegistrationStatus =
  | 'ACTIVE'
  | 'DELIVERED'
  | 'POSTNATAL'
  | 'COMPLETED'
  | 'TRANSFERRED_OUT'
  | 'LOST_TO_FOLLOW_UP'
  | 'DECEASED';

/**
 * MCH registration list item (lean serializer)
 */
export interface MCHRegistrationListItem {
  id: number;
  mch_number: string;
  mother: number;
  mother_name: string;
  mother_mrn: string;
  registration_date: string;
  status: MCHRegistrationStatus;
  is_high_risk: boolean;
  linda_jamii_beneficiary: boolean;
  edd: string | null;
  gestation_display: string;
  trimester: number | null;
  anc_visit_count: number;
  created_at: string;
}

/**
 * MCH registration detail (full serializer)
 */
export interface MCHRegistration extends MCHRegistrationListItem {
  anc_enrollment: number | null;
  baby: number | null;
  baby_name: string | null;
  baby_mrn: string | null;
  risk_factors: string;
  sha_claimable: boolean;
  gbv_related: boolean;
  is_sensitive: boolean;
  registered_by: number | null;
  registered_by_name: string | null;
  notes: string;
  completed_at: string | null;
  pnc_visit_count: number;
  updated_at: string;
}

/**
 * MCH registration create data
 */
export interface MCHRegistrationCreateData {
  mother: number;
  anc_enrollment?: number;
  registration_date?: string;
  is_high_risk?: boolean;
  risk_factors?: string;
  sha_claimable?: boolean;
  linda_jamii_beneficiary?: boolean;
  gbv_related?: boolean;
  notes?: string;
}

/**
 * MCH registration list params
 */
export interface MCHRegistrationListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: MCHRegistrationStatus;
  is_high_risk?: boolean;
  linda_jamii_beneficiary?: boolean;
  mother?: number;
  ordering?: string;
}

// =============================================================================
// ANC VISIT TYPES
// =============================================================================

/**
 * Fetal presentation options
 */
export type FetalPresentation = 'CEPHALIC' | 'BREECH' | 'TRANSVERSE' | 'OBLIQUE' | 'UNKNOWN' | '';

/**
 * Fetal lie options
 */
export type FetalLie = 'LONGITUDINAL' | 'TRANSVERSE' | 'OBLIQUE' | '';

/**
 * Urine analysis result
 */
export type UrineResult = 'NEGATIVE' | 'TRACE' | '1+' | '2+' | '3+' | '4+' | '';

/**
 * ANC visit detail
 */
export interface ANCVisit {
  id: number;
  registration: number;
  registration_mch_number: string;
  encounter: number | null;
  visit_number: number;
  visit_date: string;
  gestation_weeks: number | null;
  weight: number | null;
  blood_pressure: string;
  fundal_height: number | null;
  fetal_heart_rate: number | null;
  presentation: FetalPresentation;
  lie: FetalLie;
  fetal_movements: boolean | null;
  urine_protein: UrineResult;
  urine_glucose: UrineResult;
  hb_level: number | null;
  blood_sugar: number | null;
  hiv_test_done: boolean;
  syphilis_test_done: boolean;
  iron_folate_given: boolean;
  calcium_given: boolean;
  deworming_given: boolean;
  tetanus_toxoid_dose: number | null;
  next_visit_date: string | null;
  notes: string;
  conducted_by: number | null;
  conducted_by_name: string | null;
  alerts: string[];
  is_fetal_heart_rate_normal: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * ANC visit list item
 */
export interface ANCVisitListItem {
  id: number;
  registration: number;
  visit_number: number;
  visit_date: string;
  gestation_weeks: number | null;
  weight: number | null;
  blood_pressure: string;
  fetal_heart_rate: number | null;
  alerts: string[];
  created_at: string;
}

/**
 * ANC visit create/update data
 */
export interface ANCVisitCreateData {
  registration: number;
  encounter?: number;
  visit_number?: number;
  visit_date?: string;
  weight?: number;
  blood_pressure?: string;
  fundal_height?: number;
  fetal_heart_rate?: number;
  presentation?: FetalPresentation;
  lie?: FetalLie;
  fetal_movements?: boolean;
  urine_protein?: UrineResult;
  urine_glucose?: UrineResult;
  hb_level?: number;
  blood_sugar?: number;
  hiv_test_done?: boolean;
  syphilis_test_done?: boolean;
  iron_folate_given?: boolean;
  calcium_given?: boolean;
  deworming_given?: boolean;
  tetanus_toxoid_dose?: number;
  next_visit_date?: string;
  notes?: string;
  conducted_by?: number;
}

// =============================================================================
// DELIVERY TYPES
// =============================================================================

/**
 * Delivery type options
 * Backend: Delivery.DELIVERY_TYPE_CHOICES
 */
export type DeliveryType =
  | 'SVD'              // Spontaneous Vaginal Delivery
  | 'ASSISTED_VAGINAL' // Assisted Vaginal Delivery
  | 'ELECTIVE_CS'      // Elective Cesarean Section
  | 'EMERGENCY_CS'     // Emergency Cesarean Section
  | 'VACUUM'           // Vacuum Extraction
  | 'FORCEPS';         // Forceps Delivery

/**
 * Delivery outcome
 * Backend: Delivery.DELIVERY_OUTCOME_CHOICES
 */
export type DeliveryOutcome =
  | 'LIVE_BIRTH'
  | 'STILLBIRTH'
  | 'NEONATAL_DEATH'
  | 'MATERNAL_DEATH';

/**
 * Delivery status
 */
export type DeliveryStatus = 'PENDING' | 'COMPLETED' | 'REFERRED';

/**
 * Place of delivery
 * Backend: Delivery.PLACE_OF_DELIVERY_CHOICES
 */
export type PlaceOfDelivery = 'FACILITY' | 'HOME' | 'EN_ROUTE';

/**
 * Baby gender
 * Backend: Delivery.GENDER_CHOICES ('O' = Other)
 */
export type BabyGender = 'M' | 'F' | 'O' | '';

/**
 * Delivery detail
 */
export interface Delivery {
  id: number;
  registration: number;
  registration_mch_number: string;
  delivery_date: string;
  delivery_time: string | null;
  delivery_type: DeliveryType;
  delivery_outcome: DeliveryOutcome;
  place_of_delivery: PlaceOfDelivery;
  status: DeliveryStatus;
  delivered_by: number | null;
  delivered_by_name: string | null;
  baby_gender: BabyGender;
  birth_weight: number | null;
  apgar_score_1min: number | null;
  apgar_score_5min: number | null;
  apgar_score_10min: number | null;
  resuscitation_done: boolean;
  baby_patient: number | null;
  baby_patient_mrn: string | null;
  maternal_complications: string;
  neonatal_complications: string;
  blood_loss_ml: number | null;
  placenta_complete: boolean;
  is_low_birth_weight: boolean;
  is_macrosomia: boolean;
  alerts: string[];
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Delivery list item
 */
export interface DeliveryListItem {
  id: number;
  registration: number;
  registration_mch_number: string;
  delivery_date: string;
  delivery_type: DeliveryType;
  delivery_outcome: DeliveryOutcome;
  status: DeliveryStatus;
  baby_gender: BabyGender;
  birth_weight: number | null;
  alerts: string[];
  created_at: string;
}

/**
 * Delivery create/update data
 */
export interface DeliveryCreateData {
  registration: number;
  delivery_date?: string;
  delivery_time?: string;
  delivery_type: DeliveryType;
  delivery_outcome: DeliveryOutcome;
  place_of_delivery?: PlaceOfDelivery;
  status?: DeliveryStatus;
  delivered_by?: number;
  baby_gender: BabyGender;
  birth_weight?: number;
  apgar_score_1min?: number;
  apgar_score_5min?: number;
  apgar_score_10min?: number;
  resuscitation_done?: boolean;
  maternal_complications?: string;
  neonatal_complications?: string;
  blood_loss_ml?: number;
  placenta_complete?: boolean;
  notes?: string;
}

// =============================================================================
// PNC VISIT TYPES
// =============================================================================

/**
 * Uterine involution assessment (free-text field in backend)
 */
export type UterineInvolution = string;

/**
 * Lochia status
 * Backend: PNCVisit.LOCHIA_CHOICES
 */
export type LochiaStatus = 'NORMAL' | 'HEAVY' | 'FOUL_SMELLING' | 'ABSENT' | '';

/**
 * Breast condition
 * Backend: PNCVisit.BREAST_CONDITION_CHOICES
 */
export type BreastCondition = 'NORMAL' | 'ENGORGED' | 'MASTITIS' | 'CRACKED_NIPPLES' | 'ABSCESS' | '';

/**
 * Mood assessment (postpartum depression screening)
 * Backend: PNCVisit.MOOD_CHOICES
 */
export type MoodAssessment = 'NORMAL' | 'MILDLY_LOW' | 'DEPRESSED' | 'SEVERELY_DEPRESSED' | '';

/**
 * Cord status
 */
export type CordStatus = 'CLEAN' | 'INFECTED' | 'SEPARATED' | '';

/**
 * Breastfeeding status
 * Backend: PNCVisit.BREASTFEEDING_STATUS_CHOICES
 */
export type BreastfeedingStatus = 'EXCLUSIVE' | 'MIXED' | 'FORMULA' | 'NOT_FEEDING' | '';

/**
 * Contraceptive method given (free-text field in backend)
 */
export type ContraceptiveMethod = string;

/**
 * PNC visit detail
 */
export interface PNCVisit {
  id: number;
  registration: number;
  registration_mch_number: string;
  encounter: number | null;
  visit_number: number;
  visit_date: string;
  days_postpartum: number;
  blood_pressure: string;
  temperature: number | null;
  uterine_involution: string;
  lochia: LochiaStatus;
  breast_condition: BreastCondition;
  mood_assessment: MoodAssessment;
  baby_weight: number | null;
  baby_temperature: number | null;
  cord_status: CordStatus;
  breastfeeding_status: BreastfeedingStatus;
  family_planning_counselling: boolean;
  contraceptive_given: string;
  conducted_by: number | null;
  conducted_by_name: string | null;
  alerts: string[];
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * PNC visit list item
 */
export interface PNCVisitListItem {
  id: number;
  registration: number;
  visit_number: number;
  visit_date: string;
  days_postpartum: number;
  breastfeeding_status: BreastfeedingStatus;
  alerts: string[];
  created_at: string;
}

/**
 * PNC visit create/update data
 */
export interface PNCVisitCreateData {
  registration: number;
  encounter?: number;
  visit_number?: number;
  visit_date?: string;
  blood_pressure?: string;
  temperature?: number;
  uterine_involution?: string;
  lochia?: LochiaStatus;
  breast_condition?: BreastCondition;
  mood_assessment?: MoodAssessment;
  baby_weight?: number;
  baby_temperature?: number;
  cord_status?: CordStatus;
  breastfeeding_status?: BreastfeedingStatus;
  family_planning_counselling?: boolean;
  contraceptive_given?: string;
  conducted_by?: number;
  notes?: string;
}

// =============================================================================
// GROWTH MEASUREMENT TYPES
// =============================================================================

/**
 * MUAC classification
 * Backend: GrowthMeasurement.MUAC_CLASSIFICATION_CHOICES
 */
export type MUACClassification = 'SAM' | 'MAM' | 'NORMAL' | '' | null;

/**
 * Nutritional status
 * Backend: GrowthMeasurement.NUTRITIONAL_STATUS_CHOICES
 */
export type NutritionalStatus =
  | 'NORMAL'
  | 'MILD_UNDERWEIGHT'
  | 'MODERATE_UNDERWEIGHT'
  | 'SEVERE_UNDERWEIGHT'
  | 'OVERWEIGHT'
  | 'OBESE'
  | ''
  | null;

/**
 * Growth chart type
 */
export type GrowthChartType =
  | 'weight_for_age'
  | 'height_for_age'
  | 'weight_for_height'
  | 'head_circumference_for_age'
  | 'bmi_for_age';

/**
 * Growth measurement detail
 */
export interface GrowthMeasurement {
  id: number;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  patient_gender: 'M' | 'F' | 'O';
  patient_dob: string;
  encounter: number | null;
  measured_by: number | null;
  measured_by_name: string | null;
  measurement_date: string;
  age_in_days: number;
  weight: number | null;
  height: number | null;
  head_circumference: number | null;
  muac: number | null;
  weight_for_age_z: number | null;
  height_for_age_z: number | null;
  weight_for_height_z: number | null;
  bmi_for_age_z: number | null;
  head_circumference_for_age_z: number | null;
  muac_classification: MUACClassification;
  nutritional_status: NutritionalStatus;
  has_critical_flag: boolean;
  alerts: string[];
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Growth measurement list item
 */
export interface GrowthMeasurementListItem {
  id: number;
  patient: number;
  patient_name: string;
  measurement_date: string;
  age_in_days: number;
  weight: number | null;
  height: number | null;
  muac: number | null;
  muac_classification: MUACClassification;
  nutritional_status: NutritionalStatus;
  has_critical_flag: boolean;
  created_at: string;
}

/**
 * Growth measurement create data
 */
export interface GrowthMeasurementCreateData {
  patient: number;
  encounter?: number;
  measured_by?: number;
  measurement_date?: string;
  weight?: number;
  height?: number;
  head_circumference?: number;
  muac?: number;
  notes?: string;
}

/**
 * Growth measurement list params
 */
export interface GrowthMeasurementListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  muac_classification?: MUACClassification;
  measurement_from?: string;
  measurement_to?: string;
  ordering?: string;
}

/**
 * Growth chart data (for plotting)
 * Backend: GrowthChartDataSerializer
 */
export interface GrowthChartData {
  measurements: GrowthMeasurementListItem[];
  /** Percentile lines keyed by z-score label, values are arrays of {x, y} or flat numbers */
  percentile_lines: Record<string, unknown>;
  chart_type: GrowthChartType;
  sex: string;
}

// =============================================================================
// VACCINE TYPES
// =============================================================================

/**
 * Vaccine route
 */
export type VaccineRoute = 'IM' | 'SC' | 'ORAL' | 'ID' | '';

/**
 * Vaccine reference data
 */
export interface Vaccine {
  id: number;
  code: string;
  name: string;
  description: string;
  disease_target: string;
  standard_age_days: number;
  route: VaccineRoute;
  dose_number: number;
  series_name: string;
  is_active: boolean;
}

// =============================================================================
// IMMUNIZATION TYPES
// =============================================================================

/**
 * Immunization status
 * Backend: ImmunizationRecord.STATUS_CHOICES
 */
export type ImmunizationStatus = 'SCHEDULED' | 'ADMINISTERED' | 'MISSED' | 'CONTRAINDICATED' | 'DEFERRED';

/**
 * Injection site
 */
export type InjectionSite =
  | 'LEFT_THIGH'
  | 'RIGHT_THIGH'
  | 'LEFT_ARM'
  | 'RIGHT_ARM'
  | 'ORAL'
  | '';

/**
 * Immunization record detail
 */
export interface ImmunizationRecord {
  id: number;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  vaccine: number;
  vaccine_code: string;
  vaccine_name: string;
  scheduled_date: string;
  administered_date: string | null;
  status: ImmunizationStatus;
  dose_number: number;
  batch_number: string;
  lot_number: string;
  expiry_date: string | null;
  site: InjectionSite;
  administered_by: number | null;
  administered_by_name: string | null;
  next_dose_date: string | null;
  is_overdue: boolean;
  days_overdue: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Immunization record list item
 */
export interface ImmunizationRecordListItem {
  id: number;
  patient: number;
  vaccine: number;
  vaccine_code: string;
  vaccine_name: string;
  scheduled_date: string;
  administered_date: string | null;
  status: ImmunizationStatus;
  dose_number: number;
  is_overdue: boolean;
  created_at: string;
}

/**
 * Administer vaccine data
 */
export interface AdministerVaccineData {
  administered_date?: string;
  batch_number?: string;
  lot_number?: string;
  expiry_date?: string;
  site?: InjectionSite;
  notes?: string;
}

/**
 * Immunization record list params
 */
export interface ImmunizationRecordListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  vaccine?: number;
  status?: ImmunizationStatus;
  ordering?: string;
}

// =============================================================================
// VITAMIN A TYPES
// =============================================================================

/**
 * Vitamin A supplement record
 */
export interface VitaminASupplement {
  id: number;
  patient: number;
  patient_name: string;
  administered_date: string;
  dose: string;
  administered_by: number | null;
  administered_by_name: string | null;
  notes: string;
  created_at: string;
}

// =============================================================================
// AEFI TYPES
// =============================================================================

/**
 * AEFI event type
 */
export type AEFIEventType = 'LOCAL_REACTION' | 'SYSTEMIC_REACTION' | 'SEVERE' | 'DEATH';

/**
 * AEFI severity
 */
export type AEFISeverity = 'MILD' | 'MODERATE' | 'SEVERE';

/**
 * AEFI outcome
 * Backend: AEFI.OUTCOME_CHOICES
 */
export type AEFIOutcome = 'RECOVERED' | 'RECOVERING' | 'NOT_RECOVERED' | 'SEQUELAE' | 'DEATH' | 'UNKNOWN';

/**
 * AEFI report detail
 */
export interface AEFI {
  id: number;
  immunization_record: number;
  vaccine_code: string;
  vaccine_name: string;
  patient_name: string;
  event_date: string;
  event_type: AEFIEventType;
  severity: AEFISeverity;
  description: string;
  outcome: AEFIOutcome;
  reported_to_authorities: boolean;
  report_date: string | null;
  investigated_by: number | null;
  investigated_by_name: string | null;
  investigation_notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * AEFI list item
 */
export interface AEFIListItem {
  id: number;
  immunization_record: number;
  vaccine_code: string;
  event_date: string;
  event_type: AEFIEventType;
  severity: AEFISeverity;
  outcome: AEFIOutcome;
  reported_to_authorities: boolean;
  created_at: string;
}

/**
 * AEFI report data
 */
export interface AEFIReportData {
  event_date: string;
  event_type: AEFIEventType;
  severity: AEFISeverity;
  description: string;
  outcome?: AEFIOutcome;
  notes?: string;
}

// =============================================================================
// HEI FOLLOW-UP TYPES
// =============================================================================

/**
 * HEI status
 */
export type HEIStatus =
  | 'ACTIVE'
  | 'CONFIRMED_NEGATIVE'
  | 'CONFIRMED_POSITIVE'
  | 'LOST_TO_FOLLOW_UP'
  | 'TRANSFERRED'
  | 'DECEASED';

/**
 * Mother ART status
 */
export type MotherARTStatus = 'ON_ART' | 'NOT_ON_ART' | 'UNKNOWN';

/**
 * Infant ARV prophylaxis
 * Backend: HEIFollowUp.ARV_PROPHYLAXIS_CHOICES
 */
export type InfantARVProphylaxis = 'NVP' | 'AZT' | 'NVP_AZT' | 'NONE';

/**
 * HEI breastfeeding status
 * Backend: HEIFollowUp.BREASTFEEDING_STATUS_CHOICES
 */
export type HEIBreastfeedingStatus = 'EXCLUSIVE' | 'MIXED' | 'FORMULA' | 'STOPPED';

/**
 * PCR test result
 */
export type PCRResult = 'POSITIVE' | 'NEGATIVE' | 'INDETERMINATE' | 'PENDING';

/**
 * HEI PCR test record
 */
export interface HEIPCRTest {
  id: number;
  hei_followup: number;
  test_number: number;
  scheduled_date: string;
  actual_date: string | null;
  result: PCRResult;
  lab_reference: string;
  notes: string;
  created_at: string;
}

/**
 * HEI follow-up detail
 */
export interface HEIFollowUp {
  id: number;
  hei_number: string;
  infant: number;
  infant_name: string;
  infant_mrn: string;
  mch_registration: number | null;
  mother_name: string | null;
  enrollment_date: string;
  status: HEIStatus;
  mother_art_status: MotherARTStatus;
  infant_arv_prophylaxis: InfantARVProphylaxis;
  arv_start_date: string | null;
  arv_end_date: string | null;
  breastfeeding_status: HEIBreastfeedingStatus;
  cotrimoxazole_prophylaxis: boolean;
  cotrimoxazole_start_date: string | null;
  enrolled_by: number | null;
  enrolled_by_name: string | null;
  pcr_tests: HEIPCRTest[];
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * HEI follow-up list item
 */
export interface HEIFollowUpListItem {
  id: number;
  hei_number: string;
  infant: number;
  infant_name: string;
  infant_mrn: string;
  enrollment_date: string;
  status: HEIStatus;
  mother_art_status: MotherARTStatus;
  infant_arv_prophylaxis: InfantARVProphylaxis;
  breastfeeding_status: HEIBreastfeedingStatus;
  created_at: string;
}

/**
 * HEI follow-up create data
 */
export interface HEIFollowUpCreateData {
  infant: number;
  mch_registration?: number;
  enrollment_date?: string;
  mother_art_status?: MotherARTStatus;
  infant_arv_prophylaxis?: InfantARVProphylaxis;
  arv_start_date?: string;
  arv_end_date?: string;
  breastfeeding_status?: HEIBreastfeedingStatus;
  cotrimoxazole_prophylaxis?: boolean;
  cotrimoxazole_start_date?: string;
  notes?: string;
}

/**
 * HEI follow-up list params
 */
export interface HEIFollowUpListParams {
  page?: number;
  page_size?: number;
  status?: HEIStatus;
  infant?: number;
  ordering?: string;
}

/**
 * Record PCR test data
 */
export interface RecordPCRTestData {
  hei_followup: number;
  test_number: number;
  scheduled_date: string;
  actual_date?: string;
  result: PCRResult;
  lab_reference?: string;
  notes?: string;
}

/**
 * Update feeding status data
 */
export interface UpdateFeedingData {
  breastfeeding_status: HEIBreastfeedingStatus;
}

/**
 * Determine final status response (backend auto-determines from PCR results)
 */
export interface DetermineStatusResponse {
  status: HEIStatus;
  message: string;
  positive_test_number?: number;
  negative_test_count?: number;
  negative_tests?: number;
  pending_tests?: number;
  required_negative_tests?: number;
}

/**
 * Update feeding response
 */
export interface UpdateFeedingResponse {
  hei_number: string;
  breastfeeding_status: HEIBreastfeedingStatus;
  message: string;
}
