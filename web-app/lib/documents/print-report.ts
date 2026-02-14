/**
 * Print Radiology Report Utility
 *
 * High-level function to print a radiology report document.
 * Uses the document renderer with the radiology-report schema and template.
 */

import type { RadiologyReport } from '@/lib/types/imaging';
import type {
  FacilityInfo,
  PatientInfo,
  LayoutType,
  RenderContext,
} from './types';
import {
  radiologyReportSchema,
  radiologyReportDefaults,
  reportStatusClasses,
  reportStatusLabels,
} from './schemas/radiology-report.schema';
import {
  renderDocumentAsync,
  buildPrintDocument,
  openPrintWindow,
  escapeHtml,
  formatDate,
  formatDateTime,
} from './renderer';
import { generateQRDataUri, type QRContent } from '@/lib/utils/qr';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Extended patient info for radiology reports
 */
interface ReportPatientInfo extends PatientInfo {
  age?: string | number;
  sex?: string;
}

/**
 * Order info for radiology reports
 */
interface ReportOrderInfo {
  order_number: string;
  ordered_by_name: string;
  ordered_at: string;
  clinical_indication: string;
}

/**
 * Data required to print a radiology report
 */
export interface PrintRadiologyReportData {
  /** The radiology report object */
  report: RadiologyReport;
  /** Patient information */
  patient: ReportPatientInfo;
  /** Order information */
  order: ReportOrderInfo;
  /** Facility information (optional, uses defaults if not provided) */
  facility?: Partial<FacilityInfo>;
  /** Layout override */
  layout?: LayoutType;
}

// =============================================================================
// TEMPLATE
// =============================================================================

/**
 * Radiology report HTML template (inline for self-contained rendering)
 */
const RADIOLOGY_REPORT_TEMPLATE = `
<div class="report">
  <!-- Header -->
  <div class="header">
    <div class="facility">
      <h1>{{facility.name}}</h1>
      <p>{{facility.address}}</p>
      <p>Tel: {{facility.phone}}</p>
      <p>License: {{facility.license}}</p>
    </div>
    <div class="doc-meta">
      <div class="title">RADIOLOGY REPORT</div>
      <div>Report: {{report.number}}</div>
      <div>Order: {{order.number}}</div>
      <div>Date: {{report.date}}</div>
      <div class="status-badge {{report.status_class}}">{{report.status_label}}</div>
      <div class="qr">QR</div>
    </div>
  </div>

  <!-- Critical Alert -->
  <div class="critical-alert" style="{{critical.display}}">
    <h3>⚠️ CRITICAL FINDING</h3>
    <p><strong>Finding:</strong> {{critical.description}}</p>
    <p><strong>Communication:</strong> {{critical.communication}}</p>
  </div>

  <!-- Patient Info -->
  <div class="patient-info">
    <div class="row"><span class="label">Patient:</span><span class="value">{{patient.name}}</span></div>
    <div class="row"><span class="label">MRN:</span><span class="value">{{patient.mrn}}</span></div>
    <div class="row"><span class="label">Age/Sex:</span><span class="value">{{patient.age}} / {{patient.sex}}</span></div>
    <div class="row"><span class="label">Referring:</span><span class="value">{{order.ordered_by}}</span></div>
    <div class="row"><span class="label">Study Date:</span><span class="value">{{order.date}}</span></div>
    <div class="row"><span class="label">Modality:</span><span class="value">{{report.modality}}</span></div>
    <div class="row"><span class="label">Exam:</span><span class="value">{{report.study_description}}</span></div>
  </div>

  <!-- Clinical Indication -->
  <div class="section">
    <div class="section-title">Clinical Indication</div>
    <div class="section-content">{{order.indication}}</div>
  </div>

  <!-- Technique -->
  <div class="section" style="{{technique.display}}">
    <div class="section-title">Technique</div>
    <div class="section-content">{{report.technique}}</div>
  </div>

  <!-- Comparison -->
  <div class="section" style="{{comparison.display}}">
    <div class="section-title">Comparison</div>
    <div class="section-content">{{report.comparison}}</div>
  </div>

  <!-- Findings -->
  <div class="section">
    <div class="section-title">Findings</div>
    <div class="section-content">{{report.findings}}</div>
  </div>

  <!-- Impression -->
  <div class="section">
    <div class="section-title">Impression</div>
    <div class="section-content">{{report.impression}}</div>
  </div>

  <!-- Recommendations -->
  <div class="section" style="{{recommendations.display}}">
    <div class="section-title">Recommendations</div>
    <div class="section-content">{{report.recommendations}}</div>
  </div>

  <!-- Signature -->
  <div class="signature-block">
    <div class="signature-line">
      <div>
        <div class="signature-name">{{signature.name}}</div>
        <div class="signature-credentials">{{signature.credentials}}</div>
      </div>
      <div>
        <div class="signature-datetime">{{signature.datetime}}</div>
        <div class="electronic-signature">{{signature.status}}</div>
      </div>
    </div>
  </div>

  <!-- Amendments -->
  <div class="amendments" style="{{amendments.display}}">
    <h4>Amendment History</h4>
    {{amendments.items}}
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-notes">
      <p>Generated by {{system.name}}. Digitally signed.</p>
    </div>
    <div class="qr">QR</div>
  </div>
</div>
`;

