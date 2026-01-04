/**
 * Patient Journey Zustand Store
 *
 * Manages patient state throughout their complete healthcare journey:
 * 
 * OUTPATIENT FLOW:
 * Registration → Check-in → Triage → Consultation → [Lab/Imaging/Pharmacy] → Discharge
 * 
 * INPATIENT FLOW:
 * Registration → Check-in → Triage → Consultation → Admission Recommendation → 
 * Awaiting Bed → Admitted → [Lab/Imaging/Pharmacy] → Discharge Planning → Discharged
 *
 * EMERGENCY FLOW:
 * Arrival → Emergency Triage → Resuscitation/Stabilization → 
 * [Admit/Discharge/Transfer]
 *
 * Key timestamps tracked for reporting:
 * - arrival_time: When patient checks in (at registration or waiting queue)
 * - triage_start_time / triage_end_time: Triage duration
 * - consultation_start_time / consultation_end_time: Consultation duration
 * - lab_ordered_at / lab_completed_at: Lab turnaround time
 * - imaging_ordered_at / imaging_completed_at: Imaging turnaround time
 * - pharmacy_ordered_at / pharmacy_dispensed_at: Pharmacy wait time
 * - admission_recommended_at / admitted_at: Admission wait time
 * - discharge_time: Total visit duration
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

/**
 * Complete patient journey stages
 */
export type PatientStage =
  // Initial stages
  | 'REGISTERED'
  | 'CHECKED_IN'
  // Triage stages
  | 'AWAITING_TRIAGE'
  | 'IN_TRIAGE'
  // Consultation stages
  | 'AWAITING_CONSULTATION'
  | 'IN_CONSULTATION'
  // Lab stages
  | 'AWAITING_LAB'
  | 'LAB_IN_PROGRESS'
  | 'LAB_RESULTS_READY'
  // Imaging stages
  | 'AWAITING_IMAGING'
  | 'IMAGING_IN_PROGRESS'
  | 'IMAGING_RESULTS_READY'
  // Pharmacy stages
  | 'AWAITING_PHARMACY'
  | 'PHARMACY_DISPENSING'
  | 'PHARMACY_READY'
  // Billing stages
  | 'AWAITING_BILLING'
  | 'BILLING_IN_PROGRESS'
  | 'BILLING_COMPLETE'
  // Admission stages (inpatient)
  | 'ADMISSION_RECOMMENDED'
  | 'AWAITING_BED'
  | 'ADMITTED'
  | 'INPATIENT_CARE'
  // Discharge stages
  | 'AWAITING_DISCHARGE'
  | 'DISCHARGE_PLANNING'
  | 'DISCHARGED'
  // Special stages
  | 'REFERRED_OUT'
  | 'LEFT_WITHOUT_BEING_SEEN'
  | 'DECEASED';

/**
 * Triage status for encounter (matches backend Encounter.triage_status)
 */
export type TriageStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BYPASSED'
  | 'NOT_APPLICABLE';

/**
 * Consultation status for encounter (matches backend Encounter.consultation_status)
 */
export type ConsultationStatus =
  | 'WAITING'
  | 'CALLED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

/**
 * Triage bypass reasons (matches backend Encounter.TRIAGE_BYPASS_REASON_CHOICES)
 */
export type TriageBypassReason =
  | 'STABLE_FOLLOW_UP'
  | 'CONSULTANT_DECISION'
  | 'CHRONIC_CARE_REVIEW'
  | 'STAFF_SHORTAGE'
  | 'EMERGENCY_STABILIZED'
  | 'ADMIN_OVERRIDE';

/**
 * Order/Request status for ancillary services
 */
export type OrderStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * Lab order tracking
 */
export interface LabOrder {
  id: number;
  test_name: string;
  status: OrderStatus;
  ordered_at: string;
  collected_at: string | null;
  completed_at: string | null;
  result_available: boolean;
  is_urgent: boolean;
}

/**
 * Imaging order tracking
 */
export interface ImagingOrder {
  id: number;
  modality: 'XRAY' | 'CT' | 'MRI' | 'ULTRASOUND' | 'OTHER';
  body_part: string;
  status: OrderStatus;
  ordered_at: string;
  performed_at: string | null;
  reported_at: string | null;
  is_urgent: boolean;
}

/**
 * Pharmacy/Prescription tracking
 */
export interface PharmacyOrder {
  id: number;
  prescription_id: number;
  medication_count: number;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'DISPENSED' | 'CANCELLED';
  ordered_at: string;
  ready_at: string | null;
  dispensed_at: string | null;
}

/**
 * Billing tracking
 */
export interface BillingInfo {
  invoice_id: number | null;
  total_amount: number;
  amount_paid: number;
  payment_status: 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED' | 'INSURANCE_PENDING';
  sha_claim_status: 'NOT_APPLICABLE' | 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | null;
  last_updated: string;
}

/**
 * Admission tracking
 */
export interface AdmissionInfo {
  recommendation_id: number | null;
  recommended_at: string | null;
  recommended_by: string | null;
  reason: string | null;
  bed_assigned: string | null;
  ward: string | null;
  admitted_at: string | null;
  expected_discharge: string | null;
  admission_id: number | null;
}

/**
 * All timestamps tracked throughout patient journey
 */
export interface PatientJourneyTimestamps {
  // Registration & Arrival
  /** When patient registered in the system */
  registered_at: string;
  /** When patient physically arrived/checked in */
  arrival_time: string | null;
  /** When patient was added to waiting queue */
  queued_at: string | null;
  
