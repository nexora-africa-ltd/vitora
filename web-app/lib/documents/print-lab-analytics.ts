/**
 * Print Laboratory Analytics Report Utility
 *
 * Follows the same pattern as print-lab-report.ts:
 * - Uses a dedicated template + CSS
 * - Injects a QR code for verification/reference
 */

import type {
  TurnaroundTimeReport,
  WorkloadReport,
  CriticalValuesReport,
  SampleRejectionReport,
} from '@/lib/types/laboratory';
import type { FacilityInfo, LayoutType } from './types';
import {
  buildPrintDocument,
  escapeHtml,
  formatDate,
  openPrintWindow,
} from './renderer';
import {
  generateQRDataUri,
  getLabAnalyticsQRContent,
  type QRContent,
} from '@/lib/utils/qr';
import {
  labAnalyticsDefaults,
  getCriticalClass,
  getRejectionClass,
} from './schemas/lab-analytics.schema';

// =============================================================================
// TYPES
// =============================================================================

export interface PrintLabAnalyticsData {
  /** Date range start (YYYY-MM-DD) */
  startDate: string;
  /** Date range end (YYYY-MM-DD) */
  endDate: string;
  /** Date preset label (e.g., "Last 7 Days") */
  presetLabel?: string;
  /** Turnaround time report data */
  turnaroundTime?: TurnaroundTimeReport;
  /** Workload report data */
  workload?: WorkloadReport;
  /** Critical values report data */
  criticalValues?: CriticalValuesReport;
  /** Sample rejection report data */
  sampleRejection?: SampleRejectionReport;
  /** Facility information */
  facility?: Partial<FacilityInfo>;
  /** Layout type */
  layout?: LayoutType;
  /** Theme */
  theme?: string;
}

// =============================================================================
// TEMPLATE
// =============================================================================

const LAB_ANALYTICS_TEMPLATE = `
<div class="report">
  <div class="header">
    <div class="facility">
      <h1>{{facility.name}}</h1>
      <p>{{facility.address}}</p>
      <p>Tel: {{facility.phone}}</p>
    </div>

    <div class="doc-meta">
      <div class="title">LABORATORY ANALYTICS REPORT</div>
      <div>Period: {{period.label}}</div>
      <div>{{period.start}} to {{period.end}}</div>
      <div>Generated: {{report.generated_at}}</div>
      <div class="qr">QR</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Avg Turnaround Time</div>
      <div class="kpi-value">{{kpi.avg_tat}}</div>
      <div class="kpi-sub">{{kpi.results_verified}} results verified</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tests Processed</div>
      <div class="kpi-value">{{kpi.tests_verified}}</div>
      <div class="kpi-sub">{{kpi.tests_entered}} entered</div>
    </div>
    <div class="kpi-card {{kpi.critical_class}}">
      <div class="kpi-label">Critical Values</div>
      <div class="kpi-value">{{kpi.critical_count}}</div>
      <div class="kpi-sub">Requires attention</div>
    </div>
    <div class="kpi-card {{kpi.rejection_class}}">
      <div class="kpi-label">Rejection Rate</div>
      <div class="kpi-value">{{kpi.rejection_rate}}</div>
      <div class="kpi-sub">{{kpi.rejected_orders}} of {{kpi.total_orders}}</div>
    </div>
  </div>

  <div class="section" style="{{tat.display}}">
    <div class="section-title">Turnaround Time by Test</div>
    <table>
      <thead>
        <tr>
          <th>Test Code</th>
          <th>Test Name</th>
          <th style="width: 100px;">Result Count</th>
          <th style="width: 100px;">Avg TAT (hrs)</th>
        </tr>
      </thead>
      <tbody>
        {{tat.rows}}
      </tbody>
    </table>
  </div>

  <div class="section" style="{{tat_priority.display}}">
    <div class="section-title">Turnaround Time by Priority</div>
    <table>
      <thead>
        <tr>
          <th>Priority</th>
          <th style="width: 120px;">Result Count</th>
          <th style="width: 120px;">Avg TAT (hrs)</th>
        </tr>
      </thead>
      <tbody>
        {{tat_priority.rows}}
      </tbody>
    </table>
  </div>

  <div class="section" style="{{workload.display}}">
    <div class="section-title">Workload by Technician</div>
    <table>
      <thead>
        <tr>
          <th>Technician</th>
          <th style="width: 120px;">Tests Entered</th>
          <th style="width: 120px;">Tests Verified</th>
        </tr>
      </thead>
      <tbody>
        {{workload.rows}}
      </tbody>
    </table>
  </div>

  <div class="section" style="{{critical.display}}">
    <div class="section-title">Critical Values by Test</div>
    <table>
      <thead>
        <tr>
          <th>Test Code</th>
          <th>Test Name</th>
          <th style="width: 120px;">Critical Count</th>
        </tr>
      </thead>
      <tbody>
        {{critical.rows}}
      </tbody>
    </table>
  </div>

  <div class="section" style="{{rejection.display}}">
    <div class="section-title">Sample Rejection Reasons</div>
    <table>
      <thead>
        <tr>
          <th>Reason</th>
          <th style="width: 120px;">Count</th>
          <th style="width: 100px;">Percentage</th>
        </tr>
      </thead>
      <tbody>
        {{rejection.rows}}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div class="footer-notes">
      <p>Generated by {{system.name}}.</p>
      <p>This report is for internal use only.</p>
    </div>
    <div class="qr">QR</div>
  </div>
</div>
`;

