/**
 * Print Adverse Transfusion Reaction (ATR) Report
 *
 * Generates a printable Kenya MOH/PPB form FOM20/MIP/PMS/SOP/001
 * for physical submission.
 */

import { escapeHtml, openPrintWindow } from './renderer';
import type { AdverseTransfusionReaction } from '@/lib/types/inpatient';
import {
  GENERAL_REACTION_OPTIONS,
  DERMATOLOGICAL_REACTION_OPTIONS,
  CARDIAC_RESPIRATORY_REACTION_OPTIONS,
  RENAL_REACTION_OPTIONS,
  HAEMATOLOGICAL_REACTION_OPTIONS,
} from '@/lib/types/inpatient';

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

/** Render a checkbox group as ☑/☐ matching the MOH form layout */
function checkboxGroup(
  options: { value: string; label: string }[],
  selected: string[]
): string {
  return options
    .map(
      (opt) =>
        `<span class="checkbox-item">${selected.includes(opt.value) ? '☑' : '☐'} ${escapeHtml(opt.label)}</span>`
    )
    .join(' ');
}

function calculateAge(dob: string | undefined): string {
  if (!dob) return '—';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? `${age} years` : '—';
}

export function printATRForm(atr: AdverseTransfusionReaction): void {
  const hResults = atr.haematological_results ?? {};

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ATR Report #${atr.id} — FOM20/MIP/PMS/SOP/001</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10px; line-height: 1.35; color: #000; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
    .header h1 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .header h2 { font-size: 11px; font-weight: bold; margin-top: 4px; }
    .header p { font-size: 9px; color: #333; }
    .form-ref { font-size: 9px; text-align: left; margin-bottom: 4px; color: #555; }
    .section { margin-bottom: 10px; }
    .section-title { font-weight: bold; font-size: 11px; background: #e8e8e8; padding: 3px 6px; border: 1px solid #999; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 2px 5px; border: 1px solid #bbb; vertical-align: top; font-size: 10px; }
    td.label { font-weight: bold; width: 35%; background: #f5f5f5; }
    .checkbox-item { margin-right: 8px; white-space: nowrap; }
    .checkbox-grid { padding: 4px 0; line-height: 1.6; }
    .footer { margin-top: 16px; border-top: 1px solid #000; padding-top: 6px; font-size: 8px; text-align: center; color: #666; }
    .sig-line { border-bottom: 1px solid #000; width: 180px; display: inline-block; margin-top: 16px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    .specimens { font-size: 9px; margin-top: 8px; padding: 6px; border: 1px solid #999; background: #fafafa; }
    .specimens h4 { font-size: 10px; margin-bottom: 3px; }
    .specimens ol { padding-left: 16px; }
    .lab-grid td { padding: 2px 4px; font-size: 9px; }
    .italic-note { font-style: italic; text-align: center; font-size: 10px; color: #c00; margin-top: 8px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="form-ref">(FOM20/MIP/PMS/SOP/001)</div>

  <div class="header">
    <p>MINISTRY OF HEALTH</p>
    <p>PHARMACY AND POISONS BOARD</p>
    <p>P.O. Box 27663-00506 NAIROBI</p>
    <p>Tel: (020)-3562107 Ext 114, 0720 608811, 0733 884411 &bull; Fax: (020) 2713431/2713409</p>
    <p>Email: pv@pharmacyboardkenya.org</p>
    <h2>ADVERSE TRANSFUSION REACTION FORM</h2>
    <p style="font-size: 8px; margin-top: 3px;">In the event of a severe reaction following transfusion of blood or blood products please complete this form.</p>
  </div>

  <!-- PATIENT INFORMATION -->
  <div class="section">
    <div class="section-title">PATIENT INFORMATION</div>
    <div class="two-col">
      <table>
        ${row('Patient Name', atr.patient_name)}
        ${row('Gender', atr.patient_gender || '—')}
        ${row('Age', calculateAge(atr.patient_date_of_birth))}
        ${row('Patient No. (MRN)', atr.patient_mrn)}
        ${row('Diagnosis', atr.transfusion_diagnosis || '—')}
        ${row('Ward', atr.ward_name || '—')}
        ${row('Pre-Transfusion Hb', atr.pre_transfusion_hb ? atr.pre_transfusion_hb + ' g/dL' : null)}
        ${row('Reason for Transfusion', atr.transfusion_diagnosis || '—')}
        ${row('Current Medications', atr.current_medications)}
      </table>
      <table>
        ${row('Obstetric History', atr.obstetric_status === 'NA' ? 'N/A' : atr.obstetric_status + (atr.gravida != null ? ' G' + atr.gravida : '') + (atr.para != null ? ' P' + atr.para : ''))}
        ${row('Previous Transfusion', atr.previous_transfusion == null ? '—' : atr.previous_transfusion ? 'Yes' : 'No')}
        ${atr.previous_transfusion_comment ? row('Comment', atr.previous_transfusion_comment) : ''}
        ${row('Previous Reactions', atr.previous_reactions == null ? '—' : atr.previous_reactions ? 'Yes' : 'No')}
        ${atr.previous_reactions_comment ? row('Comment', atr.previous_reactions_comment) : ''}
      </table>
    </div>
  </div>

  <!-- REACTION INFORMATION -->
  <div class="section">
    <div class="section-title">REACTION INFORMATION</div>
    <table>
      <tr>
        <td style="width: 50%; vertical-align: top;">
          <p style="font-weight: bold; margin-bottom: 3px;">1. General:</p>
          <div class="checkbox-grid">${checkboxGroup(GENERAL_REACTION_OPTIONS, atr.general_reactions ?? [])}</div>

          <p style="font-weight: bold; margin: 4px 0 3px;">2. Dermatological:</p>
          <div class="checkbox-grid">${checkboxGroup(DERMATOLOGICAL_REACTION_OPTIONS, atr.dermatological_reactions ?? [])}</div>

          <p style="font-weight: bold; margin: 4px 0 3px;">3. Cardiac/Respiratory:</p>
          <div class="checkbox-grid">${checkboxGroup(CARDIAC_RESPIRATORY_REACTION_OPTIONS, atr.cardiac_respiratory_reactions ?? [])}</div>
        </td>
        <td style="width: 50%; vertical-align: top;">
          <p style="font-weight: bold; margin-bottom: 3px;">4. Renal:</p>
          <div class="checkbox-grid">${checkboxGroup(RENAL_REACTION_OPTIONS, atr.renal_reactions ?? [])}</div>

          <p style="font-weight: bold; margin: 4px 0 3px;">5. Haematological:</p>
          <div class="checkbox-grid">${checkboxGroup(HAEMATOLOGICAL_REACTION_OPTIONS, atr.haematological_reactions ?? [])}</div>

          <p style="font-weight: bold; margin: 4px 0 3px;">6. Others (Specify):</p>
          <p style="padding: 2px 0;">${atr.other_reactions ? escapeHtml(atr.other_reactions) : '—'}</p>
        </td>
      </tr>
    </table>

    <!-- Vital Signs -->
    <table style="margin-top: 6px;">
      <thead>
        <tr style="background: #f0f0f0;">
          <th>Vital Signs</th><th>BP</th><th>T (°C)</th><th>P</th><th>R</th>
        </tr>
      </thead>
      <tbody>
        ${vitalsRow('At Start', atr.vitals_at_start_bp, atr.vitals_at_start_temp, atr.vitals_at_start_pulse, atr.vitals_at_start_rr)}
        ${vitalsRow('During (15 min)', atr.vitals_during_bp, atr.vitals_during_temp, atr.vitals_during_pulse, atr.vitals_during_rr)}
        ${vitalsRow('At Stop', atr.vitals_at_stop_bp, atr.vitals_at_stop_temp, atr.vitals_at_stop_pulse, atr.vitals_at_stop_rr)}
      </tbody>
    </table>
  </div>

  <!-- COMPONENT INFORMATION -->
  <div class="section">
    <div class="section-title">COMPONENT INFORMATION</div>
    <table>
      <thead>
        <tr style="background: #f0f0f0;">
          <th>Type of Component</th><th>Pint No</th><th>Expiry Date</th><th>Volume Transfused</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(atr.blood_product_display || '—')}</td>
          <td>${escapeHtml(atr.blood_unit_number || '—')}</td>
          <td>${escapeHtml(atr.transfusion_expiry_date || '—')}</td>
          <td>${atr.amount_ml ? atr.amount_ml + ' ml' : '—'}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin-top: 4px; font-size: 9px;"><strong>Name of Nurse/Doctor:</strong> ${escapeHtml(atr.started_by_name || '—')}</p>
    <p style="font-size: 9px;"><strong>Signature:</strong> <span class="sig-line" style="width: 140px; margin-top: 0;">&nbsp;</span></p>
  </div>

  <!-- Specimens Required -->
  <div class="specimens">
    <h4>Specimens required by the laboratory</h4>
    <ol>
      <li>10mls post-transfusion whole blood from patient from plain bottle</li>
      <li>2mls of blood in EDTA bottle</li>
      <li>10mls First Void Urine</li>
      <li>The blood that reacted together with the attached transfusion set</li>
      <li>All empty blood bags of already transfused unit</li>
    </ol>
  </div>

  <!-- LAB INVESTIGATION -->
  <div class="section" style="margin-top: 8px;">
    <div class="section-title">LAB INVESTIGATION: (Transfusion Manager)</div>
    ${atr.has_lab_investigation ? `
    <div class="two-col">
      <div>
        <table class="lab-grid">
          ${row("1. Recipient's blood supernatant:", '')}
          <tr>
            <td class="label" style="padding-left: 16px;">Hemolysis</td>
            <td>${atr.recipient_supernatant_hemolysis ? `☑ ${escapeHtml(atr.recipient_supernatant_hemolysis)}` : '☐ Present ☐ Absent ☐ Equivocal'}${atr.recipient_hemolysis_severity ? ` (${escapeHtml(atr.recipient_hemolysis_severity)})` : ''}</td>
          </tr>
          <tr>
            <td class="label">2. Recipient's blood:</td>
            <td>Agglutination: ${atr.recipient_agglutination ? `☑ ${escapeHtml(atr.recipient_agglutination)}` : '☐ Present ☐ Absent'}</td>
          </tr>
          <tr>
            <td class="label">3. Haematological results:</td>
            <td>
              WBC: ${escapeHtml(hResults.wbc ?? '—')} &nbsp;
              HB: ${escapeHtml(hResults.hb ?? '—')} &nbsp;
              RBC: ${escapeHtml(hResults.rbc ?? '—')} &nbsp;
              HCT: ${escapeHtml(hResults.hct ?? '—')} &nbsp;
              MCV: ${escapeHtml(hResults.mcv ?? '—')}<br/>
              MCH: ${escapeHtml(hResults.mch ?? '—')} &nbsp;
              MCHC: ${escapeHtml(hResults.mchc ?? '—')} &nbsp;
              PLT: ${escapeHtml(hResults.plt ?? '—')}
            </td>
          </tr>
          <tr>
            <td class="label" style="padding-left: 16px;">Film</td>
            <td>
              Rbc: ${escapeHtml(atr.blood_film_rbc || '—')} &nbsp;
              Wbc: ${escapeHtml(atr.blood_film_wbc || '—')} &nbsp;
              Plt: ${escapeHtml(atr.blood_film_plt || '—')}
            </td>
          </tr>
        </table>
      </div>
      <div>
        <table class="lab-grid">
          <tr>
            <td class="label">4. Donor blood supernatant:</td>
            <td>Hemolysis: ${atr.donor_supernatant_hemolysis ? `☑ ${escapeHtml(atr.donor_supernatant_hemolysis)}` : '☐ Present ☐ Absent'}</td>
          </tr>
          <tr>
            <td class="label">5. Age of donor pack:</td>
            <td>${escapeHtml(atr.donor_pack_age || '—')}</td>
          </tr>
          <tr>
            <td class="label">6. Culture donor pack:</td>
            <td>Results: ${escapeHtml(atr.culture_donor_pack_results || '—')}</td>
          </tr>
          <tr>
            <td class="label">7. Culture recipient blood:</td>
            <td>Results: ${escapeHtml(atr.culture_recipient_blood_results || '—')}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Compatibility Testing (Item 8) -->
    <table class="lab-grid" style="margin-top: 6px;">
      <tr>
        <td class="label" colspan="5">8. Compatibility testing: recipient serum (pretransfusion sample) and donor cells (pack)</td>
      </tr>
      <tr style="background: #f5f5f5;">
        <td></td><td style="text-align: center;">Saline RT</td><td style="text-align: center;">Saline 37</td><td style="text-align: center;">AHG</td><td style="text-align: center;">Albumin 37</td>
      </tr>
      <tr>
        <td class="label">Compatible</td>
        <td style="text-align: center;">${atr.compatibility_saline_rt === 'COMPATIBLE' ? '☑' : '☐'}</td>
        <td style="text-align: center;">${atr.compatibility_saline_37 === 'COMPATIBLE' ? '☑' : '☐'}</td>
        <td style="text-align: center;">${atr.compatibility_ahg === 'COMPATIBLE' ? '☑' : '☐'}</td>
        <td style="text-align: center;">${atr.compatibility_albumin_37 === 'COMPATIBLE' ? '☑' : '☐'}</td>
      </tr>
      <tr>
        <td class="label">Incompatible</td>
        <td style="text-align: center;">${atr.compatibility_saline_rt === 'INCOMPATIBLE' ? '☑' : '☐'}</td>
        <td style="text-align: center;">${atr.compatibility_saline_37 === 'INCOMPATIBLE' ? '☑' : '☐'}</td>
        <td style="text-align: center;">${atr.compatibility_ahg === 'INCOMPATIBLE' ? '☑' : '☐'}</td>
        <td style="text-align: center;">${atr.compatibility_albumin_37 === 'INCOMPATIBLE' ? '☑' : '☐'}</td>
      </tr>
    </table>

    <!-- Items 9-13 -->
    <table class="lab-grid" style="margin-top: 6px;">
      ${row('9. Enzyme-treated cells result', atr.enzyme_treated_cells_result || '—')}
      <tr>
        <td class="label">10. Anti-A/Anti-B titres (Group O → A/B/AB)</td>
        <td>Anti A: ${escapeHtml(atr.anti_a_titres || '—')} &nbsp;&nbsp; Anti B: ${escapeHtml(atr.anti_b_titres || '—')}</td>
      </tr>
      ${row('11. Urinalysis', atr.urinalysis || '—')}
      ${row('12. Evaluation: Diagnosis', atr.evaluation_diagnosis || '—')}
      <tr>
        <td class="label">13. Was the adverse reaction related to transfusion?</td>
        <td>
          ${atr.reaction_related_to_transfusion === 'YES' ? '☑' : '☐'} Yes &nbsp;&nbsp;
          ${atr.reaction_related_to_transfusion === 'NO' ? '☑' : '☐'} No &nbsp;&nbsp;
          ${atr.reaction_related_to_transfusion === 'INCONCLUSIVE' ? '☑' : '☐'} Inconclusive
        </td>
      </tr>
    </table>
    ` : '<p style="padding: 6px; color: #666; font-style: italic;">Lab investigation not yet completed.</p>'}
  </div>

  <!-- REPORTER DETAILS -->
  <div class="section">
    <div class="section-title">Reporter Details</div>
    <table>
      <tr>
        <td class="label">Name of Initial Reporter</td>
        <td>${escapeHtml(atr.initial_reporter_username || '—')}</td>
        <td class="label" style="width: 18%;">Cadre/Designation</td>
        <td>${escapeHtml(atr.initial_reporter_cadre || '—')}</td>
      </tr>
      <tr>
        <td class="label">Mobile No</td>
        <td>${escapeHtml(atr.initial_reporter_mobile || '—')}</td>
        <td class="label">Email</td>
        <td>${escapeHtml(atr.initial_reporter_email || '—')}</td>
      </tr>
      <tr>
        <td class="label">Date of Report</td>
        <td colspan="3">${escapeHtml(atr.report_date)}</td>
      </tr>
      ${atr.ppb_submitter_name ? `
      <tr>
        <td class="label">Name of Person Submitting to PPB</td>
        <td>${escapeHtml(atr.ppb_submitter_name)}</td>
        <td class="label">Cadre/Designation</td>
        <td>${escapeHtml(atr.ppb_submitter_cadre || '—')}</td>
      </tr>
      <tr>
        <td class="label">Mobile No</td>
        <td>${escapeHtml(atr.ppb_submitter_mobile || '—')}</td>
        <td class="label">Email</td>
        <td>${escapeHtml(atr.ppb_submitter_email || '—')}</td>
      </tr>
      <tr>
        <td class="label">Date of Submission</td>
        <td colspan="3">${escapeHtml(atr.submission_date || '—')}</td>
      </tr>` : ''}
    </table>
  </div>

  <p class="italic-note">You need not be certain&hellip;.. just be suspicious!</p>
  <p style="text-align: center; font-size: 8px; margin-top: 3px;">
    Your support towards the National Pharmacovigilance system is appreciated.<br/>
    Submission of a report does not constitute an admission that medical personnel or manufacturer or the product caused or contributed to the event.<br/>
    Patient&rsquo;s identity is held in strict confidence. Once completed please send to: The Pharmacy and Poisons Board on the above address.
  </p>

  <!-- PPB OFFICIAL USE -->
  <div class="section" style="margin-top: 10px;">
    <div class="section-title">FOR OFFICIAL (PPB USE ONLY)</div>
    <table>
      <tr>
        <td class="label" style="width: 25%;">ADR Report No</td>
        <td>${escapeHtml(atr.adr_report_number || '......./........./.........')}</td>
        <td class="label" style="width: 25%;">Date Received</td>
        <td>${escapeHtml(atr.ppb_date_received || '—')}</td>
      </tr>
      <tr>
        <td class="label">Vigiflow Entry Number</td>
        <td>${escapeHtml(atr.vigiflow_entry_number || '—')}</td>
        <td class="label">Date Committed</td>
        <td>—</td>
      </tr>
    </table>
  </div>

  <div class="footer">
    Generated by Vitora HMIS &mdash; Kenya Digital Health &mdash; ${new Date().toLocaleDateString('en-KE')}
  </div>
</body>
</html>`;

  openPrintWindow(html);
}
