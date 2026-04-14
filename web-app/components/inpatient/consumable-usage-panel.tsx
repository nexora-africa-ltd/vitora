'use client';

import { useMemo, useState } from 'react';
import { Package, RotateCcw } from 'lucide-react';

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
import { useToast } from '@/lib/hooks/use-toast';
import {
  useAdmissionConsumableUsage,
  useRecordAdmissionConsumableUsage,
  useReverseAdmissionConsumableUsage,
} from '@/lib/hooks/use-inpatient';
import { useStockBatches } from '@/lib/hooks/use-pharmacy';
import { formatDateTime } from '@/lib/utils/format';

interface ConsumableUsagePanelProps {
  admissionId: number;
  isActive: boolean;
}

export function ConsumableUsagePanel({ admissionId, isActive }: ConsumableUsagePanelProps) {
  const { toast } = useToast();
  const { data: usages, isLoading: usagesLoading } = useAdmissionConsumableUsage(admissionId);
  const { data: stockBatches, isLoading: stockLoading } = useStockBatches({
    status: 'AVAILABLE',
    page_size: 100,
    ordering: 'expiry_date',
  });
  const recordUsage = useRecordAdmissionConsumableUsage();
  const reverseUsage = useReverseAdmissionConsumableUsage();

  const [recordOpen, setRecordOpen] = useState(false);
  const [reverseTargetId, setReverseTargetId] = useState<number | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [quantityUsed, setQuantityUsed] = useState('1');
  const [notes, setNotes] = useState('');
  const [reverseReason, setReverseReason] = useState('');

  const availableBatches = useMemo(
    () => (stockBatches?.results ?? []).filter((batch) => batch.quantity_available > 0),
    [stockBatches]
  );

  const recentUsages = useMemo(() => (usages ?? []).slice(0, 5), [usages]);

  const selectedBatch = useMemo(
    () => availableBatches.find((batch) => batch.id === Number(selectedBatchId)),
    [availableBatches, selectedBatchId]
  );

  const resetRecordForm = () => {
    setSelectedBatchId('');
    setQuantityUsed('1');
    setNotes('');
  };

  const handleRecordUsage = async () => {
    const parsedQuantity = Number(quantityUsed);

    if (!selectedBatchId) {
      toast({
        title: 'Validation Error',
        description: 'Select a stock batch before recording usage.',
        variant: 'destructive',
      });
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      toast({
        title: 'Validation Error',
        description: 'Quantity used must be at least 1.',
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
      toast({
        title: 'Consumable Recorded',
        description: 'Stock was debited for this inpatient consumable usage.',
      });
      setRecordOpen(false);
      resetRecordForm();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to record consumable usage.',
        variant: 'destructive',
      });
    }
  };

  const handleReverseUsage = async () => {
    if (!reverseTargetId) return;

    if (!reverseReason.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Provide a reason before reversing usage.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await reverseUsage.mutateAsync({
        admissionId,
        usageId: reverseTargetId,
        data: { reason: reverseReason.trim() },
      });
      toast({
        title: 'Usage Reversed',
        description: 'Stock was restored to the original batch.',
      });
      setReverseTargetId(null);
      setReverseReason('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reverse consumable usage.',
        variant: 'destructive',
      });
    }
  };

  if (usagesLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg">Consumable Usage</CardTitle>
          <p className="text-sm text-muted-foreground">
            Record inpatient consumables against pharmacy stock and reverse mistakes when needed.
          </p>
        </div>
        <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
          <DialogTrigger asChild>
            <Button disabled={!isActive || stockLoading || availableBatches.length === 0}>
              <Package className="h-4 w-4 mr-2" />
              Record Usage
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Consumable Usage</DialogTitle>
              <DialogDescription>
                Select the pharmacy stock batch used for this admission and record the quantity consumed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="consumable-batch">Stock Batch</Label>
                <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                  <SelectTrigger id="consumable-batch">
                    <SelectValue placeholder="Select stocked consumable" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBatches.map((batch) => (
                      <SelectItem key={batch.id} value={String(batch.id)}>
                        {batch.drug_name ?? `Drug #${batch.drug}`} · {batch.batch_number} · {batch.quantity_available} left
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedBatch && (
                  <p className="text-xs text-muted-foreground">
                    Batch expires on {selectedBatch.expiry_date} and has {selectedBatch.quantity_available} units available.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="consumable-quantity">Quantity Used</Label>
                <Input
                  id="consumable-quantity"
                  inputMode="numeric"
                  min={1}
                  type="number"
                  value={quantityUsed}
                  onChange={(event) => setQuantityUsed(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="consumable-notes">Notes</Label>
                <Textarea
                  id="consumable-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Example: Dressing pack used during wound care"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecordOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleRecordUsage} disabled={recordUsage.isPending}>
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

        {availableBatches.length === 0 && !stockLoading && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            No available stocked consumables were found in pharmacy inventory.
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
                      {usage.drug_name ?? `Drug #${usage.drug}`}
                    </p>
                    <Badge variant={usage.is_reversed ? 'secondary' : 'outline'}>
                      {usage.is_reversed ? 'Reversed' : `${usage.quantity_used} used`}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Batch {usage.batch_number} · recorded by {usage.used_by_username ?? 'Unknown'} · {formatDateTime(usage.used_at)}
                  </p>
                  {usage.notes && <p className="text-sm">{usage.notes}</p>}
                  {usage.is_reversed && usage.reverse_reason && (
                    <p className="text-sm text-muted-foreground">
                      Reversed: {usage.reverse_reason}
                    </p>
                  )}
                </div>
                {!usage.is_reversed && isActive && (
                  <Button
                    variant="outline"
                    size="sm"
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

        <Dialog open={reverseTargetId !== null} onOpenChange={(open) => {
          if (!open) {
            setReverseTargetId(null);
            setReverseReason('');
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reverse Consumable Usage</DialogTitle>
              <DialogDescription>
                Reversing this entry restores stock to the original pharmacy batch.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="reverse-reason">Reason</Label>
              <Textarea
                id="reverse-reason"
                value={reverseReason}
                onChange={(event) => setReverseReason(event.target.value)}
                placeholder="Example: wrong patient or duplicate entry"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReverseTargetId(null);
                  setReverseReason('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleReverseUsage} disabled={reverseUsage.isPending}>
                {reverseUsage.isPending ? 'Reversing...' : 'Reverse Usage'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
