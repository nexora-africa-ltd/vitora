'use client';

import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, FileText, Printer, Loader2 } from 'lucide-react';
import { exportToCSV, exportToPDF, downloadPDF } from '@/lib/export-utils';

interface ExportButtonProps {
  /** Data to export (array for tables, object for single record) */
  data: any;
  /** Filename without extension */
  filename: string;
  /** Document title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Facility info for PDF header */
  facility?: {
    name: string;
    address?: string;
    phone?: string;
  };
  /** Table columns for PDF (if not provided, auto-detects from data) */
  columns?: Array<{
    header: string;
    dataKey: string;
    width?: number;
  }>;
  /** Show print option */
  showPrint?: boolean;
  /** Show CSV option */
  showCSV?: boolean;
  /** Show PDF option */
  showPDF?: boolean;
  /** Button variant */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  /** Button size */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ExportButton({
  data,
  filename,
  title,
  subtitle,
  facility,
  columns,
  showPrint = true,
  showCSV = true,
  showPDF = true,
  variant = 'outline',
  size = 'default',
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportPDF = async () => {
    if (!data) return;

    setExporting(true);
    try {
      const blob = await exportToPDF(title, data, {
        includeHeader: !!facility,
        includeFooter: true,
        facility,
        subtitle,
        columns,
      });
      downloadPDF(blob, filename);
    } catch (error) {
      console.error('Failed to export PDF:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (!data) return;

    // Ensure data is an array for CSV export
    const arrayData = Array.isArray(data) ? data : [data];
    exportToCSV(arrayData, filename);
  };

  const handlePrint = () => {
    window.print();
  };

  const hasNoOptions = !showPDF && !showCSV && !showPrint;
  if (hasNoOptions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={exporting || !data}>
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {showPDF && (
          <DropdownMenuItem onClick={handleExportPDF} disabled={exporting}>
            <FileText className="h-4 w-4 mr-2" />
            Export as PDF
          </DropdownMenuItem>
        )}
        {showCSV && (
          <DropdownMenuItem onClick={handleExportCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export as CSV
          </DropdownMenuItem>
        )}
        {showPrint && (showPDF || showCSV) && <DropdownMenuSeparator />}
        {showPrint && (
          <DropdownMenuItem onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
