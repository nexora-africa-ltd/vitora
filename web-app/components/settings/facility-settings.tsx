'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth, type FacilityModules } from '@/lib/auth/context';
import { useFacility } from '@/lib/context/facility-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { facilitiesApi, toUserFacility } from '@/lib/api/facilities';
import { API_BASE_URL } from '@/lib/utils/constants';
import type {
  FacilityDetail,
  FacilityLevel,
  FacilityOwnership,
  FacilityUpdateData,
} from '@/lib/types/facility';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { HelpPopover } from '@/components/shared/help-popover';

const FACILITY_LEVELS: Array<{ value: FacilityLevel; label: string }> = [
  { value: '1', label: 'Level 1 - Community Unit' },
  { value: '2', label: 'Level 2 - Dispensary' },
  { value: '3', label: 'Level 3 - Health Centre' },
  { value: '4', label: 'Level 4 - Sub-County Hospital' },
  { value: '5', label: 'Level 5 - County Referral Hospital' },
  { value: '6', label: 'Level 6 - National Referral Hospital' },
];

const FACILITY_OWNERSHIP: Array<{ value: FacilityOwnership; label: string }> = [
  { value: 'GOK', label: 'Government of Kenya' },
  { value: 'FBO', label: 'Faith-Based Organization' },
  { value: 'NGO', label: 'Non-Governmental Organization' },
  { value: 'PRIVATE', label: 'Private Practice' },
];

const MODULE_FIELDS: Array<{
  key: keyof FacilityModules;
  field: keyof FacilityUpdateData;
  title: string;
  description: string;
}> = [
  { key: 'outpatient', field: 'has_outpatient', title: 'Outpatient', description: 'General OPD and ambulatory consultations.' },
  { key: 'inpatient', field: 'has_inpatient', title: 'Inpatient', description: 'Ward admission and bed management.' },
  { key: 'emergency', field: 'has_emergency', title: 'Emergency', description: 'Casualty and urgent emergency care.' },
  { key: 'pharmacy', field: 'has_pharmacy', title: 'Pharmacy', description: 'Dispensing and medicine stock workflows.' },
  { key: 'laboratory', field: 'has_laboratory', title: 'Laboratory', description: 'Diagnostics, orders, and lab results.' },
  { key: 'imaging', field: 'has_imaging', title: 'Imaging', description: 'Radiology and diagnostic imaging services.' },
  { key: 'theatre', field: 'has_theatre', title: 'Theatre', description: 'Surgical theatre and peri-operative workflows.' },
  { key: 'dialysis', field: 'has_dialysis', title: 'Dialysis', description: 'Renal dialysis treatment capability.' },
  { key: 'icu', field: 'has_icu', title: 'ICU', description: 'Intensive care services and monitoring.' },
  { key: 'maternity', field: 'has_maternity', title: 'Maternity', description: 'Maternal and obstetric services.' },
  { key: 'mortuary', field: 'has_mortuary', title: 'Mortuary', description: 'Mortuary and post-mortem support.' },
  { key: 'blood_bank', field: 'has_blood_bank', title: 'Blood Bank', description: 'Blood storage and transfusion services.' },
  { key: 'lis_standalone', field: 'has_lis_standalone', title: 'LIS Standalone', description: 'Lab operates independently — walk-in patients, external orders, no encounter required.' },
];

interface FacilityFormState {
  name: string;
  mfl_code: string;
  level: FacilityLevel;
  ownership: FacilityOwnership;
  sha_contracted: boolean;
  sha_contract_expiry: string;
  sha_facility_code: string;
  workstation_id: string;
  biometrics_agent_national_id: string;
  is_active: boolean;
  has_outpatient: boolean;
  has_inpatient: boolean;
  has_emergency: boolean;
  has_pharmacy: boolean;
  has_laboratory: boolean;
  has_imaging: boolean;
  has_theatre: boolean;
  has_dialysis: boolean;
  has_icu: boolean;
  has_maternity: boolean;
  has_mortuary: boolean;
  has_blood_bank: boolean;
  has_lis_standalone: boolean;
}