const LAB_ANALYTICS_CSS = `
@page { size: A4; margin: 12mm; }

body {
  font-family: "Inter", Arial, sans-serif;
  margin: 0;
  padding: 0;
  color: #111;
  font-size: 10px;
  line-height: 1.4;
  background: #fff;
}

.report {
  max-width: 185mm;
  margin: auto;
  padding: 10mm;
}

.header {
  display: flex;
  justify-content: space-between;
  border-bottom: 2px solid #1a365d;
  padding-bottom: 10px;
  margin-bottom: 14px;
}

.facility h1 { margin: 0; font-size: 14px; color: #1a365d; }
.facility p { margin: 2px 0; font-size: 9px; color: #555; }

.doc-meta { text-align: right; font-size: 9px; }
.doc-meta .title { font-size: 12px; font-weight: 700; color: #1a365d; margin-bottom: 4px; }

.qr {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  margin-top: 6px;
}

.qr img { width: 60px; height: 60px; }

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.kpi-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px;
  text-align: center;
}

.kpi-card.critical { background: #fef2f2; border-color: #fecaca; }
.kpi-card.warning { background: #fffbeb; border-color: #fde68a; }
.kpi-card.success { background: #f0fdf4; border-color: #bbf7d0; }

.kpi-label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 600; }
.kpi-value { font-size: 20px; font-weight: 700; color: #1e293b; margin: 4px 0; }
.kpi-sub { font-size: 8px; color: #94a3b8; }

.kpi-card.critical .kpi-value { color: #dc2626; }
.kpi-card.warning .kpi-value { color: #d97706; }
.kpi-card.success .kpi-value { color: #16a34a; }

.section { margin-bottom: 14px; page-break-inside: avoid; }
.section-title {
  font-size: 10px;
  font-weight: 700;
  color: #1a365d;
  text-transform: uppercase;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 4px;
  margin-bottom: 6px;
}

table { width: 100%; border-collapse: collapse; font-size: 9px; }

th, td {
  border: 1px solid #e2e8f0;
  padding: 6px 8px;
  vertical-align: top;
}

th {
  background: #f1f5f9;
  text-align: left;
  font-weight: 600;
  color: #334155;
}

td { color: #475569; }

.footer {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  font-size: 8px;
  color: #94a3b8;
}

.footer-notes { max-width: 60%; }
.footer-notes p { margin: 2px 0; }
`;

// =============================================================================
// TEMPLATE DATA BUILDERS
// =============================================================================

function replaceTemplatePlaceholders(
  template: string,
  data: Record<string, unknown>,
  prefix = ''
): string {
  let result = template;

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result = replaceTemplatePlaceholders(result, value as Record<string, unknown>, fullKey);
    } else {
      const placeholder = new RegExp(`\\{\\{${fullKey}\\}\\}`, 'g');
      result = result.replace(placeholder, String(value ?? ''));
    }
  }

  return result;
}

function buildTatRows(data?: TurnaroundTimeReport): { rows: string; display: string } {
  if (!data || data.by_test.length === 0) {
    return { rows: '', display: 'display:none;' };
  }

  const rows = data.by_test
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.test_code)}</td>
        <td>${escapeHtml(item.test_name)}</td>
        <td style="text-align: right;">${item.result_count}</td>
        <td style="text-align: right;">${item.avg_tat_hours !== null ? Math.round(item.avg_tat_hours * 10) / 10 : 'N/A'}</td>
      </tr>
    `
    )
    .join('');

  return { rows, display: '' };
}

function buildTatPriorityRows(data?: TurnaroundTimeReport): { rows: string; display: string } {
  if (!data || data.by_priority.length === 0) {
    return { rows: '', display: 'display:none;' };
  }

  const rows = data.by_priority
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.priority)}</td>
        <td style="text-align: right;">${item.result_count}</td>
        <td style="text-align: right;">${item.avg_tat_hours !== null ? Math.round(item.avg_tat_hours * 10) / 10 : 'N/A'}</td>
      </tr>
    `
    )
    .join('');

  return { rows, display: '' };
}

