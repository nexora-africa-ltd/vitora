'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Droplets, Plus } from 'lucide-react';
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
  FluidBalanceEntry,
  FluidBalanceSheet as FluidBalanceSheetType,
} from '@/lib/types/inpatient';

const CHART_START_HOUR = 6;

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getChartDateKey(date: Date): string {
  const adjusted = new Date(date);
  if (adjusted.getHours() < CHART_START_HOUR) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return toLocalDateKey(adjusted);
}

function getChartPeriodRange(chartDate: string) {
  const start = new Date(`${chartDate}T06:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultRecordedAt(chartDate: string): string {
  const { start, end } = getChartPeriodRange(chartDate);
  const now = new Date();
  if (now >= start && now < end) {
    return toDateTimeLocalValue(now);
  }
  return toDateTimeLocalValue(start);
}

function formatChartPeriodLabel(chartDate: string): string {
  const { start, end } = getChartPeriodRange(chartDate);
  const next = new Date(end);
  next.setMinutes(next.getMinutes() - 1);
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 6:00 AM - ${next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 5:59 AM`;
}

function formatSheetOptionLabel(chartDate: string, currentChartDate: string): string {
  const base = new Date(`${chartDate}T06:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return chartDate === currentChartDate ? `${base} (Current Period)` : base;
}

function getTimeSlotLabel(hour: number): string {
  const normalized = hour % 24;
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const twelveHour = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelveHour}${suffix}`;
}

function getSlotIndex(recordedAt: string, chartDate: string): number | null {
  const { start, end } = getChartPeriodRange(chartDate);
  const value = new Date(recordedAt);
  if (value < start || value >= end) {
    return null;
  }
  return Math.floor((value.getTime() - start.getTime()) / (60 * 60 * 1000));
}

type SlotRow = {
  label: string;
  intravenousTypes: string[];
  intravenousBottles: string[];
  intravenousAmountMl: number;
  alimentaryTypes: string[];
  alimentaryAmountMl: number;
  vomitAmountMl: number;
  stoolAmountMl: number;
  nasogastricAmountMl: number;
  otherOutputAmountMl: number;
  urineAmountMl: number;
  urineSpecificGravity: string[];
};

function buildSlotRows(entries: FluidBalanceEntry[], chartDate: string): SlotRow[] {
  const rows: SlotRow[] = Array.from({ length: 24 }, (_, index) => {
    const hour = (CHART_START_HOUR + index) % 24;
    return {
      label: getTimeSlotLabel(hour),
      intravenousTypes: [],
      intravenousBottles: [],
      intravenousAmountMl: 0,
      alimentaryTypes: [],
      alimentaryAmountMl: 0,
      vomitAmountMl: 0,
      stoolAmountMl: 0,
      nasogastricAmountMl: 0,
      otherOutputAmountMl: 0,
      urineAmountMl: 0,
      urineSpecificGravity: [],
    };
  });

  entries.forEach((entry) => {
    const slotIndex = getSlotIndex(entry.recorded_at, chartDate);
    if (slotIndex == null) {
      return;
    }
    const row = rows[slotIndex];
    if (!row) {
      return;
    }
    switch (entry.entry_type) {
      case 'INTRAVENOUS':
        if (entry.item_type) row.intravenousTypes.push(entry.item_type);
        if (entry.bottle_number) row.intravenousBottles.push(entry.bottle_number);
        row.intravenousAmountMl += entry.amount_ml ?? 0;
        break;
      case 'ALIMENTARY':
      case 'OTHER_INTAKE':
        if (entry.item_type) row.alimentaryTypes.push(entry.item_type);
        row.alimentaryAmountMl += entry.amount_ml ?? 0;
        break;
      case 'VOMIT':
        row.vomitAmountMl += entry.amount_ml ?? 0;
        break;
      case 'STOOL':
        row.stoolAmountMl += entry.amount_ml ?? 0;
        break;
      case 'NASOGASTRIC':
        row.nasogastricAmountMl += entry.amount_ml ?? 0;
        break;
      case 'OTHER_OUTPUT':
        row.otherOutputAmountMl += entry.amount_ml ?? 0;
        break;
      case 'URINE':
        row.urineAmountMl += entry.amount_ml ?? 0;
        if (entry.specific_gravity) row.urineSpecificGravity.push(entry.specific_gravity);
        break;
      default:
        break;
    }
  });

  return rows;
}

function joinUnique(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(', ');
}

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
  const currentChartDate = getChartDateKey(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedChartDate, setSelectedChartDate] = useState(currentChartDate);
  const [entryType, setEntryType] = useState<Exclude<FluidBalanceEntryType, 'OTHER_INTAKE'>>('INTRAVENOUS');
  const [recordedAt, setRecordedAt] = useState(getDefaultRecordedAt(currentChartDate));
  const [patientWeightKg, setPatientWeightKg] = useState('');
  const [intravenousInfusionNotes, setIntravenousInfusionNotes] = useState('');
  const [otherInstructions, setOtherInstructions] = useState('');
  const [itemType, setItemType] = useState('');
  const [bottleNumber, setBottleNumber] = useState('');
  const [amountMl, setAmountMl] = useState('');
  const [specificGravity, setSpecificGravity] = useState('');
  const [notes, setNotes] = useState('');

  const sheets = sheetsData?.results ?? [];
  const availableChartDates = Array.from(
    new Set([currentChartDate, ...sheets.map((sheet) => sheet.chart_date)])
  ).sort((a, b) => b.localeCompare(a));
  const currentSheet = sheets.find((sheet) => sheet.chart_date === selectedChartDate) ?? null;
  const isSelectedCurrentPeriod = selectedChartDate === currentChartDate;
  const { data: entriesData, isLoading: entriesLoading } = useFluidBalanceEntries(currentSheet?.id);
  const entries = entriesData?.results ?? [];
  const isLoading = sheetsLoading || (typeof currentSheet?.id === 'number' && entriesLoading);

  useEffect(() => {
    setSelectedChartDate(currentChartDate);
  }, [admissionId, currentChartDate]);

  useEffect(() => {
    setRecordedAt(getDefaultRecordedAt(selectedChartDate));
  }, [selectedChartDate]);

  const resetForm = () => {
    setEntryType('INTRAVENOUS');
    setRecordedAt(getDefaultRecordedAt(selectedChartDate));
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
    if (!recordedAt) {
      toast({
        title: 'Missing time',
        description: 'Select the time this entry belongs to on the chart',
        variant: 'destructive',
      });
      return;
    }

    const recordedAtValue = new Date(recordedAt);
    const { start, end } = getChartPeriodRange(selectedChartDate);
    if (recordedAtValue < start || recordedAtValue >= end) {
      toast({
        title: 'Time outside chart period',
        description: 'Recorded time must fall within the selected 6am-to-6am chart period',
        variant: 'destructive',
      });
      return;
    }

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
      if (!currentSheet) {
        sheet = await createSheet.mutateAsync({
          admission: admissionId,
          chart_date: selectedChartDate,
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
        recorded_at: recordedAtValue.toISOString(),
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
  const currentSheetTitle = currentSheet ? currentSheet.chart_date : selectedChartDate;
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
  const slotRows = buildSlotRows(entries, selectedChartDate);
  const selectedPeriodLabel = formatChartPeriodLabel(selectedChartDate);
  const isIntakeEntry = entryType === 'INTRAVENOUS' || entryType === 'ALIMENTARY';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Fluid Balance Chart</h3>
            <p className="text-sm text-muted-foreground">{selectedPeriodLabel}</p>
          </div>
          <HelpPopover content="Ministry-style fluid balance chart with categorized intake and output entries. Use separate rows for intravenous, alimentary, vomit, stool, nasogastric, other output, and urine." />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-64">
            <Select value={selectedChartDate} onValueChange={setSelectedChartDate}>
              <SelectTrigger>
                <div className="flex items-center gap-2 truncate">
                  <CalendarDays className="h-4 w-4 opacity-70" />
                  <SelectValue placeholder="Select chart date" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableChartDates.map((chartDate) => (
                  <SelectItem key={chartDate} value={chartDate}>
                    {formatSheetOptionLabel(chartDate, currentChartDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    <Label htmlFor="recorded-at">Recorded Time *</Label>
                    <Input
                      id="recorded-at"
                      type="datetime-local"
                      value={recordedAt}
                      onChange={(e) => setRecordedAt(e.target.value)}
                    />
                  </div>
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

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className={`rounded-lg border p-4 space-y-3 ${isIntakeEntry ? 'border-primary/40 bg-primary/5' : 'border-border/60'}`}>
                    <div>
                      <p className="font-medium">Intake</p>
                      <p className="text-xs text-muted-foreground">Intravenous and alimentary intake fields</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="item-type-intake">Type</Label>
                      <Input
                        id="item-type-intake"
                        placeholder={entryType === 'INTRAVENOUS' ? 'Normal saline' : 'Oral feeds'}
                        value={isIntakeEntry ? itemType : ''}
                        onChange={(e) => setItemType(e.target.value)}
                        disabled={!isIntakeEntry}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bottle-number">Bottle Number</Label>
                      <Input
                        id="bottle-number"
                        placeholder="Bottle 1"
                        value={entryType === 'INTRAVENOUS' ? bottleNumber : ''}
                        onChange={(e) => setBottleNumber(e.target.value)}
                        disabled={entryType !== 'INTRAVENOUS'}
                      />
                    </div>
                  </div>
                  <div className={`rounded-lg border p-4 space-y-3 ${!isIntakeEntry ? 'border-primary/40 bg-primary/5' : 'border-border/60'}`}>
                    <div>
                      <p className="font-medium">Output</p>
                      <p className="text-xs text-muted-foreground">Vomit, stool, nasogastric, other output, and urine</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="item-type-output">Description</Label>
                      <Input
                        id="item-type-output"
                        placeholder="Describe output"
                        value={!isIntakeEntry ? itemType : ''}
                        onChange={(e) => setItemType(e.target.value)}
                        disabled={isIntakeEntry}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="specific-gravity">Specific Gravity</Label>
                      <Input
                        id="specific-gravity"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="1.015"
                        value={entryType === 'URINE' ? specificGravity : ''}
                        onChange={(e) => setSpecificGravity(e.target.value)}
                        disabled={entryType !== 'URINE'}
                      />
                    </div>
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
              <CardTitle className="text-base">Chart Summary</CardTitle>
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
              <CardTitle className="text-base">Hourly Fluid Grid</CardTitle>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left bg-muted/40">
                      <th className="p-2 font-medium align-bottom" rowSpan={2}>Time</th>
                      <th className="p-2 font-medium text-center" colSpan={5}>Intake (in mL)</th>
                      <th className="p-2 font-medium text-center" colSpan={6}>Output (in mL)</th>
                    </tr>
                    <tr className="border-b text-left bg-muted/20">
                      <th className="p-2 font-medium">IV Type</th>
                      <th className="p-2 font-medium">Bottle</th>
                      <th className="p-2 font-medium">Infused</th>
                      <th className="p-2 font-medium">Alimentary Type</th>
                      <th className="p-2 font-medium">Amount</th>
                      <th className="p-2 font-medium">Vomit</th>
                      <th className="p-2 font-medium">Stool</th>
                      <th className="p-2 font-medium">N/Gast</th>
                      <th className="p-2 font-medium">Others</th>
                      <th className="p-2 font-medium">Urine Amount</th>
                      <th className="p-2 font-medium">Specific Gravity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slotRows.map((row) => (
                      <tr key={row.label} className="border-b last:border-0 align-top">
                        <td className="p-2 whitespace-nowrap font-medium">{row.label}</td>
                        <td className="p-2 whitespace-pre-wrap">{joinUnique(row.intravenousTypes)}</td>
                        <td className="p-2 whitespace-pre-wrap">{joinUnique(row.intravenousBottles)}</td>
                        <td className="p-2">{row.intravenousAmountMl || ''}</td>
                        <td className="p-2 whitespace-pre-wrap">{joinUnique(row.alimentaryTypes)}</td>
                        <td className="p-2">{row.alimentaryAmountMl || ''}</td>
                        <td className="p-2">{row.vomitAmountMl || ''}</td>
                        <td className="p-2">{row.stoolAmountMl || ''}</td>
                        <td className="p-2">{row.nasogastricAmountMl || ''}</td>
                        <td className="p-2">{row.otherOutputAmountMl || ''}</td>
                        <td className="p-2">{row.urineAmountMl || ''}</td>
                        <td className="p-2 whitespace-pre-wrap">{joinUnique(row.urineSpecificGravity)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-medium">
                      <td className="p-2">Totals</td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2">{currentSheet?.total_intravenous_intake_ml ?? 0}</td>
                      <td className="p-2"></td>
                      <td className="p-2">{(currentSheet?.total_alimentary_intake_ml ?? 0) + (currentSheet?.total_other_intake_ml ?? 0)}</td>
                      <td className="p-2">{currentSheet?.total_vomit_output_ml ?? 0}</td>
                      <td className="p-2">{currentSheet?.total_stool_output_ml ?? 0}</td>
                      <td className="p-2">{currentSheet?.total_nasogastric_output_ml ?? 0}</td>
                      <td className="p-2">{currentSheet?.total_other_output_ml ?? 0}</td>
                      <td className="p-2">{currentSheet?.total_urine_output_ml ?? 0}</td>
                      <td className="p-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
