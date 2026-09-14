'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  MapPin,
  Pencil,
  Globe,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DhaResultCard } from '@/components/shared/dha-result-card';
import { facilitiesApi } from '@/lib/api/facilities';
import { formatFacilityLevel } from '@/lib/facility-level';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { FacilityInterventionsPanel } from '@/components/admin/facility-interventions-panel';
import type { FacilityDetail } from '@/lib/types/facility';

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
  has_hdu: 'HDU',
  has_nbu: 'NBU',
  has_maternity: 'Maternity',
  has_mortuary: 'Mortuary',
  has_blood_bank: 'Blood Bank',
  has_inventory: 'Inventory',
  has_lis_standalone: 'LIS Standalone',
  has_pharmacy_standalone: 'Pharmacy Standalone',
  has_imaging_standalone: 'Imaging Standalone',
  has_triage: 'Triage',
  has_scheduling: 'Scheduling',
  has_surveillance: 'Surveillance',
  has_immunizations: 'Immunizations',
  has_allied_health: 'Allied Health',
  has_quality: 'Quality',
  has_billing: 'Finance / Billing',
  has_private_insurance: 'Private Insurance',
  has_moh_reporting: 'MOH Reports',
  has_ai_assistant: 'AI Assistant',
  has_cds: 'Clinical Decision Support',
  has_procedures: 'Procedures',
  has_analytics: 'Analytics',
};

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  const text = String(value).trim();
  return text.length > 0 ? text : '-';
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: unknown;
  mono?: boolean;
}) {
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  return (
    <div className="space-y-1 rounded-md border p-2 sm:p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {isObject ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs">
          {formatDisplayValue(value)}
        </pre>
      ) : (
        <p className={mono ? 'break-all font-mono text-xs sm:text-sm' : 'break-words text-sm'}>
          {formatDisplayValue(value)}
        </p>
      )}
    </div>
  );
}

/**
 * Merge cached DHA registry JSON (non-PII) with decrypted PII fields
 * from the facility detail into the shape DhaResultCard expects.
 */
function buildDhaData(facility: FacilityDetail): Record<string, unknown> | null {
  if (!facility.dha_registry_synced_at) return null;
  // Start with the cached non-PII JSON blob (contains address, beds, services, etc.)
  const base: Record<string, unknown> = facility.dha_registry_data
    ? { ...facility.dha_registry_data }
    : {};

  // Overlay structured columns (authoritative, may be more recent)
  base.fidCode = facility.dha_fid_code || base.fidCode;
  base.frCode = facility.dha_fr_code || base.frCode;
  base.facilityLicenseStatus = facility.dha_license_status || base.facilityLicenseStatus;
  base.licenseNumber = facility.dha_license_number || base.licenseNumber;
  base.facilityLicenseEndDate = facility.dha_license_expiry || base.facilityLicenseEndDate;
  base.facilityType = facility.dha_facility_type || base.facilityType;
  base.kephLevel = facility.dha_keph_level || base.kephLevel;
  base.facilityOwnership = facility.dha_ownership || base.facilityOwnership;
  base.regulatoryBody = facility.dha_regulatory_body || base.regulatoryBody;
  base.shaContractStatus = facility.dha_sha_contract_status || base.shaContractStatus;
  base.shaConstractStartDate = facility.dha_sha_contract_start || base.shaConstractStartDate;
  base.shaConstractEndDate = facility.dha_sha_contract_end || base.shaConstractEndDate;

  // Re-inject decrypted PII (these were stripped from dha_registry_data)
  base.facilityAdministratorName = facility.dha_admin_name;
  base.facilityAdministratorPhone = facility.dha_admin_phone;
  base.facilityAdministratorEmail = facility.dha_admin_email;
  base.facilityAdministratorIdentifier = facility.dha_admin_id;
  base.facilityPhoneNumber = facility.dha_facility_phone;
  base.facilityEmail = facility.dha_facility_email;

  return base;
}

