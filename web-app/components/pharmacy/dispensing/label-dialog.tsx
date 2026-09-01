/**
 * Label Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Dialog for printing dispensing labels with patient info,
 * drug details, dosage instructions, and expiry warning.
 *
 * Updated to use the document generation system.
 */

'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/utils/format';
import { Printer, AlertTriangle, Settings2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dispensing } from '@/lib/types/pharmacy';
import { printLabel, type PrintLabelOptions } from '@/lib/documents';

type LabelLayout = 'label' | 'thermal-58mm' | 'thermal-80mm';

interface LabelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dispensing: Dispensing | null;
  facilityName?: string;
}

export function LabelDialog({
  isOpen,
  onClose,
  dispensing,
  facilityName = 'Healthcare Facility',
}: LabelDialogProps) {
  // Print options state
  const [layout, setLayout] = useState<LabelLayout>('label');
  const [showBatchInfo, setShowBatchInfo] = useState(true);
  const [showExpiryWarning, setShowExpiryWarning] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    if (!dispensing) return;

    setIsPrinting(true);
    try {
      // Get extended dispensing data
      const extendedDispensing = dispensing as Dispensing & {
        dosage?: string;
        frequency?: string;
        duration?: string;
        instructions?: string;
        batch_expiry?: string;
      };

      const options: PrintLabelOptions = {
        dispensing,
        facility: {
          name: facilityName,
        },
        drug: {
          name: dispensing.drug_name ?? undefined,
          dosage: extendedDispensing.dosage,
          frequency: extendedDispensing.frequency,
          duration: extendedDispensing.duration,
          instructions:
            extendedDispensing.instructions || 'Take as directed by your healthcare provider.',
        },
        layout,
        showBatchInfo,
        showExpiryWarning,
      };

      await printLabel(options);
    } finally {
      setIsPrinting(false);
    }
  };

  if (!dispensing) return null;

  const dispensedDate = formatDate(dispensing.dispensed_at);
  const extendedDispensing = dispensing as Dispensing & {
    dosage?: string;
    instructions?: string;
    batch_expiry?: string;
  };
  const expiryDate = extendedDispensing.batch_expiry || 'N/A';
  const instructions =
    extendedDispensing.dosage || extendedDispensing.instructions || 'Take as directed';

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
        <div className="flex justify-center rounded-md bg-muted/30 p-4">
          <div className="label w-72 border-2 border-black bg-white p-3 text-xs">
            {/* Header */}
            <div className="mb-2 border-b border-black pb-2 text-center">
              <h1 className="m-0 text-sm font-bold">{facilityName.toUpperCase()}</h1>
              <p className="m-0 text-[10px] text-muted-foreground">Healthcare Excellence</p>
            </div>

            {/* Patient Name */}
            <div className="mb-1">
              <span className="text-[10px] text-muted-foreground">Patient:</span>
              <div className="text-sm font-semibold">{dispensing.patient_name}</div>
            </div>

            {/* Drug Name */}
            <div className="mb-1">
              <span className="text-[10px] text-muted-foreground">Medication:</span>
              <div className="rounded bg-muted/50 p-1 text-sm font-bold">
                {dispensing.drug_name}
              </div>
            </div>

            {/* Quantity */}
            <div className="mb-1">
              <span className="text-[10px] text-muted-foreground">Quantity:</span>
              <div>{dispensing.quantity} units</div>
            </div>

            {/* Instructions */}
            <div className="mb-2">
              <span className="text-[10px] text-muted-foreground">Instructions:</span>
              <div className="rounded bg-muted/50 p-1.5 text-[11px]">{instructions}</div>
            </div>

            {/* Dates */}
            <div className="mb-2 grid grid-cols-2 gap-2 text-[10px]">
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
            {showExpiryWarning && (
              <div className="flex items-center gap-1 border border-destructive bg-destructive/5 p-1 text-[10px] text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>Do not use after expiry date. Keep away from children.</span>
              </div>
            )}

            {/* Footer */}
            <div className="mt-2 border-t border-dashed pt-2 text-[9px] text-muted-foreground">
              {showBatchInfo && <p className="m-0">Batch: {dispensing.batch_number}</p>}
              <p className="m-0">Dispensed by: {dispensing.dispensed_by_name}</p>
            </div>
          </div>
        </div>

        {/* Print Options (collapsible) */}
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between"
            onClick={() => setShowOptions(!showOptions)}
          >
            <span className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Print Options
            </span>
            <span className="text-xs text-muted-foreground">
              {layout === 'label' ? 'Standard' : layout === 'thermal-80mm' ? '80mm' : '58mm'}
            </span>
          </Button>

          {showOptions && (
            <div className="space-y-4 rounded-md border bg-muted/20 p-3">
              {/* Layout Selection */}
              <div className="space-y-2">
                <Label htmlFor="layout">Printer Format</Label>
                <Select value={layout} onValueChange={(v) => setLayout(v as LabelLayout)}>
                  <SelectTrigger id="layout">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="label">Standard Label (280px)</SelectItem>
                    <SelectItem value="thermal-80mm">Thermal 80mm</SelectItem>
                    <SelectItem value="thermal-58mm">Thermal 58mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Toggle options */}
              <div className="flex items-center justify-between">
                <Label htmlFor="batch-info" className="cursor-pointer">
                  Show batch number
                </Label>
                <Switch
                  id="batch-info"
                  checked={showBatchInfo}
                  onCheckedChange={setShowBatchInfo}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="expiry-warning" className="cursor-pointer">
                  Show expiry warning
                </Label>
                <Switch
                  id="expiry-warning"
                  checked={showExpiryWarning}
                  onCheckedChange={setShowExpiryWarning}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPrinting}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting}>
            <Printer className="mr-2 h-4 w-4" />
            {isPrinting ? 'Printing...' : 'Print Label'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