/**
 * CSS for radiology report
 */
const RADIOLOGY_REPORT_CSS = `
@page { size: A4; margin: 15mm; }

body {
  font-family: "Inter", Arial, sans-serif;
  margin: 0;
  padding: 0;
  color: #111;
  font-size: 11px;
  line-height: 1.5;
  background: #fff;
}

.report {
  max-width: 180mm;
  margin: auto;
  padding: 15mm;
}

.header {
  display: flex;
  justify-content: space-between;
  border-bottom: 2px solid #1a365d;
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.facility h1 { margin: 0; font-size: 16px; color: #1a365d; }
.facility p { margin: 2px 0; font-size: 10px; color: #555; }

.doc-meta { text-align: right; font-size: 10px; }
.doc-meta .title { font-size: 14px; font-weight: 700; color: #1a365d; margin-bottom: 4px; }

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 9px;
  font-weight: 600;
  border-radius: 8px;
  text-transform: uppercase;
  margin-top: 4px;
}

.status-draft { background: #fef3c7; color: #92400e; }
.status-preliminary { background: #dbeafe; color: #1e40af; }
.status-final { background: #d1fae5; color: #065f46; }
.status-amended { background: #fce7f3; color: #9d174d; }

.critical-alert {
  background: #fef2f2;
  border: 2px solid #ef4444;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 14px;
}
.critical-alert h3 { margin: 0 0 4px; color: #dc2626; font-size: 12px; }
.critical-alert p { margin: 2px 0; font-size: 10px; color: #7f1d1d; }

.patient-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 20px;
  background: #f8fafc;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 14px;
  font-size: 10px;
}
.patient-info .row { display: flex; gap: 4px; }
.patient-info .label { font-weight: 600; color: #64748b; }
.patient-info .value { color: #1e293b; }

.section { margin-bottom: 12px; }
.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #1a365d;
  text-transform: uppercase;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 3px;
  margin-bottom: 6px;
}
.section-content { white-space: pre-wrap; font-size: 10px; line-height: 1.5; }

.signature-block {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}
.signature-line {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.signature-name { font-weight: 600; font-size: 11px; }
.signature-credentials { font-size: 10px; color: #64748b; }
.signature-datetime { font-size: 10px; color: #64748b; }
.electronic-signature { font-size: 9px; color: #16a34a; font-style: italic; }

.amendments {
  margin-top: 16px;
  padding: 10px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 4px;
}
.amendments h4 { margin: 0 0 6px; font-size: 10px; color: #92400e; }
.amendment-item { font-size: 9px; padding: 4px 0; border-bottom: 1px dashed #fcd34d; }
.amendment-item:last-child { border-bottom: none; }

.footer {
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  font-size: 8px;
  color: #94a3b8;
}

.qr {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr img { width: 100%; height: 100%; }

@media screen { body { padding: 20px; background: #f4f6f8; } }
`;

// =============================================================================
// PRINT FUNCTION
// =============================================================================

/**
 * Generate QR content for a radiology report
 */
export function getRadiologyReportQRContent(report: RadiologyReport): QRContent {
  // For now, encode report number + order number
  // In production, this could be a verifiable URL
  const data = `RPT:${report.report_number}|ORD:${report.order_number}`;

  return {
    data,
    isVerifiable: false, // Would be true with backend-signed URLs
    label: `Report ${report.report_number}`,
  };
}

/**
 * Build template data from report and related objects
 */