export default function FacilityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const facilityId = parseInt(params.id as string);
  const { isSuperuser } = usePermissions();
  const queryClient = useQueryClient();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  const {
    data: facility,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['facility', facilityId],
    queryFn: () => facilitiesApi.get(facilityId),
    enabled: !isNaN(facilityId),
  });

  const syncDha = useMutation({
    mutationFn: () => facilitiesApi.syncDhaRegistry(facilityId),
    onSuccess: (updatedFacility) => {
      setSyncError(null);
      const changedFields: string[] = [];
      if (facility) {
        const comparisons: Array<[keyof FacilityDetail, string]> = [
          ['name', 'name'],
          ['level', 'level'],
          ['level_subtype', 'level subtype'],
          ['ownership', 'ownership'],
          ['sha_facility_code', 'SHA facility code'],
          ['sha_contracted', 'SHA contracted status'],
          ['sha_contract_expiry', 'SHA contract expiry'],
        ];
        comparisons.forEach(([key, label]) => {
          if (facility[key] !== updatedFacility[key]) {
            changedFields.push(label);
          }
        });
      }

      const changedText =
        changedFields.length > 0
          ? `Updated local fields: ${changedFields.join(', ')}.`
          : 'DHA data refreshed. No local identity fields changed.';
      setSyncSuccess(changedText);
      queryClient.setQueryData(['facility', facilityId], updatedFacility);
      queryClient.invalidateQueries({ queryKey: ['facility', facilityId] });
      router.refresh();
    },
    onError: (err: Error) => {
      setSyncSuccess(null);
      setSyncError(err.message || 'Failed to sync DHA registry');
    },
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
    ([key]) => facility[key as keyof typeof facility] === true
  );

  const identityRows: Array<{ label: string; value: unknown; mono?: boolean }> = [
    { label: 'Facility ID', value: facility.id, mono: true },
    { label: 'Facility Name', value: facility.name },
    { label: 'MFL Code', value: facility.mfl_code, mono: true },
    { label: 'Facility Registry Code', value: facility.facility_registry_code, mono: true },
    { label: 'Country Code', value: facility.country_code, mono: true },
    { label: 'Organization', value: facility.organization_name || facility.organization },
    { label: 'Branch Code', value: facility.branch_code, mono: true },
    { label: 'Headquarters', value: facility.is_headquarters },
    { label: 'Active', value: facility.is_active },
    { label: 'Operating Mode', value: facility.operating_mode, mono: true },
    { label: 'Deployment Profile', value: facility.deployment_profile, mono: true },
  ];

  const classificationRows: Array<{ label: string; value: unknown; mono?: boolean }> = [
    { label: 'Level', value: formatFacilityLevel(facility.level, facility.level_subtype) },
    { label: 'Raw Level', value: facility.level, mono: true },
    { label: 'Level Subtype', value: facility.level_subtype || '-' },
    { label: 'Ownership', value: ownershipLabels[facility.ownership] ?? facility.ownership },
    { label: 'Raw Ownership', value: facility.ownership, mono: true },
    { label: 'DHIS2 Org Unit', value: facility.dhis2_org_unit, mono: true },
    { label: 'Logo URL', value: facility.logo },
    { label: 'Effective Logo URL', value: facility.effective_logo_url },
  ];

  const locationRows: Array<{ label: string; value: unknown; mono?: boolean }> = [
    { label: 'County', value: facility.county_name || facility.county },
    { label: 'County ID', value: facility.county, mono: true },
    { label: 'Sub-County', value: facility.sub_county_name || facility.sub_county },
    { label: 'Sub-County ID', value: facility.sub_county, mono: true },
    { label: 'Ward', value: facility.ward_name || facility.ward },
    { label: 'Ward ID', value: facility.ward, mono: true },
    { label: 'Region / State', value: facility.region_state },
    { label: 'District', value: facility.district },
    { label: 'Locality', value: facility.locality },
  ];

  const contractRows: Array<{ label: string; value: unknown; mono?: boolean }> = [
    { label: 'SHA Contracted', value: facility.sha_contracted },
    { label: 'SHA Facility Code', value: facility.sha_facility_code, mono: true },
    {
      label: 'SHA Contract Expiry',
      value: facility.sha_contract_expiry
        ? new Date(facility.sha_contract_expiry).toLocaleDateString()
        : null,
    },
    { label: 'Workstation ID', value: facility.workstation_id, mono: true },
    { label: 'Biometrics Enforced', value: facility.biometrics_enforced },
    {
      label: 'Biometrics Agent National ID',
      value: facility.biometrics_agent_national_id,
      mono: true,
    },
  ];

  const dhaRows: Array<{ label: string; value: unknown; mono?: boolean }> = [
    {
      label: 'Registry Synced At',
      value: facility.dha_registry_synced_at
        ? new Date(facility.dha_registry_synced_at).toLocaleString()
        : null,
    },
    { label: 'DHA FID Code', value: facility.dha_fid_code, mono: true },
    { label: 'DHA FR Code', value: facility.dha_fr_code, mono: true },
    { label: 'DHA License Status', value: facility.dha_license_status, mono: true },
    { label: 'DHA License Number', value: facility.dha_license_number, mono: true },
    { label: 'DHA License Issue Date', value: facility.dha_license_issue_date },
    { label: 'DHA License Expiry', value: facility.dha_license_expiry },
    { label: 'Lab License Number', value: facility.laboratory_license_number, mono: true },
    { label: 'Lab License Issuer', value: facility.laboratory_license_issuer },
    { label: 'Lab License Issue Date', value: facility.laboratory_license_issue_date },
    { label: 'Lab License Expiry', value: facility.laboratory_license_expiry },
    { label: 'DHA Operational Status', value: facility.dha_operational_status, mono: true },
    { label: 'DHA SHA Contract Status', value: facility.dha_sha_contract_status, mono: true },
    { label: 'DHA SHA Contract Start', value: facility.dha_sha_contract_start },
    { label: 'DHA SHA Contract End', value: facility.dha_sha_contract_end },
    { label: 'DHA Total Beds', value: facility.dha_total_beds },
    { label: 'DHA ICU Beds', value: facility.dha_icu_beds },
    { label: 'DHA HDU Beds', value: facility.dha_hdu_beds },
    { label: 'DHA Facility Type', value: facility.dha_facility_type },
    {
      label: 'DHA Facility Type (Normalized)',
      value: facility.dha_facility_type_normalized,
      mono: true,
    },
    { label: 'DHA KEPH Level', value: facility.dha_keph_level },
    { label: 'DHA Ownership', value: facility.dha_ownership },
    { label: 'DHA Regulatory Body', value: facility.dha_regulatory_body, mono: true },
    { label: 'DHA Contract Types', value: facility.dha_contract_types },
    { label: 'DHA Admin Name', value: facility.dha_admin_name },
    { label: 'DHA Admin Phone', value: facility.dha_admin_phone, mono: true },
    { label: 'DHA Admin Email', value: facility.dha_admin_email },
    { label: 'DHA Admin ID', value: facility.dha_admin_id, mono: true },
    { label: 'DHA Facility Phone', value: facility.dha_facility_phone, mono: true },
    { label: 'DHA Facility Email', value: facility.dha_facility_email },
  ];

  const metadataRows: Array<{ label: string; value: unknown; mono?: boolean }> = [
    { label: 'Created At', value: new Date(facility.created_at).toLocaleString() },
    { label: 'Updated At', value: new Date(facility.updated_at).toLocaleString() },
  ];

  const moduleFlagRows = Object.entries(moduleLabels).map(([key, label]) => ({
    label,
    key,
    enabled: Boolean(facility[key as keyof FacilityDetail]),
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={facility.name}
        helpContent="View facility information, modules, and SHA contract status."
        actions={
          isSuperuser ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/facilities/${facilityId}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />
                Edit
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">
            {facility.mfl_code}
            <span className="text-muted-foreground">
              {' '}
              · {formatFacilityLevel(facility.level, facility.level_subtype)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            <MapPin className="mr-1 inline h-3.5 w-3.5" />
            {facility.county_name}, {facility.sub_county_name}
            {facility.ward_name && `, ${facility.ward_name}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          <Badge variant={facility.is_active ? 'default' : 'secondary'}>
            {facility.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {facility.is_headquarters && <Badge variant="outline">HQ</Badge>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Facility Record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Identity and Status</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {identityRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Classification and Integration</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {classificationRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Location</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {locationRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">SHA and Biometrics</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {contractRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">DHA Cached Fields</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {dhaRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Metadata</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {metadataRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
                ))}
              </div>
            </div>

          </CardContent>
        </Card>

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

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">All Module Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {moduleFlagRows.map((row) => (
                <div key={row.key} className="flex items-center justify-between rounded-md border p-2 sm:p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.label}</p>
                  </div>
                  <Badge variant={row.enabled ? 'default' : 'secondary'}>
                    {row.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* SHA Interventions & Tariffs */}
        {facility.sha_contracted && (
          <FacilityInterventionsPanel facilityLevel={facility.level} facilityId={facility.id} />
        )}

        {/* DHA Registry */}
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-medium">DHA Registry</h3>
              {facility.dha_registry_synced_at && (
                <span className="text-xs text-muted-foreground">
                  Synced {new Date(facility.dha_registry_synced_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSyncError(null);
                setSyncSuccess(null);
                syncDha.mutate();
              }}
              disabled={syncDha.isPending}
            >
              {syncDha.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              {facility.dha_registry_synced_at ? 'Refresh' : 'Fetch from DHA'}
            </Button>
          </div>

          {syncSuccess && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{syncSuccess}</AlertDescription>
            </Alert>
          )}

          {syncError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{syncError}</AlertDescription>
            </Alert>
          )}

          {(() => {
            const dhaData = facility ? buildDhaData(facility) : null;
            if (dhaData) return <DhaResultCard data={dhaData} />;
            if (!facility.dha_registry_synced_at)
              return (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No DHA registry data cached. Click &quot;Fetch from DHA&quot; to retrieve it.
                  </CardContent>
                </Card>
              );
            return null;
          })()}
        </div>
      </div>
    </div>
  );
}