  // Triage
  /** When triage assessment started */
  triage_start_time: string | null;
  /** When triage assessment completed */
  triage_end_time: string | null;
  /** When triage was bypassed */
  triage_bypassed_at: string | null;
  
  // Consultation
  /** When clinician called the patient */
  called_at: string | null;
  /** When consultation started */
  consultation_start_time: string | null;
  /** When consultation ended */
  consultation_end_time: string | null;
  
  // Lab
  /** When lab was ordered */
  lab_ordered_at: string | null;
  /** When sample was collected */
  lab_collected_at: string | null;
  /** When lab results were ready */
  lab_completed_at: string | null;
  
  // Imaging
  /** When imaging was ordered */
  imaging_ordered_at: string | null;
  /** When imaging was performed */
  imaging_performed_at: string | null;
  /** When imaging report was ready */
  imaging_completed_at: string | null;
  
  // Pharmacy
  /** When prescription was sent to pharmacy */
  pharmacy_ordered_at: string | null;
  /** When medications were ready for pickup */
  pharmacy_ready_at: string | null;
  /** When medications were dispensed */
  pharmacy_dispensed_at: string | null;
  
  // Billing
  /** When billing was initiated */
  billing_started_at: string | null;
  /** When billing was completed */
  billing_completed_at: string | null;
  
  // Admission
  /** When admission was recommended */
  admission_recommended_at: string | null;
  /** When bed was assigned */
  bed_assigned_at: string | null;
  /** When patient was admitted */
  admitted_at: string | null;
  
  // Discharge
  /** When discharge planning started */
  discharge_planning_at: string | null;
  /** When patient was discharged */
  discharge_time: string | null;
}

/**
 * Active patient tracking with complete journey information
 */
export interface ActivePatient {
  // ========== Patient Identity ==========
  /** Patient ID */
  id: number;
  /** Medical Record Number */
  mrn: string;
  /** Patient full name */
  name: string;
  /** Date of birth */
  date_of_birth: string | null;
  /** Gender */
  gender: 'M' | 'F' | 'O' | null;
  /** Phone number for contact */
  phone: string | null;
  
  // ========== Current Encounter ==========
  /** Current encounter ID */
  encounter_id: number | null;
  /** Encounter type */
  encounter_type: string | null;
  /** Current stage in journey */
  stage: PatientStage;
  /** Previous stage (for navigation) */
  previous_stage: PatientStage | null;
  
  // ========== All Timestamps ==========
  timestamps: PatientJourneyTimestamps;
  
  // ========== Triage Information ==========
  /** Triage assessment ID (if triaged) */
  triage_assessment_id: number | null;
  /** Triage category (if triaged) */
  triage_category: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  /** Current triage status (matches Encounter.triage_status) */
  triage_status: TriageStatus;
  /** Reason for bypassing triage (if bypassed) */
  triage_bypass_reason: TriageBypassReason | null;
  /** Assigned area */
  assigned_area: string | null;
  /** Chief complaint */
  chief_complaint: string | null;
  /** Priority hint for queue ordering */
  priority_hint: 'NORMAL' | 'URGENT' | 'CRITICAL' | null;
  
  // ========== Consultation Information ==========
  /** Current consultation status (matches Encounter.consultation_status) */
  consultation_status: ConsultationStatus;
  /** Assigned clinician ID */
  assigned_clinician_id: number | null;
  /** Assigned clinician name */
  assigned_clinician_name: string | null;
  /** Consultation notes summary */
  consultation_summary: string | null;
  /** Primary diagnosis (ICD-10) */
  primary_diagnosis: string | null;
  
  // ========== Ancillary Services ==========
  /** Lab orders */
  lab_orders: LabOrder[];
  /** Has pending lab orders */
  has_pending_lab: boolean;
  
  /** Imaging orders */
  imaging_orders: ImagingOrder[];
  /** Has pending imaging orders */
  has_pending_imaging: boolean;
  
  /** Pharmacy orders */
  pharmacy_orders: PharmacyOrder[];
  /** Has pending pharmacy orders */
  has_pending_pharmacy: boolean;
  
  // ========== Billing ==========
  billing: BillingInfo | null;
  
  // ========== Admission (Inpatient) ==========
  admission: AdmissionInfo | null;
  
  // ========== Metadata ==========
  /** Notes/comments */
  notes: string | null;
  /** Last updated timestamp */
  last_updated: string;
}

interface PatientJourneyState {
  // ==========================================================================
  // State
  // ==========================================================================

  /** Currently active patients (keyed by patient ID) */
  activePatients: Record<number, ActivePatient>;

  /** Currently selected patient ID for UI operations */
  selectedPatientId: number | null;

  /** Loading state */
  isLoading: boolean;

  // ==========================================================================
  // Actions - Patient Lifecycle
  // ==========================================================================

  /**
   * Register a new patient (initial entry into system)
   */
  registerPatient: (patient: {
    id: number;
    mrn: string;
    name: string;
    date_of_birth?: string;
    gender?: 'M' | 'F' | 'O';
    phone?: string;
  }) => void;

  /**
   * Check in a patient (they've physically arrived)
   * This sets the critical arrival_time timestamp
   */
  checkInPatient: (
    patientId: number,
    options?: {
      encounter_id?: number;
      encounter_type?: string;
      chief_complaint?: string;
      priority_hint?: 'NORMAL' | 'URGENT' | 'CRITICAL';
    }
  ) => void;

  /**
   * Add patient to triage waiting queue
   */
  addToWaitingQueue: (patientId: number) => void;

  /**
   * Start triage for a patient
   */
  startTriage: (patientId: number) => void;

  /**
   * Complete triage for a patient
   */
  completeTriage: (
    patientId: number,
    assessment: {
      assessment_id: number;
      triage_category: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';
      assigned_area: string;
    }
  ) => void;

