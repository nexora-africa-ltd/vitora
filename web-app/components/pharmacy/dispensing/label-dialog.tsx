/**
 * Label Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Dialog for printing dispensing labels with patient info,
 * drug details, dosage instructions, and expiry warning.
 */

'use client';

import { useRef } from 'react';
import { format } from 'date-fns';
import { Printer, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Dispensing } from '@/lib/types/pharmacy';

interface LabelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dispensing: Dispensing | null;
}

export function LabelDialog({ isOpen, onClose, dispensing }: LabelDialogProps) {
  const labelRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = labelRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Dispensing Label</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 10px;
            }
            .label {
              border: 2px solid #000;
              padding: 12px;
              width: 280px;
              font-size: 11px;
            }
            .header {
              text-align: center;
              border-bottom: 1px solid #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .header h1 {
              margin: 0;
              font-size: 14px;
            }
            .section {
              margin-bottom: 6px;
            }
            .section-title {
              font-weight: bold;
              font-size: 10px;
              color: #666;
            }
            .section-content {
              font-size: 12px;
            }
            .drug-name {
              font-size: 14px;
              font-weight: bold;
            }
            .instructions {
              background: #f5f5f5;
              padding: 6px;
              border-radius: 4px;
              font-size: 11px;
            }
            .warning {
              border: 1px solid #f00;
              background: #fff5f5;
              padding: 4px;
              font-size: 10px;
              color: #c00;
              margin-top: 8px;
            }
            .footer {
              margin-top: 8px;
              padding-top: 8px;
              border-top: 1px dashed #999;
              font-size: 9px;
              color: #666;
            }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  if (!dispensing) return null;

  const dispensedDate = format(new Date(dispensing.dispensed_at), 'MMM d, yyyy');
  const expiryDate = dispensing.batch_expiry || 'N/A';
  
  // Get dosage instructions from prescription if available
  const instructions = dispensing.dosage || dispensing.instructions || '2 tablets three times daily';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Dispensing Label
          </DialogTitle>
          <DialogDescription>
            Preview and print the medication label for the patient.
          </DialogDescription>
        </DialogHeader>

        {/* Label Preview */}
        <div className="flex justify-center p-4 bg-muted/30 rounded-md">
          <div ref={labelRef} className="label bg-white border-2 border-black p-3 w-72 text-xs">
            {/* Header */}
            <div className="header text-center border-b border-black pb-2 mb-2">
              <h1 className="text-sm font-bold m-0">VITORA PHARMACY</h1>
              <p className="text-[10px] text-muted-foreground m-0">Healthcare Excellence</p>
            </div>

            {/* Patient Name */}
            <div className="section mb-1">
              <span className="section-title text-[10px] text-muted-foreground">Patient:</span>
              <div className="section-content text-sm font-semibold">{dispensing.patient_name}</div>
            </div>

            {/* Drug Name */}
            <div className="section mb-1">
              <span className="section-title text-[10px] text-muted-foreground">Medication:</span>
              <div className="drug-name text-sm font-bold">{dispensing.drug_name}</div>
            </div>

            {/* Quantity */}
            <div className="section mb-1">
              <span className="section-title text-[10px] text-muted-foreground">Quantity:</span>
              <div className="section-content">{dispensing.quantity} units</div>
            </div>

            {/* Instructions */}
            <div className="section mb-2">
              <span className="section-title text-[10px] text-muted-foreground">Instructions:</span>
              <div className="instructions bg-muted/50 p-1.5 rounded text-[11px]">
                {instructions}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
              <div>
                <span className="text-muted-foreground">Dispensed:</span>
                <div>{dispensedDate}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Exp:</span>
                <div>{expiryDate}</div>
              </div>
            </div>

            {/* Expiry Warning */}
            <div className="warning border border-destructive bg-destructive/5 p-1 text-[10px] text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>Do not use after expiry date. Keep away from children.</span>
            </div>

            {/* Footer */}
            <div className="footer mt-2 pt-2 border-t border-dashed text-[9px] text-muted-foreground">
              <p className="m-0">Batch: {dispensing.batch_number}</p>
              <p className="m-0">Dispensed by: {dispensing.dispensed_by_name}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Label
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
