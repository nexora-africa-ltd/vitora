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
        ? `${observation.contractions_per_10_min}/10 min${observation.contraction_duration_seconds != null ? ` x ${observation.contraction_duration_seconds}s` : ''}`
        : '—';
      const maternalText = [
        observation.maternal_pulse != null ? `P ${observation.maternal_pulse}` : null,
        observation.maternal_blood_pressure ? `BP ${observation.maternal_blood_pressure}` : null,
        observation.maternal_temperature != null ? `T ${observation.maternal_temperature}` : null,
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