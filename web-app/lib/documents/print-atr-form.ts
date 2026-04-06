/**
 * Print Adverse Transfusion Reaction (ATR) Report
 *
 * Generates a printable Kenya MOH/PPB form FOM20/MIP/PMS/SOP/001
 * for physical submission.
 */

import { escapeHtml, openPrintWindow } from './renderer';
import type { AdverseTransfusionReaction } from '@/lib/types/inpatient';

function row(label: string, value: string | number | null | undefined): string {
  return `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value ?? '—')}</td></tr>`;
}

function vitalsRow(
  label: string,
  bp?: string,
  temp?: string | null,
  pulse?: number | null,
  rr?: number | null
): string {
  return `<tr>
    <td>${escapeHtml(label)}</td>
    <td>${escapeHtml(bp || '—')}</td>
    <td>${temp ? escapeHtml(temp) + '°C' : '—'}</td>
    <td>${escapeHtml(pulse ?? '—')}</td>
    <td>${escapeHtml(rr ?? '—')}</td>
  </tr>`;
}

export function printATRForm(atr: AdverseTransfusionReaction): void {
  const reactions = (atr.reaction_categories_display ?? []).join(', ') || 'None recorded';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ATR Report #${atr.id}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #000; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
    .header h1 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    .header p { font-size: 10px; color: #333; }
    .section { margin-bottom: 12px; }
    .section-title { font-weight: bold; font-size: 12px; background: #f0f0f0; padding: 4px 8px; border: 1px solid #999; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 3px 6px; border: 1px solid #ccc; vertical-align: top; }
    td.label { font-weight: bold; width: 40%; background: #fafafa; }
    .reactions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .reaction-item { padding: 2px 6px; border: 1px solid #ccc; font-size: 10px; }
    .reaction-item.checked { background: #e8f5e9; border-color: #4caf50; }
    .footer { margin-top: 20px; border-top: 1px solid #000; padding-top: 8px; font-size: 9px; text-align: center; color: #666; }
    .sig-line { border-bottom: 1px solid #000; width: 200px; display: inline-block; margin-top: 20px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Adverse Transfusion Reaction Report</h1>
    <p>Form FOM20/MIP/PMS/SOP/001 &mdash; Kenya Pharmacy &amp; Poisons Board</p>
    <p>Report Date: ${escapeHtml(atr.report_date)} | Status: ${escapeHtml(atr.status_display || atr.status)}</p>
  </div>

  <!-- Section 1: Patient Information -->
  <div class="section">
    <div class="section-title">1. Patient &amp; Component Information</div>
    <table>
      ${row('Patient Name', atr.patient_name)}
      ${row('MRN', atr.patient_mrn)}
      ${row('Blood Product', atr.blood_product_display)}
      ${row('Unit Number', atr.blood_unit_number)}
      ${row('Amount (ml)', atr.amount_ml)}
      ${row('Expiry Date', atr.transfusion_expiry_date)}
      ${row('Pre-Transfusion Hb', atr.pre_transfusion_hb ? atr.pre_transfusion_hb + ' g/dL' : null)}
      ${row('Obstetric Status', atr.obstetric_status === 'NA' ? 'N/A' : atr.obstetric_status + (atr.gravida != null ? ' G' + atr.gravida : '') + (atr.para != null ? ' P' + atr.para : ''))}
      ${row('Previous Transfusion', atr.previous_transfusion ? 'Yes' + (atr.previous_transfusion_comment ? ' — ' + atr.previous_transfusion_comment : '') : 'No')}
      ${row('Previous Reactions', atr.previous_reactions ? 'Yes' + (atr.previous_reactions_comment ? ' — ' + atr.previous_reactions_comment : '') : 'No')}
      ${row('Current Medications', atr.current_medications)}
    </table>
  </div>

  <!-- Section 2: Reaction Information -->
  <div class="section">
    <div class="section-title">2. Nature of Transfusion Reaction</div>
    <p style="padding: 4px 0;">${escapeHtml(reactions)}</p>
    ${atr.other_reactions ? `<p style="padding: 4px 0;"><strong>Other:</strong> ${escapeHtml(atr.other_reactions)}</p>` : ''}
  </div>

  <!-- Section 3: Vital Signs -->
  <div class="section">
    <div class="section-title">3. Vital Signs</div>
    <table>
      <thead>
        <tr><th>Timing</th><th>BP</th><th>Temp</th><th>Pulse</th><th>RR</th></tr>
      </thead>
      <tbody>
        ${vitalsRow('Before / At Start', atr.vitals_at_start_bp, atr.vitals_at_start_temp, atr.vitals_at_start_pulse, atr.vitals_at_start_rr)}
        ${vitalsRow('During (15 min)', atr.vitals_during_bp, atr.vitals_during_temp, atr.vitals_during_pulse, atr.vitals_during_rr)}
        ${vitalsRow('At Stop', atr.vitals_at_stop_bp, atr.vitals_at_stop_temp, atr.vitals_at_stop_pulse, atr.vitals_at_stop_rr)}
      </tbody>
    </table>
  </div>

  <!-- Section 4: Lab Investigation -->
  <div class="section">
    <div class="section-title">4. Laboratory Investigation</div>
    ${atr.has_lab_investigation ? `<table>
      ${atr.recipient_supernatant_hemolysis ? row('Recipient Hemolysis', atr.recipient_supernatant_hemolysis + (atr.recipient_hemolysis_severity ? ' (' + atr.recipient_hemolysis_severity + ')' : '')) : ''}
      ${atr.recipient_agglutination ? row('Agglutination', atr.recipient_agglutination) : ''}
      ${atr.donor_supernatant_hemolysis ? row('Donor Hemolysis', atr.donor_supernatant_hemolysis) : ''}
      ${atr.compatibility_saline_rt ? row('Compatibility Saline RT', atr.compatibility_saline_rt) : ''}
      ${atr.compatibility_saline_37 ? row('Compatibility Saline 37°C', atr.compatibility_saline_37) : ''}
      ${atr.compatibility_ahg ? row('Compatibility AHG', atr.compatibility_ahg) : ''}
      ${atr.compatibility_albumin_37 ? row('Compatibility Albumin 37°C', atr.compatibility_albumin_37) : ''}
      ${atr.urinalysis ? row('Urinalysis', atr.urinalysis) : ''}
      ${atr.evaluation_diagnosis ? row('Evaluation Diagnosis', atr.evaluation_diagnosis) : ''}
      ${atr.reaction_related_to_transfusion ? row('Reaction Related to Transfusion', atr.reaction_related_to_transfusion) : ''}
    </table>` : '<p style="padding: 4px 0; color: #666;">Lab investigation not yet completed.</p>'}
  </div>

  <!-- Section 5: Reporter -->
  <div class="section">
    <div class="section-title">5. Reporter Details</div>
    <table>
      ${row('Reported By', atr.initial_reporter_username)}
      ${row('Cadre', atr.initial_reporter_cadre)}
      ${row('Mobile', atr.initial_reporter_mobile)}
      ${row('Email', atr.initial_reporter_email)}
    </table>
  </div>

  <!-- Section 6: PPB Submission -->
  <div class="section">
    <div class="section-title">6. PPB Submission</div>
    <div class="two-col">
      <div>
        <table>
          ${row('Status', atr.status_display || atr.status)}
          ${row('Submission Date', atr.submission_date)}
          ${atr.ppb_submitter_name ? row('PPB Submitter', atr.ppb_submitter_name) : ''}
        </table>
      </div>
      <div>
        <table>
          ${atr.adr_report_number ? row('ADR Report #', atr.adr_report_number) : row('ADR Report #', 'Pending')}
          ${atr.vigiflow_entry_number ? row('Vigiflow #', atr.vigiflow_entry_number) : row('Vigiflow #', 'Pending')}
          ${atr.ppb_date_received ? row('PPB Received', atr.ppb_date_received) : ''}
        </table>
      </div>
    </div>
  </div>

  <!-- Signature Lines -->
  <div style="margin-top: 24px;">
    <div class="two-col">
      <div>
        <p>Reporter Signature: <span class="sig-line">&nbsp;</span></p>
        <p style="margin-top: 8px;">Date: <span class="sig-line">&nbsp;</span></p>
      </div>
      <div>
        <p>Transfusion Manager: <span class="sig-line">&nbsp;</span></p>
        <p style="margin-top: 8px;">Date: <span class="sig-line">&nbsp;</span></p>
      </div>
    </div>
  </div>

  <div class="footer">
    Generated by Vitora HMIS &mdash; Kenya Digital Health &mdash; ${new Date().toLocaleDateString('en-KE')}
  </div>
</body>
</html>`;

  openPrintWindow(html);
}
