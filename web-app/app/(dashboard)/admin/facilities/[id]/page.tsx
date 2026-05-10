'use client';

import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, MapPin, Pencil, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { facilitiesApi } from '@/lib/api/facilities';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { FacilityInterventionsPanel } from '@/components/admin/facility-interventions-panel';

const levelLabels: Record<string, string> = {
  '1': 'Level 1 – Community',
  '2': 'Level 2 – Dispensary',
  '3': 'Level 3 – Health Centre',
  '4': 'Level 4 – Sub-County Hospital',
  '5': 'Level 5 – County Referral Hospital',
  '6': 'Level 6 – National Referral Hospital',
};

const ownershipLabels: Record<string, string> = {
  GOK: 'Government of Kenya',
  FBO: 'Faith-Based Organization',
  NGO: 'Non-Governmental Organization',
  PRIVATE: 'Private',
};

const moduleLabels: Record<string, string> = {
  has_outpatient: 'Outpatient',
  has_inpatient: 'Inpatient',
  has_emergency: 'Emergency',
  has_pharmacy: 'Pharmacy',
  has_laboratory: 'Laboratory',
  has_imaging: 'Imaging',
  has_theatre: 'Theatre',
  has_dialysis: 'Dialysis',
  has_icu: 'ICU',
  has_maternity: 'Maternity',
  has_mortuary: 'Mortuary',
  has_blood_bank: 'Blood Bank',
  has_inventory: 'Inventory',
  has_lis_standalone: 'LIS Standalone',
  has_triage: 'Triage',
  has_scheduling: 'Scheduling',
  has_surveillance: 'Surveillance',
  has_immunizations: 'Immunizations',
  has_allied_health: 'Allied Health',
  has_quality: 'Quality',
  has_billing: 'Finance / Billing',
};

export default function FacilityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const facilityId = parseInt(params.id as string);
  const { isSuperuser } = usePermissions();

  const { data: facility, isLoading, error } = useQuery({
    queryKey: ['facility', facilityId],
    queryFn: () => facilitiesApi.get(facilityId),
    enabled: !isNaN(facilityId),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !facility) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Facility Details"
          helpContent="View facility information, modules, and SHA status."
        />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Facility not found or failed to load.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const enabledModules = Object.entries(moduleLabels).filter(
    ([key]) => facility[key as keyof typeof facility] === true,
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={facility.name}
        helpContent="View facility information, modules, and SHA contract status."
        actions={
          isSuperuser ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/facilities/${facilityId}/edit`}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">
            {facility.mfl_code}
            <span className="text-muted-foreground"> · {levelLabels[facility.level] ?? `Level ${facility.level}`}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            <MapPin className="mr-1 inline h-3.5 w-3.5" />
            {facility.county_name}, {facility.sub_county_name}
            {facility.ward_name && `, ${facility.ward_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <Badge variant={facility.is_active ? 'default' : 'secondary'}>
            {facility.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {facility.is_headquarters && (
            <Badge variant="outline">HQ</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* General Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">General Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">MFL Code</span>
              <span className="font-medium">{facility.mfl_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Level</span>
              <span>{levelLabels[facility.level] ?? facility.level}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ownership</span>
              <span>{ownershipLabels[facility.ownership] ?? facility.ownership}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Organization</span>
              <span>{facility.organization_name ?? '—'}</span>
            </div>
            {facility.branch_code && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch Code</span>
                <span className="font-mono text-xs">{facility.branch_code}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SHA Contract */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              SHA Contract
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              {facility.sha_contracted ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  Contracted
                </Badge>
              ) : (
                <Badge variant="secondary">Not Contracted</Badge>
              )}
            </div>
            {facility.sha_facility_code && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">SHA Facility Code</span>
                <span className="font-mono text-xs">{facility.sha_facility_code}</span>
              </div>
            )}
            {facility.sha_contract_expiry && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contract Expiry</span>
                <span>{new Date(facility.sha_contract_expiry).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Enabled Modules */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Enabled Modules</CardTitle>
          </CardHeader>
          <CardContent>
            {enabledModules.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {enabledModules.map(([, label]) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No modules enabled.</p>
            )}
          </CardContent>
        </Card>

        {/* SHA Interventions & Tariffs */}
        {facility.sha_contracted && (
          <FacilityInterventionsPanel facilityLevel={facility.level} />
        )}
      </div>
    </div>
  );
}
