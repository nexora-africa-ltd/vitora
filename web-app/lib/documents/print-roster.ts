/**
 * Print Weekly Roster Utility
 *
 * Generates a printable A4 document for the weekly staff shift roster.
 * Uses the document renderer with the standard facility header/footer template.
 */

import type { FacilityInfo, LayoutType } from './types';
import { buildPrintDocument, openPrintWindow, escapeHtml } from './renderer';

// =============================================================================
// TYPES
// =============================================================================

export interface RosterShiftCell {
  /** Short label, e.g. "D", "N", "M" */
  short: string;
  /** Full label, e.g. "Day", "Night" */
  label: string;
  /** CSS background color for print (hex or named) */
  printColor: string;
}

export interface RosterStaffRow {
  name: string;
  /** 7 cells, one per day (Sun–Sat). null = no shift assigned */
  cells: (RosterShiftCell | null)[];
}

export interface PrintRosterOptions {
  /** Staff rows with shift assignments */
  rows: RosterStaffRow[];
  /** Date strings for the 7 columns (ISO format YYYY-MM-DD) */
  weekDates: string[];
  /** Human-readable week range, e.g. "Jun 29 – Jul 5, 2026" */
  weekLabel: string;
  /** Facility information for the header */
  facility?: FacilityInfo;
  /** Layout format (defaults to A4) */
  layout?: LayoutType;
  /** Theme name */
  theme?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Print-safe colors for each shift type */
export const SHIFT_PRINT_COLORS: Record<string, string> = {
  DAY: '#fef3c7',
  NIGHT: '#e0e7ff',
  MORNING: '#ffedd5',
  AFTERNOON: '#ffe4e6',
  ON_CALL: '#d1fae5',
  OVERTIME: '#f3e8ff',
};

// =============================================================================
// TEMPLATE
// =============================================================================

function buildRosterHtml(options: PrintRosterOptions): string {
  const { rows, weekDates, weekLabel, facility } = options;

  const facilityName = escapeHtml(facility?.name || 'Healthcare Facility');
  const facilityAddress = facility?.address ? escapeHtml(facility.address) : '';
  const facilityPhone = facility?.phone ? `Tel: ${escapeHtml(facility.phone)}` : '';
  const facilityLicense = facility?.license ? `License No: ${escapeHtml(facility.license)}` : '';

  // Day column headers
  const dayHeaders = weekDates
    .map((dateStr, i) => {
      const d = new Date(dateStr + 'T00:00:00');
      const dayNum = d.getDate();
      return `<th>${escapeHtml(DAY_LABELS[i] || '')}<br/><span class="day-num">${dayNum}</span></th>`;
    })
    .join('\n          ');

  // Staff rows
  const staffRows = rows
    .map((row, idx) => {
      const cells = row.cells
        .map((cell) => {
          if (!cell) return '<td></td>';
          return `<td style="background:${cell.printColor};">${escapeHtml(cell.short)}</td>`;
        })
        .join('');
      return `<tr${idx % 2 === 1 ? ' class="alt"' : ''}><td class="staff-name">${escapeHtml(row.name)}</td>${cells}</tr>`;
    })
    .join('\n        ');

  // Legend — collect unique shift types present in the roster
  const seen = new Set<string>();
  const legendItems: { short: string; label: string; color: string }[] = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell && !seen.has(cell.short)) {
        seen.add(cell.short);
        legendItems.push({ short: cell.short, label: cell.label, color: cell.printColor });
      }
    }
  }
  const legendHtml = legendItems
    .map(
      (item) =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${item.color};"></span>${escapeHtml(item.short)} = ${escapeHtml(item.label)}</span>`
    )
    .join(' ');

  const printDate = new Date().toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
<div class="page">
  <div class="header">
    <div class="clinic-info">
      <strong>${facilityName}</strong><br />
      ${facilityAddress ? facilityAddress + '<br />' : ''}
      ${facilityPhone ? facilityPhone + '<br />' : ''}
      ${facilityLicense ? facilityLicense : ''}
    </div>
  </div>

  <h1>WEEKLY DUTY ROSTER</h1>

  <div class="week-range">${escapeHtml(weekLabel)}</div>

  <table>
    <thead>
      <tr>
        <th class="staff-col">Staff</th>
        ${dayHeaders}
      </tr>
    </thead>
    <tbody>
      ${staffRows}
    </tbody>
  </table>

  <div class="legend">
    <strong>Legend:</strong> ${legendHtml}
  </div>

  <div class="approval-block">
    <div class="sig">
      <div class="sig-line"></div>
      Prepared by
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      Approved by
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      Date
    </div>
  </div>

  <div class="footer">
    <div>Printed on ${escapeHtml(printDate)}</div>
    <div>Generated by Vitora HMIS</div>
  </div>
</div>`;
}

// =============================================================================
// CUSTOM CSS
// =============================================================================

const ROSTER_CSS = `
  h1 {
    margin: 12px 0 4px;
    font-size: 20px;
    text-align: center;
    letter-spacing: 1px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid var(--border-color, #000);
    padding-bottom: 10px;
    margin-bottom: 8px;
  }

  .clinic-info {
    font-size: 12px;
    line-height: 1.4;
  }

  .week-range {
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  th, td {
    border: 1px solid var(--border-color, #000);
    padding: 6px 8px;
    text-align: center;
    vertical-align: middle;
  }

  th {
    background: var(--header-bg, #f2f2f2);
    font-size: 11px;
    font-weight: 700;
  }

  th .day-num {
    font-size: 10px;
    font-weight: 400;
    color: #555;
  }

  th.staff-col {
    text-align: left;
    width: 180px;
  }

  td.staff-name {
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }

  tr.alt {
    background: #fafafa;
  }

  .legend {
    margin-top: 12px;
    font-size: 11px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    align-items: center;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .legend-swatch {
    display: inline-block;
    width: 14px;
    height: 10px;
    border: 1px solid #999;
  }

  .approval-block {
    margin-top: 36px;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .sig {
    width: 28%;
    text-align: center;
  }

  .sig-line {
    border-bottom: 1px solid var(--border-color, #000);
    height: 30px;
    margin-bottom: 4px;
  }

  .footer {
    margin-top: 20px;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    border-top: 1px solid #ccc;
    padding-top: 6px;
    color: #666;
  }
`;

// =============================================================================
// PRINT FUNCTION
// =============================================================================

/**
 * Generate and open a printable weekly roster document
 */
export function printRoster(options: PrintRosterOptions): Window | null {
  const layout = options.layout ?? 'a4';
  const theme = options.theme ?? 'default';

  const bodyHtml = buildRosterHtml(options);
  const html = buildPrintDocument(bodyHtml, 'Weekly Duty Roster', layout, theme, ROSTER_CSS);
  return openPrintWindow(html);
}
