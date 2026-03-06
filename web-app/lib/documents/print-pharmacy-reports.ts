/**
 * Print Pharmacy Reports Utility
 *
 * Follows the same pattern as print-lab-analytics.ts:
 * - Uses dedicated templates + CSS
 * - Injects QR codes for verification/reference
 */

import type {
  DispensingReportRecord,
  StockSummaryItem,
  ExpiryReportItem,
} from '@/lib/types/pharmacy';
import type { FacilityInfo, LayoutType } from './types';
import {
  buildPrintDocument,
  escapeHtml,
  formatDate,
  openPrintWindow,
} from './renderer';
import {
  generateQRDataUri,
  getDispensingReportQRContent,
  getStockSummaryReportQRContent,
  getExpiryReportQRContent,
  getStockMovementReportQRContent,
  type QRContent,
} from '@/lib/utils/qr';
import {
  pharmacyReportDefaults,
  expiryStatusLabels,
  movementTypeLabels,
} from './schemas/pharmacy-reports.schema';

// =============================================================================
// TYPES
// =============================================================================

export interface PrintDispensingReportData {
  startDate: string;
  endDate: string;
  records: DispensingReportRecord[];
  groupByDrug?: boolean;
  groupedData?: Array<{ drug_name: string; total_qty: number; total_cost: number; count: number }>;
  facility?: Partial<FacilityInfo>;
  layout?: LayoutType;
  theme?: string;
}

export interface PrintStockSummaryReportData {
  items: StockSummaryItem[];
  showLowStockOnly?: boolean;
  facility?: Partial<FacilityInfo>;
  layout?: LayoutType;
  theme?: string;
}

export interface PrintExpiryReportData {
  batches: ExpiryReportItem[];
  thresholdDays: number;
  facility?: Partial<FacilityInfo>;
  layout?: LayoutType;
  theme?: string;
}

export interface StockMovement {
  drug_name: string;
  movement_type: 'RECEIVED' | 'DISPENSED' | 'ADJUSTED';
  quantity: number;
  date: string;
  reference: string;
  user: string;
}

export interface PrintStockMovementReportData {
  startDate: string;
  endDate: string;
  movements: StockMovement[];
  facility?: Partial<FacilityInfo>;
  layout?: LayoutType;
  theme?: string;
}

// =============================================================================
// SHARED CSS
// =============================================================================

const PHARMACY_REPORT_CSS = `
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.summary-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px;
  text-align: center;
}

.summary-card.warning { background: #fffbeb; border-color: #fde68a; }
.summary-card.critical { background: #fef2f2; border-color: #fecaca; }
.summary-card.success { background: #f0fdf4; border-color: #bbf7d0; }

.summary-label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 600; }
.summary-value { font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0; }
.summary-sub { font-size: 8px; color: #94a3b8; }

.summary-card.warning .summary-value { color: #d97706; }
.summary-card.critical .summary-value { color: #dc2626; }
.summary-card.success .summary-value { color: #16a34a; }

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

.text-right { text-align: right; }
.text-center { text-align: center; }

.badge {
  display: inline-block;
  padding: 2px 6px;
  font-size: 8px;
  font-weight: 600;
  border-radius: 4px;
  text-transform: uppercase;
}

.badge-expired { background: #fef2f2; color: #dc2626; }
.badge-critical { background: #fef2f2; color: #dc2626; }
.badge-warning { background: #fffbeb; color: #d97706; }
.badge-ok { background: #f0fdf4; color: #16a34a; }
.badge-low-stock { background: #fef2f2; color: #dc2626; }
.badge-received { background: #f0fdf4; color: #16a34a; }
.badge-dispensed { background: #dbeafe; color: #1e40af; }
.badge-adjusted { background: #fffbeb; color: #d97706; }

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
// DISPENSING REPORT
// =============================================================================

const DISPENSING_REPORT_TEMPLATE = `
<div class="report">
  <div class="header">
    <div class="facility">
      <h1>{{facility.name}}</h1>
      <p>{{facility.address}}</p>
      <p>Tel: {{facility.phone}}</p>
    </div>

    <div class="doc-meta">
      <div class="title">DISPENSING REPORT</div>
      <div>Period: {{period.start}} to {{period.end}}</div>
      <div>Generated: {{report.generated_at}}</div>
      <div class="qr">QR</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-label">Total Records</div>
      <div class="summary-value">{{summary.record_count}}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Dispensed</div>
      <div class="summary-value">{{summary.total_dispensed}}</div>
      <div class="summary-sub">units</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Value</div>
      <div class="summary-value">{{summary.total_value}}</div>
      <div class="summary-sub">KES</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dispensing Records</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Drug Name</th>
          <th style="width: 60px;">Qty</th>
          <th style="width: 80px;">Date</th>
          <th>Patient</th>
          <th>Dispensed By</th>
          <th style="width: 80px;">Cost</th>
        </tr>
      </thead>
      <tbody>
        {{records.rows}}
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

