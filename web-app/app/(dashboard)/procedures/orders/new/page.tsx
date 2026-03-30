'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Syringe, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Patient } from '@/lib/types/patient';

export default function NewProcedureOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Pre-fill from URL params (e.g., linked from encounter or clinic visit)
  const prePatientId = searchParams.get('patient')
    ? parseInt(searchParams.get('patient')!)
    : null;
  const preEncounterId = searchParams.get('encounter')
    ? parseInt(searchParams.get('encounter')!)
    : null;

  // Patient selection
  const [patientId, setPatientId] = useState<number | null>(prePatientId);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Procedure selection
  const [procSearch, setProcSearch] = useState('');
  const [selectedProcedure, setSelectedProcedure] = useState<ProcedureCatalogEntry | null>(null);
  const debouncedProcSearch = useDebounce(procSearch, 300);

  // Order fields
  const [priority, setPriority] = useState('ROUTINE');
  const [indication, setIndication] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [bodySite, setBodySite] = useState('');
  const [laterality, setLaterality] = useState('NA');

  // Procedure search query
  const { data: procResults, isLoading: procSearching } = useQuery({
    queryKey: ['procedure-catalog-search', debouncedProcSearch],
    queryFn: () =>
      proceduresApi.listCatalog({
        search: debouncedProcSearch,
        is_active: 'true',
        page_size: '10',
      }),
    enabled: debouncedProcSearch.length >= 2,
    staleTime: 30000,
  });

  const catalogResults = useMemo(
    () => (procResults?.results || []) as ProcedureCatalogEntry[],
    [procResults],
  );

  const handlePatientChange = useCallback(
    (id: number | null, patient: Patient | null) => {
      setPatientId(id);
      setSelectedPatient(patient);
    },
    [],
  );

  const handleSelectProcedure = useCallback((proc: ProcedureCatalogEntry) => {
    setSelectedProcedure(proc);
    setProcSearch('');
  }, []);

  const { mutateAsync: createOrder, isPending } = useMutation({
    mutationFn: () =>
      proceduresApi.createOrder({
        patient: patientId,
        procedure: selectedProcedure!.id,
        priority,
        indication,
        clinical_notes: clinicalNotes,
        body_site: bodySite,
        laterality,
        ...(preEncounterId ? { encounter: preEncounterId } : {}),
      }),
    onSuccess: (data) => {
      toast({ title: 'Procedure ordered', description: `Order ${data.order_number} created.` });
      queryClient.invalidateQueries({ queryKey: ['procedure-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procedures-dashboard'] });
      router.push(`/procedures/orders/${data.id}`);
    },
    onError: (err) => {
      toast({
        title: 'Order failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const canSubmit = patientId && selectedProcedure && indication.trim();

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Procedure Order"
        helpContent="Order a procedure for a patient. Select the patient and procedure, provide clinical indication, then submit."
      />

      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        {/* Step 1: Patient */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Select Patient</CardTitle>
          </CardHeader>
          <CardContent>
            <PatientSelector
              value={patientId}
              selectedPatient={selectedPatient}
              onChange={handlePatientChange}
            />
          </CardContent>
        </Card>

        {/* Step 2: Procedure */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Select Procedure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProcedure(null)}
                >
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
                    ) : catalogResults.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No procedures found
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

        {/* Step 3: Order Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="priority">
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
                <Label htmlFor="laterality">Laterality</Label>
                <Select value={laterality} onValueChange={setLaterality}>
                  <SelectTrigger id="laterality">
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
              <Label htmlFor="indication">Clinical Indication *</Label>
              <Textarea
                id="indication"
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                placeholder="Why is this procedure needed? (e.g., wound repair needed for 3cm laceration on left forearm)"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="bodySite">Body Site</Label>
              <Input
                id="bodySite"
                value={bodySite}
                onChange={(e) => setBodySite(e.target.value)}
                placeholder="e.g., Left forearm, Right knee"
              />
            </div>

            <div>
              <Label htmlFor="clinicalNotes">Clinical Notes</Label>
              <Textarea
                id="clinicalNotes"
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="Additional clinical notes..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => createOrder()} disabled={!canSubmit || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isPending ? 'Ordering...' : 'Place Order'}
          </Button>
        </div>
      </div>
    </div>
  );
}
