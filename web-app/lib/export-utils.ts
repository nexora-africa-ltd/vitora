import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Parser } from '@json2csv/plainjs';

// ============================================================================
// Types
// ============================================================================

interface PDFExportOptions {
  /** Include facility header with name/address */
  includeHeader?: boolean;
  /** Include page footer with date/page numbers */
  includeFooter?: boolean;
  /** Facility information for header */
  facility?: {
    name: string;
    address?: string;
    phone?: string;
  };
  /** Page orientation */
  orientation?: 'portrait' | 'landscape';
  /** Custom subtitle under the title */
  subtitle?: string;
  /** Table columns configuration - if provided, renders data as table */
  columns?: Array<{
    header: string;
    dataKey: string;
    width?: number;
  }>;
}

interface ReceiptPDFOptions {
  facilityName: string;
  facilityAddress?: string;
  facilityPhone?: string;
  receiptNumber: string;
  date: string;
  patientName: string;
  patientMrn?: string;
  paymentMethod: string;
  amount: number;
  amountInWords: string;
  servedBy?: string;
  paymentPoint?: string;
}

// ============================================================================
// PDF Export Functions
// ============================================================================

/**
 * Export data to PDF with auto-table support
 */
export async function exportToPDF(
  title: string,
  data: any,
  options: PDFExportOptions = {}
): Promise<Blob> {
  const {
    includeHeader = true,
    includeFooter = true,
    facility,
    orientation = 'portrait',
    subtitle,
    columns,
  } = options;

  const doc = new jsPDF({ orientation });
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 15;

  // Facility header
  if (includeHeader && facility) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(facility.name, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (facility.address) {
      doc.text(facility.address, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 4;
    }
    if (facility.phone) {
      doc.text(facility.phone, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 4;
    }
    yPosition += 4;
  }

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 8;

  // Subtitle
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 6;
  }

  // Generation date
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
  doc.setTextColor(0);
  yPosition += 10;

  // Content
  if (Array.isArray(data) && data.length > 0) {
    if (columns) {
      // Render as table with specified columns
      autoTable(doc, {
        startY: yPosition,
        head: [columns.map((col) => col.header)],
        body: data.map((row) => columns.map((col) => formatCellValue(row[col.dataKey]))),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [61, 0, 15], textColor: 255 }, // Brand burgundy
        alternateRowStyles: { fillColor: [248, 248, 248] },
        margin: { left: 14, right: 14 },
      });
    } else {
      // Auto-detect columns from first row
      const keys = Object.keys(data[0]);
      autoTable(doc, {
        startY: yPosition,
        head: [keys.map(formatColumnHeader)],
        body: data.map((row) => keys.map((key) => formatCellValue(row[key]))),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [61, 0, 15], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        margin: { left: 14, right: 14 },
      });
    }
  } else if (typeof data === 'object' && data !== null) {
    // Render key-value pairs for single object
    const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined);
    autoTable(doc, {
      startY: yPosition,
      body: entries.map(([key, value]) => [formatColumnHeader(key), formatCellValue(value)]),
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 'auto' },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer with page numbers
  if (includeFooter) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
  }

  return doc.output('blob');
}

/**
 * Generate a payment receipt PDF
 */
export async function exportReceiptToPDF(options: ReceiptPDFOptions): Promise<Blob> {
  const doc = new jsPDF({ format: [80, 200], unit: 'mm' }); // Thermal receipt size
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 10;

  // Facility header
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(options.facilityName, pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (options.facilityAddress) {
    doc.text(options.facilityAddress, pageWidth / 2, y, { align: 'center' });
    y += 4;
  }
  if (options.facilityPhone) {
    doc.text(options.facilityPhone, pageWidth / 2, y, { align: 'center' });
    y += 4;
  }

  // Divider
  y += 2;
  doc.setDrawColor(200);
  doc.line(5, y, pageWidth - 5, y);
  y += 4;

  // Title
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT RECEIPT', pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Receipt details
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const details = [
    ['Receipt No:', options.receiptNumber],
    ['Date:', options.date],
    ['Patient:', options.patientName],
    ...(options.patientMrn ? [['MRN:', options.patientMrn]] : []),
    ['Payment:', options.paymentMethod],
    ...(options.servedBy ? [['Served By:', options.servedBy]] : []),
    ...(options.paymentPoint ? [['Till/Point:', options.paymentPoint]] : []),
  ];

  details.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label as string, 5, y);
    doc.text(value as string, pageWidth - 5, y, { align: 'right' });
    y += 4;
  });

  // Divider
  y += 2;
  doc.line(5, y, pageWidth - 5, y);
  y += 6;

  // Amount
  doc.setFontSize(8);
  doc.text('Amount Paid', pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`KES ${options.amount.toFixed(2)}`, pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  // Wrap amount in words
  const wordsLines = doc.splitTextToSize(options.amountInWords, pageWidth - 10);
  doc.text(wordsLines, pageWidth / 2, y, { align: 'center' });
  y += wordsLines.length * 3 + 4;

  // Divider
  doc.line(5, y, pageWidth - 5, y);
  y += 4;

  // Footer
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for your payment', pageWidth / 2, y, { align: 'center' });
  y += 3;
  doc.text('This is a computer-generated receipt', pageWidth / 2, y, { align: 'center' });

  return doc.output('blob');
}

/**
 * Print the current page content (simple wrapper for window.print)
 */
export function printPage(): void {
  window.print();
}

// ============================================================================
// CSV Export Functions
// ============================================================================

/**
 * Export data array to CSV and trigger download
 */
export function exportToCSV(
  data: Record<string, any>[],
  filename: string
): void {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const parser = new Parser();
  const csv = parser.parse(data);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${formatDate(new Date())}.csv`);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a date as YYYYMMDD for filenames
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Convert camelCase/snake_case to Title Case for column headers
 */
function formatColumnHeader(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Format cell values for display in tables
 */
function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'number') {
    // Format currency if it looks like money
    if (value >= 100 && Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toString();
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Trigger a blob download
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download a PDF blob
 */
export function downloadPDF(blob: Blob, filename: string): void {
  downloadBlob(blob, `${filename}_${formatDate(new Date())}.pdf`);
}
