/**
 * Pharmacy Components Barrel Export
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

export { DrugTable } from './drug-table';
export { DrugForm } from './drug-form';
export { StockTable } from './stock-table';
export { AlertsPanel } from './alerts-panel';
export { PrescriptionsTable } from './prescriptions-table';
export { BatchDetailDialog } from './batch-detail-dialog';
export { StockAdjustmentDialog } from './stock-adjustment-dialog';
export { DispensingHistoryTable } from './dispensing-history-table';

// Dispensing Components
export { DispenseDialog } from './dispensing/dispense-dialog';
export { DirectDispenseDialog } from './dispensing/direct-dispense-dialog';
export { ReturnDialog } from './dispensing/return-dialog';
export { LabelDialog } from './dispensing/label-dialog';

// Drug-Allergy Interaction Warning
export { PrescriptionAllergyWarning } from './prescription-allergy-warning';

// Print Components
export { PrescriptionPrintButton, usePrintPrescription } from './prescription-print-button';
