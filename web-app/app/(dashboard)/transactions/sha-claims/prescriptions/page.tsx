// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * SHA ILM ePrescriptions workspace.
 * Access path: /transactions/sha-claims/prescriptions.
 */
'use client';

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  useIlmCreatePrescription,
  useIlmDispensePrescription,
  useIlmPreviewPrescription,
  useLocalDhaPrescriptions,
} from '@/lib/hooks/use-sha';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { formatJsonInput, safeParseJsonArray } from '@/lib/utils/json-input';
import type { SHADhaPrescription } from '@/lib/schemas/sha.schema';

const SAMPLE_ITEMS = `[
  {
    "generic_concept_code": "J01CA04",
    "dose_quantity": 1,
    "dose_unit": "tablet",
    "frequency": 3,
    "duration": 5,
    "duration_unit": "day",
    "period_unit": "day",
    "start_date": "2026-01-01"
  }
]`;

export default function SHAPrescriptionsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const { toast } = useToast();

  const [tab, setTab] = useState<'list' | 'preview' | 'create' | 'dispense'>('list');

  const [consentToken, setConsentToken] = useState('');
  const [patientPk, setPatientPk] = useState('');

  const [createInterventionCode, setCreateInterventionCode] = useState('');
  const [createIdentificationNumber, setCreateIdentificationNumber] = useState('');
  const [createItemsText, setCreateItemsText] = useState(SAMPLE_ITEMS);

  const [dispenseInterventionCode, setDispenseInterventionCode] = useState('');
  const [dispensePrescriptionPk, setDispensePrescriptionPk] = useState('');
  const [actualProductCode, setActualProductCode] = useState('');
  const [medicationPrice, setMedicationPrice] = useState('0');
  const [totalQuantity, setTotalQuantity] = useState('1');

  const { data, isLoading, refetch, isRefetching } = useLocalDhaPrescriptions();
  const previewMutation = useIlmPreviewPrescription();
  const createMutation = useIlmCreatePrescription();
  const dispenseMutation = useIlmDispensePrescription();

  const rows = useMemo(() => data?.results ?? [], [data]);
  const createItemsParse = useMemo(() => safeParseJsonArray(createItemsText), [createItemsText]);

  const handlePreview = async () => {
    if (!consentToken.trim()) {
      toast({ title: 'Consent token is required', variant: 'destructive' });
      return;
    }
    try {
      await previewMutation.mutateAsync({
        consent_token: consentToken.trim(),
        patient_pk: patientPk ? Number(patientPk) : undefined,
      });
      toast({ title: 'Preview fetched successfully' });
    } catch {
      toast({ title: 'Unable to fetch preview', variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!consentToken.trim() || !createInterventionCode.trim() || !createIdentificationNumber.trim()) {
      toast({ title: 'Consent token, intervention code, and identification are required', variant: 'destructive' });
      return;
    }

    if (createItemsParse.error || !createItemsParse.value) {
      toast({ title: 'Items must be valid JSON array', variant: 'destructive' });
      return;
    }

    try {
      await createMutation.mutateAsync({
        consent_token: consentToken.trim(),
        intervention_code: createInterventionCode.trim(),
        identification_number: createIdentificationNumber.trim(),
        items: createItemsParse.value,
        patient_pk: patientPk ? Number(patientPk) : undefined,
      });
      toast({ title: 'Prescription sent to ILM' });
      refetch();
    } catch {
      toast({ title: 'Unable to create ILM prescription', variant: 'destructive' });
    }
  };

  const handleDispense = async () => {
    if (!consentToken.trim() || !dispenseInterventionCode.trim() || !actualProductCode.trim()) {
      toast({ title: 'Consent token, intervention code, and product code are required', variant: 'destructive' });
      return;
    }
    try {
      await dispenseMutation.mutateAsync({
        consent_token: consentToken.trim(),
        intervention_code: dispenseInterventionCode.trim(),
        prescription_pk: dispensePrescriptionPk ? Number(dispensePrescriptionPk) : undefined,
        actual_products: [
          {
            actual_product_code: actualProductCode.trim(),
            medication_price: Number(medicationPrice) || 0,
            total_quantity: Number(totalQuantity) || 1,
          },
        ],
      });
      toast({ title: 'Dispense submitted' });
      refetch();
    } catch {
      toast({ title: 'Unable to submit dispense event', variant: 'destructive' });
    }
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing || isRefetching}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="SHA ePrescriptions"
          helpContent="Run ILM prescription preview, creation, and dispense actions, and monitor local DHA prescription records."
          actions={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />

        <Card className="p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="consent-token">Consent token</Label>
              <Input id="consent-token" value={consentToken} onChange={(event) => setConsentToken(event.target.value)} placeholder="Paste ILM consent token" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-pk">Patient PK (optional)</Label>
              <Input id="patient-pk" value={patientPk} onChange={(event) => setPatientPk(event.target.value)} placeholder="Patient id" />
            </div>
          </div>
        </Card>

        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="list">Local Records</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="dispense">Dispense</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <ResponsiveTable<SHADhaPrescription>
              data={rows}
              keyExtractor={(item) => item.id}
              isLoading={isLoading}
              emptyMessage="No DHA prescriptions found."
              defaultSortColumn="created_at"
              defaultSortDirection="desc"
              columns={[
                { key: 'id', header: 'ID', sortable: true, cell: (item) => `#${item.id}` },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (item) => (
                    <Badge variant={item.status === 'failed' ? 'destructive' : 'outline'}>
                      {item.status}
                    </Badge>
                  ),
                },
                {
                  key: 'intervention_code',
                  header: 'Intervention',
                  sortable: true,
                  cell: (item) => item.intervention_code || 'N/A',
                },
                {
                  key: 'identification_number',
                  header: 'Practitioner',
                  cell: (item) => item.identification_number || 'N/A',
                },
                {
                  key: 'dha_external_id',
                  header: 'DHA ID',
                  cell: (item) => item.dha_external_id || 'N/A',
                },
                {
                  key: 'created_at',
                  header: 'Created',
                  sortable: true,
                  sortType: 'date',
                  cell: (item) => (item.created_at ? formatDateTime(item.created_at) : 'N/A'),
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <Card className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Fetch ILM prescription preview context for the current consent token.
              </p>
              <Button onClick={handlePreview} disabled={previewMutation.isPending}>
                {previewMutation.isPending ? 'Fetching preview...' : 'Fetch preview'}
              </Button>
              {previewMutation.data ? (
                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(previewMutation.data.data, null, 2)}
                </pre>
              ) : null}
            </Card>
          </TabsContent>

          <TabsContent value="create" className="mt-4">
            <Card className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-intervention">Intervention code</Label>
                  <Input id="create-intervention" value={createInterventionCode} onChange={(event) => setCreateInterventionCode(event.target.value)} placeholder="SHA-XX-XXX" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-id-number">Practitioner ID</Label>
                  <Input id="create-id-number" value={createIdentificationNumber} onChange={(event) => setCreateIdentificationNumber(event.target.value)} placeholder="Registration number" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-items">Prescription items (JSON)</Label>
                <Textarea id="create-items" value={createItemsText} onChange={(event) => setCreateItemsText(event.target.value)} className="min-h-40 font-mono text-xs" />
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={createItemsParse.error ? 'text-destructive' : 'text-muted-foreground'}>
                    {createItemsParse.error || 'Valid JSON array of item objects'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => {
                      const formatted = formatJsonInput(createItemsText);
                      if (formatted.error || !formatted.value) {
                        toast({ title: formatted.error || 'Cannot format JSON', variant: 'destructive' });
                        return;
                      }
                      setCreateItemsText(formatted.value);
                    }}
                  >
                    Format JSON
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || !!createItemsParse.error}
              >
                {createMutation.isPending ? 'Submitting...' : 'Create ILM prescription'}
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="dispense" className="mt-4">
            <Card className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dispense-intervention">Intervention code</Label>
                  <Input id="dispense-intervention" value={dispenseInterventionCode} onChange={(event) => setDispenseInterventionCode(event.target.value)} placeholder="SHA-XX-XXX" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dispense-prescription-pk">Prescription PK (optional)</Label>
                  <Input id="dispense-prescription-pk" value={dispensePrescriptionPk} onChange={(event) => setDispensePrescriptionPk(event.target.value)} placeholder="Local prescription id" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="actual-product-code">Actual product code</Label>
                  <Input id="actual-product-code" value={actualProductCode} onChange={(event) => setActualProductCode(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medication-price">Medication price</Label>
                  <Input id="medication-price" value={medicationPrice} onChange={(event) => setMedicationPrice(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total-quantity">Quantity</Label>
                  <Input id="total-quantity" value={totalQuantity} onChange={(event) => setTotalQuantity(event.target.value)} />
                </div>
              </div>
              <Button onClick={handleDispense} disabled={dispenseMutation.isPending}>
                {dispenseMutation.isPending ? 'Submitting...' : 'Submit dispense'}
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}
