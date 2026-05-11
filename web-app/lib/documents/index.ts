/**
 * Document Generation System
 *
 * Unified document rendering for prescriptions, labels, invoices, and receipts.
 * Supports multiple layouts (A4, thermal printers) and facility theming.
 *
 * @example
 * ```typescript
 * import { printPrescription, printLabel } from '@/lib/documents';
 *
 * // Print a prescription
 * printPrescription({
 *   prescription,
 *   patient: { full_name: 'John Doe', mrn: 'MRN-001' },
 *   facility: { name: 'City Hospital' },
 * });
 *
 * // Print a medication label
 * printLabel({
 *   dispensing,
 *   layout: 'thermal-80mm',
 * });
 * ```
 *
 * @see .tmp/document-generation-plan.md for architecture details
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  DocumentType,
  LayoutType,
  AssetType,
  DocumentDefinition,
  Repeater,
  AssetDefinition,
  PrintOptions,
  FacilityInfo,
  ClinicianInfo,
  SignatureInfo,
  PatientInfo,
  RenderContext,
  PrintPrescriptionData,
  PrintLabelData,
  CSSConfig,
} from './types';

export { getCSSConfig } from './types';

// =============================================================================
// SCHEMAS
// =============================================================================

export { prescriptionSchema, prescriptionDefaults } from './schemas/prescription.schema';
export { labelSchema, labelDefaults } from './schemas/label.schema';
export { receiptSchema, receiptDefaults } from './schemas/receipt.schema';
export { invoiceSchema, invoiceDefaults, invoiceStatusColors } from './schemas/invoice.schema';
export {
  radiologyReportSchema,
  radiologyReportDefaults,
  reportStatusClasses,
  reportStatusLabels,
} from './schemas/radiology-report.schema';
export {
  labReportSchema,
  labReportDefaults,
  labReportStatusClasses,
  labReportStatusLabels,
} from './schemas/lab-report.schema';
export {
  partographReportSchema,
  partographReportDefaults,
  partographReportStatusClasses,
  partographReportStatusLabels,
} from './schemas/partograph-report.schema';

// =============================================================================
// RENDERER
// =============================================================================

export {
  escapeHtml,
  formatDate,
  formatDateTime,
  renderSignatureColumn,
  resolveDataPath,
  resolveBinding,
  replaceBindings,
  processRepeater,
  generateQRPlaceholder,
  generateQRHtml,
  generateQRImageHtml,
  getBaseCSS,
  getLayoutCSS,
  getThemeCSS,
  renderDocument,
  renderDocumentAsync,
  buildPrintDocument,
  openPrintWindow,
} from './renderer';

// =============================================================================
// QR CODE UTILITIES (re-exported for convenience)
// =============================================================================

export {
  generateQRDataUri,
  generateQRSvg,
  generateQRDataUriSync,
  generateQRBlockHtml,
  generateQRBlockHtmlSync,
  getPrescriptionQRContent,
  getDispensingQRContent,
  getReceiptQRContent,
  getInvoiceQRContent,
  getLabResultQRContent,
  type QRContent,
  type QRCodeOptions,
  type QRErrorCorrectionLevel,
  type QRDocumentType,
} from '@/lib/utils/qr';

// =============================================================================
// PRINT UTILITIES
// =============================================================================

export {
  printPrescription,
  previewPrescription,
  type PrintPrescriptionOptions,
} from './print-prescription';

export {
  printLabel,
  previewLabel,
  printMultipleLabels,
  type PrintLabelOptions,
} from './print-label';

export {
  printReceipt,
  previewReceipt,
  type PrintReceiptOptions,
} from './print-receipt';

export {
  printInvoice,
  previewInvoice,
  type PrintInvoiceOptions,
} from './print-invoice';

export {
  printRadiologyReport,
  getRadiologyReportQRContent,
  type PrintRadiologyReportData,
} from './print-report';

export {
  printLabReport,
  type PrintLabReportData,
} from './print-lab-report';
export {
  printPartographReport,
  type PrintPartographReportData,
} from './print-partograph-report';

export {
  printDischargeDocument,
  type DischargeDocumentData,
} from './print-discharge';

export {
  printSickNote,
  type PrintSickNoteOptions,
} from './print-sick-note';

export {
  printReferralLetter,
  type PrintReferralOptions,
} from './print-referral';