function buildTemplateData(data: PrintRadiologyReportData): Record<string, unknown> {
  const { report, patient, order, facility } = data;

  // Compute display flags
  const criticalDisplay = report.is_critical ? 'block' : 'none';
  const techniqueDisplay = report.technique ? 'block' : 'none';
  const comparisonDisplay = report.comparison ? 'block' : 'none';
  const recommendationsDisplay = report.recommendations ? 'block' : 'none';
  const amendmentsDisplay = report.amendment_count > 0 ? 'block' : 'none';

  // Critical communication text
  let criticalCommunication = 'Not yet communicated';
  if (report.critical_communicated && report.critical_communicated_to) {
    criticalCommunication = `Communicated to ${report.critical_communicated_to} via ${report.critical_communicated_method || 'phone'}`;
    if (report.critical_communicated_at) {
      criticalCommunication += ` on ${formatDateTime(report.critical_communicated_at)}`;
    }
  }

  // Signature info
  const signatureStatus = report.signed_at
    ? '✓ Electronically Signed'
    : '⚠ DRAFT - Not yet signed';
  const signatureDatetime = report.signed_at
    ? formatDateTime(report.signed_at)
    : '';

  // Build amendment items HTML
  let amendmentItemsHtml = '';
  if (report.amendments && report.amendments.length > 0) {
    amendmentItemsHtml = report.amendments
      .map(
        (a) =>
          `<div class="amendment-item">Amendment #${a.amendment_number}: ${escapeHtml(a.reason)} (by ${escapeHtml(a.amended_by_name)} on ${formatDateTime(a.amended_at)})</div>`
      )
      .join('');
  }

  return {
    facility: {
      name: facility?.name || radiologyReportDefaults.facility.name,
      address: facility?.address || '',
      phone: facility?.phone || '',
      license: facility?.license || '',
    },
    report: {
      number: report.report_number,
      date: formatDate(report.created_at),
      status_class: reportStatusClasses[report.status] || 'status-draft',
      status_label: reportStatusLabels[report.status] || report.status,
      modality: report.modality || '',
      study_description: report.study_description || '',
      technique: escapeHtml(report.technique || ''),
      comparison: escapeHtml(report.comparison || ''),
      findings: escapeHtml(report.findings || ''),
      impression: escapeHtml(report.impression || ''),
      recommendations: escapeHtml(report.recommendations || ''),
    },
    patient: {
      name: patient.full_name || '',
      mrn: patient.mrn || '',
      age: patient.age || '',
      sex: patient.sex || '',
    },
    order: {
      number: order.order_number,
      ordered_by: order.ordered_by_name || '',
      date: formatDate(order.ordered_at),
      indication: escapeHtml(order.clinical_indication || ''),
    },
    critical: {
      display: criticalDisplay,
      description: escapeHtml(report.critical_finding_description || ''),
      communication: criticalCommunication,
    },
    technique: { display: techniqueDisplay },
    comparison: { display: comparisonDisplay },
    recommendations: { display: recommendationsDisplay },
    amendments: {
      display: amendmentsDisplay,
      items: amendmentItemsHtml,
    },
    signature: {
      name: report.reported_by_name || '',
      credentials: radiologyReportDefaults.radiologist_credentials,
      datetime: signatureDatetime,
      status: signatureStatus,
    },
    system: {
      name: radiologyReportDefaults.system_name,
    },
  };
}

/**
 * Replace template placeholders with data values
 */
function replaceTemplatePlaceholders(
  template: string,
  data: Record<string, unknown>,
  prefix = ''
): string {
  let result = template;

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects
      result = replaceTemplatePlaceholders(result, value as Record<string, unknown>, fullKey);
    } else {
      // Replace placeholder
      const placeholder = new RegExp(`\\{\\{${fullKey}\\}\\}`, 'g');
      result = result.replace(placeholder, String(value ?? ''));
    }
  }

  return result;
}

/**
 * Print a radiology report
 *
 * @param data - Report data including report, patient, order, and facility info
 *
 * @example
 * ```typescript
 * printRadiologyReport({
 *   report: radiologyReport,
 *   patient: { full_name: 'John Doe', mrn: 'MRN-001', age: '45', sex: 'M' },
 *   order: { order_number: 'IMG-001', ordered_by_name: 'Dr. Smith', ... },
 *   facility: { name: 'City Hospital' },
 * });
 * ```
 */
export async function printRadiologyReport(data: PrintRadiologyReportData): Promise<void> {
  const { report } = data;

  // Build template data
  const templateData = buildTemplateData(data);

  // Generate QR code
  const qrContent = getRadiologyReportQRContent(report);
  const qrDataUri = await generateQRDataUri(qrContent.data, { size: 60 });

  // Replace placeholders in template
  let html = replaceTemplatePlaceholders(RADIOLOGY_REPORT_TEMPLATE, templateData);

  // Inject QR code images
  html = html.replace(/>QR<\/div>/g, `><img src="${qrDataUri}" alt="QR Code" /></div>`);

  // Build full document
  const fullHtml = buildPrintDocument(
    html,
    `Radiology Report - ${report.report_number}`,
    'a4',
    'default',
    RADIOLOGY_REPORT_CSS
  );

  // Open print window
  openPrintWindow(fullHtml);
}

export default printRadiologyReport;
