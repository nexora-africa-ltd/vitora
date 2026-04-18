/**
 * New Facility Page (standalone — with organization selector)
 * Creates a facility with organization selection.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Building2, MapPin, Shield, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { facilitiesApi } from '@/lib/api/facilities';
import { organizationsApi } from '@/lib/api/organizations';
import type { FacilityCreateData, FacilityLevel, FacilityOwnership } from '@/lib/types/facility';

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
  { value: 'PRIVATE', label: 'Private Practice' },
];

export default function NewFacilityPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orgsData } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsApi.list(),
  });
  const organizations = orgsData?.results ?? [];

  const [orgId, setOrgId] = useState<number | undefined>();

  const [formData, setFormData] = useState({
    mfl_code: '',
    name: '',
    level: '' as string,
    ownership: '' as string,
    is_headquarters: false,
    branch_code: '',
    sha_contracted: false,
    sha_facility_code: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [countyId, setCountyId] = useState<number | undefined>();
  const [subCountyId, setSubCountyId] = useState<number | undefined>();
  const [wardId, setWardId] = useState<number | undefined>();

  const { data: counties } = useCounties();
  const { data: subCounties } = useSubCounties(countyId);
  const { data: wards } = useWards(subCountyId);

  const createFacility = useMutation({
    mutationFn: (data: FacilityCreateData) => facilitiesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: ['organization-facilities', orgId] });
        queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      }
      toast({ title: 'Facility created', description: `${formData.name} has been added.` });
      router.push('/admin/facilities');
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
          toast({
            variant: 'destructive',
            title: 'Validation error',
            description: 'Please fix the highlighted fields.',
          });
          return;
        }
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create facility',
      });
    },
  });

  const handleChange = (field: string, value: string | boolean | number | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!orgId) errors.organization = 'Organization is required';
    if (!formData.mfl_code.trim()) errors.mfl_code = 'MFL code is required';
    if (!formData.name.trim()) errors.name = 'Facility name is required';
    if (!formData.level) errors.level = 'KEPH level is required';
    if (!formData.ownership) errors.ownership = 'Ownership type is required';
    if (!countyId) errors.county = 'County is required';
    if (!subCountyId) errors.sub_county = 'Sub-county is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: FacilityCreateData = {
      organization: orgId,
      mfl_code: formData.mfl_code,
      name: formData.name,
      level: formData.level as FacilityLevel,
      ownership: formData.ownership as FacilityOwnership,
      is_headquarters: formData.is_headquarters,
      branch_code: formData.branch_code || undefined,
      county: countyId!,
      sub_county: subCountyId!,
      ward: wardId ?? null,
      sha_contracted: formData.sha_contracted,
      sha_facility_code: formData.sha_facility_code || undefined,
    };
    createFacility.mutate(payload);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Facility"
        helpContent="Add a new healthcare facility. Select an organization, provide MFL code and KEPH level. Module capabilities will default based on the level selected."
      />

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Organization */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-md">
              <Label>Organization *</Label>
              <Select
                value={orgId?.toString() ?? ''}
                onValueChange={(v) => {
                  setOrgId(parseInt(v));
                  if (formErrors.organization) {
                    setFormErrors((prev) => {
                      const next = { ...prev };
                      delete next.organization;
                      return next;
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((o) => (
                    <SelectItem key={o.id} value={o.id.toString()}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.organization && (
                <p className="text-xs text-destructive">{formErrors.organization}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Facility Details */}
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
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g. Nairobi Hospital – Westlands"
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mfl_code">MFL Code *</Label>
              <Input
                id="mfl_code"
                value={formData.mfl_code}
                onChange={(e) => handleChange('mfl_code', e.target.value)}
                placeholder="e.g. 12345"
              />
              {formErrors.mfl_code && (
                <p className="text-xs text-destructive">{formErrors.mfl_code}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>KEPH Level *</Label>
              <Select value={formData.level} onValueChange={(v) => handleChange('level', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.level && <p className="text-xs text-destructive">{formErrors.level}</p>}
            </div>
            <div className="space-y-2">
              <Label>Ownership *</Label>
              <Select
                value={formData.ownership}
                onValueChange={(v) => handleChange('ownership', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ownership" />
                </SelectTrigger>
                <SelectContent>
                  {OWNERSHIPS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.ownership && (
                <p className="text-xs text-destructive">{formErrors.ownership}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch_code">Branch Code</Label>
              <Input
                id="branch_code"
                value={formData.branch_code}
                onChange={(e) => handleChange('branch_code', e.target.value)}
                placeholder="e.g. BR01"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={formData.is_headquarters}
                onCheckedChange={(v) => handleChange('is_headquarters', v)}
              />
              <Label>Headquarters</Label>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>County *</Label>
              <Select
                value={countyId?.toString() ?? ''}
                onValueChange={(v) => {
                  const id = parseInt(v);
                  setCountyId(id);
                  setSubCountyId(undefined);
                  setWardId(undefined);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select county" />
                </SelectTrigger>
                <SelectContent>
                  {(counties ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.county && (
                <p className="text-xs text-destructive">{formErrors.county}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Sub-County *</Label>
              <Select
                value={subCountyId?.toString() ?? ''}
                onValueChange={(v) => {
                  setSubCountyId(parseInt(v));
                  setWardId(undefined);
                }}
                disabled={!countyId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={countyId ? 'Select sub-county' : 'Select county first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(subCounties ?? []).map((sc) => (
                    <SelectItem key={sc.id} value={sc.id.toString()}>
                      {sc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.sub_county && (
                <p className="text-xs text-destructive">{formErrors.sub_county}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ward</Label>
              <Select
                value={wardId?.toString() ?? ''}
                onValueChange={(v) => setWardId(parseInt(v))}
                disabled={!subCountyId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={subCountyId ? 'Select ward' : 'Select sub-county first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(wards ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

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
              <Switch
                checked={formData.sha_contracted}
                onCheckedChange={(v) => handleChange('sha_contracted', v)}
              />
              <Label>SHA Contracted</Label>
            </div>
            {formData.sha_contracted && (
              <div className="space-y-2">
                <Label htmlFor="sha_facility_code">SHA Facility Code</Label>
                <Input
                  id="sha_facility_code"
                  value={formData.sha_facility_code}
                  onChange={(e) => handleChange('sha_facility_code', e.target.value)}
                  placeholder="SHA code"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/facilities')}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createFacility.isPending} className="w-full sm:w-auto">
            {createFacility.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Create Facility
          </Button>
        </div>
      </form>
    </div>
  );
}