  /**
   * Bypass triage for a patient (OPTIONAL triage encounters)
   */
  bypassTriage: (patientId: number, reason: TriageBypassReason) => void;

  /**
   * Set triage as not applicable (NOT_REQUIRED encounters)
   */
  setTriageNotApplicable: (patientId: number) => void;

  /**
   * Directly update triage status (for syncing with backend)
   */
  updateTriageStatus: (patientId: number, status: TriageStatus) => void;

  /**
   * Directly update consultation status (for syncing with backend)
   */
  updateConsultationStatus: (patientId: number, status: ConsultationStatus) => void;

  /**
   * Sync patient journey state from backend encounter data.
   * Derives and updates the stage based on triage_status and consultation_status.
   */
  syncFromEncounter: (
    patientId: number,
    encounterData: {
      triage_status: TriageStatus;
      consultation_status: ConsultationStatus;
      triage_bypass_reason?: TriageBypassReason | null;
      triage_category?: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
    }
  ) => void;

  /**
   * Get derived stage from patient's current triage_status and consultation_status.
   * Returns null if patient doesn't exist or stage cannot be derived.
   */
  getStageFromStatuses: (patientId: number) => PatientStage | null;

  /**
   * Call patient for consultation
   */
  callPatient: (patientId: number) => void;

  /**
   * Start consultation
   */
  startConsultation: (patientId: number, clinicianId?: number, clinicianName?: string) => void;

  /**
   * End consultation
   */
  endConsultation: (patientId: number, summary?: string, diagnosis?: string) => void;

  // ==========================================================================
  // Actions - Lab
  // ==========================================================================

  /**
   * Add lab order for patient
   */
  addLabOrder: (patientId: number, order: Omit<LabOrder, 'ordered_at' | 'collected_at' | 'completed_at' | 'result_available'>) => void;

  /**
   * Update lab order status
   */
  updateLabOrder: (patientId: number, orderId: number, status: OrderStatus, resultAvailable?: boolean) => void;

  /**
   * Mark lab sample collected
   */
  markLabCollected: (patientId: number, orderId: number) => void;

  /**
   * Mark lab results ready
   */
  markLabCompleted: (patientId: number, orderId: number) => void;

  // ==========================================================================
  // Actions - Imaging
  // ==========================================================================

  /**
   * Add imaging order for patient
   */
  addImagingOrder: (patientId: number, order: Omit<ImagingOrder, 'ordered_at' | 'performed_at' | 'reported_at'>) => void;

  /**
   * Update imaging order status
   */
  updateImagingOrder: (patientId: number, orderId: number, status: OrderStatus) => void;

  /**
   * Mark imaging performed
   */
  markImagingPerformed: (patientId: number, orderId: number) => void;

  /**
   * Mark imaging report ready
   */
  markImagingReported: (patientId: number, orderId: number) => void;

  // ==========================================================================
  // Actions - Pharmacy
  // ==========================================================================

  /**
   * Add pharmacy order for patient
   */
  addPharmacyOrder: (patientId: number, order: Omit<PharmacyOrder, 'ordered_at' | 'ready_at' | 'dispensed_at'>) => void;

  /**
   * Update pharmacy order status
   */
  updatePharmacyOrder: (patientId: number, orderId: number, status: PharmacyOrder['status']) => void;

  /**
   * Mark medications ready
   */
  markPharmacyReady: (patientId: number, orderId: number) => void;

  /**
   * Mark medications dispensed
   */
  markPharmacyDispensed: (patientId: number, orderId: number) => void;

  // ==========================================================================
  // Actions - Billing
  // ==========================================================================

  /**
   * Set billing info for patient
   */
  setBilling: (patientId: number, billing: BillingInfo) => void;

  /**
   * Update billing status
   */
  updateBillingStatus: (patientId: number, status: BillingInfo['payment_status'], amountPaid?: number) => void;

  // ==========================================================================
  // Actions - Admission
  // ==========================================================================

  /**
   * Recommend patient for admission
   */
  recommendAdmission: (patientId: number, recommendation: {
    recommendation_id: number;
    recommended_by: string;
    reason: string;
  }) => void;

  /**
   * Assign bed to patient
   */
  assignBed: (patientId: number, bed: string, ward: string) => void;

  /**
   * Admit patient
   */
  admitPatient: (patientId: number, admission_id: number) => void;

  // ==========================================================================
  // Actions - Discharge
  // ==========================================================================

  /**
   * Start discharge planning
   */
  startDischargePlanning: (patientId: number) => void;

  /**
   * Discharge patient
   */
  dischargePatient: (patientId: number) => void;

  /**
   * Mark patient as left without being seen
   */
  markLeftWithoutBeingSeen: (patientId: number) => void;

  // ==========================================================================
  // Actions - Stage Management
  // ==========================================================================

  /**
   * Move patient to a specific stage
   */
  moveToStage: (patientId: number, stage: PatientStage) => void;

  /**
   * Move patient to awaiting lab
   */
  sendToLab: (patientId: number) => void;

  /**
   * Move patient to awaiting imaging
   */
  sendToImaging: (patientId: number) => void;

  /**
   * Move patient to awaiting pharmacy
   */
  sendToPharmacy: (patientId: number) => void;

  /**
   * Move patient to awaiting billing
   */
  sendToBilling: (patientId: number) => void;

  // ==========================================================================
  // Actions - Data Management
  // ==========================================================================

  /**
   * Set encounter for a patient
   */
  setEncounter: (
    patientId: number,
    encounterId: number,
    encounterType: string
  ) => void;

