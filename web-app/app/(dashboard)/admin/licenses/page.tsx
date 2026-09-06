// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * License registry for active staff with a recorded professional-license expiry.
 * Access it at /admin/licenses or through the Staff Licenses dashboard card.
 * Supports search, status filtering, pagination, and opening staff profiles.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import { BadgeCheck, Search, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useLicenseList, useLicenseSummary } from '@/lib/hooks/use-rbac';
import type { LicenseStatus, StaffProfile } from '@/lib/types/rbac';
import { formatDate } from '@/lib/utils/format';

const PAGE_SIZE = 20;

function getLicenseStatus(expiry: string): LicenseStatus {
  const daysRemaining = differenceInCalendarDays(parseISO(expiry), startOfDay(new Date()));
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 30) return 'expiring_soon';
  return 'valid';
}

function statusBadge(status: LicenseStatus) {
  if (status === 'expired') return <Badge variant="destructive">Expired</Badge>;
  if (status === 'expiring_soon')
    return <Badge className="bg-amber-500 text-white">Expiring soon</Badge>;
  return <Badge className="bg-emerald-600 text-white">Valid</Badge>;
}

export default function LicenseRegistryPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LicenseStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const { data: summary, refetch: refetchSummary } = useLicenseSummary();
  const {
    data,
    isLoading,
    error,
    refetch: refetchLicenses,
  } = useLicenseList({
    page,
    page_size: PAGE_SIZE,
    search: search || undefined,
    status: status === 'all' ? undefined : status,
  });

  const licenses = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  const handleRefresh = async () => {
    await refresh();
    await Promise.all([refetchSummary(), refetchLicenses()]);
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="License Registry"
          helpContent="Monitor active staff with a recorded professional license expiry. Licenses expiring within 30 days need attention."
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Licensed Staff"
            value={summary?.total ?? 0}
            description="Active records with an expiry date"
            icon={<BadgeCheck className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Expiring Soon"
            value={summary?.expiring_soon ?? 0}
            description="Due within 30 days"
            icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
            valueClassName="text-2xl font-semibold text-amber-600"
          />
          <AdminStatCard
            title="Expired"
            value={summary?.expired ?? 0}
            description="Requires renewal"
            icon={<ShieldX className="h-4 w-4 text-destructive" />}
            valueClassName="text-2xl font-semibold text-destructive"
          />
          <AdminStatCard
            title="Verified"
            value={(summary?.total ?? 0) - (summary?.unverified ?? 0)}
            description="Confirmed through HWR"
            icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search licenses"
                  className="pl-9"
                  placeholder="Search by staff member, license number, or role"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as LicenseStatus | 'all');
                  setPage(1);
                }}
              >
                <SelectTrigger aria-label="Filter by license status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="expiring_soon">Expiring soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="valid">Valid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {error ? (
              <p className="py-10 text-center font-medium text-destructive">
                License records could not be loaded.
              </p>
            ) : isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                data={licenses}
                keyExtractor={(license) => license.id}
                emptyMessage="No active staff licenses match the current filters."
                onRowClick={(license) => router.push(`/admin/staff/${license.id}`)}
                mobileCard={(license) => <LicenseMobileCard license={license} />}
                columns={[
                  {
                    key: 'staff',
                    header: 'Staff member',
                    sortable: true,
                    sortFn: (a, b) => a.full_name.localeCompare(b.full_name),
                    cell: (license) => (
                      <div>
                        <p className="font-medium">{license.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {license.primary_role_name || 'No role assigned'}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: 'license_number',
                    header: 'License number',
                    sortable: true,
                    cell: (license) => (
                      <span className="font-mono text-sm">
                        {license.license_number || 'Not recorded'}
                      </span>
                    ),
                  },
                  {
                    key: 'licensing_body',
                    header: 'Licensing body',
                    hideOnMobile: true,
                    sortable: true,
                    cell: (license) => license.licensing_body || 'Not recorded',
                  },
                  {
                    key: 'license_expiry',
                    header: 'Expires',
                    sortType: 'date',
                    sortable: true,
                    cell: (license) => formatDate(license.license_expiry),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: true,
                    sortFn: (a, b) =>
                      getLicenseStatus(a.license_expiry || '').localeCompare(
                        getLicenseStatus(b.license_expiry || '')
                      ),
                    cell: (license) => statusBadge(getLicenseStatus(license.license_expiry || '')),
                  },
                  {
                    key: 'verification',
                    header: 'Verification',
                    hideOnMobile: true,
                    sortable: true,
                    sortFn: (a, b) => Number(a.license_verified) - Number(b.license_verified),
                    cell: (license) => (
                      <Badge variant={license.license_verified ? 'default' : 'secondary'}>
                        {license.license_verified ? 'Verified' : 'Unverified'}
                      </Badge>
                    ),
                  },
                ]}
              />
            )}
            {totalPages > 1 ? (
              <div className="flex items-center justify-between pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data?.next}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}

function LicenseMobileCard({ license }: { license: StaffProfile }) {
  const status = getLicenseStatus(license.license_expiry || '');
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{license.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {license.primary_role_name || 'No role assigned'}
          </p>
        </div>
        {statusBadge(status)}
      </div>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">License:</span>{' '}
          {license.license_number || 'Not recorded'}
        </p>
        <p>
          <span className="font-medium text-foreground">Expires:</span>{' '}
          {formatDate(license.license_expiry)}
        </p>
        <p>{license.license_verified ? 'HWR verified' : 'Not HWR verified'}</p>
      </div>
      <Button className="mt-3 w-full" variant="outline" size="sm" asChild>
        <Link href={`/admin/staff/${license.id}`}>Open staff profile</Link>
      </Button>
    </Card>
  );
}
