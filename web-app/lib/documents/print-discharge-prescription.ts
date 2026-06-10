/**
 * Print Discharge Prescription Utility
 *
 * Generates a printable prescription document from discharge medications.
 * Unlike print-prescription.ts which requires a full Prescription object,
 * this works directly from the discharge_medications JSON array.
 */

import {
  buildPrintDocument,
  escapeHtml,
  formatDate,
  openPrintWindow,
  renderSignatureColumn,
} from './renderer';
import type { SignatureInfo } from './types';
import type { DischargeMedication } from '@/lib/types/inpatient';

// =============================================================================
// TYPES
// =============================================================================

export interface PrintDischargePrescriptionOptions {
  /** Discharge medications list */
  medications: DischargeMedication[];
  /** Patient name */
  patientName: string;
  /** Patient MRN or admission number */
  patientIdentifier?: string;
  /** Patient age (e.g., "45 Years") */
  patientAge?: string;
  /** Patient sex */
  patientSex?: string;
  /** Discharge date */
  dischargeDate?: string;
  /** Final diagnosis */
  diagnosis?: string;
  /** Facility name */
  facilityName?: string;
  /** Facility MFL code */
  facilityMflCode?: string;
  /** Facility location */
  facilityLocation?: string;
  /** Facility phone */
  facilityPhone?: string;
  /** Facility logo URL */
  facilityLogoUrl?: string | null;
  /** Prescribing clinician name */
  clinicianName?: string;
  /** Clinician registration number */
  clinicianRegistration?: string;
  /** Digital signature */
  signature?: SignatureInfo;
  /** Only print INTERNAL or EXTERNAL meds (default: all) */
  filterType?: 'INTERNAL' | 'EXTERNAL' | 'ALL';
}

// =============================================================================
// TEMPLATE
// =============================================================================

function buildMedicationRows(medications: DischargeMedication[]): string {
  return medications
    .map(
      (med, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(med.drug_name)}</strong></td>
        <td>${escapeHtml(med.dosage || '—')}</td>
        <td>${escapeHtml(med.frequency || '—')}</td>
        <td>${escapeHtml(med.duration || '—')}</td>
        <td>${escapeHtml(med.instructions || '')}</td>
      </tr>`
    )
    .join('\n');
}

function buildDocument(options: PrintDischargePrescriptionOptions): string {
  const {
    medications,
    patientName,
    patientIdentifier,
    patientAge,
    patientSex,
    dischargeDate,
    diagnosis,
    facilityName,
    facilityMflCode,
    facilityLocation,
    facilityPhone,
    facilityLogoUrl,
    clinicianName,
    clinicianRegistration,
    signature,
    filterType = 'ALL',
  } = options;

  const filteredMeds =
    filterType === 'ALL'
      ? medications
      : medications.filter((m) => m.dispensing_type === filterType);

  if (filteredMeds.length === 0) return '';

  const dateStr = dischargeDate ? formatDate(dischargeDate) : formatDate(new Date().toISOString());

  const logoHtml = facilityLogoUrl
    ? `<img src="${facilityLogoUrl}" alt="" style="max-height:50px;max-width:120px;object-fit:contain;" />`
    : '';

  const bodyHtml = `
<div class="page">
  <div class="header">
    <div class="clinic-info">
      ${logoHtml}
      <strong>${escapeHtml(facilityName || 'Healthcare Facility')}</strong><br />
      ${facilityLocation ? `${escapeHtml(facilityLocation)}<br />` : ''}
      ${facilityPhone ? `Tel: ${escapeHtml(facilityPhone)}<br />` : ''}
      ${facilityMflCode ? `MFL: ${escapeHtml(facilityMflCode)}` : ''}
    </div>
    <div class="rx-symbol">&#x211E;</div>
  </div>

  <h1>DISCHARGE PRESCRIPTION</h1>

  <div class="section">
    <div class="section-title">Patient Information</div>
    <div class="patient-grid">
      <div><strong>Name:</strong> ${escapeHtml(patientName)}</div>
      <div><strong>ID:</strong> ${escapeHtml(patientIdentifier || '—')}</div>
      ${patientAge ? `<div><strong>Age:</strong> ${escapeHtml(patientAge)}</div>` : ''}
      ${patientSex ? `<div><strong>Sex:</strong> ${escapeHtml(patientSex)}</div>` : ''}
      <div><strong>Date:</strong> ${dateStr}</div>
      ${diagnosis ? `<div><strong>Diagnosis:</strong> ${escapeHtml(diagnosis)}</div>` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Medications (${filteredMeds.length})</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Medication</th>
          <th>Dosage</th>
          <th>Frequency</th>
          <th>Duration</th>
          <th>Instructions</th>
        </tr>
      </thead>
      <tbody>
        ${buildMedicationRows(filteredMeds)}
      </tbody>
    </table>
  </div>

  <div class="signature-block">
    <div class="sig">
      <div class="sig-line"></div>
      Prescribing Clinician<br />
      ${clinicianName ? `${escapeHtml(clinicianName)}` : ''}
      ${clinicianRegistration ? ` (${escapeHtml(clinicianRegistration)})` : ''}
    </div>
    ${renderSignatureColumn(signature)}
  </div>

  <div class="footer">
    <div>This prescription is valid for 30 days from the date of issue.</div>
    <div>Generated by Vitora HMIS</div>
  </div>
</div>
`;

  return bodyHtml;
}

// =============================================================================
// CSS
// =============================================================================

const DISCHARGE_RX_CSS = `
  h1 {
    margin: 12px 0;
    font-size: 20px;
    text-align: center;
    letter-spacing: 1px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #000;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }

  .clinic-info {
    font-size: 12px;
    line-height: 1.5;
  }

  .rx-symbol {
    font-size: 48px;
    font-weight: bold;
    line-height: 1;
  }

  .section {
    margin-bottom: 16px;
  }

  .section-title {
    font-weight: bold;
    font-size: 13px;
    margin-bottom: 6px;
    border-bottom: 1px solid #ccc;
    padding-bottom: 2px;
  }

  .patient-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 16px;
    font-size: 13px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th, td {
    border: 1px solid #000;
    padding: 6px 8px;
    vertical-align: top;
  }

  th {
    background: #f2f2f2;
    text-align: left;
    font-size: 12px;
  }

  td:first-child, th:first-child {
    width: 30px;
    text-align: center;
  }

  .signature-block {
    margin-top: 40px;
    display: flex;
    justify-content: space-between;
  }

  .sig {
    width: 45%;
    text-align: center;
    font-size: 12px;
  }

  .sig-line {
    border-top: 1px solid #000;
    margin-bottom: 4px;
    margin-top: 40px;
  }

  .footer {
    margin-top: 24px;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    border-top: 1px solid #ccc;
    padding-top: 6px;
    color: #666;
  }
`;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Print discharge medications as a proper prescription document.
 */
export async function printDischargePrescription(
  options: PrintDischargePrescriptionOptions
): Promise<Window | null> {
  const bodyHtml = buildDocument(options);
  if (!bodyHtml) {
    console.warn('printDischargePrescription: no medications to print');
    return null;
  }

  const title = `Discharge Prescription - ${options.patientName}`;
  const html = buildPrintDocument(bodyHtml, title, 'a4', 'default', DISCHARGE_RX_CSS);
  return openPrintWindow(html);
}
