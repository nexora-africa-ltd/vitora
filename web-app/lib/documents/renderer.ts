/**
 * Document Renderer
 *
 * Core template rendering engine that:
 * - Replaces variable bindings in HTML templates
 * - Processes repeating sections (tables, lists)
 * - Generates QR codes/barcodes
 * - Injects CSS based on layout and theme
 */

import type {
  DocumentDefinition,
  Repeater,
  RenderContext,
  LayoutType,
  PrintOptions,
  SignatureInfo,
} from './types';
import {
  generateQRDataUri,
  generateQRBlockHtml,
  type QRContent,
  type QRCodeOptions,
} from '@/lib/utils/qr';

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  const str = String(text);
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Format a date string for display
 */
export function formatDate(
  dateStr: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options,
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a date with time
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Render the "Signature & Stamp" column in a print template.
 *
 * If digital signature data is provided, renders signer identity,
 * timestamp, and verification status. Otherwise, renders the static
 * "Signature & Stamp" placeholder for manual signing.
 */
export function renderSignatureColumn(signature?: SignatureInfo): string {
  if (!signature) {
    return `<div class="sig">Signature &amp; Stamp</div>`;
  }
  const signedDate = formatDateTime(signature.signed_at);
  const status = signature.is_valid !== false
    ? '✓ Digitally Signed'
    : '⚠ Signature Invalid';
  const statusColor = signature.is_valid !== false ? '#16a34a' : '#dc2626';
  return `<div class="sig">
      <span style="color: ${statusColor}; font-weight: 600; font-size: 11px;">${status}</span><br />
      ${escapeHtml(signature.signer_full_name)}<br />
      ${signedDate}${signature.certificate_serial ? `<br /><span style="font-size: 10px; color: #666;">Cert: ${escapeHtml(signature.certificate_serial)}</span>` : ''}
    </div>`;
}

/**
 * Resolve a dot-notation path from an object
 * e.g., resolveDataPath({ patient: { name: "John" } }, "patient.name") → "John"
 */
export function resolveDataPath(
  data: Record<string, unknown>,
  path: string
): unknown {
  if (!path || !data) return undefined;

  const parts = path.split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Resolve a binding placeholder to its value
 * Handles date formatting if the value looks like a date
 */
export function resolveBinding(
  binding: string,
  data: Record<string, unknown>,
  bindings: Record<string, string>
): string {
  const dataPath = bindings[binding];
  if (!dataPath) return '';

  const value = resolveDataPath(data, dataPath);
  if (value === null || value === undefined) return '';

  // Auto-format dates
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDate(value);
  }

  return escapeHtml(String(value));
}

// =============================================================================
// TEMPLATE PROCESSING
// =============================================================================

/**
 * Replace all simple bindings in a template string
 */
export function replaceBindings(
  template: string,
  data: Record<string, unknown>,
  bindings: Record<string, string>
): string {
  let result = template;

  for (const [placeholder, dataPath] of Object.entries(bindings)) {
    const value = resolveDataPath(data, dataPath);
    const displayValue =
      value !== null && value !== undefined
        ? typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
          ? formatDate(value)
          : escapeHtml(String(value))
        : '';

    // Replace all occurrences of the placeholder
    result = result.split(placeholder).join(displayValue);
  }

  return result;
}

/**
 * Process a repeater section (e.g., table rows for medications)
 */
export function processRepeater(
  template: string,
  repeater: Repeater,
  items: unknown[]
): string {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return template;
  }

  // Find the repeater template in the HTML
  // For tbody > tr, we need to find the row template
  const rowMatch = template.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!rowMatch || !rowMatch[1]) return template;

  const tbodyContent = rowMatch[1];
  const rowTemplateMatch = tbodyContent.match(/<tr[^>]*>[\s\S]*?<\/tr>/i);
  if (!rowTemplateMatch) return template;

  const rowTemplate = rowTemplateMatch[0];

  // Generate rows for each item
  const rows = items
    .map((item, index) => {
      if (typeof item !== 'object' || item === null) return '';

      let row = rowTemplate;
      const itemData = item as Record<string, unknown>;

      // Replace row number placeholder
      row = row.replace(/\{\{index\}\}/g, String(index + 1));
      row = row.replace(/<td>1<\/td>/, `<td>${index + 1}</td>`);

      // Replace field bindings
      for (const [placeholder, fieldPath] of Object.entries(repeater.fields)) {
        const value = resolveDataPath(itemData, fieldPath) ?? '';
        row = row.split(placeholder).join(escapeHtml(String(value)));
      }

      return row;
    })
    .join('\n          ');

  // Replace the tbody content with generated rows
  return template.replace(
    /<tbody[^>]*>[\s\S]*?<\/tbody>/i,
    `<tbody>\n          ${rows}\n        </tbody>`
  );
}