function buildDispensingRows(records: DispensingReportRecord[]): string {
  return records
    .map(
      (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.drug_name)}</td>
        <td class="text-right">${r.quantity_dispensed}</td>
        <td>${escapeHtml(r.dispensed_date)}</td>
        <td>${escapeHtml(r.patient_name)}</td>
        <td>${escapeHtml(r.dispensed_by)}</td>
        <td class="text-right">${escapeHtml(r.total_cost)}</td>
      </tr>
    `
    )
    .join('');
}

function buildDispensingTemplateData(data: PrintDispensingReportData): Record<string, unknown> {
  const totalDispensed = data.records.reduce((sum, r) => sum + r.quantity_dispensed, 0);
  const totalValue = data.records.reduce((sum, r) => sum + parseFloat(r.total_cost), 0);

  return {
    facility: {
      name: data.facility?.name || pharmacyReportDefaults.facility.name,
      address: data.facility?.address || pharmacyReportDefaults.facility.address,
      phone: data.facility?.phone || pharmacyReportDefaults.facility.phone,
    },
    period: {
      start: escapeHtml(formatDate(data.startDate)),
      end: escapeHtml(formatDate(data.endDate)),
    },
    report: {
      generated_at: escapeHtml(formatDate(new Date().toISOString())),
    },
    summary: {
      record_count: data.records.length,
      total_dispensed: totalDispensed.toLocaleString(),
      total_value: totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    records: {
      rows: buildDispensingRows(data.records),
    },
    system: {
      name: pharmacyReportDefaults.system_name,
    },
  };
}

export async function printDispensingReport(data: PrintDispensingReportData): Promise<void> {
  const templateData = buildDispensingTemplateData(data);

  const qrContent = getDispensingReportQRContent({
    startDate: data.startDate,
    endDate: data.endDate,
  });
  const qrDataUri = await generateQRDataUri(qrContent.data, { size: 60 });

  let html = replaceTemplatePlaceholders(DISPENSING_REPORT_TEMPLATE, templateData);
  html = html.replace(/>QR<\/div>/g, `><img src="${qrDataUri}" alt="QR Code" /></div>`);

  const title = `Dispensing Report - ${data.startDate} to ${data.endDate}`;
  const fullHtml = buildPrintDocument(
    html,
    title,
    data.layout || 'a4',
    data.theme || 'default',
    PHARMACY_REPORT_CSS
  );

  openPrintWindow(fullHtml);
}

// =============================================================================
// STOCK SUMMARY REPORT
// =============================================================================

const STOCK_SUMMARY_TEMPLATE = `
<div class="report">
  <div class="header">
    <div class="facility">
      <h1>{{facility.name}}</h1>
      <p>{{facility.address}}</p>
      <p>Tel: {{facility.phone}}</p>
    </div>

    <div class="doc-meta">
      <div class="title">STOCK SUMMARY REPORT</div>
      <div>Generated: {{report.generated_at}}</div>
      <div class="qr">QR</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-label">Total Items</div>
      <div class="summary-value">{{summary.total_items}}</div>
    </div>
    <div class="summary-card {{summary.low_stock_class}}">
      <div class="summary-label">Low Stock</div>
      <div class="summary-value">{{summary.low_stock_count}}</div>
      <div class="summary-sub">below reorder level</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Quantity</div>
      <div class="summary-value">{{summary.total_quantity}}</div>
      <div class="summary-sub">units in stock</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Inventory Items</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Drug Name</th>
          <th style="width: 100px;">Total Qty</th>
          <th style="width: 100px;">Reorder Level</th>
          <th style="width: 80px;">Batches</th>
          <th style="width: 80px;">Status</th>
        </tr>
      </thead>
      <tbody>
        {{items.rows}}
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

function buildStockSummaryRows(items: StockSummaryItem[]): string {
  return items
    .map(
      (item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(item.drug_name)}</td>
        <td class="text-right">${item.total_quantity}</td>
        <td class="text-right">${item.reorder_level}</td>
        <td class="text-center">${item.batches.length}</td>
        <td class="text-center">
          ${item.is_below_reorder ? '<span class="badge badge-low-stock">Low Stock</span>' : '<span class="badge badge-ok">OK</span>'}
        </td>
      </tr>
    `
    )
    .join('');
}

function buildStockSummaryTemplateData(data: PrintStockSummaryReportData): Record<string, unknown> {
  const lowStockCount = data.items.filter((item) => item.is_below_reorder).length;
  const totalQuantity = data.items.reduce((sum, item) => sum + item.total_quantity, 0);

  return {
    facility: {
      name: data.facility?.name || pharmacyReportDefaults.facility.name,
      address: data.facility?.address || pharmacyReportDefaults.facility.address,
      phone: data.facility?.phone || pharmacyReportDefaults.facility.phone,
    },
    report: {
      generated_at: escapeHtml(formatDate(new Date().toISOString())),
    },
    summary: {
      total_items: data.items.length,
      low_stock_count: lowStockCount,
      low_stock_class: lowStockCount > 0 ? 'warning' : 'success',
      total_quantity: totalQuantity.toLocaleString(),
    },
    items: {
      rows: buildStockSummaryRows(data.items),
    },
    system: {
      name: pharmacyReportDefaults.system_name,
    },
  };
}

export async function printStockSummaryReport(data: PrintStockSummaryReportData): Promise<void> {
  const templateData = buildStockSummaryTemplateData(data);

  const qrContent = getStockSummaryReportQRContent({
    generatedAt: new Date().toISOString().split('T')[0]!,
  });
  const qrDataUri = await generateQRDataUri(qrContent.data, { size: 60 });

  let html = replaceTemplatePlaceholders(STOCK_SUMMARY_TEMPLATE, templateData);
  html = html.replace(/>QR<\/div>/g, `><img src="${qrDataUri}" alt="QR Code" /></div>`);

  const title = `Stock Summary Report - ${formatDate(new Date().toISOString())}`;
  const fullHtml = buildPrintDocument(
    html,
    title,
    data.layout || 'a4',
    data.theme || 'default',
    PHARMACY_REPORT_CSS
  );

  openPrintWindow(fullHtml);
}

// =============================================================================
// EXPIRY REPORT
// =============================================================================

const EXPIRY_REPORT_TEMPLATE = `
<div class="report">
  <div class="header">
    <div class="facility">
      <h1>{{facility.name}}</h1>
      <p>{{facility.address}}</p>
      <p>Tel: {{facility.phone}}</p>
    </div>

    <div class="doc-meta">
      <div class="title">EXPIRY REPORT</div>
      <div>Threshold: {{report.threshold_days}} days</div>
      <div>Generated: {{report.generated_at}}</div>
      <div class="qr">QR</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-label">Total Batches</div>
      <div class="summary-value">{{summary.total_batches}}</div>
    </div>
    <div class="summary-card {{summary.expired_class}}">
      <div class="summary-label">Expired</div>
      <div class="summary-value">{{summary.expired_count}}</div>
    </div>
    <div class="summary-card {{summary.critical_class}}">
      <div class="summary-label">Critical</div>
      <div class="summary-value">{{summary.critical_count}}</div>
      <div class="summary-sub">≤30 days</div>
    </div>
    <div class="summary-card {{summary.warning_class}}">
      <div class="summary-label">Warning</div>
      <div class="summary-value">{{summary.warning_count}}</div>
      <div class="summary-sub">≤60 days</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Expiring Batches</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Drug Name</th>
          <th style="width: 90px;">Batch No.</th>
          <th style="width: 80px;">Qty</th>
          <th style="width: 90px;">Expiry Date</th>
          <th style="width: 70px;">Days Left</th>
          <th style="width: 70px;">Status</th>
        </tr>
      </thead>
      <tbody>
        {{batches.rows}}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div class="footer-notes">
      <p>Generated by {{system.name}}.</p>
      <p>Action required: Review and dispose expired stock per facility protocols.</p>
    </div>
    <div class="qr">QR</div>
  </div>
</div>
`;

function getExpiryBadgeClass(status: string): string {
  switch (status) {
    case 'EXPIRED':
      return 'badge-expired';
    case 'CRITICAL':
      return 'badge-critical';
    case 'WARNING':
      return 'badge-warning';
    default:
      return 'badge-ok';
  }
}

function buildExpiryRows(batches: ExpiryReportItem[]): string {
  return batches
    .map(
      (b, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(b.drug_name)}</td>
        <td>${escapeHtml(b.batch_number)}</td>
        <td class="text-right">${b.quantity_available}</td>
        <td>${escapeHtml(b.expiry_date)}</td>
        <td class="text-right">${b.days_to_expiry}</td>
        <td class="text-center">
          <span class="badge ${getExpiryBadgeClass(b.status)}">${expiryStatusLabels[b.status] || b.status}</span>
        </td>
      </tr>
    `
    )
    .join('');
}

function buildExpiryTemplateData(data: PrintExpiryReportData): Record<string, unknown> {
  const expiredCount = data.batches.filter((b) => b.status === 'EXPIRED').length;
  const criticalCount = data.batches.filter((b) => b.status === 'CRITICAL').length;
  const warningCount = data.batches.filter((b) => b.status === 'WARNING').length;

  return {
    facility: {
      name: data.facility?.name || pharmacyReportDefaults.facility.name,
      address: data.facility?.address || pharmacyReportDefaults.facility.address,
      phone: data.facility?.phone || pharmacyReportDefaults.facility.phone,
    },
    report: {
      threshold_days: data.thresholdDays,
      generated_at: escapeHtml(formatDate(new Date().toISOString())),
    },
    summary: {
      total_batches: data.batches.length,
      expired_count: expiredCount,
      expired_class: expiredCount > 0 ? 'critical' : '',
      critical_count: criticalCount,
      critical_class: criticalCount > 0 ? 'critical' : '',
      warning_count: warningCount,
      warning_class: warningCount > 0 ? 'warning' : '',
    },
    batches: {
      rows: buildExpiryRows(data.batches),
    },
    system: {
      name: pharmacyReportDefaults.system_name,
    },
  };
}

export async function printExpiryReport(data: PrintExpiryReportData): Promise<void> {
  const templateData = buildExpiryTemplateData(data);

  const qrContent = getExpiryReportQRContent({
    thresholdDays: data.thresholdDays,
    generatedAt: new Date().toISOString().split('T')[0]!,
  });
  const qrDataUri = await generateQRDataUri(qrContent.data, { size: 60 });

  let html = replaceTemplatePlaceholders(EXPIRY_REPORT_TEMPLATE, templateData);
  html = html.replace(/>QR<\/div>/g, `><img src="${qrDataUri}" alt="QR Code" /></div>`);

  const title = `Expiry Report - ${data.thresholdDays} Days Threshold`;
  const fullHtml = buildPrintDocument(
    html,
    title,
    data.layout || 'a4',
    data.theme || 'default',
    PHARMACY_REPORT_CSS
  );

  openPrintWindow(fullHtml);
}

// =============================================================================
// STOCK MOVEMENT REPORT
// =============================================================================

const STOCK_MOVEMENT_TEMPLATE = `
<div class="report">
  <div class="header">
    <div class="facility">
      <h1>{{facility.name}}</h1>
      <p>{{facility.address}}</p>
      <p>Tel: {{facility.phone}}</p>
    </div>

    <div class="doc-meta">
      <div class="title">STOCK MOVEMENT REPORT</div>
      <div>Period: {{period.start}} to {{period.end}}</div>
      <div>Generated: {{report.generated_at}}</div>
      <div class="qr">QR</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card success">
      <div class="summary-label">Total In</div>
      <div class="summary-value">{{summary.total_in}}</div>
      <div class="summary-sub">units received</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Out</div>
      <div class="summary-value">{{summary.total_out}}</div>
      <div class="summary-sub">units dispensed/adjusted</div>
    </div>
    <div class="summary-card {{summary.net_class}}">
      <div class="summary-label">Net Movement</div>
      <div class="summary-value">{{summary.net_movement}}</div>
      <div class="summary-sub">{{summary.net_label}}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Movements</div>
      <div class="summary-value">{{summary.movement_count}}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Movement Records</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th style="width: 80px;">Date</th>
          <th>Drug Name</th>
          <th style="width: 80px;">Type</th>
          <th style="width: 70px;">Qty</th>
          <th>Reference</th>
          <th>User</th>
        </tr>
      </thead>
      <tbody>
        {{movements.rows}}
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

function getMovementBadgeClass(type: string): string {
  switch (type) {
    case 'RECEIVED':
      return 'badge-received';
    case 'DISPENSED':
      return 'badge-dispensed';
    case 'ADJUSTED':
      return 'badge-adjusted';
    default:
      return '';
  }
}

function buildMovementRows(movements: StockMovement[]): string {
  return movements
    .map(
      (m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(m.date)}</td>
        <td>${escapeHtml(m.drug_name)}</td>
        <td class="text-center">
          <span class="badge ${getMovementBadgeClass(m.movement_type)}">${movementTypeLabels[m.movement_type] || m.movement_type}</span>
        </td>
        <td class="text-right">${m.quantity}</td>
        <td>${escapeHtml(m.reference)}</td>
        <td>${escapeHtml(m.user)}</td>
      </tr>
    `
    )
    .join('');
}

