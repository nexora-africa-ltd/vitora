/**
 * Print MCH Growth Booklet Utility
 *
 * Generates a printable A5 portrait document that mirrors the Kenya MCH
 * "Road to Health" booklet for a single growth indicator (weight-for-age
 * or height-for-age). The chart SVG is extracted from a live Recharts
 * `ResponsiveContainer` element on the page and embedded into a fresh
 * document along with patient header, legend, and KEPI vaccine reference.
 *
 * Usage:
 *   const node = document.querySelector('.mch-booklet-print svg');
 *   printGrowthBooklet({ chartSvgElement: node, ...meta });
 */

import { buildPrintDocument, openPrintWindow, escapeHtml } from './renderer';
import type { FacilityInfo } from './types';

export interface PrintGrowthBookletOptions {
  /** Live `<svg>` element rendered by Recharts inside the chart container. */
  chartSvgElement: SVGSVGElement | null;
  /** Display title of the indicator (e.g. "Weight-for-Age"). */
  indicatorLabel: string;
  /** "Boys" | "Girls" — drives the reference text. */
  sexLabel: string;
  /** Patient name; omit for generic reference printouts. */
  patientName?: string;
  /** Patient MRN; omit for generic reference printouts. */
  patientMrn?: string;
  /** Patient date of birth (ISO) for display only. */
  patientDob?: string;
  /** Facility info for the printed header. */
  facility?: FacilityInfo;
}

const BOOKLET_CSS = `
  @page {
    size: A4 landscape;
    margin: 10mm;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 10px;
    color: #111;
    margin: 0;
    padding: 0;
  }

  .booklet {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .booklet-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #15803d;
    padding-bottom: 6px;
  }

  .booklet-header h1 {
    font-size: 13px;
    font-weight: 700;
    margin: 0;
    color: #15803d;
  }

  .booklet-header .sub {
    font-size: 9px;
    color: #555;
    margin-top: 2px;
  }

  .booklet-header .facility {
    text-align: right;
    font-size: 9px;
    color: #444;
  }

  .booklet-header .facility strong {
    display: block;
    font-size: 10px;
    color: #111;
  }

  .patient-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 4px 6px;
    font-size: 9px;
  }

  .patient-strip .field-label {
    color: #666;
    text-transform: uppercase;
    font-size: 7.5px;
    letter-spacing: 0.4px;
  }

  .patient-strip .field-value {
    font-weight: 600;
    color: #111;
  }

  .chart-frame {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px;
    background: white;
  }

  .chart-frame svg {
    width: 100%;
    height: auto;
    max-height: 16cm;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 8.5px;
    padding: 4px 0;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .swatch-band {
    display: inline-block;
    width: 14px;
    height: 8px;
    background: rgba(34, 197, 94, 0.25);
    border: 1px solid #16a34a;
    border-radius: 2px;
  }

  .swatch-line {
    display: inline-block;
    width: 14px;
    height: 2px;
    background: #15803d;
  }

  .swatch-vaccine {
    display: inline-block;
    width: 14px;
    border-top: 1px dashed #7c3aed;
  }

  .swatch-patient {
    display: inline-block;
    width: 14px;
    height: 2px;
    background: #2563eb;
  }

  .vaccine-key {
    border-top: 1px solid #eee;
    padding-top: 4px;
    font-size: 8px;
    color: #444;
  }

  .vaccine-key strong {
    color: #6d28d9;
  }

  .booklet-footer {
    border-top: 1px solid #ccc;
    padding-top: 4px;
    display: flex;
    justify-content: space-between;
    font-size: 7.5px;
    color: #666;
  }

  /* Recharts inline styles already cover stroke/fill colours.
     Force any text inside the chart to print darkly so axis labels
     remain legible on monochrome printers. */
  .chart-frame .recharts-cartesian-axis-tick text,
  .chart-frame .recharts-label,
  .chart-frame .recharts-legend-item-text {
    fill: #111 !important;
    color: #111 !important;
  }
`;

/**
 * Serialize an `<svg>` element to a standalone XML string suitable
 * for embedding in an external document.
 */
function serializeSvg(svg: SVGSVGElement): string {
  // Clone to avoid mutating the live DOM
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Ensure namespace and explicit dimensions are present
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  const width = clone.getAttribute('width');
  const height = clone.getAttribute('height');
  if (width && height && !clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  // Strip width/height so it scales to container
  clone.removeAttribute('width');
  clone.removeAttribute('height');
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return new XMLSerializer().serializeToString(clone);
}

function buildBookletHtml(options: PrintGrowthBookletOptions): string {
  const {
    chartSvgElement,
    indicatorLabel,
    sexLabel,
    patientName,
    patientMrn,
    patientDob,
    facility,
  } = options;

  const svgMarkup = chartSvgElement
    ? serializeSvg(chartSvgElement)
    : '<div style="padding:24px;text-align:center;color:#999;">No chart to print</div>';

  const facilityHeader = facility
    ? `<div class="facility">
        <strong>${escapeHtml(facility.name)}</strong>
        ${facility.address ? escapeHtml(facility.address) : ''}
       </div>`
    : '';

  const patientStrip = patientName
    ? `<div class="patient-strip">
        <div>
          <div class="field-label">Child</div>
          <div class="field-value">${escapeHtml(patientName)}</div>
        </div>
        <div>
          <div class="field-label">MRN</div>
          <div class="field-value">${escapeHtml(patientMrn ?? '—')}</div>
        </div>
        <div>
          <div class="field-label">Date of Birth</div>
          <div class="field-value">${escapeHtml(patientDob ?? '—')}</div>
        </div>
        <div>
          <div class="field-label">Sex</div>
          <div class="field-value">${escapeHtml(sexLabel)}</div>
        </div>
       </div>`
    : '';

  const printedOn = new Date().toLocaleString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
    <div class="booklet">
      <div class="booklet-header">
        <div>
          <h1>Kenya MCH Booklet — ${escapeHtml(indicatorLabel)}</h1>
          <div class="sub">${escapeHtml(sexLabel)} · 0–60 months · WHO 3rd–97th centile road</div>
        </div>
        ${facilityHeader}
      </div>

      ${patientStrip}

      <div class="chart-frame">${svgMarkup}</div>

      <div class="legend">
        <span class="legend-item"><span class="swatch-band"></span>Healthy road (3rd–97th centile)</span>
        <span class="legend-item"><span class="swatch-line"></span>Median (target)</span>
        <span class="legend-item"><span class="swatch-vaccine"></span>Vaccine due (KEPI)</span>
        <span class="legend-item"><span class="swatch-patient"></span>Patient measurements</span>
      </div>

      <div class="vaccine-key">
        <strong>KEPI schedule:</strong>
        BCG &amp; OPV0 at birth ·
        Penta/OPV/PCV/Rota 1–3 at 6, 10, 14 weeks ·
        Measles-Rubella 1 at 9 months · MR 2 at 18 months
      </div>

      <div class="booklet-footer">
        <span>Vitora HMIS · MCH Module</span>
        <span>Printed ${escapeHtml(printedOn)}</span>
      </div>
    </div>
  `;
}

/**
 * Generate and open a printable A5 MCH growth booklet.
 */
export function printGrowthBooklet(options: PrintGrowthBookletOptions): Window | null {
  const bodyHtml = buildBookletHtml(options);
  // Use 'a4' as the layout key; our BOOKLET_CSS overrides @page to A5 portrait.
  const html = buildPrintDocument(
    bodyHtml,
    `MCH Booklet — ${options.indicatorLabel}`,
    'a4',
    'default',
    BOOKLET_CSS,
  );
  return openPrintWindow(html);
}
