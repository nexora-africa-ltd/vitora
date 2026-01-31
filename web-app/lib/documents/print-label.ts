/**
 * Print Label Utility
 *
 * High-level function to print a medication dispensing label.
 * Uses the document renderer with the label schema and template.
 */

import type { Dispensing } from '@/lib/types/pharmacy';
import type {
  FacilityInfo,
  PatientInfo,
  LayoutType,
  RenderContext,
} from './types';
import { labelSchema, labelDefaults } from './schemas/label.schema';
import {
  renderDocumentAsync,
  buildPrintDocument,
  openPrintWindow,
  escapeHtml,
  formatDate,
} from './renderer';
import { getDispensingQRContent, type QRContent } from '@/lib/utils/qr';

// =============================================================================
// LABEL TEMPLATE
// =============================================================================

/**
 * Medication label HTML template
 * Embedded as a string for bundling simplicity
 */
const LABEL_TEMPLATE = `
<div class="label">
  <div class="clinic">{{facility.name}}</div>

  <div class="row"><strong>Patient:</strong> {{patient.full_name}}</div>
  <div class="row"><strong>Date:</strong> {{dispense.date}}</div>

  <div class="drug">{{drug.name}}</div>

  <div class="row"><strong>Dose:</strong> {{drug.dose}}</div>
  <div class="row"><strong>Frequency:</strong> {{drug.frequency}}</div>
  <div class="row"><strong>Duration:</strong> {{drug.duration}}</div>

  <div class="instructions">
    {{drug.instructions}}
  </div>

  <div class="qr">
    QR / Barcode
  </div>

  <div class="footer">
    Keep out of reach of children<br />
    Store as directed
  </div>
</div>
`;

/**
 * Label-specific CSS (extends base)
 */
const LABEL_CSS = `
  .label {
    width: 280px;
    border: 1px solid #000;
    padding: 8px;
    box-sizing: border-box;
    font-size: 12px;
  }

  .clinic {
    font-weight: bold;
    font-size: 13px;
    margin-bottom: 4px;
  }

  .row {
    margin-bottom: 4px;
  }

  .drug {
    font-size: 14px;
    font-weight: bold;
    margin: 6px 0;
    padding: 4px;
    background: #f5f5f5;
  }

  .instructions {
    border-top: 1px dashed #000;
    padding-top: 6px;
    margin-top: 6px;
    font-size: 11px;
    min-height: 24px;
  }

  .qr {
    margin-top: 8px;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
  }

  .footer {
    font-size: 10px;
    margin-top: 6px;
    color: #666;
    border-top: 1px solid #ccc;
    padding-top: 4px;
  }

  .warning {
    border: 1px solid #f00;
    background: #fff5f5;
    padding: 4px;
    font-size: 10px;
    color: #c00;
    margin-top: 8px;
  }

  .batch-info {
    font-size: 9px;
    color: #666;
    margin-top: 4px;
  }
`;

/**
 * Thermal 80mm label CSS override
 */
const THERMAL_80MM_CSS = `
  .label {
    width: 76mm;
    padding: 3mm;
    font-size: 10px;
  }

  .clinic {
    font-size: 11px;
  }

  .drug {
    font-size: 12px;
  }

  .qr {
    width: 40px;
    height: 40px;
  }
`;

/**
 * Thermal 58mm label CSS override
 */
const THERMAL_58MM_CSS = `
  .label {
    width: 54mm;
    padding: 2mm;
    font-size: 9px;
  }

  .clinic {
    font-size: 10px;
  }

  .drug {
    font-size: 11px;
  }

  .qr {
    width: 32px;
    height: 32px;
    font-size: 7px;
  }

  .footer {
    font-size: 8px;
  }
`;

// =============================================================================
// PRINT LABEL OPTIONS
// =============================================================================

export interface PrintLabelOptions {
  /** The dispensing record to print label for */
  dispensing: Dispensing;
  /** Patient information (can be extracted from dispensing or provided) */
  patient?: PatientInfo;
  /** Facility information for header */
  facility?: FacilityInfo;
  /** Drug details override */
  drug?: {
    name?: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  };
  /** Layout format */
  layout?: 'label' | 'thermal-58mm' | 'thermal-80mm';
  /** Theme name */
  theme?: string;
  /** Show batch/expiry info */
  showBatchInfo?: boolean;
  /** Show expiry warning */
  showExpiryWarning?: boolean;
  /** Backend-provided verification URL (if available) */
  verificationUrl?: string;
}