/**
 * Generate a simple QR code placeholder for templates
 * Used when no actual QR data is available
 */
export function generateQRPlaceholder(data: string, width = 90, height = 90): string {
  return `
    <div style="width: ${width}px; height: ${height}px; border: 1px dashed #999;
                display: flex; align-items: center; justify-content: center;
                font-size: 9px; text-align: center; word-break: break-all;">
      ${escapeHtml(data)}
    </div>
  `;
}

/**
 * Generate actual QR code HTML with verification status label
 *
 * @param qrContent - QR content with verification status
 * @param options - QR code options
 * @returns Promise resolving to HTML string with QR image and label
 */
export async function generateQRHtml(
  qrContent: QRContent,
  options: QRCodeOptions = {}
): Promise<string> {
  return generateQRBlockHtml(qrContent, options);
}

/**
 * Generate QR image only (without label)
 *
 * @param data - Data to encode
 * @param size - Size in pixels
 * @returns Promise resolving to img tag HTML
 */
export async function generateQRImageHtml(
  data: string,
  size = 90
): Promise<string> {
  const dataUri = await generateQRDataUri(data, { size });
  return `<img src="${dataUri}" alt="QR Code" width="${size}" height="${size}" style="display: block;" />`;
}

// =============================================================================
// CSS GENERATION
// =============================================================================

/**
 * Get base CSS for document printing
 */
