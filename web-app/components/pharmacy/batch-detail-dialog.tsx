/**
 * Stock Batch Detail Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StockBatch } from '@/lib/types/pharmacy';
import { formatDate } from '@/lib/utils/format';
import { Package, Calendar, DollarSign, MapPin, Barcode, User, Edit } from 'lucide-react';

interface BatchDetailDialogProps {
  batch: StockBatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (batch: StockBatch) => void;
}

export function BatchDetailDialog({ batch, open, onOpenChange, onEdit }: BatchDetailDialogProps) {
  if (!batch) return null;

  const batchValue = batch.quantity_available * Number(batch.cost_price);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="batch-detail">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Batch Details: {batch.batch_number}</DialogTitle>
            {onEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(batch)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Drug Information */}
          <div>
            <h3 className="font-semibold mb-2">Drug Information</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Drug:</span>
                <span className="font-medium">{batch.drug_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Drug Code:</span>
                <span className="font-mono text-sm">{batch.drug_code}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Quantity Breakdown */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center">
              <Package className="h-4 w-4 mr-2" />
              Quantity Breakdown
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Received</div>
                <div className="text-2xl font-bold">{batch.quantity_received}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Available</div>
                <div className="text-2xl font-bold text-green-600">{batch.quantity_available}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Dispensed</div>
                <div className="text-2xl font-bold">{batch.quantity_dispensed}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="mt-1">
                  <Badge>{batch.status}</Badge>
                </div>
              </div>
            </div>
            {(batch.quantity_damaged > 0 || batch.quantity_expired > 0) && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                {batch.quantity_damaged > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-lg">
                    <div className="text-sm text-muted-foreground">Damaged</div>
                    <div className="text-2xl font-bold text-destructive">{batch.quantity_damaged}</div>
                  </div>
                )}
                {batch.quantity_expired > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-lg">
                    <div className="text-sm text-muted-foreground">Expired</div>
                    <div className="text-2xl font-bold text-destructive">{batch.quantity_expired}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Dates */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Dates
            </h3>
            <div className="space-y-2">
              {batch.manufacture_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Manufacture Date:</span>
                  <span>{formatDate(batch.manufacture_date)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expiry Date:</span>
                <span>{formatDate(batch.expiry_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Days to Expiry:</span>
                <span className={batch.is_expired ? 'text-red-600' : batch.days_to_expiry < 90 ? 'text-yellow-600' : ''}>
                  {batch.days_to_expiry} days {batch.is_expired && '(Expired)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Received Date:</span>
                <span>{formatDate(batch.received_date)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Pricing */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center">
              <DollarSign className="h-4 w-4 mr-2" />
              Pricing
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost Price:</span>
                <span>KES {Number(batch.cost_price).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selling Price:</span>
                <span>KES {Number(batch.selling_price).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Value (Available × Cost):</span>
                <span className="font-semibold">KES {batchValue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Additional Information */}
          <div>
            <h3 className="font-semibold mb-2">Additional Information</h3>
            <div className="space-y-2">
              {batch.supplier && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier:</span>
                  <span>{batch.supplier}</span>
                </div>
              )}
              {batch.purchase_order && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purchase Order:</span>
                  <span className="font-mono text-sm">{batch.purchase_order}</span>
                </div>
              )}
              {batch.location && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    <MapPin className="h-4 w-4 inline mr-1" />
                    Location:
                  </span>
                  <span>{batch.location}</span>
                </div>
              )}
              {batch.barcode && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    <Barcode className="h-4 w-4 inline mr-1" />
                    Barcode:
                  </span>
                  <span className="font-mono text-sm">{batch.barcode}</span>
                </div>
              )}
              {batch.received_by_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    <User className="h-4 w-4 inline mr-1" />
                    Received By:
                  </span>
                  <span>{batch.received_by_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
