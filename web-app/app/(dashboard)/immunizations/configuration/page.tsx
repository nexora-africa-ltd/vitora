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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { facilityCustomVaccinesApi, vaccineDefinitionsApi, facilityVaccineConfigsApi } from '@/lib/api/immunizations';
import type { CustomVaccineWorkflow } from '@/lib/types/immunizations';
import { billingApi } from '@/lib/api/billing';

export default function VaccineConfigurationPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customWorkflow, setCustomWorkflow] = useState<CustomVaccineWorkflow>('MANUAL');
  const [customDescription, setCustomDescription] = useState('');
  const [customDiseaseTarget, setCustomDiseaseTarget] = useState('');
  const [customRoute, setCustomRoute] = useState('');
  const [customPopulation, setCustomPopulation] = useState('ALL');
  const [customBillingService, setCustomBillingService] = useState('none');
  const [customBaseFee, setCustomBaseFee] = useState('');
  const [customShaTariffCode, setCustomShaTariffCode] = useState('');
  const [customIsActive, setCustomIsActive] = useState(true);
  const [customVaccineDialogOpen, setCustomVaccineDialogOpen] = useState(false);
  const [editingCustomVaccineId, setEditingCustomVaccineId] = useState<number | null>(null);
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
      description: customDescription,
      disease_target: customDiseaseTarget,
      route: customRoute as never,
      target_population: customPopulation as never,
      workflow: customWorkflow,
      is_active: customIsActive,
      billing_service: customBillingService === 'none' ? null : Number(customBillingService),
      base_fee: customBaseFee || null,
      sha_tariff_code: customShaTariffCode,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility-custom-vaccines'] });
      setCustomName('');
      setCustomCode('');
      setCustomDescription(''); setCustomDiseaseTarget(''); setCustomRoute(''); setCustomPopulation('ALL'); setCustomBillingService('none'); setCustomBaseFee(''); setCustomShaTariffCode(''); setCustomIsActive(true);
      setCustomVaccineDialogOpen(false);
      toast.success('Custom vaccine added for this facility');
    },
    onError: () => toast.error('Failed to add custom vaccine'),
  });
  const updateCustomVaccine = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof facilityCustomVaccinesApi.update>[1] }) => facilityCustomVaccinesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['facility-custom-vaccines'] }); setCustomVaccineDialogOpen(false); setEditingCustomVaccineId(null); toast.success('Custom vaccine updated'); },
  });
  const deleteCustomVaccine = useMutation({
    mutationFn: facilityCustomVaccinesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility-custom-vaccines'] });
      toast.success('Custom vaccine deleted');
    },
    onError: () => toast.error('Failed to delete custom vaccine'),
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Vaccine Configuration"
        helpContent="Choose which global vaccine definitions are offered at this facility and configure local billing and SHA tariff details."
        actions={<Button onClick={() => { setEditingCustomVaccineId(null); setCustomCode(''); setCustomName(''); setCustomDescription(''); setCustomDiseaseTarget(''); setCustomRoute(''); setCustomPopulation('ALL'); setCustomWorkflow('MANUAL'); setCustomBillingService('none'); setCustomBaseFee(''); setCustomShaTariffCode(''); setCustomIsActive(true); setCustomVaccineDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Custom Vaccine</Button>}
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
          {customVaccinesLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <div className="flex flex-wrap gap-2">
              {customVaccinesData?.results.map((vaccine) => (
                <button key={vaccine.id} type="button" onClick={() => { setEditingCustomVaccineId(vaccine.id); setCustomCode(vaccine.code); setCustomName(vaccine.name); setCustomDescription(vaccine.description); setCustomDiseaseTarget(vaccine.disease_target); setCustomRoute(vaccine.route); setCustomPopulation(vaccine.target_population); setCustomWorkflow(vaccine.workflow); setCustomBillingService(vaccine.billing_service?.toString() ?? 'none'); setCustomBaseFee(vaccine.base_fee ?? ''); setCustomShaTariffCode(vaccine.sha_tariff_code); setCustomIsActive(vaccine.is_active); setCustomVaccineDialogOpen(true); }}><Badge variant={vaccine.is_active ? 'secondary' : 'outline'} className="cursor-pointer">{vaccine.code}: {vaccine.name} ({vaccine.workflow})</Badge></button>
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
                        onValueChange={(value) => {
                          const service = servicesData?.results.find((item) => item.id.toString() === value);
                          saveConfig.mutate({ vaccineId: vaccine.id, patch: { billing_service: value === 'none' ? null : Number(value), base_fee: service?.unit_price ?? config?.base_fee ?? null, sha_tariff_code: service?.sha_code ?? config?.sha_tariff_code ?? '' } });
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`fee-${vaccine.id}`}>Fee Override (KES)</Label>
                      <Input key={`${vaccine.id}-${config?.base_fee ?? ''}`} id={`fee-${vaccine.id}`} type="number" defaultValue={config?.base_fee ?? ''} onBlur={(event) => saveConfig.mutate({ vaccineId: vaccine.id, patch: { base_fee: event.target.value || null } })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`sha-${vaccine.id}`}>SHA Tariff Code Override</Label>
                      <Input key={`${vaccine.id}-${config?.sha_tariff_code ?? ''}`} id={`sha-${vaccine.id}`} defaultValue={config?.sha_tariff_code ?? ''} onBlur={(event) => saveConfig.mutate({ vaccineId: vaccine.id, patch: { sha_tariff_code: event.target.value } })} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {!vaccinesLoading && filteredVaccines.length === 0 && <div className="py-12 text-center text-muted-foreground"><Settings2 className="mx-auto mb-3 h-6 w-6" />No vaccines match this search.</div>}
      <Dialog open={customVaccineDialogOpen} onOpenChange={setCustomVaccineDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCustomVaccineId ? 'Edit Custom Vaccine' : 'Add Custom Vaccine'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="custom-vaccine-code">Code</Label><Input id="custom-vaccine-code" value={customCode} onChange={(event) => setCustomCode(event.target.value)} placeholder="LOCAL-VAX-001" /></div>
              <div className="space-y-2"><Label htmlFor="custom-vaccine-name">Vaccine Name</Label><Input id="custom-vaccine-name" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Local vaccine" /></div>
            </div>
            <div className="space-y-2">
              <Label>Workflow</Label>
              <SearchableSelect value={customWorkflow} onValueChange={(value) => setCustomWorkflow(value as CustomVaccineWorkflow)} placeholder="Workflow" options={[
                { value: 'MANUAL', label: 'Manual administration' }, { value: 'CAMPAIGN', label: 'Mass campaign' }, { value: 'OCCUPATIONAL', label: 'Occupational health' }, { value: 'TRAVEL', label: 'Travel health' }, { value: 'PRIVATE', label: 'Private service' },
              ]} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="custom-vaccine-description">Description</Label><Input id="custom-vaccine-description" value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="custom-vaccine-disease">Disease Target</Label><Input id="custom-vaccine-disease" value={customDiseaseTarget} onChange={(event) => setCustomDiseaseTarget(event.target.value)} /></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Route</Label><SearchableSelect value={customRoute || 'none'} onValueChange={(value) => setCustomRoute(value === 'none' ? '' : value)} options={[{ value: 'none', label: 'Not specified' }, { value: 'IM', label: 'Intramuscular' }, { value: 'SC', label: 'Subcutaneous' }, { value: 'ID', label: 'Intradermal' }, { value: 'PO', label: 'Oral' }, { value: 'IN', label: 'Intranasal' }]} /></div><div className="space-y-2"><Label>Target Population</Label><SearchableSelect value={customPopulation} onValueChange={setCustomPopulation} options={[{ value: 'ALL', label: 'All ages' }, { value: 'INFANT', label: 'Infant' }, { value: 'CHILD', label: 'Child' }, { value: 'ADOLESCENT', label: 'Adolescent' }, { value: 'ADULT', label: 'Adult' }]} /></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Billing Service</Label><SearchableSelect value={customBillingService} onValueChange={(value) => { setCustomBillingService(value); const service = servicesData?.results.find((item) => item.id.toString() === value); if (service?.unit_price) setCustomBaseFee(service.unit_price); if (service?.sha_code) setCustomShaTariffCode(service.sha_code); }} options={[{ value: 'none', label: 'No local service' }, ...(servicesData?.results ?? []).map((service) => ({ value: service.id.toString(), label: service.name, sublabel: `${service.code}${service.is_active ? '' : ' (inactive)'}` }))]} /></div><div className="space-y-2"><Label htmlFor="custom-vaccine-fee">Fee Override (KES)</Label><Input id="custom-vaccine-fee" type="number" value={customBaseFee} onChange={(event) => setCustomBaseFee(event.target.value)} /></div></div>
            <div className="space-y-2"><Label htmlFor="custom-vaccine-sha">SHA Tariff Code (optional)</Label><Input id="custom-vaccine-sha" value={customShaTariffCode} onChange={(event) => setCustomShaTariffCode(event.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch id="custom-vaccine-active" checked={customIsActive} onCheckedChange={setCustomIsActive} /><Label htmlFor="custom-vaccine-active">Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCustomVaccineDialogOpen(false)}>Cancel</Button><Button onClick={() => { const data = { code: customCode, name: customName, description: customDescription, disease_target: customDiseaseTarget, route: customRoute as never, target_population: customPopulation as never, workflow: customWorkflow, is_active: customIsActive, billing_service: customBillingService === 'none' ? null : Number(customBillingService), base_fee: customBaseFee || null, sha_tariff_code: customShaTariffCode }; if (editingCustomVaccineId) updateCustomVaccine.mutate({ id: editingCustomVaccineId, data }); else createCustomVaccine.mutate(); }} disabled={!customCode || !customName || createCustomVaccine.isPending || updateCustomVaccine.isPending}>{(createCustomVaccine.isPending || updateCustomVaccine.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingCustomVaccineId ? 'Save Changes' : 'Add Vaccine'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