function createFormState(facility: FacilityDetail): FacilityFormState {
  return {
    name: facility.name,
    mfl_code: facility.mfl_code,
    level: facility.level as FacilityLevel,
    ownership: facility.ownership as FacilityOwnership,
    sha_contracted: facility.sha_contracted,
    sha_contract_expiry: facility.sha_contract_expiry ?? '',
    sha_facility_code: facility.sha_facility_code,
    workstation_id: facility.workstation_id ?? '',
    biometrics_agent_national_id: facility.biometrics_agent_national_id ?? '',
    is_active: facility.is_active,
    has_outpatient: facility.has_outpatient,
    has_inpatient: facility.has_inpatient,
    has_emergency: facility.has_emergency,
    has_pharmacy: facility.has_pharmacy,
    has_laboratory: facility.has_laboratory,
    has_imaging: facility.has_imaging,
    has_theatre: facility.has_theatre,
    has_dialysis: facility.has_dialysis,
    has_icu: facility.has_icu,
    has_maternity: facility.has_maternity,
    has_mortuary: facility.has_mortuary,
    has_blood_bank: facility.has_blood_bank,
    has_lis_standalone: facility.has_lis_standalone,
  };
}

/**
 * Shown when no facility is in the session context.
 * Fetches available facilities and lets the user select one, or links to create a new one.
 */
