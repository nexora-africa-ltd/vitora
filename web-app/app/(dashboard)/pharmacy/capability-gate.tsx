/**
 * Pharmacy capability gate for all pharmacy routes.
 *
 * Usage: Wrap pharmacy route children to enforce bootstrap module availability.
 * Inputs: React children only; capabilities are resolved from /api/pharmacy/bootstrap/.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { pharmacyApi } from '@/lib/api/pharmacy';

export function PharmacyCapabilityGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ['pharmacy-bootstrap'],
    queryFn: pharmacyApi.getBootstrap,
  });
  const hideCapabilityBadges =
    pathname.includes('/pharmacy/') &&
    (pathname.includes('/new') ||
      pathname.includes('/edit') ||
      pathname.includes('/receive') ||
      pathname.includes('/walk-in'));

  if (isLoading && !bootstrap) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bootstrap?.pharmacy_enabled) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium">Pharmacy module unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pharmacy is currently disabled for this facility.
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
            Pharmacy: Enabled
          </Badge>
          <Badge variant="outline" className="w-fit">
            Catalog: {bootstrap.permissions.can_manage_catalog ? 'Manage' : 'Read-only'}
          </Badge>
          <Badge variant="outline" className="w-fit">
            Dispense: {bootstrap.permissions.can_dispense ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      ) : null}
      {children}
    </div>
  );
}
