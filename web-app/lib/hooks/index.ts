/**
 * Barrel export for custom hooks.
 */

export { useDebounce } from './use-debounce';
export { useAutoSave, type AutoSaveStatus } from './use-auto-save';
export { useDraftSave } from './use-draft-save';
export { useEventLogger } from './use-event-logger';
export {
  useEncounters,
  useEncounter,
  useEncounterDiagnoses,
  useEncounterTreatmentPlan,
  useCreateEncounter,
  useUpdateEncounter,
} from './use-encounters';
export { useCounties, useSubCounties, useWards, useLocationSelector } from './use-locations';
export { useNetworkStatus } from './use-network-status';
export { usePatients, usePatient } from './use-patients';
export {
  usePatients as usePatientsEnhanced,
  usePatient as usePatientEnhanced,
  usePatientEmergencyContacts,
  usePatientEncounters,
  useCreatePatient,
  useUpdatePatient,
  useDeletePatient,
} from './use-patients-enhanced';
export { useToast, toast } from './use-toast';
export { useToastNotification } from './use-toast-notification';

// Vital thresholds (shared by encounter and triage)
export {
  useVitalThresholds,
  evaluateVitals,
  getFieldStatus as getVitalFieldStatus,
  DEFAULT_THRESHOLDS,
  type VitalAlert,
  type VitalValues,
} from './use-vital-thresholds';

// Inpatient (Admissions/IPD) hooks
export {
  useInpatientWards,
  useBeds,
  useWardBeds,
  useAdmissionRecommendations,
  useAdmissions,
  useAdmission,
  useCreateAdmissionRecommendation,
  useAcceptAdmissionRecommendation,
  useDeclineAdmissionRecommendation,
  useCreateAdmission,
  useUpdateAdmission,
  useUpdateBed,
} from './use-inpatient';

// Patient history/timeline hooks
export {
  usePatientHistory,
  usePatientHistoryInfinite,
  usePatientHistorySummary,
} from './use-patient-history';

// Dashboard metrics hooks
export {
  useDashboardMetrics,
  useDashboardKPIs,
  usePatientVolumeChart,
  useRevenueBreakdown,
  useRecentActivity,
} from './use-dashboard-metrics';

// Laboratory hooks
export {
  useTestCatalog,
  useTest,
  useTestSearch,
  useLabOrders,
  useLabOrder,
  usePatientLabOrders,
  useEncounterLabOrders,
  useCreateLabOrder,
  useUpdateLabOrder,
  useSubmitLabOrder,
  useCollectSpecimen,
  useCancelLabOrder,
  useAddOrderItem,
  useRemoveOrderItem,
  useOrderResults,
  usePatientLabResults,
  useAddLabResult,
  useUpdateLabResult,
  useVerifyLabResult,
  useUploadResultAttachment,
  usePendingVerification,
  useLabQueue,
  useCollectSample,
  useAssignQueueEntry,
  useStartProcessing,
  useSubmitForReview,
  useReleaseResults,
  useRejectSample,
  useUpdateNotes,
  useBarcodeLookup,
  useLabTechnicians,
  useCriticalAlerts,
} from './use-laboratory';

// Triage hooks
export {
  triageKeys,
  useTriageAssessment,
  useCreateTriageAssessment,
  useUpdateTriageAssessment,
  useCalculateTriageCategory,
  useTriageQueue,
  useTriageQueueActions,
  useTriageVitalThresholds,
  useUpdateVitalThreshold,
  useToggleThresholdActive,
  useResetThresholdToDefault,
  useResetAllThresholdsToDefaults,
  useExportThresholds,
  useImportThresholds,
  useTriageReports,
  useTriageWaitTimeStats,
  useExportTriageReport,
  // Waiting queue hooks
  useWaitingQueue,
  useCheckInPatient,
  useStartTriage,
  useCancelWaitingEntry,
} from './use-triage';

// Consultation Queue hooks (Phase 3.3)
export {
  consultationQueueKeys,
  useConsultationQueue,
  useCallPatient,
  useStartConsultation,
  useBypassTriage,
} from './use-consultation-queue';