  /**
   * Update patient data
   */
  updatePatient: (patientId: number, updates: Partial<ActivePatient>) => void;

  /**
   * Select a patient for UI operations
   */
  selectPatient: (patientId: number | null) => void;

  /**
   * Get a specific patient
   */
  getPatient: (patientId: number) => ActivePatient | undefined;

  /**
   * Get selected patient
   */
  getSelectedPatient: () => ActivePatient | undefined;

  /**
   * Get arrival time for a patient (for triage form)
   */
  getArrivalTime: (patientId: number) => string | null;

  /**
   * Remove patient from active tracking (after discharge or day end)
   */
  removePatient: (patientId: number) => void;

  /**
   * Clear all patients (e.g., end of day)
   */
  clearAllPatients: () => void;

  /**
   * Set loading state
   */
  setLoading: (loading: boolean) => void;

  // ==========================================================================
  // Actions - Computed Getters
  // ==========================================================================

  /**
   * Get patients by stage
   */
  getPatientsByStage: (stage: PatientStage) => ActivePatient[];

  /**
   * Get patients by multiple stages
   */
  getPatientsByStages: (stages: PatientStage[]) => ActivePatient[];

  /**
   * Get all patients awaiting triage
   */
  getPatientsAwaitingTriage: () => ActivePatient[];

  /**
   * Get all patients awaiting consultation
   */
  getPatientsAwaitingConsultation: () => ActivePatient[];

  /**
   * Get all patients awaiting lab results
   */
  getPatientsAwaitingLab: () => ActivePatient[];

  /**
   * Get all patients awaiting imaging
   */
  getPatientsAwaitingImaging: () => ActivePatient[];

  /**
   * Get all patients awaiting pharmacy
   */
  getPatientsAwaitingPharmacy: () => ActivePatient[];

  /**
   * Get all patients awaiting admission
   */
  getPatientsAwaitingAdmission: () => ActivePatient[];

  /**
   * Get wait time for a patient (in minutes)
   */
  getWaitTime: (patientId: number) => number;