// =============================================================================
// PRINT LABEL
// =============================================================================

/**
 * Get additional CSS for layout variant
 */
function getLayoutVariantCSS(layout: 'label' | 'thermal-58mm' | 'thermal-80mm'): string {
  switch (layout) {
    case 'thermal-80mm':
      return THERMAL_80MM_CSS;
    case 'thermal-58mm':
      return THERMAL_58MM_CSS;
    default:
      return '';
  }
}

/**
 * Build label HTML with optional batch info and warnings
 */
function buildLabelHtml(
  baseHtml: string,
  dispensing: Dispensing,
  showBatchInfo: boolean,
  showExpiryWarning: boolean
): string {
  let html = baseHtml;

  // Add batch info before footer if requested
  if (showBatchInfo && dispensing.batch_number) {
    const batchInfo = `
      <div class="batch-info">
        Batch: ${escapeHtml(dispensing.batch_number)}
      </div>
    `;
    html = html.replace(
      '<div class="footer">',
      `${batchInfo}\n  <div class="footer">`
    );
  }

  // Add expiry warning if requested
  if (showExpiryWarning) {
    const warning = `
      <div class="warning">
        ⚠️ Do not use after expiry date. Keep away from children.
      </div>
    `;
    html = html.replace(
      '<div class="footer">',
      `${warning}\n  <div class="footer">`
    );
  }

  return html;
}

/**
 * Print a medication label
 *
 * @param options - Dispensing data and print options
 * @returns Promise that resolves to the print window, or null if failed
 */
export async function printLabel(options: PrintLabelOptions): Promise<Window | null> {
  const {
    dispensing,
    patient,
    facility,
    drug,
    layout = 'label',
    theme = 'default',
    showBatchInfo = true,
    showExpiryWarning = true,
    verificationUrl,
  } = options;

  // Validate required data
  if (!dispensing) {
    console.error('printLabel: dispensing is required');
    return null;
  }

  // Get QR content with verification status
  const qrContent = getDispensingQRContent({
    id: dispensing.id,
    verification_url: verificationUrl || (dispensing as Dispensing & { verification_url?: string }).verification_url,
    batch_number: dispensing.batch_number,
  });

  // Build render context
  const context: RenderContext = {
    // Patient info (from options or dispensing)
    patient: patient || {
      full_name: dispensing.patient_name || 'Patient',
      mrn: dispensing.patient_mrn || '',
    },

    // Facility info (from options or defaults)
    facility: facility || labelDefaults.facility,

    // Drug info (from options, dispensing, or defaults)
    drug: {
      drug_name: drug?.name || dispensing.drug_name || 'Medication',
      dosage: drug?.dosage || (dispensing as Dispensing & { dosage?: string }).dosage || '',
      frequency: drug?.frequency || (dispensing as Dispensing & { frequency?: string }).frequency || '',
      duration: drug?.duration || (dispensing as Dispensing & { duration?: string }).duration || '',
      instructions: drug?.instructions ||
        (dispensing as Dispensing & { instructions?: string }).instructions ||
        labelDefaults.drug.instructions,
    },

    // Dispensing data
    dispensing: {
      id: dispensing.id,
      dispensed_at: dispensing.dispensed_at,
      batch_number: dispensing.batch_number,
      quantity: dispensing.quantity,
    },
  };

  // Render the document with QR code
  let bodyHtml = await renderDocumentAsync(LABEL_TEMPLATE, labelSchema, context, qrContent);

  // Add batch info and warnings
  bodyHtml = buildLabelHtml(bodyHtml, dispensing, showBatchInfo, showExpiryWarning);

  // Build complete HTML with CSS
  const title = `Label - ${dispensing.drug_name || 'Medication'}`;
  const variantCSS = getLayoutVariantCSS(layout);
  const html = buildPrintDocument(
    bodyHtml,
    title,
    layout,
    theme,
    LABEL_CSS + variantCSS
  );

  // Open print window
  return openPrintWindow(html);
}

/**
 * Preview a label without printing
 * Returns the generated HTML for inspection
 */
