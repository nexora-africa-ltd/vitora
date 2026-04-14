/**
 * Print Labour Partograph Utility
 *
 * Uses the same dedicated-template approach as other printable clinical documents.
 */

import type { LabourPartograph, LabourPartographObservation, MCHRegistration } from '@/lib/types/mch';
import type { FacilityInfo, LayoutType } from './types';
import {
  buildPrintDocument,
  escapeHtml,
  formatDate,
  formatDateTime,
  openPrintWindow,
} from './renderer';
import { generateQRDataUri, type QRContent } from '@/lib/utils/qr';
import {
  partographReportDefaults,
  partographReportStatusClasses,
  partographReportStatusLabels,
} from './schemas/partograph-report.schema';

export interface PrintPartographReportData {
  registration: MCHRegistration;
  partograph: LabourPartograph;
  observations: LabourPartographObservation[];
  facility?: Partial<FacilityInfo>;
  layout?: LayoutType;
  theme?: string;
  verificationUrl?: string;
}

const PARTOGRAPH_REPORT_TEMPLATE = `
<div class="report">
  <div class="header">
    <div class="facility">
      <h1>{{facility.name}}</h1>
      <p>{{facility.address}}</p>
      <p>Tel: {{facility.phone}}</p>
      <p>License: {{facility.license}}</p>
    </div>

    <div class="doc-meta">
      <div class="title">LABOUR PARTOGRAPH</div>
      <div>MCH No: {{registration.mch_number}}</div>
      <div>Started: {{partograph.started_at}}</div>
      <div class="status-badge {{partograph.status_class}}">{{partograph.status_label}}</div>
      <div class="qr">QR</div>
    </div>
  </div>

  <div class="patient-info">
    <div class="row"><span class="label">Mother:</span><span class="value">{{registration.mother_name}}</span></div>
    <div class="row"><span class="label">MRN:</span><span class="value">{{registration.mother_mrn}}</span></div>
    <div class="row"><span class="label">Registered:</span><span class="value">{{registration.registration_date}}</span></div>
    <div class="row"><span class="label">Gestation:</span><span class="value">{{registration.gestation}}</span></div>
    <div class="row"><span class="label">Parity:</span><span class="value">{{partograph.parity}}</span></div>
    <div class="row"><span class="label">Membranes:</span><span class="value">{{partograph.membranes}}</span></div>
    <div class="row"><span class="label">Liquor:</span><span class="value">{{partograph.liquor}}</span></div>
    <div class="row"><span class="label">Completed:</span><span class="value">{{partograph.completed_at}}</span></div>
  </div>

  <div class="grid-summary">
    <div class="summary-card">
      <div class="summary-label">Observations</div>
      <div class="summary-value">{{summary.total_observations}}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Latest FHR</div>
      <div class="summary-value">{{summary.latest_fhr}}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Latest Dilation</div>
      <div class="summary-value">{{summary.latest_dilation}}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Latest Contractions</div>
      <div class="summary-value">{{summary.latest_contractions}}</div>
    </div>
  </div>

  <div class="critical-alert" style="{{alerts.display}}">
    <h3>Alerts</h3>
    <p>{{summary.latest_alerts}}</p>
  </div>

  <div class="section" style="{{notes.display}}">
    <div class="section-title">Labour Notes</div>
    <div class="section-content">{{partograph.notes}}</div>
  </div>

  <div class="section" style="{{registrationNotes.display}}">
    <div class="section-title">Registration Notes / Risk Factors</div>
    <div class="section-content">{{registration.risk_factors}}</div>
    <div class="section-content secondary">{{registration.notes}}</div>
  </div>

  <div class="section cervicograph-section" style="{{cervicograph.display}}">
    <div class="section-title">Cervicograph</div>
    <div class="cervicograph-container">
      {{cervicograph.svg}}
    </div>
    <div class="cervicograph-legend">
      <span class="legend-item"><svg width="18" height="6" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="3" x2="18" y2="3" stroke="#0d9488" stroke-width="2"/></svg> Dilation</span>
      <span class="legend-item"><svg width="18" height="6" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="3" x2="18" y2="3" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="8 4"/></svg> Alert Line</span>
      <span class="legend-item"><svg width="18" height="6" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="3" x2="18" y2="3" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="3 3"/></svg> Action Line</span>
      <span class="legend-item"><svg width="18" height="6" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="3" x2="18" y2="3" stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="4 1 1 1"/><rect x="7" y="1" width="4" height="4" fill="#7c3aed"/></svg> Descent</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Observation Timeline</div>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>FHR</th>
          <th>Dilation</th>
          <th>Descent</th>
          <th>Moulding</th>
          <th>Contractions</th>
          <th>Maternal</th>
          <th>Urine</th>
          <th>Interventions</th>
        </tr>
      </thead>
      <tbody>
        {{observations.rows}}
      </tbody>
    </table>
  </div>

  <div class="signature-block">
    <div class="signature-line">
      <div>
        <div class="signature-name">{{signature.name}}</div>
        <div class="signature-credentials">{{signature.credentials}}</div>
      </div>
      <div>
        <div class="signature-date">{{signature.datetime}}</div>
        <div class="electronic-signature">{{signature.status}}</div>
      </div>
    </div>
    <div class="signature-line patient-signature">
      <div>
        <div class="signature-placeholder"></div>
        <div class="signature-credentials">Patient / Guardian Signature</div>
      </div>
      <div>
        <div class="signature-placeholder"></div>
        <div class="signature-credentials">Date</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-notes">
      <p>Generated by {{system.name}}. Scan the QR Code to verify authenticity.</p>
    </div>
    <div class="qr">QR</div>
  </div>
</div>
`;

