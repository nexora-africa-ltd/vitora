// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Facility vaccine configuration page.
 * Route: /immunizations/configuration. Configure whether global vaccine references
 * are offered locally and which facility billing service and SHA tariff to use.
 */
'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { facilityCustomVaccinesApi, vaccineDefinitionsApi, facilityVaccineConfigsApi } from '@/lib/api/immunizations';
import type { CustomVaccineWorkflow } from '@/lib/types/immunizations';
import { billingApi } from '@/lib/api/billing';

export default function VaccineConfigurationPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customWorkflow, setCustomWorkflow] = useState<CustomVaccineWorkflow>('MANUAL');
  const { data: vaccines = [], isLoading: vaccinesLoading } = useQuery({
    queryKey: ['vaccine-definitions'],
    queryFn: () => vaccineDefinitionsApi.list(),
  });
  const { data: configsData, isLoading: configsLoading } = useQuery({
    queryKey: ['facility-vaccine-configs'],
    queryFn: () => facilityVaccineConfigsApi.list(),
  });
  const { data: servicesData } = useQuery({
    queryKey: ['services', 'vaccine-config'],
    queryFn: () => billingApi.getServices({ page_size: 500 }),
  });
  const { data: customVaccinesData, isLoading: customVaccinesLoading } = useQuery({
    queryKey: ['facility-custom-vaccines'],
    queryFn: () => facilityCustomVaccinesApi.list(),
  });
  const configsByVaccine = useMemo(
    () => new Map((configsData?.results ?? []).map((config) => [config.vaccine, config])),
    [configsData]
  );
  const filteredVaccines = vaccines.filter((vaccine) =>
    `${vaccine.code} ${vaccine.name}`.toLowerCase().includes(search.toLowerCase())
  );
  const saveConfig = useMutation({
    mutationFn: async ({ vaccineId, patch }: { vaccineId: number; patch: Record<string, unknown> }) => {
      const existing = configsByVaccine.get(vaccineId);
      if (existing) return facilityVaccineConfigsApi.update(existing.id, patch);
      return facilityVaccineConfigsApi.create({
        vaccine: vaccineId,
        is_offered: false,
        billing_service: null,
        base_fee: null,
        sha_tariff_code: '',
        ...patch,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility-vaccine-configs'] });
      toast.success('Vaccine configuration saved');
    },
    onError: () => toast.error('Failed to save vaccine configuration'),
  });
  const createCustomVaccine = useMutation({
    mutationFn: () => facilityCustomVaccinesApi.create({
      code: customCode,
      name: customName,
      description: '',
      disease_target: '',
      route: '',
      target_population: 'ALL',
      workflow: customWorkflow,
      is_active: true,
      billing_service: null,
      base_fee: null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility-custom-vaccines'] });
      setCustomName('');
      setCustomCode('');
      toast.success('Custom vaccine added for this facility');
    },
    onError: () => toast.error('Failed to add custom vaccine'),
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Vaccine Configuration"
        helpContent="Choose which global vaccine definitions are offered at this facility and configure local billing and SHA tariff details."
      />
       <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vaccines" className="pl-9" />
          </div>
        </CardContent>
       </Card>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Facility Custom Vaccines</p>
              <p className="text-sm text-muted-foreground">
                Local vaccines are limited to manual, campaign, occupational, travel, and private workflows. They are never added to KEPI schedules.
              </p>
            </div>
            <Badge variant="outline" className="w-fit">Facility only</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input value={customCode} onChange={(event) => setCustomCode(event.target.value)} placeholder="Code" />
            <Input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Vaccine name" />
            <SearchableSelect
              value={customWorkflow}
              onValueChange={(value) => setCustomWorkflow(value as CustomVaccineWorkflow)}
              placeholder="Workflow"
              options={[
                { value: 'MANUAL', label: 'Manual administration' },
                { value: 'CAMPAIGN', label: 'Mass campaign' },
                { value: 'OCCUPATIONAL', label: 'Occupational health' },
                { value: 'TRAVEL', label: 'Travel health' },
                { value: 'PRIVATE', label: 'Private service' },
              ]}
            />
            <Button onClick={() => createCustomVaccine.mutate()} disabled={!customCode || !customName || createCustomVaccine.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Add custom vaccine
            </Button>
          </div>
          {customVaccinesLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <div className="flex flex-wrap gap-2">
              {customVaccinesData?.results.map((vaccine) => (
                <Badge key={vaccine.id} variant={vaccine.is_active ? 'secondary' : 'outline'}>
                  {vaccine.code}: {vaccine.name} ({vaccine.workflow})
                </Badge>
              ))}
              {!customVaccinesData?.results.length && <span className="text-sm text-muted-foreground">No facility custom vaccines configured.</span>}
            </div>
          )}
        </CardContent>
      </Card>
      {vaccinesLoading || configsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredVaccines.map((vaccine) => {
            const config = configsByVaccine.get(vaccine.id);
            return (
              <Card key={vaccine.id}>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{vaccine.name}</p>
                      <p className="font-mono text-sm text-muted-foreground">{vaccine.code}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`offered-${vaccine.id}`}>Offered</Label>
                      <Switch
                        id={`offered-${vaccine.id}`}
                        checked={config?.is_offered === true}
                        disabled={saveConfig.isPending}
                        onCheckedChange={(is_offered) => saveConfig.mutate({ vaccineId: vaccine.id, patch: { is_offered } })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Billing Service</Label>
                      <SearchableSelect
                        value={config?.billing_service?.toString() ?? 'none'}
                        placeholder="No local service"
                        searchPlaceholder="Search local services"
                        options={[
                          { value: 'none', label: 'No local service' },
                          ...(servicesData?.results ?? []).map((service) => ({
                            value: service.id.toString(),
                            label: service.name,
                            sublabel: `${service.code}${service.is_active ? '' : ' (inactive)'}`,
                          })),
                        ]}
                        onValueChange={(value) => saveConfig.mutate({ vaccineId: vaccine.id, patch: { billing_service: value === 'none' ? null : Number(value) } })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`fee-${vaccine.id}`}>Fee Override (KES)</Label>
                      <Input id={`fee-${vaccine.id}`} type="number" defaultValue={config?.base_fee ?? ''} onBlur={(event) => saveConfig.mutate({ vaccineId: vaccine.id, patch: { base_fee: event.target.value || null } })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`sha-${vaccine.id}`}>SHA Tariff Code Override</Label>
                    <Input id={`sha-${vaccine.id}`} defaultValue={config?.sha_tariff_code ?? ''} onBlur={(event) => saveConfig.mutate({ vaccineId: vaccine.id, patch: { sha_tariff_code: event.target.value } })} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {!vaccinesLoading && filteredVaccines.length === 0 && <div className="py-12 text-center text-muted-foreground"><Settings2 className="mx-auto mb-3 h-6 w-6" />No vaccines match this search.</div>}
    </div>
  );
}