export async function previewLabel(options: PrintLabelOptions): Promise<string> {
  const {
    dispensing,
    patient,
    facility,
    drug,
    layout = 'label',
    theme = 'default',
    showBatchInfo = true,
    showExpiryWarning = true,
    verificationUrl,
  } = options;

  // Get QR content with verification status
  const qrContent = getDispensingQRContent({
    id: dispensing.id,
    verification_url: verificationUrl || (dispensing as Dispensing & { verification_url?: string }).verification_url,
    batch_number: dispensing.batch_number,
  });

  const context: RenderContext = {
    patient: patient || {
      full_name: dispensing.patient_name || 'Patient',
      mrn: dispensing.patient_mrn || '',
    },
    facility: facility || labelDefaults.facility,
    drug: {
      drug_name: drug?.name || dispensing.drug_name || 'Medication',
      dosage: drug?.dosage || '',
      frequency: drug?.frequency || '',
      duration: drug?.duration || '',
      instructions: drug?.instructions || labelDefaults.drug.instructions,
    },
    dispensing: {
      id: dispensing.id,
      dispensed_at: dispensing.dispensed_at,
      batch_number: dispensing.batch_number,
      quantity: dispensing.quantity,
    },
  };

  let bodyHtml = await renderDocumentAsync(LABEL_TEMPLATE, labelSchema, context, qrContent);
  bodyHtml = buildLabelHtml(bodyHtml, dispensing, showBatchInfo, showExpiryWarning);

  const title = `Label - ${dispensing.drug_name || 'Medication'}`;
  const variantCSS = getLayoutVariantCSS(layout);
  return buildPrintDocument(bodyHtml, title, layout, theme, LABEL_CSS + variantCSS);
}

/**
 * Print multiple labels (for dispensing multiple items)
 *
 * @param dispensings - Array of dispensing records
 * @param options - Shared options for all labels
 * @returns Promise that resolves to the print window, or null if failed
 */
export async function printMultipleLabels(
  dispensings: Dispensing[],
  options?: Omit<PrintLabelOptions, 'dispensing'>
): Promise<Window | null> {
  if (!dispensings || dispensings.length === 0) {
    console.error('printMultipleLabels: at least one dispensing record is required');
    return null;
  }

  const {
    patient,
    facility,
    layout = 'label',
    theme = 'default',
    showBatchInfo = true,
    showExpiryWarning = true,
  } = options || {};

  // Generate HTML for each label (in parallel)
  const labelPromises = dispensings.map(async (dispensing) => {
    // Get QR content with verification status
    const qrContent = getDispensingQRContent({
      id: dispensing.id,
      verification_url: (dispensing as Dispensing & { verification_url?: string }).verification_url,
      batch_number: dispensing.batch_number,
    });

    const context: RenderContext = {
      patient: patient || {
        full_name: dispensing.patient_name || 'Patient',
        mrn: dispensing.patient_mrn || '',
      },
      facility: facility || labelDefaults.facility,
      drug: {
        drug_name: dispensing.drug_name || 'Medication',
        dosage: (dispensing as Dispensing & { dosage?: string }).dosage || '',
        frequency: (dispensing as Dispensing & { frequency?: string }).frequency || '',
        duration: (dispensing as Dispensing & { duration?: string }).duration || '',
        instructions:
          (dispensing as Dispensing & { instructions?: string }).instructions ||
          labelDefaults.drug.instructions,
      },
      dispensing: {
        id: dispensing.id,
        dispensed_at: dispensing.dispensed_at,
        batch_number: dispensing.batch_number,
        quantity: dispensing.quantity,
      },
    };

    let bodyHtml = await renderDocumentAsync(LABEL_TEMPLATE, labelSchema, context, qrContent);
    return buildLabelHtml(bodyHtml, dispensing, showBatchInfo, showExpiryWarning);
  });

  const labelHtmlArray = await Promise.all(labelPromises);
  const labelsHtml = labelHtmlArray.join('\n<div style="page-break-after: always;"></div>\n');

  const title = `Labels (${dispensings.length})`;
  const variantCSS = getLayoutVariantCSS(layout);
  const html = buildPrintDocument(labelsHtml, title, layout, theme, LABEL_CSS + variantCSS);

  return openPrintWindow(html);
}
