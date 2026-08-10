/**
 * Procedure Order Form (standalone, embeddable)
 *
 * Extracted from the full-page procedure order creation page to allow
 * inline use within Sheets/Dialogs (e.g., from the encounter orders tab).
 */
'use client';

import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Syringe, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/hooks/use-toast';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { proceduresApi } from '@/lib/api/procedures';
import { getApiErrorMessage } from '@/lib/api/client';
import { formatCurrency } from '@/lib/utils/format';
import type { ProcedureCatalogEntry } from '@/lib/types/procedure';
import { RISK_LEVEL_COLORS } from '@/lib/types/procedure';

interface ProcedureOrderFormProps {
  patientId: number;
  encounterId?: number;
  clinicVisitId?: number;
  admissionId?: number;
  onSuccess?: (orderNumber: string) => void;
  onCancel?: () => void;
}

export function ProcedureOrderForm({
  patientId,
  encounterId,
  clinicVisitId,
  admissionId,
  onSuccess,
  onCancel,
}: ProcedureOrderFormProps) {
  const queryClient = useQueryClient();

  // Procedure selection
  const [procSearch, setProcSearch] = useState('');
  const [selectedProcedure, setSelectedProcedure] = useState<ProcedureCatalogEntry | null>(null);
  const debouncedProcSearch = useDebounce(procSearch, 300);

  // Order fields
  const [priority, setPriority] = useState('ROUTINE');
  const [requestMode, setRequestMode] = useState<'IN_HOUSE' | 'EXTERNAL_REQUEST'>('IN_HOUSE');
  const [indication, setIndication] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [bodySite, setBodySite] = useState('');
  const [laterality, setLaterality] = useState('NA');
  const [sendingFacility, setSendingFacility] = useState('');
  const [referringClinician, setReferringClinician] = useState('');

  // Procedure search query (same behavior as /procedures/orders/new)
  const {
    data: procSearchData,
    isLoading: procSearchLoading,
    error: procSearchError,
  } = useQuery({
    queryKey: ['procedure-catalog-search-inline', debouncedProcSearch],
    queryFn: () =>
      proceduresApi.listCatalog({
        search: debouncedProcSearch,
        is_active: 'true',
        page_size: '20',
      }),
    enabled: debouncedProcSearch.length >= 2,
    staleTime: 30000,
  });

  const catalogResults = useMemo(
    () => (procSearchData?.results || []) as ProcedureCatalogEntry[],
    [procSearchData],
  );

  const { data: catalogGuardData, isLoading: catalogGuardLoading } = useQuery({
    queryKey: ['procedure-catalog-guard', 'inline-order-form'],
    queryFn: () =>
      proceduresApi.listCatalog({
        is_active: 'true',
        page_size: '1',
      }),
    staleTime: 60000,
  });

  const isCatalogUnseeded = !catalogGuardLoading && (catalogGuardData?.count ?? 0) === 0;

  const procSearching = procSearchLoading;
  const procError = procSearchError;

  const handleSelectProcedure = useCallback((proc: ProcedureCatalogEntry) => {
    setSelectedProcedure(proc);
    setProcSearch('');
  }, []);

  const { mutateAsync: createOrder, isPending: isCreatingOrder } = useMutation({
    mutationFn: () =>
      proceduresApi.createOrder({
        patient: patientId,
        procedure: selectedProcedure!.id,
        priority,
        indication,
        clinical_notes: clinicalNotes,
        body_site: bodySite,
        laterality,
        ...(encounterId ? { encounter: encounterId } : {}),
        ...(clinicVisitId ? { clinic_visit: clinicVisitId } : {}),
        ...(admissionId ? { admission: admissionId } : {}),
      }),
    onSuccess: (data) => {
      toast({ title: 'Procedure ordered', description: `Order ${data.order_number} created.` });
      queryClient.invalidateQueries({ queryKey: ['procedure-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procedures-dashboard'] });
      onSuccess?.(data.order_number);
    },
    onError: (err) => {
      toast({
        title: 'Order failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: createExternalRequest, isPending: isCreatingExternalRequest } = useMutation({
    mutationFn: () =>
      proceduresApi.createExternalRequest({
        patient: patientId,
        encounter: encounterId,
        procedure: selectedProcedure!.id,
        priority,
        indication,
        clinical_notes: clinicalNotes,
        body_site: bodySite,
        laterality,
        sending_facility: sendingFacility,
        referring_clinician: referringClinician,
      }),
    onSuccess: (data) => {
      toast({
        title: 'External request created',
        description: `Request ${data.request_number} submitted for review.`,
      });
      queryClient.invalidateQueries({ queryKey: ['procedure-external-requests'] });
      onSuccess?.(data.request_number);
    },
    onError: (err) => {
      toast({
        title: 'Request failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const isPending = isCreatingOrder || isCreatingExternalRequest;
  const canSubmit = patientId && selectedProcedure && indication.trim();

  const handleSubmit = async () => {
    if (requestMode === 'EXTERNAL_REQUEST') {
      if (!encounterId) {
        toast({
          title: 'Encounter required',
          description: 'External procedure requests must be created from an encounter context.',
          variant: 'destructive',
        });
        return;
      }
      await createExternalRequest();
      return;
    }
    await createOrder();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">New Procedure Order</h2>
        <p className="text-sm text-muted-foreground">
          Select a procedure and provide clinical indication.
        </p>
      </div>

      {/* Procedure Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Procedure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isCatalogUnseeded && (
            <Alert>
              <AlertTitle>Procedure catalog not seeded for this tenant</AlertTitle>
              <AlertDescription>
                No active procedure catalog entries were found for your organization. Seed the procedure catalog before placing procedure orders.
              </AlertDescription>
            </Alert>
          )}
          {selectedProcedure ? (
            <div className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Syringe className="h-4 w-4 text-primary shrink-0" />
                  <p className="font-medium">{selectedProcedure.name}</p>
                  <span className="font-mono text-xs text-muted-foreground">
                    {selectedProcedure.code}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-muted-foreground">
                  <Badge variant="outline" className="text-xs">{selectedProcedure.category}</Badge>
                  <Badge className={`${RISK_LEVEL_COLORS[selectedProcedure.risk_level] || ''} text-xs`}>
                    {selectedProcedure.risk_level}
                  </Badge>
                  <span>{selectedProcedure.typical_duration_minutes} min</span>
                  {selectedProcedure.base_fee != null && (
                    <span>{formatCurrency(selectedProcedure.base_fee)}</span>
                  )}
                  {selectedProcedure.consent_required && (
                    <Badge variant="outline" className="text-xs text-amber-600">
                      Consent Required
                    </Badge>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedProcedure(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by procedure name or code..."
                  value={procSearch}
                  onChange={(e) => setProcSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {debouncedProcSearch.length >= 2 && (
                <div className="border rounded-md max-h-64 overflow-y-auto">
                  {procSearching ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Searching...
                    </div>
                  ) : procError ? (
                    <div className="p-4 text-center text-sm text-destructive">
                      {getApiErrorMessage(procError)}
                    </div>
                  ) : catalogResults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {isCatalogUnseeded
                        ? 'Procedure catalog not seeded for this tenant.'
                        : 'No procedures found'}
                    </div>
                  ) : (
                    catalogResults.map((proc) => (
                      <button
                        key={proc.id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/50 border-b last:border-0 transition-colors"
                        onClick={() => handleSelectProcedure(proc)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{proc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {proc.code} &bull; {proc.category} &bull; {proc.typical_duration_minutes} min
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge className={`${RISK_LEVEL_COLORS[proc.risk_level] || ''} text-xs`}>
                              {proc.risk_level}
                            </Badge>
                            {proc.base_fee != null && (
                              <span className="text-xs text-muted-foreground">
                                {formatCurrency(proc.base_fee)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="proc-request-mode">Request Destination</Label>
            <Select
              value={requestMode}
              onValueChange={(value) => setRequestMode(value as 'IN_HOUSE' | 'EXTERNAL_REQUEST')}
            >
              <SelectTrigger id="proc-request-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_HOUSE">In-House Procedure Order</SelectItem>
                {encounterId ? (
                  <SelectItem value="EXTERNAL_REQUEST">External Procedure Request</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="proc-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="proc-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMERGENCY">Emergency</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="ROUTINE">Routine</SelectItem>
                  <SelectItem value="ELECTIVE">Elective</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="proc-laterality">Laterality</Label>
              <Select value={laterality} onValueChange={setLaterality}>
                <SelectTrigger id="proc-laterality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NA">N/A</SelectItem>
                  <SelectItem value="LEFT">Left</SelectItem>
                  <SelectItem value="RIGHT">Right</SelectItem>
                  <SelectItem value="BILATERAL">Bilateral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="proc-indication">Clinical Indication *</Label>
            <Textarea
              id="proc-indication"
              value={indication}
              onChange={(e) => setIndication(e.target.value)}
              placeholder="Why is this procedure needed?"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="proc-bodySite">Body Site</Label>
            <Input
              id="proc-bodySite"
              value={bodySite}
              onChange={(e) => setBodySite(e.target.value)}
              placeholder="e.g., Left forearm, Right knee"
            />
          </div>

          <div>
            <Label htmlFor="proc-clinicalNotes">Clinical Notes</Label>
            <Textarea
              id="proc-clinicalNotes"
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Additional clinical notes..."
              rows={2}
            />
          </div>

          {requestMode === 'EXTERNAL_REQUEST' && (
            <>
              <div>
                <Label htmlFor="proc-sending-facility">Destination Facility</Label>
                <Input
                  id="proc-sending-facility"
                  value={sendingFacility}
                  onChange={(e) => setSendingFacility(e.target.value)}
                  placeholder="Receiving external provider/facility"
                />
              </div>

              <div>
                <Label htmlFor="proc-referring-clinician">Referring Clinician</Label>
                <Input
                  id="proc-referring-clinician"
                  value={referringClinician}
                  onChange={(e) => setReferringClinician(e.target.value)}
                  placeholder="Clinician name"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isPending
            ? requestMode === 'EXTERNAL_REQUEST'
              ? 'Submitting request...'
              : 'Ordering...'
            : requestMode === 'EXTERNAL_REQUEST'
            ? 'Create External Request'
            : 'Place Order'}
        </Button>
      </div>
    </div>
  );
}