  /**
   * Get time since stage change (in minutes)
   */
  getTimeSinceStageChange: (patientId: number) => number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derive patient stage from triage_status and consultation_status.
 * 
 * Stage Mapping Rules:
 * - triage_status=PENDING → AWAITING_TRIAGE
 * - triage_status=IN_PROGRESS → IN_TRIAGE
 * - triage_status in (COMPLETED, BYPASSED, NOT_APPLICABLE) + consultation_status=WAITING → AWAITING_CONSULTATION
 * - consultation_status=CALLED → AWAITING_CONSULTATION (sub-state)
 * - consultation_status=IN_PROGRESS → IN_CONSULTATION
 * - consultation_status=COMPLETED → null (stage depends on next action: lab, pharmacy, discharge)
 * 
 * @returns PatientStage or null if stage cannot be determined from these statuses alone
 */
export function deriveStageFromStatuses(
  triageStatus: TriageStatus,
  consultationStatus: ConsultationStatus
): PatientStage | null {
  // Consultation status takes precedence for active consultation
  if (consultationStatus === 'IN_PROGRESS') {
    return 'IN_CONSULTATION';
  }
  
  // Post-consultation: stage depends on next steps (lab, pharmacy, discharge)
  if (consultationStatus === 'COMPLETED') {
    return null;
  }
  
  // CALLED is a sub-state of AWAITING_CONSULTATION
  if (consultationStatus === 'CALLED') {
    return 'AWAITING_CONSULTATION';
  }
  
  // Triage status mapping (when consultation_status is WAITING)
  switch (triageStatus) {
    case 'PENDING':
      return 'AWAITING_TRIAGE';
    case 'IN_PROGRESS':
      return 'IN_TRIAGE';
    case 'COMPLETED':
    case 'BYPASSED':
    case 'NOT_APPLICABLE':
      return 'AWAITING_CONSULTATION';
    default:
      return null;
  }
}

function createEmptyTimestamps(): PatientJourneyTimestamps {
  return {
    // Registration & Arrival
    registered_at: new Date().toISOString(),
    arrival_time: null,
    queued_at: null,
    // Triage
    triage_start_time: null,
    triage_end_time: null,
    triage_bypassed_at: null,
    // Consultation
    called_at: null,
    consultation_start_time: null,
    consultation_end_time: null,
    // Lab
    lab_ordered_at: null,
    lab_collected_at: null,
    lab_completed_at: null,
    // Imaging
    imaging_ordered_at: null,
    imaging_performed_at: null,
    imaging_completed_at: null,
    // Pharmacy
    pharmacy_ordered_at: null,
    pharmacy_ready_at: null,
    pharmacy_dispensed_at: null,
    // Billing
    billing_started_at: null,
    billing_completed_at: null,
    // Admission
    admission_recommended_at: null,
    bed_assigned_at: null,
    admitted_at: null,
    // Discharge
    discharge_planning_at: null,
    discharge_time: null,
  };
}

function createEmptyPatient(id: number): ActivePatient {
  return {
    id,
    mrn: '',
    name: '',
    date_of_birth: null,
    gender: null,
    phone: null,
    encounter_id: null,
    encounter_type: null,
    stage: 'REGISTERED',
    previous_stage: null,
    timestamps: createEmptyTimestamps(),
    triage_assessment_id: null,
    triage_category: null,
    triage_status: 'PENDING',
    triage_bypass_reason: null,
    consultation_status: 'WAITING',
    assigned_area: null,
    chief_complaint: null,
    priority_hint: null,
    assigned_clinician_id: null,
    assigned_clinician_name: null,
    consultation_summary: null,
    primary_diagnosis: null,
    lab_orders: [],
    has_pending_lab: false,
    imaging_orders: [],
    has_pending_imaging: false,
    pharmacy_orders: [],
    has_pending_pharmacy: false,
    billing: null,
    admission: null,
    notes: null,
    last_updated: new Date().toISOString(),
  };
}

function calculateWaitTime(arrivalTime: string | null): number {
  if (!arrivalTime) return 0;
  const arrival = new Date(arrivalTime);
  const now = new Date();
  return Math.floor((now.getTime() - arrival.getTime()) / (1000 * 60));
}

function updatePatientWithStage(
  patient: ActivePatient,
  newStage: PatientStage,
  timestampUpdates: Partial<PatientJourneyTimestamps> = {}
): ActivePatient {
  return {
    ...patient,
    previous_stage: patient.stage,
    stage: newStage,
    timestamps: {
      ...patient.timestamps,
      ...timestampUpdates,
    },
    last_updated: new Date().toISOString(),
  };
}

// ============================================================================
// Store
// ============================================================================

export const usePatientJourneyStore = create<PatientJourneyState>()(
  persist(
    (set, get) => ({
      // ========================================================================
      // Initial State
      // ========================================================================
      activePatients: {},
      selectedPatientId: null,
      isLoading: false,

      // ========================================================================
      // Patient Lifecycle Actions
      // ========================================================================

      registerPatient: (patient) => {
        const now = new Date().toISOString();
        set((state) => ({
          activePatients: {
            ...state.activePatients,
            [patient.id]: {
              ...createEmptyPatient(patient.id),
              mrn: patient.mrn,
              name: patient.name,
              date_of_birth: patient.date_of_birth ?? null,
              gender: patient.gender ?? null,
              phone: patient.phone ?? null,
              stage: 'REGISTERED',
              timestamps: {
                ...createEmptyTimestamps(),
                registered_at: now,
              },
              last_updated: now,
            },
          },
        }));
      },

      checkInPatient: (patientId, options = {}) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) {
            // Patient not in store, create new entry
            return {
              activePatients: {
                ...state.activePatients,
                [patientId]: {
                  ...createEmptyPatient(patientId),
                  encounter_id: options.encounter_id ?? null,
                  encounter_type: options.encounter_type ?? null,
                  stage: 'CHECKED_IN',
                  previous_stage: null,
                  timestamps: {
                    ...createEmptyTimestamps(),
                    arrival_time: now,
                  },
                  chief_complaint: options.chief_complaint ?? null,
                  priority_hint: options.priority_hint ?? 'NORMAL',
                  last_updated: now,
                },
              },
            };
          }
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                encounter_id: options.encounter_id ?? patient.encounter_id,
                encounter_type: options.encounter_type ?? patient.encounter_type,
                previous_stage: patient.stage,
                stage: 'CHECKED_IN',
                chief_complaint: options.chief_complaint ?? patient.chief_complaint,
                priority_hint: options.priority_hint ?? patient.priority_hint,
                timestamps: {
                  ...patient.timestamps,
                  arrival_time: patient.timestamps.arrival_time ?? now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      addToWaitingQueue: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, 'AWAITING_TRIAGE', {
                arrival_time: patient.timestamps.arrival_time ?? now,
                queued_at: now,
              }),
            },
          };
        });
      },

      startTriage: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'IN_TRIAGE', {
                  triage_start_time: now,
                }),
                triage_status: 'IN_PROGRESS',
              },
            },
          };
        });
      },

      completeTriage: (patientId, assessment) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'AWAITING_CONSULTATION', {
                  triage_end_time: now,
                }),
                triage_assessment_id: assessment.assessment_id,
                triage_category: assessment.triage_category,
                triage_status: 'COMPLETED',
                assigned_area: assessment.assigned_area,
              },
            },
          };
        });
      },

      bypassTriage: (patientId, reason) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'AWAITING_CONSULTATION', {
                  triage_bypassed_at: now,
                }),
                triage_status: 'BYPASSED',
                triage_bypass_reason: reason,
              },
            },
          };
        });
      },

      setTriageNotApplicable: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'AWAITING_CONSULTATION', {}),
                triage_status: 'NOT_APPLICABLE',
                last_updated: now,
              },
            },
          };
        });
      },

      updateTriageStatus: (patientId, status) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                triage_status: status,
                last_updated: now,
              },
            },
          };
        });
      },

      updateConsultationStatus: (patientId, status) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                consultation_status: status,
                last_updated: now,
              },
            },
          };
        });
      },

      syncFromEncounter: (patientId, encounterData) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;

          // Derive stage from the statuses
          const derivedStage = deriveStageFromStatuses(
            encounterData.triage_status,
            encounterData.consultation_status
          );

          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                triage_status: encounterData.triage_status,
                consultation_status: encounterData.consultation_status,
                triage_bypass_reason: encounterData.triage_bypass_reason ?? patient.triage_bypass_reason,
                triage_category: encounterData.triage_category ?? patient.triage_category,
                // Only update stage if it can be derived, otherwise keep current stage
                ...(derivedStage ? {
                  previous_stage: patient.stage,
                  stage: derivedStage,
                } : {}),
                last_updated: now,
              },
            },
          };
        });
      },

      getStageFromStatuses: (patientId) => {
        const patient = get().activePatients[patientId];
        if (!patient) return null;
        return deriveStageFromStatuses(patient.triage_status, patient.consultation_status);
      },

      callPatient: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                consultation_status: 'CALLED',
                timestamps: {
                  ...patient.timestamps,
                  called_at: now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      startConsultation: (patientId, clinicianId, clinicianName) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'IN_CONSULTATION', {
                  consultation_start_time: now,
                }),
                consultation_status: 'IN_PROGRESS',
                assigned_clinician_id: clinicianId ?? null,
                assigned_clinician_name: clinicianName ?? null,
              },
            },
          };
        });
      },

      endConsultation: (patientId, summary, diagnosis) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'AWAITING_DISCHARGE', {
                  consultation_end_time: now,
                }),
                consultation_status: 'COMPLETED',
                consultation_summary: summary ?? null,
                primary_diagnosis: diagnosis ?? null,
              },
            },
          };
        });
      },

      // ========================================================================
      // Lab Actions
      // ========================================================================

      addLabOrder: (patientId, order) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const newOrder: LabOrder = {
            ...order,
            ordered_at: now,
            collected_at: null,
            completed_at: null,
            result_available: false,
          };
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                lab_orders: [...patient.lab_orders, newOrder],
                has_pending_lab: true,
                timestamps: {
                  ...patient.timestamps,
                  lab_ordered_at: patient.timestamps.lab_ordered_at ?? now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      updateLabOrder: (patientId, orderId, status, resultAvailable) => {
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.lab_orders.map(o =>
            o.id === orderId ? { ...o, status, result_available: resultAvailable ?? o.result_available } : o
          );
          const hasPending = updatedOrders.some(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS');
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                lab_orders: updatedOrders,
                has_pending_lab: hasPending,
                last_updated: new Date().toISOString(),
              },
            },
          };
        });
      },

      markLabCollected: (patientId, orderId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.lab_orders.map(o =>
            o.id === orderId ? { ...o, status: 'IN_PROGRESS' as OrderStatus, collected_at: now } : o
          );
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                lab_orders: updatedOrders,
                timestamps: {
                  ...patient.timestamps,
                  lab_collected_at: now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      markLabCompleted: (patientId, orderId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.lab_orders.map(o =>
            o.id === orderId ? { ...o, status: 'COMPLETED' as OrderStatus, completed_at: now, result_available: true } : o
          );
          const hasPending = updatedOrders.some(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS');
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                lab_orders: updatedOrders,
                has_pending_lab: hasPending,
                timestamps: {
                  ...patient.timestamps,
                  lab_completed_at: now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      // ========================================================================
      // Imaging Actions
      // ========================================================================

      addImagingOrder: (patientId, order) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const newOrder: ImagingOrder = {
            ...order,
            ordered_at: now,
            performed_at: null,
            reported_at: null,
          };
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                imaging_orders: [...patient.imaging_orders, newOrder],
                has_pending_imaging: true,
                timestamps: {
                  ...patient.timestamps,
                  imaging_ordered_at: patient.timestamps.imaging_ordered_at ?? now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      updateImagingOrder: (patientId, orderId, status) => {
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.imaging_orders.map(o =>
            o.id === orderId ? { ...o, status } : o
          );
          const hasPending = updatedOrders.some(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS');
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                imaging_orders: updatedOrders,
                has_pending_imaging: hasPending,
                last_updated: new Date().toISOString(),
              },
            },
          };
        });
      },

      markImagingPerformed: (patientId, orderId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.imaging_orders.map(o =>
            o.id === orderId ? { ...o, status: 'IN_PROGRESS' as OrderStatus, performed_at: now } : o
          );
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                imaging_orders: updatedOrders,
                timestamps: {
                  ...patient.timestamps,
                  imaging_performed_at: now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      markImagingReported: (patientId, orderId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.imaging_orders.map(o =>
            o.id === orderId ? { ...o, status: 'COMPLETED' as OrderStatus, reported_at: now } : o
          );
          const hasPending = updatedOrders.some(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS');
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                imaging_orders: updatedOrders,
                has_pending_imaging: hasPending,
                timestamps: {
                  ...patient.timestamps,
                  imaging_completed_at: now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      // ========================================================================
      // Pharmacy Actions
      // ========================================================================

      addPharmacyOrder: (patientId, order) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const newOrder: PharmacyOrder = {
            ...order,
            ordered_at: now,
            ready_at: null,
            dispensed_at: null,
          };
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                pharmacy_orders: [...patient.pharmacy_orders, newOrder],
                has_pending_pharmacy: true,
                timestamps: {
                  ...patient.timestamps,
                  pharmacy_ordered_at: patient.timestamps.pharmacy_ordered_at ?? now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      updatePharmacyOrder: (patientId, orderId, status) => {
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.pharmacy_orders.map(o =>
            o.id === orderId ? { ...o, status } : o
          );
          const hasPending = updatedOrders.some(o => 
            o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY'
          );
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                pharmacy_orders: updatedOrders,
                has_pending_pharmacy: hasPending,
                last_updated: new Date().toISOString(),
              },
            },
          };
        });
      },

      markPharmacyReady: (patientId, orderId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.pharmacy_orders.map(o =>
            o.id === orderId ? { ...o, status: 'READY' as PharmacyOrder['status'], ready_at: now } : o
          );
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                pharmacy_orders: updatedOrders,
                timestamps: {
                  ...patient.timestamps,
                  pharmacy_ready_at: now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      markPharmacyDispensed: (patientId, orderId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          const updatedOrders = patient.pharmacy_orders.map(o =>
            o.id === orderId ? { ...o, status: 'DISPENSED' as PharmacyOrder['status'], dispensed_at: now } : o
          );
          const hasPending = updatedOrders.some(o => 
            o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY'
          );
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                pharmacy_orders: updatedOrders,
                has_pending_pharmacy: hasPending,
                timestamps: {
                  ...patient.timestamps,
                  pharmacy_dispensed_at: now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      // ========================================================================
      // Billing Actions
      // ========================================================================

      setBilling: (patientId, billing) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                billing: { ...billing, last_updated: now },
                timestamps: {
                  ...patient.timestamps,
                  billing_started_at: patient.timestamps.billing_started_at ?? now,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      updateBillingStatus: (patientId, status, amountPaid) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient || !patient.billing) return state;
          
          const isCompleted = status === 'PAID' || status === 'WAIVED';
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                billing: {
                  ...patient.billing,
                  payment_status: status,
                  amount_paid: amountPaid ?? patient.billing.amount_paid,
                  last_updated: now,
                },
                timestamps: {
                  ...patient.timestamps,
                  billing_completed_at: isCompleted ? now : patient.timestamps.billing_completed_at,
                },
                last_updated: now,
              },
            },
          };
        });
      },

      // ========================================================================
      // Admission Actions
      // ========================================================================

      recommendAdmission: (patientId, recommendation) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'ADMISSION_RECOMMENDED', {
                  admission_recommended_at: now,
                }),
                admission: {
                  recommendation_id: recommendation.recommendation_id,
                  recommended_at: now,
                  recommended_by: recommendation.recommended_by,
                  reason: recommendation.reason,
                  bed_assigned: null,
                  ward: null,
                  admitted_at: null,
                  expected_discharge: null,
                  admission_id: null,
                },
              },
            },
          };
        });
      },

      assignBed: (patientId, bed, ward) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient || !patient.admission) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'AWAITING_BED', {
                  bed_assigned_at: now,
                }),
                admission: {
                  ...patient.admission,
                  bed_assigned: bed,
                  ward: ward,
                },
              },
            },
          };
        });
      },

      admitPatient: (patientId, admission_id) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient || !patient.admission) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...updatePatientWithStage(patient, 'ADMITTED', {
                  admitted_at: now,
                }),
                admission: {
                  ...patient.admission,
                  admitted_at: now,
                  admission_id: admission_id,
                },
              },
            },
          };
        });
      },

      // ========================================================================
      // Discharge Actions
      // ========================================================================

      startDischargePlanning: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, 'DISCHARGE_PLANNING', {
                discharge_planning_at: now,
              }),
            },
          };
        });
      },

      dischargePatient: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, 'DISCHARGED', {
                discharge_time: now,
              }),
            },
          };
        });
      },

      markLeftWithoutBeingSeen: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, 'LEFT_WITHOUT_BEING_SEEN', {
                discharge_time: now,
              }),
            },
          };
        });
      },

      // ========================================================================
      // Stage Management Actions
      // ========================================================================

      moveToStage: (patientId, stage) => {
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, stage),
            },
          };
        });
      },

      sendToLab: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, 'AWAITING_LAB', {
                lab_ordered_at: patient.timestamps.lab_ordered_at ?? now,
              }),
            },
          };
        });
      },

      sendToImaging: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, 'AWAITING_IMAGING', {
                imaging_ordered_at: patient.timestamps.imaging_ordered_at ?? now,
              }),
            },
          };
        });
      },

      sendToPharmacy: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, 'AWAITING_PHARMACY', {
                pharmacy_ordered_at: patient.timestamps.pharmacy_ordered_at ?? now,
              }),
            },
          };
        });
      },

      sendToBilling: (patientId) => {
        const now = new Date().toISOString();
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: updatePatientWithStage(patient, 'AWAITING_BILLING', {
                billing_started_at: patient.timestamps.billing_started_at ?? now,
              }),
            },
          };
        });
      },

      // ========================================================================
      // Data Management Actions
      // ========================================================================

      setEncounter: (patientId, encounterId, encounterType) => {
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                encounter_id: encounterId,
                encounter_type: encounterType,
                last_updated: new Date().toISOString(),
              },
            },
          };
        });
      },

      updatePatient: (patientId, updates) => {
        set((state) => {
          const patient = state.activePatients[patientId];
          if (!patient) return state;
          return {
            activePatients: {
              ...state.activePatients,
              [patientId]: {
                ...patient,
                ...updates,
                timestamps: updates.timestamps
                  ? { ...patient.timestamps, ...updates.timestamps }
                  : patient.timestamps,
                last_updated: new Date().toISOString(),
              },
            },
          };
        });
      },

      selectPatient: (patientId) => {
        set({ selectedPatientId: patientId });
      },

      getPatient: (patientId) => {
        return get().activePatients[patientId];
      },

      getSelectedPatient: () => {
        const { selectedPatientId, activePatients } = get();
        if (!selectedPatientId) return undefined;
        return activePatients[selectedPatientId];
      },

      getArrivalTime: (patientId) => {
        const patient = get().activePatients[patientId];
        return patient?.timestamps.arrival_time ?? null;
      },

      removePatient: (patientId) => {
        set((state) => {
          const { [patientId]: removed, ...rest } = state.activePatients;
          return {
            activePatients: rest,
            selectedPatientId:
              state.selectedPatientId === patientId ? null : state.selectedPatientId,
          };
        });
      },

      clearAllPatients: () => {
        set({
          activePatients: {},
          selectedPatientId: null,
        });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      // ========================================================================
      // Computed Getters
      // ========================================================================

      getPatientsByStage: (stage) => {
        const { activePatients } = get();
        return Object.values(activePatients).filter((p) => p.stage === stage);
      },

      getPatientsByStages: (stages) => {
        const { activePatients } = get();
        return Object.values(activePatients).filter((p) => stages.includes(p.stage));
      },

      getPatientsAwaitingTriage: () => {
        const { activePatients } = get();
        return Object.values(activePatients).filter(
          (p) => p.stage === 'AWAITING_TRIAGE' || p.stage === 'CHECKED_IN'
        );
      },

      getPatientsAwaitingConsultation: () => {
        const { activePatients } = get();
        return Object.values(activePatients).filter(
          (p) => p.stage === 'AWAITING_CONSULTATION'
        );
      },

      getPatientsAwaitingLab: () => {
        const { activePatients } = get();
        return Object.values(activePatients).filter(
          (p) => p.stage === 'AWAITING_LAB' || p.stage === 'LAB_IN_PROGRESS'
        );
      },

      getPatientsAwaitingImaging: () => {
        const { activePatients } = get();
        return Object.values(activePatients).filter(
          (p) => p.stage === 'AWAITING_IMAGING' || p.stage === 'IMAGING_IN_PROGRESS'
        );
      },

      getPatientsAwaitingPharmacy: () => {
        const { activePatients } = get();
        return Object.values(activePatients).filter(
          (p) => p.stage === 'AWAITING_PHARMACY' || p.stage === 'PHARMACY_DISPENSING' || p.stage === 'PHARMACY_READY'
        );
      },

      getPatientsAwaitingAdmission: () => {
        const { activePatients } = get();
        return Object.values(activePatients).filter(
          (p) => p.stage === 'ADMISSION_RECOMMENDED' || p.stage === 'AWAITING_BED'
        );
      },

      getWaitTime: (patientId) => {
        const patient = get().activePatients[patientId];
        if (!patient) return 0;
        return calculateWaitTime(patient.timestamps.arrival_time);
      },

      getTimeSinceStageChange: (patientId) => {
        const patient = get().activePatients[patientId];
        if (!patient) return 0;
        return calculateWaitTime(patient.last_updated);
      },
    }),
    {
      name: 'patient-journey-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        activePatients: state.activePatients,
      }),
    }
  )
);

