/**
 * Barrel export for encounter components.
 */

// Display components
export { EncounterTable } from './encounter-table';
export { VitalsDisplay } from './vitals-display';
export { DiagnosesList } from './diagnoses-list';
export { MedicalHistoryView } from './medical-history-view';
export { TreatmentPlanView } from './treatment-plan-view';

// Lab and Pharmacy integration
export { EncounterLabOrders } from './encounter-lab-orders';
export { EncounterPrescriptions } from './encounter-prescriptions';

// Consultation Queue components
export { ConsultationQueue } from './consultation-queue';
export { ConsultationQueueItem } from './consultation-queue-item';
export { BypassTriageDialog } from './bypass-triage-dialog';
export { StartConsultationDialog } from './start-consultation-dialog';
export { ConsultationQueueContainer } from './consultation-queue-container';

// Form components
export { PatientSelector } from './patient-selector';
export { VitalsForm } from './vitals-form';
export { MedicalHistoryForm } from './medical-history-form';
export { DiagnosisForm, DiagnosisEntry, DiagnosisListDisplay } from './diagnosis-form';

// Allied Health Referrals
export { AlliedHealthReferralActions } from './allied-health-referral-actions';
export { EncounterAlliedHealthContent } from './encounter-allied-health-content';

// Unified Referrals
export { EncounterReferralsContent } from './encounter-referrals-content';
export { ReferralCreateDialog } from './referral-create-dialog';