const PARTOGRAPH_REPORT_CSS = `
@page { size: A4; margin: 12mm; }

body {
  font-family: "Inter", Arial, sans-serif;
  margin: 0;
  padding: 0;
  color: #111827;
  font-size: 11px;
  line-height: 1.45;
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
  gap: 18px;
  border-bottom: 2px solid #0f766e;
  padding-bottom: 12px;
  margin-bottom: 14px;
}

.facility h1 { margin: 0; font-size: 16px; color: #0f172a; }
.facility p { margin: 2px 0; font-size: 10px; color: #475569; }

.doc-meta { text-align: right; font-size: 10px; }
.doc-meta .title { font-size: 14px; font-weight: 700; color: #0f766e; margin-bottom: 4px; }

.status-badge {
  display: inline-block;
  padding: 3px 8px;
  font-size: 9px;
  font-weight: 700;
  border-radius: 999px;
  text-transform: uppercase;
  margin-top: 6px;
}

.status-active { background: #d1fae5; color: #065f46; }
.status-completed { background: #dbeafe; color: #1d4ed8; }
.status-referred { background: #fef3c7; color: #92400e; }

.patient-info {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 20px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 14px;
  page-break-inside: avoid;
}

.patient-info .row { display: flex; gap: 6px; page-break-inside: avoid; }
.label { font-weight: 600; color: #64748b; }
.value { color: #0f172a; }

.grid-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.summary-card {
  border: 1px solid #dbe4ec;
  border-radius: 6px;
  padding: 10px;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

.summary-label { font-size: 10px; color: #64748b; }
.summary-value { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 4px; }

.critical-alert {
  background: #fff7ed;
  border: 1px solid #fb923c;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 14px;
}

.critical-alert h3 { margin: 0 0 4px; font-size: 12px; color: #c2410c; }
.critical-alert p { margin: 0; color: #9a3412; }

.section { margin-bottom: 14px; }
.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #0f766e;
  text-transform: uppercase;
  border-bottom: 1px solid #dbe4ec;
  padding-bottom: 4px;
  margin-bottom: 8px;
}

.section-content { white-space: pre-wrap; color: #334155; }
.section-content.secondary { margin-top: 6px; color: #64748b; }

table { width: 100%; border-collapse: collapse; font-size: 10px; }
th, td { border: 1px solid #dbe4ec; padding: 7px; vertical-align: top; }
th { background: #eff6ff; text-align: left; font-weight: 700; color: #1e3a8a; }
thead { display: table-header-group; }
tbody { display: table-row-group; }

.signature-block {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid #dbe4ec;
  page-break-inside: avoid;
}

.signature-line {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.signature-name { font-weight: 600; font-size: 11px; }
.signature-credentials, .signature-date { font-size: 10px; color: #64748b; }
.electronic-signature { font-size: 9px; color: #16a34a; font-style: italic; }
.signature-placeholder { width: 160px; border-bottom: 1px solid #94a3b8; height: 24px; }
.patient-signature { margin-top: 16px; }

.footer {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px solid #dbe4ec;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  font-size: 9px;
  color: #64748b;
}

.footer-notes { max-width: 70%; }

.qr {
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr img { width: 70px; height: 70px; }

.cervicograph-section { page-break-inside: avoid; }
.cervicograph-container { text-align: center; margin: 8px 0; }
.cervicograph-container svg { max-width: 100%; height: auto; }
.cervicograph-legend {
  display: flex;
  gap: 16px;
  justify-content: center;
  font-size: 9px;
  color: #475569;
  margin-top: 4px;
}
.legend-item { display: flex; align-items: center; gap: 4px; }
.legend-item svg { display: inline-block; flex-shrink: 0; }

@media print {
  .cervicograph-container svg,
  .cervicograph-legend svg {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
}
`;

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