// ============================================================================
// Selectors (for optimized re-renders)
// ============================================================================

export const selectActivePatients = (state: PatientJourneyState) =>
  state.activePatients;

export const selectSelectedPatient = (state: PatientJourneyState) => {
  if (!state.selectedPatientId) return undefined;
  return state.activePatients[state.selectedPatientId];
};

export const selectPatientsAwaitingTriage = (state: PatientJourneyState) =>
  Object.values(state.activePatients).filter(
    (p) => p.stage === 'AWAITING_TRIAGE' || p.stage === 'CHECKED_IN'
  );

export const selectPatientsAwaitingConsultation = (state: PatientJourneyState) =>
  Object.values(state.activePatients).filter(
    (p) => p.stage === 'AWAITING_CONSULTATION'
  );

export const selectPatientsAwaitingLab = (state: PatientJourneyState) =>
  Object.values(state.activePatients).filter(
    (p) => p.stage === 'AWAITING_LAB' || p.stage === 'LAB_IN_PROGRESS'
  );

export const selectPatientsAwaitingImaging = (state: PatientJourneyState) =>
  Object.values(state.activePatients).filter(
    (p) => p.stage === 'AWAITING_IMAGING' || p.stage === 'IMAGING_IN_PROGRESS'
  );

export const selectPatientsAwaitingPharmacy = (state: PatientJourneyState) =>
  Object.values(state.activePatients).filter(
    (p) => p.stage === 'AWAITING_PHARMACY' || p.stage === 'PHARMACY_DISPENSING' || p.stage === 'PHARMACY_READY'
  );

