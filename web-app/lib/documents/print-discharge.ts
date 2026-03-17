/**
 * Print Discharge Document Utility
 *
 * Generates printable A4 documents for:
 * - Discharge Summary (clinical treatment summary)
 * - Patient Instructions (take-home instructions for the patient)
 *
 * Uses the same buildPrintDocument + openPrintWindow pattern as
 * print-receipt, print-lab-report, etc.
 */

import {
  buildPrintDocument,
  escapeHtml,
  formatDate,
  openPrintWindow,
} from './renderer';

// =============================================================================
// TYPES
// =============================================================================

export interface DischargeDocumentData {
  /** Document title shown at the top */
  documentTitle: string;
  /** The text content to print */
  content: string;
  /** Patient name */
  patientName: string;
  /** Patient MRN */
  patientMRN?: string;
  /** Ward name */
  wardName?: string;
  /** Admission number */
  admissionNumber?: string;
  /** Admission date (ISO string) */
  admissionDate?: string;
  /** Discharge date (ISO string) — defaults to today */
  dischargeDate?: string;
  /** Admitting diagnosis */
  admittingDiagnosis?: string;
  /** Facility name for the header */
  facilityName?: string;
}

// =============================================================================
// CSS
// =============================================================================

const DISCHARGE_CSS = `
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 210mm;
    margin: 0 auto;
    padding: 15mm 20mm;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }

  .header .facility {
    font-size: 14pt;
    font-weight: 700;
    color: #111;
  }

  .header .doc-title {
    font-size: 13pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #333;
    text-align: right;
  }

  .patient-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 24px;
    font-size: 10.5pt;
    margin-bottom: 20px;
    padding: 10px 12px;
    background: #f8f8f8;
    border-radius: 4px;
  }

  .patient-info .row {
    display: flex;
    gap: 6px;
  }

  .patient-info .label {
    font-weight: 600;
    color: #555;
    min-width: 110px;
  }

  .patient-info .value {
    color: #111;
  }

  .content {
    white-space: pre-wrap;
    font-size: 11pt;
    line-height: 1.7;
    margin-bottom: 24px;
  }

  .footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #ccc;
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
    color: #666;
  }

  .signature-block {
    margin-top: 48px;
    display: flex;
    justify-content: space-between;
  }

  .signature-block .sig {
    width: 200px;
    text-align: center;
  }

  .signature-block .sig .line {
    border-top: 1px solid #333;
    margin-top: 48px;
    padding-top: 4px;
    font-size: 9.5pt;
    color: #555;
  }

  @media print {
    body { padding: 10mm 15mm; }
    .no-print { display: none !important; }
  }
`;

// =============================================================================
// TEMPLATE BUILDER
// =============================================================================

function buildDischargeHtml(data: DischargeDocumentData): string {
  const now = new Date();
  const dischargeDate = data.dischargeDate
    ? formatDate(data.dischargeDate)
    : formatDate(now.toISOString());
  const admissionDate = data.admissionDate
    ? formatDate(data.admissionDate)
    : '';

  return `
<div class="header">
  <div class="facility">${escapeHtml(data.facilityName || 'Health Facility')}</div>
  <div class="doc-title">${escapeHtml(data.documentTitle)}</div>
</div>

<div class="patient-info">
  <div class="row">
    <span class="label">Patient:</span>
    <span class="value">${escapeHtml(data.patientName)}</span>
  </div>
  ${data.patientMRN ? `<div class="row"><span class="label">MRN:</span><span class="value">${escapeHtml(data.patientMRN)}</span></div>` : ''}
  ${data.admissionNumber ? `<div class="row"><span class="label">Admission #:</span><span class="value">${escapeHtml(data.admissionNumber)}</span></div>` : ''}
  ${data.wardName ? `<div class="row"><span class="label">Ward:</span><span class="value">${escapeHtml(data.wardName)}</span></div>` : ''}
  ${admissionDate ? `<div class="row"><span class="label">Admitted:</span><span class="value">${admissionDate}</span></div>` : ''}
  <div class="row"><span class="label">Discharge Date:</span><span class="value">${dischargeDate}</span></div>
  ${data.admittingDiagnosis ? `<div class="row"><span class="label">Diagnosis:</span><span class="value">${escapeHtml(data.admittingDiagnosis)}</span></div>` : ''}
</div>

<div class="content">${escapeHtml(data.content)}</div>

<div class="signature-block">
  <div class="sig">
    <div class="line">Discharging Officer</div>
  </div>
  <div class="sig">
    <div class="line">Patient / Guardian Signature</div>
  </div>
</div>

<div class="footer">
  <span>Printed: ${now.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
  <span>${escapeHtml(data.facilityName || '')}</span>
</div>
`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Print a discharge document (summary or patient instructions).
 * Opens a new browser tab with the formatted document and triggers print.
 */
export function printDischargeDocument(data: DischargeDocumentData): Window | null {
  const bodyHtml = buildDischargeHtml(data);
  const title = `${data.documentTitle} - ${data.patientName}`;
  const html = buildPrintDocument(bodyHtml, title, 'a4', 'default', DISCHARGE_CSS);
  return openPrintWindow(html);
}