function buildWorkloadRows(data?: WorkloadReport): { rows: string; display: string } {
  if (!data || data.by_technician.length === 0) {
    return { rows: '', display: 'display:none;' };
  }

  const rows = data.by_technician
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.technician_name)}</td>
        <td style="text-align: right;">${item.entered_count}</td>
        <td style="text-align: right;">${item.verified_count}</td>
      </tr>
    `
    )
    .join('');

  return { rows, display: '' };
}

function buildCriticalRows(data?: CriticalValuesReport): { rows: string; display: string } {
  if (!data || data.by_test.length === 0) {
    return { rows: '', display: 'display:none;' };
  }

  const rows = data.by_test
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.test_code)}</td>
        <td>${escapeHtml(item.test_name)}</td>
        <td style="text-align: right;">${item.critical_count}</td>
      </tr>
    `
    )
    .join('');

  return { rows, display: '' };
}

function buildRejectionRows(data?: SampleRejectionReport): { rows: string; display: string } {
  if (!data || data.reasons.length === 0) {
    return { rows: '', display: 'display:none;' };
  }

  const total = data.reasons.reduce((sum, r) => sum + r.count, 0);

  const rows = data.reasons
    .map((item) => {
      const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
      return `
      <tr>
        <td>${escapeHtml(item.reason)}</td>
        <td style="text-align: right;">${item.count}</td>
        <td style="text-align: right;">${pct}%</td>
      </tr>
    `;
    })
    .join('');

  return { rows, display: '' };
}

function buildTemplateData(data: PrintLabAnalyticsData): Record<string, unknown> {
  const { turnaroundTime, workload, criticalValues, sampleRejection } = data;

  const avgTat = turnaroundTime?.overall.avg_result_tat_hours;
  const rejectionRate = sampleRejection?.rejection_rate ?? 0;
  const criticalCount = criticalValues?.total_critical ?? 0;

  const tatSection = buildTatRows(turnaroundTime);
  const tatPrioritySection = buildTatPriorityRows(turnaroundTime);
  const workloadSection = buildWorkloadRows(workload);
  const criticalSection = buildCriticalRows(criticalValues);
  const rejectionSection = buildRejectionRows(sampleRejection);

  // Determine KPI card classes based on values
  const criticalClass = getCriticalClass(criticalCount);
  const rejectionClass = getRejectionClass(rejectionRate);

  return {
    facility: {
      name: data.facility?.name || labAnalyticsDefaults.facility.name,
      address: data.facility?.address || labAnalyticsDefaults.facility.address,
      phone: data.facility?.phone || labAnalyticsDefaults.facility.phone,
    },
    period: {
      label: escapeHtml(data.presetLabel || 'Custom Period'),
      start: escapeHtml(formatDate(data.startDate)),
      end: escapeHtml(formatDate(data.endDate)),
    },
    report: {
      generated_at: escapeHtml(formatDate(new Date().toISOString())),
    },
    kpi: {
      avg_tat: avgTat !== null ? `${Math.round((avgTat ?? 0) * 10) / 10}h` : 'N/A',
      results_verified: turnaroundTime?.overall.results_verified ?? 0,
      tests_verified: workload?.totals.tests_verified ?? 0,
      tests_entered: workload?.totals.tests_entered ?? 0,
      critical_count: criticalCount,
      critical_class: criticalClass,
      rejection_rate: `${Math.round(rejectionRate * 100) / 100}%`,
      rejected_orders: sampleRejection?.rejected_orders ?? 0,
      total_orders: sampleRejection?.total_orders ?? 0,
      rejection_class: rejectionClass,
    },
    tat: tatSection,
    tat_priority: tatPrioritySection,
    workload: workloadSection,
    critical: criticalSection,
    rejection: rejectionSection,
    system: {
      name: labAnalyticsDefaults.system_name,
    },
  };
}

function getAnalyticsQRContent(data: PrintLabAnalyticsData): QRContent {
  return getLabAnalyticsQRContent({
    startDate: data.startDate,
    endDate: data.endDate,
  });
}

// =============================================================================
// PRINT
// =============================================================================

export async function printLabAnalytics(data: PrintLabAnalyticsData): Promise<void> {
  const templateData = buildTemplateData(data);

  const qrContent = getAnalyticsQRContent(data);
  const qrDataUri = await generateQRDataUri(qrContent.data, { size: 60 });

  let html = replaceTemplatePlaceholders(LAB_ANALYTICS_TEMPLATE, templateData);
  html = html.replace(/>QR<\/div>/g, `><img src="${qrDataUri}" alt="QR Code" /></div>`);

  const title = `Lab Analytics Report - ${data.startDate} to ${data.endDate}`;
  const fullHtml = buildPrintDocument(
    html,
    title,
    data.layout || 'a4',
    data.theme || 'default',
    LAB_ANALYTICS_CSS
  );

  openPrintWindow(fullHtml);
}

export default printLabAnalytics;