function NoFacilityState() {
  const { switchFacility } = useFacility();
  const { isSuperuser } = usePermissions();

  const facilitiesQuery = useQuery({
    queryKey: ['my-facilities-onboarding'],
    queryFn: () => facilitiesApi.myFacilities(),
  });

  // Also try the full list for admins (myFacilities only returns assigned ones)
  const allFacilitiesQuery = useQuery({
    queryKey: ['all-facilities-onboarding'],
    queryFn: () => facilitiesApi.list({ page_size: 50 }),
    enabled: isSuperuser || (facilitiesQuery.isSuccess && facilitiesQuery.data.length === 0),
  });

  const availableFacilities = facilitiesQuery.data?.length
    ? facilitiesQuery.data
    : allFacilitiesQuery.data?.results ?? [];

  const isLoading = facilitiesQuery.isLoading || (availableFacilities.length === 0 && allFacilitiesQuery.isLoading);

  const handleSelect = (fac: typeof availableFacilities[number]) => {
    switchFacility({
      id: fac.id,
      name: fac.name,
      mfl_code: fac.mfl_code,
      level: fac.level,
      sha_contracted: fac.sha_contracted,
      modules: {
        outpatient: true,
        inpatient: false,
        emergency: false,
        pharmacy: false,
        laboratory: false,
        imaging: false,
        theatre: false,
        dialysis: false,
        icu: false,
        maternity: false,
        mortuary: false,
        blood_bank: false,
        inventory: false,
        lis_standalone: false,
      },
    });
    // Page will re-render with the selected facility
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          Select a Facility
        </CardTitle>
        <CardDescription>
          Choose a facility to configure its modules and settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && availableFacilities.length > 0 && (
          <div className="space-y-2">
            {availableFacilities.map((fac) => (
              <button
                key={fac.id}
                onClick={() => handleSelect(fac)}
                className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{fac.name}</p>
                  <p className="text-xs text-muted-foreground">
                    MFL: {fac.mfl_code} &middot; Level {fac.level}
                    {fac.county_name ? ` · ${fac.county_name}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="ml-3 shrink-0">
                  Select
                </Badge>
              </button>
            ))}
          </div>
        )}

        {!isLoading && availableFacilities.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium">No facilities found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a facility first, then come back to configure its modules.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/admin/facilities/new">Create Facility</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FacilitySettingsTab() {
  const queryClient = useQueryClient();
  const { updateUserFacility } = useAuth();
  const { hasPermission, isSuperuser } = usePermissions();
  const {
    facility,
    assignedFacility,
    facilityOverride,
    isUsingFacilityOverride,
    setFacilityOverride,
  } = useFacility();
  const [form, setForm] = useState<FacilityFormState | null>(null);

  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const canManageFacility = isSuperuser || hasPermission('change_facility');
  const activeFacilityId = facility?.id ?? null;

  const facilityQuery = useQuery({
    queryKey: ['facility', activeFacilityId],
    queryFn: () => facilitiesApi.get(activeFacilityId as number),
    enabled: activeFacilityId !== null,
  });

  useEffect(() => {
    if (facilityQuery.data) {
      setForm(createFormState(facilityQuery.data));
      setLogoPreview(facilityQuery.data.effective_logo_url ?? facilityQuery.data.logo ?? null);
    }
  }, [facilityQuery.data]);

  const isDirty = useMemo(() => {
    if (!form || !facilityQuery.data) {
      return false;
    }

    return JSON.stringify(form) !== JSON.stringify(createFormState(facilityQuery.data));
  }, [form, facilityQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async (values: FacilityFormState) => {
      if (!activeFacilityId) {
        throw new Error('No facility selected');
      }

      const payload: FacilityUpdateData = {
        ...values,
        sha_contract_expiry: values.sha_contract_expiry || null,
      };

      return facilitiesApi.update(activeFacilityId, payload);
    },
    onSuccess: (updatedFacility) => {
      queryClient.setQueryData(['facility', updatedFacility.id], updatedFacility);
      queryClient.invalidateQueries({ queryKey: ['facility-detail', updatedFacility.id] });
      queryClient.invalidateQueries({ queryKey: ['debug-facilities'] });

      const nextUserFacility = toUserFacility(updatedFacility);

      if (assignedFacility?.id === updatedFacility.id) {
        updateUserFacility(nextUserFacility);
      }

      if (isUsingFacilityOverride && facilityOverride?.id === updatedFacility.id) {
        setFacilityOverride(nextUserFacility);
      }

      setForm(createFormState(updatedFacility));
      toast.success('Facility settings updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update facility settings');
    },
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeFacilityId) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2 MB');
      return;
    }
    setIsUploadingLogo(true);
    try {
      const updated = await facilitiesApi.uploadLogo(activeFacilityId, file);
      queryClient.setQueryData(['facility', activeFacilityId], updated);
      setLogoPreview(updated.effective_logo_url ?? updated.logo ?? null);
      toast.success('Logo uploaded');
    } catch {
      toast.error('Could not upload logo');
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoRemove = async () => {
    if (!activeFacilityId) return;
    setIsUploadingLogo(true);
    try {
      const updated = await facilitiesApi.removeLogo(activeFacilityId);
      queryClient.setQueryData(['facility', activeFacilityId], updated);
      setLogoPreview(updated.effective_logo_url ?? null);
      toast.success('Logo removed');
    } catch {
      toast.error('Could not remove logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  /** Whether the displayed logo is inherited from the organization (not the facility's own). */
  const isInheritedLogo = !facilityQuery.data?.logo && !!logoPreview;

  if (!facility) {
    return <NoFacilityState />;
  }

  if (facilityQuery.isLoading || !form) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (facilityQuery.error || !facilityQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Facility Information</CardTitle>
          <CardDescription>Unable to load facility settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTitle>Facility settings unavailable</AlertTitle>
            <AlertDescription>
              {facilityQuery.error instanceof Error ? facilityQuery.error.message : 'An unknown error occurred.'}
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => void facilityQuery.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isUsingFacilityOverride && facilityOverride && assignedFacility && (
        <Alert>
          <AlertTitle>Development facility override active</AlertTitle>
          <AlertDescription>
            Editing <strong>{facilityOverride.name}</strong> while your assigned facility remains <strong>{assignedFacility.name}</strong>.
          </AlertDescription>
        </Alert>
      )}

      {!canManageFacility && (
        <Alert>
          <AlertTitle>Read-only facility view</AlertTitle>
          <AlertDescription>
            You can review facility details here, but updating them requires facility management privileges.
          </AlertDescription>
        </Alert>
      )}

      {/* Logo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              Facility Logo
            </CardTitle>
            <HelpPopover content="Upload a logo for this facility's printed documents (discharge summaries, lab reports, etc.). If not set, the parent organization's logo is used automatically." />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <div className="relative h-16 w-16 shrink-0 rounded-lg border overflow-hidden bg-muted">
                <img
                  src={logoPreview.startsWith('http') ? logoPreview : `${API_BASE_URL}${logoPreview}`}
                  alt="Facility logo"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <Building2 className="h-6 w-6" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canManageFacility || isUploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingLogo ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
                  {facilityQuery.data?.logo ? 'Change' : 'Upload'}
                </Button>
                {facilityQuery.data?.logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canManageFacility || isUploadingLogo}
                    onClick={handleLogoRemove}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
              {isInheritedLogo && (
                <p className="text-xs text-muted-foreground">
                  Using organization logo. Upload a facility-specific logo to override.
                </p>
              )}
              {!logoPreview && (
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, or WebP. Max 2 MB.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Facility Information
              </CardTitle>
              <CardDescription>
                Manage facility identity, SHA enrollment details, and service capabilities.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={form.is_active ? 'default' : 'secondary'}>
                {form.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant={form.sha_contracted ? 'default' : 'outline'}>
                {form.sha_contracted ? 'SHA Contracted' : 'SHA Not Contracted'}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="facility-name">Facility name</Label>
              <Input
                id="facility-name"
                value={form.name}
                disabled={!canManageFacility || updateMutation.isPending}
                onChange={(event) => setForm((prev) => prev ? { ...prev, name: event.target.value } : prev)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="facility-mfl">MFL code</Label>
              <Input
                id="facility-mfl"
                value={form.mfl_code}
                disabled={!canManageFacility || updateMutation.isPending}
                onChange={(event) => setForm((prev) => prev ? { ...prev, mfl_code: event.target.value } : prev)}
              />
            </div>

            <div className="space-y-2">
              <Label>KEPH level</Label>
              <Select
                value={form.level}
                onValueChange={(value) => setForm((prev) => prev ? { ...prev, level: value as FacilityLevel } : prev)}
                disabled={!canManageFacility || updateMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {FACILITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ownership</Label>
              <Select
                value={form.ownership}
                onValueChange={(value) => setForm((prev) => prev ? { ...prev, ownership: value as FacilityOwnership } : prev)}
                disabled={!canManageFacility || updateMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ownership" />
                </SelectTrigger>
                <SelectContent>
                  {FACILITY_OWNERSHIP.map((ownership) => (
                    <SelectItem key={ownership.value} value={ownership.value}>
                      {ownership.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="grid gap-4 rounded-xl border border-primary/10 bg-muted/20 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">County</p>
              <p className="mt-1 text-sm font-medium">{facilityQuery.data.county_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Sub-county</p>
              <p className="mt-1 text-sm font-medium">{facilityQuery.data.sub_county_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Ward</p>
              <p className="mt-1 text-sm font-medium">{facilityQuery.data.ward_name || 'Not specified'}</p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sha-facility-code">SHA facility code</Label>
              <Input
                id="sha-facility-code"
                value={form.sha_facility_code}
                disabled={!canManageFacility || updateMutation.isPending}
                onChange={(event) => setForm((prev) => prev ? { ...prev, sha_facility_code: event.target.value } : prev)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sha-contract-expiry">SHA contract expiry</Label>
              <Input
                id="sha-contract-expiry"
                type="date"
                value={form.sha_contract_expiry}
                disabled={!canManageFacility || updateMutation.isPending}
                onChange={(event) => setForm((prev) => prev ? { ...prev, sha_contract_expiry: event.target.value } : prev)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workstation-id">Biometric workstation ID</Label>
              <Input
                id="workstation-id"
                placeholder="e.g. WS-001"
                value={form.workstation_id}
                disabled={!canManageFacility || updateMutation.isPending}
                onChange={(event) => setForm((prev) => prev ? { ...prev, workstation_id: event.target.value } : prev)}
              />
              <p className="text-xs text-muted-foreground">Identifies this workstation for DHA biometric consent.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="biometrics-agent-id">Biometric agent national ID</Label>
              <Input
                id="biometrics-agent-id"
                placeholder="National ID of the authorizing agent"
                value={form.biometrics_agent_national_id}
                disabled={!canManageFacility || updateMutation.isPending}
                onChange={(event) => setForm((prev) => prev ? { ...prev, biometrics_agent_national_id: event.target.value } : prev)}
              />
              <p className="text-xs text-muted-foreground">National ID of the staff member registered with DHA for biometric authorization.</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-primary/10 px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">SHA contracted</p>
                <p className="text-sm text-muted-foreground">Enables SHA-linked claims and validation workflows.</p>
              </div>
              <Switch
                checked={form.sha_contracted}
                disabled={!canManageFacility || updateMutation.isPending}
                onCheckedChange={(checked) => setForm((prev) => prev ? { ...prev, sha_contracted: checked } : prev)}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-primary/10 px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Facility active</p>
                <p className="text-sm text-muted-foreground">Marks whether the facility is currently operational.</p>
              </div>
              <Switch
                checked={form.is_active}
                disabled={!canManageFacility || updateMutation.isPending}
                onCheckedChange={(checked) => setForm((prev) => prev ? { ...prev, is_active: checked } : prev)}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Service capabilities</h3>
                <p className="text-sm text-muted-foreground">These toggles control which modules the facility advertises to the capability layer.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {MODULE_FIELDS.map((moduleField) => (
                <div key={moduleField.key} className="flex items-start justify-between gap-4 rounded-xl border border-primary/10 bg-background p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{moduleField.title}</p>
                    <p className="text-sm text-muted-foreground">{moduleField.description}</p>
                  </div>
                  <Switch
                    checked={form[moduleField.field] as boolean}
                    disabled={!canManageFacility || updateMutation.isPending}
                    onCheckedChange={(checked) => setForm((prev) => prev ? { ...prev, [moduleField.field]: checked } : prev)}
                  />
                </div>
              ))}
            </div>
          </section>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            Current context: {facility.name}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                if (facilityQuery.data) {
                  setForm(createFormState(facilityQuery.data));
                }
              }}
              disabled={!isDirty || updateMutation.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button
              onClick={() => form && updateMutation.mutate(form)}
              disabled={!canManageFacility || !isDirty || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save facility settings
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