export const selectPatientsAwaitingAdmission = (state: PatientJourneyState) =>
  Object.values(state.activePatients).filter(
    (p) => p.stage === 'ADMISSION_RECOMMENDED' || p.stage === 'AWAITING_BED'
  );

export const selectPatientById = (patientId: number) => (state: PatientJourneyState) =>
  state.activePatients[patientId];

// ============================================================================
// Hook for specific patient (with subscription optimization)
// ============================================================================

export function usePatientJourney(patientId: number) {
  const patient = usePatientJourneyStore((state) => state.activePatients[patientId]);
  const checkIn = usePatientJourneyStore((state) => state.checkInPatient);
  const startTriage = usePatientJourneyStore((state) => state.startTriage);
  const completeTriage = usePatientJourneyStore((state) => state.completeTriage);
  const startConsultation = usePatientJourneyStore((state) => state.startConsultation);
  const endConsultation = usePatientJourneyStore((state) => state.endConsultation);
  const sendToLab = usePatientJourneyStore((state) => state.sendToLab);
  const sendToImaging = usePatientJourneyStore((state) => state.sendToImaging);
  const sendToPharmacy = usePatientJourneyStore((state) => state.sendToPharmacy);
  const dischargePatient = usePatientJourneyStore((state) => state.dischargePatient);
  const getArrivalTime = usePatientJourneyStore((state) => state.getArrivalTime);

  return {
    patient,
    checkIn: (options?: Parameters<typeof checkIn>[1]) => checkIn(patientId, options),
    startTriage: () => startTriage(patientId),
    completeTriage: (assessment: Parameters<typeof completeTriage>[1]) =>
      completeTriage(patientId, assessment),
    startConsultation: (clinicianId?: number, clinicianName?: string) =>
      startConsultation(patientId, clinicianId, clinicianName),
    endConsultation: (summary?: string, diagnosis?: string) =>
      endConsultation(patientId, summary, diagnosis),
    sendToLab: () => sendToLab(patientId),
    sendToImaging: () => sendToImaging(patientId),
    sendToPharmacy: () => sendToPharmacy(patientId),
    discharge: () => dischargePatient(patientId),
    arrivalTime: getArrivalTime(patientId),
  };
}
