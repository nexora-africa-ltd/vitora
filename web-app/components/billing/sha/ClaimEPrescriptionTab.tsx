// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Claim ePrescription tab for SHA claim workflow detail pages.
 * Use: render inside the SHA claim detail tabs with a loaded `claim` object.
 * Inputs: `claim` (id, patient/encounter refs, interventions, clinician identifiers).
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { shaApi } from '@/lib/api/sha';
import { pharmacyApi } from '@/lib/api/pharmacy';
import {
  useIlmCreatePrescription,
  useIlmDispensePrescription,
  useIlmPreviewPrescription,
  useLocalDhaPrescriptions,
} from '@/lib/hooks/use-sha';
import { useToast } from '@/lib/hooks/use-toast';
import type { SHADhaPrescription } from '@/lib/schemas/sha.schema';
import type { Claim } from '@/lib/types/sha';
import type { Prescription } from '@/lib/types/pharmacy';
import { formatDateTime } from '@/lib/utils/format';

interface ClaimEPrescriptionTabProps {
  claim: Claim;
}

interface PrescriptionItemRow {
  id: string;
  generic_concept_code: string;
  dose_quantity: string;
  dose_unit: string;
  frequency: string;
  duration: string;
  duration_unit: string;
  period_unit: string;
  start_date: string;
  end_date: string;
  additional_instruction: string;
  patient_instruction: string;
  needs_refill: boolean;
  refill_count: string;
}

const createRowId = () => Math.random().toString(36).slice(2, 10);

function createDefaultPrescriptionItemRow(): PrescriptionItemRow {
  return {
    id: createRowId(),
    generic_concept_code: '',
    dose_quantity: '1',
    dose_unit: 'tablet',
    frequency: '3',
    duration: '5',
    duration_unit: 'day',
    period_unit: 'day',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    additional_instruction: '',
    patient_instruction: '',
    needs_refill: false,
    refill_count: '0',
  };
}

function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolvePractitionerIdentifier(clinician: Claim['encounter_clinician']): string {
  if (!clinician) return '';
  const dynamic = clinician as Record<string, unknown>;
  const candidates = [
    dynamic.hwr_id,
    dynamic.hwr_number,
    dynamic.identification_number,
    dynamic.license_number,
    dynamic.national_id,
  ];
  for (const candidate of candidates) {
    const value = toSafeString(candidate).trim();
    if (value) return value;
  }
  return '';
}

function extractGenericConceptCodeOptions(
  prescriptions: Array<{ items?: unknown; intervention_code?: string; id: number }>
) {
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string; sublabel: string }> = [];

  prescriptions.forEach((prescription) => {
    const items = Array.isArray(prescription.items) ? prescription.items : [];
    items.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const code = toSafeString((item as { generic_concept_code?: unknown }).generic_concept_code).trim();
      if (!code) return;
      if (seen.has(code)) return;
      seen.add(code);
      options.push({
        value: code,
        label: code,
        sublabel: `From Rx #${prescription.id}${prescription.intervention_code ? ` • ${prescription.intervention_code}` : ''}`,
      });
    });
  });

  return options;
}

function parsePositiveInteger(value: string | number | null | undefined, fallback: string): string {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : fallback;
}

function pharmacyPrescriptionToItems(prescription: Prescription): PrescriptionItemRow[] {
  if (prescription.items.length === 0) return [createDefaultPrescriptionItemRow()];

  return prescription.items.map((item) => ({
    id: createRowId(),
    generic_concept_code: '',
    dose_quantity: parsePositiveInteger(item.remaining_quantity || item.quantity_prescribed, '1'),
    dose_unit: 'unit',
    frequency: parsePositiveInteger(item.frequency, '1'),
    duration: parsePositiveInteger(item.duration, '1'),
    duration_unit: 'day',
    period_unit: 'day',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    additional_instruction: item.instructions ?? '',
    patient_instruction: item.instructions ?? '',
    needs_refill: false,
    refill_count: '0',
  }));
}

