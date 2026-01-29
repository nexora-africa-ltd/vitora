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

// =============================================================================
// RENDERER
// =============================================================================

export {
  escapeHtml,
  formatDate,
  formatDateTime,
  resolveDataPath,
  resolveBinding,
  replaceBindings,
  processRepeater,
  generateQRPlaceholder,
  getBaseCSS,
  getLayoutCSS,
  getThemeCSS,
  renderDocument,
  buildPrintDocument,
  openPrintWindow,
} from './renderer';

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
