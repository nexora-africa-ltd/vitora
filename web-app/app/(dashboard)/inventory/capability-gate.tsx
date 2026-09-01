/**
 * Inventory capability gate for all inventory routes.
 *
 * Usage: Wrap inventory route children to enforce bootstrap module availability.
 * Inputs: React children only; capabilities are resolved from /api/inventory/bootstrap/.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { inventoryApi } from '@/lib/api/inventory';

export function InventoryCapabilityGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ['inventory-bootstrap'],
    queryFn: inventoryApi.getBootstrap,
  });
  const hideCapabilityBadges =
    pathname.includes('/inventory/') && (pathname.includes('/new') || pathname.includes('/edit'));

  if (isLoading && !bootstrap) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bootstrap?.inventory_enabled) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium">Inventory module unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Inventory is currently disabled for this facility.
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
            Inventory: Enabled
          </Badge>
          <Badge variant="outline" className="w-fit">
            Billing Module: {bootstrap.modules.billing ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge variant="outline" className="w-fit">
            Pricing: {bootstrap.catalog_sources.unified_pricing_enabled ? 'Unified' : 'Manual'}
          </Badge>
        </div>
      ) : null}
      {children}
    </div>
  );
}
