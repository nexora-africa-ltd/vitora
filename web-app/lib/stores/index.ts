/**
 * Store Exports
 *
 * Central export for all Zustand stores used in the application.
 */

// Patient Journey Store - tracks patient state through their visit
export {
  usePatientJourneyStore,
  usePatientJourney,
  // Selectors
  selectActivePatients,
  selectSelectedPatient,
  selectPatientsAwaitingTriage,
  selectPatientsAwaitingConsultation,
  selectPatientsAwaitingLab,
  selectPatientsAwaitingImaging,
  selectPatientsAwaitingPharmacy,
  selectPatientsAwaitingAdmission,
  selectPatientById,
  // Types
  type PatientStage,
  type PatientJourneyTimestamps,
  type ActivePatient,
  type LabOrder,
  type ImagingOrder,
  type PharmacyOrder,
  type BillingInfo,
  type AdmissionInfo,
  type OrderStatus,
} from './patient-journey';

// Triage Assessment Store - persists triage data across multi-tab workflow
export {
  useTriageAssessStore,
  type TriageVitals,
  type TriageHistory,
  type TriageAssessmentData,
  type TriageRouting,
  type TriageAssessSession,
} from './triage-assess-store';

// Encounter Edit Store - persists encounter edit data across multi-step workflow
export {
  useEncounterEditStore,
  type EncounterVitals,
  type EncounterHistory,
  type EncounterNotes,
  type EncounterEditSession,
} from './encounter-edit-store';
