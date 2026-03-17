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
import { generateQRDataUri } from '@/lib/utils/qr';

// =============================================================================
// Markdown → HTML (lightweight, no external dependency)
// =============================================================================

/** Detect whether content contains markdown syntax. */
function looksLikeMarkdown(text: string): boolean {
  return /^#{1,3}\s|^\*\*|\*\*$|^- |^\d+\.\s|^>|^\|.+\|/m.test(text);
}

/** Convert content to safe HTML — handles both markdown and plain text. */
function contentToHtml(text: string): string {
  if (looksLikeMarkdown(text)) {
    return markdownToHtml(text);
  }
  // Plain text: escape, preserve line breaks and paragraph spacing
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((block) => `<p>${block.trim().replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

/**
 * Strip AI advisory content that should not appear on the printed document.
 * Removes:
 *  - Fully italic paragraphs (advisory notes wrapped in *...* or _..._ )
 *  - "Not documented (...)" placeholder lines and table cell values
 *  - Standalone parenthetical instructions "(If ... )"
 *  - Table rows where every data cell is a "not documented" placeholder
 */
function stripAdvisoryContent(md: string): string {
  return md
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      // Remove blocks that are entirely italic: *text* or _text_ (possibly multi-line)
      if (/^\*[^*]+\*$/.test(trimmed) || /^_[^_]+_$/.test(trimmed)) return null;
      // Remove "Not documented (reason)" standalone lines
      if (/^not documented\b/i.test(trimmed)) return null;
      // Remove standalone parenthetical instruction blocks
      if (/^\([^)]{20,}\)$/.test(trimmed)) return null;
      // Remove AI attribution lines (e.g. "Prepared by: Clinical Documentation Assistant")
      if (/^(prepared|generated|drafted)\s+by\s*:/i.test(trimmed)) return null;

      // Handle tables: clean "Not documented" from cells and drop empty rows
      if (/^\|.+\|/m.test(trimmed)) {
        const lines = trimmed.split('\n');
        const cleaned = lines.filter((line) => {
          // Always keep non-table lines, header rows, and separator rows
          if (!/^\|/.test(line)) return true;
          if (/^\|(\s*:?-{2,}:?\s*\|)+/.test(line)) return true;

          // Clean "Not documented ..." from cell values
          const scrubbed = line.replace(
            /not documented\s*(\([^)]*\))?/gi,
            '\u2014',
          );

          // Drop the row if every data cell is now just a dash/empty
          const cells = scrubbed
            .replace(/^\|\s*/, '')
            .replace(/\s*\|$/, '')
            .split('|')
            .map((c) => c.trim());

          // Keep header-like rows (first data row before separator)
          const allEmpty = cells.every((c) => /^(\u2014|-|)$/.test(c));
          if (allEmpty) return false;

          // Replace the original line with scrubbed version
          lines[lines.indexOf(line)] = scrubbed;
          return true;
        });

        // If only header + separator remain (no data rows), drop the whole table
        const dataRows = cleaned.filter(
          (l) => /^\|/.test(l) && !/^\|(\s*:?-{2,}:?\s*\|)+/.test(l),
        );
        if (dataRows.length <= 1) return null; // only header row left

        return cleaned.join('\n');
      }

      return block;
    })
    .filter((b): b is string => b !== null)
    .join('\n\n');
}

/** Convert markdown to safe HTML for print output. */
function markdownToHtml(md: string): string {
  let html = escapeHtml(md);

  // Headings (must come before bold since ## starts with special chars)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr/>');

  // GFM Tables: consecutive lines starting with | ... |
  html = html.replace(/(^\|.+\|\s*$(?:\n\|.+\|\s*$)+)/gm, (block) => {
    const rows = block.split('\n').filter((r) => r.trim());
    // Detect separator row (e.g. | --- | --- | or |:---|---:|)
    const sepIdx = rows.findIndex((r) => /^\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(r.trim()));
    let headerRows: string[] = [];
    let bodyRows: string[] = [];
    if (sepIdx > 0) {
      headerRows = rows.slice(0, sepIdx);
      bodyRows = rows.slice(sepIdx + 1);
    } else {
      bodyRows = rows;
    }
    const parseRow = (row: string, tag: 'td' | 'th') =>
      '<tr>' +
      row
        .replace(/^\|\s*/, '')
        .replace(/\s*\|$/, '')
        .split('|')
        .map((cell) => `<${tag}>${cell.trim()}</${tag}>`)
        .join('') +
      '</tr>';
    let tableHtml = '<table>';
    if (headerRows.length) {
      tableHtml += '<thead>' + headerRows.map((r) => parseRow(r, 'th')).join('') + '</thead>';
    }
    if (bodyRows.length) {
      tableHtml += '<tbody>' + bodyRows.map((r) => parseRow(r, 'td')).join('') + '</tbody>';
    }
    tableHtml += '</table>';
    return tableHtml;
  });

  // Unordered lists: consecutive lines starting with "- "
  html = html.replace(/(^- .+$(\n- .+$)*)/gm, (block) => {
    const items = block.split('\n').map((line) => `<li>${line.replace(/^- /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists: consecutive lines starting with "1. ", "2. ", etc.
  html = html.replace(/(^\d+\. .+$(\n\d+\. .+$)*)/gm, (block) => {
    const items = block.split('\n').map((line) => `<li>${line.replace(/^\d+\.\s/, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs: double newlines → paragraph breaks
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap blocks that are already block-level elements
      if (/^<(h[1-6]|ul|ol|hr|li|p|div|table)[\s>/]/i.test(trimmed)) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join('\n');

  // Single newlines within paragraphs → <br>
  html = html.replace(/(<p>[\s\S]*?<\/p>)/g, (p) => p.replace(/\n/g, '<br/>'));

  // Wrap heading + following content into <section> blocks so page-break
  // logic can keep a heading with its body and avoid breaks in headless sections.
  html = html.replace(
    /(<h[1-3][^>]*>)/g,
    '</section>\n<section class="has-heading">$1',
  );
  // Open a wrapper for the leading (headless) content and close the last section
  html = '<section>' + html + '</section>';
  // Remove the empty first </section> artifact
  html = html.replace('<section></section>', '');

  return html;
}

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
  /** Facility MFL code (Master Facility List) */
  facilityMflCode?: string;
  /** Facility location (e.g. "Westlands, Nairobi") */
  facilityLocation?: string;
  /** Facility phone number */
  facilityPhone?: string;
  /** Facility email */
  facilityEmail?: string;
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

  .header .facility-detail {
    font-size: 9pt;
    font-weight: 400;
    color: #555;
    margin-top: 2px;
    line-height: 1.4;
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
    font-size: 11pt;
    line-height: 1.7;
    margin-bottom: 24px;
  }

  .content h1 { font-size: 14pt; font-weight: 700; margin: 16px 0 8px; }
  .content h2 { font-size: 13pt; font-weight: 600; margin: 14px 0 6px; }
  .content h3 { font-size: 12pt; font-weight: 600; margin: 12px 0 4px; }

  .content p { margin: 6px 0; }

  .content ul, .content ol {
    margin: 6px 0;
    padding-left: 24px;
  }
  .content ul { list-style-type: disc; }
  .content ol { list-style-type: decimal; }
  .content li { margin: 2px 0; }

  .content strong { font-weight: 700; }
  .content em { font-style: italic; }

  .content table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 10.5pt;
  }
  .content th, .content td {
    border: 1px solid #999;
    padding: 6px 10px;
    text-align: left;
  }
  .content th {
    background: #f2f2f2;
    font-weight: 600;
  }
  .content tr:nth-child(even) td {
    background: #fafafa;
  }
  .content hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }

  .qr-block {
    text-align: center;
    margin-top: 24px;
  }
  .qr-block img {
    display: inline-block;
  }
  .qr-block .qr-label {
    font-size: 8pt;
    color: #777;
    margin-top: 4px;
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

  @page {
    size: A4;
    margin: 0;  /* Suppress browser-injected headers and footers */
  }

  @media print {
    body { padding: 15mm 20mm; }
    .no-print { display: none !important; }

    /* Keep header + patient info together on first page */
    .header, .patient-info {
      page-break-inside: avoid;
    }

    /* Allow natural breaks between content blocks */
    .content {
      orphans: 3;
      widows: 3;
    }

    /* Sections without a heading: never start a new page */
    .content section {
      page-break-before: avoid;
    }

    /* Sections WITH a heading: allow (but don't force) a page break before */
    .content section.has-heading {
      page-break-before: auto;
      page-break-inside: auto;
    }

    /* Don't strand headings at the bottom of a page */
    .content h1, .content h2, .content h3 {
      page-break-after: avoid;
    }

    /* Keep list items together when possible */
    .content ul, .content ol {
      page-break-inside: avoid;
    }

    /* Tables: allow page breaks between rows but never inside a row */
    .content table {
      page-break-inside: auto;
    }
    .content thead {
      display: table-header-group;  /* Repeat header on every page */
    }
    .content tr {
      page-break-inside: avoid;
    }

    /* Signature block must stay together and on the last page */
    .signature-block {
      page-break-inside: avoid;
    }

    /* Footer stays at the bottom */
    .footer {
      page-break-inside: avoid;
    }
  }
`;

// =============================================================================
// TEMPLATE BUILDER
// =============================================================================

function buildDischargeHtml(data: DischargeDocumentData, qrDataUri?: string): string {
  const now = new Date();
  const dischargeDate = data.dischargeDate
    ? formatDate(data.dischargeDate)
    : formatDate(now.toISOString());
  const admissionDate = data.admissionDate
    ? formatDate(data.admissionDate)
    : '';

  // Build facility detail line(s) under the name
  const facilityDetails: string[] = [];
  if (data.facilityMflCode) facilityDetails.push(`MFL: ${escapeHtml(data.facilityMflCode)}`);
  if (data.facilityLocation) facilityDetails.push(escapeHtml(data.facilityLocation));
  if (data.facilityPhone) facilityDetails.push(`Tel: ${escapeHtml(data.facilityPhone)}`);
  if (data.facilityEmail) facilityDetails.push(escapeHtml(data.facilityEmail));

  return `
<div class="header">
  <div>
    <div class="facility">${escapeHtml(data.facilityName || 'Health Facility')}</div>
    ${facilityDetails.length ? `<div class="facility-detail">${facilityDetails.join(' &bull; ')}</div>` : ''}
  </div>
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

<div class="content">${contentToHtml(stripAdvisoryContent(data.content))}</div>

<div class="signature-block">
  <div class="sig">
    <div class="line">Discharging Officer</div>
  </div>
  ${qrDataUri ? `
  <div class="qr-block">
    <img src="${qrDataUri}" alt="QR Code" width="80" height="80" />
    <div class="qr-label">${escapeHtml(data.admissionNumber || '')}</div>
  </div>
  ` : ''}
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
 * Generates a QR code encoding the admission number for quick record lookup.
 */
export async function printDischargeDocument(data: DischargeDocumentData): Promise<Window | null> {
  // Generate QR code encoding admission number
  let qrDataUri: string | undefined;
  if (data.admissionNumber) {
    try {
      qrDataUri = await generateQRDataUri(`VITORA:ADM:${data.admissionNumber}`, { size: 80 });
    } catch {
      // QR generation is best-effort — print without it
    }
  }

  const bodyHtml = buildDischargeHtml(data, qrDataUri);
  const title = `${data.documentTitle} - ${data.patientName}`;
  const html = buildPrintDocument(bodyHtml, title, 'a4', 'default', DISCHARGE_CSS);
  return openPrintWindow(html);
}
