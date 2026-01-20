import { jsPDF } from 'jspdf';
import { Parser } from '@json2csv/plainjs';

export async function exportToPDF(
  title: string,
  data: any,
  options: PDFExportOptions = {}
): Promise<Blob> {
  const doc = new jsPDF();

  // Add header
  doc.setFontSize(18);
  doc.text(title, 14, 22);

  // Add date
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

  // Add content based on data type
  // ... implementation

  return doc.output('blob');
}

export function exportToCSV(
  data: Record<string, any>[],
  filename: string
): void {
  const parser = new Parser();
  const csv = parser.parse(data);

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${formatDate(new Date())}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

interface PDFExportOptions {
  // Define any options you want to support
  includeHeader?: boolean;
  includeFooter?: boolean;
}
