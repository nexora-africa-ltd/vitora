'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Droplets, Users, Package, ClipboardList, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBloodUnits, useBloodRequests, useBloodDonors } from '@/lib/hooks/use-blood-bank';
import { usePageRefresh } from '@/lib/context/page-refresh-context';

export default function BloodBankDashboardPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const { data: unitsData, isLoading: unitsLoading } = useBloodUnits({ page_size: 100 });
  const { data: requestsData, isLoading: requestsLoading } = useBloodRequests({ page_size: 100 });
  const { data: donorsData, isLoading: donorsLoading } = useBloodDonors({ page_size: 100 });

  const stats = useMemo(() => {
    const units = unitsData?.results || [];
    const requests = requestsData?.results || [];
    return {
      availableUnits: units.filter((u) => u.status === 'AVAILABLE').length,
      pendingRequests: requests.filter((r) => r.status === 'PENDING' || r.status === 'CROSSMATCH_PENDING').length,
      totalDonors: donorsData?.count || 0,
      emergencyRequests: requests.filter((r) => r.urgency === 'EMERGENCY' && r.status === 'PENDING').length,
    };
  }, [unitsData, requestsData, donorsData]);

  const isLoading = unitsLoading || requestsLoading || donorsLoading;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Blood Bank"
          helpContent="Manage blood donations, inventory, cross-matching, and transfusions."
        />

        {/* Stats */}
        <div className="grid gap-2 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Available Units"
            value={isLoading ? '-' : stats.availableUnits}
            icon={Package}
            variant="success"
            loading={isLoading}
          />
          <StatsCard
            title="Pending Requests"
            value={isLoading ? '-' : stats.pendingRequests}
            icon={ClipboardList}
            variant="warning"
            loading={isLoading}
          />
          <StatsCard
            title="Registered Donors"
            value={isLoading ? '-' : stats.totalDonors}
            icon={Users}
            variant="default"
            loading={isLoading}
          />
          <StatsCard
            title="Emergency Requests"
            value={isLoading ? '-' : stats.emergencyRequests}
            icon={AlertTriangle}
            variant="destructive"
            loading={isLoading}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Donors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Register and manage blood donors.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/blood-bank/donors">View Donors</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Droplets className="h-4 w-4 text-red-500" />
                Blood Units
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Track inventory, screening, and expiry.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/blood-bank/units">View Inventory</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-amber-500" />
                Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Manage blood product requests and transfusions.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/blood-bank/requests">View Requests</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PullToRefresh>
  );
}
