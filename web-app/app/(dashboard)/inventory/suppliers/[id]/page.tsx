'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Star, Phone, Mail, MapPin, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/lib/hooks/use-toast';
import { inventoryApi } from '@/lib/api/inventory';
import type { SupplierType } from '@/lib/types/inventory';

const typeLabels: Record<SupplierType, string> = {
  MANUFACTURER: 'Manufacturer',
  DISTRIBUTOR: 'Distributor',
  WHOLESALER: 'Wholesaler',
  GOVERNMENT: 'Government',
};

const typeColors: Record<SupplierType, string> = {
  MANUFACTURER: 'bg-blue-100 text-blue-700',
  DISTRIBUTOR: 'bg-purple-100 text-purple-700',
  WHOLESALER: 'bg-amber-100 text-amber-700',
  GOVERNMENT: 'bg-green-100 text-green-700',
};

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const supplierId = parseInt(resolvedParams.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isToggling, setIsToggling] = useState(false);

  const { data: supplier, isLoading, error } = useQuery({
    queryKey: ['inventory-supplier', supplierId],
    queryFn: () => inventoryApi.getSupplier(supplierId),
  });

  const toggleMutation = useMutation({
    mutationFn: () => inventoryApi.toggleSupplierActive(supplierId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-supplier', supplierId], updated);
      queryClient.invalidateQueries({ queryKey: ['inventory-suppliers'] });
      toast({ variant: 'success', title: updated.is_active ? 'Supplier activated' : 'Supplier deactivated' });
      setIsToggling(false);
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to update supplier status' });
      setIsToggling(false);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>{error instanceof Error ? error.message : 'Supplier not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={supplier.name}
        helpContent="View and manage supplier details, contact information, and performance metrics."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => { setIsToggling(true); toggleMutation.mutate(); }}
              disabled={isToggling}
            >
              {isToggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {supplier.is_active ? 'Deactivate' : 'Activate'}
            </Button>
            <Button onClick={() => router.push(`/inventory/suppliers/${supplier.id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </div>
        }
      />

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {supplier.code}
            <span className="text-muted-foreground"> · {typeLabels[supplier.supplier_type]}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Lead time: {supplier.lead_time_days} days · Payment: {supplier.payment_term_name || supplier.payment_terms || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-sm font-medium">
            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
            {Number(supplier.rating).toFixed(1)}
          </span>
          <Badge className={`${typeColors[supplier.supplier_type]} shrink-0 w-fit`}>
            {typeLabels[supplier.supplier_type]}
          </Badge>
          <Badge className={`shrink-0 w-fit ${supplier.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {supplier.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Contact Person</p>
                <p className="text-sm text-muted-foreground">{supplier.contact_person || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{supplier.email || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-sm text-muted-foreground">{supplier.phone || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Address</p>
                <p className="text-sm text-muted-foreground">{supplier.address || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Business Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">KRA PIN</p>
                <p className="text-sm text-muted-foreground">{supplier.tax_pin || '—'}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Payment Terms</p>
                <p className="text-sm text-muted-foreground">{supplier.payment_terms || '—'}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Lead Time</p>
                <p className="text-sm text-muted-foreground">{supplier.lead_time_days} days</p>
              </div>
              <div>
                <p className="text-sm font-medium">Rating</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  {Number(supplier.rating).toFixed(1)} / 5.0
                </p>
              </div>
            </div>
            {supplier.notes && (
              <div>
                <p className="text-sm font-medium">Notes</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{supplier.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
