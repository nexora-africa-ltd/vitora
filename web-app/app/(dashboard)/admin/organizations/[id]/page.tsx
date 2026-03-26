/**
 * Organization Detail Page
 * Multitenancy: View organization details, facilities, and subscription info.
 */
'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  Users,
  Mail,
  Phone,
  Globe,
  Shield,
  Calendar,
  Settings,
  Plus,
  Pencil,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { organizationsApi } from '@/lib/api/organizations';
import { API_BASE_URL } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';
import type { SubscriptionTier } from '@/lib/types/organization';

const tierColors: Record<SubscriptionTier, string> = {
  FREE: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  BASIC: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  PROFESSIONAL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  ENTERPRISE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

const levelLabels: Record<string, string> = {
  '1': 'Level 1 – Community Unit',
  '2': 'Level 2 – Dispensary',
  '3': 'Level 3 – Health Centre',
  '4': 'Level 4 – Sub-County Hospital',
  '5': 'Level 5 – County Referral Hospital',
  '6': 'Level 6 – National Referral Hospital',
};

function tierLabel(tier: SubscriptionTier): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = parseInt(params.id as string);
  const { refresh, isRefreshing } = usePageRefresh();
  const { isSuperuser } = usePermissions();

  const { data: org, isLoading, error } = useQuery({
    queryKey: ['organization', orgId],
    queryFn: () => organizationsApi.get(orgId),
    enabled: !isNaN(orgId),
  });

  const { data: facilitiesData, isLoading: facilitiesLoading } = useQuery({
    queryKey: ['organization-facilities', orgId],
    queryFn: () => organizationsApi.listFacilities(orgId),
    enabled: !isNaN(orgId),
  });

  const facilities = facilitiesData ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="space-y-4">
        <PageHeader title="Organization Not Found" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>The organization could not be loaded.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={org.name}
          helpContent="View organization details including contact information, subscription, and linked facilities."
          actions={
            isSuperuser ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/organizations/${orgId}/edit`}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Link>
              </Button>
            ) : undefined
          }
        />

        {/* Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3 min-w-0">
            {org.logo ? (
              <img
                src={org.logo.startsWith('http') ? org.logo : `${API_BASE_URL}${org.logo}`}
                alt={`${org.name} logo`}
                className="h-10 w-10 rounded-md object-cover shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {org.slug}
              {org.county_name && (
                <span className="text-muted-foreground"> · {org.county_name}</span>
              )}
              {org.sub_county_name && (
                <span className="text-muted-foreground"> / {org.sub_county_name}</span>
              )}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Created {formatDate(org.created_at)}
              {org.updated_at !== org.created_at && (
                <> · Updated {formatDate(org.updated_at)}</>
              )}
            </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`${tierColors[org.subscription_tier]} w-fit`}>
              {tierLabel(org.subscription_tier)}
            </Badge>
            <Badge variant={org.is_active ? 'default' : 'secondary'} className="w-fit">
              {org.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contact Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Email"
                value={org.contact_email || '—'}
              />
              <InfoRow
                icon={<Phone className="h-3.5 w-3.5" />}
                label="Phone"
                value={org.contact_phone || '—'}
              />
              <InfoRow
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Address"
                value={org.address || '—'}
              />
              <InfoRow
                icon={<Globe className="h-3.5 w-3.5" />}
                label="Location"
                value={
                  [org.county_name, org.sub_county_name].filter(Boolean).join(', ') || '—'
                }
              />
            </CardContent>
          </Card>

          {/* Subscription & Limits */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Subscription & Limits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                icon={<Settings className="h-3.5 w-3.5" />}
                label="Tier"
                value={tierLabel(org.subscription_tier)}
              />
              <InfoRow
                icon={<Building2 className="h-3.5 w-3.5" />}
                label="Max Facilities"
                value={org.max_facilities != null ? String(org.max_facilities) : 'Unlimited'}
              />
              <InfoRow
                icon={<Users className="h-3.5 w-3.5" />}
                label="Max Users"
                value={org.max_users != null ? String(org.max_users) : 'Unlimited'}
              />
              <InfoRow
                icon={<Calendar className="h-3.5 w-3.5" />}
                label="Data Retention"
                value={`${org.data_retention_years} years`}
              />
            </CardContent>
          </Card>

          {/* Usage */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <UsageStat
                  label="Facilities"
                  value={org.facility_count}
                  max={org.max_facilities}
                />
                <UsageStat
                  label="Staff"
                  value={org.staff_count}
                  max={org.max_users}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Facilities Table */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Facilities ({facilities.length})
            </CardTitle>
            {isSuperuser && (
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link href={`/admin/organizations/${orgId}/facilities/new`}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Facility
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {facilitiesLoading ? (
              <div className="space-y-3 px-6 sm:px-0">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : facilities.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 sm:px-0 py-4">
                No facilities registered for this organization.
              </p>
            ) : (
              <ResponsiveTable
                data={facilities}
                keyExtractor={(f) => f.id}
                onRowClick={(f) => router.push(`/admin/facilities/${f.id}`)}
                columns={[
                  {
                    key: 'name',
                    header: 'Facility',
                    sortable: true,
                    cell: (f) => (
                      <div>
                        <span className="font-medium">
                          {f.name}
                          {f.is_headquarters && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                              HQ
                            </Badge>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">{f.mfl_code}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'level',
                    header: 'KEPH Level',
                    sortable: true,
                    cell: (f) => (
                      <span className="text-sm">{levelLabels[f.level] ?? `Level ${f.level}`}</span>
                    ),
                    hideOnMobile: true,
                  },
                  {
                    key: 'county_name',
                    header: 'Location',
                    sortable: true,
                    cell: (f) => (
                      <span className="text-sm text-muted-foreground">
                        {f.county_name}, {f.sub_county_name}
                      </span>
                    ),
                    hideOnMobile: true,
                  },
                  {
                    key: 'sha_contracted',
                    header: 'SHA',
                    sortable: true,
                    cell: (f) => (
                      <Badge variant={f.sha_contracted ? 'default' : 'secondary'}>
                        {f.sha_contracted ? 'Contracted' : 'No'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'is_active',
                    header: 'Status',
                    sortable: true,
                    cell: (f) => (
                      <Badge variant={f.is_active ? 'default' : 'secondary'}>
                        {f.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    ),
                  },
                ]}
                mobileCard={(f) => (
                  <div className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <span className="font-medium truncate block">
                        {f.name}
                        {f.is_headquarters && (
                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                            HQ
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {f.mfl_code} · {f.county_name}
                      </span>
                    </div>
                    <Badge variant={f.is_active ? 'default' : 'secondary'} className="shrink-0">
                      {f.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate">{value}</p>
      </div>
    </div>
  );
}

function UsageStat({ label, value, max }: { label: string; value: number; max?: number | null }) {
  const percentage = max ? Math.round((value / max) * 100) : null;
  const isNearLimit = percentage !== null && percentage >= 80;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">
        {value}
        {max != null && (
          <span className="text-sm font-normal text-muted-foreground"> / {max}</span>
        )}
      </p>
      {percentage !== null && (
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${isNearLimit ? 'bg-destructive' : 'bg-primary'}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
