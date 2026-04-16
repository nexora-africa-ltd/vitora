'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import type { StockCountType } from '@/lib/types/inventory';

const typeLabels: Record<StockCountType, string> = {
  FULL: 'Full Count — All items in the store',
  CYCLE: 'Cycle Count — Subset of items on rotation',
  SPOT: 'Spot Check — Random items for verification',
};

export default function NewStockCountPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [countType, setCountType] = useState<StockCountType | ''>('');
  const [storeLocation, setStoreLocation] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: storesData } = useQuery({
    queryKey: ['inventory-store-locations-all'],
    queryFn: () => inventoryApi.listStoreLocations({ page_size: 200, is_active: true }),
  });
  const stores = storesData?.results || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!countType) {
      toast({ variant: 'destructive', title: 'Select a count type' });
      return;
    }
    setSubmitting(true);
    try {
      const created = await inventoryApi.createStockCount({
        count_type: countType,
        store_location: storeLocation ? Number(storeLocation) : undefined,
        notes: notes || undefined,
      });
      toast({ variant: 'success', title: 'Stock count created' });
      router.push(`/inventory/stock-counts/${created.id}`);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to create stock count',
        description: getApiErrorMessage(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="New Stock Count"
        helpContent="Create a new physical stock count. After creation, generate items from current batches, then start the count to begin recording quantities."
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Count Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="count-type">Count Type *</Label>
              <Select value={countType} onValueChange={(v) => setCountType(v as StockCountType)}>
                <SelectTrigger id="count-type">
                  <SelectValue placeholder="Select count type" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(typeLabels) as [StockCountType, string][]).map(
                    ([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="store-location">Store Location (optional)</Label>
              <Select value={storeLocation} onValueChange={setStoreLocation}>
                <SelectTrigger id="store-location">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All locations</SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={String(store.id)}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional context for this count..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !countType}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Count
          </Button>
        </div>
      </form>
    </div>
  );
}
