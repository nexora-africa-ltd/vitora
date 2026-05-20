'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Package, RotateCcw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import {
  useAdmissionConsumableUsage,
  useRecordAdmissionConsumableUsage,
  useReverseAdmissionConsumableUsage,
} from '@/lib/hooks/use-inpatient';
import { useDrugs, useBatchesForDrug } from '@/lib/hooks/use-pharmacy';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { Drug } from '@/lib/types/pharmacy';

interface ConsumableUsagePanelProps {
  admissionId: number;
  isActive: boolean;
}

export function ConsumableUsagePanel({ admissionId, isActive }: ConsumableUsagePanelProps) {
  const { toast } = useToast();
  const { data: usages, isLoading: usagesLoading } = useAdmissionConsumableUsage(admissionId);
  const recordUsage = useRecordAdmissionConsumableUsage();
  const reverseUsage = useReverseAdmissionConsumableUsage();

  // Dialog state
  const [recordOpen, setRecordOpen] = useState(false);
  const [reverseTargetId, setReverseTargetId] = useState<number | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  // Form state — two-step: select consumable item, then select batch
  const [itemSearch, setItemSearch] = useState('');
  const [itemOpen, setItemOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Drug | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [quantityUsed, setQuantityUsed] = useState('1');
  const [notes, setNotes] = useState('');

  const debouncedSearch = useDebounce(itemSearch, 300);

  // Fetch consumables only
  const { data: consumablesData, isLoading: consumablesLoading } = useDrugs({
    item_type: 'CONSUMABLE',
    search: debouncedSearch || undefined,
    is_active: true,
    page_size: 20,
  });
  const consumables = useMemo(() => consumablesData?.results || [], [consumablesData]);

  // Fetch batches for selected consumable item
  const { data: batches, isLoading: batchesLoading } = useBatchesForDrug(
    selectedItem?.id
  );
  const availableBatches = useMemo(
    () => (batches ?? []).filter((b) => b.quantity_available > 0),
    [batches]
  );

  const selectedBatch = useMemo(
    () => availableBatches.find((b) => b.id === Number(selectedBatchId)),
    [availableBatches, selectedBatchId]
  );

  const recentUsages = useMemo(() => (usages ?? []).slice(0, 10), [usages]);

  const resetRecordForm = () => {
    setSelectedItem(null);
    setSelectedBatchId('');
    setQuantityUsed('1');
    setNotes('');
    setItemSearch('');
  };

  const handleSelectItem = (item: Drug) => {
    setSelectedItem(item);
    setSelectedBatchId('');
    setItemOpen(false);
    setItemSearch('');
  };

  const handleRecordUsage = async () => {
    const parsedQuantity = Number(quantityUsed);

    if (!selectedItem) {
      toast({ title: 'Validation Error', description: 'Select a consumable item.', variant: 'destructive' });
      return;
    }
    if (!selectedBatchId) {
      toast({ title: 'Validation Error', description: 'Select a stock batch.', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      toast({ title: 'Validation Error', description: 'Quantity must be at least 1.', variant: 'destructive' });
      return;
    }
    if (selectedBatch && parsedQuantity > selectedBatch.quantity_available) {
      toast({
        title: 'Validation Error',
        description: `Only ${selectedBatch.quantity_available} units available in this batch.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      await recordUsage.mutateAsync({
        admissionId,
        data: {
          batch: Number(selectedBatchId),
          quantity_used: parsedQuantity,
          notes: notes.trim() || undefined,
        },
      });
      toast({ title: 'Consumable Recorded', description: `${parsedQuantity} × ${selectedItem.generic_name} debited from stock.` });
      setRecordOpen(false);
      resetRecordForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to record consumable usage.', variant: 'destructive' });
    }
  };

  const handleReverseUsage = async () => {
    if (!reverseTargetId) return;
    if (!reverseReason.trim()) {
      toast({ title: 'Validation Error', description: 'Provide a reason before reversing.', variant: 'destructive' });
      return;
    }
    try {
      await reverseUsage.mutateAsync({
        admissionId,
        usageId: reverseTargetId,
        data: { reason: reverseReason.trim() },
      });
      toast({ title: 'Usage Reversed', description: 'Stock was restored to the original batch.' });
      setReverseTargetId(null);
      setReverseReason('');
    } catch {
      toast({ title: 'Error', description: 'Failed to reverse consumable usage.', variant: 'destructive' });
    }
  };

  if (usagesLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Consumable Usage</CardTitle>
          <HelpPopover content="Record inpatient consumables (gloves, dressings, syringes, etc.) against pharmacy stock. Only items marked as 'Consumable' in the catalog are shown." />
        </div>
        <Dialog open={recordOpen} onOpenChange={(open) => { setRecordOpen(open); if (!open) resetRecordForm(); }}>
          <DialogTrigger asChild>
            <Button disabled={!isActive} size="sm">
              <Package className="h-4 w-4 mr-2" />
              Record Usage
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Consumable Usage</DialogTitle>
              <DialogDescription>
                Select a consumable item and batch to debit from stock for this admission.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Step 1: Select consumable item (searchable combobox) */}
              <div className="space-y-2">
                <Label>Consumable Item *</Label>
                <Popover open={itemOpen} onOpenChange={setItemOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={itemOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedItem
                        ? `${selectedItem.generic_name}${selectedItem.strength ? ` (${selectedItem.strength})` : ''}`
                        : 'Select consumable...'}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search consumables..."
                        value={itemSearch}
                        onValueChange={setItemSearch}
                      />
                      <CommandList className="max-h-[200px]">
                        {consumablesLoading ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                            Searching...
                          </div>
                        ) : consumables.length === 0 ? (
                          <CommandEmpty>
                            {itemSearch ? 'No consumables found.' : 'Type to search consumables...'}
                          </CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {consumables.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={item.id.toString()}
                                onSelect={() => handleSelectItem(item)}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selectedItem?.id === item.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{item.generic_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {item.code}{item.strength ? ` · ${item.strength}` : ''} · Stock: {item.current_stock ?? 0}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Step 2: Select batch (shown after item is selected) */}
              {selectedItem && (
                <div className="space-y-2">
                  <Label>Stock Batch *</Label>
                  {batchesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading batches...
                    </div>
                  ) : availableBatches.length === 0 ? (
                    <p className="text-sm text-destructive">No stock available for this item.</p>
                  ) : (
                    <>
                      <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select batch (FEFO)" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableBatches.map((batch) => (
                            <SelectItem key={batch.id} value={String(batch.id)}>
                              {batch.batch_number} · {batch.quantity_available} avail · exp {batch.expiry_date}
                              {batch.store_location_name ? ` · ${batch.store_location_name}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedBatch && (
                        <p className="text-xs text-muted-foreground">
                          {selectedBatch.quantity_available} units available · expires {selectedBatch.expiry_date}
                          {selectedBatch.store_location_name && ` · ${selectedBatch.store_location_name}`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="consumable-quantity">Quantity Used *</Label>
                <Input
                  id="consumable-quantity"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={selectedBatch?.quantity_available}
                  value={quantityUsed}
                  onChange={(e) => setQuantityUsed(e.target.value)}
                />
                {selectedBatch && Number(quantityUsed) > selectedBatch.quantity_available && (
                  <p className="text-xs text-destructive">
                    Exceeds available stock ({selectedBatch.quantity_available} units).
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="consumable-notes">Notes</Label>
                <Textarea
                  id="consumable-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Dressing pack used during wound care"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRecordOpen(false); resetRecordForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={handleRecordUsage}
                disabled={recordUsage.isPending || !selectedItem || !selectedBatchId}
              >
                {recordUsage.isPending ? 'Recording...' : 'Record Usage'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isActive && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Consumable usage can only be recorded while the admission is active.
          </div>
        )}

        {recentUsages.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No consumable usage has been recorded for this admission yet.
          </div>
        ) : (
          <div className="space-y-3">
            {recentUsages.map((usage) => (
              <div
                key={usage.id}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {usage.drug_name ?? `Item #${usage.drug}`}
                    </p>
                    <Badge variant={usage.is_reversed ? 'secondary' : 'outline'}>
                      {usage.is_reversed ? 'Reversed' : `${usage.quantity_used} used`}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Batch {usage.batch_number} · by {usage.used_by_username ?? 'Unknown'} · {formatDateTime(usage.used_at)}
                  </p>
                  {usage.notes && <p className="text-sm">{usage.notes}</p>}
                  {usage.is_reversed && usage.reverse_reason && (
                    <p className="text-sm text-muted-foreground italic">
                      Reversed: {usage.reverse_reason}
                    </p>
                  )}
                </div>
                {!usage.is_reversed && isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setReverseTargetId(usage.id)}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reverse
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reverse Dialog */}
        <Dialog open={reverseTargetId !== null} onOpenChange={(open) => {
          if (!open) { setReverseTargetId(null); setReverseReason(''); }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reverse Consumable Usage</DialogTitle>
              <DialogDescription>
                This will restore the stock to the original batch. Provide a reason.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="reverse-reason">Reason *</Label>
              <Textarea
                id="reverse-reason"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="e.g. Wrong patient, duplicate entry, incorrect quantity"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setReverseTargetId(null); setReverseReason(''); }}>
                Cancel
              </Button>
              <Button onClick={handleReverseUsage} disabled={reverseUsage.isPending || !reverseReason.trim()}>
                {reverseUsage.isPending ? 'Reversing...' : 'Reverse Usage'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
