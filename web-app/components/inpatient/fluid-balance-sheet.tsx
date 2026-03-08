'use client';

import { useState } from 'react';
import { Droplets, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useCreateFluidBalanceEntry,
  useCreateFluidBalanceSheet,
  useFluidBalanceEntries,
  useFluidBalanceSheets,
  useUpdateFluidBalanceSheet,
} from '@/lib/hooks/use-inpatient';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import type {
  FluidBalanceEntryType,
  FluidBalanceSheet as FluidBalanceSheetType,
} from '@/lib/types/inpatient';

const ENTRY_TYPE_OPTIONS: { value: Exclude<FluidBalanceEntryType, 'OTHER_INTAKE'>; label: string }[] = [
  { value: 'INTRAVENOUS', label: 'Intravenous' },
  { value: 'ALIMENTARY', label: 'Alimentary' },
  { value: 'VOMIT', label: 'Vomit' },
  { value: 'STOOL', label: 'Stool' },
  { value: 'NASOGASTRIC', label: 'Naso Gastric' },
  { value: 'OTHER_OUTPUT', label: 'Other Output' },
  { value: 'URINE', label: 'Urine' },
];

interface FluidBalanceSheetProps {
  admissionId: number;
  isActive: boolean;
}

export function FluidBalanceSheet({ admissionId, isActive }: FluidBalanceSheetProps) {
  const { toast } = useToast();
  const { data: sheetsData, isLoading: sheetsLoading } = useFluidBalanceSheets(admissionId);
  const createSheet = useCreateFluidBalanceSheet();
  const updateSheet = useUpdateFluidBalanceSheet();
  const createEntry = useCreateFluidBalanceEntry();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entryType, setEntryType] = useState<Exclude<FluidBalanceEntryType, 'OTHER_INTAKE'>>('INTRAVENOUS');
  const [patientWeightKg, setPatientWeightKg] = useState('');
  const [intravenousInfusionNotes, setIntravenousInfusionNotes] = useState('');
  const [otherInstructions, setOtherInstructions] = useState('');
  const [itemType, setItemType] = useState('');
  const [bottleNumber, setBottleNumber] = useState('');
  const [amountMl, setAmountMl] = useState('');
  const [specificGravity, setSpecificGravity] = useState('');
  const [notes, setNotes] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const sheets = sheetsData?.results ?? [];
  const todaysSheet = sheets.find((sheet) => sheet.chart_date === today) ?? null;
  const currentSheet = todaysSheet ?? sheets[0] ?? null;
  const isCurrentSheetToday = currentSheet?.chart_date === today;
  const { data: entriesData, isLoading: entriesLoading } = useFluidBalanceEntries(currentSheet?.id);
  const entries = entriesData?.results ?? [];
  const isLoading = sheetsLoading || (typeof currentSheet?.id === 'number' && entriesLoading);

  const resetForm = () => {
    setEntryType('INTRAVENOUS');
    setPatientWeightKg('');
    setIntravenousInfusionNotes('');
    setOtherInstructions('');
    setItemType('');
    setBottleNumber('');
    setAmountMl('');
    setSpecificGravity('');
    setNotes('');
  };

  const handleSubmit = async () => {
    const amountValue = parseInt(amountMl, 10);
    if (isNaN(amountValue) || amountValue < 0) {
      toast({
        title: 'Invalid amount',
        description: 'Enter a non-negative amount in mL',
        variant: 'destructive',
      });
      return;
    }

    const weightValue = patientWeightKg ? parseFloat(patientWeightKg) : undefined;
    if (weightValue !== undefined && (isNaN(weightValue) || weightValue < 0)) {
      toast({
        title: 'Invalid weight',
        description: 'Enter a valid patient weight',
        variant: 'destructive',
      });
      return;
    }

    const specificGravityValue = specificGravity ? parseFloat(specificGravity) : undefined;
    if (
      entryType === 'URINE'
      && specificGravity
      && (isNaN(specificGravityValue!) || specificGravityValue! <= 0)
    ) {
      toast({
        title: 'Invalid specific gravity',
        description: 'Enter a valid specific gravity value',
        variant: 'destructive',
      });
      return;
    }

    let sheet: FluidBalanceSheetType;

    try {
      if (!isCurrentSheetToday) {
        sheet = await createSheet.mutateAsync({
          admission: admissionId,
          chart_date: today,
          patient_weight_kg: weightValue,
          intravenous_infusion_notes: intravenousInfusionNotes || undefined,
          other_instructions: otherInstructions || undefined,
        });
      } else {
        sheet = currentSheet as FluidBalanceSheetType;
        const shouldUpdateSheet =
          (patientWeightKg && patientWeightKg !== (sheet.patient_weight_kg ?? ''))
          || (
            intravenousInfusionNotes
            && intravenousInfusionNotes !== (sheet.intravenous_infusion_notes ?? '')
          )
          || (otherInstructions && otherInstructions !== (sheet.other_instructions ?? ''));

        if (shouldUpdateSheet) {
          sheet = await updateSheet.mutateAsync({
            id: sheet.id,
            data: {
              patient_weight_kg: weightValue,
              intravenous_infusion_notes: intravenousInfusionNotes || undefined,
              other_instructions: otherInstructions || undefined,
            },
          });
        }
      }

      await createEntry.mutateAsync({
        fluid_balance_sheet: sheet.id,
        recorded_at: new Date().toISOString(),
        entry_type: entryType,
        item_type: itemType || undefined,
        bottle_number: entryType === 'INTRAVENOUS' ? bottleNumber || undefined : undefined,
        amount_ml: amountValue,
        specific_gravity: entryType === 'URINE' ? specificGravityValue : undefined,
        notes: notes || undefined,
      });

      toast({ title: 'Fluid entry recorded' });
      setDialogOpen(false);
      resetForm();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to record fluid entry',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return <Skeleton className="h-48" />;
  }

  const isSubmitting = createSheet.isPending || updateSheet.isPending || createEntry.isPending;
  const hasNoData = !currentSheet && entries.length === 0;
  const currentSheetTitle = currentSheet ? `Chart Date: ${currentSheet.chart_date}` : `Chart Date: ${today}`;
  const summaryRows = [
    { label: 'IV Intake', value: currentSheet?.total_intravenous_intake_ml ?? 0 },
    { label: 'Alimentary', value: currentSheet?.total_alimentary_intake_ml ?? 0 },
    { label: 'Other Intake', value: currentSheet?.total_other_intake_ml ?? 0 },
    { label: 'Vomit', value: currentSheet?.total_vomit_output_ml ?? 0 },
    { label: 'Stool', value: currentSheet?.total_stool_output_ml ?? 0 },
    { label: 'N/Gastric', value: currentSheet?.total_nasogastric_output_ml ?? 0 },
    { label: 'Other Output', value: currentSheet?.total_other_output_ml ?? 0 },
    { label: 'Urine', value: currentSheet?.total_urine_output_ml ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Fluid Balance Chart</h3>
            <p className="text-sm text-muted-foreground">{currentSheetTitle}</p>
          </div>
          <HelpPopover content="Ministry-style fluid balance chart with categorized intake and output entries. Use separate rows for intravenous, alimentary, vomit, stool, nasogastric, other output, and urine." />
        </div>
        {isActive && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-1.5" />
                Record Fluids
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Record Fluid Balance Entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entry-type">Entry Type *</Label>
                    <Select
                      value={entryType}
                      onValueChange={(value) => setEntryType(value as Exclude<FluidBalanceEntryType, 'OTHER_INTAKE'>)}
                    >
                      <SelectTrigger id="entry-type">
                        <SelectValue placeholder="Select entry type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTRY_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount-ml">Amount (mL) *</Label>
                    <Input
                      id="amount-ml"
                      type="number"
                      min="0"
                      placeholder="500"
                      value={amountMl}
                      onChange={(e) => setAmountMl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-type">
                      {entryType === 'INTRAVENOUS'
                        ? 'IV Type'
                        : entryType === 'ALIMENTARY'
                          ? 'Alimentary Type'
                          : 'Description'}
                    </Label>
                    <Input
                      id="item-type"
                      placeholder={entryType === 'INTRAVENOUS'
                        ? 'Normal saline'
                        : entryType === 'ALIMENTARY'
                          ? 'Oral feeds'
                          : 'Describe entry'}
                      value={itemType}
                      onChange={(e) => setItemType(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    {entryType === 'INTRAVENOUS' ? (
                      <>
                        <Label htmlFor="bottle-number">Bottle Number</Label>
                        <Input
                          id="bottle-number"
                          placeholder="Bottle 1"
                          value={bottleNumber}
                          onChange={(e) => setBottleNumber(e.target.value)}
                        />
                      </>
                    ) : (
                      <>
                        <Label htmlFor="specific-gravity">Specific Gravity</Label>
                        <Input
                          id="specific-gravity"
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="1.015"
                          value={specificGravity}
                          onChange={(e) => setSpecificGravity(e.target.value)}
                          disabled={entryType !== 'URINE'}
                        />
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weight-kg">Weight (kg)</Label>
                    <Input
                      id="weight-kg"
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder={currentSheet?.patient_weight_kg ?? '68.5'}
                      value={patientWeightKg}
                      onChange={(e) => setPatientWeightKg(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entry-notes">Notes</Label>
                    <Input
                      id="entry-notes"
                      placeholder="Additional details"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="iv-infusion-notes">Intravenous Infusion</Label>
                    <Input
                      id="iv-infusion-notes"
                      placeholder={currentSheet?.intravenous_infusion_notes ?? 'IV infusion details'}
                      value={intravenousInfusionNotes}
                      onChange={(e) => setIntravenousInfusionNotes(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="other-instructions">Other Instructions</Label>
                    <Input
                      id="other-instructions"
                      placeholder={currentSheet?.other_instructions ?? 'Other instructions'}
                      value={otherInstructions}
                      onChange={(e) => setOtherInstructions(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting || !amountMl}>
                  {isSubmitting ? 'Saving...' : 'Save Entry'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {hasNoData ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Droplets className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No fluid balance entries recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Total Intake</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{currentSheet?.total_intake_ml ?? 0} mL</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Total Output</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{currentSheet?.total_output_ml ?? 0} mL</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Net Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold ${(currentSheet?.net_balance_ml ?? 0) < 0 ? 'text-destructive' : ''}`}>
                  {(currentSheet?.net_balance_ml ?? 0) > 0 ? '+' : ''}
                  {currentSheet?.net_balance_ml ?? 0} mL
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Category Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                {summaryRows.map((row) => (
                  <div key={row.label} className="rounded-lg border p-3">
                    <p className="text-muted-foreground">{row.label}</p>
                    <p className="font-semibold">{row.value} mL</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {(currentSheet?.patient_weight_kg
            || currentSheet?.intravenous_infusion_notes
            || currentSheet?.other_instructions) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sheet Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Weight:</span>{' '}
                  {currentSheet?.patient_weight_kg ? `${currentSheet.patient_weight_kg} kg` : '—'}
                </p>
                <p>
                  <span className="font-medium">IV Infusion:</span>{' '}
                  {currentSheet?.intravenous_infusion_notes || '—'}
                </p>
                <p>
                  <span className="font-medium">Other Instructions:</span>{' '}
                  {currentSheet?.other_instructions || '—'}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fluid Entries</CardTitle>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Date/Time</th>
                      <th className="p-2 font-medium">Category</th>
                      <th className="p-2 font-medium">Type</th>
                      <th className="p-2 font-medium">Bottle</th>
                      <th className="p-2 font-medium">Amount</th>
                      <th className="p-2 font-medium">Spec. Gravity</th>
                      <th className="p-2 font-medium">Notes</th>
                      <th className="p-2 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{formatDateTime(entry.recorded_at)}</td>
                        <td className="p-2">{entry.entry_type_display || entry.entry_type}</td>
                        <td className="p-2">{entry.item_type || '—'}</td>
                        <td className="p-2">{entry.bottle_number || '—'}</td>
                        <td className="p-2">{entry.amount_ml != null ? `${entry.amount_ml} mL` : '—'}</td>
                        <td className="p-2">{entry.specific_gravity || '—'}</td>
                        <td className="p-2">{entry.notes || '—'}</td>
                        <td className="p-2 text-muted-foreground">{entry.recorded_by_username}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