function buildObservationRows(observations: LabourPartographObservation[]): string {
  return observations
    .map((observation) => {
      const contractionText = observation.contractions_per_10_min != null
        ? `${observation.contractions_per_10_min}/10 min${observation.contraction_duration_seconds != null ? ` x ${observation.contraction_duration_seconds}s` : ''}${observation.contraction_intensity ? ` (${observation.contraction_intensity.toLowerCase()})` : ''}`
        : '—';
      const maternalText = [
        observation.maternal_pulse != null ? `P ${observation.maternal_pulse}` : null,
        observation.maternal_blood_pressure ? `BP ${observation.maternal_blood_pressure}` : null,
        observation.maternal_temperature != null ? `T ${observation.maternal_temperature}°C` : null,
      ].filter(Boolean).join(' · ') || '—';
      const urineText = [
        observation.urine_volume_ml != null ? `${observation.urine_volume_ml} mL` : null,
        observation.urine_protein ? `Prot ${observation.urine_protein}` : null,
        observation.urine_acetone ? `Ace ${observation.urine_acetone}` : null,
      ].filter(Boolean).join(' · ') || '—';
      const interventions = [
        observation.oxytocin_drops_per_min != null ? `Oxytocin ${observation.oxytocin_drops_per_min} dpm` : null,
        observation.medications || null,
        observation.notes || null,
      ].filter(Boolean).join(' | ') || '—';

      return `
        <tr>
          <td>${escapeHtml(formatDateTime(observation.observation_time))}</td>
          <td>${escapeHtml(observation.fetal_heart_rate != null ? String(observation.fetal_heart_rate) : '—')}</td>
          <td>${escapeHtml(observation.cervical_dilation_cm ? `${observation.cervical_dilation_cm} cm` : '—')}</td>
          <td>${escapeHtml(observation.descent_fifths != null ? `${observation.descent_fifths}/5` : '—')}</td>
          <td>${escapeHtml(observation.moulding || '—')}</td>
          <td>${escapeHtml(contractionText)}</td>
          <td>${escapeHtml(maternalText)}</td>
          <td>${escapeHtml(urineText)}</td>
          <td>${escapeHtml(interventions)}</td>
        </tr>
      `.trim();
    })
    .join('\n');
}

function getPartographQRContent(data: PrintPartographReportData): QRContent {
  return {
    data: data.verificationUrl || `PARTOGRAPH:${data.partograph.id}|MCH:${data.registration.mch_number}|STATUS:${data.partograph.status}`,
    isVerifiable: Boolean(data.verificationUrl),
    label: `Partograph ${data.registration.mch_number}`,
  };
}

/**
 * Build an inline SVG cervicograph: dilation & descent vs time with WHO lines.
 */
