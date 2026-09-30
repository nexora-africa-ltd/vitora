// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Nexora-only console for configuring DHA/KHIS SDMX contract metadata and mappings. */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCode2, Network, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { sdmxContractsApi } from '@/lib/api/sdmx-contracts';
import type {
  FacilitySDMXConfigurationCreateData,
  SDMXContractCreateData,
  SDMXContractListItem,
} from '@/lib/types/sdmx-contract';

const initialForm: SDMXContractCreateData = {
  partner: 'KHIS',
  environment: 'SANDBOX',
  agency_id: '',
  dataflow_id: '',
  dsd_id: '',
  version: '1.0',
  endpoint_url: '',
  receiver_id: 'KHIS',
  secret_reference: '',
  is_active: false,
};

export default function SDMXContractsPage() {
  const { isSuperuser } = usePermissions();
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isFacilityOpen, setIsFacilityOpen] = useState(false);
  const [form, setForm] = useState<SDMXContractCreateData>(initialForm);
  const [facilityForm, setFacilityForm] = useState<FacilitySDMXConfigurationCreateData>({
    facility: 0,
    contract: 0,
    is_enabled: true,
    facility_code: '',
    report_types: ['QuarterlyReport'],
  });

  const contractsQuery = useQuery({
    queryKey: ['sdmx-contracts'],
    queryFn: () => sdmxContractsApi.list(),
    enabled: isSuperuser,
  });

  const createContract = useMutation({
    mutationFn: sdmxContractsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sdmx-contracts'] });
      setForm(initialForm);
      setIsCreateOpen(false);
    },
  });

  const facilityConfigurationsQuery = useQuery({
    queryKey: ['sdmx-facility-configurations'],
    queryFn: () => sdmxContractsApi.listFacilityConfigurations(),
    enabled: isSuperuser,
  });

  const enableFacility = useMutation({
    mutationFn: sdmxContractsApi.enableFacility,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sdmx-facility-configurations'] });
      setIsFacilityOpen(false);
    },
  });

  const contracts = contractsQuery.data?.results ?? [];
  const activeContracts = contracts.filter((contract) => contract.is_active).length;
  const mappedValues = contracts.reduce((total, contract) => total + contract.mapping_count, 0);
  const enabledFacilities = facilityConfigurationsQuery.data?.results.filter((config) => config.is_enabled).length ?? 0;

  if (!isSuperuser) {
    return (
      <div className="space-y-4">
        <PageHeader title="Access Denied" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Only Nexora superusers can configure national SDMX contracts.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="SDMX Contracts"
          helpContent="Configure versioned DHA/KHIS SDMX contract metadata. Credentials remain in secret storage and are referenced here by name only. Automated delivery stays disabled until a contract is validated and enabled per facility."
          actions={
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  New Contract
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>New SDMX Contract</DialogTitle>
                </DialogHeader>
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createContract.mutate(form);
                  }}
                >
                  <ContractSelect label="Partner" value={form.partner} options={[['DHA', 'DHA'], ['KHIS', 'KHIS'], ['OTHER', 'Other']]} onChange={(partner) => setForm({ ...form, partner: partner as SDMXContractCreateData['partner'] })} />
                  <ContractSelect label="Environment" value={form.environment} options={[['SANDBOX', 'Sandbox'], ['PRODUCTION', 'Production']]} onChange={(environment) => setForm({ ...form, environment: environment as SDMXContractCreateData['environment'] })} />
                  <ContractField label="Agency ID" required value={form.agency_id} onChange={(agency_id) => setForm({ ...form, agency_id })} />
                  <ContractField label="Dataflow ID" required value={form.dataflow_id} onChange={(dataflow_id) => setForm({ ...form, dataflow_id })} />
                  <ContractField label="DSD ID" required value={form.dsd_id} onChange={(dsd_id) => setForm({ ...form, dsd_id })} />
                  <ContractField label="Version" required value={form.version} onChange={(version) => setForm({ ...form, version })} />
                  <ContractField label="Receiver ID" required value={form.receiver_id} onChange={(receiver_id) => setForm({ ...form, receiver_id })} />
                  <ContractField label="Secret Reference" value={form.secret_reference ?? ''} onChange={(secret_reference) => setForm({ ...form, secret_reference })} />
                  <div className="sm:col-span-2">
                    <ContractField label="Endpoint URL" required type="url" value={form.endpoint_url} onChange={(endpoint_url) => setForm({ ...form, endpoint_url })} />
                  </div>
                  {createContract.error ? <p className="sm:col-span-2 text-sm text-destructive">Unable to save the contract. Check the identifiers and endpoint URL.</p> : null}
                  <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createContract.isPending}>{createContract.isPending ? 'Saving...' : 'Save Draft Contract'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <AdminStatCard title="Contracts" value={contractsQuery.isLoading ? '...' : contracts.length} icon={<Network className="h-4 w-4" />} />
          <AdminStatCard title="Active" value={contractsQuery.isLoading ? '...' : activeContracts} icon={<FileCode2 className="h-4 w-4" />} />
          <AdminStatCard title="Mapped Values" value={contractsQuery.isLoading ? '...' : mappedValues} icon={<FileCode2 className="h-4 w-4" />} />
          <AdminStatCard title="Enabled Facilities" value={facilityConfigurationsQuery.isLoading ? '...' : enabledFacilities} icon={<Network className="h-4 w-4" />} />
        </div>

        <Dialog open={isFacilityOpen} onOpenChange={setIsFacilityOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={contracts.length === 0}>
              Enable Facility
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Enable SDMX for a Facility</DialogTitle></DialogHeader>
            <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); enableFacility.mutate(facilityForm); }}>
              <ContractField label="Facility ID" required type="number" value={facilityForm.facility ? String(facilityForm.facility) : ''} onChange={(value) => setFacilityForm({ ...facilityForm, facility: Number(value) })} />
              <div className="space-y-2"><Label htmlFor="facility-contract">Contract</Label><select id="facility-contract" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={facilityForm.contract} onChange={(event) => setFacilityForm({ ...facilityForm, contract: Number(event.target.value) })} required><option value={0}>Select contract</option>{contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.display_name}</option>)}</select></div>
              <ContractField label="MFL / Facility Code" required value={facilityForm.facility_code} onChange={(facility_code) => setFacilityForm({ ...facilityForm, facility_code })} />
              <div className="space-y-2"><Label htmlFor="report-types">Report Types</Label><Input id="report-types" value={facilityForm.report_types.join(', ')} onChange={(event) => setFacilityForm({ ...facilityForm, report_types: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /><p className="text-xs text-muted-foreground">For example: QuarterlyReport, IDSRWeeklyReport</p></div>
              {enableFacility.error ? <p className="text-sm text-destructive">Unable to enable this facility. Confirm the facility ID and select an unused contract.</p> : null}
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsFacilityOpen(false)}>Cancel</Button><Button type="submit" disabled={enableFacility.isPending}>{enableFacility.isPending ? 'Enabling...' : 'Enable Facility'}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        {contractsQuery.isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div>
        ) : (
          <ResponsiveTable
            data={contracts}
            keyExtractor={(contract) => contract.id}
            defaultSortColumn="updated_at"
            defaultSortDirection="desc"
            columns={[
              { key: 'display_name', header: 'Contract', sortable: true, cell: (contract) => <div><p className="font-medium">{contract.display_name}</p><p className="text-xs text-muted-foreground">{contract.agency_id} / {contract.dsd_id}</p></div> },
              { key: 'environment', header: 'Environment', sortable: true, cell: (contract) => <Badge variant={contract.environment === 'PRODUCTION' ? 'default' : 'secondary'}>{contract.environment}</Badge> },
              { key: 'mapping_count', header: 'Mappings', sortable: true, sortType: 'number', cell: (contract) => contract.mapping_count, hideOnMobile: true },
              { key: 'is_active', header: 'Status', sortable: true, cell: (contract) => <Badge variant={contract.is_active ? 'default' : 'outline'}>{contract.is_active ? 'Active' : 'Draft'}</Badge> },
              { key: 'updated_at', header: 'Updated', sortable: true, sortType: 'date', cell: (contract) => new Date(contract.updated_at).toLocaleDateString(), hideOnMobile: true },
            ]}
            mobileCard={(contract: SDMXContractListItem) => <div className="flex items-center justify-between p-3"><div><p className="font-medium">{contract.display_name}</p><p className="text-xs text-muted-foreground">{contract.mapping_count} mappings</p></div><Badge variant={contract.is_active ? 'default' : 'outline'}>{contract.is_active ? 'Active' : 'Draft'}</Badge></div>}
          />
        )}
      </div>
    </PullToRefresh>
  );
}

function ContractField({ label, value, onChange, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  const id = label.toLowerCase().replaceAll(' ', '-');
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function ContractSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  const id = label.toLowerCase().replaceAll(' ', '-');
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><select id={id} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></div>;
}
