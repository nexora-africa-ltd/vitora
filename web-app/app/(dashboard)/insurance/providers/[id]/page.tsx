'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Building2, Globe, Mail, Phone, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useInsuranceProvider, useInsurancePlans } from '@/lib/hooks/use-insurance';
import { PROVIDER_TYPE_LABELS } from '@/lib/types/insurance';
import type { InsurancePlan, InsuranceProviderStatus } from '@/lib/types/insurance';

const STATUS_COLORS: Record<InsuranceProviderStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function InsuranceProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const providerId = Number(params.id);

  const { data: provider, isLoading } = useInsuranceProvider(providerId);
  const { data: plansData } = useInsurancePlans({ provider: providerId });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!provider) {
    return <div className="text-center py-10 text-muted-foreground">Provider not found.</div>;
  }

  const plans = plansData?.results ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={provider.name}
        helpContent="View provider details, associated plans, and contact information."
        actions={
          <Button variant="outline" onClick={() => router.push(`/insurance/providers`)}>
            All Providers
          </Button>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium">
            {provider.code}
            <span className="text-muted-foreground"> • {PROVIDER_TYPE_LABELS[provider.provider_type]}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {provider.plans_count} plans • {provider.active_enrollments_count} active enrollments
          </p>
        </div>
        <Badge className={`${STATUS_COLORS[provider.status]} shrink-0 w-fit self-start sm:self-auto`}>
          {provider.status}
        </Badge>
      </div>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {provider.contact_person && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{provider.contact_person}</span>
              </div>
            )}
            {provider.contact_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{provider.contact_email}</span>
              </div>
            )}
            {provider.contact_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{provider.contact_phone}</span>
              </div>
            )}
            {provider.website && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {provider.website}
                </a>
              </div>
            )}
            {provider.address && (
              <div className="flex items-center gap-2 col-span-full">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{provider.address}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plans Table */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Insurance Plans</CardTitle>
          <Badge variant="secondary">{plans.length} plan{plans.length !== 1 ? 's' : ''}</Badge>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable<InsurancePlan>
            data={plans}
            columns={[
              { key: 'name', header: 'Plan Name', sortable: true, cell: (p) => <span className="font-medium">{p.name}</span> },
              { key: 'code', header: 'Code', sortable: true, hideOnMobile: true },
              { key: 'coverage_type', header: 'Coverage', sortable: true, hideOnMobile: true, cell: (p) => p.coverage_type },
              { key: 'default_copay_percent', header: 'Co-pay %', sortable: true, sortType: 'number', cell: (p) => `${p.default_copay_percent}%` },
              { key: 'annual_limit', header: 'Annual Limit', sortable: true, hideOnMobile: true, cell: (p) => p.annual_limit ? `KES ${Number(p.annual_limit).toLocaleString()}` : '—' },
              { key: 'status', header: 'Status', sortable: true, cell: (p) => (
                <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{p.status}</Badge>
              )},
            ]}
            keyExtractor={(p) => p.id}
            emptyMessage="No plans registered for this provider."
          />
        </CardContent>
      </Card>

      {/* Notes */}
      {provider.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{provider.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
