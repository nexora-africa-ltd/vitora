/**
 * Billing invoices capability gate.
 *
 * Usage: Wrap /transactions/invoices routes to enforce billing module availability.
 * Inputs: React children only; capability source is /api/inventory/bootstrap/ modules.billing.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { inventoryApi } from '@/lib/api/inventory';

export function InvoicesCapabilityGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ['inventory-bootstrap'],
    queryFn: inventoryApi.getBootstrap,
  });
  const hideCapabilityBadges = pathname.includes('/transactions/invoices/new');

  if (isLoading && !bootstrap) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (bootstrap && !bootstrap.modules.billing) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium">Billing module unavailable</p>
          <p className="text-sm text-muted-foreground mt-1">
            Billing is currently disabled for this facility.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {!hideCapabilityBadges ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit">
            Billing: {bootstrap?.modules.billing ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge variant="outline" className="w-fit">
            Invoice Source: {bootstrap?.catalog_sources.invoice_item_source ?? 'services'}
          </Badge>
          <Badge variant="outline" className="w-fit">
            Pricing: {bootstrap?.catalog_sources.unified_pricing_enabled ? 'Unified' : 'Manual'}
          </Badge>
        </div>
      ) : null}
      {children}
    </div>
  );
}