export function ClaimEPrescriptionTab({ claim }: ClaimEPrescriptionTabProps) {
  const { toast } = useToast();

  const [tab, setTab] = useState<'list' | 'preview' | 'create' | 'dispense'>('create');
  const [consentToken, setConsentToken] = useState('');
  const [loadingConsentToken, setLoadingConsentToken] = useState(false);
  const [consentTokenError, setConsentTokenError] = useState('');

  const [selectedSourcePrescriptionId, setSelectedSourcePrescriptionId] = useState('');

  const activeInterventionOptions = useMemo(
    () =>
      (claim.claim_interventions ?? [])
        .filter((row) => row.status === 'active' && row.intervention_code)
        .map((row) => ({
          value: row.intervention_code,
          label: row.intervention_name || row.intervention_code,
          sublabel: row.intervention_code,
        })),
    [claim.claim_interventions]
  );

  const [createInterventionCode, setCreateInterventionCode] = useState(() => {
    const active = claim.claim_interventions?.find((row) => row.status === 'active');
    return active?.intervention_code ?? '';
  });
  const [createIdentificationNumber, setCreateIdentificationNumber] = useState(
    resolvePractitionerIdentifier(claim.encounter_clinician)
  );
  const [createItemsRows, setCreateItemsRows] = useState<PrescriptionItemRow[]>([
    createDefaultPrescriptionItemRow(),
  ]);

  const [dispenseInterventionCode, setDispenseInterventionCode] = useState(() => {
    const active = claim.claim_interventions?.find((row) => row.status === 'active');
    return active?.intervention_code ?? '';
  });
  const [dispensePrescriptionPk, setDispensePrescriptionPk] = useState('');
  const [actualProductCode, setActualProductCode] = useState('');
  const [medicationPrice, setMedicationPrice] = useState('0');
  const [totalQuantity, setTotalQuantity] = useState('1');

  const claimPatientPk =
    typeof claim.patient === 'number'
      ? claim.patient
      : typeof claim.patient_id === 'number'
        ? claim.patient_id
        : undefined;
  const claimEncounterPk =
    typeof claim.encounter === 'number'
      ? claim.encounter
      : typeof claim.encounter_id === 'number'
        ? claim.encounter_id
        : undefined;
  const claimShaMemberPk = typeof claim.sha_member === 'number' ? claim.sha_member : undefined;

  useEffect(() => {
    let isCancelled = false;

    if (!claimShaMemberPk) {
      setConsentToken('');
      setConsentTokenError('SHA member is missing on this claim, so consent token lookup cannot run.');
      return;
    }

    setLoadingConsentToken(true);
    setConsentTokenError('');

    void shaApi
      .getLatestConsent(claimShaMemberPk, {
        encounterId: claimEncounterPk,
        claimPk: claim.id,
      })
      .then((latest) => {
        if (isCancelled) return;
        setConsentToken(latest.consent_token || '');
      })
      .catch(() => {
        if (isCancelled) return;
        setConsentToken('');
        setConsentTokenError(
          'No active consent token was found for this claim. Complete consent/start-visit in Workflow tab first.'
        );
      })
      .finally(() => {
        if (isCancelled) return;
        setLoadingConsentToken(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [claim.id, claimEncounterPk, claimShaMemberPk]);

  const { data, isLoading, refetch } = useLocalDhaPrescriptions(
    {
      claim_pk: claim.id,
      ...(claimEncounterPk !== undefined ? { encounter_pk: claimEncounterPk } : {}),
      ...(claimPatientPk !== undefined ? { patient_pk: claimPatientPk } : {}),
      page_size: 500,
    },
    { enabled: true }
  );
  const previewMutation = useIlmPreviewPrescription();
  const createMutation = useIlmCreatePrescription();
  const dispenseMutation = useIlmDispensePrescription();
  const {
    data: pharmacyPrescriptionsData,
    isLoading: pharmacyPrescriptionsLoading,
  } = useQuery({
    queryKey: ['sha-claim-pharmacy-prescriptions', claimPatientPk],
    queryFn: () => pharmacyApi.listPrescriptions({ patient: claimPatientPk, page_size: 500 }),
    enabled: claimPatientPk !== undefined,
  });

  const allLocalPrescriptionRows = useMemo(() => data?.results ?? [], [data?.results]);

  const contextMatchedRows = useMemo(
    () =>
      allLocalPrescriptionRows.filter((row) => {
        const rowClaimId = toNumberOrNull(row.claim);
        const rowEncounterId = toNumberOrNull(row.encounter);
        const rowPatientId = toNumberOrNull(row.patient);
      const matchesClaim = rowClaimId !== null && rowClaimId === claim.id;
      const matchesEncounter =
        claimEncounterPk !== undefined && rowEncounterId !== null && rowEncounterId === claimEncounterPk;
        const matchesPatient =
          claimPatientPk !== undefined && rowPatientId !== null && rowPatientId === claimPatientPk;
        return matchesClaim || matchesEncounter || matchesPatient;
      }),
    [allLocalPrescriptionRows, claim.id, claimEncounterPk, claimPatientPk]
  );

  const rows = contextMatchedRows.length > 0 ? contextMatchedRows : allLocalPrescriptionRows;

  const undispensedPharmacyPrescriptions = useMemo(
    () =>
      (pharmacyPrescriptionsData?.results ?? []).filter((prescription) => {
        const status = String(prescription.effective_status || prescription.status).toUpperCase();
        return status === 'PENDING' || status === 'PARTIAL';
      }),
    [pharmacyPrescriptionsData?.results]
  );

  const undispensedPrescriptionOptions = useMemo(
    () =>
      undispensedPharmacyPrescriptions.map((prescription) => ({
          value: String(prescription.id),
          label: prescription.prescription_number || `Prescription #${prescription.id}`,
          sublabel: `Status: ${prescription.effective_status || prescription.status} • Encounter ${prescription.encounter ?? 'N/A'}`,
        })),
    [undispensedPharmacyPrescriptions]
  );

  const genericConceptCodeOptions = useMemo(() => extractGenericConceptCodeOptions(rows), [rows]);

  const invalidItemRow = useMemo(
    () =>
      createItemsRows.find(
        (row) =>
          !row.generic_concept_code.trim() ||
          !row.dose_unit.trim() ||
          !row.duration_unit.trim() ||
          !row.period_unit.trim() ||
          !row.start_date.trim()
      ),
    [createItemsRows]
  );

  const consentAvailable = !!consentToken.trim() && !loadingConsentToken;

  const createPractitionerHint = useMemo(() => {
    if (!claim.encounter_clinician) return 'No encounter clinician is linked to this claim.';
    const clinician = claim.encounter_clinician as Record<string, unknown>;
    const hwrId = toSafeString(clinician.hwr_id || clinician.hwr_number).trim();
    const license = toSafeString(clinician.license_number).trim();
    const nationalId = toSafeString(clinician.national_id).trim();
    if (hwrId) return `Using encounter clinician HWR ID: ${hwrId}`;
    if (license) return `Using encounter clinician license number: ${license}`;
    if (nationalId) return `Using encounter clinician national ID: ${nationalId}`;
    return 'Encounter clinician has no HWR ID/license/national ID on record.';
  }, [claim.encounter_clinician]);

  const handleItemRowChange = (
    rowId: string,
    field: keyof Omit<PrescriptionItemRow, 'id'>,
    value: string | boolean
  ) => {
    setCreateItemsRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const handleAddItemRow = () => {
    setCreateItemsRows((currentRows) => [...currentRows, createDefaultPrescriptionItemRow()]);
  };

  const handleRemoveItemRow = (rowId: string) => {
    setCreateItemsRows((currentRows) =>
      currentRows.length === 1 ? currentRows : currentRows.filter((row) => row.id !== rowId)
    );
  };

  const handleSelectSourcePrescription = (value: string) => {
    setSelectedSourcePrescriptionId(value);
    const source = undispensedPharmacyPrescriptions.find((prescription) => String(prescription.id) === value);
    if (!source) return;

    setCreateIdentificationNumber(resolvePractitionerIdentifier(claim.encounter_clinician));
    setCreateItemsRows(pharmacyPrescriptionToItems(source));
    toast({ title: `Loaded ${source.prescription_number || `prescription #${source.id}`} into the builder` });
  };

  const handlePreview = async () => {
    if (!consentAvailable) {
      toast({
        title: 'Consent token is not ready',
        description: 'Complete consent/start-visit in Workflow tab for this claim first.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await previewMutation.mutateAsync({
        consent_token: consentToken,
        patient_pk: claimPatientPk,
      });
      toast({ title: 'Preview fetched successfully' });
    } catch {
      toast({ title: 'Unable to fetch preview', variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!consentAvailable || !createInterventionCode.trim() || !createIdentificationNumber.trim()) {
      toast({
        title: 'Consent token, intervention code, and practitioner ID are required',
        variant: 'destructive',
      });
      return;
    }

    if (invalidItemRow) {
      toast({
        title: 'Complete all required fields for each prescription item',
        description: 'Each item needs concept code, dose unit, duration unit, period unit, and start date.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createMutation.mutateAsync({
        consent_token: consentToken,
        intervention_code: createInterventionCode.trim(),
        identification_number: createIdentificationNumber.trim(),
        items: createItemsRows.map((row) => ({
          generic_concept_code: row.generic_concept_code.trim(),
          dose_quantity: Number(row.dose_quantity) || 0,
          dose_unit: row.dose_unit.trim(),
          frequency: Number(row.frequency) || 0,
          duration: Number(row.duration) || 0,
          duration_unit: row.duration_unit.trim(),
          period_unit: row.period_unit.trim(),
          start_date: row.start_date.trim(),
          ...(row.end_date.trim() ? { end_date: row.end_date.trim() } : {}),
          ...(row.additional_instruction.trim()
            ? { additional_instruction: row.additional_instruction.trim() }
            : {}),
          ...(row.patient_instruction.trim()
            ? { patient_instruction: row.patient_instruction.trim() }
            : {}),
          ...(row.needs_refill ? { needs_refill: true } : {}),
          ...(row.needs_refill ? { refill_count: Number(row.refill_count) || 0 } : {}),
        })),
        patient_pk: claimPatientPk,
        encounter_pk: claimEncounterPk,
      });
      toast({ title: 'Prescription sent to ILM' });
      refetch();
    } catch {
      toast({ title: 'Unable to create ILM prescription', variant: 'destructive' });
    }
  };

  const handleDispense = async () => {
    if (!consentAvailable || !dispenseInterventionCode.trim() || !actualProductCode.trim()) {
      toast({
        title: 'Consent token, intervention code, and product code are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      await dispenseMutation.mutateAsync({
        consent_token: consentToken,
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
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Claim-scoped workflow</AlertTitle>
        <AlertDescription>
          ePrescription actions here are tied to this claim and should be run after consent/start-visit
          is completed in the Workflow tab.
        </AlertDescription>
      </Alert>

      {consentTokenError ? (
        <Alert variant="destructive">
          <AlertTitle>Consent token unavailable</AlertTitle>
          <AlertDescription>{consentTokenError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="claim-eprescription-consent-token">Consent token (inferred)</Label>
            <Input
              id="claim-eprescription-consent-token"
              value={consentToken}
              placeholder={loadingConsentToken ? 'Loading consent token from claim...' : 'No token found'}
              readOnly
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="claim-eprescription-context">Claim context</Label>
            <Input
              id="claim-eprescription-context"
              value={`Claim #${claim.claim_number || claim.id} • Patient ${claimPatientPk ?? 'N/A'}`}
              readOnly
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {loadingConsentToken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          <span>
            {loadingConsentToken
              ? 'Resolving latest consent token from this claim...'
              : consentAvailable
                ? 'Consent token resolved from claim context.'
                : 'No token resolved yet.'}
          </span>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="dispense">Dispense</TabsTrigger>
          <TabsTrigger value="list">Local Records</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4">
          <Card className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              Fetch ILM ePrescription preview for this claim&apos;s patient context.
            </p>
            <Button onClick={handlePreview} disabled={previewMutation.isPending || !consentAvailable}>
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
          <Card className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="claim-eprescription-source-prescription">
                  Create from undispensed prescription (optional)
                </Label>
                <SearchableSelect
                  id="claim-eprescription-source-prescription"
                  options={undispensedPrescriptionOptions}
                  value={selectedSourcePrescriptionId}
                  onValueChange={handleSelectSourcePrescription}
                  placeholder="Select a pending/partial pharmacy prescription to prefill"
                  searchPlaceholder="Search prescription ID or intervention"
                  emptyMessage="No pending or partially dispensed pharmacy prescriptions found for this patient"
                  isLoading={pharmacyPrescriptionsLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-eprescription-create-intervention">Intervention code</Label>
                <SearchableSelect
                  id="claim-eprescription-create-intervention"
                  options={activeInterventionOptions}
                  value={createInterventionCode}
                  onValueChange={setCreateInterventionCode}
                  placeholder="SHA-XX-XXX"
                  searchPlaceholder="Search active interventions"
                  emptyMessage="No active claim interventions"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-eprescription-create-id-number">Practitioner ID</Label>
                <Input
                  id="claim-eprescription-create-id-number"
                  value={createIdentificationNumber}
                  onChange={(event) => setCreateIdentificationNumber(event.target.value)}
                  placeholder="Registration or license number"
                />
                <p className="text-xs text-muted-foreground">{createPractitionerHint}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Prescription items</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItemRow}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add item
                </Button>
              </div>

              {createItemsRows.map((row, index) => (
                <Card key={row.id} className="space-y-3 border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Item {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveItemRow(row.id)}
                      disabled={createItemsRows.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Generic concept code</Label>
                      <SearchableSelect
                        options={genericConceptCodeOptions}
                        value={row.generic_concept_code}
                        onValueChange={(value) => handleItemRowChange(row.id, 'generic_concept_code', value)}
                        placeholder="Search generic concept code..."
                        searchPlaceholder="Search known generic concept codes"
                        emptyMessage="No generic codes indexed yet. Load an undispensed prescription first."
                      />
                      <p className="text-[11px] text-muted-foreground">
                        DHA&apos;s standardized code for the prescribed medicine. Suggestions reuse codes from
                        prior local ILM prescriptions; they are not a live DHA catalogue search.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-dose-quantity-${row.id}`}>Dose quantity</Label>
                      <Input
                        id={`item-dose-quantity-${row.id}`}
                        type="number"
                        value={row.dose_quantity}
                        onChange={(event) =>
                          handleItemRowChange(row.id, 'dose_quantity', event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-dose-unit-${row.id}`}>Dose unit</Label>
                      <Input
                        id={`item-dose-unit-${row.id}`}
                        value={row.dose_unit}
                        onChange={(event) => handleItemRowChange(row.id, 'dose_unit', event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-frequency-${row.id}`}>Frequency</Label>
                      <Input
                        id={`item-frequency-${row.id}`}
                        type="number"
                        value={row.frequency}
                        onChange={(event) => handleItemRowChange(row.id, 'frequency', event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-duration-${row.id}`}>Duration</Label>
                      <Input
                        id={`item-duration-${row.id}`}
                        type="number"
                        value={row.duration}
                        onChange={(event) => handleItemRowChange(row.id, 'duration', event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-duration-unit-${row.id}`}>Duration unit</Label>
                      <Input
                        id={`item-duration-unit-${row.id}`}
                        value={row.duration_unit}
                        onChange={(event) =>
                          handleItemRowChange(row.id, 'duration_unit', event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-period-unit-${row.id}`}>Period unit</Label>
                      <Input
                        id={`item-period-unit-${row.id}`}
                        value={row.period_unit}
                        onChange={(event) =>
                          handleItemRowChange(row.id, 'period_unit', event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-start-date-${row.id}`}>Start date</Label>
                      <Input
                        id={`item-start-date-${row.id}`}
                        type="date"
                        value={row.start_date}
                        onChange={(event) => handleItemRowChange(row.id, 'start_date', event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-end-date-${row.id}`}>End date</Label>
                      <Input
                        id={`item-end-date-${row.id}`}
                        type="date"
                        value={row.end_date}
                        onChange={(event) => handleItemRowChange(row.id, 'end_date', event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-additional-instruction-${row.id}`}>
                        Additional instruction
                      </Label>
                      <Input
                        id={`item-additional-instruction-${row.id}`}
                        value={row.additional_instruction}
                        onChange={(event) =>
                          handleItemRowChange(row.id, 'additional_instruction', event.target.value)
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`item-patient-instruction-${row.id}`}>Patient instruction</Label>
                      <Input
                        id={`item-patient-instruction-${row.id}`}
                        value={row.patient_instruction}
                        onChange={(event) =>
                          handleItemRowChange(row.id, 'patient_instruction', event.target.value)
                        }
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`item-needs-refill-${row.id}`}
                        checked={row.needs_refill}
                        onCheckedChange={(checked) =>
                          handleItemRowChange(row.id, 'needs_refill', checked === true)
                        }
                      />
                      <Label htmlFor={`item-needs-refill-${row.id}`}>Needs refill</Label>
                    </div>

                    {row.needs_refill ? (
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`item-refill-count-${row.id}`}>Refill count</Label>
                        <Input
                          id={`item-refill-count-${row.id}`}
                          type="number"
                          className="w-28"
                          value={row.refill_count}
                          onChange={(event) =>
                            handleItemRowChange(row.id, 'refill_count', event.target.value)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>

            <Button onClick={handleCreate} disabled={createMutation.isPending || !consentAvailable}>
              {createMutation.isPending ? 'Submitting...' : 'Create ILM prescription'}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="dispense" className="mt-4">
          <Card className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="claim-eprescription-dispense-intervention">Intervention code</Label>
                <SearchableSelect
                  id="claim-eprescription-dispense-intervention"
                  options={activeInterventionOptions}
                  value={dispenseInterventionCode}
                  onValueChange={setDispenseInterventionCode}
                  placeholder="SHA-XX-XXX"
                  searchPlaceholder="Search active interventions"
                  emptyMessage="No active claim interventions"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-eprescription-dispense-prescription-pk">
                  Prescription PK (optional)
                </Label>
                <Input
                  id="claim-eprescription-dispense-prescription-pk"
                  value={dispensePrescriptionPk}
                  onChange={(event) => setDispensePrescriptionPk(event.target.value)}
                  placeholder="Local prescription id"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="claim-eprescription-actual-product-code">Actual product code</Label>
                <Input
                  id="claim-eprescription-actual-product-code"
                  value={actualProductCode}
                  onChange={(event) => setActualProductCode(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-eprescription-medication-price">Medication price</Label>
                <Input
                  id="claim-eprescription-medication-price"
                  value={medicationPrice}
                  onChange={(event) => setMedicationPrice(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-eprescription-total-quantity">Quantity</Label>
                <Input
                  id="claim-eprescription-total-quantity"
                  value={totalQuantity}
                  onChange={(event) => setTotalQuantity(event.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleDispense} disabled={dispenseMutation.isPending || !consentAvailable}>
              {dispenseMutation.isPending ? 'Submitting...' : 'Submit dispense'}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <ResponsiveTable<SHADhaPrescription>
            data={rows}
            keyExtractor={(item) => item.id}
            isLoading={isLoading}
            emptyMessage="No DHA prescriptions are linked to this claim yet."
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
      </Tabs>
    </div>
  );
}