export function getBaseCSS(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Force background colours/images to print by default for every
       document built via buildPrintDocument(). Browsers normally drop
       backgrounds unless the user enables "Background graphics" in the
       print dialog — these properties opt every printed document in. */
    html,
    body,
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      background: #fff;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
    }
  `;
}

/**
 * Get layout-specific CSS
 */
export function getLayoutCSS(layout: LayoutType): string {
  switch (layout) {
    case 'a4':
      return `
        @page {
          size: A4;
          margin: 20mm;
        }

        .page {
          max-width: 794px;
          margin: auto;
          padding: 32px;
        }
      `;

    case 'label':
      return `
        @page {
          size: auto;
          margin: 0;
        }

        body {
          padding: 8px;
        }

        .label {
          width: 280px;
          border: 1px solid #000;
          padding: 8px;
        }
      `;

    case 'thermal-58mm':
      return `
        @page {
          size: 58mm auto;
          margin: 0;
        }

        body {
          padding: 3mm;
        }

        .label {
          width: 58mm;
          padding: 3mm;
          font-size: 10px;
        }

        table {
          display: none;
        }

        .qr {
          width: 40px;
          height: 40px;
        }
      `;

    case 'thermal-80mm':
      return `
        @page {
          size: 80mm auto;
          margin: 0;
        }

        body {
          padding: 4mm;
        }

        .label, .page {
          width: 80mm;
          padding: 4mm;
        }

        table, th, td {
          font-size: 10px;
        }

        .qr {
          width: 40px;
          height: 40px;
        }
      `;

    default:
      return '';
  }
}

/**
 * Get theme CSS (CSS variables)
 */
export function getThemeCSS(theme: string = 'default'): string {
  const themes: Record<string, string> = {
    default: `
      :root {
        --primary-color: #000;
        --border-color: #000;
        --accent-color: #333;
        --muted-color: #666;
        --background-color: #fff;
        --header-bg: #f2f2f2;
      }
    `,
    'facility-private': `
      :root {
        --primary-color: #0a3d62;
        --border-color: #0a3d62;
        --accent-color: #1e88e5;
        --muted-color: #555;
        --background-color: #fff;
        --header-bg: #e3f2fd;
      }

      .header {
        border-bottom-color: var(--primary-color);
      }

      h1 {
        color: var(--primary-color);
      }
    `,
    'facility-public': `
      :root {
        --primary-color: #1b5e20;
        --border-color: #1b5e20;
        --accent-color: #43a047;
        --muted-color: #555;
        --background-color: #fff;
        --header-bg: #e8f5e9;
      }

      .header {
        border-bottom-color: var(--primary-color);
      }

      h1 {
        color: var(--primary-color);
      }
    `,
  };

  return themes[theme] ?? themes['default'] ?? '';
}

// =============================================================================
// MAIN RENDERER
// =============================================================================

/**
 * Render a document by applying data to an HTML template (synchronous)
 *
 * Note: This version uses placeholders for QR codes.
 * Use renderDocumentAsync for actual QR generation.
 *
 * @param htmlTemplate - The raw HTML template string
 * @param schema - Document definition with bindings and repeaters
 * @param data - Data context (patient, prescription, facility, etc.)
 * @param options - Print/render options
 * @returns Fully populated HTML string ready for printing
 */
export function renderDocument(
  htmlTemplate: string,
  schema: DocumentDefinition,
  data: RenderContext,
  options?: PrintOptions
): string {
  let html = htmlTemplate;

  // 1. Replace simple bindings
  html = replaceBindings(html, data as Record<string, unknown>, schema.bindings);

  // 2. Process repeaters (table rows, etc.)
  if (schema.repeaters) {
    for (const repeater of schema.repeaters) {
      const items = resolveDataPath(
        data as Record<string, unknown>,
        repeater.source
      ) as unknown[];
      if (items) {
        html = processRepeater(html, repeater, items);
      }
    }
  }

  // 3. Generate QR codes (placeholder for sync version)
  if (schema.assets?.qr) {
    const qrAsset = schema.assets.qr;
    const qrData = resolveDataPath(
      data as Record<string, unknown>,
      qrAsset.source
    );
    if (qrData) {
      const qrHtml = generateQRPlaceholder(
        String(qrData),
        qrAsset.width,
        qrAsset.height
      );
      html = html.replace(
        /<div class="qr">[\s\S]*?<\/div>/i,
        `<div class="qr">${qrHtml}</div>`
      );
    }
  }

  return html;
}

/**
 * Render a document with actual QR code generation (async)
 *
 * This version generates real QR codes using the qrcode library.
 * Includes verification status labels based on whether the QR contains
 * a backend-signed verification URL.
 *
 * @param htmlTemplate - The raw HTML template string
 * @param schema - Document definition with bindings and repeaters
 * @param data - Data context (patient, prescription, facility, etc.)
 * @param qrContent - QR content with verification status
 * @param options - Print/render options
 * @returns Promise resolving to fully populated HTML string
 */
export async function renderDocumentAsync(
  htmlTemplate: string,
  schema: DocumentDefinition,
  data: RenderContext,
  qrContent?: QRContent,
  options?: PrintOptions
): Promise<string> {
  // First do synchronous rendering
  let html = renderDocument(htmlTemplate, schema, data, options);

  // Then replace QR placeholder with actual QR code
  if (qrContent && html.includes('class="qr"')) {
    const qrBlockHtml = await generateQRBlockHtml(qrContent, {
      size: schema.assets?.qr?.width || 90,
    });
    html = html.replace(
      /<div class="qr">[\s\S]*?<\/div>/i,
      `<div class="qr">${qrBlockHtml}</div>`
    );
  }

  return html;
}

/**
 * Build a complete HTML document with CSS for printing
 */
export function buildPrintDocument(
  bodyHtml: string,
  title: string,
  layout: LayoutType = 'a4',
  theme: string = 'default',
  additionalCSS: string = ''
): string {
  const baseCSS = getBaseCSS();
  const layoutCSS = getLayoutCSS(layout);
  const themeCSS = getThemeCSS(theme);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${baseCSS}
    ${layoutCSS}
    ${themeCSS}
    ${additionalCSS}
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

/**
 * Open a print window with the rendered document
 */
export function openPrintWindow(html: string): Window | null {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Failed to open print window. Check popup blocker settings.');
    return null;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  // Trigger print after a short delay to ensure content is loaded
  setTimeout(() => {
    printWindow.print();
  }, 250);

  return printWindow;
}
