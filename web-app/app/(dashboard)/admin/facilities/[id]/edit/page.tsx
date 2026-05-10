/**
 * Edit Facility Page
 * RBAC: Admin only. Pre-populates form from existing facility data.
 */
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save, Building2, MapPin, Shield, Loader2, Boxes } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/lib/hooks/use-toast';
import { useCounties, useSubCounties, useWards } from '@/lib/hooks/use-locations';
import { facilitiesApi, toUserFacility } from '@/lib/api/facilities';
import { useAuth } from '@/lib/auth/context';
import { useFacility } from '@/lib/context/facility-context';
import type { FacilityLevel, FacilityOwnership, FacilityUpdateData } from '@/lib/types/facility';

const LEVELS: { value: FacilityLevel; label: string }[] = [
  { value: '1', label: 'Level 1 – Community Unit' },
  { value: '2', label: 'Level 2 – Dispensary' },
  { value: '3', label: 'Level 3 – Health Centre' },
  { value: '4', label: 'Level 4 – Sub-County Hospital' },
  { value: '5', label: 'Level 5 – County Referral Hospital' },
  { value: '6', label: 'Level 6 – National Referral Hospital' },
];

const OWNERSHIPS: { value: FacilityOwnership; label: string }[] = [
  { value: 'GOK', label: 'Government of Kenya' },
  { value: 'FBO', label: 'Faith-Based Organization' },
  { value: 'NGO', label: 'Non-Governmental Organization' },
  { value: 'PRIVATE', label: 'Private' },
];

const MODULE_LABELS: { key: string; label: string }[] = [
  { key: 'has_outpatient', label: 'Outpatient' },
  { key: 'has_inpatient', label: 'Inpatient' },
  { key: 'has_emergency', label: 'Emergency' },
  { key: 'has_pharmacy', label: 'Pharmacy' },
  { key: 'has_laboratory', label: 'Laboratory' },
  { key: 'has_imaging', label: 'Imaging' },
  { key: 'has_theatre', label: 'Theatre' },
  { key: 'has_dialysis', label: 'Dialysis' },
  { key: 'has_icu', label: 'ICU' },
  { key: 'has_maternity', label: 'Maternity' },
  { key: 'has_mortuary', label: 'Mortuary' },
  { key: 'has_blood_bank', label: 'Blood Bank' },
  { key: 'has_inventory', label: 'Inventory' },
  { key: 'has_lis_standalone', label: 'LIS Standalone' },
  { key: 'has_triage', label: 'Triage' },
  { key: 'has_scheduling', label: 'Scheduling' },
  { key: 'has_surveillance', label: 'Surveillance' },
  { key: 'has_immunizations', label: 'Immunizations' },
  { key: 'has_allied_health', label: 'Allied Health' },
  { key: 'has_quality', label: 'Quality' },
  { key: 'has_billing', label: 'Finance / Billing' },
];

