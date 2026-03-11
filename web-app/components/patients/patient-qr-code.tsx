'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Download, Maximize2, Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { patientsApi } from '@/lib/api/patients';

interface PatientQRCodeProps {
  patientId: number;
  patientName: string;
  mrn: string;
  variant?: 'card' | 'inline';
}

/**
 * Patient QR code preview with expandable dialog.
 */
export function PatientQRCode({
  patientId,
  patientName,
  mrn,
  variant = 'card',
}: PatientQRCodeProps) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['patient-qr-code', patientId],
    queryFn: () => patientsApi.getQRCode(patientId),
    staleTime: Infinity, // QR is deterministic from MRN
  });

  const handlePrint = () => {
    if (!data) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head><title>Patient QR - ${mrn}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;">
          <img src="${data.qr_data_uri}" alt="QR Code" style="width:250px;height:250px;" />
          <p style="font-size:18px;font-weight:bold;margin-top:16px;">${patientName}</p>
          <p style="font-size:14px;color:#666;font-family:monospace;">${mrn}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownload = () => {
    if (!data) return;
    const link = document.createElement('a');
    link.href = data.qr_data_uri;
    link.download = `patient-qr-${mrn}.png`;
    link.click();
  };

  const previewSize = variant === 'inline' ? 56 : 100;
  const preview = isLoading ? (
    <Skeleton className={variant === 'inline' ? 'h-14 w-14 rounded-lg' : 'h-[100px] w-[100px] rounded-lg'} />
  ) : data ? (
    <div className="relative group">
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="cursor-pointer rounded-lg border bg-white p-2 transition-shadow hover:shadow-md"
        aria-label="Expand QR code"
      >
        <Image
          src={data.qr_data_uri}
          alt={`QR code for patient ${mrn}`}
          width={previewSize}
          height={previewSize}
          unoptimized
        />
      </button>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="absolute top-1 right-1 rounded-md bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
        aria-label="Expand QR code"
      >
        <Maximize2 className="h-3.5 w-3.5 text-[#800020]" />
      </button>
    </div>
  ) : null;

  return (
    <>
      {variant === 'inline' ? (
        <div className="shrink-0">
          {preview}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">QR Code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            {preview}
            <p className="text-center font-mono text-xs text-muted-foreground">{mrn}</p>
          </CardContent>
        </Card>
      )}

      {/* Expanded dialog with print/download */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Patient QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {data && (
              <>
                <div className="rounded-lg border bg-white p-4">
                  <Image
                    src={data.qr_data_uri}
                    alt={`QR code for patient ${mrn}`}
                    width={200}
                    height={200}
                    unoptimized
                  />
                </div>
                <div className="text-center">
                  <p className="font-medium">{patientName}</p>
                  <p className="font-mono text-sm text-muted-foreground">{mrn}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