function buildCervicographSVG(observations: LabourPartographObservation[]): string {
  const dilationObs = observations.filter(
    (o) => o.cervical_dilation_cm != null || o.descent_fifths != null,
  );
  if (dilationObs.length < 2) return '';

  const W = 520;
  const H = 220;
  const PAD = { top: 20, right: 20, bottom: 30, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const times = dilationObs.map((o) => new Date(o.observation_time).getTime());
  const tMin = times[0]!;
  const tMax = times[times.length - 1]!;
  const tRange = tMax - tMin || 1;

  const x = (t: number) => PAD.left + ((t - tMin) / tRange) * plotW;
  const yDil = (cm: number) => PAD.top + plotH - (cm / 10) * plotH;
  const yDesc = (fifths: number) => PAD.top + (fifths / 5) * plotH;

  // Grid lines & Y-axis labels for dilation (0-10 cm)
  let gridLines = '';
  for (let cm = 0; cm <= 10; cm += 2) {
    const y = yDil(cm);
    gridLines += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`;
    gridLines += `<text x="${PAD.left - 4}" y="${y + 3}" text-anchor="end" font-size="8" fill="#64748b">${cm}</text>`;
  }

  // X-axis time labels
  let xLabels = '';
  const labelCount = Math.min(dilationObs.length, 8);
  const step = Math.max(1, Math.floor(dilationObs.length / labelCount));
  for (let i = 0; i < dilationObs.length; i += step) {
    const t = times[i]!;
    const xPos = x(t);
    const label = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    xLabels += `<text x="${xPos}" y="${H - 4}" text-anchor="middle" font-size="8" fill="#64748b">${label}</text>`;
  }

  // Dilation line
  const dilPoints = dilationObs
    .filter((o) => o.cervical_dilation_cm != null)
    .map((o) => `${x(new Date(o.observation_time).getTime())},${yDil(Number(o.cervical_dilation_cm))}`)
    .join(' ');
  const dilationLine = dilPoints
    ? `<polyline points="${dilPoints}" fill="none" stroke="#0d9488" stroke-width="2"/>`
    + dilationObs
        .filter((o) => o.cervical_dilation_cm != null)
        .map((o) => {
          const cx = x(new Date(o.observation_time).getTime());
          const cy = yDil(Number(o.cervical_dilation_cm));
          return `<circle cx="${cx}" cy="${cy}" r="3" fill="#0d9488"/>`;
        })
        .join('')
    : '';

  // Descent line (inverted: 5/5 at top, 0/5 at bottom)
  const descPoints = dilationObs
    .filter((o) => o.descent_fifths != null)
    .map((o) => `${x(new Date(o.observation_time).getTime())},${yDesc(o.descent_fifths!)}`)
    .join(' ');
  const descentLine = descPoints
    ? `<polyline points="${descPoints}" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="4 1 1 1"/>`
    + dilationObs
        .filter((o) => o.descent_fifths != null)
        .map((o) => {
          const cx = x(new Date(o.observation_time).getTime());
          const cy = yDesc(o.descent_fifths!);
          return `<rect x="${cx - 2.5}" y="${cy - 2.5}" width="5" height="5" fill="#7c3aed"/>`;
        })
        .join('')
    : '';

  // WHO Alert & Action lines
  const firstActive = dilationObs.find(
    (o) => o.cervical_dilation_cm != null && Number(o.cervical_dilation_cm) >= 4,
  );
  let alertLine = '';
  let actionLine = '';
  if (firstActive) {
    const t0 = new Date(firstActive.observation_time).getTime();
    // Alert line: 4cm at t0, +1cm per hour
    const alertPts: string[] = [];
    const actionPts: string[] = [];
    for (let h = 0; h <= 8; h += 0.5) {
      const t = t0 + h * 3600000;
      if (t > tMax + 3600000) break;
      const alertCm = Math.min(4 + h, 10);
      alertPts.push(`${x(t)},${yDil(alertCm)}`);
      if (h >= 4) {
        const actionCm = Math.min(4 + (h - 4), 10);
        actionPts.push(`${x(t)},${yDil(actionCm)}`);
      }
    }
    if (alertPts.length >= 2) {
      alertLine = `<polyline points="${alertPts.join(' ')}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="8 4"/>`;
    }
    if (actionPts.length >= 2) {
      actionLine = `<polyline points="${actionPts.join(' ')}" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    }
  }

  // Axis labels
  const yAxisLabel = `<text x="12" y="${PAD.top + plotH / 2}" transform="rotate(-90 12 ${PAD.top + plotH / 2})" text-anchor="middle" font-size="9" fill="#64748b">Dilation (cm) / Descent (/5)</text>`;
  const xAxisLabel = `<text x="${PAD.left + plotW / 2}" y="${H - 0}" text-anchor="middle" font-size="9" fill="#64748b">Time</text>`;

  // Right Y-axis for descent
  let rightAxis = '';
  for (let f = 0; f <= 5; f++) {
    const y = yDesc(f);
    rightAxis += `<text x="${W - PAD.right + 4}" y="${y + 3}" text-anchor="start" font-size="8" fill="#7c3aed">${f}/5</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fafbfc;border:1px solid #e2e8f0;border-radius:4px;">
    ${gridLines}${xLabels}${yAxisLabel}${xAxisLabel}${rightAxis}
    ${alertLine}${actionLine}
    ${dilationLine}${descentLine}
  </svg>`;
}

function buildTemplateData(data: PrintPartographReportData): Record<string, unknown> {
  const latestObservation = data.observations.at(-1) ?? data.partograph.latest_observation;
  const latestAlerts = latestObservation?.alerts?.length ? latestObservation.alerts.join(' | ') : '';

  return {
    facility: {
      ...partographReportDefaults.facility,
      ...data.facility,
    },
    registration: {
      mch_number: escapeHtml(data.registration.mch_number),
      mother_name: escapeHtml(data.registration.mother_name),
      mother_mrn: escapeHtml(data.registration.mother_mrn),
      registration_date: escapeHtml(formatDate(data.registration.registration_date)),
      gestation: escapeHtml(data.registration.gestation_display || ''),
      risk_factors: escapeHtml(data.registration.risk_factors || ''),
      notes: escapeHtml(data.registration.notes || ''),
    },
    partograph: {
      started_at: escapeHtml(formatDateTime(data.partograph.started_at)),
      completed_at: escapeHtml(data.partograph.completed_at ? formatDateTime(data.partograph.completed_at) : 'In progress'),
      status_label: partographReportStatusLabels[data.partograph.status] || data.partograph.status,
      status_class: partographReportStatusClasses[data.partograph.status] || '',
      parity: escapeHtml(data.partograph.parity != null ? String(data.partograph.parity) : '—'),
      gestation_weeks: escapeHtml(data.partograph.gestation_weeks != null ? String(data.partograph.gestation_weeks) : '—'),
      membranes: escapeHtml(data.partograph.membrane_status || 'Not recorded'),
      liquor: escapeHtml(data.partograph.liquor || 'Not recorded'),
      notes: escapeHtml(data.partograph.notes || ''),
    },
    summary: {
      total_observations: escapeHtml(String(data.observations.length)),
      latest_fhr: escapeHtml(latestObservation?.fetal_heart_rate != null ? `${latestObservation.fetal_heart_rate} BPM` : '—'),
      latest_dilation: escapeHtml(latestObservation?.cervical_dilation_cm ? `${latestObservation.cervical_dilation_cm} cm` : '—'),
      latest_contractions: escapeHtml(latestObservation?.contractions_per_10_min != null ? `${latestObservation.contractions_per_10_min}/10 min` : '—'),
      latest_maternal_pulse: escapeHtml(latestObservation?.maternal_pulse != null ? `${latestObservation.maternal_pulse} BPM` : '—'),
      latest_alerts: escapeHtml(latestAlerts),
    },
    alerts: {
      display: latestAlerts ? '' : 'display:none;',
    },
    notes: {
      display: data.partograph.notes ? '' : 'display:none;',
    },
    registrationNotes: {
      display: data.registration.risk_factors || data.registration.notes ? '' : 'display:none;',
    },
    cervicograph: {
      svg: buildCervicographSVG(data.observations),
      display: data.observations.length >= 2 ? '' : 'display:none;',
    },
    observations: {
      rows: buildObservationRows(data.observations),
    },
    signature: {
      name: escapeHtml(latestObservation?.recorded_by_name || data.partograph.created_by_name || data.registration.registered_by_name || ''),
      credentials: partographReportDefaults.signature_credentials,
      datetime: escapeHtml(latestObservation ? formatDateTime(latestObservation.observation_time) : formatDateTime(data.partograph.started_at)),
      status: data.partograph.status === 'COMPLETED' ? 'Labour chart completed' : 'Live labour monitoring record',
    },
    system: {
      name: partographReportDefaults.system_name,
    },
  };
}

export async function printPartographReport(data: PrintPartographReportData): Promise<void> {
  const templateData = buildTemplateData(data);
  const qrContent = getPartographQRContent(data);
  const qrDataUri = await generateQRDataUri(qrContent.data, { size: 70 });

  let html = replaceTemplatePlaceholders(PARTOGRAPH_REPORT_TEMPLATE, templateData);
  html = html.replace(/>QR<\/div>/g, `><img src="${qrDataUri}" alt="QR Code" /></div>`);

  const title = `Partograph - ${data.registration.mch_number}`;
  const fullHtml = buildPrintDocument(
    html,
    title,
    data.layout || 'a4',
    data.theme || 'default',
    PARTOGRAPH_REPORT_CSS
  );

  openPrintWindow(fullHtml);
}

export default printPartographReport;