function buildMovementTemplateData(data: PrintStockMovementReportData): Record<string, unknown> {
  const totalIn = data.movements
    .filter((m) => m.movement_type === 'RECEIVED')
    .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  const totalOut = data.movements
    .filter((m) => m.movement_type !== 'RECEIVED')
    .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  const netMovement = totalIn - totalOut;

  return {
    facility: {
      name: data.facility?.name || pharmacyReportDefaults.facility.name,
      address: data.facility?.address || pharmacyReportDefaults.facility.address,
      phone: data.facility?.phone || pharmacyReportDefaults.facility.phone,
    },
    period: {
      start: escapeHtml(formatDate(data.startDate)),
      end: escapeHtml(formatDate(data.endDate)),
    },
    report: {
      generated_at: escapeHtml(formatDate(new Date().toISOString())),
    },
    summary: {
      total_in: totalIn.toLocaleString(),
      total_out: totalOut.toLocaleString(),
      net_movement: (netMovement >= 0 ? '+' : '') + netMovement.toLocaleString(),
      net_class: netMovement >= 0 ? 'success' : 'warning',
      net_label: netMovement >= 0 ? 'net increase' : 'net decrease',
      movement_count: data.movements.length,
    },
    movements: {
      rows: buildMovementRows(data.movements),
    },
    system: {
      name: pharmacyReportDefaults.system_name,
    },
  };
}

export async function printStockMovementReport(data: PrintStockMovementReportData): Promise<void> {
  const templateData = buildMovementTemplateData(data);

  const qrContent = getStockMovementReportQRContent({
    startDate: data.startDate,
    endDate: data.endDate,
  });
  const qrDataUri = await generateQRDataUri(qrContent.data, { size: 60 });

  let html = replaceTemplatePlaceholders(STOCK_MOVEMENT_TEMPLATE, templateData);
  html = html.replace(/>QR<\/div>/g, `><img src="${qrDataUri}" alt="QR Code" /></div>`);

  const title = `Stock Movement Report - ${data.startDate} to ${data.endDate}`;
  const fullHtml = buildPrintDocument(
    html,
    title,
    data.layout || 'a4',
    data.theme || 'default',
    PHARMACY_REPORT_CSS
  );

  openPrintWindow(fullHtml);
}

// =============================================================================
// UTILITY FUNCTIONS
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