export default function EditFacilityPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const facilityId = parseInt(params.id as string);
  const { updateUserFacility } = useAuth();
  const { facility: activeFacility, facilityOverride, isUsingFacilityOverride, setFacilityOverride } = useFacility();

  const { data: facility, isLoading } = useQuery({
    queryKey: ['facility', facilityId],
    queryFn: () => facilitiesApi.get(facilityId),
    enabled: !isNaN(facilityId),
  });

  const [formData, setFormData] = useState({
    name: '',
    mfl_code: '',
    level: '' as string,
    ownership: '' as string,
    sha_contracted: false,
    sha_facility_code: '',
    sha_contract_expiry: '',
    is_active: true,
    // Module flags
    has_outpatient: false,
    has_inpatient: false,
    has_emergency: false,
    has_pharmacy: false,
    has_laboratory: false,
    has_imaging: false,
    has_theatre: false,
    has_dialysis: false,
    has_icu: false,
    has_maternity: false,
    has_mortuary: false,
    has_blood_bank: false,
    has_inventory: false,
    has_lis_standalone: false,
    has_triage: true,
    has_scheduling: true,
    has_surveillance: false,
    has_immunizations: false,
    has_allied_health: false,
    has_quality: false,
    has_billing: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [countyId, setCountyId] = useState<number | undefined>();
  const [subCountyId, setSubCountyId] = useState<number | undefined>();
  const [wardId, setWardId] = useState<number | undefined>();

  const { data: counties } = useCounties();
  const { data: subCounties } = useSubCounties(countyId);
  const { data: wards } = useWards(subCountyId);

  // Populate form
  useEffect(() => {
    if (facility) {
      setFormData({
        name: facility.name,
        mfl_code: facility.mfl_code,
        level: facility.level,
        ownership: facility.ownership,
        sha_contracted: facility.sha_contracted,
        sha_facility_code: facility.sha_facility_code || '',
        sha_contract_expiry: facility.sha_contract_expiry || '',
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
        has_inventory: facility.has_inventory,
        has_lis_standalone: facility.has_lis_standalone,
        has_triage: facility.has_triage,
        has_scheduling: facility.has_scheduling,
        has_surveillance: facility.has_surveillance,
        has_immunizations: facility.has_immunizations,
        has_allied_health: facility.has_allied_health,
        has_quality: facility.has_quality,
        has_billing: facility.has_billing,
      });
      setCountyId(facility.county);
      setSubCountyId(facility.sub_county);
      if (facility.ward) setWardId(facility.ward);
    }
  }, [facility]);

  const updateFacility = useMutation({
    mutationFn: (data: FacilityUpdateData) => facilitiesApi.update(facilityId, data),
    onSuccess: (updatedFacility) => {
      queryClient.invalidateQueries({ queryKey: ['facility', facilityId] });
      queryClient.invalidateQueries({ queryKey: ['facility-detail', facilityId] });
      queryClient.invalidateQueries({ queryKey: ['facilities'] });

      // Propagate module changes to auth/facility context so sidebar updates immediately
      const nextUserFacility = toUserFacility(updatedFacility);
      if (activeFacility?.id === facilityId && !isUsingFacilityOverride) {
        updateUserFacility(nextUserFacility);
      }
      if (isUsingFacilityOverride && facilityOverride?.id === facilityId) {
        setFacilityOverride(nextUserFacility);
      }

      toast({ title: 'Facility updated', description: `${formData.name} has been saved.` });
      router.push(`/admin/facilities/${facilityId}`);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: Record<string, string[]> } };
      const fieldErrors = axiosErr?.response?.data;
      if (fieldErrors && typeof fieldErrors === 'object') {
        const mapped: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(fieldErrors)) {
          if (Array.isArray(msgs)) mapped[key] = msgs.join(', ');
        }
        if (Object.keys(mapped).length > 0) {
          setFormErrors((prev) => ({ ...prev, ...mapped }));
          toast({ variant: 'destructive', title: 'Validation error', description: 'Please fix the highlighted fields.' });
          return;
        }
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update facility',
      });
    },
  });

  const handleChange = (field: string, value: string | boolean | number | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Facility name is required';
    if (!formData.mfl_code.trim()) errors.mfl_code = 'MFL code is required';
    if (!formData.level) errors.level = 'KEPH level is required';
    if (!formData.ownership) errors.ownership = 'Ownership is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: FacilityUpdateData = {
      name: formData.name,
      mfl_code: formData.mfl_code,
      level: formData.level as FacilityLevel,
      ownership: formData.ownership as FacilityOwnership,
      sha_contracted: formData.sha_contracted,
      sha_facility_code: formData.sha_facility_code || undefined,
      sha_contract_expiry: formData.sha_contract_expiry || null,
      is_active: formData.is_active,
      has_outpatient: formData.has_outpatient,
      has_inpatient: formData.has_inpatient,
      has_emergency: formData.has_emergency,
      has_pharmacy: formData.has_pharmacy,
      has_laboratory: formData.has_laboratory,
      has_imaging: formData.has_imaging,
      has_theatre: formData.has_theatre,
      has_dialysis: formData.has_dialysis,
      has_icu: formData.has_icu,
      has_maternity: formData.has_maternity,
      has_mortuary: formData.has_mortuary,
      has_blood_bank: formData.has_blood_bank,
      has_inventory: formData.has_inventory,
      has_lis_standalone: formData.has_lis_standalone,
      has_triage: formData.has_triage,
      has_scheduling: formData.has_scheduling,
      has_surveillance: formData.has_surveillance,
      has_immunizations: formData.has_immunizations,
      has_allied_health: formData.has_allied_health,
      has_quality: formData.has_quality,
      has_billing: formData.has_billing,
    };
    updateFacility.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Edit ${facility?.name ?? 'Facility'}`}
        helpContent="Update facility details, KEPH level, SHA contract, and module capabilities."
      />

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* General */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Facility Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Facility Name *</Label>
              <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mfl_code">MFL Code *</Label>
              <Input id="mfl_code" value={formData.mfl_code} onChange={(e) => handleChange('mfl_code', e.target.value)} />
              {formErrors.mfl_code && <p className="text-xs text-destructive">{formErrors.mfl_code}</p>}
            </div>
            <div className="space-y-2">
              <Label>KEPH Level *</Label>
              <Select value={formData.level} onValueChange={(v) => handleChange('level', v)}>
                <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {formErrors.level && <p className="text-xs text-destructive">{formErrors.level}</p>}
            </div>
            <div className="space-y-2">
              <Label>Ownership *</Label>
              <Select value={formData.ownership} onValueChange={(v) => handleChange('ownership', v)}>
                <SelectTrigger><SelectValue placeholder="Select ownership" /></SelectTrigger>
                <SelectContent>
                  {OWNERSHIPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {formErrors.ownership && <p className="text-xs text-destructive">{formErrors.ownership}</p>}
            </div>
            <div className="flex items-center gap-3 pt-4">
              <Switch checked={formData.is_active} onCheckedChange={(v) => handleChange('is_active', v)} />
              <Label>{formData.is_active ? 'Active' : 'Inactive'}</Label>
            </div>
          </CardContent>
        </Card>

        {/* Location (read-only display — location changes via admin) */}
        {facility && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {facility.county_name}, {facility.sub_county_name}
              {facility.ward_name && `, ${facility.ward_name}`}
            </CardContent>
          </Card>
        )}

        {/* SHA */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              SHA Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <Switch checked={formData.sha_contracted} onCheckedChange={(v) => handleChange('sha_contracted', v)} />
              <Label>SHA Contracted</Label>
            </div>
            {formData.sha_contracted && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sha_facility_code">SHA Facility Code</Label>
                  <Input
                    id="sha_facility_code"
                    value={formData.sha_facility_code}
                    onChange={(e) => handleChange('sha_facility_code', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sha_contract_expiry">Contract Expiry</Label>
                  <Input
                    id="sha_contract_expiry"
                    type="date"
                    value={formData.sha_contract_expiry}
                    onChange={(e) => handleChange('sha_contract_expiry', e.target.value)}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Modules */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              Module Capabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {MODULE_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Switch
                    checked={formData[key as keyof typeof formData] as boolean}
                    onCheckedChange={(v) => handleChange(key, v)}
                  />
                  <Label className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/admin/facilities/${facilityId}`)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={updateFacility.isPending} className="w-full sm:w-auto">
            {updateFacility.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
